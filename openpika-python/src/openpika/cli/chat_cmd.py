"""openpika chat — interactive REPL."""

from __future__ import annotations

import asyncio
import sys
from typing import Any

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.spinner import Spinner
from rich.live import Live

console = Console()

QUIT_COMMANDS = {"exit", "quit", "q", ":q", "/exit", "/quit"}


def _print_welcome(model_id: str) -> None:
    console.print(
        Panel.fit(
            f"[bold cyan]OpenPika Chat[/bold cyan]  [dim]model: {model_id}[/dim]\n\n"
            "Type your message and press Enter.\n"
            "[dim]exit / quit / Ctrl-C to leave[/dim]",
            border_style="cyan",
        )
    )


def main(
    model: str = typer.Option("", "--model", "-m", help="Model ID override"),
    plain: bool = typer.Option(False, "--plain", help="Plain text output (no markdown)"),
    system: str = typer.Option("", "--system", help="Override system prompt"),
) -> None:
    """Start an interactive chat session."""
    from openpika.config import config
    from openpika.agent import get_agent, SYSTEM_PROMPT

    model_id = model or config.model
    provider = model_id.split(":")[0] if ":" in model_id else "anthropic"
    if provider == "anthropic":
        import os
        os.environ.setdefault("ANTHROPIC_API_KEY", config.require_api_key())

    agent = get_agent(model_id)
    _print_welcome(model_id)

    history: list[Any] = []

    async def _turn(user_input: str) -> str:
        result = await agent.run(user_input, message_history=history)
        history.extend(result.new_messages())
        return result.output

    while True:
        try:
            user_input = Prompt.ask("\n[bold green]You[/bold green]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break

        if not user_input:
            continue
        if user_input.lower() in QUIT_COMMANDS:
            console.print("[dim]Goodbye![/dim]")
            break

        with Live(Spinner("dots", text="[cyan]Thinking…[/cyan]"), console=console, transient=True):
            try:
                reply = asyncio.run(_turn(user_input))
            except Exception as exc:
                console.print(f"[red]Error:[/red] {exc}")
                continue

        console.print()
        console.print("[bold blue]OpenPika[/bold blue]")
        if plain:
            console.print(reply)
        else:
            console.print(Markdown(reply))
