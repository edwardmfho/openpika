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

## License

MIT
