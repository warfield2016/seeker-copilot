"""
AI Analysis API Routes
Multi-agent orchestrated portfolio intelligence.

Security: Pydantic models enforce max array sizes, wallet address format,
and input length limits to prevent LLM cost amplification.
"""
import uuid
import logging
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)
router = APIRouter()
orchestrator = Orchestrator()

LLM_TIMEOUT_SECONDS = 45
DEEP_ANALYSIS_TIMEOUT = 90  # longer for multi-agent pipeline

# Solana base58 address pattern (32-44 chars, base58 alphabet)
SOLANA_ADDR_PATTERN = r'^[1-9A-HJ-NP-Za-km-z]{32,44}$'


# --- Request Models (with security limits) ---

class TokenInfo(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    balance: float = Field(ge=0)
    usd_value: float = Field(ge=0)
    price_usd: float = 0
    change_24h: float = 0


class DeFiPositionInfo(BaseModel):
    protocol: str = Field(min_length=1, max_length=50)
    type: str = Field(min_length=1, max_length=20)
    value_usd: float = Field(ge=0)
    apy: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    health: Optional[float] = None


class ConversationMessage(BaseModel):
    """A single message in conversation history for context continuity."""
    role: str = Field(pattern=r'^(user|assistant)$')
    content: str = Field(min_length=1, max_length=500)


class PortfolioSummaryRequest(BaseModel):
    wallet_address: str = Field(min_length=32, max_length=44, pattern=SOLANA_ADDR_PATTERN)
    total_value_usd: float = Field(ge=0)
    change_24h_percent: float
    tokens: list[TokenInfo] = Field(min_length=1, max_length=50)  # [C3] Cap at 50 tokens
    defi_positions: list[DeFiPositionInfo] = Field(default=[], max_length=20)  # [C3] Cap at 20
    skr_balance: float = 0
    skr_staked: float = 0


class AskQuestionRequest(BaseModel):
    wallet_address: str = Field(min_length=1, max_length=44)  # "general" for guest mode
    question: str = Field(min_length=1, max_length=500)
    portfolio_summary: Optional[dict] = None
    conversation_history: Optional[list[ConversationMessage]] = Field(default=None, max_length=6)
    recent_transactions: Optional[list[dict]] = Field(default=None, max_length=20)
    nft_summary: Optional[list[dict]] = Field(default=None, max_length=10)


class RecommendationRequest(BaseModel):
    wallet_address: str = Field(min_length=32, max_length=44, pattern=SOLANA_ADDR_PATTERN)
    tokens: list[TokenInfo] = Field(min_length=1, max_length=50)
    defi_positions: list[DeFiPositionInfo] = Field(default=[], max_length=20)


class DeepAnalysisRequest(BaseModel):
    wallet_address: str = Field(min_length=32, max_length=44, pattern=SOLANA_ADDR_PATTERN)
    tokens: list[TokenInfo] = Field(min_length=1, max_length=50)
    defi_positions: list[DeFiPositionInfo] = Field(default=[], max_length=20)


# --- Routes ---

@router.post("/summary")
async def get_portfolio_summary(request: PortfolioSummaryRequest):
    """Generate portfolio summary (fast, single-agent)."""
    try:
        summary = await asyncio.wait_for(
            orchestrator.quick_summary(
                tokens=[t.model_dump() for t in request.tokens],
                defi_positions=[p.model_dump() for p in request.defi_positions],
                skr_balance=request.skr_balance,
                skr_staked=request.skr_staked,
                total_value=request.total_value_usd,
                change_24h=request.change_24h_percent,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        return {"summary": summary}
    except asyncio.TimeoutError:
        logger.error("LLM timeout on /summary")
        raise HTTPException(status_code=504, detail="AI analysis timed out")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/ask")
async def ask_question(request: AskQuestionRequest):
    """Answer a free-form question — supports conversation history + tx/NFT context."""
    try:
        response = await asyncio.wait_for(
            orchestrator.answer_question(
                question=request.question,
                portfolio=request.portfolio_summary,
                conversation_history=[m.model_dump() for m in request.conversation_history] if request.conversation_history else None,
                recent_transactions=request.recent_transactions,
                nft_summary=request.nft_summary,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        return {
            "id": f"q_{uuid.uuid4().hex[:12]}",
            "response": response,
            "type": "portfolio" if request.portfolio_summary else "general",
        }
    except asyncio.TimeoutError:
        logger.error("LLM timeout on /ask")
        raise HTTPException(status_code=504, detail="AI analysis timed out")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /ask: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/recommendations")
async def get_recommendations(request: RecommendationRequest):
    """Generate trade recommendations (legacy single-agent, fast)."""
    try:
        # Use orchestrator's deep analysis for richer recommendations
        result = await asyncio.wait_for(
            orchestrator.deep_analysis(
                tokens=[t.model_dump() for t in request.tokens],
                defi_positions=[p.model_dump() for p in request.defi_positions],
            ),
            timeout=DEEP_ANALYSIS_TIMEOUT,
        )
        return {"recommendations": result.get("recommendations", [])}
    except asyncio.TimeoutError:
        logger.error("Pipeline timeout on /recommendations")
        raise HTTPException(status_code=504, detail="AI analysis timed out")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /recommendations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/deep-analysis")
async def deep_analysis(request: DeepAnalysisRequest):
    """
    Full multi-agent pipeline analysis.
    Runs Risk Analyst + Trend Researcher + Security Auditor in parallel,
    then feeds results into Trade Generator.

    Returns combined intelligence from all 4 agents.
    """
    try:
        result = await asyncio.wait_for(
            orchestrator.deep_analysis(
                tokens=[t.model_dump() for t in request.tokens],
                defi_positions=[p.model_dump() for p in request.defi_positions],
            ),
            timeout=DEEP_ANALYSIS_TIMEOUT,
        )
        return result
    except asyncio.TimeoutError:
        logger.error("Pipeline timeout on /deep-analysis")
        raise HTTPException(status_code=504, detail="Multi-agent pipeline timed out")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in /deep-analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/agents")
async def list_agents():
    """List available agents and pipeline architecture."""
    return {
        "agents": [
            {"name": "Risk Analyst", "role": "Quantitative risk scoring + protocol risk", "phase": 1},
            {"name": "Trend Researcher", "role": "Market intelligence + narrative alignment", "phase": 1},
            {"name": "Security Auditor", "role": "Protocol safety scoring + audit verification", "phase": 1},
            {"name": "Trade Generator", "role": "Synthesized recommendations from all agents", "phase": 2},
        ],
        "pipeline": "Phase 1 (parallel): Risk + Trend + Security → Phase 2: Trade Generator",
        "version": "1.0.0",
    }
