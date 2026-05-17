"""PyO3-callable entry points.

These functions are called synchronously from the Rust Python bridge.
All async work is handled via asyncio.run() so they are safe to call
from a blocking thread spawned by tokio.
"""

from __future__ import annotations

import asyncio
import json
import logging

from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart

from .agent import get_agent

logger = logging.getLogger(__name__)


def invoke_agent(
    session_id: str,
    messages_json: str,
    model: str,
    db_url: str,
    config_json: str,
) -> str:
    """Synchronous wrapper called by the Rust PyO3 bridge.

    Args:
        session_id:   Unique session identifier (UUID string).
        messages_json: JSON array of message objects {"role": ..., "content": ...}.
        model:        Model ID (e.g. "claude-sonnet-4-6").
        db_url:       SQLite/Postgres URL — passed through for any direct DB ops.
        config_json:  JSON-serialized AppConfig from Rust.

    Returns:
        The assistant's reply as a plain string.
    """
    return asyncio.run(_invoke_async(session_id, messages_json, model, db_url, config_json))


async def _invoke_async(
    session_id: str,
    messages_json: str,
    model: str,
    db_url: str,
    config_json: str,
) -> str:
    messages: list[dict] = json.loads(messages_json)

    # Extract the last user message as the prompt
    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        return "Error: no user message found in messages array."

    prompt = _extract_text(user_messages[-1]["content"])

    # Build message history for multi-turn context (exclude last user message)
    history = _build_history(messages[:-1] if messages else [])

    agent = get_agent(model)

    try:
        result = await agent.run(
            prompt,
            message_history=history,
        )
        return result.output
    except Exception as exc:
        logger.exception("Agent run failed for session %s", session_id)
        return f"Error: {exc}"


def _extract_text(content) -> str:
    """Extract plain text from a content field (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif "text" in block:
                    parts.append(block["text"])
        return "\n".join(parts)
    return str(content)


def _build_history(messages: list[dict]) -> list[ModelMessage]:
    """Convert raw message dicts to pydantic-ai ModelMessage history."""
    history: list[ModelMessage] = []
    for msg in messages:
        role = msg.get("role", "user")
        text = _extract_text(msg.get("content", ""))
        if role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=text)]))
        elif role in ("assistant", "summary"):
            history.append(ModelResponse(parts=[TextPart(content=text)]))
        # Skip system messages — they are set on the Agent directly

    return history


# ---------------------------------------------------------------------------
# AG-UI entry point (called by Rust PyO3 bridge for /v1/awp/run)
# ---------------------------------------------------------------------------


def agui_run_events(body_json: str, config_json: str) -> str:
    """Synchronous wrapper called by the Rust PyO3 bridge for AG-UI runs.

    Runs the agent against the AG-UI RunAgentInput, collects every SSE event
    the adapter emits, and returns them as a single concatenated string.
    The Rust handler splits on double-newlines and re-streams them to the client.

    Args:
        body_json:   JSON-serialised RunAgentInput from the HTTP request body.
        config_json: JSON-serialised AppConfig from Rust.

    Returns:
        All SSE event chunks concatenated ("data: {...}\\n\\ndata: {...}\\n\\n…").
    """
    return asyncio.run(_agui_run_events_async(body_json, config_json))


async def _agui_run_events_async(body_json: str, config_json: str) -> str:
    from ag_ui.core.types import RunAgentInput
    from pydantic_ai.ui.ag_ui import AGUIAdapter

    body = json.loads(body_json)
    cfg = json.loads(config_json)

    run_input = RunAgentInput.model_validate(body)

    model_id: str = cfg.get("default_model", "anthropic:claude-sonnet-4-6")
    if ":" not in model_id:
        model_id = f"anthropic:{model_id}"

    agent = get_agent(model_id)
    async with agent:
        adapter = AGUIAdapter(agent=agent, run_input=run_input, accept="text/event-stream")
        chunks: list[str] = []
        async for chunk in adapter.encode_stream(adapter.run_stream()):
            chunks.append(chunk)
    return "".join(chunks)
