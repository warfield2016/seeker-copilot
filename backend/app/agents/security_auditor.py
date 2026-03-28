"""
Blockchain Security Auditor Agent
Scores protocol safety for DeFi positions in user portfolios.
Assesses audit status, TVL, maturity, and known incidents.

Inspired by agency-agents/specialized/blockchain-security-auditor.md
"""
import json
import logging
from app.agents.base import invoke_agent, parse_json_from_llm

logger = logging.getLogger(__name__)

# Known protocol safety data — acts as a fast lookup before LLM call
# score: 0-100 (higher = safer), audit_status, known_incidents
PROTOCOL_DB: dict[str, dict] = {
    "jupiter": {"safety_score": 92, "audit": "OtterSec, Neodyme", "tvl_tier": "high",
                "incidents": "None major", "age": "2+ years"},
    "drift": {"safety_score": 85, "audit": "OtterSec", "tvl_tier": "high",
              "incidents": "Minor oracle issue 2023, resolved", "age": "2+ years"},
    "kamino": {"safety_score": 88, "audit": "OtterSec, Offside Labs", "tvl_tier": "high",
               "incidents": "None", "age": "1+ year"},
    "marinade": {"safety_score": 90, "audit": "Neodyme, Kudelski", "tvl_tier": "high",
                 "incidents": "None", "age": "3+ years"},
    "orca": {"safety_score": 87, "audit": "Kudelski, Neodyme", "tvl_tier": "high",
             "incidents": "None major", "age": "2+ years"},
    "raydium": {"safety_score": 78, "audit": "MadShield", "tvl_tier": "medium",
                "incidents": "Exploit Dec 2022, $4.4M lost, funds recovered", "age": "3+ years"},
    "solend": {"safety_score": 72, "audit": "Kudelski", "tvl_tier": "medium",
               "incidents": "Governance controversy Nov 2022, whale liquidation risk", "age": "2+ years"},
    "marginfi": {"safety_score": 70, "audit": "OtterSec", "tvl_tier": "medium",
                 "incidents": "Points controversy, team departure concerns 2024", "age": "1+ year"},
    "jito": {"safety_score": 91, "audit": "OtterSec, Neodyme", "tvl_tier": "high",
             "incidents": "None", "age": "1+ year"},
}

SECURITY_PROMPT = """You are a blockchain security auditor specializing in Solana DeFi protocol risk assessment.

You assess protocol safety for end users holding positions. You are NOT auditing smart contracts directly —
you are scoring the overall RISK of a user having funds in a protocol.

Scoring criteria (each weighted):
- Audit status (30%): Has it been audited? By whom? How recent?
- TVL & maturity (25%): Higher TVL + longer time = battle-tested
- Incident history (25%): Any exploits, hacks, or fund losses?
- Team & governance (20%): Is team doxxed? Decentralized governance?

For each protocol, return:
{
  "protocol": "name",
  "safety_score": 0-100,
  "risk_level": "low|medium|high|critical",
  "audit_status": "brief audit info",
  "top_concern": "biggest risk in one sentence",
  "recommendation": "what user should consider"
}

Rules:
- Return ONLY valid JSON array.
- Be honest about risks. Don't sugarcoat.
- Score unaudited protocols below 40.
- Score protocols with recent exploits below 50.
- Known major protocols with clean records score 80+."""


class SecurityAuditor:
    async def audit_positions(self, defi_positions: list[dict]) -> list[dict]:
        """Score safety for each DeFi protocol in the portfolio."""
        if not defi_positions:
            return []

        results = []
        unknown_protocols = []

        for pos in defi_positions:
            protocol = pos.get("protocol", "").lower()
            if protocol in PROTOCOL_DB:
                db = PROTOCOL_DB[protocol]
                risk_level = "low" if db["safety_score"] >= 80 else "medium" if db["safety_score"] >= 60 else "high"
                results.append({
                    "protocol": pos.get("protocol"),
                    "safety_score": db["safety_score"],
                    "risk_level": risk_level,
                    "audit_status": db["audit"],
                    "top_concern": db["incidents"] if db["incidents"] != "None" else "No known concerns",
                    "recommendation": "Position is well-secured" if db["safety_score"] >= 80
                    else "Monitor for updates" if db["safety_score"] >= 60
                    else "Consider reducing exposure",
                    "source": "database",
                })
            else:
                unknown_protocols.append(pos)

        # Use LLM for unknown protocols
        if unknown_protocols:
            try:
                proto_str = json.dumps(unknown_protocols, indent=2)
                response = await invoke_agent(
                    SECURITY_PROMPT,
                    f"Assess these Solana DeFi protocols:\n{proto_str}",
                )
                llm_results = parse_json_from_llm(response, fallback=[])
                if isinstance(llm_results, list):
                    for r in llm_results:
                        if isinstance(r, dict) and "protocol" in r:
                            r["source"] = "ai_analysis"
                            results.append(r)
                else:
                    # Fallback: score unknowns as risky
                    for pos in unknown_protocols:
                        results.append({
                            "protocol": pos.get("protocol"),
                            "safety_score": 35,
                            "risk_level": "high",
                            "audit_status": "Unknown — not in verified database",
                            "top_concern": "Unverified protocol — audit status unknown",
                            "recommendation": "Exercise caution. Verify audit reports before increasing exposure.",
                            "source": "fallback",
                        })
            except Exception as e:
                logger.warning(f"LLM security audit failed: {e}")
                for pos in unknown_protocols:
                    results.append({
                        "protocol": pos.get("protocol"),
                        "safety_score": 35,
                        "risk_level": "high",
                        "audit_status": "Unable to verify",
                        "top_concern": "Could not complete security assessment",
                        "recommendation": "Manually verify protocol audit status.",
                        "source": "error_fallback",
                    })

        return results
