"""Tool registry — maps tool_configs DB rows to pydantic-ai Tool / MCP objects."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic_ai.tools import Tool

import openpika.tools as _native

# Maps tool_config.id → Python function in tools.py
NATIVE_FN_MAP: dict[str, Callable[..., Any]] = {
    "web_search": _native.web_search,
    "read_file": _native.read_file,
    "write_file": _native.write_file,
    "terminal": _native.terminal,
    "execute_code": _native.execute_code,
    "generate_image": _native.generate_image,
    "propose_skill": _native.propose_skill,
    "browser_navigate": _native.browser_navigate,
    "browser_snapshot": _native.browser_snapshot,
    "browser_click": _native.browser_click,
    "browser_type": _native.browser_type,
    "browser_extract": _native.browser_extract,
    "browser_close": _native.browser_close,
}

try:
    from pydantic_ai.mcp import MCPServerHTTP, MCPServerStdio

    _MCP_AVAILABLE = True
except ImportError:
    _MCP_AVAILABLE = False


async def get_tools_for_session(
    session_id: str | None = None,
) -> tuple[list[Tool], list[Any]]:
    """Return (native_tools, mcp_servers) for the given session.

    Applies session-level overrides on top of the global enabled flag.
    Session overrides can re-enable a globally-disabled tool and vice versa.
    """
    from openpika.db import get_session_overrides, list_tools

    all_tools = await list_tools()
    overrides = await get_session_overrides(session_id) if session_id else {}

    native_tools: list[Tool] = []
    mcp_servers: list[Any] = []

    for tc in all_tools:
        enabled = overrides.get(tc.id, tc.enabled)
        if not enabled:
            continue

        if tc.kind == "native":
            fn = NATIVE_FN_MAP.get(tc.id)
            if fn:
                native_tools.append(Tool(fn))

        elif tc.kind == "mcp_stdio" and _MCP_AVAILABLE:
            cmd = tc.config.get("command", "")
            if not cmd:
                continue
            mcp_servers.append(
                MCPServerStdio(
                    cmd,
                    tc.config.get("args", []),
                    env=tc.config.get("env") or None,
                    cwd=tc.config.get("cwd") or None,
                )
            )

        elif tc.kind == "mcp_http" and _MCP_AVAILABLE:
            url = tc.config.get("url", "")
            if not url:
                continue
            mcp_servers.append(
                MCPServerHTTP(
                    url,
                    headers=tc.config.get("headers") or None,
                )
            )

    return native_tools, mcp_servers
