# OpenPika — Quick Start

This guide gets you from zero to a running agent on Ubuntu 24.04 (the current host). All commands assume you are inside the `openpika/` directory.

```bash
cd /root/Projects/agent/openpika
```

---

## 1. Prerequisites

Everything below is already installed on this host. If you are on a fresh machine, run:

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# System deps (Ubuntu/Debian)
sudo apt-get update && sudo apt-get install -y \
    libssl-dev pkg-config python3-dev python3-pip

# uv (fast Python package manager)
pip install uv
```

Verify:

```bash
rustc --version     # ≥ 1.80
python3 --version   # ≥ 3.12
uv --version
```

---

## 2. Set your API key

OpenPika reads `ANTHROPIC_API_KEY` from the environment. Add it to your shell:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

To persist it across sessions:

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

Alternatively, store it in the OS keychain (recommended for servers):

```bash
./target/release/openpika credentials set ANTHROPIC_API_KEY sk-ant-...
```

---

## 3. Build the Rust binary

```bash
source ~/.cargo/env        # if using rustup
OPENSSL_NO_VENDOR=1 cargo build --release
```

The binary lands at `target/release/openpika`. First build downloads crates and takes 3–5 minutes; subsequent builds are seconds.

```bash
./target/release/openpika --help
```

---

## 4. Set up the Python brain

```bash
cd openpika-python
uv venv .venv
source .venv/bin/activate
uv pip install -e .
cd ..
```

Tell the Rust binary where the Python package lives:

```bash
export OPENPIKA_PYTHON_PATH="/root/Projects/agent/openpika/openpika-python/src"
```

Add this to `~/.bashrc` alongside the API key so you don't have to repeat it:

```bash
echo 'export OPENPIKA_PYTHON_PATH="/root/Projects/agent/openpika/openpika-python/src"' >> ~/.bashrc
```

---

## 5. Run a one-shot task (CLI mode)

This is the fastest way to verify everything works end-to-end without starting a server:

```bash
./target/release/openpika run "What is the current working directory? List its contents."
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
export DATABASE_URL="sqlite:///root/.openpika/state.db"
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

The Python package is not on the path. Make sure:

```bash
export OPENPIKA_PYTHON_PATH="/root/Projects/agent/openpika/openpika-python/src"
# AND the venv is active:
source /root/Projects/agent/openpika/openpika-python/.venv/bin/activate
```

### `openssl-sys` build fails

Install the OpenSSL dev headers:

```bash
sudo apt-get install -y libssl-dev pkg-config
# Re-run cargo build with:
OPENSSL_NO_VENDOR=1 cargo build --release
```

### Agent returns `Error: No API key`

Either export `ANTHROPIC_API_KEY` in your shell or store it via:

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

- Add more tools in `openpika-python/src/openpika/tools.py` — any `async def` decorated with `@tool` works
- Swap the model: change `default_model` to `claude-opus-4-7`, `gpt-4o`, or any OpenAI-compatible model
- Enable encryption at rest: set `encrypt_at_rest = true` in config (generates a key in the OS keychain on first run)
- Scale out: point `DATABASE_URL` at a shared PostgreSQL instance and run multiple `openpika serve` workers behind a load balancer
