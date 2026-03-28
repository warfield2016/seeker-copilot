"""
Trend Researcher Agent
Market intelligence engine that identifies trending tokens, narratives,
and opportunities in the Solana ecosystem.

V2: Enriched with live DeFiLlama TVL + CoinGecko price data as context.
Inspired by agency-agents/product/product-trend-researcher.md and
research into sendaifun/solana-agent-kit market intelligence patterns.
"""
import json
import logging
from app.agents.base import invoke_agent, parse_json_from_llm
from app.agents.market_data import build_market_context

logger = logging.getLogger(__name__)

TREND_SYSTEM_PROMPT = """You are an elite Solana DeFi trend researcher with deep market intelligence.

Your edge: you detect trending narratives, tokens, and protocols BEFORE they go mainstream.
You analyze portfolio composition against LIVE market data to find alpha.

You have access to real-time on-chain and market data (provided below).
Use the exact TVL numbers and price changes provided — do not make up market data.

Solana ecosystem context:
- Top DEX: Jupiter (#1 on Seeker phone by users), dominant swap aggregator
- Liquid staking: JitoSOL (Jito, MEV rewards), mSOL (Marinade)
- Lending: Kamino ($2.8B TVL, #1 lending), MarginFi, Solend
- Perps: Drift (#4 on Seeker), Zeta Markets
- Memecoins: BONK, WIF, POPCAT — narrative-driven, high volatility
- AI narrative: Solana AI agents (SendAI, Solana Agent Kit) gaining traction
- RWA narrative: tokenized real-world assets emerging on Solana
- DePIN: Grass, Helium, IO.NET
- SKR token: Seeker phone ecosystem token, community allocations
- Seeker Season: weekly dApp drops, on-chain activity drives rewards

Analysis framework:
1. PORTFOLIO MOMENTUM — holdings trending up/down vs market (use provided 24h data)
2. NARRATIVE ALIGNMENT — is portfolio positioned for current narratives
3. MISSING EXPOSURE — trending sectors the portfolio has zero allocation to
4. YIELD OPPORTUNITIES — better risk-adjusted yield than current positions
5. RISK SIGNALS — holdings in declining narratives or troubled protocols

Rules:
- Return ONLY valid JSON array. No markdown. No explanation outside the JSON.
- Each signal must have: category, title, description, relevance (0-100), action
- Max 5 signals, ranked by relevance.
- Use SPECIFIC numbers from the live market data provided.
- Ground every signal in the actual data — no vague generalizations.
- When referencing TVL or APY, use the exact figures provided.

Output format:
[
  {
    "category": "momentum|narrative|opportunity|risk",
    "title": "Short headline (max 8 words)",
    "description": "2-3 sentence analysis citing specific data points from live feed",
    "relevance": 0-100,
    "action": "Specific actionable recommendation",
    "tokens": ["TOKEN1", "TOKEN2"]
  }
]"""


class TrendResearcher:
    async def analyze(self, tokens: list[dict], defi_positions: list[dict]) -> list[dict]:
        """Identify trends using live DeFiLlama + CoinGecko data + portfolio composition."""
        try:
            # Pull live market context (DeFiLlama TVL + CoinGecko 24h changes)
            portfolio_symbols = [t.get("symbol", "") for t in tokens if t.get("symbol")]
            market_context = await build_market_context(portfolio_symbols)

            portfolio_str = json.dumps({
                "tokens": [
                    {
                        "symbol": t.get("symbol"),
                        "usd_value": t.get("usd_value"),
                        "balance": t.get("balance"),
                        "change_24h": t.get("change_24h"),
                    }
                    for t in tokens
                ],
                "defi_positions": [
                    {
                        "protocol": p.get("protocol"),
                        "type": p.get("type"),
                        "value_usd": p.get("value_usd"),
                        "apy": p.get("apy"),
                    }
                    for p in defi_positions
                ],
            }, indent=2)

            user_prompt = (
                f"{market_context}\n\n"
                f"Analyze trends for this portfolio:\n{portfolio_str}"
            )

            response = await invoke_agent(TREND_SYSTEM_PROMPT, user_prompt)
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
