use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Maps 1:1 to the `sessions` table.
/// Timestamps stored as ISO 8601 strings for AnyPool compatibility.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    /// OIDC `sub` claim — immutable user identifier
    pub user_id: Option<String>,
    pub source: String,
    pub title: Option<String>,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    /// FK to parent session when this session is a compression child
    pub parent_session_id: Option<String>,
}

/// Maps 1:1 to the `messages` table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    /// JSON-serialized content blocks
    pub content: String,
    pub token_count: Option<i64>,
    pub created_at: String,
}

/// Lightweight tool descriptor stored for RAG retrieval.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ToolEmbedding {
    pub name: String,
    pub description: String,
    /// IEEE 754 float32 array packed as little-endian bytes
    pub embedding: Vec<u8>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl Session {
    pub fn new(source: impl Into<String>, model: impl Into<String>) -> Self {
        let now = now_iso();
        Self {
            id: Uuid::new_v4().to_string(),
            user_id: None,
            source: source.into(),
            title: None,
            model: model.into(),
            created_at: now.clone(),
            updated_at: now,
            parent_session_id: None,
        }
    }
}

impl Message {
    pub fn new(
        session_id: impl Into<String>,
        role: impl Into<String>,
        content: impl Into<String>,
        token_count: Option<i64>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.into(),
            role: role.into(),
            content: content.into(),
            token_count,
            created_at: now_iso(),
        }
    }
}
