/// Rolling summarization worker (Phase 5).
///
/// Runs as a background tokio task.  Every `interval` seconds it scans
/// sessions whose message count exceeds `raw_turns_kept + BATCH_THRESHOLD`
/// and asks the Python brain to compress older turns into a single `summary`
/// message block.  The raw turns older than `raw_turns_kept` are then replaced
/// with that summary in the DB.

use crate::{config::AppConfig, db::{queries, Pool}};
use std::{sync::Arc, time::Duration};

const BATCH_THRESHOLD: i64 = 5;

pub fn start_summarization_worker(
    pool: Pool,
    config: Arc<AppConfig>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let interval  = Duration::from_secs(60);
        let raw_turns = config.context.raw_turns_kept as i64;

        loop {
            tokio::time::sleep(interval).await;

            let sessions = match queries::list_sessions(&pool, None, 500).await {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!("Summarizer: list_sessions failed: {e}");
                    continue;
                }
            };

            for session in sessions {
                let count = match queries::message_count(&pool, &session.id).await {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                if count > raw_turns + BATCH_THRESHOLD {
                    tracing::debug!(
                        session_id = %session.id,
                        count,
                        "Triggering rolling summarization"
                    );
                    if let Err(e) = summarize_session(&pool, &session.id, raw_turns, &config).await {
                        tracing::error!(session_id = %session.id, "Summarization failed: {e}");
                    }
                }
            }
        }
    })
}

async fn summarize_session(
    pool: &Pool,
    session_id: &str,
    raw_turns_kept: i64,
    config: &AppConfig,
) -> anyhow::Result<()> {
    use crate::python;

    // Fetch messages older than the raw window
    let all_messages = queries::get_messages(pool, session_id).await?;
    let total = all_messages.len() as i64;
    let to_compress = (total - raw_turns_kept).max(0) as usize;

    if to_compress == 0 {
        return Ok(());
    }

    let old_messages = &all_messages[..to_compress];
    let compress_json = serde_json::to_string(old_messages)?;

    // Ask the Python brain for a dense summary
    let summary_prompt = format!(
        "Summarize the following conversation turns into a single dense paragraph \
         preserving all key decisions, facts, and context. Do not add commentary.\n\n{compress_json}"
    );
    let summary_messages = vec![serde_json::json!({"role": "user", "content": summary_prompt})];
    let fake_session = format!("summarize-{session_id}");

    let summary_text = python::invoke_agent(
        &fake_session,
        &summary_messages,
        &config.default_model,
        pool,
        config,
    )
    .await?;

    // Replace old turns with a single summary message
    // TODO: wrap in a transaction once sqlx transactions stabilize across Any pool
    for msg in old_messages {
        sqlx::query("DELETE FROM messages WHERE id = ?")
            .bind(&msg.id)
            .execute(pool)
            .await?;
    }

    let summary_msg = crate::db::models::Message::new(
        session_id,
        "summary",
        summary_text,
        None,
    );
    queries::insert_message(pool, &summary_msg).await?;

    tracing::info!(
        session_id,
        compressed = to_compress,
        "Rolling summarization complete"
    );

    Ok(())
}
