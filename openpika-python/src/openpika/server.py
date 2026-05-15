"""Pure-Python ASGI gateway — fallback when the Rust binary is not available.

Exposes the same HTTP surface as the Rust core so clients work unchanged:
  POST /v1/chat/completions   OpenAI-compatible
  GET  /v1/sessions           List sessions
  GET  /v1/sessions/{id}      Session metadata
  GET  /v1/sessions/{id}/messages  Message history
  POST /webhooks/{platform}   Inbound webhooks
  GET  /health                Liveness
  GET  /ready                 Readiness

Tool / skill management:
  GET    /v1/tools                             List all tool configs
  POST   /v1/tools                             Register a new MCP tool
  PATCH  /v1/tools/{id}                        Update a tool (name, enabled, config, …)
  DELETE /v1/tools/{id}                        Delete an MCP tool (native tools: 400)
  GET    /v1/sessions/{id}/tools/{tool_id}     Get session-level tool state
  PUT    /v1/sessions/{id}/tools/{tool_id}     Set session override {"enabled": bool}
  DELETE /v1/sessions/{id}/tools/{tool_id}     Clear session override

  GET    /v1/skills                            List all skills
  POST   /v1/skills                            Create a skill
  PATCH  /v1/skills/{id}                       Update a skill
  DELETE /v1/skills/{id}                       Delete a non-builtin skill
"""
from __future__ import annotations

import asyncio
import dataclasses
import hashlib
import hmac
import json
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

try:
    from fastapi import FastAPI, HTTPException, Request, Response
    from fastapi.responses import JSONResponse
except ImportError as exc:
    raise ImportError(
        "fastapi is required for the Python gateway. "
        "Run: pip install 'openpika[server]'"
    ) from exc

from openpika.config import config


# ---------------------------------------------------------------------------
# Lifespan — init DB on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    from openpika.db import init_db
    await init_db()
    yield


app = FastAPI(title="OpenPika Gateway", version="0.1.0", lifespan=lifespan)

# In-memory session store (chat history; sessions table backed by DB separately)
_sessions: dict[str, dict[str, Any]] = {}
_messages: dict[str, list[dict[str, Any]]] = {}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready"}


# ---------------------------------------------------------------------------
# Chat completions — OpenAI-compatible
# ---------------------------------------------------------------------------

@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> JSONResponse:
    body = await request.json()
    messages: list[dict[str, str]] = body.get("messages", [])
    model_id: str = body.get("model", config.model)
    session_id: str = body.get("session_id") or str(uuid.uuid4())

    if not messages:
        raise HTTPException(status_code=400, detail="messages is required")

    user_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")
    history = _build_pydantic_history(messages[:-1])

    from openpika.agent import make_agent, run_agent
    agent, _ = await make_agent(model_id, session_id)
    reply, _ = await run_agent(agent, user_text, history)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if session_id not in _sessions:
        _sessions[session_id] = {"id": session_id, "created_at": now, "updated_at": now}
        _messages[session_id] = []
    _sessions[session_id]["updated_at"] = now
    _messages[session_id].append({"role": "user", "content": user_text, "created_at": now})
    _messages[session_id].append({"role": "assistant", "content": reply, "created_at": now})

    return JSONResponse({
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_id,
        "session_id": session_id,
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}
        ],
        "usage": {"prompt_tokens": -1, "completion_tokens": -1, "total_tokens": -1},
    })


def _build_pydantic_history(messages: list[dict[str, str]]) -> list[Any]:
    try:
        from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart
        history = []
        for m in messages:
            role = m.get("role", "")
            content = m.get("content", "")
            if role == "user":
                history.append(ModelRequest(parts=[UserPromptPart(content=content)]))
            elif role == "assistant":
                history.append(ModelResponse(parts=[TextPart(content=content)]))
        return history
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@app.get("/v1/sessions")
async def list_sessions() -> dict[str, Any]:
    return {"sessions": list(_sessions.values()), "total": len(_sessions)}


@app.get("/v1/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/v1/sessions/{session_id}/messages")
async def get_messages(session_id: str) -> dict[str, Any]:
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = _messages.get(session_id, [])
    return {"session_id": session_id, "messages": msgs, "total": len(msgs)}


# ---------------------------------------------------------------------------
# Tool config CRUD
# ---------------------------------------------------------------------------

@app.get("/v1/tools")
async def list_tools_endpoint() -> dict[str, Any]:
    from openpika.db import list_tools
    tools = await list_tools()
    return {"tools": [dataclasses.asdict(t) for t in tools]}


@app.post("/v1/tools")
async def create_tool_endpoint(request: Request) -> dict[str, Any]:
    body = await request.json()
    kind = body.get("kind", "mcp_stdio")
    if kind == "native":
        raise HTTPException(status_code=400, detail="Cannot create native tools via API.")
    from openpika.db import create_tool
    try:
        tool = await create_tool(
            name=body["name"],
            kind=kind,
            description=body.get("description", ""),
            config=body.get("config", {}),
            sort_order=body.get("sort_order", 0),
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return dataclasses.asdict(tool)


@app.patch("/v1/tools/{tool_id}")
async def update_tool_endpoint(tool_id: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    body.pop("kind", None)  # kind is immutable
    from openpika.db import update_tool
    tool = await update_tool(tool_id, **body)
    if tool is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    return dataclasses.asdict(tool)


@app.delete("/v1/tools/{tool_id}")
async def delete_tool_endpoint(tool_id: str) -> dict[str, Any]:
    from openpika.db import delete_tool
    ok = await delete_tool(tool_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete native tool, or tool not found.")
    return {"deleted": tool_id}


# ---------------------------------------------------------------------------
# Session tool overrides
# ---------------------------------------------------------------------------

@app.get("/v1/sessions/{session_id}/tools/{tool_id}")
async def get_session_tool(session_id: str, tool_id: str) -> dict[str, Any]:
    from openpika.db import get_session_overrides, get_tool
    tool = await get_tool(tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    overrides = await get_session_overrides(session_id)
    enabled = overrides.get(tool_id, tool.enabled)
    return {"session_id": session_id, "tool_id": tool_id, "enabled": enabled, "overridden": tool_id in overrides}


@app.put("/v1/sessions/{session_id}/tools/{tool_id}")
async def set_session_tool(session_id: str, tool_id: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    enabled = bool(body.get("enabled", True))
    from openpika.db import set_session_override
    await set_session_override(session_id, tool_id, enabled)
    return {"session_id": session_id, "tool_id": tool_id, "enabled": enabled}


@app.delete("/v1/sessions/{session_id}/tools/{tool_id}")
async def delete_session_tool(session_id: str, tool_id: str) -> dict[str, Any]:
    from openpika.db import delete_session_override
    await delete_session_override(session_id, tool_id)
    return {"session_id": session_id, "tool_id": tool_id, "cleared": True}


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------

@app.get("/v1/skills")
async def list_skills_endpoint() -> dict[str, Any]:
    from openpika.db import list_skills
    skills = await list_skills()
    return {"skills": [dataclasses.asdict(s) for s in skills]}


@app.post("/v1/skills")
async def create_skill_endpoint(request: Request) -> dict[str, Any]:
    body = await request.json()
    from openpika.db import create_skill
    try:
        skill = await create_skill(
            name=body["name"],
            prompt_template=body["prompt_template"],
            description=body.get("description", ""),
            icon=body.get("icon", ""),
            params_schema=body.get("params_schema", {}),
            pinned=body.get("pinned", False),
            sort_order=body.get("sort_order", 0),
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing required field: {exc}")
    return dataclasses.asdict(skill)


@app.patch("/v1/skills/{skill_id}")
async def update_skill_endpoint(skill_id: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    from openpika.db import update_skill
    skill = await update_skill(skill_id, **body)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return dataclasses.asdict(skill)


@app.delete("/v1/skills/{skill_id}")
async def delete_skill_endpoint(skill_id: str) -> dict[str, Any]:
    from openpika.db import delete_skill
    ok = await delete_skill(skill_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete built-in skill, or skill not found.")
    return {"deleted": skill_id}


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

@app.post("/webhooks/{platform}")
async def inbound_webhook(platform: str, request: Request) -> dict[str, str]:
    body = await request.body()

    if config.webhook_secret:
        sig_header = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(
            config.webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    text_content = _extract_text(platform, payload)
    if not text_content:
        return {"status": "ignored"}

    asyncio.create_task(_handle_webhook_message(platform, text_content, payload))
    return {"status": "accepted"}


def _extract_text(platform: str, payload: dict[str, Any]) -> str:
    if platform == "telegram":
        return (
            payload.get("message", {}).get("text", "")
            or payload.get("edited_message", {}).get("text", "")
        )
    if platform == "discord":
        return payload.get("content", "")
    if platform == "slack":
        event = payload.get("event", {})
        return event.get("text", "") if event.get("type") == "message" else ""
    return payload.get("text", "") or payload.get("message", "") or payload.get("content", "")


async def _handle_webhook_message(platform: str, text: str, payload: dict[str, Any]) -> None:
    try:
        from openpika.agent import get_agent
        agent = get_agent(config.model)
        async with agent:
            await agent.run(text)
    except Exception:
        pass
