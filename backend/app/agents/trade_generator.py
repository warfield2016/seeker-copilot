"""
Trade Generator Agent
Generates actionable trade recommendations by synthesizing outputs from
Risk Analyst, Trend Researcher, and Security Auditor.

This agent sits at the end of the orchestration pipeline — it receives
enriched context from all other agents to produce higher-quality recommendations.
"""
import json
import logging
from app.agents.base import invoke_agent, parse_json_from_llm

logger = logging.getLogger(__name__)

TRADE_PROMPT = """You are a Solana DeFi trade strategist generating EXECUTABLE recommendations for Seeker Copilot.

Your output powers an in-app "Swap Now" button. When your recommendation includes a swap, the user will tap once and it executes via Jupiter. So accuracy and actionability matter — a vague "consider diversifying" is useless, but "swap 0.05 SOL for USDC to reduce concentration" is a one-tap trade.

You receive enriched analysis from three specialist agents:
1. RISK ANALYSIS — concentration, volatility, IL, liquidation, protocol risk scores (0-100)
2. TREND SIGNALS — market momentum, yield opportunities, risk warnings
3. SECURITY AUDIT — protocol safety + token security flags

Portfolio-size awareness:
- Under $100: 1-2 simple actions max. Don't suggest complex multi-position strategies.
- $100-$1,000: standard recommendations (3-5 positions max).
- Over $1,000: full range including DeFi and rebalancing.

Each recommendation must:
- Reference specific data from the agent analyses. No generic advice.
- Include confidence reflecting agent agreement. Lower if agents disagree.
- Be executable — the user should know the exact trade to make.

For SWAP actions, include EXECUTABLE swap_params:
- input_symbol: what to sell (e.g. "SOL")
- output_symbol: what to buy (e.g. "USDC")
- input_amount_pct: % of the user's input holding to swap (10, 25, 50, 100). Prefer conservative: 10-25% unless rebalancing extreme concentration.
- Example: if portfolio is 78% SOL and 22% USDC, swap_params would be: {"input_symbol":"SOL","output_symbol":"USDC","input_amount_pct":25}

Known Solana token symbols (use these exact strings): SOL, USDC, USDT, SKR, JUP, JTO, BONK, WIF, POPCAT, mSOL, JitoSOL, bSOL, JLP, PYTH, RAY, ORCA, RENDER.

Rules:
- Return ONLY a valid JSON array. No markdown, no text outside the JSON.
- Max 4 recommendations, min 1.
- Confidence 80+ only when multiple agents agree and security is green.
- If overall risk > 60, at least one recommendation must be defensive.
- If security flags critical/high, include a mitigation recommendation.
- Never recommend buying flagged tokens.
- Only include swap_params for action=buy, sell, or rebalance. For hold/stake/unstake, set swap_params=null.

Output format:
[
  {
    "action": "buy|sell|hold|rebalance|stake|unstake",
    "token": "TOKEN_SYMBOL",
    "reason": "2-3 sentences citing specific agent data",
    "confidence": 0-100,
    "priority": 1-4,
    "risk_note": "caveat if present, otherwise null",
    "venue": "Jupiter | Kamino | Drift | Marinade | Jito",
    "swap_params": {
      "input_symbol": "SOL",
      "output_symbol": "USDC",
      "input_amount_pct": 25
    }
  }
]"""


class TradeGenerator:
    async def generate(
        self,
        tokens: list[dict],
        defi_positions: list[dict],
        risk_analysis: dict,
        trend_signals: list[dict],
        security_audit: list[dict],
    ) -> list[dict]:
        """Generate recommendations from synthesized multi-agent analysis."""
        try:
            context = json.dumps({
                "portfolio": {
                    "tokens": [{"symbol": t.get("symbol"), "usd_value": t.get("usd_value"),
                                "change_24h": t.get("change_24h")} for t in tokens],
                    "defi_positions": [{"protocol": p.get("protocol"), "type": p.get("type"),
                                        "value_usd": p.get("value_usd")} for p in defi_positions],
                },
                "risk_analysis": risk_analysis,
                "trend_signals": trend_signals[:3],
                "security_audit": security_audit,
            }, indent=2)

            response = await invoke_agent(
                TRADE_PROMPT,
                f"Generate trade recommendations from this multi-agent analysis:\n{context}",
            )
            recs = parse_json_from_llm(response, fallback=[])

            if isinstance(recs, list):
                valid = [r for r in recs if self._valid_rec(r)]
                return sorted(valid, key=lambda r: r.get("priority", 99))[:4]
            return []
        except Exception as e:
            logger.error(f"Trade generation failed: {e}")
            return [{"action": "hold", "token": "portfolio", "reason": "Analysis pipeline encountered an error. Hold current positions.",
                     "confidence": 0, "priority": 1}]

    @staticmethod
    def _valid_rec(r: dict) -> bool:
        return (
            isinstance(r, dict)
            and r.get("action") in ("buy", "sell", "hold", "rebalance", "stake", "unstake")
            and isinstance(r.get("token"), str)
            and isinstance(r.get("reason"), str)
            and isinstance(r.get("confidence"), (int, float))
        )
