"""pydantic-ai agent definition.

The agent is constructed once at module import time (cold start) and reused
across calls — model, system prompt, and tool list are immutable per process.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel

from .tools import TOOL_LIST

SYSTEM_PROMPT = """\
You are OpenPika, a capable AI assistant built on the enterprise-grade OpenPika framework.
You have access to tools for web search, file operations, and terminal commands.
Always reason carefully, use tools when needed, and be concise.
"""


@lru_cache(maxsize=8)
def get_agent(model_id: str) -> Agent:
    """Return a cached Agent for the given model ID."""
    # API key comes from OS keychain (injected by Rust) or environment variable.
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Attempt to read from keyring via env variable set by the Rust layer
        api_key = os.environ.get("OPENPIKA_ANTHROPIC_KEY", "")

    model = AnthropicModel(model_id, api_key=api_key or None)

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=TOOL_LIST,
        retries=2,
    )
