"""
Seeker AI Copilot - FastAPI Backend
AI-powered portfolio analysis for Solana Seeker phone
"""
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Seeker AI Copilot API",
    version="0.1.0",
    description="AI portfolio analysis backend for Solana Seeker",
)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:19006,http://localhost:8081,http://localhost:3000,*"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

from app.routes import ai_routes
app.include_router(ai_routes.router, prefix="/api/ai", tags=["AI Analysis"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "seeker-ai-copilot"}
