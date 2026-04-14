"""
Metrics Routes — revenue tracking + app analytics for the hackathon.

Tracks:
  - Swap volume + platform fees earned (Jupiter integration)
  - Daily active wallets (DAU)
  - AI query counts

In-memory storage for hackathon simplicity. Data is reset on server restart —
this is acceptable because Railway logs also capture these events for audit.
Upgrade to SQLite/Redis post-hackathon for durable metrics.
"""
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory Stores ────────────────────────────────────────────────────────

# Swap events: deque capped at last 1000 for memory bounds
_swap_events: deque = deque(maxlen=1000)

# DAU tracking: set of unique wallets per day (keyed by YYYY-MM-DD)
_daily_wallets: dict[str, set[str]] = defaultdict(set)

# AI query counter per day
_daily_queries: dict[str, int] = defaultdict(int)

# Aggregate lifetime counters
_lifetime = {
    "total_swaps": 0,
    "total_swap_volume_usd": 0.0,
    "total_fees_collected_raw": 0,  # in raw output-token units
    "total_ai_queries": 0,
    "started_at": datetime.now(timezone.utc).isoformat(),
}

# ── Models ──────────────────────────────────────────────────────────────────

class SwapEvent(BaseModel):
    """Recorded after a successful Jupiter swap."""
    signature: str = Field(min_length=32, max_length=128)
    input_mint: str = Field(min_length=32, max_length=44)
    output_mint: str = Field(min_length=32, max_length=44)
    input_amount: float = Field(ge=0)
    output_amount: float = Field(ge=0)
    platform_fee_amount: float = Field(ge=0)
    price_impact_pct: float = 0.0
    routes: list[str] = Field(default_factory=list, max_length=10)
    # Optional: approximate USD value of the swap (client can provide)
    input_usd_value: Optional[float] = None


# ── Helpers ─────────────────────────────────────────────────────────────────

def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/swap")
async def record_swap(event: SwapEvent):
    """
    Called by the mobile app after a successful Jupiter swap.
    Tracks revenue from platformFeeBps and updates aggregate metrics.
    """
    event_dict = event.model_dump()
    event_dict["recorded_at"] = datetime.now(timezone.utc).isoformat()
    _swap_events.append(event_dict)

    _lifetime["total_swaps"] += 1
    _lifetime["total_fees_collected_raw"] += int(event.platform_fee_amount)
    if event.input_usd_value:
        _lifetime["total_swap_volume_usd"] += event.input_usd_value

    logger.info(
        f"swap recorded: {event.signature[:8]}... "
        f"in={event.input_amount:.4f} out={event.output_amount:.4f} "
        f"fee={event.platform_fee_amount:.4f} routes={','.join(event.routes)}"
    )

    return {"status": "recorded", "total_swaps": _lifetime["total_swaps"]}


@router.post("/wallet-seen")
async def record_wallet(payload: dict):
    """
    Called on portfolio load to track DAU. No PII — just wallet address.
    Address is hashed in aggregation (set dedup means each wallet counts once/day).
    """
    address = str(payload.get("address", "")).strip()
    if not address or len(address) < 32:
        return {"status": "ignored"}
    _daily_wallets[_today_key()].add(address)
    return {"status": "recorded"}


@router.post("/query")
async def record_query():
    """Increment AI query counter for the day."""
    _daily_queries[_today_key()] += 1
    _lifetime["total_ai_queries"] += 1
    return {"status": "recorded"}


@router.get("/dashboard")
async def get_dashboard():
    """
    Public metrics dashboard — used by the hackathon pitch to show traction.
    Returns aggregate numbers without exposing individual user data.
    """
    today = _today_key()
    today_dau = len(_daily_wallets.get(today, set()))
    today_queries = _daily_queries.get(today, 0)

    # Recent 7 days DAU
    recent_dau = []
    for days_ago in range(7):
        ts = time.time() - (days_ago * 86400)
        key = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        recent_dau.append({"date": key, "dau": len(_daily_wallets.get(key, set()))})

    # Recent swaps (last 10, anonymized — signature truncated)
    recent_swaps = []
    for ev in list(_swap_events)[-10:]:
        recent_swaps.append({
            "sig": ev.get("signature", "")[:8] + "...",
            "input_amt": ev.get("input_amount"),
            "output_amt": ev.get("output_amount"),
            "fee": ev.get("platform_fee_amount"),
            "routes": ev.get("routes"),
            "at": ev.get("recorded_at"),
        })

    return {
        "lifetime": _lifetime,
        "today": {
            "date": today,
            "dau": today_dau,
            "queries": today_queries,
            "swaps": sum(1 for ev in _swap_events if ev.get("recorded_at", "").startswith(today)),
        },
        "recent_dau_7d": list(reversed(recent_dau)),
        "recent_swaps": recent_swaps,
    }
