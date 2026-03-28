"""
Portfolio Analyst Agent
LangChain-powered AI agent for Solana portfolio analysis.
"""
import os
import json
import logging
import re
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)


def get_llm():
    """Initialize the LLM based on environment configuration."""
    provider = os.getenv("LLM_PROVIDER", "groq")
    model = os.getenv("LLM_MODEL", "")

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable is required")
        from langchain_groq import ChatGroq
        return ChatGroq(model=model or "llama-3.3-70b-versatile", temperature=0.3, max_tokens=1024)
    elif provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model or "claude-sonnet-4-20250514", temperature=0.3, max_tokens=1024)
    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model or "gpt-4o", temperature=0.3, max_tokens=1024)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}. Use: groq, anthropic, or openai")


SYSTEM_PROMPT = """You are a sharp, concise Solana portfolio analyst in the Seeker AI Copilot app.

Rules:
- MAX 80 words per response. No exceptions.
- Plain text only. No markdown, no asterisks, no bullet symbols.
- One short paragraph per topic. Separate with a blank line.
- Lead with the single most important number or insight.
- Use $ amounts. Skip percentages when the dollar amount is clearer.
- Only flag risks that actually matter right now.
- Sound confident and direct, like a Bloomberg terminal notification.
- Never say "not financial advice" — the app UI handles disclaimers.
- Only discuss the user's portfolio and Solana DeFi. Redirect off-topic questions.
"""


def _sanitize_user_input(text: str) -> str:
    """Basic input sanitization to reduce prompt injection risk."""
    # Remove common injection patterns
    text = re.sub(r"(?i)(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)", "[filtered]", text)
    # Truncate to reasonable length
    return text[:500]


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
