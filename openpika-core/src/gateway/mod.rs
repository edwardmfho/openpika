pub mod handlers;
pub mod middleware;
pub mod routes;

use crate::{config::AppConfig, db::Pool};
use anyhow::Result;
use axum::Router;
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

    let cors = CorsLayer::permissive(); // Tightened per AppConfig.cors_origins in middleware

    let app = Router::new()
        .merge(routes::api_routes())
        .merge(routes::webhook_routes())
        .merge(routes::health_routes())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("Gateway listening on {}", bind);
    axum::serve(listener, app).await?;

    Ok(())
}
