"""OpenPika Chainlit UI — chat interface with live tool management."""
from __future__ import annotations

import json
from typing import Any

try:
    import chainlit as cl
    from chainlit.input_widget import Switch
except ImportError as exc:
    raise ImportError(
        "chainlit is required for the UI. Run: pip install 'openpika[ui]'"
    ) from exc

from pydantic_ai import Agent
from pydantic_ai.models import infer_model
from pydantic_ai.tools import Tool

from openpika.agent import SYSTEM_PROMPT
from openpika.config import config
from openpika.registry import NATIVE_FN_MAP

try:
    from pydantic_ai.mcp import MCPServerHTTP, MCPServerStdio
    _MCP_AVAILABLE = True
except ImportError:
    _MCP_AVAILABLE = False


def _wrap_with_step(tool_id: str, fn: Any) -> Any:
    """Wrap a tool function to render a collapsible Chainlit Step when invoked."""
    import functools
    label = tool_id.replace("_", " ").title()

    @functools.wraps(fn)
    async def wrapper(ctx: Any, *args: Any, **kwargs: Any) -> str:
        async with cl.Step(name=label, type="tool") as step:
            step.input = json.dumps(kwargs, default=str)[:500]
            result = await fn(ctx, *args, **kwargs)
            step.output = str(result)[:800]
            return result

    return wrapper


async def _build_tool_lists(
    enabled: dict[str, bool],
    tool_configs: list[Any],
) -> tuple[list[Tool], list[Any]]:
    """Assemble native Tool list and MCP server list from DB configs + session state."""
    native_tools: list[Tool] = []
    mcp_servers: list[Any] = []

    for tc in tool_configs:
        if not enabled.get(tc.id, tc.enabled):
            continue

        if tc.kind == "native":
            fn = NATIVE_FN_MAP.get(tc.id)
            if fn:
                native_tools.append(Tool(_wrap_with_step(tc.id, fn)))

        elif tc.kind == "mcp_stdio" and _MCP_AVAILABLE:
            cmd = tc.config.get("command", "")
            if cmd:
                mcp_servers.append(
                    MCPServerStdio(cmd, tc.config.get("args", []),
                                   env=tc.config.get("env") or None,
                                   cwd=tc.config.get("cwd") or None)
                )

        elif tc.kind == "mcp_http" and _MCP_AVAILABLE:
            url = tc.config.get("url", "")
            if url:
                mcp_servers.append(MCPServerHTTP(url, headers=tc.config.get("headers") or None))

    return native_tools, mcp_servers


# ---------------------------------------------------------------------------
# Chainlit handlers
# ---------------------------------------------------------------------------

@cl.on_chat_start
async def on_chat_start() -> None:
    from openpika.db import init_db, list_tools
    await init_db()
    tool_configs = await list_tools()

    switches = [
        Switch(id=tc.id, label=tc.name, initial=tc.enabled)
        for tc in tool_configs
    ]
    await cl.ChatSettings(switches).send()

    enabled = {tc.id: tc.enabled for tc in tool_configs}
    cl.user_session.set("tool_configs", tool_configs)
    cl.user_session.set("enabled", enabled)
    cl.user_session.set("history", [])

    active = ", ".join(f"`{tc.name}`" for tc in tool_configs if tc.enabled)
    await cl.Message(
        content=(
            f"**OpenPika** ready — model `{config.model}`\n\n"
            f"Active tools: {active or '_none_'}\n\n"
            "Use the ⚙️ settings panel to enable or disable tools."
        ),
        author="OpenPika",
    ).send()


@cl.on_settings_update
async def on_settings_update(settings: dict[str, Any]) -> None:
    tool_configs = cl.user_session.get("tool_configs", [])
    enabled = {tc.id: bool(settings.get(tc.id, tc.enabled)) for tc in tool_configs}
    cl.user_session.set("enabled", enabled)

    active = [tc.name for tc in tool_configs if enabled.get(tc.id, True)]
    status = ", ".join(f"`{n}`" for n in active) if active else "_none_"
    await cl.Message(content=f"Tools updated — active: {status}", author="OpenPika").send()


@cl.on_message
async def on_message(message: cl.Message) -> None:
    enabled: dict[str, bool] = cl.user_session.get("enabled", {})
    tool_configs: list[Any] = cl.user_session.get("tool_configs", [])
    history: list[Any] = cl.user_session.get("history", [])

    native_tools, mcp_servers = await _build_tool_lists(enabled, tool_configs)

    agent = Agent(
        model=infer_model(config.model),
        system_prompt=SYSTEM_PROMPT,
        tools=native_tools,
        toolsets=mcp_servers,
        retries=2,
    )

    reply = cl.Message(content="", author="OpenPika")
    await reply.send()

    # async with agent: starts MCP subprocesses (no-op when mcp_servers is empty)
    async with agent:
        async with agent.run_stream(message.content, message_history=history) as stream:
            async for chunk in stream.stream_text(delta=True):
                await reply.stream_token(chunk)
            new_msgs = stream.new_messages()

    await reply.update()
    history.extend(new_msgs)
    cl.user_session.set("history", history)
