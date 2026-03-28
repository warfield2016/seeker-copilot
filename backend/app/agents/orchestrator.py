"""
Agent Orchestrator
Coordinates the multi-agent pipeline for deep portfolio analysis.

Pipeline architecture:
  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
  │ Risk Analyst │    │ Trend Researcher │    │ Security Auditor │
  └──────┬───────┘    └────────┬─────────┘    └────────┬─────────┘
         │                     │                       │
         └─────────────────────┼───────────────────────┘
                               ▼
                     ┌──────────────────┐
                     │ Trade Generator  │ (synthesizes all inputs)
                     └────────┬─────────┘
                              ▼
                      Final Response

Key design: Risk + Trend + Security run in PARALLEL (asyncio.gather).
Trade Generator runs AFTER, consuming their outputs.

Inspired by agency-agents/specialized/agents-orchestrator.md
"""
import asyncio
import time
import logging
from app.agents.base import invoke_agent
from app.agents.risk_analyst import RiskAnalyst
from app.agents.trend_researcher import TrendResearcher
from app.agents.security_auditor import SecurityAuditor
from app.agents.trade_generator import TradeGenerator

logger = logging.getLogger(__name__)

# Singleton agent instances
_risk = RiskAnalyst()
_trend = TrendResearcher()
_security = SecurityAuditor()
_trade = TradeGenerator()


class Orchestrator:
    """Multi-agent pipeline coordinator with parallel execution and quality gates."""

    async def deep_analysis(self, tokens: list[dict], defi_positions: list[dict]) -> dict:
        """
        Run the full multi-agent pipeline.
        Returns combined analysis from all agents.
        """
        start = time.time()
        errors = []

        # Phase 1: Run Risk + Trend + Security in PARALLEL
        risk_task = asyncio.create_task(self._safe_run("risk", _risk.analyze(tokens, defi_positions)))
        trend_task = asyncio.create_task(self._safe_run("trend", _trend.analyze(tokens, defi_positions)))
        security_task = asyncio.create_task(self._safe_run("security", _security.audit_positions(defi_positions)))

        risk_result, trend_result, security_result = await asyncio.gather(
            risk_task, trend_task, security_task
        )

        # Collect errors
        if risk_result is None:
            errors.append("risk_analyst")
            risk_result = {"overall": 0, "concentration": 0, "volatility": 0,
                          "impermanent_loss": 0, "liquidation": 0, "protocol_risk": 0,
                          "top_risk": "Analysis unavailable", "mitigation": "Try again later."}
        if trend_result is None:
            errors.append("trend_researcher")
            trend_result = []
        if security_result is None:
            errors.append("security_auditor")
            security_result = []

        # Phase 2: Feed everything into Trade Generator
        recommendations = await self._safe_run(
            "trade_generator",
            _trade.generate(tokens, defi_positions, risk_result, trend_result, security_result),
        )
        if recommendations is None:
            errors.append("trade_generator")
            recommendations = []

        elapsed = round(time.time() - start, 2)
        logger.info(f"Orchestrator pipeline completed in {elapsed}s (errors: {errors or 'none'})")

        return {
            "risk": risk_result,
            "trends": trend_result,
            "security": security_result,
            "recommendations": recommendations,
            "meta": {
                "agents_run": 4,
                "agents_failed": len(errors),
                "failed_agents": errors,
                "latency_seconds": elapsed,
                "pipeline": "risk+trend+security → trade_generator",
            },
        }

    async def quick_summary(self, tokens: list[dict], defi_positions: list[dict],
                            skr_balance: float = 0, skr_staked: float = 0,
                            total_value: float = 0, change_24h: float = 0) -> str:
        """Fast single-agent summary for the portfolio overview card."""
        from app.agents.base import invoke_agent
        import json

        system = """You are a sharp, concise Solana portfolio analyst in the Seeker AI Copilot app.

Rules:
- MAX 80 words per response. No exceptions.
- Plain text only. No markdown, no asterisks, no bullet symbols.
- One short paragraph per topic. Separate with a blank line.
- Lead with the single most important number or insight.
- Use $ amounts. Skip percentages when the dollar amount is clearer.
- Only flag risks that actually matter right now.
- Sound confident and direct, like a Bloomberg terminal notification.
- Never say "not financial advice" — the app UI handles disclaimers.
- Only discuss the user's portfolio and Solana DeFi. Redirect off-topic questions."""

        portfolio_data = json.dumps({
            "total_value_usd": total_value,
            "change_24h_percent": change_24h,
            "tokens": tokens[:10],
            "defi_positions": defi_positions,
            "skr_balance": skr_balance,
            "skr_staked": skr_staked,
        }, indent=2)

        return await invoke_agent(
            system,
            f"Give a 2-3 sentence portfolio snapshot. Include: total value, 24h move, biggest risk, one actionable insight.\n\n{portfolio_data}",
        )

    async def answer_question(self, question: str, portfolio: dict) -> str:
        """Answer a free-form question with full context."""
        from app.agents.base import sanitize_input
        import json

        system = """You are a sharp, concise Solana portfolio analyst in the Seeker AI Copilot app.

Rules:
- MAX 80 words per response. No exceptions.
- Plain text only. No markdown, no asterisks, no bullet symbols.
- Lead with the answer, not preamble.
- Sound confident and direct, like a Bloomberg terminal notification.
- Only discuss the user's portfolio and Solana DeFi. Redirect off-topic questions."""

        clean_q = sanitize_input(question)
        portfolio_str = json.dumps(portfolio, indent=2)[:3000]

        return await invoke_agent(
            system,
            f'The user asks: "{clean_q}"\n\nPortfolio context:\n{portfolio_str}\n\nAnswer concisely for a mobile screen.',
        )

    @staticmethod
    async def _safe_run(name: str, coro):
        """Run an agent with error handling. Returns None on failure."""
        try:
            return await coro
        except Exception as e:
            logger.error(f"Agent '{name}' failed: {e}", exc_info=True)
            return None
