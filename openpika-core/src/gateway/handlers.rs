use super::AppState;
use crate::{
    db::{models::Session, queries},
    python,
    tokenizer,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// ─── Health ───────────────────────────────────────────────────────────────────

pub async fn health() -> impl IntoResponse {
    Json(json!({"status": "ok", "service": "openpika"}))
}

pub async fn readiness(State(st): State<AppState>) -> impl IntoResponse {
    match queries::schema_version_check(&st.db).await {
        Ok(_) => (StatusCode::OK, Json(json!({"status": "ready"}))),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"status": "not ready", "error": e.to_string()})),
        ),
    }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

pub async fn list_sessions(State(st): State<AppState>) -> impl IntoResponse {
    match queries::list_sessions(&st.db, None, 100).await {
        Ok(sessions) => (StatusCode::OK, Json(json!({"sessions": sessions}))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        ),
    }
}

pub async fn get_session(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match queries::get_session(&st.db, &id).await {
        Ok(Some(s)) => (StatusCode::OK, Json(json!(s))),
        Ok(None)    => (StatusCode::NOT_FOUND, Json(json!({"error": "Session not found"}))),
        Err(e)      => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))),
    }
}

pub async fn get_messages(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match queries::get_messages(&st.db, &id).await {
        Ok(msgs) => (StatusCode::OK, Json(json!({"messages": msgs}))),
        Err(e)   => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))),
    }
}

// ─── OpenAI-Compatible Chat Completions ───────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub model: Option<String>,
    pub messages: Vec<Value>,
    #[serde(default)]
    pub stream: bool,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: TokenUsage,
}

#[derive(Debug, Serialize)]
pub struct ChatChoice {
    pub index: u32,
    pub message: Value,
    pub finish_reason: String,
}

#[derive(Debug, Serialize)]
pub struct TokenUsage {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
}

pub async fn chat_completions(
    State(st): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let model = req
        .model
        .clone()
        .unwrap_or_else(|| st.config.default_model.clone());

    // Phase 5: pre-flight token count in Rust
    let messages_json = serde_json::to_string(&req.messages).unwrap_or_default();
    let input_tokens = tokenizer::count_tokens(&messages_json, &model);

    if input_tokens > st.config.context.max_input_tokens {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "error": {
                    "type": "context_length_exceeded",
                    "message": format!(
                        "Input token count {input_tokens} exceeds limit {}",
                        st.config.context.max_input_tokens
                    )
                }
            })),
        );
    }

    // Retrieve (or create) session
    let session_id = req.session_id.clone().unwrap_or_else(|| {
        uuid::Uuid::new_v4().to_string()
    });

    // Delegate to Python pydantic-ai brain
    let result = python::invoke_agent(
        &session_id,
        &req.messages,
        &model,
        &st.db,
        &st.config,
    )
    .await;

    match result {
        Ok(reply) => {
            let usage_tokens = tokenizer::count_tokens(&reply, &model);
            (
                StatusCode::OK,
                Json(json!(ChatResponse {
                    id: format!("chatcmpl-{session_id}"),
                    object: "chat.completion".into(),
                    model,
                    choices: vec![ChatChoice {
                        index: 0,
                        message: json!({"role": "assistant", "content": reply}),
                        finish_reason: "stop".into(),
                    }],
                    usage: TokenUsage {
                        prompt_tokens: input_tokens,
                        completion_tokens: usage_tokens,
                        total_tokens: input_tokens + usage_tokens,
                    },
                })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        ),
    }
}

// ─── Webhook Ingestion ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WebhookPayload {
    #[serde(flatten)]
    pub body: Value,
}

pub async fn inbound_webhook(
    State(st): State<AppState>,
    Path(platform): Path<String>,
    Json(payload): Json<WebhookPayload>,
) -> impl IntoResponse {
    tracing::info!(platform = %platform, "Inbound webhook received");

    // Validate HMAC signature when webhook_secret is configured
    // (Full HMAC check delegated to middleware::WebhookVerify)

    // Deserialize platform-specific envelope in Rust before passing to Python
    let task = match extract_task_from_webhook(&platform, &payload.body) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Cannot parse {platform} webhook: {e}")})),
            )
        }
    };

    let session = Session::new(platform.clone(), st.config.default_model.clone());
    if let Err(e) = queries::insert_session(&st.db, &session).await {
        tracing::error!("Failed to persist session: {e}");
    }

    // Fire-and-forget: dispatch to Python brain asynchronously
    let db  = st.db.clone();
    let cfg = st.config.clone();
    let sid = session.id.clone();
    tokio::spawn(async move {
        let messages = vec![json!({"role": "user", "content": task})];
        if let Err(e) = python::invoke_agent(&sid, &messages, &cfg.default_model, &db, &cfg).await {
            tracing::error!(session_id = %sid, "Agent error: {e}");
        }
    });

    (StatusCode::ACCEPTED, Json(json!({"session_id": session.id, "status": "accepted"})))
}

fn extract_task_from_webhook(platform: &str, body: &Value) -> anyhow::Result<String> {
    match platform {
        "telegram" => {
            let text = body
                .pointer("/message/text")
                .or_else(|| body.pointer("/callback_query/data"))
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("No text field in Telegram update"))?;
            Ok(text.to_owned())
        }
        "discord" => {
            let content = body
                .pointer("/content")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("No content field in Discord payload"))?;
            Ok(content.to_owned())
        }
        "slack" => {
            let text = body
                .pointer("/event/text")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("No event.text field in Slack payload"))?;
            Ok(text.to_owned())
        }
        _ => {
            // Generic fallback — try common field names
            ["text", "message", "content", "body", "query"]
                .iter()
                .find_map(|k| body.get(k).and_then(Value::as_str))
                .map(|s| s.to_owned())
                .ok_or_else(|| anyhow::anyhow!("Cannot extract task from unknown platform '{platform}'"))
        }
    }
}
