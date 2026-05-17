"""openpika cron — manage scheduled cron jobs."""

from __future__ import annotations

import asyncio

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(name="cron", help="Manage scheduled cron jobs.", no_args_is_help=True)
console = Console()


@app.command("list")
def cron_list() -> None:
    """List all cron jobs and their schedules."""
    from openpika.db import init_db, list_cron_jobs

    async def _run():
        await init_db()
        return await list_cron_jobs()

    jobs = asyncio.run(_run())

    if not jobs:
        console.print("[dim]No cron jobs configured. Use `openpika cron add` to create one.[/dim]")
        return

    table = Table(title="Cron Jobs", show_lines=True)
    table.add_column("ID", style="cyan", no_wrap=True, max_width=12)
    table.add_column("Name")
    table.add_column("Schedule")
    table.add_column("Enabled")
    table.add_column("Last Run")
    table.add_column("Next Run")
    table.add_column("Prompt (truncated)")

    for j in jobs:
        enabled_str = "[green]yes[/green]" if j.enabled else "[red]no[/red]"
        short_id = j.id[:8]
        table.add_row(
            short_id,
            j.name,
            j.schedule,
            enabled_str,
            j.last_run or "never",
            j.next_run or "—",
            j.prompt[:60] + ("…" if len(j.prompt) > 60 else ""),
        )

    console.print(table)


@app.command("add")
def cron_add(
    name: str = typer.Argument(..., help="Job name"),
    schedule: str = typer.Option(..., "--schedule", "-s",
                                 help="Cron expression, e.g. '0 9 * * *' (daily at 9 AM UTC)"),
    prompt: str = typer.Option(..., "--prompt", "-p",
                               help="Prompt the agent will receive when the job fires"),
    model: str = typer.Option("", "--model", "-m", help="Model override (uses default if omitted)"),
) -> None:
    """Add a new cron job.

    The agent will receive --prompt on the defined --schedule.

    Examples:
      openpika cron add "Daily Digest" --schedule "0 9 * * *" --prompt "Summarise yesterday's news"
      openpika cron add "Weekly Report" --schedule "0 8 * * 1" --prompt "Generate weekly status report"
    """
    from openpika.db import create_cron_job, init_db

    async def _run():
        await init_db()
        return await create_cron_job(
            name=name,
            schedule=schedule,
            prompt=prompt,
            model=model or None,
        )

    try:
        job = asyncio.run(_run())
    except Exception as exc:
        console.print(f"[red]Error:[/red] {exc}")
        raise typer.Exit(1)

    console.print(f"[green]Created[/green] cron job [cyan]{job.id[:8]}[/cyan] — {job.name}")
    console.print(f"  Schedule: {job.schedule}")
    console.print(f"  Next run: {job.next_run or '(could not compute — is croniter installed?)'}")


@app.command("remove")
def cron_remove(
    job_id: str = typer.Argument(..., help="Job ID or ID prefix (from 'openpika cron list')"),
) -> None:
    """Remove a cron job."""
    from openpika.db import delete_cron_job, init_db, list_cron_jobs

    async def _run():
        await init_db()
        jobs = await list_cron_jobs()
        # Support prefix matching
        matches = [j for j in jobs if j.id.startswith(job_id)]
        if len(matches) == 0:
            return None, "No job found with that ID or prefix."
        if len(matches) > 1:
            return None, f"Ambiguous prefix — matches {len(matches)} jobs. Use a longer prefix."
        ok = await delete_cron_job(matches[0].id)
        return matches[0], None if ok else "Delete failed."

    job, err = asyncio.run(_run())
    if err:
        console.print(f"[red]Error:[/red] {err}")
        raise typer.Exit(1)
    console.print(f"[green]Removed[/green] cron job {job.id[:8]} — {job.name}")


@app.command("enable")
def cron_enable(job_id: str = typer.Argument(..., help="Job ID or prefix")) -> None:
    """Enable a cron job."""
    _set_enabled(job_id, True)


@app.command("disable")
def cron_disable(job_id: str = typer.Argument(..., help="Job ID or prefix")) -> None:
    """Disable a cron job without deleting it."""
    _set_enabled(job_id, False)


def _set_enabled(job_id: str, enabled: bool) -> None:
    from openpika.db import init_db, list_cron_jobs, update_cron_job

    async def _run():
        await init_db()
        jobs = await list_cron_jobs()
        matches = [j for j in jobs if j.id.startswith(job_id)]
        if len(matches) != 1:
            return None
        return await update_cron_job(matches[0].id, enabled=enabled)

    job = asyncio.run(_run())
    if job:
        state = "[green]enabled[/green]" if enabled else "[red]disabled[/red]"
        console.print(f"Cron job [cyan]{job.id[:8]}[/cyan] ({job.name}) is now {state}")
    else:
        console.print(f"[red]Job '{job_id}' not found or ambiguous.[/red]")
        raise typer.Exit(1)


@app.command("run")
def cron_run(
    job_id: str = typer.Argument(..., help="Job ID or prefix to run immediately"),
) -> None:
    """Trigger a cron job immediately, outside its normal schedule."""
    from openpika.config import config
    from openpika.db import init_db, list_cron_jobs

    async def _run():
        await init_db()
        jobs = await list_cron_jobs()
        matches = [j for j in jobs if j.id.startswith(job_id)]
        if len(matches) != 1:
            return None, f"Found {len(matches)} jobs matching '{job_id}'"
        job = matches[0]
        from openpika.agent import make_agent, run_agent
        model = job.model or config.model
        agent, _ = await make_agent(model)
        reply, _ = await run_agent(agent, job.prompt, [])
        return reply, None

    result, err = asyncio.run(_run())
    if err:
        console.print(f"[red]Error:[/red] {err}")
        raise typer.Exit(1)
    console.print(result)
