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

TREND_SYSTEM_PROMPT = """You are a Solana DeFi trend researcher with deep market intelligence for Seeker Copilot.

Your edge: you detect trending narratives, protocols, and yield opportunities BEFORE they go mainstream.
You analyze portfolio composition against LIVE market data to find alpha.

You have access to real-time on-chain and market data (provided below).
Use the exact TVL numbers and price changes provided. Do not fabricate market data.

Solana ecosystem awareness:
- DEX: Jupiter (dominant aggregator, #1 on Seeker), Raydium, Orca, Meteora
- Liquid staking: JitoSOL (MEV rewards), mSOL (Marinade), bSOL (BlazeStake)
- Lending: Kamino (#1 lending by TVL), MarginFi, Solend
- Perps: Drift, Zeta Markets, Flash Trade
- Memecoin sector: high volatility narrative plays, pump.fun launches
- AI agents: Solana AI ecosystem (SendAI, Solana Agent Kit, ai16z/ELIZA)
- DePIN: Grass, Helium, IO.NET, Hivemapper
- RWA: tokenized real-world assets emerging on Solana
- Seeker ecosystem: SKR token, Seeker Season 2 (weekly dApp drops with on-chain activity rewards), dApp Store engagement campaigns, community token allocations
- Governance: major protocol votes and token unlocks affect price action

Analysis framework:
1. PORTFOLIO MOMENTUM — which holdings are trending up or down vs the broader market
2. NARRATIVE ALIGNMENT — is the portfolio positioned for current dominant narratives
3. MISSING EXPOSURE — trending sectors where the portfolio has zero allocation
4. YIELD COMPARISON — better risk-adjusted yields than the user's current positions (cite specific APYs)
5. RISK SIGNALS — holdings in declining narratives, protocols losing TVL, or tokens with concentrated whale ownership

Rules:
- Return ONLY a valid JSON array. No markdown. No text outside the JSON.
- Each signal must have: category, title, description, relevance (0-100), action, tokens.
- Max 5 signals, ranked by relevance score descending.
- Use SPECIFIC numbers from the live market data provided. No vague statements.
- Every signal must reference at least one concrete data point (TVL, APY, % change, volume).
- When suggesting yield opportunities, include the protocol name and approximate APY.

Output format:
[
  {
    "category": "momentum|narrative|opportunity|yield|risk",
    "title": "Short headline (max 8 words)",
    "description": "2-3 sentences citing specific data from the live market feed",
    "relevance": 0-100,
    "action": "Specific actionable step the user can take",
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
