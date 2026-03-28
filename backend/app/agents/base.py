"""
Shared utilities for all AI agents.
Centralizes LLM initialization, input sanitization, and JSON parsing.
"""
import os
import re
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

# Cache the LLM instance across agents (same config, no need to create multiple)
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
        _llm_instance = ChatGroq(model=model or "llama-3.3-70b-versatile", temperature=0.3, max_tokens=1024)
    elif provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        from langchain_anthropic import ChatAnthropic
        _llm_instance = ChatAnthropic(model=model or "claude-sonnet-4-20250514", temperature=0.3, max_tokens=1024)
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


def sanitize_input(text: str, max_length: int = 500) -> str:
    """Sanitize user input to reduce prompt injection risk."""
    text = re.sub(
        r"(?i)(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)",
        "[filtered]", text
    )
    return text[:max_length]


def parse_json_from_llm(content: str, fallback=None):
    """Robustly extract JSON from LLM response text."""
    # Direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Extract JSON array or object from mixed text
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


async def invoke_agent(system_prompt: str, user_prompt: str, timeout: float = 25.0) -> str:
    """Invoke LLM with system + user message. Returns raw content string."""
    import asyncio
    llm = get_llm()
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    response = await asyncio.wait_for(llm.ainvoke(messages), timeout=timeout)
    return response.content
