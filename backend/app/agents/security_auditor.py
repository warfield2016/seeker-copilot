"""
Blockchain Security Auditor Agent
Scores protocol safety for DeFi positions + token rug check for portfolio holdings.

V2: Added Birdeye token security check for individual token mints.
Inspired by agency-agents/specialized/blockchain-security-auditor.md
"""
import os
import json
import logging
import httpx
from app.agents.base import invoke_agent, parse_json_from_llm

logger = logging.getLogger(__name__)

BIRDEYE_API_KEY = os.getenv("BIRDEYE_API_KEY", "")

# Known protocol safety data — fast lookup before LLM call
# score: 0-100 (higher = safer)
PROTOCOL_DB: dict[str, dict] = {
    "jupiter": {"safety_score": 92, "audit": "OtterSec, Neodyme", "tvl_tier": "high",
                "incidents": "None major", "age": "2+ years"},
    "drift":   {"safety_score": 85, "audit": "OtterSec", "tvl_tier": "high",
                "incidents": "Minor oracle issue 2023, resolved", "age": "2+ years"},
    "kamino":  {"safety_score": 88, "audit": "OtterSec, Offside Labs", "tvl_tier": "high",
                "incidents": "None", "age": "1+ year"},
    "marinade":{"safety_score": 90, "audit": "Neodyme, Kudelski", "tvl_tier": "high",
                "incidents": "None", "age": "3+ years"},
    "orca":    {"safety_score": 87, "audit": "Kudelski, Neodyme", "tvl_tier": "high",
                "incidents": "None major", "age": "2+ years"},
    "raydium": {"safety_score": 78, "audit": "MadShield", "tvl_tier": "medium",
                "incidents": "Exploit Dec 2022 $4.4M, recovered", "age": "3+ years"},
    "solend":  {"safety_score": 72, "audit": "Kudelski", "tvl_tier": "medium",
                "incidents": "Governance controversy Nov 2022", "age": "2+ years"},
    "marginfi":{"safety_score": 70, "audit": "OtterSec", "tvl_tier": "medium",
                "incidents": "Team departure concerns 2024", "age": "1+ year"},
    "jito":    {"safety_score": 91, "audit": "OtterSec, Neodyme", "tvl_tier": "high",
                "incidents": "None", "age": "1+ year"},
    "meteora": {"safety_score": 84, "audit": "OtterSec", "tvl_tier": "medium",
                "incidents": "None", "age": "1+ year"},
    "tensor":  {"safety_score": 83, "audit": "Sec3", "tvl_tier": "medium",
                "incidents": "None", "age": "1+ year"},
}

SECURITY_PROMPT = """You are a blockchain security auditor specializing in Solana DeFi protocol risk.

You assess protocol safety for end users holding positions. Score the OVERALL RISK of a user
having funds in a protocol — not the smart contract in isolation.

Scoring criteria (weighted):
- Audit status (30%): Audited by whom? How recent? Top auditors: OtterSec, Neodyme, Kudelski, Sec3
- TVL & maturity (25%): Higher TVL + longer time = battle-tested
- Incident history (25%): Any exploits, hacks, fund losses?
- Team & governance (20%): Doxxed team? Decentralized governance?

Return ONLY a valid JSON array. No markdown.

Format for each protocol:
{
  "protocol": "name",
  "safety_score": 0-100,
  "risk_level": "low|medium|high|critical",
  "audit_status": "brief audit info",
  "top_concern": "biggest risk in one sentence",
  "recommendation": "what user should consider"
}

Rules:
- Unaudited protocols: score below 40
- Protocols with recent exploits: below 50
- Known major protocols with clean records: 80+
- Be specific, not generic."""


async def birdeye_token_security(mint: str) -> dict | None:
    """
    Call Birdeye /defi/token_security for a specific token mint.
    Returns structured security checks or None if unavailable/no key.
    """
    if not BIRDEYE_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"https://public-api.birdeye.so/defi/token_security?address={mint}",
                headers={"X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana"},
            )
            if not r.is_success:
                return None
            data = r.json().get("data", {})
            if not data:
                return None

            checks = data.get("securityChecks", {})
            flags = []
            for check_name, result in checks.items():
                if result.get("result") in ("Fail", "Warning"):
                    flags.append(f"{check_name}: {result.get('result')}")

            top10 = data.get("top10HolderPercent", 0) or 0
            is_fake = data.get("isFakeToken", False)
            mint_auth = data.get("mintAuthority")

            risk_score = 100
            if is_fake:                    risk_score -= 60
            if mint_auth:                  risk_score -= 20  # mint authority not renounced
            if top10 > 50:                 risk_score -= 15  # whale concentration
            if len(flags) > 2:             risk_score -= 10

            return {
                "security_flags": flags,
                "top10_holder_percent": round(top10, 1),
                "is_fake": is_fake,
                "mint_authority_present": bool(mint_auth),
                "score": max(0, min(100, risk_score)),
            }
    except Exception as e:
        logger.debug(f"Birdeye token security failed for {mint}: {e}")
        return None


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
                score = db["safety_score"]
                risk_level = "low" if score >= 80 else "medium" if score >= 60 else "high"
                results.append({
                    "protocol": pos.get("protocol"),
                    "safety_score": score,
                    "risk_level": risk_level,
                    "audit_status": db["audit"],
                    "top_concern": db["incidents"] if db["incidents"] != "None" else "No known concerns",
                    "recommendation": (
                        "Position is well-secured" if score >= 80
                        else "Monitor for updates" if score >= 60
                        else "Consider reducing exposure"
                    ),
                    "source": "database",
                })
            else:
                unknown_protocols.append(pos)

        # LLM analysis for unknown protocols
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
                    self._add_unknown_fallback(results, unknown_protocols)
            except Exception as e:
                logger.warning(f"LLM security audit failed: {e}")
                self._add_unknown_fallback(results, unknown_protocols)

        return results

    async def check_token_security(self, tokens: list[dict]) -> list[dict]:
        """
        Run Birdeye token security checks on portfolio tokens.
        Only runs if BIRDEYE_API_KEY is set.
        Returns flagged tokens with risk details.
        """
        if not BIRDEYE_API_KEY or not tokens:
            return []

        flagged = []
        # Check top 10 tokens by value
        top_tokens = sorted(tokens, key=lambda t: t.get("usd_value", 0), reverse=True)[:10]

        for token in top_tokens:
            mint = token.get("mint", "")
            symbol = token.get("symbol", "")
            if not mint or symbol in ("SOL", "USDC", "USDT", "PYUSD"):
                continue  # Skip well-known trusted tokens

            sec = await birdeye_token_security(mint)
            if sec and (sec["score"] < 70 or sec["is_fake"] or sec["security_flags"]):
                flagged.append({
                    "protocol": symbol,
                    "safety_score": sec["score"],
                    "risk_level": "critical" if sec["is_fake"] else "high" if sec["score"] < 50 else "medium",
                    "audit_status": "Token security check via Birdeye",
                    "top_concern": (
                        "FAKE TOKEN DETECTED" if sec["is_fake"]
                        else f"Flags: {', '.join(sec['security_flags'][:2])}"
                             if sec["security_flags"]
                        else f"Top 10 holders own {sec['top10_holder_percent']}% — whale concentration risk"
                    ),
                    "recommendation": (
                        "REMOVE IMMEDIATELY — possible scam token" if sec["is_fake"]
                        else "High risk — verify this token before holding"
                    ),
                    "source": "birdeye_security",
                })

        return flagged

    @staticmethod
    def _add_unknown_fallback(results: list, unknown_protocols: list) -> None:
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
