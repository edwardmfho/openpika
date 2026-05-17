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
    from fastapi import FastAPI, HTTPException, Request
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

    # Start background cron scheduler
    from openpika.scheduler import run_scheduler
    _scheduler_task = asyncio.create_task(run_scheduler(config.model))

    yield

    _scheduler_task.cancel()
    try:
        await _scheduler_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="OpenPika Gateway", version="0.1.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready"}


@app.get("/v1/config")
async def get_config() -> dict[str, Any]:
    return {
        "model": config.model,
        "max_tokens": config.max_tokens,
        "raw_turns": config.raw_turns,
        "gateway_host": config.gateway_host,
        "gateway_port": config.gateway_port,
    }


@app.get("/v1/setup-status")
async def setup_status() -> dict[str, Any]:
    from openpika.config import _PROVIDER_KEY
    provider = config.model.split(":")[0] if ":" in config.model else "anthropic"
    env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")
    key = config.api_key_for_provider(provider)
    return {
        "ready": bool(key),
        "model": config.model,
        "provider": provider,
        "env_var": env_var,
    }


@app.post("/v1/setup")
async def save_setup(request: Request) -> dict[str, Any]:
    body = await request.json()
    model: str = body.get("model", "").strip()
    api_key: str = body.get("api_key", "").strip()
    if not model or not api_key:
        raise HTTPException(status_code=400, detail="model and api_key are required")

    import os as _os

    from openpika.config import _PROVIDER_KEY, CONFIG_DIR, ENV_FILE, save

    provider = model.split(":")[0] if ":" in model else "anthropic"
    env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")

    updates: dict = {"model": model}
    if provider == "anthropic":
        updates["api_key"] = api_key
    else:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        existing = ENV_FILE.read_text() if ENV_FILE.exists() else ""
        lines = [line for line in existing.splitlines(keepends=True) if not line.startswith(f"{env_var}=")]
        lines.append(f'{env_var}="{api_key}"\n')
        ENV_FILE.write_text("".join(lines))

    save(updates)
    _os.environ[env_var] = api_key
    # Re-init so alias logic re-runs (e.g. GEMINI_API_KEY → GOOGLE_API_KEY)
    config.__init__()  # type: ignore[misc]

    return {"ok": True, "model": model, "provider": provider}


# ---------------------------------------------------------------------------
# AG-UI protocol — /v1/awp/run
# ---------------------------------------------------------------------------

@app.post("/v1/awp/run")
async def agui_run(request: Request):
    """AG-UI protocol endpoint.

    Accepts a RunAgentInput JSON body and returns a text/event-stream SSE
    response of AG-UI events.  Any AG-UI-compatible frontend (CopilotKit,
    custom React hooks, etc.) can connect here directly.

    Transport: HTTP POST → text/event-stream (SSE).
    Protocol:  https://docs.ag-ui.com/introduction
    """
    try:
        from pydantic_ai.ui.ag_ui import AGUIAdapter  # noqa: F401 — validates install
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "ag-ui-protocol is not installed. "
                "Run: pip install 'openpika[agui]'"
            ),
        )

    # Eagerly read body so it's cached — dispatch_request() will
    # re-read it from the same cache via request.body().
    body_bytes = await request.body()
    try:
        body_data = json.loads(body_bytes) if body_bytes else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    session_id: str = body_data.get("threadId", str(uuid.uuid4()))
    model_id: str = body_data.get("model", config.model)

    from openpika.a2ui_adapter import OpenPikaAGUIAdapter
    from openpika.agent import make_agent
    agent, _ = await make_agent(model_id, session_id)
    async with agent:
        return await OpenPikaAGUIAdapter.dispatch_request(request, agent=agent)


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
    from openpika.db import add_message, get_or_create_session, touch_session
    agent, _ = await make_agent(model_id, session_id)
    reply, _ = await run_agent(agent, user_text, history)

    await get_or_create_session(session_id, model_id)
    await add_message(session_id, "user", user_text)
    await add_message(session_id, "assistant", reply)
    await touch_session(session_id)

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
        from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
        history: list[ModelMessage] = []
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
    from openpika.db import list_db_sessions
    sessions = await list_db_sessions()
    return {"sessions": [dataclasses.asdict(s) for s in sessions], "total": len(sessions)}


@app.get("/v1/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    from openpika.db import get_db_session
    session = await get_db_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return dataclasses.asdict(session)


@app.get("/v1/sessions/{session_id}/messages")
async def get_messages(session_id: str) -> dict[str, Any]:
    from openpika.db import get_db_messages, get_db_session
    if not await get_db_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = await get_db_messages(session_id)
    return {"session_id": session_id, "messages": [dataclasses.asdict(m) for m in msgs], "total": len(msgs)}


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
# Pending skills (self-learning queue)
# ---------------------------------------------------------------------------

@app.get("/v1/skills/pending")
async def list_pending_skills_endpoint(status: str = "pending") -> dict[str, Any]:
    from openpika.db import list_pending_skills
    skills = await list_pending_skills(status=status)
    return {"pending_skills": [dataclasses.asdict(s) for s in skills]}


@app.post("/v1/skills/pending/{skill_id}/approve")
async def approve_pending_skill(skill_id: str) -> dict[str, Any]:
    from openpika.db import resolve_pending_skill
    ok = await resolve_pending_skill(skill_id, approve=True)
    if not ok:
        raise HTTPException(status_code=404, detail="Pending skill not found or already resolved.")
    return {"approved": skill_id}


@app.post("/v1/skills/pending/{skill_id}/reject")
async def reject_pending_skill(skill_id: str) -> dict[str, Any]:
    from openpika.db import resolve_pending_skill
    ok = await resolve_pending_skill(skill_id, approve=False)
    if not ok:
        raise HTTPException(status_code=404, detail="Pending skill not found or already resolved.")
    return {"rejected": skill_id}


# ---------------------------------------------------------------------------
# Cron scheduler
# ---------------------------------------------------------------------------

@app.get("/v1/cron")
async def list_cron_jobs_endpoint() -> dict[str, Any]:
    from openpika.db import list_cron_jobs
    jobs = await list_cron_jobs()
    return {"cron_jobs": [dataclasses.asdict(j) for j in jobs]}


@app.post("/v1/cron")
async def create_cron_job_endpoint(request: Request) -> dict[str, Any]:
    body = await request.json()
    from openpika.db import create_cron_job
    try:
        job = await create_cron_job(
            name=body["name"],
            schedule=body["schedule"],
            prompt=body["prompt"],
            model=body.get("model"),
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing required field: {exc}")
    return dataclasses.asdict(job)


@app.patch("/v1/cron/{job_id}")
async def update_cron_job_endpoint(job_id: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    from openpika.db import update_cron_job
    job = await update_cron_job(job_id, **body)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")
    return dataclasses.asdict(job)


@app.delete("/v1/cron/{job_id}")
async def delete_cron_job_endpoint(job_id: str) -> dict[str, Any]:
    from openpika.db import delete_cron_job
    ok = await delete_cron_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Cron job not found")
    return {"deleted": job_id}


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
