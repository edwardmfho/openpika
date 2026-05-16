/// OAuth2 Authorization Code + PKCE flow for enterprise SSO.
///
/// Supports Okta, Azure AD / Entra ID, Auth0.
/// The `sub` claim is stored as the canonical user_id in the sessions table.
/// Tokens are stored in the OS keychain — no plaintext config files.
///
/// JWT validation fetches JWKS from the issuer's well-known endpoint and
/// verifies the RS256 signature. Keys are cached for 1 hour.

use std::{
    collections::HashMap,
    sync::OnceLock,
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use oauth2::{
    basic::BasicClient, reqwest::http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl, TokenResponse, TokenUrl,
};
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::config::{AppConfig, OidcProvider};
use super::callback_server;

const LOGIN_TIMEOUT_SECS: u64 = 120;
const KEYRING_TOKEN_PREFIX: &str = "openpika-token-";
const JWKS_TTL: Duration = Duration::from_secs(3600);

// ─── JWKS Cache ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
struct Jwk {
    kty: String,
    #[serde(default)]
    n: Option<String>,
    #[serde(default)]
    e: Option<String>,
    #[serde(default)]
    kid: Option<String>,
    #[serde(default)]
    alg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JwkSet {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
struct OidcDiscovery {
    jwks_uri: String,
}

static JWKS_CACHE: OnceLock<RwLock<HashMap<String, (Vec<Jwk>, Instant)>>> = OnceLock::new();

fn jwks_cache() -> &'static RwLock<HashMap<String, (Vec<Jwk>, Instant)>> {
    JWKS_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Fetch and cache JWKS keys for the given issuer.
/// Uses OpenID Discovery (`/.well-known/openid-configuration`) to resolve `jwks_uri`.
async fn fetch_jwks(issuer: &str) -> Result<Vec<Jwk>> {
    // Return cached keys if still fresh
    {
        let cache = jwks_cache().read().await;
        if let Some((keys, fetched_at)) = cache.get(issuer) {
            if fetched_at.elapsed() < JWKS_TTL {
                return Ok(keys.clone());
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("Failed to build HTTP client")?;

    let discovery_url = format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    );
    let discovery: OidcDiscovery = client
        .get(&discovery_url)
        .send()
        .await
        .context("Failed to reach OpenID discovery endpoint")?
        .error_for_status()
        .context("OpenID discovery returned error status")?
        .json()
        .await
        .context("Failed to parse OpenID discovery document")?;

    let jwks: JwkSet = client
        .get(&discovery.jwks_uri)
        .send()
        .await
        .context("Failed to reach JWKS endpoint")?
        .error_for_status()
        .context("JWKS endpoint returned error status")?
        .json()
        .await
        .context("Failed to parse JWKS response")?;

    let mut cache = jwks_cache().write().await;
    cache.insert(issuer.to_owned(), (jwks.keys.clone(), Instant::now()));

    Ok(jwks.keys)
}

// ─── Claims ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct IdTokenClaims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub exp: Option<i64>,
    pub iss: Option<String>,
    pub aud: Option<serde_json::Value>,
}

// ─── Provider resolution ──────────────────────────────────────────────────────

fn resolve_provider<'a>(name: &str, cfg: &'a AppConfig) -> Option<&'a OidcProvider> {
    match name {
        "okta" | "okta_oidc"  => cfg.auth.okta.as_ref(),
        "azure" | "entra"     => cfg.auth.azure.as_ref(),
        "auth0"               => cfg.auth.auth0.as_ref(),
        _                     => None,
    }
}

// ─── Browser login (PKCE) ─────────────────────────────────────────────────────

/// Full browser-based Authorization Code + PKCE flow.
/// On success stores the access token in the OS keychain.
pub async fn browser_login(provider_name: &str, cfg: &AppConfig) -> Result<()> {
    let provider = resolve_provider(provider_name, cfg)
        .ok_or_else(|| anyhow!("No OIDC provider '{provider_name}' in config.toml"))?;

    let client_secret = provider
        .client_secret
        .clone()
        .or_else(|| super::get_secret(&format!("oidc-{provider_name}-client-secret")))
        .ok_or_else(|| anyhow!("No client_secret for '{provider_name}'"))?;

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

    let params = rx
        .recv_timeout(std::time::Duration::from_secs(LOGIN_TIMEOUT_SECS))
        .context("Login timed out waiting for browser callback")?
        .context("OAuth2 callback error")?;

    if params.state != *csrf_token.secret() {
        return Err(anyhow!("CSRF state mismatch — possible replay attack"));
    }

    let token_response = oauth_client
        .exchange_code(AuthorizationCode::new(params.code))
        .set_pkce_verifier(pkce_verifier)
        .request(http_client)
        .context("Token exchange failed")?;

    let access_token = token_response.access_token().secret().clone();

    let key_name = format!("{KEYRING_TOKEN_PREFIX}{provider_name}");
    super::keyring_set(&key_name, &access_token)
        .context("Failed to store token in keychain")?;

    match decode_jwt_claims(&access_token) {
        Ok(claims) => {
            println!("\nLogged in as: {} (sub: {})",
                     claims.email.unwrap_or_else(|| "<no email>".into()), claims.sub);
        }
        Err(_) => println!("\nAuthentication successful."),
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

// ─── JWT helpers ──────────────────────────────────────────────────────────────

/// Decode JWT claims without signature verification (for display/debugging only).
/// Never use this for authorization decisions — use `validate_jwt` instead.
pub fn decode_jwt_claims(token: &str) -> Result<IdTokenClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return Err(anyhow!("Not a valid JWT"));
    }
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    let payload = URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(parts[1]))
        .context("base64 decode JWT payload")?;
    serde_json::from_slice(&payload).context("parse JWT claims")
}

/// Validate a JWT with full RS256 signature verification via JWKS.
///
/// Security model:
/// 1. The `iss` claim is extracted (unverified) and matched against `allowed_issuers`
///    to prevent SSRF to attacker-controlled JWKS endpoints.
/// 2. JWKS are fetched from `{matched_issuer}/.well-known/openid-configuration`
///    and cached for 1 hour.
/// 3. The JWT signature, issuer, expiry, and (if non-empty) audience are verified
///    using the fetched public key.
pub async fn validate_jwt(
    token: &str,
    allowed_issuers: &[String],
    audience: &str,
) -> Result<IdTokenClaims> {
    use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

    if allowed_issuers.is_empty() {
        return Err(anyhow!(
            "No OIDC providers configured — set [auth.okta], [auth.azure], or [auth.auth0] in config.toml"
        ));
    }

    // Decode header to get kid (key ID) — not security-sensitive
    let header = decode_header(token).context("JWT header decode failed")?;
    let kid = header.kid.as_deref().unwrap_or("");

    // Extract iss claim without verification (used only for JWKS routing)
    let unverified = decode_jwt_claims(token)?;
    let iss = unverified.iss.as_deref().unwrap_or("");

    // Whitelist: iss must match a configured provider to prevent SSRF
    let matched_issuer = allowed_issuers
        .iter()
        .find(|allowed| {
            let a = allowed.trim_end_matches('/');
            let i = iss.trim_end_matches('/');
            i == a || i.starts_with(a) || a.starts_with(i)
        })
        .ok_or_else(|| {
            anyhow!("JWT issuer '{}' is not in the configured allowed issuers list", iss)
        })?;

    // Fetch JWKS (cached)
    let keys = fetch_jwks(matched_issuer).await?;

    // Find matching key by kid; fall back to first RSA key
    let jwk = if kid.is_empty() {
        keys.iter().find(|k| k.kty == "RSA")
    } else {
        keys.iter()
            .find(|k| k.kid.as_deref() == Some(kid))
            .or_else(|| keys.iter().find(|k| k.kty == "RSA"))
    }
    .ok_or_else(|| anyhow!("No RSA JWK found for kid={}", kid))?;

    if jwk.kty != "RSA" {
        return Err(anyhow!("Unsupported JWK key type: {} (only RSA is supported)", jwk.kty));
    }

    let n = jwk.n.as_deref().ok_or_else(|| anyhow!("JWK missing 'n' modulus"))?;
    let e = jwk.e.as_deref().ok_or_else(|| anyhow!("JWK missing 'e' exponent"))?;

    let decoding_key = DecodingKey::from_rsa_components(n, e)
        .context("Failed to build RSA decoding key from JWKS")?;

    let alg = match jwk.alg.as_deref().unwrap_or("RS256") {
        "RS384" => Algorithm::RS384,
        "RS512" => Algorithm::RS512,
        _       => Algorithm::RS256,
    };

    let mut validation = Validation::new(alg);
    validation.set_issuer(allowed_issuers);
    if audience.is_empty() {
        validation.validate_aud = false;
    } else {
        validation.set_audience(&[audience]);
    }

    let data = decode::<IdTokenClaims>(token, &decoding_key, &validation)
        .context("JWT signature verification failed")?;

    Ok(data.claims)
}

// ─── Platform browser open ────────────────────────────────────────────────────

fn open_browser(url: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(url).spawn().map(|_| ())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(url).spawn().map(|_| ())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/C", "start", url]).spawn().map(|_| ())?;

    Ok(())
}
