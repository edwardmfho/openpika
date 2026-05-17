"""pydantic-ai tool definitions for the OpenPika agent.

Native tools (always available):
  web_search      — DuckDuckGo search
  read_file       — Read a file
  write_file      — Write a file
  terminal        — Execute a shell command
  execute_code    — Execute code in Python, JS, Bash, Ruby, Go, etc.
  generate_image  — Call any OpenAI-compatible image-generation endpoint
  propose_skill   — Propose a reusable skill for user approval

Browser tools (require playwright):
  browser_navigate  — Navigate to a URL
  browser_snapshot  — Get current page title, URL, and visible text
  browser_click     — Click an element by CSS selector
  browser_type      — Type text into an element
  browser_extract   — Extract text from elements matching a selector
  browser_close     — Close the browser
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Annotated

from pydantic_ai import RunContext
from pydantic_ai.tools import Tool

# ─── Web Search ───────────────────────────────────────────────────────────────


async def web_search(
    ctx: RunContext[dict],
    query: Annotated[str, "Search query"],
    max_results: Annotated[int, "Maximum number of results"] = 5,
) -> str:
    """Search the web using DuckDuckGo and return top results."""
    try:
        from ddgs import DDGS
    except ImportError:
        return "Error: ddgs package not installed — run `pip install ddgs`"

    safe_limit = max(1, int(max_results))

    def _search() -> list[dict]:
        with DDGS() as client:
            return list(client.text(query, max_results=safe_limit))

    try:
        hits = await asyncio.to_thread(_search)
    except Exception as exc:
        return f"Search failed: {exc}"

    if not hits:
        return "No results found."

    lines = []
    for i, hit in enumerate(hits[:safe_limit], 1):
        title = hit.get("title", "")
        url = hit.get("href") or hit.get("url", "")
        body = hit.get("body", "")
        lines.append(f"{i}. {title}\n   {url}\n   {body}")
    return "\n\n".join(lines)


# ─── File I/O ─────────────────────────────────────────────────────────────────


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


# ─── Terminal ─────────────────────────────────────────────────────────────────


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


# ─── Code Execution ───────────────────────────────────────────────────────────

_CODE_RUNNERS: dict[str, tuple[list[str], str]] = {
    "python": ([sys.executable], ".py"),
    "python3": ([sys.executable], ".py"),
    "javascript": (["node"], ".js"),
    "js": (["node"], ".js"),
    "typescript": (["npx", "ts-node", "--skip-project"], ".ts"),
    "ts": (["npx", "ts-node", "--skip-project"], ".ts"),
    "bash": (["bash"], ".sh"),
    "sh": (["sh"], ".sh"),
    "ruby": (["ruby"], ".rb"),
    "go": (["go", "run"], ".go"),
}


async def execute_code(
    ctx: RunContext[dict],
    language: Annotated[str, "Programming language (python, javascript, bash, ruby, go, typescript)"],
    code: Annotated[str, "Source code to execute"],
    timeout: Annotated[int, "Timeout in seconds"] = 30,
) -> str:
    """Execute code in the specified language and return the output.

    Supported languages: python, javascript, bash, sh, ruby, go, typescript.
    Requires the corresponding runtime to be installed.
    """
    lang = language.lower().strip()
    if lang not in _CODE_RUNNERS:
        supported = ", ".join(sorted(_CODE_RUNNERS))
        return f"Error: unsupported language '{language}'. Supported: {supported}"

    runner_cmd, ext = _CODE_RUNNERS[lang]

    # Write code to a temp file and run it (safer than -c flag for multi-line code)
    with tempfile.NamedTemporaryFile(suffix=ext, mode="w", delete=False, encoding="utf-8") as f:
        f.write(code)
        tmp_path = f.name

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            runner_cmd + [tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = result.stdout or ""
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        return output.strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return f"Error: execution timed out after {timeout}s"
    except FileNotFoundError:
        return (
            f"Error: '{runner_cmd[0]}' not found — is {language} installed?\n"
            f"Install hint: https://repology.org/project/{runner_cmd[0]}/versions"
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─── Image Generation ─────────────────────────────────────────────────────────


async def generate_image(
    ctx: RunContext[dict],
    prompt: Annotated[str, "Description of the image to generate"],
    size: Annotated[str, "Image dimensions, e.g. '1024x1024', '1792x1024'"] = "1024x1024",
) -> str:
    """Generate an image using the configured image generation API.

    Configure via environment variables:
      OPENPIKA_IMAGE_API_KEY   — API key (falls back to OPENAI_API_KEY)
      OPENPIKA_IMAGE_ENDPOINT  — API URL (default: OpenAI DALL-E 3)
      OPENPIKA_IMAGE_MODEL     — Model name (default: dall-e-3)

    Returns the URL of the generated image.
    """
    try:
        import httpx
    except ImportError:
        return "Error: httpx not installed — run `pip install httpx`"

    endpoint = os.environ.get(
        "OPENPIKA_IMAGE_ENDPOINT",
        "https://api.openai.com/v1/images/generations",
    )
    api_key = os.environ.get("OPENPIKA_IMAGE_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    model = os.environ.get("OPENPIKA_IMAGE_MODEL", "dall-e-3")

    if not api_key:
        return (
            "Error: No image generation API key configured.\n"
            "Set OPENPIKA_IMAGE_API_KEY (or OPENAI_API_KEY) and optionally "
            "OPENPIKA_IMAGE_ENDPOINT / OPENPIKA_IMAGE_MODEL."
        )

    payload = {"prompt": prompt, "size": size, "n": 1, "model": model}

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if not resp.is_success:
            return f"Error: Image generation failed ({resp.status_code}): {resp.text[:300]}"

        data = resp.json()
        urls = [
            img.get("url") or f"[base64 image, {len(img.get('b64_json', ''))} chars]" for img in data.get("data", [])
        ]
        return "\n".join(u for u in urls if u) or "Error: No images in response"
    except Exception as exc:
        return f"Error generating image: {exc}"


# ─── Browser Automation ───────────────────────────────────────────────────────

# Module-level browser state — shared across tool calls within the same process.
_browser_state: dict = {}


async def _get_page():
    """Lazily initialize playwright and return the current page, or an error string."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return None, ("Error: playwright not installed.\nRun: pip install playwright && playwright install chromium")

    state = _browser_state
    if not state.get("pw"):
        state["pw"] = await async_playwright().start()
    if not state.get("browser") or not state["browser"].is_connected():
        state["browser"] = await state["pw"].chromium.launch(headless=True)
    if not state.get("page") or state["page"].is_closed():
        state["page"] = await state["browser"].new_page()
    return state["page"], None


async def browser_navigate(
    ctx: RunContext[dict],
    url: Annotated[str, "URL to navigate to"],
    wait_until: Annotated[str, "Wait condition: load, domcontentloaded, networkidle"] = "load",
) -> str:
    """Navigate the browser to a URL and return a summary of the page."""
    page, err = await _get_page()
    if err:
        return err
    try:
        await page.goto(url, wait_until=wait_until, timeout=30_000)
        title = await page.title()
        current_url = page.url
        text = await page.inner_text("body")
        snippet = text[:2000].strip() if text else "(no body text)"
        return f"Navigated to: {current_url}\nTitle: {title}\n\n{snippet}"
    except Exception as exc:
        return f"Error navigating to {url}: {exc}"


async def browser_snapshot(ctx: RunContext[dict]) -> str:
    """Return the current page's URL, title, and visible text content."""
    page, err = await _get_page()
    if err:
        return err
    try:
        title = await page.title()
        url = page.url
        text = await page.inner_text("body")
        snippet = text[:3000].strip() if text else "(no body text)"
        return f"URL: {url}\nTitle: {title}\n\n{snippet}"
    except Exception as exc:
        return f"Error taking snapshot: {exc}"


async def browser_click(
    ctx: RunContext[dict],
    selector: Annotated[str, "CSS selector or text of the element to click"],
) -> str:
    """Click an element on the current page."""
    page, err = await _get_page()
    if err:
        return err
    try:
        await page.click(selector, timeout=10_000)
        await page.wait_for_load_state("load", timeout=15_000)
        return f"Clicked '{selector}'. Current URL: {page.url}"
    except Exception as exc:
        return f"Error clicking '{selector}': {exc}"


async def browser_type(
    ctx: RunContext[dict],
    selector: Annotated[str, "CSS selector of the input element"],
    text: Annotated[str, "Text to type into the element"],
    clear_first: Annotated[bool, "Clear the field before typing"] = True,
) -> str:
    """Type text into an input element on the current page."""
    page, err = await _get_page()
    if err:
        return err
    try:
        if clear_first:
            await page.fill(selector, "", timeout=10_000)
        await page.type(selector, text, timeout=10_000)
        return f"Typed into '{selector}'"
    except Exception as exc:
        return f"Error typing into '{selector}': {exc}"


async def browser_extract(
    ctx: RunContext[dict],
    selector: Annotated[str, "CSS selector to extract text from"],
) -> str:
    """Extract and return the text content of all elements matching a CSS selector."""
    page, err = await _get_page()
    if err:
        return err
    try:
        elements = await page.query_selector_all(selector)
        if not elements:
            return f"No elements found matching '{selector}'"
        texts = []
        for el in elements[:20]:  # cap at 20 elements
            t = await el.inner_text()
            if t.strip():
                texts.append(t.strip())
        return "\n---\n".join(texts) if texts else "(elements found but no text content)"
    except Exception as exc:
        return f"Error extracting from '{selector}': {exc}"


async def browser_close(ctx: RunContext[dict]) -> str:
    """Close the browser and release all browser resources."""
    state = _browser_state
    try:
        if state.get("browser"):
            await state["browser"].close()
            state["browser"] = None
            state["page"] = None
        if state.get("pw"):
            await state["pw"].stop()
            state["pw"] = None
        return "Browser closed."
    except Exception as exc:
        return f"Error closing browser: {exc}"


# ─── Self-Learning — Skill Proposal ──────────────────────────────────────────


async def propose_skill(
    ctx: RunContext[dict],
    name: Annotated[str, "Short, descriptive name for the skill (e.g. 'Summarise Meeting Notes')"],
    description: Annotated[str, "One-sentence description of what the skill does"],
    prompt_template: Annotated[
        str,
        "Reusable prompt template. Use {{variable_name}} for user-supplied parameters.",
    ],
    params_schema: Annotated[
        str,
        "JSON object describing parameters. Each key maps to {type, label, required, default}. Use '{}' if no params.",
    ] = "{}",
) -> str:
    """Propose a new reusable skill for the user to review and approve.

    Call this after completing a complex or multi-step task where you discovered
    a pattern that could be reused in future conversations. The user will see
    the proposal via `openpika skills pending` and can approve or reject it.

    Only propose skills for genuinely reusable workflows — not every conversation.
    """
    import json

    try:
        schema = json.loads(params_schema)
    except (json.JSONDecodeError, TypeError):
        schema = {}

    try:
        from openpika.db import create_pending_skill

        await create_pending_skill(
            name=name,
            description=description,
            prompt_template=prompt_template,
            params_schema=schema,
        )
        return f"Skill '{name}' proposed and queued for review.\nRun `openpika skills pending` to approve or reject it."
    except Exception as exc:
        return f"Error proposing skill: {exc}"


# ─── A2UI Render ─────────────────────────────────────────────────────────────

_A2UI_PREFIX = "__A2UI__"


async def render_ui(
    ctx: RunContext[dict],
    surface_id: Annotated[str, "Unique surface ID (kebab-case, e.g. 'results-table', 'file-preview')"],
    messages: Annotated[
        str, "A2UI v0.8 JSONL — one JSON object per line (beginRendering → surfaceUpdate → dataModelUpdate)"
    ],
) -> str:
    """Render a rich interactive UI surface in the chat using A2UI declarative components.

    Use this to display structured data, file contents, images, forms, or any
    content that benefits from rich UI rather than plain text.

    Write your text explanation first, then call render_ui — the surface appears below.
    """
    return f"{_A2UI_PREFIX}{surface_id}\n{messages}"


# ─── Tool list exported to the agent ─────────────────────────────────────────

TOOL_LIST: list[Tool] = [
    Tool(web_search),
    Tool(read_file),
    Tool(write_file),
    Tool(terminal),
    Tool(execute_code),
    Tool(generate_image),
    Tool(render_ui),
    Tool(propose_skill),
    Tool(browser_navigate),
    Tool(browser_snapshot),
    Tool(browser_click),
    Tool(browser_type),
    Tool(browser_extract),
    Tool(browser_close),
]
