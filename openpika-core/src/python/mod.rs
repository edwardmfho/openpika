/// PyO3 bridge — calls the pydantic-ai Python agent from Rust.
///
/// The Python module exposes two clean entry points:
///   invoke_agent(session_id, messages_json, model, db_url, config_json) -> str
///   run_task(task, db_url, config_json) -> str
///
/// Both are synchronous on the Python side; we run them in a blocking thread
/// to avoid blocking the tokio event loop.

use anyhow::{Context, Result};
use pyo3::prelude::*;
use serde_json::Value;

use crate::{config::AppConfig, db::Pool};

/// Call the pydantic-ai agent and return its text reply.
pub async fn invoke_agent(
    session_id: &str,
    messages: &[Value],
    model: &str,
    _pool: &Pool,
    config: &AppConfig,
) -> Result<String> {
    let session_id = session_id.to_owned();
    let messages_json = serde_json::to_string(messages)?;
    let model = model.to_owned();
    let db_url = config.database_url.clone();
    let config_json = serde_json::to_string(config)?;

    // Run Python in a dedicated blocking thread (PyO3 requires the GIL).
    let reply = tokio::task::spawn_blocking(move || -> Result<String> {
        Python::with_gil(|py| {
            let agent_module = import_agent_module(py)?;
            let result = agent_module
                .call_method1(
                    "invoke_agent",
                    (
                        session_id.as_str(),
                        messages_json.as_str(),
                        model.as_str(),
                        db_url.as_str(),
                        config_json.as_str(),
                    ),
                )
                .context("Python invoke_agent raised an exception")?;
            result
                .extract::<String>()
                .context("invoke_agent did not return a str")
        })
    })
    .await
    .context("spawn_blocking panicked")??;

    Ok(reply)
}

/// Run a one-shot task string through the pydantic-ai agent.
pub async fn run_task(task: &str, pool: &Pool, config: &AppConfig) -> Result<()> {
    let messages = vec![serde_json::json!({"role": "user", "content": task})];
    let session_id = uuid::Uuid::new_v4().to_string();
    let reply = invoke_agent(&session_id, &messages, &config.default_model, pool, config).await?;
    println!("{reply}");
    Ok(())
}

fn import_agent_module(py: Python<'_>) -> Result<Bound<'_, PyModule>> {
    // Insert the openpika-python package onto sys.path if needed.
    // In production, the bundled distribution handles this; in dev the venv is activated.
    let sys = py.import("sys").context("Cannot import sys")?;
    let path_obj = sys.getattr("path").context("sys.path missing")?;
    let path = path_obj
        .downcast::<pyo3::types::PyList>()
        .map_err(|_| anyhow::anyhow!("sys.path is not a list"))?;

    // OPENPIKA_PYTHON_PATH may contain multiple colon-separated entries
    // (e.g. "src/openpika:venv/lib/python3.12/site-packages").
    // Insert each at position 0 in reverse order so the first entry ends up first.
    if let Ok(extra_path) = std::env::var("OPENPIKA_PYTHON_PATH") {
        let entries: Vec<&str> = extra_path.split(':').collect();
        for entry in entries.iter().rev() {
            if !entry.is_empty() {
                path.insert(0, *entry)?;
            }
        }
    }

    py.import("openpika.entrypoint")
        .context("Cannot import openpika.entrypoint — ensure the Python package is installed")
}
