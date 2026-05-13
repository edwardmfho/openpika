use super::{handlers, AppState};
use axum::{
    routing::{get, post},
    Router,
};

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .route("/v1/chat/completions", post(handlers::chat_completions))
        .route("/v1/sessions", get(handlers::list_sessions))
        .route("/v1/sessions/:id", get(handlers::get_session))
        .route("/v1/sessions/:id/messages", get(handlers::get_messages))
}

/// Webhook routes — HMAC signature verification is applied in gateway::serve()
/// after the AppState is available, so middleware can read config.webhook_secret.
pub fn webhook_routes() -> Router<AppState> {
    Router::new()
        .route("/webhooks/:platform", post(handlers::inbound_webhook))
}

pub fn health_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(handlers::health))
        .route("/ready",  get(handlers::readiness))
}
