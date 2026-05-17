"""openpika mcp — manage MCP server tool configurations."""

from __future__ import annotations

import asyncio
import json

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(name="mcp", help="Manage MCP server tool registrations.", no_args_is_help=True)
console = Console()


@app.command("list")
def mcp_list() -> None:
    """List all registered tools (native built-ins and MCP servers)."""
    from openpika.db import init_db, list_tools

    async def _run():
        await init_db()
        return await list_tools()

    tools = asyncio.run(_run())

    table = Table(title="Registered Tools", show_lines=True)
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("Name")
    table.add_column("Kind", style="dim")
    table.add_column("Enabled")
    table.add_column("Description")

    for t in tools:
        enabled_str = "[green]yes[/green]" if t.enabled else "[red]no[/red]"
        table.add_row(t.id, t.name, t.kind, enabled_str, t.description)

    console.print(table)


@app.command("add")
def mcp_add(
    name: str = typer.Argument(..., help="Human-readable name for the MCP server"),
    command: str = typer.Option(
        ...,
        "--command",
        "-c",
        help="Command to run (stdio) or full URL (http). e.g. 'npx @playwright/mcp' or 'http://localhost:3001/mcp'",
    ),
    description: str = typer.Option("", "--description", "-d", help="Short description"),
    args: str = typer.Option("", "--args", "-a", help="Extra CLI arguments as JSON array, e.g. '[\"--headless\"]'"),
    env: str = typer.Option("", "--env", "-e", help='Extra env vars as JSON object, e.g. \'{"PORT": "3001"}\''),
) -> None:
    """Register a new MCP server tool (stdio or HTTP transport).

    Examples:
      openpika mcp add "Playwright Browser" --command "npx @playwright/mcp"
      openpika mcp add "Custom Server" --command "http://localhost:3001/mcp"
    """
    is_http = command.startswith("http://") or command.startswith("https://")
    kind = "mcp_http" if is_http else "mcp_stdio"

    cfg: dict = {}
    if is_http:
        cfg["url"] = command
    else:
        cfg["command"] = command
        if args:
            try:
                cfg["args"] = json.loads(args)
            except json.JSONDecodeError:
                console.print("[red]Error:[/red] --args must be a valid JSON array")
                raise typer.Exit(1)
        if env:
            try:
                cfg["env"] = json.loads(env)
            except json.JSONDecodeError:
                console.print("[red]Error:[/red] --env must be a valid JSON object")
                raise typer.Exit(1)

    from openpika.db import create_tool, init_db

    async def _run():
        await init_db()
        return await create_tool(name=name, kind=kind, description=description, config=cfg)

    tool = asyncio.run(_run())
    console.print(f"[green]Registered[/green] {kind} tool [cyan]{tool.id}[/cyan] — {tool.name}")
    console.print(f"  Config: {json.dumps(tool.config, indent=2)}")


@app.command("remove")
def mcp_remove(
    tool_id: str = typer.Argument(..., help="Tool ID to remove (from 'openpika mcp list')"),
) -> None:
    """Remove an MCP server tool. Native built-in tools cannot be removed."""
    from openpika.db import delete_tool, init_db

    async def _run():
        await init_db()
        return await delete_tool(tool_id)

    ok = asyncio.run(_run())
    if ok:
        console.print(f"[green]Removed[/green] tool {tool_id}")
    else:
        console.print(f"[red]Failed:[/red] tool '{tool_id}' not found or is a built-in native tool.")
        raise typer.Exit(1)


@app.command("test")
def mcp_test(
    tool_id: str = typer.Argument(..., help="Tool ID to test (from 'openpika mcp list')"),
) -> None:
    """Test connectivity for a registered MCP server tool.

    For stdio servers: verifies the command is found in PATH.
    For HTTP servers:  sends a GET request and checks for a reachable host.
    """
    from openpika.db import get_tool, init_db

    async def _run():
        await init_db()
        return await get_tool(tool_id)

    tool = asyncio.run(_run())
    if tool is None:
        console.print(f"[red]Tool '{tool_id}' not found.[/red]")
        raise typer.Exit(1)

    if tool.kind == "native":
        console.print(f"[yellow]{tool.name}[/yellow] is a native built-in — no external connection to test.")
        return

    if tool.kind == "mcp_stdio":
        import shutil

        cmd = tool.config.get("command", "")
        exe = cmd.split()[0] if cmd else ""
        if not exe:
            console.print("[red]No command configured for this stdio tool.[/red]")
            raise typer.Exit(1)
        found = shutil.which(exe)
        if found:
            console.print(f"[green]OK[/green] — '{exe}' found at {found}")
        else:
            console.print(f"[red]FAIL[/red] — '{exe}' not found in PATH")
            raise typer.Exit(1)

    elif tool.kind == "mcp_http":
        import urllib.error
        import urllib.request

        url = tool.config.get("url", "")
        if not url:
            console.print("[red]No URL configured for this HTTP tool.[/red]")
            raise typer.Exit(1)
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                console.print(f"[green]OK[/green] — {url} responded with HTTP {resp.status}")
        except urllib.error.HTTPError as exc:
            # Any HTTP response means the host is reachable
            console.print(f"[green]OK[/green] — {url} reachable (HTTP {exc.code})")
        except Exception as exc:
            console.print(f"[red]FAIL[/red] — could not reach {url}: {exc}")
            raise typer.Exit(1)


@app.command("enable")
def mcp_enable(tool_id: str = typer.Argument(...)) -> None:
    """Enable a tool globally."""
    _set_enabled(tool_id, True)


@app.command("disable")
def mcp_disable(tool_id: str = typer.Argument(...)) -> None:
    """Disable a tool globally."""
    _set_enabled(tool_id, False)


def _set_enabled(tool_id: str, enabled: bool) -> None:
    from openpika.db import init_db, update_tool

    async def _run():
        await init_db()
        return await update_tool(tool_id, enabled=enabled)

    tool = asyncio.run(_run())
    if tool:
        state = "[green]enabled[/green]" if enabled else "[red]disabled[/red]"
        console.print(f"Tool [cyan]{tool.id}[/cyan] ({tool.name}) is now {state}")
    else:
        console.print(f"[red]Tool '{tool_id}' not found.[/red]")
        raise typer.Exit(1)
