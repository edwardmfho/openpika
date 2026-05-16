"""pydantic-ai agent definition."""
from __future__ import annotations

from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models import infer_model
from pydantic_ai.tools import Tool

from .tools import TOOL_LIST

SYSTEM_PROMPT = """\
You are OpenPika, a capable AI assistant built on the enterprise-grade OpenPika framework.

## Tools
You have access to:
- web_search — DuckDuckGo search
- read_file / write_file — file system access
- terminal — shell command execution
- execute_code — run Python, JavaScript, Bash, Ruby, or Go code
- generate_image — generate images (requires OPENPIKA_IMAGE_API_KEY)
- browser_navigate / browser_snapshot / browser_click / browser_type / browser_extract / browser_close — browser automation (requires playwright)
- propose_skill — propose a reusable skill for user approval

## Skill learning
After completing a complex or multi-step task where you discovered a reusable pattern,
call `propose_skill` with a clear name, description, and prompt template (use {{param}} placeholders).
Only propose when the pattern is genuinely reusable — not for every conversation.
The user reviews proposals with `openpika skills pending` and approves or rejects them.

Always reason carefully, use tools when needed, and be concise.
"""

# Sentinel so get_agent() callers that pass nothing keep TOOL_LIST behaviour.
_UNSET: list[Tool] = []
_UNSET_SENTINEL = object()


def get_agent(
    model_id: str,
    tools: list[Tool] | object = _UNSET_SENTINEL,
    mcp_servers: list[Any] | None = None,
) -> Agent:
    """Create an Agent. Cached callers (CLI, entrypoint) get TOOL_LIST by default.

    Pass explicit tools/mcp_servers when loading from the registry.
    mcp_servers are passed as pydantic-ai toolsets (Agent.__aenter__ starts them).
    """
    if ":" not in model_id:
        model_id = f"anthropic:{model_id}"
    resolved_tools: list[Tool] = TOOL_LIST if tools is _UNSET_SENTINEL else tools  # type: ignore[assignment]
    return Agent(
        model=infer_model(model_id),
        system_prompt=SYSTEM_PROMPT,
        tools=resolved_tools,
        toolsets=mcp_servers or [],
        retries=2,
    )


async def make_agent(
    model_id: str,
    session_id: str | None = None,
) -> tuple[Agent, list[Any]]:
    """Async factory — loads tools from the DB registry for the given session.

    Returns (agent, mcp_servers). The caller must use `async with agent:` to
    start any MCP server subprocesses before calling agent.run() or run_stream().
    """
    from .registry import get_tools_for_session

    native_tools, mcp_servers = await get_tools_for_session(session_id)
    return get_agent(model_id, tools=native_tools, mcp_servers=mcp_servers), mcp_servers


async def run_agent(
    agent: Agent,
    prompt: str,
    history: list[Any],
) -> tuple[str, list[Any]]:
    """Run agent.run() inside the agent context manager (handles MCP lifecycle).

    Returns (reply_text, new_messages).
    """
    async with agent:
        result = await agent.run(prompt, message_history=history)
    return result.output, list(result.new_messages())
