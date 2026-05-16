# OpenPika Features

## CLI

### Python CLI (`openpika` command)
| Command | Description |
|---------|-------------|
| `openpika init` | Interactive setup wizard — API key, model, port |
| `openpika run <task>` | One-shot task execution with optional `--model` override |
| `openpika chat` | Interactive multi-turn REPL session |
| `openpika serve` | Start HTTP gateway (auto-detects Rust binary, falls back to Python) |
| `openpika config [key] [value]` | Read/write TOML config settings |
| `openpika ui` | Launch Chainlit web UI |
| `openpika version` | Print installed version |
| `openpika mcp list/add/remove/enable/disable` | Manage MCP server tool registrations |
| `openpika cron list/add/remove/enable/disable/run` | Manage scheduled cron jobs |
| `openpika skills list/pending/approve/reject/delete` | Manage skills and review agent proposals |

### Rust CLI (`openpika-core` binary)
| Command | Description |
|---------|-------------|
| `openpika serve --bind ADDR:PORT` | Start the axum gateway server |
| `openpika run <task>` | Non-interactive one-shot task |
| `openpika login --provider PROVIDER` | Browser-based enterprise SSO (Okta/Azure/Auth0) |
| `openpika credentials set/get/delete KEY` | OS keychain credential management |
| `openpika db migrate` | Run pending SQL migrations |
| `openpika db version` | Display current schema version |

---

## Agent Tools

### Core tools (always available)

| Tool | Description |
|------|-------------|
| `web_search` | DuckDuckGo Instant Answer API; configurable `max_results` (default 5) |
| `read_file` | Read a file; supports `~/`, relative, and absolute paths |
| `write_file` | Write content to a path; auto-creates parent directories |
| `terminal` | Execute shell commands; 30-second timeout; returns stdout + stderr + exit code |
| `execute_code` | Execute code in Python, JavaScript, Bash, TypeScript, Ruby, or Go; file-based execution via temp file |
| `generate_image` | Call any OpenAI-compatible `/v1/images/generations` endpoint; configured via env vars |
| `propose_skill` | Propose a reusable skill for user review/approval; stored in `pending_skills` queue |

### Browser automation tools (require `playwright`)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to a URL; returns page title and visible text |
| `browser_snapshot` | Return current page URL, title, and visible text |
| `browser_click` | Click an element by CSS selector |
| `browser_type` | Type text into an input element |
| `browser_extract` | Extract text from elements matching a CSS selector |
| `browser_close` | Close browser and release resources |

Install playwright: `pip install 'openpika[browser]' && playwright install chromium`

Tool availability is togglable per-session via the Chainlit UI settings panel.

---

## HTTP API

All endpoints are OpenAI-compatible where noted.

### Health
- `GET /health` — liveness check
- `GET /ready` — readiness check (verifies DB connectivity)

### Chat (OpenAI-compatible)
- `POST /v1/chat/completions` — sync and streaming; optional `session_id` for multi-turn continuity

### Sessions
- `GET /v1/sessions` — paginated list (limit 100)
- `GET /v1/sessions/{id}` — session metadata
- `GET /v1/sessions/{id}/messages` — full message history

### Tools & MCP
- `GET /v1/tools` — list all registered tools
- `POST /v1/tools` — register a new MCP server (kind: mcp_stdio or mcp_http)
- `PATCH /v1/tools/{id}` — update tool settings (enabled, name, config, etc.)
- `DELETE /v1/tools/{id}` — remove an MCP tool (native tools: 400)
- `GET/PUT/DELETE /v1/sessions/{id}/tools/{tool_id}` — per-session tool overrides

### Skills
- `GET /v1/skills` — list all skills
- `POST /v1/skills` — create a skill
- `PATCH /v1/skills/{id}` — update a skill
- `DELETE /v1/skills/{id}` — delete a user-created skill
- `GET /v1/skills/pending` — list agent-proposed skills awaiting approval
- `POST /v1/skills/pending/{id}/approve` — approve a proposed skill
- `POST /v1/skills/pending/{id}/reject` — reject a proposed skill

### Cron Scheduler
- `GET /v1/cron` — list all cron jobs
- `POST /v1/cron` — create a cron job `{name, schedule, prompt, model?}`
- `PATCH /v1/cron/{id}` — update a cron job
- `DELETE /v1/cron/{id}` — delete a cron job

### Webhooks
- `POST /webhooks/{platform}` — ingests messages from Telegram, Discord, Slack, WhatsApp, or generic payload
  - HMAC-SHA256 signature verification (`X-Hub-Signature-256`)
  - Fire-and-forget: returns `{"session_id", "status": "accepted"}` immediately; agent runs async

---

## Multi-Model Support

Provider-prefixed model names route to the correct pydantic-ai backend:

| Provider | Prefix | Env Variable |
|----------|--------|--------------|
| Anthropic (default) | `anthropic:` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai:` | `OPENAI_API_KEY` |
| Google Gemini | `google-gla:` | `GEMINI_API_KEY` |
| Groq | `groq:` | `GROQ_API_KEY` |
| Mistral | `mistral:` | `MISTRAL_API_KEY` |
| DeepSeek | `deepseek:` | `DEEPSEEK_API_KEY` |
| xAI/Grok | `grok:` / `xai:` | `XAI_API_KEY` |

Bare model names (no prefix) default to Anthropic. Override per-command with `--model`.

---

## MCP Support

Connect any MCP-compatible server (stdio or HTTP transport):

```bash
# Register an MCP server (stdio)
openpika mcp add "Playwright Browser" --command "npx @playwright/mcp"

# Register an MCP server (HTTP)
openpika mcp add "Custom Tools" --command "http://localhost:3001/mcp"

# With args and env vars
openpika mcp add "Filesystem" \
  --command "npx @modelcontextprotocol/server-filesystem" \
  --args '["/home/user/documents"]'

openpika mcp list
openpika mcp remove <id>
openpika mcp enable/disable <id>
```

MCP servers are managed via the tool_configs DB table. The registry loads all enabled MCP entries at agent startup via `MCPServerStdio` / `MCPServerHTTP` from pydantic-ai.

---

## Cron Scheduler

Run agent prompts on a schedule using standard cron expressions:

```bash
openpika cron add "Daily Digest" \
  --schedule "0 9 * * *" \
  --prompt "Search the web for today's AI news and summarise the top 5 stories"

openpika cron add "Weekly Report" \
  --schedule "0 8 * * 1" \
  --prompt "Generate a weekly productivity summary" \
  --model "anthropic:claude-haiku-4-5-20251001"

openpika cron list
openpika cron disable <id>
openpika cron run <id>    # trigger immediately
```

The scheduler fires every 60 seconds, checks `next_run` against the current time, and advances the schedule after each run using `croniter`. Requires `pip install croniter` (included in core deps).

---

## Self-Learning Loop

The agent can propose reusable skills during conversations. You review and approve them.

### How it works
1. After a complex task, the agent calls `propose_skill` with a name, description, and prompt template.
2. The proposal is stored in `pending_skills` with `status="pending"`.
3. You review proposals:
   ```bash
   openpika skills pending     # see all proposals
   openpika skills approve <id>  # moves to skills table
   openpika skills reject <id>   # marks rejected
   ```
4. Approved skills appear in `openpika skills list` and are available in the Chainlit UI.

### When the agent proposes a skill
The system prompt nudges the agent to call `propose_skill` only after discovering a genuinely reusable workflow pattern — not every conversation. User approval is always required before a skill is persisted.

---

## RAG-Based Tool Selection

When more tools are registered than the context budget allows, OpenPika selects the top-k most relevant tools automatically.

- **TF-IDF backend** (default) — pure Rust, no external API calls; sparse bag-of-words over a domain-specific vocabulary
- **API backend** (optional) — calls any OpenAI-compatible `/v1/embeddings` endpoint for higher accuracy
- Configurable via `OPENPIKA_EMBEDDINGS_KEY`, `OPENPIKA_EMBEDDINGS_ENDPOINT`, `OPENPIKA_EMBEDDINGS_MODEL`
- Cosine similarity computed in-process with `nalgebra`; embeddings stored as packed f32 bytes in the DB
- `top_k_tools` setting controls how many tools are surfaced per request (default: 3)

---

## Context & Token Management

- Token counting via `tiktoken-rs` (OpenAI BPE); Claude models mapped to `gpt-4` family; heuristic fallback (~4 chars/token)
- `max_input_tokens` enforced pre-flight in the gateway before Python sees the request (default: 100,000)
- `truncate_messages_to_fit()` preserves system messages and recent turns when truncating
- Document chunking utility splits large texts into max-token segments

---

## Rolling Summarization

Background worker (runs every 60 s) compresses old conversation turns to keep context lean:

1. Scans sessions where message count > `raw_turns_kept` + 5
2. Calls the Python brain with a compression prompt
3. Replaces the batch of old messages with a single `summary`-role message
4. Only the most recent `raw_turns_kept` turns stay as raw messages (default: 3)

---

## Database

- **SQLite** (default), **PostgreSQL**, **MySQL** via SQLx `AnyPool`
- Schema managed with embedded SQL migrations; auto-run on `serve` and `run`
- Tables: `sessions`, `messages`, `tool_embeddings`, `tool_configs`, `session_tool_overrides`, `skills`, `pending_skills`, `cron_jobs`
- FTS5 full-text search index on messages
- **Field-level encryption** (AES-256-GCM) — enabled with `encrypt_at_rest = true`; key stored in OS keychain, never in plaintext config

---

## Authentication & Security

- **JWT validation** — real RS256 JWKS verification; fetches `{issuer}/.well-known/openid-configuration`, caches keys for 1 hour; validates signature, issuer whitelist, expiry, and audience
- **OS keychain** for all secrets (API keys, OIDC client secrets, encryption key) — no plaintext keys in config files
- **Enterprise SSO** via OAuth2 + PKCE: Okta, Azure AD/Entra ID, Auth0; browser callback on random local port; 120-second login timeout
- **HMAC-SHA256 webhook verification** — constant-time comparison to prevent timing attacks
- **CORS** — configurable allowed origins
- Structured tracing via `tracing-subscriber`; configurable log level

---

## Image Generation

Configure via environment variables (no code changes needed):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENPIKA_IMAGE_API_KEY` | `$OPENAI_API_KEY` | API key (falls back to OpenAI key) |
| `OPENPIKA_IMAGE_ENDPOINT` | OpenAI DALL-E 3 URL | Any OpenAI-compatible endpoint |
| `OPENPIKA_IMAGE_MODEL` | `dall-e-3` | Model name passed to the endpoint |

Works with DALL-E 3, Stability AI, Together AI, or any provider with an OpenAI-compatible images API.

---

## Web UI

`openpika ui` launches a Chainlit-based chat interface:

- Step-by-step visibility into tool invocations (inputs and outputs)
- Live tool toggle panel (enable/disable each tool per session)
- Multi-turn conversation history
- Model selector driven by config

---

## Deployment

### Dual Gateway
| Mode | Framework | Use Case |
|------|-----------|----------|
| Rust (`openpika-core`) | axum | Production — high concurrency, low latency |
| Python (`openpika-python`) | FastAPI + uvicorn | Dev/fallback — no compilation required |

Same HTTP API surface in both modes. `openpika serve` auto-detects which is available.

### Docker
- Multi-stage build: Rust compilation + Python wheel → `debian:bookworm-slim`
- Non-root user (`openpika`, UID 1000)
- Volume at `/home/openpika/.openpika/state.db`
- Health check on `GET /health`
- Docker Compose profiles: default (SQLite) and `enterprise` (adds PostgreSQL 16)

### Distribution
- Multi-arch CI (`.github/workflows/ci.yml`)
- macOS `.dmg` via `cargo-bundle`
- Windows `.msi` via `cargo-wix`
- Alpine Docker image for lightweight deployments

---

## Configuration

| Layer | Format | Priority |
|-------|--------|----------|
| Environment variables | `OPENPIKA__KEY` (double-underscore for nesting) | Highest |
| Config file | `~/.openpika/config.toml` | Middle |
| Built-in defaults | — | Lowest |

`DATABASE_URL` env var is also respected for 12-factor compatibility.

Key settings:

```toml
database_url       = "sqlite://~/.openpika/state.db"
default_model      = "claude-sonnet-4-6"
encrypt_at_rest    = false

[gateway]
bind               = "0.0.0.0:8080"
webhook_secret     = ""          # enables HMAC verification when set

[context]
max_input_tokens   = 100000
raw_turns_kept     = 3
top_k_tools        = 3

[auth.okta]
client_id    = "..."
issuer_url   = "https://your-domain.okta.com"
redirect_uri = "http://localhost:8080/callback"
audience     = "api://default"  # optional; validated if set
```
