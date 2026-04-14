"""
Portfolio Analyst Agent
LangChain-powered AI agent for Solana portfolio analysis.

[C4 FIX] Uses centralized get_llm singleton from base.py instead of creating
duplicate LLM instances per import (which leaked connections and memory).
"""
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.base import get_llm, sanitize_input

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a Solana portfolio analyst powering Seeker Copilot on the Solana Seeker phone.

Rules:
- MAX 120 words per response.
- Plain text only. No markdown, no asterisks, no bullet symbols, no emoji.
- Lead with the single most important number or insight.
- Use $ amounts and % changes. Be specific with numbers.
- Flag concentration risk if any single token exceeds 40% of portfolio.
- SOL-denominated LSTs (mSOL, JitoSOL, bSOL) are correlated with SOL — do not treat as diversification.
- Sound direct and analytical, like a Bloomberg terminal notification.
- Never say "not financial advice" — the app UI handles disclaimers.
- For portfolio questions: reference specific holdings by name and value.
- For general crypto questions: give a brief factual answer.
- For off-topic questions: reply "I specialize in Solana portfolio intelligence."
"""


def _sanitize_user_input(text: str) -> str:
    """Delegates to centralized sanitize_input with 8 injection patterns + Unicode normalization."""
    return sanitize_input(text, max_length=500)


class PortfolioAnalyst:
    def __init__(self):
        self.llm = get_llm()
        logger.info(f"PortfolioAnalyst initialized with {type(self.llm).__name__}")

    async def generate_summary(
        self,
        total_value: float,
        change_24h: float,
        tokens: list[dict],
        defi_positions: list[dict],
        skr_balance: float = 0,
        skr_staked: float = 0,
    ) -> str:
        """Generate a natural-language portfolio summary."""
        portfolio_data = json.dumps({
            "total_value_usd": total_value,
            "change_24h_percent": change_24h,
            "tokens": tokens[:10],
            "defi_positions": defi_positions,
            "skr_balance": skr_balance,
            "skr_staked": skr_staked,
        }, indent=2)

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"""Give a 2-3 sentence portfolio snapshot. Include: total value, 24h move, biggest risk, one actionable insight.

{portfolio_data}"""),
        ]

        response = await self.llm.ainvoke(messages)
        return response.content

    async def answer_question(self, question: str, portfolio: dict) -> str:
        """Answer a free-form question about the portfolio."""
        clean_question = _sanitize_user_input(question)
        portfolio_str = json.dumps(portfolio, indent=2)[:3000]  # Cap payload size

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"""The user asks about their portfolio: "{clean_question}"

Their portfolio context:
{portfolio_str}

Answer concisely for a mobile screen. If the question requires data you don't have,
say what you'd need and provide analysis with what's available."""),
        ]

        response = await self.llm.ainvoke(messages)
        return response.content

    async def get_recommendations(
        self,
        tokens: list[dict],
        defi_positions: list[dict],
    ) -> list[dict]:
        """Generate trade recommendations."""
        portfolio_str = json.dumps({
            "tokens": tokens[:10],
            "defi_positions": defi_positions,
        }, indent=2)

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"""Based on this portfolio, suggest 1-3 actionable observations.
For each, provide: action (buy/sell/hold/rebalance), token, reason, confidence (0-100).

Return ONLY valid JSON array. Example:
[{{"action": "rebalance", "token": "SOL", "reason": "Over 80% concentration", "confidence": 75}}]

Portfolio:
{portfolio_str}"""),
        ]

        response = await self.llm.ainvoke(messages)
        return self._parse_recommendations(response.content)

    @staticmethod
    def _parse_recommendations(content: str) -> list[dict]:
        """Robustly extract JSON recommendations from LLM response."""
        # Try direct parse first
        try:
            data = json.loads(content)
            if isinstance(data, list):
                return [r for r in data if _valid_recommendation(r)]
        except json.JSONDecodeError:
            pass

        # Fallback: extract JSON array from mixed text
        try:
            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                candidate = content[start:end]
                data = json.loads(candidate)
                if isinstance(data, list):
                    return [r for r in data if _valid_recommendation(r)]
        except (json.JSONDecodeError, ValueError):
            pass

        logger.warning(f"Failed to parse recommendations from LLM response: {content[:200]}")
        return [{"action": "hold", "token": "portfolio", "reason": "Unable to generate recommendations at this time", "confidence": 0}]


def _valid_recommendation(r: dict) -> bool:
    """Validate a recommendation has required fields."""
    return (
        isinstance(r, dict)
        and r.get("action") in ("buy", "sell", "hold", "rebalance")
        and isinstance(r.get("token"), str)
        and isinstance(r.get("reason"), str)
        and isinstance(r.get("confidence"), (int, float))
    )
