"""
Trend Researcher Agent
Market intelligence engine that identifies trending tokens, narratives,
and opportunities in the Solana ecosystem.

Inspired by agency-agents/product/product-trend-researcher.md
"""
import json
import logging
from app.agents.base import invoke_agent, parse_json_from_llm

logger = logging.getLogger(__name__)

TREND_PROMPT = """You are an elite Solana DeFi trend researcher with deep market intelligence.

Your edge: you detect trending narratives, tokens, and protocols BEFORE they go mainstream.
You analyze portfolio composition against current market dynamics to find alpha.

Current Solana ecosystem knowledge (use this as ground truth):
- Top DEX: Jupiter (JUP) — dominant aggregator, perps launching
- Liquid staking: JitoSOL (Jito), mSOL (Marinade), bSOL (BlazeStake)
- Lending: Kamino, MarginFi, Solend
- Perps: Drift, Zeta Markets, Flash Trade
- Memecoins cycle: BONK, WIF, POPCAT — high volatility, narrative-driven
- AI narrative: tokens linked to AI agents gaining traction
- RWA narrative: tokenized real-world assets emerging on Solana
- Stablecoin growth: USDC dominance on Solana, PYUSD gaining share
- SKR token: Solana Mobile ecosystem token, Seeker phone community

Analysis framework:
1. PORTFOLIO MOMENTUM — which holdings are trending up/down vs market
2. NARRATIVE ALIGNMENT — is the portfolio positioned for current narratives
3. MISSING EXPOSURE — trending sectors the portfolio has zero allocation to
4. RISK SIGNALS — any holdings in declining narratives or troubled protocols

Rules:
- Return ONLY valid JSON array. No markdown.
- Each signal must have: category, title, description, relevance (0-100), action
- Max 5 signals, ranked by relevance.
- Be specific about Solana tokens and protocols. No generic crypto advice.
- Ground every signal in observable market data or narrative logic.

Output format:
[
  {
    "category": "momentum|narrative|opportunity|risk",
    "title": "Short headline",
    "description": "2-3 sentence analysis with specific data points",
    "relevance": 0-100,
    "action": "What to do about it",
    "tokens": ["TOKEN1", "TOKEN2"]
  }
]"""


class TrendResearcher:
    async def analyze(self, tokens: list[dict], defi_positions: list[dict]) -> list[dict]:
        """Identify trends and opportunities based on portfolio composition."""
        try:
            portfolio_str = json.dumps({
                "tokens": [{"symbol": t.get("symbol"), "usd_value": t.get("usd_value"),
                            "change_24h": t.get("change_24h")} for t in tokens],
                "defi_positions": [{"protocol": p.get("protocol"), "type": p.get("type"),
                                    "value_usd": p.get("value_usd"), "apy": p.get("apy")}
                                   for p in defi_positions],
            }, indent=2)

            response = await invoke_agent(TREND_PROMPT, f"Analyze trends for this portfolio:\n{portfolio_str}")
            signals = parse_json_from_llm(response, fallback=[])

            if isinstance(signals, list):
                return [s for s in signals if self._valid_signal(s)][:5]
            return []
        except Exception as e:
            logger.error(f"Trend analysis failed: {e}")
            return []

    @staticmethod
    def _valid_signal(s: dict) -> bool:
        return (
            isinstance(s, dict)
            and s.get("category") in ("momentum", "narrative", "opportunity", "risk")
            and isinstance(s.get("title"), str)
            and isinstance(s.get("description"), str)
            and isinstance(s.get("relevance"), (int, float))
        )
