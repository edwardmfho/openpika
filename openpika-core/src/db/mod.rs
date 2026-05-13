pub mod crypto;
pub mod migrations;
pub mod models;
pub mod queries;

pub use queries::{
    get_messages, get_session, insert_message, insert_session, list_sessions,
    message_count, schema_version_check, touch_session,
};

use anyhow::{Context, Result};
use sqlx::{AnyPool, Row};

pub type Pool = AnyPool;

/// Connect to the database and ensure the data directory exists for SQLite paths.
pub async fn connect(url: &str) -> Result<Pool> {
    if url.starts_with("sqlite://") {
        prepare_sqlite_dir(url)?;
    }

    sqlx::any::install_default_drivers();

    AnyPool::connect(url)
        .await
        .with_context(|| format!("Cannot connect to database: {url}"))
}

/// Run embedded SQLx migrations.
pub async fn migrate(pool: &Pool) -> Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .context("Database migration failed")?;
    Ok(())
}

pub async fn schema_version(pool: &Pool) -> Result<i64> {
    let row = sqlx::query(
        "SELECT MAX(version) FROM _sqlx_migrations WHERE success = TRUE",
    )
    .fetch_optional(pool)
    .await
    .context("Could not read schema version")?;

    Ok(row.map(|r| r.get::<i64, _>(0)).unwrap_or(0))
}

fn prepare_sqlite_dir(url: &str) -> Result<()> {
    // sqlite:///absolute/path  OR  sqlite://relative
    let path_part = url
        .strip_prefix("sqlite://")
        .unwrap_or(url);

    let path = std::path::Path::new(path_part);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Cannot create SQLite directory: {}", parent.display()))?;
        }
    }
    Ok(())
}
