/// Embedding generation for tool RAG (Phase 5).
///
/// Two strategies available via `EmbeddingBackend` enum:
///   1. `TfIdf`   — pure-Rust sparse TF-IDF vectors (no API calls, offline).
///                  Fast, good enough for O(100) tools.
///   2. `Api`     — calls an OpenAI-compatible `/v1/embeddings` endpoint
///                  (Anthropic Voyage, OpenAI text-embedding-3-small, etc.).
///                  Produces dense 1536-dim vectors for higher accuracy.
///
/// Generated embeddings are stored in the `tool_embeddings` table via
/// `db::queries::upsert_tool_embedding()` so cosine-sim lookups stay in Rust.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Public API ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum EmbeddingBackend {
    TfIdf,
    Api {
        endpoint: String,
        model: String,
        api_key: String,
    },
}

impl EmbeddingBackend {
    /// Resolve backend from config: use API if an embeddings key is available,
    /// fall back to TF-IDF otherwise.
    pub fn from_env() -> Self {
        let key = std::env::var("OPENPIKA_EMBEDDINGS_KEY")
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .unwrap_or_default();

        if key.is_empty() {
            tracing::debug!("No embeddings API key — using TF-IDF backend");
            return Self::TfIdf;
        }

        let endpoint = std::env::var("OPENPIKA_EMBEDDINGS_ENDPOINT")
            .unwrap_or_else(|_| "https://api.openai.com/v1/embeddings".into());

        let model = std::env::var("OPENPIKA_EMBEDDINGS_MODEL")
            .unwrap_or_else(|_| "text-embedding-3-small".into());

        Self::Api { endpoint, model, api_key: key }
    }

    /// Generate an embedding vector for a text string.
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        match self {
            Self::TfIdf => Ok(tfidf_embed(text, &DEFAULT_VOCABULARY)),
            Self::Api { endpoint, model, api_key } => {
                api_embed(text, endpoint, model, api_key).await
            }
        }
    }

    /// Generate embeddings for multiple texts (batched for API backend).
    pub async fn embed_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        match self {
            Self::TfIdf => Ok(texts.iter().map(|t| tfidf_embed(t, &DEFAULT_VOCABULARY)).collect()),
            Self::Api { endpoint, model, api_key } => {
                api_embed_batch(texts, endpoint, model, api_key).await
            }
        }
    }
}

// ─── TF-IDF Backend ──────────────────────────────────────────────────────────

/// A fixed vocabulary of ~200 software/tool-domain tokens.
/// In production, build the vocabulary from the actual tool corpus.
static DEFAULT_VOCABULARY: std::sync::LazyLock<Vec<String>> =
    std::sync::LazyLock::new(build_default_vocabulary);

fn build_default_vocabulary() -> Vec<String> {
    let words = [
        // Web / search
        "web", "search", "fetch", "http", "url", "html", "browse", "navigate",
        "request", "response", "api", "endpoint", "crawl", "extract",
        // File / IO
        "file", "read", "write", "path", "directory", "folder", "create",
        "delete", "copy", "move", "rename", "list", "find", "glob",
        // Terminal / process
        "terminal", "shell", "command", "execute", "run", "process", "pid",
        "stdout", "stderr", "exit", "bash", "script",
        // Code / dev
        "code", "python", "rust", "javascript", "function", "class", "method",
        "module", "package", "import", "compile", "test", "debug", "lint",
        // Memory / data
        "memory", "store", "save", "load", "cache", "database", "sql",
        "insert", "select", "update", "query",
        // Images / vision
        "image", "vision", "analyze", "generate", "screenshot", "photo",
        "pixel", "resize", "convert",
        // Planning / tasks
        "todo", "task", "plan", "schedule", "reminder", "note", "list",
        "priority", "complete", "done",
        // Communication
        "message", "send", "email", "notification", "alert", "telegram",
        "discord", "slack",
        // AI / LLM
        "llm", "model", "prompt", "token", "context", "embedding", "agent",
        "tool", "skill", "delegate", "summarize", "compress",
        // Auth / security
        "auth", "login", "oauth", "token", "credential", "key", "secret",
        "encrypt", "decrypt",
    ];
    words.iter().map(|s| s.to_string()).collect()
}

/// Sparse TF-IDF bag-of-words embedding. Returns a unit-norm float vector.
fn tfidf_embed(text: &str, vocab: &[String]) -> Vec<f32> {
    let tokens = tokenize(text);
    let total = tokens.len().max(1) as f32;

    // Term frequency
    let mut tf: HashMap<&str, f32> = HashMap::new();
    for t in &tokens {
        *tf.entry(t.as_str()).or_insert(0.0) += 1.0 / total;
    }

    let mut vec: Vec<f32> = vocab
        .iter()
        .map(|term| *tf.get(term.as_str()).unwrap_or(&0.0))
        .collect();

    // L2 normalize
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        vec.iter_mut().for_each(|x| *x /= norm);
    }
    vec
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 2)
        .map(|s| s.to_owned())
        .collect()
}

// ─── API Backend ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a str,
}

#[derive(Deserialize)]
struct EmbedResponse {
    data: Vec<EmbedData>,
}

#[derive(Deserialize)]
struct EmbedData {
    embedding: Vec<f32>,
}

#[derive(Serialize)]
struct BatchEmbedRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

async fn api_embed(
    text: &str,
    endpoint: &str,
    model: &str,
    api_key: &str,
) -> Result<Vec<f32>> {
    let client = reqwest::Client::new();
    let resp: EmbedResponse = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&EmbedRequest { model, input: text })
        .send()
        .await
        .context("embeddings API request")?
        .error_for_status()
        .context("embeddings API error status")?
        .json()
        .await
        .context("embeddings API response parse")?;

    resp.data
        .into_iter()
        .next()
        .map(|d| d.embedding)
        .ok_or_else(|| anyhow::anyhow!("Empty embeddings response"))
}

async fn api_embed_batch(
    texts: &[String],
    endpoint: &str,
    model: &str,
    api_key: &str,
) -> Result<Vec<Vec<f32>>> {
    let client = reqwest::Client::new();
    let resp: EmbedResponse = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&BatchEmbedRequest { model, input: texts })
        .send()
        .await
        .context("batch embeddings request")?
        .error_for_status()
        .context("batch embeddings API error")?
        .json()
        .await
        .context("batch embeddings parse")?;

    Ok(resp.data.into_iter().map(|d| d.embedding).collect())
}

// ─── DB Integration ───────────────────────────────────────────────────────────

/// (Re)build all tool embeddings in the DB from a tool list.
/// Call this on first startup and when tools change.
pub async fn rebuild_tool_embeddings(
    tools: &[(String, String)],  // (name, description)
    pool: &crate::db::Pool,
    backend: &EmbeddingBackend,
) -> Result<()> {
    let descriptions: Vec<String> = tools.iter().map(|(_, d)| d.clone()).collect();
    let embeddings = backend.embed_batch(&descriptions).await?;

    for ((name, _), embedding) in tools.iter().zip(embeddings) {
        let bytes = crate::tokenizer::rag::embedding_to_bytes(&embedding);
        sqlx::query(
            "INSERT INTO tool_embeddings (name, description, embedding)
             VALUES (?, ?, ?)
             ON CONFLICT(name) DO UPDATE SET description=excluded.description, embedding=excluded.embedding",
        )
        .bind(name)
        .bind(&tools.iter().find(|(n, _)| n == name).map(|(_, d)| d).unwrap_or(name))
        .bind(bytes)
        .execute(pool)
        .await
        .with_context(|| format!("upsert embedding for '{name}'"))?;
    }

    tracing::info!("Rebuilt embeddings for {} tools", tools.len());
    Ok(())
}

/// Load all tool embeddings from DB for RAG lookup.
pub async fn load_tool_embeddings(
    pool: &crate::db::Pool,
) -> Result<Vec<(String, Vec<f32>)>> {
    let rows: Vec<crate::db::models::ToolEmbedding> =
        sqlx::query_as("SELECT name, description, embedding FROM tool_embeddings")
            .fetch_all(pool)
            .await
            .context("load_tool_embeddings")?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let emb = crate::tokenizer::rag::bytes_to_embedding(&r.embedding);
            (r.name, emb)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tfidf_produces_unit_norm() {
        let v = tfidf_embed("search the web for information", &DEFAULT_VOCABULARY);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5 || norm == 0.0);
    }

    #[test]
    fn tfidf_similarity_ordering() {
        let vocab = &DEFAULT_VOCABULARY;
        let web_query = tfidf_embed("web search browse navigate", vocab);
        let file_query = tfidf_embed("read write file directory", vocab);

        let web_tool = tfidf_embed("web search and extract content from urls", vocab);
        let file_tool = tfidf_embed("read and write files on the filesystem", vocab);

        let sim_ww = crate::tokenizer::rag::cosine_similarity(&web_query, &web_tool);
        let sim_wf = crate::tokenizer::rag::cosine_similarity(&web_query, &file_tool);
        let sim_fw = crate::tokenizer::rag::cosine_similarity(&file_query, &web_tool);
        let sim_ff = crate::tokenizer::rag::cosine_similarity(&file_query, &file_tool);

        // Same-domain similarity should be higher than cross-domain
        assert!(sim_ww >= sim_wf, "web query should prefer web tool");
        assert!(sim_ff >= sim_fw, "file query should prefer file tool");
    }
}
