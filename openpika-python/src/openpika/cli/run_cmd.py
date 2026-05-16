"""openpika run — one-shot task execution."""

from __future__ import annotations

import asyncio
import sys

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.spinner import Spinner
from rich.live import Live

console = Console()


def main(
    task: str = typer.Argument(..., help="Task or question for the agent"),
    model: str = typer.Option("", "--model", "-m", help="Model ID override"),
    plain: bool = typer.Option(False, "--plain", "-p", help="Plain text output (no markdown)"),
    no_tools: bool = typer.Option(False, "--no-tools", help="Disable tool use"),
) -> None:
    """Run a one-shot task and print the result."""
    from openpika.config import config
    from openpika.agent import get_agent

    model_id = model or config.model
    provider = model_id.split(":")[0] if ":" in model_id else "anthropic"
    if provider == "anthropic":
        import os
        os.environ.setdefault("ANTHROPIC_API_KEY", config.require_api_key())

    agent = get_agent(model_id)

    async def _run() -> str:
        result = await agent.run(task)
        return result.output

    with Live(Spinner("dots", text="[cyan]Thinking…[/cyan]"), console=console, transient=True):
        try:
            output = asyncio.run(_run())
        except Exception as exc:
            console.print(f"[red]Error:[/red] {exc}")
            sys.exit(1)

    if plain:
        console.print(output)
    else:
        console.print(Markdown(output))
