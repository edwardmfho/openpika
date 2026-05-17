"""OpenPika configuration — auto-loads from .env, config.toml, and env vars.

Priority (highest wins):
  1. Environment variables  (ANTHROPIC_API_KEY, OPENPIKA_MODEL, …)
  2. ~/.openpika/config.toml
  3. .env in cwd or ~/.openpika/.env
  4. Built-in defaults
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

CONFIG_DIR = Path.home() / ".openpika"
CONFIG_FILE = CONFIG_DIR / "config.toml"
DB_FILE = CONFIG_DIR / "state.db"
ENV_FILE = CONFIG_DIR / ".env"

_PROVIDER_KEY: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "google-gla": "GOOGLE_API_KEY",
    "google-vertex": "GOOGLE_APPLICATION_CREDENTIALS",
    "openai": "OPENAI_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "grok": "XAI_API_KEY",
    "xai": "XAI_API_KEY",
}


def _load_dotenv() -> None:
    """Load .env silently; never crash."""
    try:
        from dotenv import load_dotenv
        # project .env first, then ~/.openpika/.env
        load_dotenv(dotenv_path=Path.cwd() / ".env", override=False)
        load_dotenv(dotenv_path=ENV_FILE, override=False)
    except Exception:
        pass
    # pydantic-ai's Google provider reads GOOGLE_API_KEY; alias GEMINI_API_KEY → GOOGLE_API_KEY
    if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
    if os.environ.get("GOOGLE_API_KEY") and not os.environ.get("GEMINI_API_KEY"):
        os.environ["GEMINI_API_KEY"] = os.environ["GOOGLE_API_KEY"]


def _load_toml() -> dict:
    try:
        import tomllib
        if CONFIG_FILE.exists():
            return tomllib.loads(CONFIG_FILE.read_text())
    except Exception:
        pass
    return {}


class Config:
    """Flat config object resolved at import time."""

    def __init__(self) -> None:
        _load_dotenv()
        toml = _load_toml()

        self.model: str = (
            os.environ.get("OPENPIKA_MODEL")
            or toml.get("model", "anthropic:claude-sonnet-4-6")
        )
        self.api_key: str = (
            os.environ.get("ANTHROPIC_API_KEY")
            or toml.get("api_key", "")
        )
        # Ensure pydantic-ai providers can find the key via os.environ.
        # The key stored in TOML is always the active provider's key; backfill
        # the corresponding env var so provider constructors can locate it.
        if self.api_key:
            provider = (self.model.split(":")[0] if ":" in self.model else "anthropic")
            env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")
            if not os.environ.get(env_var):
                os.environ[env_var] = self.api_key
        self.database_url: str = (
            os.environ.get("DATABASE_URL")
            or os.environ.get("OPENPIKA_DATABASE_URL")
            or toml.get("database_url", f"sqlite:///{DB_FILE}")
        )
        self.gateway_host: str = (
            os.environ.get("OPENPIKA_HOST")
            or toml.get("host", "0.0.0.0")
        )
        self.gateway_port: int = int(
            os.environ.get("OPENPIKA_PORT")
            or toml.get("port", 8080)
        )
        self.log_level: str = (
            os.environ.get("OPENPIKA_LOG_LEVEL")
            or toml.get("log_level", "info")
        )
        self.max_tokens: int = int(
            os.environ.get("OPENPIKA_MAX_TOKENS")
            or toml.get("max_tokens", 100_000)
        )
        self.raw_turns: int = int(
            os.environ.get("OPENPIKA_RAW_TURNS")
            or toml.get("raw_turns", 6)
        )
        self.webhook_secret: str = (
            os.environ.get("OPENPIKA_WEBHOOK_SECRET")
            or toml.get("webhook_secret", "")
        )

    def require_api_key(self) -> str:
        """Return the API key for the configured provider, or exit with setup instructions."""
        provider = self.model.split(":")[0] if ":" in self.model else "anthropic"
        env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")
        key = self.api_key if provider == "anthropic" else os.environ.get(env_var, "")
        if key:
            return key
        from rich.console import Console
        Console().print(
            f"\n[bold red]No API key configured.[/bold red]\n"
            f"Provider [cyan]{provider}[/cyan] requires [yellow]{env_var}[/yellow] to be set.\n\n"
            f"Run [bold green]openpika init[/bold green] to configure your setup.\n"
        )
        sys.exit(1)

    def api_key_for_provider(self, provider: str) -> str:
        """Return the API key for a given provider string, or empty string if not set."""
        env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")
        return self.api_key if provider == "anthropic" else os.environ.get(env_var, "")


# Module-level singleton — re-read on each CLI invocation via reload
config = Config()


def save(updates: dict) -> None:
    """Merge `updates` into ~/.openpika/config.toml (creates file if missing)."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    # Read existing
    existing: dict = {}
    if CONFIG_FILE.exists():
        try:
            import tomllib
            existing = tomllib.loads(CONFIG_FILE.read_text())
        except Exception:
            pass

    existing.update(updates)

    # Write (use tomli-w if available, otherwise hand-craft simple TOML)
    try:
        import tomli_w
        CONFIG_FILE.write_text(tomli_w.dumps(existing))
    except ImportError:
        lines = ["# OpenPika configuration\n"]
        for k, v in existing.items():
            if isinstance(v, str):
                lines.append(f'{k} = "{v}"\n')
            else:
                lines.append(f"{k} = {v}\n")
        CONFIG_FILE.write_text("".join(lines))
