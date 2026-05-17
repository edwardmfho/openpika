# OpenPika

**AI agent engine — Rust core + pydantic-ai brain**

OpenPika is an agent framework that pairs a Rust engine for heavy lifting with a pure [pydantic-ai](https://github.com/pydantic/pydantic-ai) Python layer for LLM orchestration. You can run it as a pure-Python CLI tool or deploy the full Rust+Python stack for production.

```
┌─────────────────────────────────────────────────────────┐
│                    OpenPika Architecture                 │
│                                                          │
│  HTTP / Webhooks / CLI                                   │
│       ↓                                                  │
│  ┌─────────────────────────────────────────┐             │
│  │         Rust Core (openpika-core)        │             │
│  │                                          │             │
│  │  axum gateway  │  HMAC auth  │  JWT SSO  │             │
│  │  tiktoken-rs   │  RAG/cosine │  summarizer│            │
│  │  sqlx (SQLite / Postgres / MySQL)        │             │
│  │  keyring (OS credential store)           │             │
│  └──────────────────┬──────────────────────┘             │
│                     │ PyO3                                │
│  ┌──────────────────▼──────────────────────┐             │
│  │       Python Brain (openpika-python)     │             │
│  │                                          │             │
│  │  pydantic-ai Agent  │  13 native tools   │             │
│  │  Swarm / EventBus   │  Cron scheduler    │             │
│  │  Self-learning loop │  MCP integration   │             │
│  └─────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

## Features

| Layer | What it does |
|-------|-------------|
| **13 native tools** | web_search, read/write_file, terminal, execute_code, generate_image, propose_skill, render_ui, browser_navigate/snapshot/click/type/extract/close |
| **Multi-agent swarm** | Event-driven pipelines — research → write → analyse → review with built-in or custom node presets |
| **Self-learning loop** | Agent proposes reusable skills; you approve/reject them via CLI |
| **Cron scheduler** | Run agent prompts on any cron schedule (e.g. daily digest, weekly reports) |
| **MCP support** | Plug in any MCP server over stdio or HTTP; managed via CLI or HTTP API |
| **A2UI generative UI** | Agent renders rich interactive UI surfaces (tables, file previews, image grids, forms) |
| **Rust gateway** | axum webhook server — handles thousands of concurrent connections without Python GIL contention |
| **Tokenizer** | tiktoken-rs counts tokens and enforces context limits before Python sees the request |
| **Tool RAG** | nalgebra cosine-similarity selects the top-k relevant tools per request |
| **Rolling summarizer** | Background worker compresses old turns, keeps only the last N raw messages |
| **Database** | SQLite default (zero-config) · PostgreSQL / MySQL for enterprise · AES-256-GCM field encryption |
| **Multi-model** | Anthropic, OpenAI, Google Gemini, Groq, Mistral, DeepSeek, xAI — swap with `--model` |
| **Messaging integrations** | Telegram, Discord, Slack, WhatsApp webhook ingestion |
| **Enterprise SSO** | OAuth2 + PKCE browser login for Okta, Azure AD / Entra ID, Auth0 |

## Install

```bash
# Pure Python — no Rust required
pip install 'openpika[server]'

# First-time setup wizard (API key, model, port)
openpika init

# One-shot task
openpika run "What tools do you have available?"

# Interactive chat
openpika chat

# Web UI (React + FastAPI backend together)
openpika ui

# HTTP gateway
openpika serve
```

For the high-performance Rust binary (production), see [QUICKSTART.md](QUICKSTART.md).

## Supported providers

| Provider | Model prefix | API key env var |
|----------|--------------|-----------------|
| Anthropic (default) | `anthropic:` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai:` | `OPENAI_API_KEY` |
| Google Gemini | `google-gla:` | `GEMINI_API_KEY` |
| Groq | `groq:` | `GROQ_API_KEY` |
| Mistral | `mistral:` | `MISTRAL_API_KEY` |
| DeepSeek | `deepseek:` | `DEEPSEEK_API_KEY` |
| xAI / Grok | `grok:` | `XAI_API_KEY` |

Use any model with `--model`:

```bash
openpika run "hello" --model google-gla:gemini-2.5-flash
openpika chat        --model openai:gpt-4o
```

Set a permanent default:

```bash
openpika config model google-gla:gemini-2.5-flash
# or
export OPENPIKA_MODEL=google-gla:gemini-2.5-flash
```

## CLI commands

### Core

```
openpika init                   Interactive setup wizard
openpika run "task"             One-shot task
openpika chat                   Interactive multi-turn REPL
openpika serve                  HTTP gateway (Rust if built, else Python)
openpika ui                     React web UI + backend together
openpika config [key] [value]   Read/write config settings
openpika version                Print version
```

### Multi-agent swarm

```
openpika swarm run "task" --pipeline research,write
openpika swarm run "task" --pipeline research,write,review
openpika swarm run "task" --pipeline research,analyse
openpika swarm presets          List built-in node presets
openpika swarm runs             List recent swarm runs from DB
```

Built-in presets: `research`, `write`, `analyse`, `review`

### Cron scheduler

```
openpika cron list
openpika cron add "Daily Digest" --schedule "0 9 * * *" \
    --prompt "Summarise today's AI news"
openpika cron run <id>          Trigger a job immediately
openpika cron disable <id>
openpika cron remove <id>
```

### Skills (self-learning loop)

```
openpika skills list
openpika skills pending         Review agent-proposed skills
openpika skills approve <id>
openpika skills reject <id>
openpika skills delete <id>
```

### MCP servers

```
openpika mcp list
openpika mcp add "Name" --command "npx @playwright/mcp"
openpika mcp add "Name" --command "http://localhost:3001/mcp"
openpika mcp enable/disable <id>
openpika mcp remove <id>
```

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat (sync + streaming) |
| `GET` | `/v1/sessions` | List sessions |
| `GET` | `/v1/sessions/:id/messages` | Message history |
| `GET/POST/PATCH/DELETE` | `/v1/tools` | Manage tools and MCP servers |
| `GET/POST/PATCH/DELETE` | `/v1/skills` | Manage skills |
| `GET` | `/v1/skills/pending` | Agent-proposed skills awaiting approval |
| `POST` | `/v1/skills/pending/:id/approve` | Approve a proposed skill |
| `GET/POST/PATCH/DELETE` | `/v1/cron` | Manage cron jobs |
| `POST` | `/v1/swarm/run` | Run a swarm pipeline |
| `GET` | `/v1/swarm/runs` | List swarm runs |
| `GET` | `/v1/swarm/presets` | List built-in presets |
| `POST` | `/webhooks/:platform` | Inbound webhook (telegram/discord/slack/whatsapp) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `OPENPIKA_MODEL` | `anthropic:claude-sonnet-4-6` | Default model |
| `OPENPIKA_PORT` | `8080` | Gateway port |
| `DATABASE_URL` | SQLite at `~/.openpika/state.db` | DB connection string |
| `OPENPIKA_LOG_LEVEL` | `info` | Log level |
| `OPENPIKA_IMAGE_API_KEY` | `$OPENAI_API_KEY` | Image generation API key |
| `OPENPIKA_IMAGE_ENDPOINT` | OpenAI DALL-E 3 | Image generation endpoint |
| `OPENPIKA_EMBEDDINGS_KEY` | — | Key for optional embeddings API |

## Project layout

```
openpika/
├── Cargo.toml                    # Rust workspace
├── Dockerfile                    # Alpine multi-stage build
├── docker-compose.yml            # One-command deploy (SQLite or Postgres)
├── .env.example                  # Copy → .env and fill in keys
├── README.md                     # This file
├── QUICKSTART.md                 # Step-by-step build + run guide
├── FEATURES.md                   # Full feature reference
├── INTERFACE.md                  # Messaging integrations guide
│
├── openpika-core/                # Rust binary
│   ├── src/
│   │   ├── main.rs               # CLI entry point
│   │   ├── config/               # TOML + env var configuration
│   │   ├── db/                   # sqlx AnyPool, models, AES-GCM crypto
│   │   ├── gateway/              # axum server, routes, HMAC middleware
│   │   ├── auth/                 # OS keyring, OAuth2 PKCE, JWT validation
│   │   ├── tokenizer/            # tiktoken-rs, TF-IDF embeddings, RAG
│   │   ├── python/               # PyO3 bridge to Python brain
│   │   └── worker/               # Rolling summarization task
│   └── migrations/               # SQL migration files
│
├── openpika-python/              # Python pydantic-ai package (`pip install openpika`)
│   └── src/openpika/
│       ├── agent.py              # pydantic-ai Agent factory (get_agent / make_agent)
│       ├── tools.py              # 13 native tools
│       ├── swarm.py              # Multi-agent event-driven pipelines
│       ├── eventbus.py           # AgentEvent + EventBus (subscribe/publish/history)
│       ├── scheduler.py          # Cron background worker
│       ├── registry.py           # Tool + MCP registry (loaded from DB)
│       ├── server.py             # FastAPI gateway
│       ├── a2ui_adapter.py       # AG-UI / A2UI SSE adapter
│       ├── db.py                 # SQLAlchemy models + CRUD
│       ├── config.py             # Settings (TOML + env vars)
│       ├── entrypoint.py         # PyO3-callable synchronous wrappers
│       └── cli/                  # Typer CLI (main, run, chat, serve, ui, swarm, cron, skills, mcp)
│
├── openpika-ui/                  # React web UI
│
└── docs/
    ├── tools-and-skills.md       # Tool + skill authoring guide
    └── ui-requirements.md        # A2UI component catalogue
```

## Building from source (Rust+Python)

**Prerequisites:** Rust ≥ 1.80, Python ≥ 3.12, `uv` or `pip`, OpenSSL dev headers.

*Linux (Ubuntu / Debian):*

```bash
sudo apt-get install -y libssl-dev pkg-config python3-dev
PYO3_PYTHON=python3 OPENSSL_NO_VENDOR=1 cargo build --release
```

*macOS:*

```bash
brew install openssl pkg-config
export OPENSSL_DIR=$(brew --prefix openssl)
cargo build --release
```

*Windows (PowerShell):*

```powershell
$env:PYO3_PYTHON = "python"
cargo build --release
```

Install the Python package:

```bash
cd openpika-python
uv venv .venv && source .venv/bin/activate
uv pip install -e .
```

See [QUICKSTART.md](QUICKSTART.md) for the full walkthrough.

## License

MIT
