"""
Risk Analyst Agent
Dedicated risk scoring with smart contract risk assessment.
Computes concentration, volatility, IL, liquidation, and protocol risk.
"""
import json
import logging
from app.agents.base import invoke_agent, parse_json_from_llm

logger = logging.getLogger(__name__)

RISK_PROMPT = """You are a quantitative risk analyst for Solana DeFi portfolios.

Your job: analyze portfolio data and return a precise JSON risk assessment.

Risk dimensions (each 0-100):
1. concentration — HHI-based, how concentrated in few assets
2. volatility — % exposed to non-stablecoin assets
3. impermanent_loss — % of portfolio in LP positions
4. liquidation — health factor proximity for borrow positions
5. protocol — smart contract / protocol risk of DeFi positions

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- Be harsh on concentration above 50% in one asset.
- Flag unaudited or young protocols as high risk.
- Consider correlation between assets (SOL and JitoSOL are correlated).

Output format:
{
  "concentration": 0-100,
  "volatility": 0-100,
  "impermanent_loss": 0-100,
  "liquidation": 0-100,
  "protocol_risk": 0-100,
  "overall": 0-100,
  "top_risk": "one sentence on biggest risk",
  "mitigation": "one sentence on what to do"
}"""


class RiskAnalyst:
    async def analyze(self, tokens: list[dict], defi_positions: list[dict]) -> dict:
        """Run full risk analysis on portfolio."""
        # Compute quantitative scores first
        quant = self._quantitative_scores(tokens, defi_positions)

        # Use LLM for qualitative protocol risk + narrative
        try:
            portfolio_str = json.dumps({"tokens": tokens[:10], "defi_positions": defi_positions}, indent=2)
            response = await invoke_agent(
                RISK_PROMPT,
                f"Analyze this portfolio's risk:\n{portfolio_str}\n\nQuantitative pre-computed: {json.dumps(quant)}",
            )
            llm_risk = parse_json_from_llm(response, fallback={})
            if isinstance(llm_risk, dict) and "protocol_risk" in llm_risk:
                quant["protocol_risk"] = min(100, max(0, int(llm_risk["protocol_risk"])))
                quant["top_risk"] = llm_risk.get("top_risk", quant.get("top_risk", ""))
                quant["mitigation"] = llm_risk.get("mitigation", "Diversify across protocols and asset classes.")
                # Recalculate overall with protocol risk
                quant["overall"] = round(
                    quant["concentration"] * 0.25
                    + quant["volatility"] * 0.25
                    + quant["impermanent_loss"] * 0.15
                    + quant["liquidation"] * 0.15
                    + quant["protocol_risk"] * 0.20
                )
        except Exception as e:
            logger.warning(f"LLM risk analysis failed, using quant only: {e}")

        return quant

    @staticmethod
    def _quantitative_scores(tokens: list[dict], defi_positions: list[dict]) -> dict:
        """Pure math risk scores — no LLM needed."""
        token_total = sum(t.get("usd_value", 0) for t in tokens)
        defi_total = sum(p.get("value_usd", 0) for p in defi_positions)
        total = token_total + defi_total

        if total == 0:
            return {"concentration": 0, "volatility": 0, "impermanent_loss": 0,
                    "liquidation": 0, "protocol_risk": 0, "overall": 0,
                    "top_risk": "Empty portfolio", "mitigation": "Add funds to get started."}

        # Concentration: HHI on token weights
        hhi = sum((t.get("usd_value", 0) / token_total) ** 2 for t in tokens) if token_total > 0 else 0
        concentration = min(100, round(hhi * 100))

        # Volatility: % not in stablecoins
        stables = {"USDC", "USDT", "PYUSD", "DAI", "USDD", "TUSD", "FRAX"}
        stable_value = sum(t.get("usd_value", 0) for t in tokens if t.get("symbol", "").upper() in stables)
        volatility = round((token_total - stable_value) / token_total * 100) if token_total > 0 else 0

        # IL: LP positions as % of total
        lp_value = sum(p.get("value_usd", 0) for p in defi_positions if p.get("type") == "lp")
        il_risk = round(lp_value / total * 100) if total > 0 else 0

        # Liquidation: borrow health
        borrows = [p for p in defi_positions if p.get("type") == "borrow"]
        if borrows:
            avg_health = sum(p.get("health", 1.5) for p in borrows) / len(borrows)
            liquidation = max(0, min(100, round((2.0 - avg_health) / 2.0 * 100)))
        else:
            liquidation = 0

        # Protocol risk: placeholder until LLM enriches
        protocol_risk = 20  # baseline

        overall = round(
            concentration * 0.25 + volatility * 0.25 + il_risk * 0.15
            + liquidation * 0.15 + protocol_risk * 0.20
        )

        top_risk = "High concentration" if concentration > 60 else "Volatile exposure" if volatility > 80 else "Balanced"

        return {
            "concentration": concentration,
            "volatility": volatility,
            "impermanent_loss": il_risk,
            "liquidation": liquidation,
            "protocol_risk": protocol_risk,
            "overall": overall,
            "top_risk": top_risk,
            "mitigation": "Consider diversifying across uncorrelated assets.",
        }
