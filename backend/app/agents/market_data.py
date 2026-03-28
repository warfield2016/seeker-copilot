"""
Market Data Fetcher
Pulls free, real-time Solana market data from DeFiLlama and CoinGecko.
No API keys required. Used as context injection for all AI agents.
"""
import asyncio
import logging
import httpx
from functools import lru_cache
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

DEFILLAMA_BASE = "https://api.llama.fi"
YIELDS_BASE    = "https://yields.llama.fi"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Cache TTL — 5 minutes (avoid hammering free APIs)
_cache: dict = {}
_CACHE_TTL_SECONDS = 300


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and (datetime.utcnow() - entry["ts"]).total_seconds() < _CACHE_TTL_SECONDS:
        return entry["data"]
    return None


def _cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": datetime.utcnow()}


async def _get(url: str, timeout: float = 8.0) -> Optional[dict | list]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning(f"Market data fetch failed {url}: {e}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# DeFiLlama — Free, No Auth Required
# ──────────────────────────────────────────────────────────────────────────────

SOLANA_PROTOCOL_SLUGS = [
    "kamino", "drift", "jupiter", "marinade", "jito",
    "raydium", "orca", "marginfi", "solend",
]


async def get_solana_tvl_snapshot() -> dict:
    """Return top Solana protocol TVLs. Cached 5 min."""
    cached = _cache_get("solana_tvl")
    if cached:
        return cached

    protocols_raw = await _get(f"{DEFILLAMA_BASE}/protocols")
    if not isinstance(protocols_raw, list):
        return {}

    solana_protocols = {}
    for p in protocols_raw:
        chains = p.get("chains", [])
        slug = p.get("slug", "").lower()
        if "Solana" in chains or slug in SOLANA_PROTOCOL_SLUGS:
            tvl = p.get("tvl", 0)
            if tvl and tvl > 1_000_000:  # Only show >$1M TVL
                solana_protocols[p.get("name", slug)] = {
                    "tvl_usd": round(tvl),
                    "change_1d": round(p.get("change_1d") or 0, 2),
                    "change_7d": round(p.get("change_7d") or 0, 2),
                    "category": p.get("category", ""),
                }

    # Sort by TVL, take top 12
    sorted_protocols = dict(
        sorted(solana_protocols.items(), key=lambda x: x[1]["tvl_usd"], reverse=True)[:12]
    )
    _cache_set("solana_tvl", sorted_protocols)
    return sorted_protocols


async def get_top_solana_yields(min_apy: float = 3.0, limit: int = 8) -> list:
    """Return top yield opportunities on Solana. Cached 5 min."""
    cached = _cache_get("solana_yields")
    if cached:
        return cached

    data = await _get(f"{YIELDS_BASE}/pools")
    if not isinstance(data, dict):
        return []

    pools = data.get("data", [])
    solana_pools = [
        p for p in pools
        if p.get("chain") == "Solana"
        and isinstance(p.get("apy"), (int, float))
        and p["apy"] >= min_apy
        and not p.get("ilRisk") == "yes"  # Skip high-IL pools for conservative recommendations
    ]

    # Sort by APY, take top N
    top_pools = sorted(solana_pools, key=lambda x: x.get("apy", 0), reverse=True)[:limit]
    result = [
        {
            "protocol": p.get("project", ""),
            "pool": p.get("symbol", ""),
            "apy": round(p.get("apy", 0), 2),
            "tvl_usd": round(p.get("tvlUsd", 0)),
            "stable": p.get("stablecoin", False),
        }
        for p in top_pools
    ]
    _cache_set("solana_yields", result)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# CoinGecko — Free Tier, No Key Required for Basic Endpoints
# ──────────────────────────────────────────────────────────────────────────────

COINGECKO_IDS = {
    "SOL":    "solana",
    "JUP":    "jupiter-exchange-solana",
    "JTO":    "jito-governance-token",
    "BONK":   "bonk",
    "WIF":    "dogwifcoin",
    "POPCAT": "popcat",
    "PYTH":   "pyth-network",
    "RAY":    "raydium",
    "MSOL":   "msol",
    "JITOSOL": "jito-staked-sol",
}


async def get_coingecko_prices(symbols: list[str]) -> dict:
    """Fetch 24h price change from CoinGecko for known tokens. Cached 5 min."""
    cached = _cache_get("cg_prices")
    if cached:
        return cached

    # Map symbols to CoinGecko IDs
    ids_to_fetch = {
        sym: COINGECKO_IDS[sym]
        for sym in symbols
        if sym.upper() in COINGECKO_IDS
    }
    if not ids_to_fetch:
        return {}

    ids_str = ",".join(set(ids_to_fetch.values()))
    url = (
        f"{COINGECKO_BASE}/simple/price"
        f"?ids={ids_str}"
        f"&vs_currencies=usd"
        f"&include_24hr_change=true"
        f"&include_24hr_vol=true"
    )

    data = await _get(url)
    if not isinstance(data, dict):
        return {}

    # Map back to symbols
    result = {}
    for sym, cg_id in ids_to_fetch.items():
        token_data = data.get(cg_id, {})
        if token_data:
            result[sym.upper()] = {
                "price_usd": token_data.get("usd", 0),
                "change_24h": round(token_data.get("usd_24h_change") or 0, 2),
                "volume_24h": token_data.get("usd_24h_vol", 0),
            }

    _cache_set("cg_prices", result)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Composite Context Builder — Single call for all agents
# ──────────────────────────────────────────────────────────────────────────────

async def build_market_context(portfolio_symbols: list[str] = None) -> str:
    """
    Build a rich market context string for AI agent prompts.
    Runs DeFiLlama TVL + CoinGecko prices in parallel.
    """
    symbols = portfolio_symbols or list(COINGECKO_IDS.keys())

    tvl_data, yield_data, price_data = await asyncio.gather(
        get_solana_tvl_snapshot(),
        get_top_solana_yields(),
        get_coingecko_prices(symbols),
        return_exceptions=True,
    )

    # Handle partial failures gracefully
    tvl_data   = tvl_data   if isinstance(tvl_data, dict)  else {}
    yield_data = yield_data if isinstance(yield_data, list) else []
    price_data = price_data if isinstance(price_data, dict) else {}

    lines = ["=== LIVE SOLANA MARKET DATA (DeFiLlama + CoinGecko) ==="]

    # TVL section
    if tvl_data:
        lines.append("\n[Protocol TVL]")
        for name, d in list(tvl_data.items())[:8]:
            change_str = f"  {d['change_1d']:+.1f}%/1d" if d.get("change_1d") else ""
            lines.append(
                f"  {name}: ${d['tvl_usd'] / 1e6:.1f}M TVL{change_str}"
            )

    # Price changes section
    if price_data:
        lines.append("\n[Token Price Changes 24h]")
        for sym, d in price_data.items():
            chg = d.get("change_24h", 0)
            sign = "+" if chg >= 0 else ""
            lines.append(f"  {sym}: ${d['price_usd']:.4f} ({sign}{chg:.1f}%)")

    # Yield section
    if yield_data:
        lines.append("\n[Top Solana Yield Opportunities]")
        for pool in yield_data[:5]:
            stable_tag = " [stable]" if pool.get("stable") else ""
            lines.append(
                f"  {pool['protocol']} {pool['pool']}{stable_tag}: "
                f"{pool['apy']:.1f}% APY  (TVL: ${pool['tvl_usd'] / 1e6:.1f}M)"
            )

    lines.append("\n=== END MARKET DATA ===")
    return "\n".join(lines)
