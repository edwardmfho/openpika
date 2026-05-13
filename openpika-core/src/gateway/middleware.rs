// HMAC webhook signature verification and JWT auth middleware.
// Currently stubbed — full implementation follows in Phase 4.

use axum::{
    body::Body,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

/// Verify HMAC-SHA256 webhook signature (X-Hub-Signature-256 header).
/// Skip when no webhook_secret configured.
pub async fn verify_webhook_signature(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // TODO Phase 3: extract body bytes, compute HMAC, compare constant-time
    Ok(next.run(req).await)
}

/// Validate Bearer JWT and inject `sub` claim as extension.
pub async fn require_auth(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // TODO Phase 4: parse Authorization: Bearer <token>, validate against OIDC JWKS
    Ok(next.run(req).await)
}
