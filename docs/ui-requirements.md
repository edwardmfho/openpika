# OpenPika UI — Requirements

**Stack:** React + [assistant-ui](https://www.assistant-ui.com/) components · [AG-UI protocol](https://docs.ag-ui.com/introduction) event layer · OpenPika gateway backend

---

## 1. Chat Interface (Core)

| # | Requirement |
|---|-------------|
| 1.1 | Render a persistent chat thread using assistant-ui's `<Thread>` component |
| 1.2 | Stream assistant tokens in real time via AG-UI `TextMessageContent` events |
| 1.3 | Show a typing / thinking indicator between `RunStarted` and the first `TextMessageContent` |
| 1.4 | Support multi-turn history; load past messages via `MessagesSnapshot` on session open |
| 1.5 | Allow the user to edit a previous message and re-run from that point (human-in-the-loop via AG-UI interrupt) |
| 1.6 | Support markdown rendering in assistant messages (code blocks, tables, lists) |
| 1.7 | Support multimodal input: file / image upload sent alongside the text message |
| 1.8 | Show a session title (auto-generated from first message) and allow rename |

---

## 2. Skills

Skills are pre-built prompt templates the user can trigger from the UI without typing a full instruction.

| # | Requirement |
|---|-------------|
| 2.1 | Skill picker — slash-command menu (`/`) that lists available skills with a short description |
| 2.2 | Each skill has: name, description, icon, and an optional parameter form (filled before dispatch) |
| 2.3 | Skills are defined server-side and fetched at startup; the UI renders them dynamically |
| 2.4 | Built-in starter skills: `Summarise`, `Draft email`, `Explain code`, `Search web`, `Write file` |
| 2.5 | User can pin favourite skills to a toolbar for one-click access |
| 2.6 | Skill invocation sends a `Custom` AG-UI event with `{ type: "skill_invoke", skill_id, params }` so the agent knows to use the skill prompt template |
| 2.7 | Skill results stream back normally through the chat thread |

---

## 3. Tool Use

Tool calls flow through AG-UI `ToolCall*` events and are rendered inline in the thread.

| # | Requirement |
|---|-------------|
| 3.1 | Render each tool call as a collapsible card inline in the conversation, between the user message and the final answer |
| 3.2 | Card shows: tool name, status badge (running / done / error), arguments, and result |
| 3.3 | Arguments stream in progressively as `ToolCallArgs` events arrive (show partial JSON) |
| 3.4 | Result is shown when `ToolCallResult` arrives; truncate long outputs with an expand toggle |
| 3.5 | Tool panel — sidebar listing all tools registered on the server with a toggle to enable/disable each for the current session |
| 3.6 | Human-in-the-loop approval: configurable per-tool option that pauses on `ToolCallStart` and asks the user to approve or reject before execution |
| 3.7 | `terminal` tool output rendered in a monospace block with ANSI colour support |
| 3.8 | `read_file` / `write_file` tool results shown in a syntax-highlighted code viewer |
| 3.9 | `web_search` results rendered as a small card list (title + snippet + URL), not raw JSON |

---

## 4. Generative UI (AG-UI State + Custom Events)

| # | Requirement |
|---|-------------|
| 4.1 | Agent can push `StateSnapshot` / `StateDelta` to update a shared state store; UI components subscribe and re-render reactively |
| 4.2 | Agent can emit `Custom` events with a `render` payload to inject arbitrary React components into the thread (generative UI) |
| 4.3 | Built-in renderable component types: `DataTable`, `Chart`, `ImageGrid`, `FilePreview`, `FormInput` |
| 4.4 | `ReasoningStart/Content/End` events surface a collapsible "Thinking…" block above the answer (opt-in, off by default) |
| 4.5 | `StepStarted` / `StepFinished` events render a progress stepper when the agent runs multi-step workflows |

---

## 5. Gateway & Channel Connections

This section covers configuring and monitoring the inbound webhook channels (WhatsApp, Telegram, Slack, Discord) that route into the OpenPika gateway.

### 5.1 Channel Management Page

| # | Requirement |
|---|-------------|
| 5.1.1 | Dedicated **Channels** page listing all configured gateway integrations with status (active / inactive / error) |
| 5.1.2 | Add / remove a channel via a guided setup form (no manual webhook URL editing required) |
| 5.1.3 | Each channel card shows: platform icon, channel name, sessions created, last message timestamp |
| 5.1.4 | One-click copy of the inbound webhook URL for pasting into the platform's developer console |
| 5.1.5 | Webhook secret field (masked) with a regenerate button; saving POSTs the new secret to the gateway config API |

### 5.2 Telegram

| # | Requirement |
|---|-------------|
| 5.2.1 | Setup wizard: enter Bot Token → UI calls the gateway to register the Telegram webhook |
| 5.2.2 | Live message feed showing inbound Telegram messages and the agent's replies in real time |
| 5.2.3 | Test button that sends a `/ping` message through the bot and verifies a response |

### 5.3 WhatsApp (via Meta / Twilio)

| # | Requirement |
|---|-------------|
| 5.3.1 | Setup wizard: enter WhatsApp Business API credentials (phone number ID, access token, verify token) |
| 5.3.2 | UI displays the verify token and the gateway's webhook URL for pasting into Meta's developer portal |
| 5.3.3 | Webhook verification handshake status shown (pending / verified) |
| 5.3.4 | Per-session thread view: each WhatsApp conversation appears as a named session |

### 5.4 Slack & Discord

| # | Requirement |
|---|-------------|
| 5.4.1 | Slack: setup wizard walks through creating a Slack App, setting the request URL, and entering the signing secret |
| 5.4.2 | Discord: setup wizard generates the interaction endpoint URL and guides through the Discord developer portal |
| 5.4.3 | Both platforms: test event button that fires a synthetic webhook payload and shows the parsed result |

### 5.5 Session Explorer (all channels)

| # | Requirement |
|---|-------------|
| 5.5.1 | Session list with filter by source channel (cli / api / telegram / whatsapp / slack / discord) |
| 5.5.2 | Click a session to open its full message history in a read-only thread view |
| 5.5.3 | Sessions from external channels can be "taken over" — the agent's next reply goes back out through the originating channel |

---

## 6. Configuration & Settings

| # | Requirement |
|---|-------------|
| 6.1 | Model selector: dropdown of supported providers/models; change takes effect on the next message |
| 6.2 | API key management: per-provider key fields, stored in the gateway's OS keychain (never in the browser) |
| 6.3 | Context settings: `max_input_tokens`, `raw_turns_kept`, `top_k_tools` — editable with live preview of current token usage |
| 6.4 | Theme toggle: light / dark |
| 6.5 | Streaming toggle: disable streaming and receive full responses at once (useful for copy-pasting) |

---

## 7. Non-Functional Requirements

| # | Requirement |
|---|-------------|
| 7.1 | AG-UI events consumed over SSE (primary) with WebSocket fallback |
| 7.2 | All gateway API calls go through a single configurable base URL; default `http://localhost:8080` |
| 7.3 | No secrets stored in the browser — API keys live in the gateway keychain only |
| 7.4 | Works offline for already-loaded sessions (read-only) |
| 7.5 | Mobile-responsive layout (assistant-ui's default responsive breakpoints) |
| 7.6 | First meaningful paint < 1 s on a local gateway |

---

## 8. Out of Scope (v1)

- User authentication / multi-user access control (single-user local tool for now)
- Voice input / output
- Plugin marketplace
- WhatsApp Business API provisioning (user must supply their own credentials)
