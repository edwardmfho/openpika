-- Initial schema: sessions, messages, tool embeddings

CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT    PRIMARY KEY NOT NULL,
    -- OIDC sub claim: immutable user identifier set at login
    user_id           TEXT,
    -- Source platform: cli, api, webhook, telegram, discord, etc.
    source            TEXT    NOT NULL DEFAULT 'cli',
    title             TEXT,
    model             TEXT    NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set when this session is a compression child of another
    parent_session_id TEXT    REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_parent     ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS messages (
    id           TEXT     PRIMARY KEY NOT NULL,
    session_id   TEXT     NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    -- user | assistant | system | summary
    role         TEXT     NOT NULL,
    -- JSON-encoded content blocks (compatible with Anthropic API format)
    content      TEXT     NOT NULL,
    token_count  INTEGER,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_session    ON messages(session_id, created_at ASC);

-- FTS5 index for fast full-text search across message content
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    session_id UNINDEXED,
    content,
    content='messages',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, session_id, content) VALUES (new.rowid, new.session_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, session_id, content)
    VALUES ('delete', old.rowid, old.session_id, old.content);
END;

-- Tool embeddings for RAG-based tool selection (Phase 5)
CREATE TABLE IF NOT EXISTS tool_embeddings (
    name        TEXT    PRIMARY KEY NOT NULL,
    description TEXT    NOT NULL,
    -- IEEE 754 float32 array packed as little-endian bytes
    embedding   BLOB    NOT NULL
);

-- Schema version tracking (mirrors hermes_state SCHEMA_VERSION pattern)
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', '1');
