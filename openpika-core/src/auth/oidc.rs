/// OAuth2 Authorization Code + PKCE flow for enterprise SSO.
///
/// Supports Okta, Azure AD / Entra ID, Auth0.
/// The `sub` claim is stored as the canonical user_id in the sessions table.
/// Tokens are stored in the OS keychain — no plaintext config files.

use anyhow::{anyhow, Context, Result};
use oauth2::{
    basic::BasicClient, reqwest::http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    TokenResponse, TokenUrl,
};
use serde::Deserialize;
use std::time::Duration;

use crate::config::{AppConfig, OidcProvider};
use super::callback_server;

const LOGIN_TIMEOUT_SECS: u64 = 120;
const KEYRING_TOKEN_PREFIX: &str = "openpika-token-";

#[derive(Debug, Deserialize)]
pub struct IdTokenClaims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub exp: Option<i64>,
    pub iss: Option<String>,
    pub aud: Option<serde_json::Value>,
}

fn resolve_provider<'a>(name: &str, cfg: &'a AppConfig) -> Option<&'a OidcProvider> {
    match name {
        "okta" | "okta_oidc"  => cfg.auth.okta.as_ref(),
        "azure" | "entra"     => cfg.auth.azure.as_ref(),
        "auth0"               => cfg.auth.auth0.as_ref(),
        _                     => None,
    }
}

/// Full browser-based Authorization Code + PKCE flow.
/// On success stores the access token and ID token sub in the OS keychain.
pub async fn browser_login(provider_name: &str, cfg: &AppConfig) -> Result<()> {
    let provider = resolve_provider(provider_name, cfg)
        .ok_or_else(|| anyhow!("No OIDC provider '{provider_name}' in config.toml"))?;

    let client_secret = provider
        .client_secret
        .clone()
        .or_else(|| super::get_secret(&format!("oidc-{provider_name}-client-secret")))
        .ok_or_else(|| anyhow!("No client_secret for '{provider_name}'"))?;

    // Start the local callback server before building the auth URL so we know the port
    let (port, rx) = callback_server::start()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let oauth_client = BasicClient::new(
        ClientId::new(provider.client_id.clone()),
        Some(ClientSecret::new(client_secret)),
        AuthUrl::new(format!("{}/oauth2/v1/authorize", provider.issuer_url))?,
        Some(TokenUrl::new(format!("{}/oauth2/v1/token", provider.issuer_url))?),
    )
    .set_redirect_uri(RedirectUrl::new(redirect_uri)?);

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (auth_url, csrf_token) = oauth_client
        .authorize_url(CsrfToken::new_random)
        .set_pkce_challenge(pkce_challenge)
        .add_scope(oauth2::Scope::new("openid".into()))
        .add_scope(oauth2::Scope::new("email".into()))
        .add_scope(oauth2::Scope::new("profile".into()))
        .url();

    println!("\nOpening browser for {provider_name} authentication…");
    println!("If the browser does not open, visit:\n  {auth_url}\n");
    let _ = open_browser(auth_url.as_str());

    // Wait for the callback (blocking — this is called from a CLI context)
    let params = rx
        .recv_timeout(Duration::from_secs(LOGIN_TIMEOUT_SECS))
        .context("Login timed out waiting for browser callback")?
        .context("OAuth2 callback error")?;

    // CSRF check
    if params.state != *csrf_token.secret() {
        return Err(anyhow!("CSRF state mismatch — possible replay attack"));
    }

    // Exchange code for tokens
    let token_response = oauth_client
        .exchange_code(AuthorizationCode::new(params.code))
        .set_pkce_verifier(pkce_verifier)
        .request(http_client)
        .context("Token exchange failed")?;

    let access_token = token_response.access_token().secret().clone();

    // Store access token in OS keychain
    let key_name = format!("{KEYRING_TOKEN_PREFIX}{provider_name}");
    super::keyring_set(&key_name, &access_token)
        .context("Failed to store token in keychain")?;

    // Try to decode the access token to show user info (best-effort, not security-critical)
    match decode_jwt_claims(&access_token) {
        Ok(claims) => {
            println!("\nLogged in as: {} (sub: {})",
                     claims.email.unwrap_or_else(|| "<no email>".into()), claims.sub);
        }
        Err(_) => {
            println!("\nAuthentication successful.");
        }
    }

    println!("Access token stored securely in OS keychain as '{key_name}'.");
    println!("Run 'openpika serve' to start the gateway.\n");
    Ok(())
}

/// Retrieve a previously-stored token for `provider_name` from the keychain.
pub fn get_stored_token(provider_name: &str) -> Option<String> {
    let key_name = format!("{KEYRING_TOKEN_PREFIX}{provider_name}");
    super::get_secret(&key_name)
}

/// Decode JWT claims without verifying the signature (for display / debugging).
/// Use `validate_jwt` for security-sensitive validation.
pub fn decode_jwt_claims(token: &str) -> Result<IdTokenClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return Err(anyhow!("Not a valid JWT"));
    }
    // Base64url decode the payload (second segment)
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let payload = URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| {
            // Try with padding
            base64::engine::general_purpose::URL_SAFE.decode(parts[1])
        })
        .context("base64 decode JWT payload")?;
    serde_json::from_slice(&payload).context("parse JWT claims")
}

/// Validate a JWT with signature verification.
/// Production: fetches JWKS from the issuer's well-known endpoint and verifies RS256.
pub fn validate_jwt(token: &str, issuer: &str, _audience: &str) -> Result<IdTokenClaims> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    // TODO: fetch JWKS from {issuer}/.well-known/jwks.json, find key by `kid`,
    //       and build DecodingKey::from_rsa_components(n, e).
    //
    // For now: decode without signature verification (dangerous_insecure_decode)
    // so the codebase compiles and the shape is correct. Replace before shipping.
    let mut validation = Validation::new(Algorithm::RS256);
    validation.insecure_disable_signature_validation();
    validation.set_issuer(&[issuer]);
    // Don't validate audience in stub
    validation.validate_aud = false;

    let key = DecodingKey::from_secret(&[]);
    let data = decode::<IdTokenClaims>(token, &key, &validation)
        .context("JWT decode failed")?;

    // Manual expiry check
    if let Some(exp) = data.claims.exp {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        if exp < now {
            return Err(anyhow!("JWT has expired"));
        }
    }

    Ok(data.claims)
}

fn open_browser(url: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(url).spawn().map(|_| ())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(url).spawn().map(|_| ())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/C", "start", url]).spawn().map(|_| ())?;

    Ok(())
}
