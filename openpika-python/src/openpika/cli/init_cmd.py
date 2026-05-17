"""openpika init — first-run setup wizard."""

from __future__ import annotations

import sys

import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt

from openpika.config import _PROVIDER_KEY

console = Console()

MODELS = [
    "anthropic:claude-sonnet-4-6",
    "anthropic:claude-opus-4-7",
    "anthropic:claude-haiku-4-5-20251001",
    "google-gla:gemini-2.5-flash",
    "google-gla:gemini-2.5-pro",
    "openai:gpt-4o",
    "openai:gpt-4o-mini",
    "groq:llama-3.3-70b-versatile",
]


def run_wizard(first_run: bool = False) -> None:
    """Interactive setup wizard. Writes results to ~/.openpika/config.toml."""
    from openpika import config as cfg

    if first_run:
        console.print(
            Panel.fit(
                "[bold cyan]Welcome to OpenPika![/bold cyan]\n\n"
                "Let's set up your configuration. This takes about 30 seconds.\n"
                "Settings are saved to [dim]~/.openpika/config.toml[/dim]",
                border_style="cyan",
            )
        )
    else:
        console.print("[bold]OpenPika Configuration Wizard[/bold]")

    console.print()

    # --- Model ---
    console.print("[bold]1. Default model[/bold]")
    for i, m in enumerate(MODELS, 1):
        tag = "  [dim](default)[/dim]" if m == MODELS[0] else ""
        console.print(f"   {i}. {m}{tag}")
    console.print("   … or type any model string (e.g. [dim]groq:llama-3.3-70b-versatile[/dim])")

    model_input = Prompt.ask(
        "   Choose (1-8 or model name)",
        default=cfg.config.model or MODELS[0],
    ).strip()

    if model_input.isdigit() and 1 <= int(model_input) <= len(MODELS):
        model = MODELS[int(model_input) - 1]
    else:
        model = model_input or MODELS[0]

    # Normalise bare names
    if ":" not in model:
        model = f"anthropic:{model}"

    # --- API Key for the chosen provider ---
    provider = model.split(":")[0]
    env_var = _PROVIDER_KEY.get(provider, "ANTHROPIC_API_KEY")
    import os
    current_key = cfg.config.api_key if provider == "anthropic" else os.environ.get(env_var, "")
    masked = f"...{current_key[-6:]}" if len(current_key) > 6 else "(not set)"

    console.print()
    console.print(
        f"[bold]2. API key for [cyan]{provider}[/cyan][/bold]"
        f"  [dim]env: {env_var}  current: {masked}[/dim]"
    )

    api_key = Prompt.ask(
        "   API key",
        default=current_key or "",
        password=True,
    ).strip()

    if not api_key:
        console.print("[red]  API key is required.[/red]")
        sys.exit(1)

    # --- Port ---
    console.print()
    console.print("[bold]3. Gateway port[/bold]")
    port_str = Prompt.ask(
        "   Port",
        default=str(cfg.config.gateway_port),
    ).strip()

    try:
        port = int(port_str)
    except ValueError:
        console.print("[yellow]  Invalid port, using 8080.[/yellow]")
        port = 8080

    # --- Save ---
    # Store under the canonical env var name so multi-provider configs work
    updates: dict = {
        "model": model,
        "port": port,
    }
    if provider == "anthropic":
        updates["api_key"] = api_key
    else:
        # Write to .env so the SDK can pick it up
        from openpika.config import CONFIG_DIR, ENV_FILE
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        env_line = f'{env_var}="{api_key}"\n'
        existing = ENV_FILE.read_text() if ENV_FILE.exists() else ""
        # Replace existing line or append
        lines = [line for line in existing.splitlines(keepends=True) if not line.startswith(f"{env_var}=")]
        lines.append(env_line)
        ENV_FILE.write_text("".join(lines))
        console.print("   [dim]Saved to ~/.openpika/.env[/dim]")

    cfg.save(updates)
    cfg.config.__init__()  # type: ignore[misc]

    console.print()
    console.print(
        Panel.fit(
            "[green]Configuration saved![/green]\n\n"
            f"  Model : [cyan]{model}[/cyan]\n"
            f"  Port  : [cyan]{port}[/cyan]\n"
            f"  Config: [dim]~/.openpika/config.toml[/dim]\n\n"
            "Run [bold]openpika run \"hello\"[/bold] to test your setup.",
            border_style="green",
        )
    )


def main(
    reset: bool = typer.Option(False, "--reset", help="Reset all settings to defaults"),
) -> None:
    """Interactive setup wizard — configure API key, model, and gateway port."""
    if reset:
        from openpika.config import CONFIG_FILE
        if CONFIG_FILE.exists():
            CONFIG_FILE.unlink()
            console.print("[yellow]Configuration reset.[/yellow]")
    run_wizard(first_run=False)
