mod config;
mod db;
mod gateway;
mod python;
mod auth;
mod tokenizer;
mod worker;

use anyhow::Result;
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
