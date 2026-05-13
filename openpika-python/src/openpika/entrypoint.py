"""PyO3-callable entry points.

These functions are called synchronously from the Rust Python bridge.
All async work is handled via asyncio.run() so they are safe to call
from a blocking thread spawned by tokio.
"""

from __future__ import annotations

import asyncio
import json
import logging

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
        return result.data
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


def _build_history(messages: list[dict]):
    """Convert raw message dicts to pydantic-ai ModelMessage history."""
    from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart

    history = []
    for msg in messages:
        role = msg.get("role", "user")
        text = _extract_text(msg.get("content", ""))
        if role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=text)]))
        elif role in ("assistant", "summary"):
            history.append(ModelResponse(parts=[TextPart(content=text)]))
        # Skip system messages — they are set on the Agent directly

    return history
