"""pydantic-ai tool definitions for the OpenPika agent."""

import subprocess
from pathlib import Path
from typing import Annotated

import httpx
from pydantic_ai import RunContext
from pydantic_ai.tools import Tool


async def web_search(
    ctx: RunContext[dict],
    query: Annotated[str, "Search query"],
    max_results: Annotated[int, "Maximum number of results"] = 5,
) -> str:
    """Search the web using the DuckDuckGo Instant Answer API."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_redirect": "1"},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    if data.get("AbstractText"):
        results.append(f"Abstract: {data['AbstractText']}")
    for topic in data.get("RelatedTopics", [])[:max_results]:
        if isinstance(topic, dict) and "Text" in topic:
            results.append(topic["Text"])

    return "\n\n".join(results) if results else "No results found."


async def read_file(
    ctx: RunContext[dict],
    path: Annotated[str, "Absolute or relative file path"],
) -> str:
    """Read a file from the filesystem."""
    p = Path(path).expanduser()
    if not p.exists():
        return f"Error: file not found: {path}"
    if not p.is_file():
        return f"Error: path is not a file: {path}"
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except PermissionError:
        return f"Error: permission denied: {path}"


async def write_file(
    ctx: RunContext[dict],
    path: Annotated[str, "File path to write"],
    content: Annotated[str, "Content to write"],
) -> str:
    """Write content to a file, creating parent directories as needed."""
    p = Path(path).expanduser()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Wrote {len(content)} bytes to {path}"
    except PermissionError:
        return f"Error: permission denied: {path}"


async def terminal(
    ctx: RunContext[dict],
    command: Annotated[str, "Shell command to execute"],
    timeout: Annotated[int, "Timeout in seconds"] = 30,
) -> str:
    """Execute a shell command and return stdout + stderr."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        return output.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return f"Error: command timed out after {timeout}s"


# All tools exported to the agent
TOOL_LIST: list[Tool] = [
    Tool(web_search),
    Tool(read_file),
    Tool(write_file),
    Tool(terminal),
]
