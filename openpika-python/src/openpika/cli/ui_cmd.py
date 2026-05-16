"""openpika ui — launch the backend gateway + Next.js web UI."""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

from rich.console import Console

console = Console()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_elf(p: Path) -> bool:
    """Return True if the file starts with the ELF magic bytes (compiled binary)."""
    try:
        with p.open("rb") as f:
            return f.read(4) == b"\x7fELF"
    except OSError:
        return False


def _find_rust_binary() -> Path | None:
    """Locate the compiled openpika Rust binary."""
    bin_dir = Path(sys.executable).parent
    p = bin_dir / "openpika"
    if p.exists() and os.access(p, os.X_OK) and _is_elf(p):
        return p

    for candidate in [
        Path.cwd() / "target" / "release" / "openpika",
        Path(__file__).parents[6] / "target" / "release" / "openpika",
    ]:
        if candidate.exists() and os.access(candidate, os.X_OK) and _is_elf(candidate):
            return candidate

    found = shutil.which("openpika")
    if found:
        fp = Path(found)
        if _is_elf(fp):
            return fp

    return None


def _find_ui_dir(explicit: str | None) -> Path:
    """Locate the openpika-ui Next.js directory."""
    if explicit:
        p = Path(explicit)
        if not p.exists():
            console.print(f"[red]UI directory not found:[/red] {p}")
            sys.exit(1)
        return p

    env_path = os.environ.get("OPENPIKA_UI_DIR")
    if env_path:
        p = Path(env_path)
        if not p.exists():
            console.print(f"[red]OPENPIKA_UI_DIR not found:[/red] {p}")
            sys.exit(1)
        return p

    # Walk up from this file looking for openpika-ui/package.json
    for parent in Path(__file__).parents:
        candidate = parent / "openpika-ui"
        if (candidate / "package.json").exists():
            return candidate

    # Try CWD
    candidate = Path.cwd() / "openpika-ui"
    if (candidate / "package.json").exists():
        return candidate

    console.print(
        "[red]Could not find openpika-ui directory.[/red]\n"
        "Pass [bold]--ui-dir <path>[/bold] or set [bold]OPENPIKA_UI_DIR[/bold]."
    )
    sys.exit(1)


def _wait_for_port(proc: subprocess.Popen, host: str, port: int, timeout: int = 30) -> bool:
    """Return True when the port accepts connections.
    Returns False on timeout or if the process dies before becoming ready."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False  # process already exited
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.3)
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    port: int = 3000,
    host: str = "0.0.0.0",
    backend_port: int = 8080,
    backend_host: str = "0.0.0.0",
    ui_dir: str | None = None,
    python_only: bool = False,
) -> None:
    from openpika.config import config
    _ = config.require_api_key()

    ui_path = _find_ui_dir(ui_dir)

    # Install node_modules if missing
    if not (ui_path / "node_modules").exists():
        console.print("[yellow]Installing UI dependencies…[/yellow]")
        result = subprocess.run(["npm", "install", "--silent"], cwd=ui_path)
        if result.returncode != 0:
            console.print("[red]npm install failed — is Node.js installed?[/red]")
            sys.exit(1)

    # ── Start backend ────────────────────────────────────────────────────────
    rust_bin = None if python_only else _find_rust_binary()
    backend_proc: subprocess.Popen | None = None

    if rust_bin:
        console.print(f"  [green]▶[/green] Backend  → http://{backend_host}:{backend_port}")
        backend_proc = subprocess.Popen(
            [str(rust_bin), "serve", "--bind", f"{backend_host}:{backend_port}"],
        )
    else:
        try:
            import uvicorn  # noqa: F401
        except ImportError:
            console.print(
                "[red]uvicorn is not installed and Rust binary not found.[/red]\n"
                "Run: [bold]pip install 'openpika[server]'[/bold]"
            )
            sys.exit(1)

        console.print(f"  [green]▶[/green] Backend  → http://{backend_host}:{backend_port}  [dim](Python)[/dim]")
        backend_proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "openpika.server:app",
                "--host", backend_host,
                "--port", str(backend_port),
                "--log-level", "info",
            ],
        )

    # Wait for backend to be ready
    check_host = "127.0.0.1" if backend_host == "0.0.0.0" else backend_host
    ready = _wait_for_port(backend_proc, check_host, backend_port, timeout=30)
    if not ready:
        rc = backend_proc.poll()
        if rc is not None:
            console.print(f"[red]Backend exited with code {rc} before becoming ready.[/red]")
            sys.exit(rc if rc else 1)
        else:
            console.print("[yellow]Backend didn't respond in 30 s — UI will still start.[/yellow]")

    # ── Start Next.js UI ─────────────────────────────────────────────────────
    console.print(f"  [green]▶[/green] UI       → http://localhost:{port}")
    ui_proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "-p", str(port)],
        cwd=ui_path,
    )

    console.print(
        f"\n[cyan]OpenPika ready.[/cyan]  Open [link=http://localhost:{port}]http://localhost:{port}[/link]\n"
        "[dim]Press Ctrl-C to stop.[/dim]\n"
    )

    # ── Wait for Ctrl-C or a process to die ──────────────────────────────────
    def _shutdown(signum: int, frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, _shutdown)

    try:
        while True:
            if ui_proc.poll() is not None:
                break
            if backend_proc and backend_proc.poll() is not None:
                console.print("[red]Backend exited unexpectedly.[/red]")
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        console.print("\n[yellow]Shutting down…[/yellow]")
        ui_proc.terminate()
        if backend_proc:
            backend_proc.terminate()
        ui_proc.wait()
        if backend_proc:
            backend_proc.wait()
        console.print("[green]Done.[/green]")
