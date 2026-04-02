"""
RPC Proxy Routes — forwards client requests to Helius with server-side API key.
The client NEVER sees the Helius key. All RPC traffic goes through this proxy.
"""
import os
import logging
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Optional

logger = logging.getLogger(__name__)
router = APIRouter()

# Server-side only — NOT prefixed with EXPO_PUBLIC_, never shipped to client
HELIUS_RPC_URL = os.getenv("HELIUS_RPC_URL", "")

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
