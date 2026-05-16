# OpenPika

**Enterprise AI agent engine — Rust core + pydantic-ai brain**

OpenPika is a high-performance agent framework built as a clean replacement for [hermes-agent](../hermes-agent). It pairs a Rust engine for heavy lifting with a pure [pydantic-ai](https://github.com/pydantic/pydantic-ai) Python layer for LLM orchestration.

```
┌─────────────────────────────────────────────────────────┐
│                    OpenPika Architecture                 │
│                                                          │
│  HTTP / Webhooks                                         │
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
│  │  pydantic-ai Agent  │  Tool definitions  │             │
│  │  web_search · read/write_file · terminal │             │
│  └─────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

## Features

| Layer | What it does |
|-------|-------------|
| **Rust gateway** | axum webhook server — handles thousands of concurrent connections without Python GIL contention |
| **Tokenizer** | tiktoken-rs counts tokens and enforces context limits before Python sees the request |
| **Tool RAG** | nalgebra cosine-similarity selects the top-k relevant tools per request |
| **Rolling summarizer** | Background worker compresses old turns, keeps only the last N raw messages |
| **Database** | SQLite default (zero-config) · PostgreSQL / MySQL for enterprise · AES-256-GCM field encryption |
| **Credential store** | OS keychain via `keyring` — no plaintext YAML configs |
| **Enterprise SSO** | OAuth2 + PKCE browser login for Okta, Azure AD / Entra ID, Auth0 |
| **pydantic-ai brain** | Clean agent with tool definitions; model-agnostic (Claude, GPT-4, local) |
| **Distribution** | Alpine Docker image · macOS `.dmg` · Windows `.msi` · multi-arch CI |

## Install

```bash
# Pure Python — no Rust required
pip install 'openpika[server]'

# First-time setup
openpika init

# One-shot task
openpika run "What tools do you have available?"

# Interactive chat
openpika chat

# HTTP gateway (same API surface as the Rust binary)
openpika serve
```

For the high-performance Rust binary (production), see [QUICKSTART.md](QUICKSTART.md).

## Web UI

```bash
openpika ui          # starts Chainlit on http://0.0.0.0:8000
openpika ui --port 9000 --headless   # custom port, no browser auto-open
```

**Accessing the UI from a remote machine**

If OpenPika is running on a server, use SSH port forwarding — no firewall changes needed:

```bash
# On your laptop
ssh -L 8000:localhost:8000 user@your-server-ip
```

Then open `http://localhost:8000` in your browser. The tunnel stays open as long as the SSH session is active.

## Quick links

- **First run →** [QUICKSTART.md](QUICKSTART.md)
- **Config reference →** [docs/config.md](docs/config.md) *(coming soon)*
- **API reference →** [docs/api.md](docs/api.md) *(coming soon)*

## Project layout

```
openpika/
├── Cargo.toml                    # Rust workspace
├── Dockerfile                    # Alpine multi-stage build
├── docker-compose.yml            # One-command deploy
├── .env.example                  # Copy → .env and fill in keys
│
├── openpika-core/                # Rust binary
│   ├── src/
│   │   ├── main.rs               # CLI entry point
│   │   ├── config/               # TOML + env var configuration
│   │   ├── db/                   # sqlx AnyPool, models, AES-GCM crypto
│   │   ├── gateway/              # axum server, routes, HMAC middleware
│   │   ├── auth/                 # OS keyring, OAuth2 PKCE, JWT validation
│   │   ├── tokenizer/            # tiktoken-rs, TF-IDF / API embeddings, RAG
│   │   ├── python/               # PyO3 bridge to Python brain
│   │   └── worker/               # Rolling summarization task
│   └── migrations/               # SQLx migration files
│
└── openpika-python/              # Python pydantic-ai package
    └── src/openpika/
        ├── agent.py              # Cached Agent per model
        ├── tools.py              # web_search, read_file, write_file, terminal
        └── entrypoint.py        # PyO3-callable synchronous wrappers
```

## CLI commands

```
openpika serve              Start the gateway (default: 0.0.0.0:8080)
openpika run "task"         Run a one-shot task and print the result
openpika login              Browser-based enterprise SSO login
openpika credentials set    Store an API key in the OS keychain
openpika credentials get    Retrieve a stored key
openpika db migrate         Run pending database migrations
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (checks DB) |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat endpoint |
| `GET` | `/v1/sessions` | List all sessions |
| `GET` | `/v1/sessions/:id` | Get session metadata |
| `GET` | `/v1/sessions/:id/messages` | Get session message history |
| `POST` | `/webhooks/:platform` | Inbound webhook (telegram, discord, slack, …) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Anthropic API key |
| `DATABASE_URL` | `sqlite://~/.openpika/state.db` | DB connection string |
| `OPENPIKA_DEFAULT_MODEL` | `claude-sonnet-4-6` | Default model ID |
| `OPENPIKA_PYTHON_PATH` | — | Extra path prepended to `sys.path` |
| `OPENPIKA_EMBEDDINGS_KEY` | — | API key for embeddings endpoint |
| `OPENPIKA_LOG_LEVEL` | `info` | Log level (trace/debug/info/warn/error) |

## Building from source

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
PYO3_PYTHON=python3 cargo build --release
```

*Windows (PowerShell):*

```powershell
# OpenSSL is vendored automatically on Windows
$env:PYO3_PYTHON = "python"
cargo build --release
```

Install the Python package (all platforms):

```bash
cd openpika-python
uv venv .venv

source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\Activate.ps1    # Windows

uv pip install -e .
```

See [QUICKSTART.md](QUICKSTART.md) for the full walkthrough.

## License

MIT — see [LICENSE](LICENSE).
