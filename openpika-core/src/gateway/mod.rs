pub mod handlers;
pub mod middleware;
pub mod routes;

use crate::{config::AppConfig, db::Pool};
use anyhow::Result;
use axum::{middleware as axum_middleware, Router};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

/// Shared application state injected into every axum handler.
#[derive(Clone)]
pub struct AppState {
    pub db: Pool,
    pub config: Arc<AppConfig>,
}

/// Start the axum gateway and block until shutdown.
pub async fn serve(bind: String, db: Pool, config: AppConfig) -> Result<()> {
    let state = AppState {
        db,
        config: Arc::new(config),
    };

    let cors = CorsLayer::permissive();

    // Build the router, bind state, then layer webhook HMAC middleware.
    // The middleware needs state (to read webhook_secret), so it is added
    // via from_fn_with_state *after* with_state is called on webhook_routes.
    let webhook = routes::webhook_routes()
        .route_layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::verify_webhook_signature,
        ));

    let app = Router::new()
        .merge(routes::api_routes())
        .merge(webhook)
        .merge(routes::health_routes())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("Gateway listening on {}", bind);
    axum::serve(listener, app).await?;

    Ok(())
}
