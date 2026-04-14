"""
RPC Proxy Routes — forwards client requests to Helius with server-side API key.
The client NEVER sees the Helius key. All RPC traffic goes through this proxy.

Includes:
  - JSON-RPC proxy (getAssetsByOwner, getProgramAccounts, etc.)
  - Enhanced Transactions proxy (paginated, typed transaction history)
"""
import os
import re
import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Optional

logger = logging.getLogger(__name__)
router = APIRouter()

# Server-side only — NOT prefixed with EXPO_PUBLIC_, never shipped to client
HELIUS_RPC_URL = os.getenv("HELIUS_RPC_URL", "")

# Extract API key from RPC URL for Enhanced Transactions REST API
HELIUS_API_KEY = os.getenv("HELIUS_API_KEY", "")
if not HELIUS_API_KEY and HELIUS_RPC_URL:
    _match = re.search(r"api-key=([^&]+)", HELIUS_RPC_URL)
    if _match:
        HELIUS_API_KEY = _match.group(1)

HELIUS_REST_BASE = "https://api-mainnet.helius-rpc.com/v0"

# Allowed RPC methods — prevent abuse (only methods our app needs)
ALLOWED_METHODS = {
    "getAssetsByOwner",
    "getAsset",
    "getTokenAccounts",
    "getAccountInfo",
    "getProgramAccounts",
    "getTokenAccountBalance",
    "getBalance",
    "getSignaturesForAddress",
    "getTransaction",
}


class RpcRequest(BaseModel):
    """JSON-RPC 2.0 request forwarded to Helius."""
    method: str = Field(min_length=1, max_length=100)
    params: Any = None
    id: Optional[str] = "seeker-proxy"


@router.post("/rpc")
async def proxy_rpc(request: RpcRequest):
    """
    Forward a JSON-RPC request to Helius.
    The Helius API key stays server-side — the client only talks to this endpoint.
    """
    if not HELIUS_RPC_URL:
        raise HTTPException(status_code=503, detail="RPC endpoint not configured")

    if request.method not in ALLOWED_METHODS:
        raise HTTPException(status_code=403, detail=f"Method '{request.method}' not allowed")

    payload = {
        "jsonrpc": "2.0",
        "id": request.id or "seeker-proxy",
        "method": request.method,
        "params": request.params,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                HELIUS_RPC_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="RPC request timed out")
    except httpx.HTTPStatusError as e:
        logger.error(f"Helius RPC error: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="RPC upstream error")
    except Exception as e:
        logger.error(f"RPC proxy error: {e}")
        raise HTTPException(status_code=500, detail="Internal proxy error")


# ──────────────────────────────────────────────────────────────────────────────
# Enhanced Transactions API — rich typed transaction history
# Replaces the old N+1 getSignatures+getTransaction pattern with a single REST call.
# ──────────────────────────────────────────────────────────────────────────────

SOLANA_ADDR_RE = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$')


class TransactionHistoryRequest(BaseModel):
    """Request for paginated enhanced transaction history."""
    address: str = Field(min_length=32, max_length=44, pattern=r'^[1-9A-HJ-NP-Za-km-z]{32,44}$')
    limit: int = Field(default=20, ge=1, le=100)
    before_signature: Optional[str] = Field(default=None, max_length=128)
    type: Optional[str] = Field(default=None, max_length=40)  # e.g. "SWAP", "TRANSFER"
    source: Optional[str] = Field(default=None, max_length=40)  # e.g. "JUPITER"


@router.post("/transactions/history")
async def proxy_transaction_history(request: TransactionHistoryRequest):
    """
    Proxy to Helius Enhanced Transactions API — /addresses/{addr}/transactions.
    Returns pre-parsed transactions with type, source, description, tokenTransfers, events.
    API key stays server-side.
    """
    if not HELIUS_API_KEY:
        raise HTTPException(status_code=503, detail="Helius API key not configured")

    url = f"{HELIUS_REST_BASE}/addresses/{request.address}/transactions"
    query: dict[str, str] = {
        "api-key": HELIUS_API_KEY,
        "limit": str(request.limit),
    }
    if request.before_signature:
        query["before"] = request.before_signature
    if request.type:
        query["type"] = request.type
    if request.source:
        query["source"] = request.source

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.get(url, params=query)
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Transaction history request timed out")
    except httpx.HTTPStatusError as e:
        logger.error(f"Helius Enhanced API error: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Helius Enhanced API error")
    except Exception as e:
        logger.error(f"Transaction history proxy error: {e}")
        raise HTTPException(status_code=500, detail="Internal proxy error")
