# OpenPika — Quick Start

---

## Option A — Pure Python (no Rust required)

This is the fastest path: no compilation needed, works anywhere Python 3.12+ is available.

```bash
# Install
pip install 'openpika[server]'

# One-time setup wizard (API key, model, port)
openpika init

# Run a task
openpika run "What tools do you have available?"

# Interactive chat
openpika chat

# Start the HTTP gateway
openpika serve
```

That's it. Settings are stored in `~/.openpika/config.toml` and can be changed at any time with `openpika init` or `openpika config <key> <value>`.

> **Python gateway note:** `openpika serve` in pure-Python mode uses a FastAPI/uvicorn ASGI server. It exposes the same HTTP API as the Rust binary. For production workloads that handle thousands of concurrent connections, use Option B (Rust binary) instead.

---

## Option B — Full Rust+Python build (recommended for production)

This guide gets you from zero to a running agent on **Linux, macOS, or Windows**. All commands assume you are inside the `openpika/` directory.

---

## 1. Prerequisites

**Rust toolchain**

On Linux and macOS, install via rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env   # or open a new terminal
```

On Windows, download and run [rustup-init.exe](https://rustup.rs).

**System dependencies**

*Linux (Ubuntu / Debian):*

```bash
sudo apt-get update && sudo apt-get install -y \
    libssl-dev pkg-config python3-dev python3-pip
```

*Linux (Fedora / RHEL):*

```bash
sudo dnf install -y openssl-devel pkg-config python3-devel python3-pip
```

*macOS:*

Install [Homebrew](https://brew.sh) if you haven't already, then:

```bash
brew install openssl pkg-config
```

Python 3.12+ is available via `brew install python@3.12` or from [python.org](https://www.python.org/downloads/).

*Windows:*

Install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select the **Desktop development with C++** workload. OpenSSL is vendored automatically on Windows so no separate install is needed.

Install Python 3.12+ from [python.org](https://www.python.org/downloads/).

**uv — fast Python package manager**

```bash
pip install uv
```

Verify everything is set up:

```bash
rustc --version     # ≥ 1.80
python3 --version   # ≥ 3.12
uv --version
```

---

## 2. Set your API key

OpenPika reads `ANTHROPIC_API_KEY` from the environment.

*Linux / macOS — set for this session:*

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

To persist across sessions, add the export to your shell profile:

```bash
# bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc && source ~/.bashrc

# zsh (macOS default since Catalina)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc && source ~/.zshrc
```

*Windows (PowerShell) — set for this session:*

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

To persist across sessions:

```powershell
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

**OS keychain (recommended for shared or production servers):**

```bash
./target/release/openpika credentials set ANTHROPIC_API_KEY sk-ant-...
```

---

## 3. Build the Rust binary

*Linux / macOS:*

```bash
PYO3_PYTHON=python3 OPENSSL_NO_VENDOR=1 cargo build --release
```

> **macOS note:** If you see a linker error about OpenSSL, set the path explicitly:
> ```bash
> export OPENSSL_DIR=$(brew --prefix openssl)
> cargo build --release
> ```

*Windows (PowerShell):*

```powershell
$env:PYO3_PYTHON = "python"
cargo build --release
```

> **Note:** `PYO3_PYTHON` tells the PyO3 build script which Python interpreter to link against.

The binary lands at `target/release/openpika` (Linux/macOS) or `target\release\openpika.exe` (Windows). The first build downloads crates and takes 3–5 minutes; subsequent builds are seconds.

> **Disk space:** A full release build requires ~2 GB of free space. To reclaim debug artifacts without touching the release cache:
> ```bash
> cargo clean --profile dev
> ```

Confirm the binary works:

```bash
./target/release/openpika --help          # Linux / macOS
.\target\release\openpika.exe --help      # Windows
```

---

## 4. Set up the Python brain

*Linux / macOS:*

```bash
cd openpika-python
uv venv .venv
source .venv/bin/activate
uv pip install -e .
cd ..
```

*Windows (PowerShell):*

```powershell
cd openpika-python
uv venv .venv
.venv\Scripts\Activate.ps1
uv pip install -e .
cd ..
```

Tell the Rust binary where the Python package lives by setting `OPENPIKA_PYTHON_PATH`.
Replace `<repo-root>` with the absolute path to your `openpika/` clone.

*Linux / macOS:*

```bash
export OPENPIKA_PYTHON_PATH="\
<repo-root>/openpika-python/src:\
<repo-root>/openpika-python/.venv/lib/python3.12/site-packages"
```

To set this once and persist it, add all exports to your shell profile:

```bash
cat >> ~/.bashrc << 'EOF'
export ANTHROPIC_API_KEY="sk-ant-..."         # fill in your key
OPENPIKA_DIR="/path/to/openpika"              # set to your clone location
export OPENPIKA_PYTHON_PATH="$OPENPIKA_DIR/openpika-python/src:$OPENPIKA_DIR/openpika-python/.venv/lib/python3.12/site-packages"
EOF
source ~/.bashrc
```

*Windows (PowerShell):*

```powershell
$openpika = "C:\path\to\openpika"             # set to your clone location
$env:OPENPIKA_PYTHON_PATH = "$openpika\openpika-python\src;$openpika\openpika-python\.venv\Lib\site-packages"
```

> **Simpler alternative:** just activate the venv before running `openpika`. An active venv makes all packages discoverable without setting `OPENPIKA_PYTHON_PATH`.

---

## 5. Run a one-shot task (CLI mode)

This is the fastest way to verify everything works end-to-end without starting a server:

```bash
./target/release/openpika run "What is the current working directory? List its contents."
# Windows: .\target\release\openpika.exe run "..."
```

You should see the agent reply using the `terminal` tool.

Try a web search:

```bash
./target/release/openpika run "Search the web for 'pydantic-ai latest release' and summarise what you find."
```

---

## 6. Start the gateway server

```bash
./target/release/openpika serve --bind 0.0.0.0:8080
```

Or with verbose logging to watch requests:

```bash
OPENPIKA_LOG_LEVEL=debug ./target/release/openpika serve
```

*Windows (PowerShell):*

```powershell
$env:OPENPIKA_LOG_LEVEL = "debug"
.\target\release\openpika.exe serve
```

### Health check

```bash
curl http://localhost:8080/health
# {"status":"ok","service":"openpika"}

curl http://localhost:8080/ready
# {"status":"ready"}  (once DB migrations have run)
```

### Chat completions (OpenAI-compatible)

```bash
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [
      {"role": "user", "content": "What tools do you have available?"}
    ]
  }' | python3 -m json.tool
```

### Webhook ingestion

Send a simulated Telegram message:

```bash
curl -s -X POST http://localhost:8080/webhooks/telegram \
  -H "Content-Type: application/json" \
  -d '{"message": {"text": "Hello, what can you do?"}}' | python3 -m json.tool
# Returns {"session_id": "...", "status": "accepted"}
```

The agent runs asynchronously; check session messages afterwards:

```bash
SESSION_ID="<paste id from above>"
curl -s http://localhost:8080/v1/sessions/$SESSION_ID/messages | python3 -m json.tool
```

---

## 7. Configuration file (optional)

Create `~/.openpika/config.toml` to override any default:

```toml
# ~/.openpika/config.toml

default_model   = "claude-sonnet-4-6"
encrypt_at_rest = false          # set true to encrypt message content in DB

[gateway]
bind           = "0.0.0.0:8080"
webhook_secret = ""              # set to validate X-Hub-Signature-256

[context]
max_input_tokens = 100000        # reject requests larger than this
raw_turns_kept   = 3             # keep last N turns as raw text; older turns are summarised
top_k_tools      = 3             # RAG: pass only top-k tools to pydantic-ai
```

All fields can also be set via environment variables with the `OPENPIKA__` prefix
(double-underscore for nested keys):

```bash
export OPENPIKA__GATEWAY__WEBHOOK_SECRET="my-secret"
export DATABASE_URL="sqlite:///home/youruser/.openpika/state.db"
```

---

## 8. Docker deploy (one command)

Make sure Docker and Docker Compose are installed, then:

```bash
# Copy and fill in your API key
cp .env.example .env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env

# Start the stack
docker compose up --build -d

# Watch logs
docker compose logs -f openpika

# Health check
curl http://localhost:8080/health
```

To use PostgreSQL instead of SQLite (enterprise mode):

```bash
POSTGRES_PASSWORD=changeme docker compose --profile enterprise up -d
# Set DATABASE_URL in .env:
# DATABASE_URL=postgresql://openpika:changeme@postgres:5432/openpika
```

---

## 9. Run migrations manually

Migrations run automatically on every `serve` and `run` invocation. To run them explicitly (e.g. in a CI pre-step):

```bash
./target/release/openpika db migrate
./target/release/openpika db version   # prints current schema version
```

---

## 10. Enterprise SSO login (optional)

If you have an Okta / Azure AD / Auth0 OIDC app, add the provider to `~/.openpika/config.toml`:

```toml
[auth.okta]
client_id    = "0oa..."
issuer_url   = "https://your-org.okta.com"
redirect_uri = "http://127.0.0.1:0/callback"   # port 0 = random, auto-resolved
```

Then run:

```bash
./target/release/openpika login --provider okta
# Opens your browser → authenticate → token stored in OS keychain
```

---

## Troubleshooting

### `Cannot import openpika.entrypoint`

The Python package is not on the path. Either activate the venv:

```bash
source openpika-python/.venv/bin/activate        # Linux / macOS
openpika-python\.venv\Scripts\Activate.ps1       # Windows
```

Or set `OPENPIKA_PYTHON_PATH` explicitly (see Step 4).

### `openssl-sys` build fails (Linux)

Install the OpenSSL development headers:

```bash
# Ubuntu / Debian
sudo apt-get install -y libssl-dev pkg-config

# Fedora / RHEL
sudo dnf install -y openssl-devel pkg-config
```

Then rebuild:

```bash
OPENSSL_NO_VENDOR=1 cargo build --release
```

### `openssl-sys` build fails (macOS)

```bash
brew install openssl
export OPENSSL_DIR=$(brew --prefix openssl)
cargo build --release
```

### Agent returns `Error: No API key`

Either export `ANTHROPIC_API_KEY` in your shell (see Step 2) or store it in the OS keychain:

```bash
./target/release/openpika credentials set ANTHROPIC_API_KEY sk-ant-...
```

### Database is locked

If two processes share the same SQLite file, one will wait. Either run one process at a time, or switch to PostgreSQL:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/openpika"
```

### Webhook HMAC rejection (401)

If you set `gateway.webhook_secret`, every inbound webhook must include an
`X-Hub-Signature-256: sha256=<hex>` header. Temporarily clear the secret
to disable signature checking while debugging:

```bash
export OPENPIKA__GATEWAY__WEBHOOK_SECRET=""
```

---

## What's next

### Multi-agent swarm

Run a research → write pipeline with two agents chained via an event bus:

```bash
openpika swarm run "Explain the history of Rust programming language" --pipeline research,write
openpika swarm run "Analyse the risks of LLM agents" --pipeline research,analyse,review
openpika swarm presets   # list built-in node types
openpika swarm runs      # list past runs
```

### Cron scheduler

Schedule agent prompts to run automatically:

```bash
openpika cron add "Daily AI news" \
  --schedule "0 9 * * *" \
  --prompt "Search the web for today's top AI news and summarise the top 5 stories"

openpika cron list
openpika cron run <id>   # trigger immediately to test
```

### Self-learning skills

The agent proposes reusable workflows during conversations. Review and approve them:

```bash
openpika skills pending    # see what the agent has proposed
openpika skills approve <id>
openpika skills list       # view approved skills
```

### MCP servers

Extend the agent with any MCP-compatible tool server:

```bash
openpika mcp add "Playwright" --command "npx @playwright/mcp"
openpika mcp add "Filesystem" \
  --command "npx @modelcontextprotocol/server-filesystem" \
  --args '["/home/user/documents"]'
openpika mcp list
```

### Further customisation

- Add more tools in `openpika-python/src/openpika/tools.py` — any `async def` decorated with `@tool` works
- Swap the model: change `default_model` to `claude-opus-4-7`, `gpt-4o`, or any OpenAI-compatible model
- Enable encryption at rest: set `encrypt_at_rest = true` in config (generates a key in the OS keychain on first run)
- Scale out: point `DATABASE_URL` at a shared PostgreSQL instance and run multiple `openpika serve` workers behind a load balancer
- Connect messaging platforms (Telegram, Slack, Discord, WhatsApp): see [INTERFACE.md](INTERFACE.md)
