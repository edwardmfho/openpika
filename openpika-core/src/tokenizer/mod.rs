pub mod rag;

use tiktoken_rs::get_bpe_from_model;

/// Count tokens for a text string using the model's BPE tokenizer.
/// Falls back to a character-based approximation for unknown models.
pub fn count_tokens(text: &str, model: &str) -> usize {
    // Map Anthropic/OpenAI model IDs to tiktoken model names
    let tiktoken_model = map_model_to_tiktoken(model);

    match get_bpe_from_model(tiktoken_model) {
        Ok(bpe)  => bpe.encode_with_special_tokens(text).len(),
        Err(_)   => estimate_tokens_heuristic(text),
    }
}

/// Chunk a document into segments that each fit within `max_tokens`.
/// Returns chunks with their token counts.
pub fn chunk_document(text: &str, max_tokens: usize, model: &str) -> Vec<(String, usize)> {
    let tiktoken_model = map_model_to_tiktoken(model);

    let bpe = match get_bpe_from_model(tiktoken_model) {
        Ok(bpe) => bpe,
        Err(_)  => {
            // Heuristic chunking at ~4 chars/token
            let chunk_chars = max_tokens * 4;
            return text
                .chars()
                .collect::<Vec<_>>()
                .chunks(chunk_chars)
                .map(|c| {
                    let s: String = c.iter().collect();
                    let t = estimate_tokens_heuristic(&s);
                    (s, t)
                })
                .collect();
        }
    };

    let tokens = bpe.encode_with_special_tokens(text);
    let mut chunks = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        let end = (i + max_tokens).min(tokens.len());
        let chunk_tokens = &tokens[i..end];
        let chunk_text = bpe.decode(chunk_tokens.to_vec()).unwrap_or_default();
        let count = chunk_tokens.len();
        chunks.push((chunk_text, count));
        i = end;
    }

    chunks
}

/// Enforce context window: truncate messages to fit within `limit` tokens.
/// Preserves the system message and the most-recent turns.
pub fn truncate_messages_to_fit(
    messages: &[serde_json::Value],
    limit: usize,
    model: &str,
) -> Vec<serde_json::Value> {
    let system_messages: Vec<_> = messages
        .iter()
        .filter(|m| m.get("role").and_then(|r| r.as_str()) == Some("system"))
        .cloned()
        .collect();

    let non_system: Vec<_> = messages
        .iter()
        .filter(|m| m.get("role").and_then(|r| r.as_str()) != Some("system"))
        .cloned()
        .collect();

    let system_tokens: usize = system_messages
        .iter()
        .map(|m| count_tokens(&m.to_string(), model))
        .sum();

    let mut budget = limit.saturating_sub(system_tokens);
    let mut result = system_messages;

    // Walk non-system messages from newest to oldest, fill budget
    let mut included: Vec<serde_json::Value> = Vec::new();
    for msg in non_system.iter().rev() {
        let t = count_tokens(&msg.to_string(), model);
        if t <= budget {
            included.push(msg.clone());
            budget -= t;
        } else {
            break;
        }
    }

    included.reverse();
    result.extend(included);
    result
}

fn map_model_to_tiktoken(model: &str) -> &str {
    if model.contains("gpt-4o") {
        return "gpt-4o";
    }
    if model.contains("gpt-4") {
        return "gpt-4";
    }
    if model.contains("gpt-3.5") {
        return "gpt-3.5-turbo";
    }
    // Anthropic models — use cl100k_base (same tokenizer family)
    if model.contains("claude") {
        return "gpt-4";
    }
    "gpt-4"
}

fn estimate_tokens_heuristic(text: &str) -> usize {
    // ~4 chars per token is the standard rough estimate
    (text.len() + 3) / 4
}
