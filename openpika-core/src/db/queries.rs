use super::{models::{Message, Session}, Pool};
use anyhow::{Context, Result};

// ─── Session CRUD ─────────────────────────────────────────────────────────────

pub async fn insert_session(pool: &Pool, s: &Session) -> Result<()> {
    sqlx::query(
        "INSERT INTO sessions (id, user_id, source, title, model, created_at, updated_at, parent_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&s.id)
    .bind(&s.user_id)
    .bind(&s.source)
    .bind(&s.title)
    .bind(&s.model)
    .bind(&s.created_at)
    .bind(&s.updated_at)
    .bind(&s.parent_session_id)
    .execute(pool)
    .await
    .context("insert_session")?;
    Ok(())
}

pub async fn get_session(pool: &Pool, id: &str) -> Result<Option<Session>> {
    sqlx::query_as("SELECT * FROM sessions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .context("get_session")
}

pub async fn list_sessions(pool: &Pool, user_id: Option<&str>, limit: i64) -> Result<Vec<Session>> {
    match user_id {
        Some(uid) => sqlx::query_as(
            "SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
        )
        .bind(uid)
        .bind(limit)
        .fetch_all(pool)
        .await
        .context("list_sessions (user)"),

        None => sqlx::query_as(
            "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(pool)
        .await
        .context("list_sessions (all)"),
    }
}

pub async fn touch_session(pool: &Pool, id: &str) -> Result<()> {
    sqlx::query("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .context("touch_session")?;
    Ok(())
}

// ─── Message CRUD ─────────────────────────────────────────────────────────────

pub async fn insert_message(pool: &Pool, m: &Message) -> Result<()> {
    sqlx::query(
        "INSERT INTO messages (id, session_id, role, content, token_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&m.id)
    .bind(&m.session_id)
    .bind(&m.role)
    .bind(&m.content)
    .bind(m.token_count)
    .bind(&m.created_at)
    .execute(pool)
    .await
    .context("insert_message")?;
    Ok(())
}

pub async fn get_messages(pool: &Pool, session_id: &str) -> Result<Vec<Message>> {
    sqlx::query_as("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
        .bind(session_id)
        .fetch_all(pool)
        .await
        .context("get_messages")
}

/// Returns only the last `n` turns (for keeping raw transcript window small).
pub async fn get_recent_messages(pool: &Pool, session_id: &str, n: i64) -> Result<Vec<Message>> {
    sqlx::query_as(
        "SELECT * FROM (
            SELECT * FROM messages WHERE session_id = ?
            ORDER BY created_at DESC LIMIT ?
         ) sub ORDER BY created_at ASC",
    )
    .bind(session_id)
    .bind(n)
    .fetch_all(pool)
    .await
    .context("get_recent_messages")
}

pub async fn message_count(pool: &Pool, session_id: &str) -> Result<i64> {
    let row: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM messages WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(pool)
            .await
            .context("message_count")?;
    Ok(row.0)
}

/// Lightweight DB health probe used by the readiness endpoint.
pub async fn schema_version_check(pool: &Pool) -> Result<()> {
    sqlx::query("SELECT 1 FROM schema_meta LIMIT 1")
        .fetch_optional(pool)
        .await
        .context("schema_version_check")?;
    Ok(())
}
