# OpenPika Python

The pydantic-ai brain for the [OpenPika](https://github.com/openpika/openpika) enterprise agent engine.
Supports **any model pydantic-ai supports** — Anthropic, Google Gemini, OpenAI, Groq, and more.

## Install

```bash
pip install openpika                # Anthropic only (default)
pip install 'openpika[google]'      # + Google Gemini
pip install 'openpika[openai]'      # + OpenAI
pip install 'openpika[all]'         # all providers + gateway
```

For the built-in Python gateway:

```bash
pip install 'openpika[server]'
```

## Quick start

```bash
openpika init          # one-time setup wizard (picks provider + API key)
openpika run "hello"   # one-shot task
openpika chat          # interactive REPL
openpika serve         # start the gateway (port 8080)
```

Use any model with `--model` / `-m`:

```bash
# Google Gemini
GEMINI_API_KEY=... openpika run "hello" --model google-gla:gemini-2.5-flash
GEMINI_API_KEY=... openpika chat        --model google-gla:gemini-2.5-flash

# OpenAI
OPENAI_API_KEY=... openpika chat --model openai:gpt-4o

# Groq
GROQ_API_KEY=... openpika chat --model groq:llama-3.3-70b-versatile
```

Set a permanent default so you never need to pass `--model` again:

```bash
openpika config model google-gla:gemini-2.5-flash
# or via env var:
export OPENPIKA_MODEL=google-gla:gemini-2.5-flash
```

## Supported providers

| Provider | Model prefix | API key env var |
|----------|--------------|-----------------|
| Anthropic (default) | `anthropic:` | `ANTHROPIC_API_KEY` |
| Google Gemini | `google-gla:` | `GEMINI_API_KEY` |
| OpenAI | `openai:` | `OPENAI_API_KEY` |
| Groq | `groq:` | `GROQ_API_KEY` |
| Mistral | `mistral:` | `MISTRAL_API_KEY` |
| DeepSeek | `deepseek:` | `DEEPSEEK_API_KEY` |
| xAI (Grok) | `grok:` | `XAI_API_KEY` |

## Configuration

Settings are stored in `~/.openpika/config.toml`. Environment variables take priority.

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENPIKA_MODEL` | Default model (provider:name) | `anthropic:claude-sonnet-4-6` |
| `OPENPIKA_PORT` | Gateway port | `8080` |
| `OPENPIKA_HOST` | Gateway bind address | `0.0.0.0` |
| `DATABASE_URL` | Database connection string | SQLite at `~/.openpika/state.db` |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `GROQ_API_KEY` | Groq API key | — |

Example `~/.openpika/config.toml`:

```toml
model = "google-gla:gemini-2.5-flash"
port  = 8080
```

## Multi-agent swarm

Run multiple agents in a pipeline where each hands off its output to the next:

```bash
# research → write
openpika swarm run "Explain how Rust's borrow checker works" --pipeline research,write

# research → write → review
openpika swarm run "Write a guide to async Python" --pipeline research,write,review

# list built-in presets
openpika swarm presets

# list past runs
openpika swarm runs
```

## Cron scheduler

Run agent prompts on any cron schedule:

```bash
openpika cron add "Daily digest" \
  --schedule "0 9 * * *" \
  --prompt "Search the web for today's top AI news and summarise it"

openpika cron list
openpika cron run <id>     # trigger immediately
openpika cron disable <id>
openpika cron remove <id>
```

## Self-learning skills

The agent proposes reusable prompt templates after complex tasks. Review them:

```bash
openpika skills pending      # proposals awaiting your review
openpika skills approve <id>
openpika skills reject <id>
openpika skills list         # approved skills
```

## MCP server integration

Add any MCP-compatible tool server (stdio or HTTP transport):

```bash
openpika mcp add "Playwright" --command "npx @playwright/mcp"
openpika mcp add "My server" --command "http://localhost:3001/mcp"
openpika mcp list
openpika mcp enable/disable <id>
openpika mcp remove <id>
```

## Browser automation

Install Playwright to enable browser tools:

```bash
pip install 'openpika[browser]' && playwright install chromium
```

The agent gains: `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_type`, `browser_extract`, `browser_close`.

## License

MIT
