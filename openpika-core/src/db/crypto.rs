/// Application-level AES-256-GCM encryption for sensitive DB fields.
///
/// SQLx doesn't support sqlcipher natively, so we encrypt fields before
/// they reach the DB layer. The 256-bit key is stored in the OS keychain
/// (keyring crate). On first run, a random key is generated and persisted.
///
/// Ciphertext format:   [ 12-byte nonce ][ GCM ciphertext + 16-byte tag ]
/// All stored as base64url (no padding) so the DB column stays TEXT.

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

const KEYRING_SERVICE: &str = "openpika";
const KEYRING_ENCRYPTION_KEY: &str = "db-encryption-key";

/// Load or create the AES-256 key stored in the OS keychain.
pub fn load_or_create_key() -> Result<[u8; 32]> {
    use keyring::Entry;

    let entry =
        Entry::new(KEYRING_SERVICE, KEYRING_ENCRYPTION_KEY).context("keyring entry")?;

    match entry.get_password() {
        Ok(b64) if !b64.is_empty() => {
            let raw = URL_SAFE_NO_PAD
                .decode(&b64)
                .context("decode stored encryption key")?;
            raw.try_into()
                .map_err(|_| anyhow::anyhow!("Stored key is not 32 bytes"))
        }
        _ => {
            // Generate fresh key and persist it
            let key = Aes256Gcm::generate_key(OsRng);
            let b64 = URL_SAFE_NO_PAD.encode(key.as_slice());
            entry.set_password(&b64).context("store encryption key in keychain")?;
            tracing::info!("Generated new AES-256 DB encryption key stored in OS keychain");
            Ok(key.into())
        }
    }
}

/// Encrypt a plaintext string. Returns base64url-encoded `nonce || ciphertext`.
pub fn encrypt(plaintext: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("AES-GCM encrypt error: {e}"))?;

    // Prepend 12-byte nonce to ciphertext
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(URL_SAFE_NO_PAD.encode(&combined))
}

/// Decrypt a base64url-encoded `nonce || ciphertext` string.
pub fn decrypt(encoded: &str, key_bytes: &[u8; 32]) -> Result<String> {
    let combined = URL_SAFE_NO_PAD
        .decode(encoded)
        .context("base64 decode ciphertext")?;

    anyhow::ensure!(combined.len() > 12, "Ciphertext too short");

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);

    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("AES-GCM decrypt error: {e}"))?;

    String::from_utf8(plaintext_bytes).context("decrypt: invalid UTF-8")
}

/// A helper that transparently encrypts/decrypts only when a key is present.
/// Pass `None` to disable encryption (e.g. when `encrypt_at_rest = false`).
pub struct FieldCipher {
    key: Option<[u8; 32]>,
}

impl FieldCipher {
    pub fn new(key: Option<[u8; 32]>) -> Self {
        Self { key }
    }

    /// Load from keychain if `enabled`, otherwise return a no-op cipher.
    pub fn from_config(enabled: bool) -> Result<Self> {
        if enabled {
            let key = load_or_create_key()?;
            Ok(Self { key: Some(key) })
        } else {
            Ok(Self { key: None })
        }
    }

    pub fn seal(&self, plaintext: &str) -> Result<String> {
        match &self.key {
            Some(k) => encrypt(plaintext, k),
            None => Ok(plaintext.to_owned()),
        }
    }

    pub fn open(&self, value: &str) -> Result<String> {
        match &self.key {
            Some(k) => decrypt(value, k),
            None => Ok(value.to_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; 32] {
        [0x42u8; 32]
    }

    #[test]
    fn roundtrip() {
        let key = test_key();
        let ct = encrypt("hello world", &key).unwrap();
        let pt = decrypt(&ct, &key).unwrap();
        assert_eq!(pt, "hello world");
    }

    #[test]
    fn different_nonces_each_call() {
        let key = test_key();
        let ct1 = encrypt("same", &key).unwrap();
        let ct2 = encrypt("same", &key).unwrap();
        assert_ne!(ct1, ct2, "GCM nonces must be unique");
    }

    #[test]
    fn wrong_key_fails() {
        let key = test_key();
        let ct = encrypt("secret", &key).unwrap();
        let wrong = [0x00u8; 32];
        assert!(decrypt(&ct, &wrong).is_err());
    }

    #[test]
    fn field_cipher_passthrough_when_disabled() {
        let c = FieldCipher::new(None);
        assert_eq!(c.seal("x").unwrap(), "x");
        assert_eq!(c.open("x").unwrap(), "x");
    }
}
