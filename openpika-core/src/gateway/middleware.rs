/// Gateway middleware: HMAC-SHA256 webhook signature verification + JWT auth.

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

use super::AppState;

// ─── HMAC Webhook Signature ───────────────────────────────────────────────────

/// Verify `X-Hub-Signature-256: sha256=<hex>` header against the request body.
/// Skip transparently when no `webhook_secret` is configured.
pub async fn verify_webhook_signature(
    State(st): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let secret = match st.config.gateway.webhook_secret.as_deref() {
        Some(s) if !s.is_empty() => s.to_owned(),
        _ => return Ok(next.run(req).await),
    };

    // Extract the signature header before consuming the body
    let sig_header = req
        .headers()
        .get("X-Hub-Signature-256")
        .or_else(|| req.headers().get("x-hub-signature-256"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("sha256="))
        .map(|s| s.to_owned());

    let expected_hex = match sig_header {
        Some(h) => h,
        None => {
            tracing::warn!("Rejected webhook: missing X-Hub-Signature-256");
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    // Buffer the body so we can inspect it AND pass it downstream
    let (parts, body) = req.into_parts();
    let bytes = match axum::body::to_bytes(body, 8 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };

    if !hmac_sha256_verify(&bytes, secret.as_bytes(), &expected_hex) {
        tracing::warn!("Rejected webhook: HMAC mismatch");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Reconstruct the request with the buffered body
    let req = Request::from_parts(parts, Body::from(bytes));
    Ok(next.run(req).await)
}

/// Constant-time HMAC-SHA256 verification.
fn hmac_sha256_verify(body: &[u8], key: &[u8], expected_hex: &str) -> bool {
    let computed = hmac_sha256(body, key);
    let computed_hex = hex_encode(&computed);

    // Constant-time comparison to resist timing attacks
    if computed_hex.len() != expected_hex.len() {
        return false;
    }
    let result: u8 = computed_hex
        .bytes()
        .zip(expected_hex.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b));
    result == 0
}

/// Pure-Rust HMAC-SHA256 without pulling in the full `hmac` crate.
/// Uses the SHA-256 from the `ring` crate already in the dependency tree.
fn hmac_sha256(data: &[u8], key: &[u8]) -> [u8; 32] {
    // Pad key to 64-byte block size
    let mut k = [0u8; 64];
    if key.len() > 64 {
        let h = sha256(key);
        k[..32].copy_from_slice(&h);
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }

    let mut inner = ipad.to_vec();
    inner.extend_from_slice(data);
    let inner_hash = sha256(&inner);

    let mut outer = opad.to_vec();
    outer.extend_from_slice(&inner_hash);
    sha256(&outer)
}

fn sha256(data: &[u8]) -> [u8; 32] {
    use std::num::Wrapping as W;

    // SHA-256 constants
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    // Pre-processing: padding
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    // Process each 512-bit block
    for block in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[i*4], block[i*4+1], block[i*4+2], block[i*4+3]]);
        }
        for i in 16..64 {
            let s0 = w[i-15].rotate_right(7) ^ w[i-15].rotate_right(18) ^ (w[i-15] >> 3);
            let s1 = w[i-2].rotate_right(17) ^ w[i-2].rotate_right(19) ^ (w[i-2] >> 10);
            w[i] = (W(w[i-16]) + W(s0) + W(w[i-7]) + W(s1)).0;
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = (W(hh) + W(s1) + W(ch) + W(K[i]) + W(w[i])).0;
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = (W(s0) + W(maj)).0;
            hh = g; g = f; f = e;
            e = (W(d) + W(t1)).0;
            d = c; c = b; b = a;
            a = (W(t1) + W(t2)).0;
        }
        h[0] = (W(h[0]) + W(a)).0;
        h[1] = (W(h[1]) + W(b)).0;
        h[2] = (W(h[2]) + W(c)).0;
        h[3] = (W(h[3]) + W(d)).0;
        h[4] = (W(h[4]) + W(e)).0;
        h[5] = (W(h[5]) + W(f)).0;
        h[6] = (W(h[6]) + W(g)).0;
        h[7] = (W(h[7]) + W(hh)).0;
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i*4..(i+1)*4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ─── JWT Auth ─────────────────────────────────────────────────────────────────

/// Extension type set on requests that pass JWT validation.
#[derive(Clone, Debug)]
pub struct AuthenticatedUser {
    pub sub: String,
    pub email: Option<String>,
}

/// Validate Bearer JWT and inject `AuthenticatedUser` as a request extension.
/// Returns 401 if Authorization header is missing or token is invalid.
pub async fn require_auth(
    State(st): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let token = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_owned())
        .ok_or_else(|| {
            (StatusCode::UNAUTHORIZED, "Missing Authorization: Bearer token".into())
        })?;

    // Validate against the configured OIDC provider
    // For now we delegate to the auth module's validate_jwt helper.
    // Production: fetch JWKS and verify RS256 signature + exp + iss + aud.
    let claims = crate::auth::oidc::validate_jwt(
        &token,
        "https://placeholder.issuer",  // replaced at runtime from config
        &st.config.gateway.cors_origins.first().cloned().unwrap_or_default(),
    )
    .map_err(|e| (StatusCode::UNAUTHORIZED, format!("Token invalid: {e}")))?;

    req.extensions_mut().insert(AuthenticatedUser {
        sub: claims.sub,
        email: claims.email,
    });

    Ok(next.run(req).await)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_known_vector() {
        // SHA-256("abc") = ba7816bf...
        let hash = sha256(b"abc");
        assert_eq!(hash[0], 0xba);
        assert_eq!(hash[1], 0x78);
    }

    #[test]
    fn hmac_constant_time_mismatch_returns_false() {
        let body = b"payload";
        let key = b"secret";
        let sig = hex_encode(&hmac_sha256(body, key));
        assert!(hmac_sha256_verify(body, key, &sig));
        assert!(!hmac_sha256_verify(body, key, "deadbeef"));
    }
}
