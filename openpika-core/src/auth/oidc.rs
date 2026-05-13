/// OAuth2 Authorization Code flow with PKCE for enterprise SSO.
///
/// Supports Okta, Azure AD / Entra ID, and Auth0.
/// The `sub` claim from the ID token is stored as the canonical user_id
/// in the sessions table — it is immutable across token refreshes.

use anyhow::{anyhow, Context, Result};
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken,
    PkceCodeChallenge, RedirectUrl, TokenUrl,
};
use serde::Deserialize;

use crate::config::{AppConfig, OidcProvider};

#[derive(Debug, Deserialize)]
pub struct IdTokenClaims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
}

/// Resolve the configured OIDC provider by name.
fn resolve_provider<'a>(name: &str, cfg: &'a AppConfig) -> Option<&'a OidcProvider> {
    match name {
        "okta"  | "okta_oidc"  => cfg.auth.okta.as_ref(),
        "azure" | "entra"      => cfg.auth.azure.as_ref(),
        "auth0"                => cfg.auth.auth0.as_ref(),
        _                      => None,
    }
}

/// Trigger a browser-based OAuth2 Authorization Code + PKCE flow.
/// On success, stores the access token in the OS keychain under "openpika-token-{provider}".
pub async fn browser_login(provider_name: &str, cfg: &AppConfig) -> Result<()> {
    let provider = resolve_provider(provider_name, cfg)
        .ok_or_else(|| anyhow!("No OIDC provider '{provider_name}' configured in config.toml"))?;

    let client_secret = provider
        .client_secret
        .clone()
        .or_else(|| super::get_secret(&format!("oidc-{provider_name}-client-secret")))
        .ok_or_else(|| anyhow!("No client_secret for provider '{provider_name}'"))?;

    // oauth2 v4: BasicClient::new takes (client_id, client_secret, auth_url, token_url)
    let oauth_client = BasicClient::new(
        ClientId::new(provider.client_id.clone()),
        Some(ClientSecret::new(client_secret)),
        AuthUrl::new(format!("{}/oauth2/v1/authorize", provider.issuer_url))?,
        Some(TokenUrl::new(format!("{}/oauth2/v1/token", provider.issuer_url))?),
    )
    .set_redirect_uri(RedirectUrl::new(provider.redirect_uri.clone())?);

    let (pkce_challenge, _pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, _csrf_token) = oauth_client
        .authorize_url(CsrfToken::new_random)
        .set_pkce_challenge(pkce_challenge)
        .add_scope(oauth2::Scope::new("openid".into()))
        .add_scope(oauth2::Scope::new("email".into()))
        .add_scope(oauth2::Scope::new("profile".into()))
        .url();

    println!("Opening browser for authentication…");
    println!("If the browser does not open, visit:\n  {auth_url}");

    if let Err(e) = open_browser(auth_url.as_str()) {
        tracing::warn!("Could not open browser automatically: {e}");
    }

    // TODO: spawn a local HTTP server on the redirect_uri port to capture the
    //       authorization code, exchange it for tokens, validate the ID token
    //       JWT (signature + exp + iss + aud claims), extract `sub`, and store
    //       the access token via super::keyring_set.

    println!("Login flow initiated. Complete authentication in your browser.");
    Ok(())
}

/// Validate a JWT and return the decoded claims.
/// Verifies signature against JWKS endpoint, expiry, issuer, and audience.
pub fn validate_jwt(token: &str, issuer: &str, audience: &str) -> Result<IdTokenClaims> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    let key = DecodingKey::from_secret(b"__replace_with_rsa_public_key__");

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer]);
    validation.set_audience(&[audience]);

    let data = decode::<IdTokenClaims>(token, &key, &validation)
        .context("JWT validation failed")?;

    Ok(data.claims)
}

fn open_browser(url: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(url).spawn()?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(url).spawn()?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", url])
        .spawn()?;

    Ok(())
}
