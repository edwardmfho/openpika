"""pydantic-ai agent definition."""

from __future__ import annotations

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
    """Return a cached Agent for the given model ID.

    ANTHROPIC_API_KEY is read automatically by the Anthropic SDK from the
    environment — set it in the shell or via `openpika credentials set`.
    """
    model = AnthropicModel(model_id)

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=TOOL_LIST,
        retries=2,
    )
