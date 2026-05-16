"""openpika skills — manage skills and review agent-proposed skill proposals."""

from __future__ import annotations

import asyncio

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

app = typer.Typer(name="skills", help="Manage skills and agent skill proposals.", no_args_is_help=True)
console = Console()


@app.command("list")
def skills_list() -> None:
    """List all skills (built-in and user-created)."""
    from openpika.db import init_db, list_skills

    async def _run():
        await init_db()
        return await list_skills()

    skills = asyncio.run(_run())

    table = Table(title="Skills", show_lines=True)
    table.add_column("ID", style="cyan", no_wrap=True, max_width=12)
    table.add_column("Name")
    table.add_column("Built-in")
    table.add_column("Pinned")
    table.add_column("Description")

    for s in skills:
        table.add_row(
            s.id[:8],
            s.name,
            "[dim]yes[/dim]" if s.is_builtin else "no",
            "[bold]yes[/bold]" if s.pinned else "no",
            s.description,
        )

    console.print(table)


@app.command("pending")
def skills_pending() -> None:
    """Show skills proposed by the agent that are awaiting your approval."""
    from openpika.db import init_db, list_pending_skills

    async def _run():
        await init_db()
        return await list_pending_skills(status="pending")

    proposals = asyncio.run(_run())

    if not proposals:
        console.print("[green]No pending skill proposals.[/green]")
        return

    console.print(f"\n[bold]{len(proposals)} pending skill proposal(s)[/bold]\n")

    for p in proposals:
        short_id = p.id[:8]
        content = (
            f"[bold]ID:[/bold]          {short_id}\n"
            f"[bold]Name:[/bold]        {p.name}\n"
            f"[bold]Description:[/bold] {p.description}\n"
            f"[bold]Proposed:[/bold]    {p.created_at}\n\n"
            f"[bold]Prompt template:[/bold]\n{p.prompt_template}"
        )
        if p.params_schema:
            import json
            content += f"\n\n[bold]Parameters:[/bold]\n{json.dumps(p.params_schema, indent=2)}"

        console.print(
            Panel(
                content,
                title=f"[cyan]Proposal {short_id}[/cyan]",
                subtitle=f"approve: openpika skills approve {short_id}  |  reject: openpika skills reject {short_id}",
            )
        )


@app.command("approve")
def skills_approve(
    skill_id: str = typer.Argument(..., help="Proposal ID or prefix"),
) -> None:
    """Approve a pending skill proposal — it becomes a permanent skill."""
    _resolve(skill_id, approve=True)


@app.command("reject")
def skills_reject(
    skill_id: str = typer.Argument(..., help="Proposal ID or prefix"),
) -> None:
    """Reject a pending skill proposal."""
    _resolve(skill_id, approve=False)


def _resolve(skill_id_prefix: str, approve: bool) -> None:
    from openpika.db import init_db, list_pending_skills, resolve_pending_skill

    async def _run():
        await init_db()
        pending = await list_pending_skills(status="pending")
        matches = [p for p in pending if p.id.startswith(skill_id_prefix)]
        if len(matches) == 0:
            return None, f"No pending proposal found matching '{skill_id_prefix}'"
        if len(matches) > 1:
            return None, f"Ambiguous prefix — matches {len(matches)} proposals"
        ok = await resolve_pending_skill(matches[0].id, approve=approve)
        return matches[0], None if ok else "Resolve failed unexpectedly."

    proposal, err = asyncio.run(_run())
    if err:
        console.print(f"[red]Error:[/red] {err}")
        raise typer.Exit(1)

    action = "approved" if approve else "rejected"
    color = "green" if approve else "yellow"
    console.print(f"[{color}]{action.capitalize()}[/{color}] skill proposal [cyan]{proposal.id[:8]}[/cyan] — {proposal.name}")
    if approve:
        console.print("  The skill is now available. Run `openpika skills list` to see it.")


@app.command("delete")
def skills_delete(
    skill_id: str = typer.Argument(..., help="Skill ID (from 'openpika skills list')"),
) -> None:
    """Delete a user-created skill. Built-in skills cannot be deleted."""
    from openpika.db import init_db, delete_skill

    async def _run():
        await init_db()
        return await delete_skill(skill_id)

    ok = asyncio.run(_run())
    if ok:
        console.print(f"[green]Deleted[/green] skill {skill_id}")
    else:
        console.print(f"[red]Failed:[/red] skill '{skill_id}' not found or is a built-in skill.")
        raise typer.Exit(1)
