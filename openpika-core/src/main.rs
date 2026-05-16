mod config;
mod db;
mod gateway;
mod python;
mod auth;
mod tokenizer;
mod worker;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[derive(Parser)]
#[command(name = "openpika", version, about = "OpenPika — enterprise AI agent engine")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Path to config file (default: ~/.openpika/config.toml)
    #[arg(short, long, global = true)]
    config: Option<String>,

    /// Log level (trace, debug, info, warn, error)
    #[arg(short, long, global = true, default_value = "info")]
    log_level: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the webhook gateway server
    Serve {
        /// Bind address
        #[arg(short, long, default_value = "0.0.0.0:8080")]
        bind: String,
    },
    /// Start the backend + web UI together
    Ui {
        /// Backend bind address
        #[arg(short, long, default_value = "0.0.0.0:8080")]
        bind: String,
        /// UI dev server port
        #[arg(short, long, default_value = "3000")]
        port: u16,
        /// Path to the openpika-ui directory (auto-detected if omitted)
        #[arg(long)]
        ui_dir: Option<String>,
    },
    /// Run an agent task non-interactively
    Run {
        /// Task description or @file path
        task: String,
    },
    /// Authenticate with an enterprise identity provider
    Login {
        /// OIDC provider name (okta, azure, auth0)
        #[arg(short, long)]
        provider: Option<String>,
    },
    /// Manage stored credentials
    Credentials {
        #[command(subcommand)]
        action: CredentialAction,
    },
    /// Database utilities
    Db {
        #[command(subcommand)]
        action: DbAction,
    },
}

#[derive(Subcommand)]
enum CredentialAction {
    /// Store an API key in the OS keychain
    Set { key: String, value: String },
    /// Retrieve an API key from the OS keychain
    Get { key: String },
    /// Remove a stored API key
    Delete { key: String },
}

#[derive(Subcommand)]
enum DbAction {
    /// Run pending migrations
    Migrate,
    /// Show current schema version
    Version,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Init structured logging
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            EnvFilter::new(cli.log_level.as_str())
        }))
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    let cfg = config::AppConfig::load(cli.config.as_deref())?;

    match cli.command {
        Commands::Serve { bind } => {
            tracing::info!("Starting OpenPika gateway on {}", bind);
            let db_pool = db::connect(&cfg.database_url).await?;
            db::migrate(&db_pool).await?;
            gateway::serve(bind, db_pool, cfg).await?;
        }

        Commands::Ui { bind, port, ui_dir } => {
            let ui_path = resolve_ui_dir(ui_dir)?;

            // Install node_modules if missing
            if !ui_path.join("node_modules").exists() {
                tracing::info!("Installing UI dependencies…");
                let status = std::process::Command::new("npm")
                    .args(["install", "--silent"])
                    .current_dir(&ui_path)
                    .status()
                    .context("npm install failed — is Node.js installed?")?;
                anyhow::ensure!(status.success(), "npm install exited with {}", status);
            }

            // Start backend in a background task
            let db_pool = db::connect(&cfg.database_url).await?;
            db::migrate(&db_pool).await?;
            let backend_cfg = cfg.clone();
            let backend_bind = bind.clone();
            let backend_pool = db_pool.clone();
            tokio::spawn(async move {
                if let Err(e) = gateway::serve(backend_bind, backend_pool, backend_cfg).await {
                    tracing::error!("Backend exited: {e}");
                }
            });

            // Wait until the backend is accepting connections
            let backend_addr = bind.replace("0.0.0.0", "127.0.0.1");
            wait_for_tcp(&backend_addr, 30).await;

            // Start the Next.js dev server
            eprintln!("\x1b[0;36mOpenPika\x1b[0m");
            eprintln!("  \x1b[0;32m▶\x1b[0m Backend  → http://{backend_addr}");
            eprintln!("  \x1b[0;32m▶\x1b[0m UI       → http://localhost:{port}");
            eprintln!("\nPress Ctrl+C to stop.\n");

            let mut ui_proc = tokio::process::Command::new("npm")
                .args(["run", "dev", "--", "-p", &port.to_string()])
                .current_dir(&ui_path)
                .spawn()
                .context("Failed to start Next.js dev server — is Node.js installed?")?;

            // Wait for Ctrl+C or the UI process to exit on its own
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {
                    eprintln!("\nShutting down…");
                    ui_proc.kill().await.ok();
                }
                status = ui_proc.wait() => {
                    if let Ok(s) = status {
                        tracing::info!("UI process exited: {s}");
                    }
                }
            }
        }

        Commands::Run { task } => {
            let db_pool = db::connect(&cfg.database_url).await?;
            db::migrate(&db_pool).await?;
            python::run_task(&task, &db_pool, &cfg).await?;
        }
        Commands::Login { provider } => {
            auth::login(provider.as_deref(), &cfg).await?;
        }
        Commands::Credentials { action } => match action {
            CredentialAction::Set { key, value } => {
                auth::keyring_set(&key, &value)?;
                println!("Stored '{key}' in system keychain.");
            }
            CredentialAction::Get { key } => {
                let v = auth::keyring_get(&key)?;
                println!("{v}");
            }
            CredentialAction::Delete { key } => {
                auth::keyring_delete(&key)?;
                println!("Deleted '{key}' from system keychain.");
            }
        },
        Commands::Db { action } => {
            let db_pool = db::connect(&cfg.database_url).await?;
            match action {
                DbAction::Migrate => {
                    db::migrate(&db_pool).await?;
                    println!("Migrations applied.");
                }
                DbAction::Version => {
                    let v = db::schema_version(&db_pool).await?;
                    println!("Schema version: {v}");
                }
            }
        }
    }

    Ok(())
}

/// Find the openpika-ui directory. Checks (in order):
///  1. Explicit --ui-dir flag
///  2. OPENPIKA_UI_DIR env var
///  3. Sibling of the binary's ancestor (handles target/release/openpika)
///  4. ./openpika-ui relative to CWD
fn resolve_ui_dir(explicit: Option<String>) -> Result<std::path::PathBuf> {
    if let Some(p) = explicit {
        let path = std::path::PathBuf::from(p);
        anyhow::ensure!(path.exists(), "UI directory not found: {}", path.display());
        return Ok(path);
    }

    if let Ok(env_path) = std::env::var("OPENPIKA_UI_DIR") {
        let path = std::path::PathBuf::from(env_path);
        anyhow::ensure!(path.exists(), "OPENPIKA_UI_DIR not found: {}", path.display());
        return Ok(path);
    }

    // Walk up from the binary to find a sibling openpika-ui/
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.as_path();
        while let Some(parent) = dir.parent() {
            let candidate = parent.join("openpika-ui");
            if candidate.join("package.json").exists() {
                return Ok(candidate);
            }
            dir = parent;
        }
    }

    // Fall back to CWD
    let cwd = std::env::current_dir()?.join("openpika-ui");
    anyhow::ensure!(
        cwd.join("package.json").exists(),
        "Could not find openpika-ui directory. Pass --ui-dir <path> or set OPENPIKA_UI_DIR."
    );
    Ok(cwd)
}

/// Poll a TCP address until it accepts connections or `timeout_secs` elapses.
async fn wait_for_tcp(addr: &str, timeout_secs: u64) {
    use tokio::net::TcpStream;
    use tokio::time::{sleep, Duration, Instant};

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if TcpStream::connect(addr).await.is_ok() {
            return;
        }
        sleep(Duration::from_millis(300)).await;
    }
    tracing::warn!("Backend did not become ready within {timeout_secs}s — UI will start anyway");
}
