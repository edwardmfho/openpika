"""CLI commands for multi-agent swarm pipelines."""

from __future__ import annotations

import asyncio
import json

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Run multi-agent swarm pipelines.", no_args_is_help=True)
console = Console()


@app.command("presets")
def list_presets() -> None:
    """List available built-in swarm node presets."""
    from openpika.swarm import PRESETS

    table = Table(title="Swarm Presets", show_lines=True)
    table.add_column("Key", style="cyan", no_wrap=True)
    table.add_column("Node name", style="green")
    table.add_column("Subscribes to", style="yellow")
    table.add_column("Publishes")

    for key, cfg in PRESETS.items():
        table.add_row(
            key,
            cfg.name,
            ", ".join(cfg.subscribes_to),
            cfg.output_event,
        )

    console.print(table)
    console.print()
    console.print("[dim]Usage: openpika swarm run 'task' --pipeline research,write[/dim]")


@app.command("run")
def run_cmd(
    task: str = typer.Argument(..., help="High-level task for the swarm to accomplish"),
    pipeline: str = typer.Option(
        "research,write",
        "--pipeline",
        "-p",
        help="Comma-separated list of preset keys (e.g. research,write,review)",
    ),
    model: str = typer.Option("", "--model", "-m", help="Model override for all nodes"),
    timeout: float = typer.Option(300.0, "--timeout", "-t", help="Max seconds to wait"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON event log"),
) -> None:
    """Run a multi-agent swarm pipeline and print the final output.

    Example pipelines:
        research,write          — research then write
        research,write,review   — research → write → critic review
        research,analyse        — research then analyse (runs concurrently)
        research                — research only
    """
    asyncio.run(_run(task, pipeline, model, timeout, json_output))


async def _run(
    task: str,
    pipeline_str: str,
    model: str,
    timeout: float,
    json_output: bool,
) -> None:
    from openpika.swarm import PRESETS, NodeConfig, Swarm

    preset_keys = [k.strip() for k in pipeline_str.split(",") if k.strip()]
    unknown = [k for k in preset_keys if k not in PRESETS]
    if unknown:
        console.print(f"[red]Unknown preset(s): {unknown}[/red]")
        console.print(f"[dim]Available: {list(PRESETS)}[/dim]")
        raise typer.Exit(1)

    nodes: list[NodeConfig] = []
    for key in preset_keys:
        cfg = PRESETS[key]
        if model:
            from dataclasses import replace

            cfg = replace(cfg, model=model)
        nodes.append(cfg)

    node_names = [n.name for n in nodes]
    console.print(f"[bold]Swarm pipeline:[/bold] {' → '.join(node_names)}")
    console.print(f"[bold]Task:[/bold] {task}")
    console.print()

    swarm = Swarm(nodes)

    with console.status("[yellow]Running swarm...[/yellow]"):
        events = await swarm.run(task, timeout=timeout)

    if json_output:
        console.print_json(json.dumps([e.model_dump() for e in events]))
        return

    console.print(f"[dim]─── {len(events)} events in {swarm.session_id} ───[/dim]")
    console.print()

    for evt in events:
        if evt.event_type == "TaskAssignedEvent":
            continue
        if evt.event_type == "AgentErrorEvent":
            console.print(f"[red][{evt.source_agent}] ERROR:[/red] {evt.payload.get('error', '')}")
            continue
        label = evt.event_type.replace("Event", "").replace("Completed", " ✓")
        result = evt.payload.get("result", "")
        console.print(f"[green][{evt.source_agent}][/green] {label}")
        console.rule()
        console.print(result)
        console.print()


@app.command("runs")
def list_runs(
    limit: int = typer.Option(20, "--limit", "-n", help="Number of recent runs to show"),
) -> None:
    """List recent swarm runs from the database."""
    asyncio.run(_list_runs(limit))


async def _list_runs(limit: int) -> None:
    from openpika.db import init_db, list_swarm_runs

    await init_db()
    runs = await list_swarm_runs(limit=limit)

    if not runs:
        console.print("[dim]No swarm runs found.[/dim]")
        return

    table = Table(title=f"Recent Swarm Runs (limit {limit})", show_lines=True)
    table.add_column("ID", style="dim", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Pipeline", style="cyan")
    table.add_column("Task")
    table.add_column("Started at", style="dim")

    for run in runs:
        status_style = {
            "completed": "[green]completed[/green]",
            "running": "[yellow]running[/yellow]",
            "error": "[red]error[/red]",
            "timeout": "[red]timeout[/red]",
        }.get(run.status, run.status)

        table.add_row(
            run.id[:8] + "…",
            status_style,
            " → ".join(run.pipeline),
            run.task[:60] + ("…" if len(run.task) > 60 else ""),
            run.started_at,
        )

    console.print(table)
