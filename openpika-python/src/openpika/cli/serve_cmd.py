"""openpika serve — start the gateway server."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import typer
from rich.console import Console

console = Console()

_RUST_BINARY_NAMES = ["openpika", "openpika-core"]


def _find_rust_binary() -> Path | None:
    """Look for the compiled Rust binary next to this package or on PATH."""
    # 1. Same dir as the running Python executable (installed alongside)
    bin_dir = Path(sys.executable).parent
    for name in _RUST_BINARY_NAMES:
        p = bin_dir / name
        if p.exists() and os.access(p, os.X_OK):
            return p

    # 2. Cargo release target (dev / CI use)
    for candidate in [
        Path.cwd() / "target" / "release" / "openpika",
        Path(__file__).parents[6] / "target" / "release" / "openpika",
    ]:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return candidate

    # 3. System PATH
    found = shutil.which("openpika-core")
    if found:
        return Path(found)

    return None


def main(
    host: str = typer.Option("", "--host", "-H", help="Bind address"),
    port: int = typer.Option(0, "--port", "-p", help="Bind port"),
    python_only: bool = typer.Option(False, "--python", help="Force pure-Python gateway"),
    workers: int = typer.Option(1, "--workers", "-w", help="Uvicorn worker count (Python mode)"),
) -> None:
    """Start the OpenPika gateway.

    Uses the compiled Rust binary when available; falls back to the built-in
    pure-Python ASGI gateway (requires fastapi + uvicorn).
    """
    from openpika.config import config

    _ = config.require_api_key()

    bind_host = host or config.gateway_host
    bind_port = port or config.gateway_port

    rust_bin = None if python_only else _find_rust_binary()

    if rust_bin:
        console.print(f"[cyan]Starting Rust gateway[/cyan]  {rust_bin}")
        console.print(f"[dim]Listening on {bind_host}:{bind_port}[/dim]")
        env = {**os.environ, "OPENPIKA_HOST": bind_host, "OPENPIKA_PORT": str(bind_port)}
        try:
            subprocess.run([str(rust_bin), "serve"], env=env, check=True)
        except KeyboardInterrupt:
            pass
        except subprocess.CalledProcessError as exc:
            console.print(f"[red]Rust gateway exited with code {exc.returncode}[/red]")
            sys.exit(exc.returncode)
    else:
        if not python_only:
            console.print("[yellow]Rust binary not found — using pure-Python gateway.[/yellow]")
        console.print(f"[cyan]Starting Python gateway[/cyan]  {bind_host}:{bind_port}")
        _start_python_gateway(bind_host, bind_port, workers)


def _start_python_gateway(host: str, port: int, workers: int) -> None:
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        console.print("[red]uvicorn is not installed.[/red]\nRun: [bold]pip install 'openpika[server]'[/bold]")
        sys.exit(1)

    import uvicorn

    console.print("[dim]Press Ctrl-C to stop[/dim]")
    uvicorn.run(
        "openpika.server:app",
        host=host,
        port=port,
        workers=workers,
        log_level="info",
    )
