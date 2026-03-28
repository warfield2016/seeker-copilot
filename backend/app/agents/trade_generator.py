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

TRADE_PROMPT = """You are a Solana DeFi trade strategist generating actionable recommendations.

You receive enriched analysis from three specialist agents:
1. RISK ANALYSIS — concentration, volatility, IL, liquidation, protocol risk scores
2. TREND SIGNALS — market momentum, narrative alignment, opportunities, risks
3. SECURITY AUDIT — protocol safety scores for DeFi positions

Your job: synthesize ALL inputs into 2-4 actionable, prioritized recommendations.

Each recommendation must:
- Reference specific data from the analysis (don't just say "diversify")
- Include confidence score reflecting certainty (lower if agents disagree)
- Be executable — user should know exactly what to do
- Consider risk-adjusted returns, not just upside

Rules:
- Return ONLY valid JSON array. No markdown.
- Max 4 recommendations, min 1.
- Higher confidence (80+) only when multiple signals align.
- If trend says BUY but security says HIGH RISK, lower confidence and note the conflict.
- Always include at least one defensive recommendation if risk score > 50.

Output format:
[
  {
    "action": "buy|sell|hold|rebalance",
    "token": "TOKEN_SYMBOL",
    "reason": "2-3 sentences referencing specific analysis data",
    "confidence": 0-100,
    "priority": 1-4,
    "risk_note": "optional caveat if risk signals present"
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
            and r.get("action") in ("buy", "sell", "hold", "rebalance")
            and isinstance(r.get("token"), str)
            and isinstance(r.get("reason"), str)
            and isinstance(r.get("confidence"), (int, float))
        )
