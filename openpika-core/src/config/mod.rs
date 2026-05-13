use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppConfig {
    /// SQLite path or postgres:// / mysql:// URL
    #[serde(default = "default_database_url")]
    pub database_url: String,

    /// Python interpreter for pydantic-ai agent
    #[serde(default = "default_python_path")]
    pub python_path: String,

    /// Default LLM model ID
    #[serde(default = "default_model")]
    pub default_model: String,

    /// Gateway configuration
    #[serde(default)]
    pub gateway: GatewayConfig,

    /// OIDC / OAuth2 providers
    #[serde(default)]
    pub auth: AuthConfig,

    /// Context window limits
    #[serde(default)]
    pub context: ContextConfig,

    /// Encrypt sensitive DB fields at rest using AES-256-GCM.
    /// Key is stored in the OS keychain (keyring crate).
    #[serde(default)]
    pub encrypt_at_rest: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct GatewayConfig {
    #[serde(default = "default_bind")]
    pub bind: String,
    /// CORS allowed origins (empty = deny all cross-origin)
    #[serde(default)]
    pub cors_origins: Vec<String>,
    /// Shared webhook signing secret
    pub webhook_secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct AuthConfig {
    pub okta: Option<OidcProvider>,
    pub azure: Option<OidcProvider>,
    pub auth0: Option<OidcProvider>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OidcProvider {
    pub client_id: String,
    pub client_secret: Option<String>,  // None → use keyring
    pub issuer_url: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ContextConfig {
    /// Hard cap before Rust tokenizer rejects the payload
    #[serde(default = "default_max_tokens")]
    pub max_input_tokens: usize,
    /// Number of raw turns kept before rolling summarization kicks in
    #[serde(default = "default_raw_turns")]
    pub raw_turns_kept: usize,
    /// Top-k tools forwarded to pydantic-ai after RAG selection
    #[serde(default = "default_top_k_tools")]
    pub top_k_tools: usize,
}

impl Default for ContextConfig {
    fn default() -> Self {
        Self {
            max_input_tokens: default_max_tokens(),
            raw_turns_kept: default_raw_turns(),
            top_k_tools: default_top_k_tools(),
        }
    }
}

fn default_database_url() -> String {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    format!("sqlite://{}/.openpika/state.db", home.display())
}
fn default_python_path() -> String  { "python3".into() }
fn default_model() -> String        { "claude-sonnet-4-6".into() }
fn default_bind() -> String         { "0.0.0.0:8080".into() }
fn default_max_tokens() -> usize    { 100_000 }
fn default_raw_turns() -> usize     { 3 }
fn default_top_k_tools() -> usize   { 3 }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            database_url: default_database_url(),
            python_path: default_python_path(),
            default_model: default_model(),
            gateway: GatewayConfig::default(),
            auth: AuthConfig::default(),
            context: ContextConfig::default(),
            encrypt_at_rest: false,
        }
    }
}

impl AppConfig {
    pub fn load(path: Option<&str>) -> Result<Self> {
        let config_path = match path {
            Some(p) => PathBuf::from(p),
            None => {
                let home = dirs::home_dir().context("Cannot resolve home directory")?;
                home.join(".openpika").join("config.toml")
            }
        };

        let mut builder = config::Config::builder();

        if config_path.exists() {
            builder = builder.add_source(config::File::with_name(
                config_path.to_str().context("Non-UTF8 config path")?,
            ));
        }

        // Environment variable overrides: OPENPIKA_DATABASE_URL, etc.
        builder = builder.add_source(
            config::Environment::with_prefix("OPENPIKA").separator("__"),
        );

        // Allow bare DATABASE_URL for 12-factor app compatibility
        if let Ok(url) = std::env::var("DATABASE_URL") {
            builder = builder.set_override("database_url", url)?;
        }

        let cfg: AppConfig = builder
            .build()?
            .try_deserialize()
            .context("Failed to parse config")?;

        Ok(cfg)
    }
}
