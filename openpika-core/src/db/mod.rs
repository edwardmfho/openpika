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
    // sqlite:///absolute/path  OR  sqlite://relative/path
    // Strip query string before extracting path (e.g. ?mode=rwc)
    let raw = url.strip_prefix("sqlite://").unwrap_or(url);
    let path_part = raw.split('?').next().unwrap_or(raw);

    let path = std::path::Path::new(path_part);

    // Create parent directory
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Cannot create SQLite directory: {}", parent.display()))?;
        }
    }

    // Touch the file so sqlx AnyPool can open it (avoids SQLITE_CANTOPEN on new DBs)
    if !path.exists() && !path_part.is_empty() && path_part != ":memory:" {
        std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(path)
            .with_context(|| format!("Cannot create SQLite file: {}", path.display()))?;
    }

    Ok(())
}
