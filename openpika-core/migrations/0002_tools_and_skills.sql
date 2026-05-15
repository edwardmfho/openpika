-- Tool registry: built-in native tools + dynamically registered MCP servers
CREATE TABLE IF NOT EXISTS tool_configs (
    id          TEXT    PRIMARY KEY NOT NULL,
    name        TEXT    NOT NULL,
    -- 'native' | 'mcp_stdio' | 'mcp_http'
    kind        TEXT    NOT NULL CHECK(kind IN ('native', 'mcp_stdio', 'mcp_http')),
    description TEXT    NOT NULL DEFAULT '',
    -- native → {}; mcp_stdio → {"command":"npx","args":[...],"env":{"K":"V"}}
    -- mcp_http → {"url":"http://...","headers":{}}
    config_json TEXT    NOT NULL DEFAULT '{}',
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-session tool overrides (toggle individual tools on/off for a session)
-- session_id intentionally has no FK — Chainlit sessions are not in sessions table
CREATE TABLE IF NOT EXISTS session_tool_overrides (
    session_id  TEXT    NOT NULL,
    tool_id     TEXT    NOT NULL REFERENCES tool_configs(id) ON DELETE CASCADE,
    enabled     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_sto_session ON session_tool_overrides(session_id);

-- Skills: prompt templates the user can trigger from the UI via /commands
CREATE TABLE IF NOT EXISTS skills (
    id              TEXT    PRIMARY KEY NOT NULL,
    name            TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    icon            TEXT    NOT NULL DEFAULT '',
    prompt_template TEXT    NOT NULL DEFAULT '',
    -- JSON object: {"param_name": {"type": "string", "label": "...", "required": true}}
    params_schema   TEXT    NOT NULL DEFAULT '{}',
    is_builtin      INTEGER NOT NULL DEFAULT 0,
    pinned          INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', '2');
