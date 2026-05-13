pub mod callback_server;
pub mod oidc;

use anyhow::{Context, Result};
use keyring::Entry;

const KEYRING_SERVICE: &str = "openpika";

// ─── OS Keychain helpers ──────────────────────────────────────────────────────

pub fn keyring_set(key: &str, value: &str) -> Result<()> {
    Entry::new(KEYRING_SERVICE, key)
        .context("keyring entry")?
        .set_password(value)
        .context("keyring set_password")
}

pub fn keyring_get(key: &str) -> Result<String> {
    Entry::new(KEYRING_SERVICE, key)
        .context("keyring entry")?
        .get_password()
        .context("keyring get_password")
}

pub fn keyring_delete(key: &str) -> Result<()> {
    Entry::new(KEYRING_SERVICE, key)
        .context("keyring entry")?
        .delete_credential()
        .context("keyring delete_credential")
}

/// Retrieve a key from OS keychain, falling back to env var `{KEY_UPPER}`.
/// This eliminates plaintext YAML/TOML API key configs entirely.
pub fn get_secret(name: &str) -> Option<String> {
    // 1. Try OS keychain
    if let Ok(val) = keyring_get(name) {
        if !val.is_empty() {
            return Some(val);
        }
    }
    // 2. Fall back to environment variable
    let env_key = name.to_uppercase().replace('-', "_");
    std::env::var(&env_key).ok()
}

// ─── OIDC Login ───────────────────────────────────────────────────────────────

pub async fn login(provider: Option<&str>, config: &crate::config::AppConfig) -> Result<()> {
    let provider_name = provider.unwrap_or("default");
    tracing::info!("Initiating OIDC login via provider '{}'", provider_name);
    oidc::browser_login(provider_name, config).await
}
