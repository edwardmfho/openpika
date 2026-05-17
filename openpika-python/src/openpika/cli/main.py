"""OpenPika CLI entry point."""

from __future__ import annotations

import typer
from rich.console import Console

app = typer.Typer(
    name="openpika",
    help="OpenPika — enterprise AI agent engine",
    no_args_is_help=True,
    pretty_exceptions_enable=False,
)

console = Console()


@app.command("init")
def init_cmd(
    reset: bool = typer.Option(False, "--reset", help="Reset all settings to defaults"),
) -> None:
    """Interactive setup wizard — configure API key, model, and gateway port."""
    from openpika.cli.init_cmd import main

    main(reset=reset)


@app.command("run")
def run_cmd(
    task: str = typer.Argument(..., help="Task or question for the agent"),
    model: str = typer.Option("", "--model", "-m", help="Model ID override"),
    plain: bool = typer.Option(False, "--plain", "-p", help="Plain text output (no markdown)"),
    no_tools: bool = typer.Option(False, "--no-tools", help="Disable tool use"),
) -> None:
    """Run a one-shot task and print the result."""
    from openpika.cli.run_cmd import main

    main(task=task, model=model, plain=plain, no_tools=no_tools)


@app.command("chat")
def chat_cmd(
    model: str = typer.Option("", "--model", "-m", help="Model ID override"),
    plain: bool = typer.Option(False, "--plain", help="Plain text output (no markdown)"),
    system: str = typer.Option("", "--system", help="Override system prompt"),
) -> None:
    """Start an interactive chat session."""
    from openpika.cli.chat_cmd import main

    main(model=model, plain=plain, system=system)


@app.command("serve")
def serve_cmd(
    host: str = typer.Option("", "--host", "-H", help="Bind address"),
    port: int = typer.Option(0, "--port", "-p", help="Bind port"),
    python_only: bool = typer.Option(False, "--python", help="Force pure-Python gateway"),
    workers: int = typer.Option(1, "--workers", "-w", help="Uvicorn worker count (Python mode)"),
) -> None:
    """Start the OpenPika gateway (Rust if available, else Python)."""
    from openpika.cli.serve_cmd import main

    main(host=host, port=port, python_only=python_only, workers=workers)


@app.command("config")
def config_cmd(
    key: str = typer.Argument("", help="Config key to read (omit to show all)"),
    value: str = typer.Argument("", help="Value to set"),
) -> None:
    """Show or update configuration values."""
    from openpika import config as cfg

    if key and value:
        # Type-coerce simple values
        parsed: object = value
        if value.isdigit():
            parsed = int(value)
        elif value.lower() in ("true", "false"):
            parsed = value.lower() == "true"
        cfg.save({key: parsed})
        console.print(f"[green]Set[/green] {key} = {parsed!r}")
    elif key:
        val = getattr(cfg.config, key, None)
        if val is None:
            console.print(f"[red]Unknown key:[/red] {key}")
        else:
            console.print(f"{key} = {val!r}")
    else:
        c = cfg.config
        rows = [
            ("api_key", "***" if c.api_key else "(not set)"),
            ("model", c.model),
            ("gateway_host", c.gateway_host),
            ("gateway_port", str(c.gateway_port)),
            ("database_url", c.database_url),
            ("log_level", c.log_level),
            ("max_tokens", str(c.max_tokens)),
            ("raw_turns", str(c.raw_turns)),
        ]
        from rich.table import Table

        table = Table(show_header=False, box=None, padding=(0, 2))
        table.add_column(style="dim")
        table.add_column()
        for k, v in rows:
            table.add_row(k, v)
        console.print(table)


@app.command("ui")
def ui_cmd(
    port: int = typer.Option(3000, "--port", "-p", help="UI port"),
    host: str = typer.Option("0.0.0.0", "--host", "-H", help="UI bind address"),
    backend_port: int = typer.Option(8080, "--backend-port", help="Backend gateway port"),
    backend_host: str = typer.Option("0.0.0.0", "--backend-host", help="Backend bind address"),
    ui_dir: str = typer.Option("", "--ui-dir", help="Path to openpika-ui directory (auto-detected if omitted)"),  # noqa: E501
    python: bool = typer.Option(False, "--python", help="Force pure-Python backend (ignore Rust binary)"),  # noqa: E501
) -> None:
    """Start the backend gateway and React web UI together."""
    from openpika.cli.ui_cmd import main

    main(
        port=port,
        host=host,
        backend_port=backend_port,
        backend_host=backend_host,
        ui_dir=ui_dir or None,
        python_only=python,
    )


@app.command("version")
def version_cmd() -> None:
    """Print the installed OpenPika version."""
    from openpika import __version__

    console.print(f"openpika {__version__}")


# ---------------------------------------------------------------------------
# Sub-apps: mcp / cron / skills
# ---------------------------------------------------------------------------

from openpika.cli.cron_cmd import app as _cron_app  # noqa: E402
from openpika.cli.mcp_cmd import app as _mcp_app  # noqa: E402
from openpika.cli.skills_cmd import app as _skills_app  # noqa: E402
from openpika.cli.swarm_cmd import app as _swarm_app  # noqa: E402

app.add_typer(_mcp_app, name="mcp", help="Manage MCP server tool registrations.")
app.add_typer(_cron_app, name="cron", help="Manage scheduled cron jobs.")
app.add_typer(_skills_app, name="skills", help="Manage skills and agent skill proposals.")
app.add_typer(_swarm_app, name="swarm", help="Run multi-agent swarm pipelines.")
