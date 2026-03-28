"""
Seeker AI Copilot - FastAPI Backend
AI-powered portfolio analysis for Solana Seeker phone
"""
import os
import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Seeker AI Copilot API",
    version="0.1.0",
    description="AI portfolio analysis backend for Solana Seeker",
)

# CORS — no wildcard in production. Set CORS_ORIGINS env var on Railway.
ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:19006,http://localhost:8081,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# --- Simple API Key Auth ---
# Set COPILOT_API_KEY env var. If not set, auth is disabled (dev mode).
API_KEY = os.getenv("COPILOT_API_KEY", "")

# --- Basic per-IP rate limiter (in-memory, resets on restart) ---
_rate_store: dict[str, list[float]] = {}
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "30"))  # requests per minute


@app.middleware("http")
async def auth_and_rate_limit(request: Request, call_next):
    """Lightweight auth + rate limiting middleware."""
    # Skip health check
    if request.url.path == "/health":
        return await call_next(request)

    # API key check (if configured)
    if API_KEY:
        key = request.headers.get("X-API-Key", "")
        if key != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

    # Per-IP rate limiting
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _rate_store.get(client_ip, [])
    window = [t for t in window if now - t < 60]  # keep last 60s
    if len(window) >= RATE_LIMIT_RPM:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Try again in 60 seconds."})
    window.append(now)
    _rate_store[client_ip] = window

    return await call_next(request)


from app.routes import ai_routes
app.include_router(ai_routes.router, prefix="/api/ai", tags=["AI Analysis"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "seeker-ai-copilot"}
