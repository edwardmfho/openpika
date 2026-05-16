/// Outbound reply dispatcher — pure HTTP, no AI involved.
/// Sends the agent's text reply back to the originating platform.

use crate::config::AppConfig;
use anyhow::{bail, Result};
use serde_json::{json, Value};

// ─── Reply target extracted from the inbound webhook payload ─────────────────

#[derive(Debug, Clone)]
pub enum ReplyTarget {
    Telegram { chat_id: i64 },
    Discord  { channel_id: String },
    Slack    { channel: String, thread_ts: Option<String> },
    WhatsApp { to: String },
    Unknown,
}

/// Extract the reply destination from a platform-specific webhook body.
pub fn extract_reply_target(platform: &str, body: &Value) -> ReplyTarget {
    match platform {
        "telegram" => {
            let chat_id = body
                .pointer("/message/chat/id")
                .or_else(|| body.pointer("/callback_query/message/chat/id"))
                .and_then(Value::as_i64);
            match chat_id {
                Some(id) => ReplyTarget::Telegram { chat_id: id },
                None     => ReplyTarget::Unknown,
            }
        }
        "discord" => {
            let channel_id = body
                .pointer("/channel_id")
                .and_then(Value::as_str)
                .map(str::to_owned);
            match channel_id {
                Some(id) => ReplyTarget::Discord { channel_id: id },
                None     => ReplyTarget::Unknown,
            }
        }
        "slack" => {
            let channel = body
                .pointer("/event/channel")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let thread_ts = body
                .pointer("/event/thread_ts")
                .and_then(Value::as_str)
                .map(str::to_owned);
            match channel {
                Some(ch) => ReplyTarget::Slack { channel: ch, thread_ts },
                None     => ReplyTarget::Unknown,
            }
        }
        "whatsapp" => {
            let to = body
                .pointer("/entry/0/changes/0/value/messages/0/from")
                .and_then(Value::as_str)
                .map(str::to_owned);
            match to {
                Some(phone) => ReplyTarget::WhatsApp { to: phone },
                None        => ReplyTarget::Unknown,
            }
        }
        _ => ReplyTarget::Unknown,
    }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

pub async fn send_reply(target: &ReplyTarget, text: &str, config: &AppConfig) -> Result<()> {
    match target {
        ReplyTarget::Telegram { chat_id }            => send_telegram(*chat_id, text, config).await,
        ReplyTarget::Discord  { channel_id }         => send_discord(channel_id, text, config).await,
        ReplyTarget::Slack    { channel, thread_ts } => send_slack(channel, thread_ts.as_deref(), text, config).await,
        ReplyTarget::WhatsApp { to }                 => send_whatsapp(to, text, config).await,
        ReplyTarget::Unknown                         => Ok(()),
    }
}

// ─── Platform senders ─────────────────────────────────────────────────────────

async fn send_telegram(chat_id: i64, text: &str, config: &AppConfig) -> Result<()> {
    let token = config.messenger.telegram_bot_token.as_deref()
        .ok_or_else(|| anyhow::anyhow!("messenger.telegram_bot_token not configured"))?;

    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&json!({"chat_id": chat_id, "text": text}))
        .send()
        .await?;

    if !resp.status().is_success() {
        bail!("Telegram sendMessage failed: {}", resp.text().await.unwrap_or_default());
    }
    Ok(())
}

async fn send_discord(channel_id: &str, text: &str, config: &AppConfig) -> Result<()> {
    let token = config.messenger.discord_bot_token.as_deref()
        .ok_or_else(|| anyhow::anyhow!("messenger.discord_bot_token not configured"))?;

    let url = format!("https://discord.com/api/v10/channels/{channel_id}/messages");
    let resp = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bot {token}"))
        .json(&json!({"content": text}))
        .send()
        .await?;

    if !resp.status().is_success() {
        bail!("Discord message failed: {}", resp.text().await.unwrap_or_default());
    }
    Ok(())
}

async fn send_slack(channel: &str, thread_ts: Option<&str>, text: &str, config: &AppConfig) -> Result<()> {
    let token = config.messenger.slack_bot_token.as_deref()
        .ok_or_else(|| anyhow::anyhow!("messenger.slack_bot_token not configured"))?;

    let mut payload = json!({"channel": channel, "text": text});
    if let Some(ts) = thread_ts {
        payload["thread_ts"] = json!(ts);
    }

    let body: Value = reqwest::Client::new()
        .post("https://slack.com/api/chat.postMessage")
        .header("Authorization", format!("Bearer {token}"))
        .json(&payload)
        .send()
        .await?
        .json()
        .await?;

    if body.get("ok").and_then(Value::as_bool) != Some(true) {
        bail!("Slack postMessage failed: {body}");
    }
    Ok(())
}

async fn send_whatsapp(to: &str, text: &str, config: &AppConfig) -> Result<()> {
    let token = config.messenger.whatsapp_token.as_deref()
        .ok_or_else(|| anyhow::anyhow!("messenger.whatsapp_token not configured"))?;
    let phone_number_id = config.messenger.whatsapp_phone_number_id.as_deref()
        .ok_or_else(|| anyhow::anyhow!("messenger.whatsapp_phone_number_id not configured"))?;

    let url = format!("https://graph.facebook.com/v18.0/{phone_number_id}/messages");
    let resp = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text}
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        bail!("WhatsApp send failed: {}", resp.text().await.unwrap_or_default());
    }
    Ok(())
}
