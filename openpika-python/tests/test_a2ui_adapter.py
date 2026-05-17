"""Tests for OpenPikaAGUIEventStream — the A2UI custom-event adapter."""

import json
from unittest.mock import MagicMock, patch

import pytest
from ag_ui.core import CustomEvent
from pydantic_ai.messages import FunctionToolResultEvent, ToolReturnPart
from pydantic_ai.ui.ag_ui import AGUIEventStream

from openpika.a2ui_adapter import _A2UI_PREFIX, OpenPikaAGUIEventStream


def _make_stream() -> OpenPikaAGUIEventStream:
    return OpenPikaAGUIEventStream(MagicMock())


def _render_ui_event(surface_id: str, jsonl: str) -> FunctionToolResultEvent:
    content = f"{_A2UI_PREFIX}{surface_id}\n{jsonl}"
    part = ToolReturnPart(tool_name="render_ui", content=content)
    return FunctionToolResultEvent(part=part)


async def _collect(stream, event):
    return [e async for e in stream.handle_function_tool_result(event)]


@pytest.mark.asyncio
async def test_single_jsonl_line_yields_custom_event():
    stream = _make_stream()
    msg = {"beginRendering": {"surfaceId": "s1"}}
    event = _render_ui_event("s1", json.dumps(msg))

    results = await _collect(stream, event)

    assert len(results) == 1
    assert isinstance(results[0], CustomEvent)
    assert results[0].name == "a2ui"
    assert results[0].value == {"surfaceId": "s1", "message": msg}


@pytest.mark.asyncio
async def test_multiple_jsonl_lines_yields_one_event_per_line():
    stream = _make_stream()
    m1 = {"beginRendering": {"surfaceId": "surf"}}
    m2 = {"surfaceUpdate": {"surfaceId": "surf", "components": []}}
    jsonl = f"{json.dumps(m1)}\n{json.dumps(m2)}"
    event = _render_ui_event("surf", jsonl)

    results = await _collect(stream, event)

    assert len(results) == 2
    assert results[0].value["message"] == m1
    assert results[1].value["message"] == m2


@pytest.mark.asyncio
async def test_invalid_json_lines_are_skipped():
    stream = _make_stream()
    valid = json.dumps({"ok": True})
    jsonl = f"not-json\n{valid}\n{{broken"
    event = _render_ui_event("x", jsonl)

    results = await _collect(stream, event)

    assert len(results) == 1
    assert results[0].value["message"] == {"ok": True}


@pytest.mark.asyncio
async def test_blank_lines_are_skipped():
    stream = _make_stream()
    valid = json.dumps({"a": 1})
    jsonl = f"\n  \n{valid}\n\n"
    event = _render_ui_event("x", jsonl)

    results = await _collect(stream, event)

    assert len(results) == 1


@pytest.mark.asyncio
async def test_surface_id_parsed_correctly():
    stream = _make_stream()
    msg = {"type": "test"}
    event = _render_ui_event("my-surface-123", json.dumps(msg))

    results = await _collect(stream, event)

    assert results[0].value["surfaceId"] == "my-surface-123"


@pytest.mark.asyncio
async def test_no_jsonl_body_yields_nothing():
    stream = _make_stream()
    part = ToolReturnPart(tool_name="render_ui", content=f"{_A2UI_PREFIX}surf\n")
    event = FunctionToolResultEvent(part=part)

    results = await _collect(stream, event)

    assert results == []


@pytest.mark.asyncio
async def test_non_render_ui_tool_delegates_to_parent():
    stream = _make_stream()
    part = ToolReturnPart(tool_name="other_tool", content="some result")
    event = FunctionToolResultEvent(part=part)

    from ag_ui.core import BaseEvent
    sentinel = MagicMock(spec=BaseEvent)

    async def fake_parent(self_arg, evt):
        yield sentinel

    with patch.object(AGUIEventStream, "handle_function_tool_result", fake_parent):
        results = await _collect(stream, event)

    assert results == [sentinel]


@pytest.mark.asyncio
async def test_content_without_a2ui_prefix_delegates_to_parent():
    stream = _make_stream()
    part = ToolReturnPart(tool_name="render_ui", content="plain text result")
    event = FunctionToolResultEvent(part=part)

    from ag_ui.core import BaseEvent
    sentinel = MagicMock(spec=BaseEvent)

    async def fake_parent(self_arg, evt):
        yield sentinel

    with patch.object(AGUIEventStream, "handle_function_tool_result", fake_parent):
        results = await _collect(stream, event)

    assert results == [sentinel]
