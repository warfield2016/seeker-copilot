"""
Shared utilities for all AI agents.
Centralizes LLM initialization, input sanitization, and JSON parsing.
"""
import os
import re
import json
import logging
import unicodedata
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

_llm_instance = None


def get_llm():
    """Initialize the LLM based on environment configuration. Cached singleton."""
    global _llm_instance
    if _llm_instance is not None:
        return _llm_instance

    provider = os.getenv("LLM_PROVIDER", "groq")
    model = os.getenv("LLM_MODEL", "")

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable is required")
        from langchain_groq import ChatGroq
        _llm_instance = ChatGroq(model=model or "llama-3.3-70b-versatile", temperature=0.3, max_tokens=2048)
    elif provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        from langchain_anthropic import ChatAnthropic
        _llm_instance = ChatAnthropic(model=model or "claude-opus-4-6", temperature=0.3, max_tokens=4096)
    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        from langchain_openai import ChatOpenAI
        _llm_instance = ChatOpenAI(model=model or "gpt-4o", temperature=0.3, max_tokens=1024)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}. Use: groq, anthropic, or openai")

    logger.info(f"LLM initialized: {type(_llm_instance).__name__}")
    return _llm_instance


# Prompt injection patterns — broader coverage than single regex
_INJECTION_PATTERNS = [
    r"(ignore|forget|disregard|override|bypass)\s+(all\s+)?(previous|above|prior|earlier|system)\s+(instructions?|prompts?|rules?|context)",
    r"new\s+(task|instructions?|role|system\s+prompt)\s*:",
    r"\[?(SYSTEM|ADMIN|ROOT|DEVELOPER)\]?\s*:",
    r"you\s+are\s+now\s+a?\s*",
    r"act\s+as\s+(if\s+)?(you\s+are\s+)?a?\s*(different|new)",
    r"pretend\s+(you|that|to\s+be)",
    r"output\s+(the\s+)?(system|original|full)\s+prompt",
    r"reveal\s+(your|the)\s+(instructions?|prompt|rules?)",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)


def sanitize_input(text: str, max_length: int = 500) -> str:
    """Sanitize user input to reduce prompt injection risk."""
    # Truncate first to bound attacker's payload
    text = text[:max_length]
    # Normalize Unicode to collapse lookalike characters (e.g., Cyrillic ѕ → s)
    text = unicodedata.normalize("NFKC", text)
    # Filter known injection patterns
    text = _INJECTION_RE.sub("[filtered]", text)
    # Escape double quotes to prevent prompt delimiter breakout
    text = text.replace('"', "'")
    return text


def sanitize_field(value: str, max_length: int = 50) -> str:
    """Sanitize a data field (protocol name, token symbol, etc.) for LLM context.
    Strips anything that could be interpreted as an instruction."""
    # Allow only alphanumeric, spaces, hyphens, dots, slashes
    cleaned = re.sub(r"[^a-zA-Z0-9\s\-./]", "", value)
    return cleaned[:max_length]


def parse_json_from_llm(content: str, fallback=None):
    """Robustly extract JSON from LLM response text."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    for open_char, close_char in [("[", "]"), ("{", "}")]:
        try:
            start = content.find(open_char)
            end = content.rfind(close_char) + 1
            if start >= 0 and end > start:
                return json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            continue

    logger.warning(f"Failed to parse JSON from LLM: {content[:200]}")
    return fallback


# --- Canary detection: check if LLM leaked system prompt fragments ---
_CANARY_PHRASES = [
    "powering seeker copilot",
    "bloomberg terminal",
    "quantitative risk analyst for solana",
    "trade strategist generating actionable",
    "blockchain security auditor specializing",
    "trend researcher with deep market",
]


def _check_prompt_leak(response: str) -> bool:
    """Return True if response contains system prompt fragments (potential injection success)."""
    response_lower = response.lower()
    return any(phrase in response_lower for phrase in _CANARY_PHRASES)


def sanitize_llm_output(text: str) -> str:
    """Sanitize LLM output before sending to client.
    Strips URLs (AI should not link users) and wallet-address-like strings
    (prevents address substitution attacks via poisoned token names)."""
    # Strip URLs — AI responses should not contain clickable links
    text = re.sub(r'https?://[^\s<>"]+', '[link removed]', text)
    # Strip potential wallet addresses (43-44 char base58 strings)
    # but preserve short strings that happen to be base58 (token symbols, etc.)
    text = re.sub(r'(?<!\w)[1-9A-HJ-NP-Za-km-z]{43,44}(?!\w)', '[address removed]', text)
    return text


async def invoke_agent(system_prompt: str, user_prompt: str, timeout: float = 30.0, retries: int = 2) -> str:
    """Invoke LLM with system + user message. Retries on transient errors.
    Applies output sanitization and canary leak detection."""
    import asyncio
    llm = get_llm()
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    last_error = None
    for attempt in range(retries):
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=timeout)
            content = response.content

            # Check for prompt leak (injection attack may have succeeded)
            if _check_prompt_leak(content):
                logger.warning("Canary detected: LLM may have leaked system prompt")
                return "I can help you analyze your Solana portfolio. What would you like to know about your holdings?"

            # Sanitize output (strip URLs, wallet addresses)
            return sanitize_llm_output(content)
        except asyncio.TimeoutError:
            last_error = TimeoutError(f"LLM timed out after {timeout}s (attempt {attempt + 1})")
            logger.warning(f"LLM timeout attempt {attempt + 1}/{retries}")
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "rate" in err_str:
                wait = 2 ** attempt
                logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt + 1})")
                await asyncio.sleep(wait)
                last_error = e
            else:
                raise
    raise last_error or RuntimeError("LLM invocation failed")
