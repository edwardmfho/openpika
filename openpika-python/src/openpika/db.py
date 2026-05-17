"""Async database layer for tool configs and skills (SQLAlchemy + aiosqlite/asyncpg)."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from openpika.config import config

_engine: AsyncEngine | None = None
_factory: async_sessionmaker[AsyncSession] | None = None
_initialized = False


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


def _make_async_url(url: str) -> str:
    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    if url.startswith("sqlite:///:memory:"):
        return "sqlite+aiosqlite:///:memory:"
    for pg in ("postgresql://", "postgres://"):
        if url.startswith(pg):
            return "postgresql+asyncpg://" + url[len(pg) :]
    return url


async def _get_factory() -> async_sessionmaker[AsyncSession]:
    global _engine, _factory
    if _factory is None:
        kw: dict[str, Any] = {"echo": False}
        url = _make_async_url(config.database_url)
        if url.startswith("sqlite"):
            kw["connect_args"] = {"check_same_thread": False}
        _engine = create_async_engine(url, **kw)
        _factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _factory


@asynccontextmanager
async def session_ctx() -> AsyncIterator[AsyncSession]:
    if _factory is None:
        raise RuntimeError("Call init_db() before using the database.")
    async with _factory() as sess:
        try:
            yield sess
            await sess.commit()
        except Exception:
            await sess.rollback()
            raise


# ---------------------------------------------------------------------------
# DDL (embedded, idempotent)
# ---------------------------------------------------------------------------

_DDL: list[str] = [
    # 0001 tables (IF NOT EXISTS — safe to re-run)
    """CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        source TEXT NOT NULL DEFAULT 'cli',
        title TEXT,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)",
    """CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at ASC)",
    """CREATE TABLE IF NOT EXISTS tool_embeddings (
        name TEXT PRIMARY KEY NOT NULL,
        description TEXT NOT NULL,
        embedding BLOB NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    )""",
    # 0002 tables
    """CREATE TABLE IF NOT EXISTS tool_configs (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        config_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS session_tool_overrides (
        session_id TEXT NOT NULL,
        tool_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (session_id, tool_id)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_sto_session ON session_tool_overrides(session_id)",
    """CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '',
        prompt_template TEXT NOT NULL DEFAULT '',
        params_schema TEXT NOT NULL DEFAULT '{}',
        is_builtin INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    # 0003 — cron scheduler
    """CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS idx_cron_enabled ON cron_jobs(enabled)",
    # 0004 — self-learning pending skills queue
    """CREATE TABLE IF NOT EXISTS pending_skills (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        prompt_template TEXT NOT NULL DEFAULT '',
        params_schema TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS idx_pending_skills_status ON pending_skills(status)",
    # 0005 — swarm run audit log
    """CREATE TABLE IF NOT EXISTS swarm_runs (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        task TEXT NOT NULL,
        pipeline TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        events_json TEXT NOT NULL DEFAULT '[]',
        final_output TEXT NOT NULL DEFAULT ''
    )""",
    "CREATE INDEX IF NOT EXISTS idx_swarm_runs_session ON swarm_runs(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_swarm_runs_status ON swarm_runs(status)",
]


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

_BUILTIN_TOOLS: list[dict[str, Any]] = [
    {
        "id": "web_search",
        "name": "Web Search",
        "kind": "native",
        "description": "Search the web using DuckDuckGo",
        "sort_order": 0,
    },
    {
        "id": "read_file",
        "name": "Read File",
        "kind": "native",
        "description": "Read a file from the filesystem",
        "sort_order": 1,
    },
    {
        "id": "write_file",
        "name": "Write File",
        "kind": "native",
        "description": "Write content to a file",
        "sort_order": 2,
    },
    {"id": "terminal", "name": "Terminal", "kind": "native", "description": "Execute a shell command", "sort_order": 3},
    {
        "id": "execute_code",
        "name": "Execute Code",
        "kind": "native",
        "description": "Execute code in Python, JS, Bash, Ruby, or Go",
        "sort_order": 4,
    },
    {
        "id": "generate_image",
        "name": "Generate Image",
        "kind": "native",
        "description": "Generate an image using a configured image generation API",
        "sort_order": 5,
    },
    {
        "id": "propose_skill",
        "name": "Propose Skill",
        "kind": "native",
        "description": "Propose a reusable skill for the user to review and approve",
        "sort_order": 6,
    },
    {
        "id": "browser_navigate",
        "name": "Browser Navigate",
        "kind": "native",
        "description": "Navigate the browser to a URL (requires playwright)",
        "sort_order": 7,
    },
    {
        "id": "browser_snapshot",
        "name": "Browser Snapshot",
        "kind": "native",
        "description": "Return current page URL, title, and visible text",
        "sort_order": 8,
    },
    {
        "id": "browser_click",
        "name": "Browser Click",
        "kind": "native",
        "description": "Click an element on the current page by CSS selector",
        "sort_order": 9,
    },
    {
        "id": "browser_type",
        "name": "Browser Type",
        "kind": "native",
        "description": "Type text into an input element on the current page",
        "sort_order": 10,
    },
    {
        "id": "browser_extract",
        "name": "Browser Extract",
        "kind": "native",
        "description": "Extract text from elements matching a CSS selector",
        "sort_order": 11,
    },
    {
        "id": "browser_close",
        "name": "Browser Close",
        "kind": "native",
        "description": "Close the browser and release all resources",
        "sort_order": 12,
    },
]

_BUILTIN_SKILLS: list[dict[str, Any]] = [
    {
        "id": "summarise",
        "name": "Summarise",
        "icon": "📝",
        "description": "Condense a block of text into key points",
        "prompt_template": "Please summarise the following text concisely:\n\n{{text}}",
        "params_schema": json.dumps(
            {"text": {"type": "string", "label": "Text to summarise", "required": True, "multiline": True}}
        ),
        "sort_order": 0,
    },
    {
        "id": "draft_email",
        "name": "Draft Email",
        "icon": "✉️",
        "description": "Write a professional email",
        "prompt_template": "Write a professional email.\n\nSubject: {{subject}}\nContext: {{context}}\nTone: {{tone}}",
        "params_schema": json.dumps(
            {
                "subject": {"type": "string", "label": "Subject", "required": True},
                "context": {"type": "string", "label": "What the email is about", "required": True, "multiline": True},
                "tone": {"type": "string", "label": "Tone", "default": "professional"},
            }
        ),
        "sort_order": 1,
    },
    {
        "id": "explain_code",
        "name": "Explain Code",
        "icon": "💻",
        "description": "Plain-English explanation of a code snippet",
        "prompt_template": (
            "Explain the following {{language}} code in plain English:\n\n```{{language}}\n{{code}}\n```"
        ),
        "params_schema": json.dumps(
            {
                "code": {"type": "string", "label": "Code snippet", "required": True, "multiline": True},
                "language": {"type": "string", "label": "Language", "default": ""},
            }
        ),
        "sort_order": 2,
    },
    {
        "id": "search_web",
        "name": "Search Web",
        "icon": "🔍",
        "description": "Search the web and summarise results",
        "prompt_template": "Search the web for: {{query}}\n\nSummarise what you find.",
        "params_schema": json.dumps({"query": {"type": "string", "label": "Search query", "required": True}}),
        "sort_order": 3,
    },
    {
        "id": "write_file_skill",
        "name": "Write File",
        "icon": "📁",
        "description": "Create or update a file with specified content",
        "prompt_template": "Write the following content to {{path}}:\n\n{{content}}",
        "params_schema": json.dumps(
            {
                "path": {"type": "string", "label": "File path", "required": True},
                "content": {"type": "string", "label": "Content", "required": True, "multiline": True},
            }
        ),
        "sort_order": 4,
    },
]


async def init_db() -> None:
    """Create tables and seed built-in records. Idempotent — safe to call on every startup."""
    global _initialized
    if _initialized:
        return
    factory = await _get_factory()
    assert _engine is not None
    async with _engine.begin() as conn:
        for stmt in _DDL:
            await conn.execute(text(stmt))
        now = _utcnow()
        for tool in _BUILTIN_TOOLS:
            await conn.execute(
                text(
                    "INSERT INTO tool_configs"
                    "(id, name, kind, description, config_json, sort_order, created_at, updated_at) "
                    "SELECT :id, :name, :kind, :description, '{}', :sort_order, :now, :now "
                    "WHERE NOT EXISTS (SELECT 1 FROM tool_configs WHERE id = :id)"
                ),
                {**tool, "now": now},
            )
        for skill in _BUILTIN_SKILLS:
            await conn.execute(
                text(
                    "INSERT INTO skills"
                    "(id, name, description, icon, prompt_template, params_schema,"
                    " is_builtin, sort_order, created_at, updated_at) "
                    "SELECT :id, :name, :description, :icon, :prompt_template, :params_schema,"
                    " 1, :sort_order, :now, :now "
                    "WHERE NOT EXISTS (SELECT 1 FROM skills WHERE id = :id)"
                ),
                {**skill, "now": now},
            )
    _initialized = True
    # Re-assign _factory reference so session_ctx works after engine.begin()
    global _factory
    _factory = factory


# ---------------------------------------------------------------------------
# Session / message CRUD
# ---------------------------------------------------------------------------


@dataclass
class Session:
    id: str
    model: str
    source: str
    title: str | None
    created_at: str
    updated_at: str


@dataclass
class Message:
    id: str
    session_id: str
    role: str
    content: str
    created_at: str


def _to_session(row: Any) -> Session:
    d = dict(row._mapping)
    return Session(
        id=d["id"],
        model=d.get("model", ""),
        source=d.get("source", "cli"),
        title=d.get("title"),
        created_at=d.get("created_at", ""),
        updated_at=d.get("updated_at", ""),
    )


def _to_message(row: Any) -> Message:
    d = dict(row._mapping)
    return Message(
        id=d["id"],
        session_id=d["session_id"],
        role=d["role"],
        content=d["content"],
        created_at=d.get("created_at", ""),
    )


async def get_or_create_session(session_id: str, model: str, source: str = "api") -> Session:
    """Return the existing session or create it if it does not exist."""
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO sessions(id, model, source, created_at, updated_at) "
                "SELECT :id, :model, :source, :now, :now "
                "WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE id = :id)"
            ),
            {"id": session_id, "model": model, "source": source, "now": now},
        )
        row = (await sess.execute(text("SELECT * FROM sessions WHERE id = :id"), {"id": session_id})).fetchone()
    return _to_session(row)  # type: ignore[arg-type]


async def touch_session(session_id: str) -> None:
    async with session_ctx() as sess:
        await sess.execute(
            text("UPDATE sessions SET updated_at = :now WHERE id = :id"),
            {"id": session_id, "now": _utcnow()},
        )


async def list_db_sessions() -> list[Session]:
    async with session_ctx() as sess:
        rows = await sess.execute(text("SELECT * FROM sessions ORDER BY updated_at DESC"))
        return [_to_session(r) for r in rows.fetchall()]


async def get_db_session(session_id: str) -> Session | None:
    async with session_ctx() as sess:
        row = (await sess.execute(text("SELECT * FROM sessions WHERE id = :id"), {"id": session_id})).fetchone()
        return _to_session(row) if row else None


async def add_message(session_id: str, role: str, content: str) -> Message:
    msg_id = str(uuid.uuid4())
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO messages(id, session_id, role, content, created_at) "
                "VALUES (:id, :session_id, :role, :content, :now)"
            ),
            {"id": msg_id, "session_id": session_id, "role": role, "content": content, "now": now},
        )
    return Message(id=msg_id, session_id=session_id, role=role, content=content, created_at=now)


async def get_db_messages(session_id: str) -> list[Message]:
    async with session_ctx() as sess:
        rows = await sess.execute(
            text("SELECT * FROM messages WHERE session_id = :sid ORDER BY created_at ASC"),
            {"sid": session_id},
        )
        return [_to_message(r) for r in rows.fetchall()]


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class ToolConfig:
    id: str
    name: str
    kind: str
    description: str
    config: dict[str, Any]
    enabled: bool
    sort_order: int


@dataclass
class SessionToolOverride:
    session_id: str
    tool_id: str
    enabled: bool


@dataclass
class Skill:
    id: str
    name: str
    description: str
    icon: str
    prompt_template: str
    params_schema: dict[str, Any]
    is_builtin: bool
    pinned: bool
    sort_order: int


# ---------------------------------------------------------------------------
# Row helpers
# ---------------------------------------------------------------------------


def _to_tool(row: Any) -> ToolConfig:
    d = dict(row._mapping)
    try:
        config_dict = json.loads(d.get("config_json") or "{}")
    except json.JSONDecodeError:
        config_dict = {}
    return ToolConfig(
        id=d["id"],
        name=d["name"],
        kind=d["kind"],
        description=d.get("description", ""),
        config=config_dict,
        enabled=bool(d["enabled"]),
        sort_order=d.get("sort_order", 0),
    )


def _to_skill(row: Any) -> Skill:
    d = dict(row._mapping)
    try:
        schema = json.loads(d.get("params_schema") or "{}")
    except json.JSONDecodeError:
        schema = {}
    return Skill(
        id=d["id"],
        name=d["name"],
        description=d.get("description", ""),
        icon=d.get("icon") or "",
        prompt_template=d.get("prompt_template", ""),
        params_schema=schema,
        is_builtin=bool(d.get("is_builtin", 0)),
        pinned=bool(d.get("pinned", 0)),
        sort_order=d.get("sort_order", 0),
    )


def _utcnow() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Tool config CRUD
# ---------------------------------------------------------------------------


async def list_tools() -> list[ToolConfig]:
    async with session_ctx() as sess:
        rows = await sess.execute(text("SELECT * FROM tool_configs ORDER BY sort_order, id"))
        return [_to_tool(r) for r in rows.fetchall()]


async def get_tool(tool_id: str) -> ToolConfig | None:
    async with session_ctx() as sess:
        result = await sess.execute(text("SELECT * FROM tool_configs WHERE id = :id"), {"id": tool_id})
        row = result.fetchone()
        return _to_tool(row) if row else None


async def create_tool(
    name: str,
    kind: str,
    description: str = "",
    config: dict[str, Any] | None = None,
    sort_order: int = 0,
) -> ToolConfig:
    if kind == "native":
        raise ValueError("Cannot create native tools via API — use the built-in seed.")
    tool_id = str(uuid.uuid4())
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO tool_configs"
                "(id, name, kind, description, config_json, enabled, sort_order, created_at, updated_at) "
                "VALUES (:id, :name, :kind, :description, :config_json, 1, :sort_order, :now, :now)"
            ),
            {
                "id": tool_id,
                "name": name,
                "kind": kind,
                "description": description,
                "config_json": json.dumps(config or {}),
                "sort_order": sort_order,
                "now": now,
            },
        )
    return await get_tool(tool_id)  # type: ignore[return-value]


async def update_tool(tool_id: str, **fields: Any) -> ToolConfig | None:
    """Update a tool. Allowed fields: name, description, enabled, sort_order, config (dict)."""
    allowed = {"name", "description", "enabled", "sort_order", "config"}
    params: dict[str, Any] = {"id": tool_id, "now": _utcnow()}
    clauses: list[str] = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        if key == "config":
            clauses.append("config_json = :config_json")
            params["config_json"] = json.dumps(val)
        elif key == "enabled":
            clauses.append("enabled = :enabled")
            params["enabled"] = 1 if val else 0
        else:
            clauses.append(f"{key} = :{key}")
            params[key] = val
    if not clauses:
        return await get_tool(tool_id)
    clauses.append("updated_at = :now")
    async with session_ctx() as sess:
        sql = f"UPDATE tool_configs SET {', '.join(clauses)} WHERE id = :id"
        await sess.execute(text(sql), params)
    return await get_tool(tool_id)


async def delete_tool(tool_id: str) -> bool:
    """Delete a non-native tool. Returns False if not found or if native."""
    async with session_ctx() as sess:
        result = await sess.execute(
            text("DELETE FROM tool_configs WHERE id = :id AND kind != 'native'"), {"id": tool_id}
        )
        return result.rowcount > 0  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Session tool overrides
# ---------------------------------------------------------------------------


async def get_session_overrides(session_id: str) -> dict[str, bool]:
    async with session_ctx() as sess:
        rows = await sess.execute(
            text("SELECT tool_id, enabled FROM session_tool_overrides WHERE session_id = :sid"),
            {"sid": session_id},
        )
        return {r.tool_id: bool(r.enabled) for r in rows.fetchall()}


async def set_session_override(session_id: str, tool_id: str, enabled: bool) -> None:
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO session_tool_overrides(session_id, tool_id, enabled)"
                " VALUES (:sid, :tid, :en) "
                "ON CONFLICT(session_id, tool_id) DO UPDATE SET enabled = excluded.enabled"
            ),
            {"sid": session_id, "tid": tool_id, "en": 1 if enabled else 0},
        )


async def delete_session_override(session_id: str, tool_id: str) -> bool:
    async with session_ctx() as sess:
        result = await sess.execute(
            text("DELETE FROM session_tool_overrides WHERE session_id = :sid AND tool_id = :tid"),
            {"sid": session_id, "tid": tool_id},
        )
        return result.rowcount > 0  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------


async def list_skills() -> list[Skill]:
    async with session_ctx() as sess:
        rows = await sess.execute(text("SELECT * FROM skills ORDER BY sort_order, id"))
        return [_to_skill(r) for r in rows.fetchall()]


async def get_skill(skill_id: str) -> Skill | None:
    async with session_ctx() as sess:
        result = await sess.execute(text("SELECT * FROM skills WHERE id = :id"), {"id": skill_id})
        row = result.fetchone()
        return _to_skill(row) if row else None


async def create_skill(
    name: str,
    prompt_template: str,
    description: str = "",
    icon: str = "",
    params_schema: dict[str, Any] | None = None,
    pinned: bool = False,
    sort_order: int = 0,
) -> Skill:
    skill_id = str(uuid.uuid4())
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO skills"
                "(id, name, description, icon, prompt_template, params_schema,"
                " is_builtin, pinned, sort_order, created_at, updated_at) "
                "VALUES (:id, :name, :description, :icon, :prompt_template, :params_schema,"
                " 0, :pinned, :sort_order, :now, :now)"
            ),
            {
                "id": skill_id,
                "name": name,
                "description": description,
                "icon": icon,
                "prompt_template": prompt_template,
                "params_schema": json.dumps(params_schema or {}),
                "pinned": 1 if pinned else 0,
                "sort_order": sort_order,
                "now": now,
            },
        )
    return await get_skill(skill_id)  # type: ignore[return-value]


async def update_skill(skill_id: str, **fields: Any) -> Skill | None:
    """Update a skill. Allowed fields: name, description, icon, prompt_template,
    params_schema, pinned, sort_order."""
    allowed = {"name", "description", "icon", "prompt_template", "params_schema", "pinned", "sort_order"}
    params: dict[str, Any] = {"id": skill_id, "now": _utcnow()}
    clauses: list[str] = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        if key == "params_schema":
            clauses.append("params_schema = :params_schema")
            params["params_schema"] = json.dumps(val)
        elif key == "pinned":
            clauses.append("pinned = :pinned")
            params["pinned"] = 1 if val else 0
        else:
            clauses.append(f"{key} = :{key}")
            params[key] = val
    if not clauses:
        return await get_skill(skill_id)
    clauses.append("updated_at = :now")
    async with session_ctx() as sess:
        await sess.execute(text(f"UPDATE skills SET {', '.join(clauses)} WHERE id = :id"), params)
    return await get_skill(skill_id)


async def delete_skill(skill_id: str) -> bool:
    """Delete a non-builtin skill. Returns False if not found or if builtin."""
    async with session_ctx() as sess:
        result = await sess.execute(text("DELETE FROM skills WHERE id = :id AND is_builtin = 0"), {"id": skill_id})
        return result.rowcount > 0  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Cron jobs CRUD
# ---------------------------------------------------------------------------


@dataclass
class CronJob:
    id: str
    name: str
    schedule: str
    prompt: str
    model: str | None
    enabled: bool
    last_run: str | None
    next_run: str | None
    created_at: str
    updated_at: str


def _to_cron_job(row: Any) -> CronJob:
    d = dict(row._mapping)
    return CronJob(
        id=d["id"],
        name=d["name"],
        schedule=d["schedule"],
        prompt=d["prompt"],
        model=d.get("model"),
        enabled=bool(d["enabled"]),
        last_run=d.get("last_run"),
        next_run=d.get("next_run"),
        created_at=d.get("created_at", ""),
        updated_at=d.get("updated_at", ""),
    )


async def list_cron_jobs(enabled_only: bool = False) -> list[CronJob]:
    q = "SELECT * FROM cron_jobs"
    if enabled_only:
        q += " WHERE enabled = 1"
    q += " ORDER BY created_at ASC"
    async with session_ctx() as sess:
        rows = await sess.execute(text(q))
        return [_to_cron_job(r) for r in rows.fetchall()]


async def get_cron_job(job_id: str) -> CronJob | None:
    async with session_ctx() as sess:
        row = (await sess.execute(text("SELECT * FROM cron_jobs WHERE id = :id"), {"id": job_id})).fetchone()
        return _to_cron_job(row) if row else None


async def create_cron_job(
    name: str,
    schedule: str,
    prompt: str,
    model: str | None = None,
) -> CronJob:
    """Create a cron job and compute its first next_run from the schedule."""
    job_id = str(uuid.uuid4())
    now = _utcnow()

    # Compute next_run using croniter if available
    next_run: str | None = None
    try:
        from datetime import datetime

        from croniter import croniter

        next_dt = croniter(schedule, datetime.now(UTC)).get_next(datetime)
        next_run = next_dt.isoformat()
    except Exception:
        pass

    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO cron_jobs(id, name, schedule, prompt, model, enabled, next_run, created_at, updated_at) "
                "VALUES (:id, :name, :schedule, :prompt, :model, 1, :next_run, :now, :now)"
            ),
            {
                "id": job_id,
                "name": name,
                "schedule": schedule,
                "prompt": prompt,
                "model": model,
                "next_run": next_run,
                "now": now,
            },
        )
    return await get_cron_job(job_id)  # type: ignore[return-value]


async def update_cron_job(job_id: str, **fields: Any) -> CronJob | None:
    allowed = {"name", "schedule", "prompt", "model", "enabled", "last_run", "next_run"}
    params: dict[str, Any] = {"id": job_id, "now": _utcnow()}
    clauses: list[str] = []
    for key, val in fields.items():
        if key not in allowed:
            continue
        if key == "enabled":
            clauses.append("enabled = :enabled")
            params["enabled"] = 1 if val else 0
        else:
            clauses.append(f"{key} = :{key}")
            params[key] = val
    if not clauses:
        return await get_cron_job(job_id)
    clauses.append("updated_at = :now")
    async with session_ctx() as sess:
        await sess.execute(text(f"UPDATE cron_jobs SET {', '.join(clauses)} WHERE id = :id"), params)
    return await get_cron_job(job_id)


async def delete_cron_job(job_id: str) -> bool:
    async with session_ctx() as sess:
        result = await sess.execute(text("DELETE FROM cron_jobs WHERE id = :id"), {"id": job_id})
        return result.rowcount > 0  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Pending skills CRUD (self-learning queue)
# ---------------------------------------------------------------------------


@dataclass
class PendingSkill:
    id: str
    name: str
    description: str
    prompt_template: str
    params_schema: dict[str, Any]
    status: str  # 'pending', 'approved', 'rejected'
    created_at: str
    updated_at: str


def _to_pending_skill(row: Any) -> PendingSkill:
    d = dict(row._mapping)
    try:
        schema = json.loads(d.get("params_schema") or "{}")
    except json.JSONDecodeError:
        schema = {}
    return PendingSkill(
        id=d["id"],
        name=d["name"],
        description=d.get("description", ""),
        prompt_template=d.get("prompt_template", ""),
        params_schema=schema,
        status=d.get("status", "pending"),
        created_at=d.get("created_at", ""),
        updated_at=d.get("updated_at", ""),
    )


async def list_pending_skills(status: str = "pending") -> list[PendingSkill]:
    async with session_ctx() as sess:
        rows = await sess.execute(
            text("SELECT * FROM pending_skills WHERE status = :status ORDER BY created_at ASC"),
            {"status": status},
        )
        return [_to_pending_skill(r) for r in rows.fetchall()]


async def get_pending_skill(skill_id: str) -> PendingSkill | None:
    async with session_ctx() as sess:
        row = (await sess.execute(text("SELECT * FROM pending_skills WHERE id = :id"), {"id": skill_id})).fetchone()
        return _to_pending_skill(row) if row else None


async def create_pending_skill(
    name: str,
    description: str,
    prompt_template: str,
    params_schema: dict[str, Any] | None = None,
) -> PendingSkill:
    skill_id = str(uuid.uuid4())
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO pending_skills"
                "(id, name, description, prompt_template, params_schema, status, created_at, updated_at) "
                "VALUES (:id, :name, :description, :prompt_template, :params_schema, 'pending', :now, :now)"
            ),
            {
                "id": skill_id,
                "name": name,
                "description": description,
                "prompt_template": prompt_template,
                "params_schema": json.dumps(params_schema or {}),
                "now": now,
            },
        )
    return await get_pending_skill(skill_id)  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Swarm runs CRUD
# ---------------------------------------------------------------------------


@dataclass
class SwarmRun:
    id: str
    session_id: str
    task: str
    pipeline: list[str]
    status: str  # 'running', 'completed', 'error', 'timeout'
    started_at: str
    completed_at: str | None
    events: list[Any]
    final_output: str


def _to_swarm_run(row: Any) -> SwarmRun:
    d = dict(row._mapping)
    try:
        pipeline = json.loads(d.get("pipeline") or "[]")
    except json.JSONDecodeError:
        pipeline = []
    try:
        events = json.loads(d.get("events_json") or "[]")
    except json.JSONDecodeError:
        events = []
    return SwarmRun(
        id=d["id"],
        session_id=d["session_id"],
        task=d["task"],
        pipeline=pipeline,
        status=d.get("status", "running"),
        started_at=d.get("started_at", ""),
        completed_at=d.get("completed_at"),
        events=events,
        final_output=d.get("final_output", ""),
    )


async def create_swarm_run(
    session_id: str,
    task: str,
    pipeline: list[str],
) -> SwarmRun:
    run_id = str(uuid.uuid4())
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "INSERT INTO swarm_runs"
                "(id, session_id, task, pipeline, status, started_at, events_json, final_output) "
                "VALUES (:id, :session_id, :task, :pipeline, 'running', :now, '[]', '')"
            ),
            {
                "id": run_id,
                "session_id": session_id,
                "task": task,
                "pipeline": json.dumps(pipeline),
                "now": now,
            },
        )
    return await get_swarm_run(run_id)  # type: ignore[return-value]


async def get_swarm_run(run_id: str) -> SwarmRun | None:
    async with session_ctx() as sess:
        row = (await sess.execute(text("SELECT * FROM swarm_runs WHERE id = :id"), {"id": run_id})).fetchone()
        return _to_swarm_run(row) if row else None


async def list_swarm_runs(limit: int = 50) -> list[SwarmRun]:
    async with session_ctx() as sess:
        rows = await sess.execute(
            text("SELECT * FROM swarm_runs ORDER BY started_at DESC LIMIT :limit"),
            {"limit": limit},
        )
        return [_to_swarm_run(r) for r in rows.fetchall()]


async def finish_swarm_run(
    run_id: str,
    status: str,
    events: list[Any],
    final_output: str,
) -> SwarmRun | None:
    now = _utcnow()
    async with session_ctx() as sess:
        await sess.execute(
            text(
                "UPDATE swarm_runs SET status = :status, completed_at = :now, "
                "events_json = :events, final_output = :output WHERE id = :id"
            ),
            {
                "id": run_id,
                "status": status,
                "now": now,
                "events": json.dumps(events),
                "output": final_output,
            },
        )
    return await get_swarm_run(run_id)


async def resolve_pending_skill(skill_id: str, approve: bool) -> bool:
    """Approve or reject a pending skill.

    Approve: copies the skill to the `skills` table and marks it 'approved'.
    Reject:  marks it 'rejected' (kept for audit; not shown in normal listing).
    """
    pending = await get_pending_skill(skill_id)
    if pending is None or pending.status != "pending":
        return False

    now = _utcnow()
    async with session_ctx() as sess:
        if approve:
            new_id = str(uuid.uuid4())
            await sess.execute(
                text(
                    "INSERT INTO skills(id, name, description, icon, prompt_template, params_schema, "
                    "is_builtin, pinned, sort_order, created_at, updated_at) "
                    "VALUES (:id, :name, :description, '', :prompt_template, :params_schema, 0, 0, 0, :now, :now)"
                ),
                {
                    "id": new_id,
                    "name": pending.name,
                    "description": pending.description,
                    "prompt_template": pending.prompt_template,
                    "params_schema": json.dumps(pending.params_schema),
                    "now": now,
                },
            )
        await sess.execute(
            text("UPDATE pending_skills SET status = :status, updated_at = :now WHERE id = :id"),
            {"status": "approved" if approve else "rejected", "now": now, "id": skill_id},
        )
    return True
