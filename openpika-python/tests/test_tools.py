"""Tests for native tool functions in openpika.tools."""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from openpika.tools import _A2UI_PREFIX, execute_code, read_file, render_ui, write_file

CTX = MagicMock()


# ─── render_ui ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_render_ui_returns_prefixed_string():
    result = await render_ui(CTX, "my-surface", '{"beginRendering": {}}')
    assert result == f"{_A2UI_PREFIX}my-surface\n" + '{"beginRendering": {}}'


@pytest.mark.asyncio
async def test_render_ui_surface_id_included():
    result = await render_ui(CTX, "table-view", "jsonl")
    assert result.startswith(f"{_A2UI_PREFIX}table-view\n")


# ─── execute_code ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_code_unsupported_language():
    result = await execute_code(CTX, "cobol", "DISPLAY 'hi'.")
    assert result.startswith("Error: unsupported language")
    assert "cobol" in result


@pytest.mark.asyncio
async def test_execute_code_python_print():
    result = await execute_code(CTX, "python", "print('hello from test')")
    assert "hello from test" in result


@pytest.mark.asyncio
async def test_execute_code_python_exit_code():
    result = await execute_code(CTX, "python", "raise SystemExit(1)")
    assert "exit code" in result


@pytest.mark.asyncio
async def test_execute_code_bash():
    result = await execute_code(CTX, "bash", "echo pika")
    assert "pika" in result


# ─── read_file ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_read_file_missing_returns_error():
    result = await read_file(CTX, "/tmp/does_not_exist_openpika_test_xyz.txt")
    assert "Error" in result
    assert "not found" in result


@pytest.mark.asyncio
async def test_read_file_directory_returns_error():
    result = await read_file(CTX, "/tmp")
    assert "Error" in result
    assert "not a file" in result


@pytest.mark.asyncio
async def test_read_file_reads_content():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("hello openpika")
        path = f.name
    result = await read_file(CTX, path)
    assert result == "hello openpika"


# ─── write_file ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_file_creates_file():
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "out.txt")
        result = await write_file(CTX, path, "written content")
        assert "Wrote" in result
        assert Path(path).read_text() == "written content"


@pytest.mark.asyncio
async def test_write_file_creates_parent_dirs():
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "sub" / "dir" / "file.txt")
        await write_file(CTX, path, "nested")
        assert Path(path).read_text() == "nested"


@pytest.mark.asyncio
async def test_write_file_reports_byte_count():
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "f.txt")
        result = await write_file(CTX, path, "abc")
        assert "3" in result
