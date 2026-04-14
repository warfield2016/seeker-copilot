"""
Seeker AI Copilot — FastAPI Backend
Portfolio analysis engine for Solana Seeker phone.

Security: API key required, rate-limited, CORS-restricted, body-size-limited.
"""
import os
import sys
import time
import uuid
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# --- [C1 FIX] Require API key — refuse to boot without it ---
API_KEY = os.getenv("COPILOT_API_KEY", "")
if not API_KEY:
    # Allow keyless mode only when explicitly opted in for local development
    if os.getenv("ALLOW_NO_AUTH", "").lower() == "true":
        logger.warning("⚠️  COPILOT_API_KEY not set — running WITHOUT authentication (dev mode only)")
    else:
        logger.error("COPILOT_API_KEY is required. Set it in environment variables.")
        logger.error("For local dev, set ALLOW_NO_AUTH=true to skip this check.")
        sys.exit(1)

app = FastAPI(
    title="Seeker AI Copilot API",
    version="0.2.0",
    description="AI portfolio analysis backend for Solana Seeker",
)

# --- CORS — warn if using dev defaults in production ---
_DEFAULT_ORIGINS = "http://localhost:19006,http://localhost:8081,http://localhost:3000"
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
if not os.getenv("CORS_ORIGINS"):
    logger.warning("⚠️  CORS_ORIGINS not set — using localhost defaults. Set this in production!")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# --- [C3 FIX] Request body size limit — prevents LLM cost amplification ---
MAX_BODY_BYTES = 64 * 1024  # 64 KB — more than enough for portfolio data

# --- Per-IP rate limiter (in-memory, improved with X-Forwarded-For) ---
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "30"))  # requests per minute
MAX_RATE_STORE_SIZE = 10_000  # Prevent unbounded memory growth


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Auth + rate limiting + body size check + security headers."""
    # Skip health check
    if request.url.path == "/health":
        response = await call_next(request)
        return response

    # --- Body size limit (prevents LLM cost amplification attacks) ---
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large (max 64KB)"})

    # --- API key check (required unless ALLOW_NO_AUTH=true) ---
    if API_KEY:
        key = request.headers.get("X-API-Key", "")
        if key != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

    # --- Per-IP rate limiting (use X-Forwarded-For for real IP behind Railway LB) ---
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    now = time.time()
    window = _rate_store.get(client_ip, [])
    window = [t for t in window if now - t < 60]  # keep last 60s
    if len(window) >= RATE_LIMIT_RPM:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Try again in 60 seconds."})
    window.append(now)
    _rate_store[client_ip] = window

    # Evict stale entries to prevent unbounded memory growth
    if len(_rate_store) > MAX_RATE_STORE_SIZE:
        cutoff = now - 120
        stale_keys = [ip for ip, ts in _rate_store.items() if not ts or ts[-1] < cutoff]
        for k in stale_keys:
            del _rate_store[k]

    response = await call_next(request)

    # --- Security headers ---
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-ID"] = uuid.uuid4().hex[:8]

    return response


from app.routes import ai_routes, proxy_routes, metrics_routes
app.include_router(ai_routes.router, prefix="/api/ai", tags=["AI Analysis"])
app.include_router(proxy_routes.router, prefix="/api/proxy", tags=["RPC Proxy"])
app.include_router(metrics_routes.router, prefix="/api/metrics", tags=["Metrics & Revenue"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "seeker-ai-copilot", "version": "0.2.0"}
