/// Rust-native cosine similarity for tool RAG selection (Phase 5).
///
/// Embeddings are stored as packed f32 bytes in the DB.
/// The hot loop (compare all tools) runs in Rust before pydantic-ai sees the request.

use nalgebra::DVector;

/// Deserialize a packed f32 little-endian byte blob into a vector.
pub fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

/// Serialize a float vector to packed f32 LE bytes for DB storage.
pub fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Cosine similarity in [0, 1]. Returns 0.0 if either vector is zero.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let va = DVector::from_column_slice(a);
    let vb = DVector::from_column_slice(b);
    let dot = va.dot(&vb);
    let norm_a = va.norm();
    let norm_b = vb.norm();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    (dot / (norm_a * norm_b)).clamp(0.0, 1.0)
}

/// Given a query embedding and a list of (tool_name, tool_embedding) pairs,
/// return the top-k tool names sorted by descending similarity.
pub fn top_k_tools(
    query: &[f32],
    tools: &[(String, Vec<f32>)],
    k: usize,
) -> Vec<String> {
    let mut scores: Vec<(&str, f32)> = tools
        .iter()
        .map(|(name, emb)| (name.as_str(), cosine_similarity(query, emb)))
        .collect();

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scores.truncate(k);
    scores.into_iter().map(|(name, _)| name.to_owned()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_score_one() {
        let v = vec![1.0_f32, 0.5, 0.25];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn orthogonal_vectors_score_zero() {
        let a = vec![1.0_f32, 0.0, 0.0];
        let b = vec![0.0_f32, 1.0, 0.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-5);
    }

    #[test]
    fn top_k_returns_correct_order() {
        let query = vec![1.0_f32, 0.0];
        let tools = vec![
            ("tool_b".to_owned(), vec![0.0_f32, 1.0]),
            ("tool_a".to_owned(), vec![1.0_f32, 0.0]),
            ("tool_c".to_owned(), vec![0.7_f32, 0.7]),
        ];
        let top = top_k_tools(&query, &tools, 2);
        assert_eq!(top[0], "tool_a");
    }
}
