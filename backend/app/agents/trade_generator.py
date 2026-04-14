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

TRADE_PROMPT = """You are a Solana DeFi trade strategist generating actionable recommendations for Seeker Copilot.

You receive enriched analysis from three specialist agents:
1. RISK ANALYSIS — concentration, volatility, impermanent loss, liquidation, protocol risk scores (each 0-100)
2. TREND SIGNALS — market momentum, narrative alignment, yield opportunities, risk warnings
3. SECURITY AUDIT — protocol safety scores for DeFi positions and token security flags

Your job: synthesize ALL inputs into 2-4 actionable, prioritized recommendations.

Portfolio-size awareness:
- Under $100: suggest at most 1-2 simple actions. Do not recommend complex multi-position strategies.
- $100 to $1,000: standard recommendations. Keep position count reasonable (3-5 total).
- Over $1,000: full range of strategies including DeFi positions, yield optimization, and rebalancing.

Each recommendation must:
- Reference specific data from the agent analyses. Do not give generic advice.
- Include a confidence score that reflects certainty. Lower confidence when agents disagree.
- Be executable on Solana — the user should know the exact action (swap X for Y on Jupiter, deposit Z into Kamino, etc.).
- Consider transaction costs: Solana fees are low but slippage on low-liquidity tokens can be significant.
- Consider risk-adjusted returns. Upside alone is not enough.

Rules:
- Return ONLY a valid JSON array. No markdown, no text outside the JSON.
- Max 4 recommendations, min 1.
- Confidence 80+ only when multiple agent signals agree and security is green.
- If risk score overall > 60, at least one recommendation must be defensive (reduce exposure, take profit, or rebalance).
- If security flags any token as "critical" or "high" risk, include a recommendation to address it.
- Never recommend buying unaudited tokens or protocols flagged as high risk by the security auditor.

Output format:
[
  {
    "action": "buy|sell|hold|rebalance|stake|unstake",
    "token": "TOKEN_SYMBOL",
    "reason": "2-3 sentences referencing specific data from the agent analyses",
    "confidence": 0-100,
    "priority": 1-4,
    "risk_note": "caveat if risk or security signals are present, otherwise null",
    "venue": "suggested execution venue (Jupiter, Kamino, Drift, Marinade, etc.)"
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
