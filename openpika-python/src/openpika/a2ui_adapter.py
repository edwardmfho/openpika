"""Custom AG-UI adapter that intercepts render_ui tool results and emits A2UI CUSTOM events."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from ag_ui.core import BaseEvent, CustomEvent
from ag_ui.core.types import RunAgentInput
from pydantic_ai.messages import FunctionToolResultEvent, ToolReturnPart
from pydantic_ai.ui.ag_ui import AGUIAdapter, AGUIEventStream

_A2UI_PREFIX = "__A2UI__"


class OpenPikaAGUIEventStream(AGUIEventStream):
    """Extends AGUIEventStream to convert render_ui tool results into A2UI CUSTOM events."""

    async def handle_function_tool_result(self, event: FunctionToolResultEvent) -> AsyncIterator[BaseEvent]:
        part = event.part
        if (
            isinstance(part, ToolReturnPart)
            and part.tool_name == "render_ui"
            and isinstance(part.content, str)
            and part.content.startswith(_A2UI_PREFIX)
        ):
            rest = part.content[len(_A2UI_PREFIX) :]
            newline = rest.find("\n")
            surface_id = rest[:newline] if newline >= 0 else rest
            jsonl = rest[newline + 1 :] if newline >= 0 else ""

            for line in jsonl.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                yield CustomEvent(name="a2ui", value={"surfaceId": surface_id, "message": msg})
            # Surface IS the result — no ToolCallResultEvent emitted
            return

        async for e in super().handle_function_tool_result(event):
            yield e


class OpenPikaAGUIAdapter(AGUIAdapter):
    """AGUIAdapter wired to OpenPikaAGUIEventStream."""

    @classmethod
    def build_run_input(cls, body: bytes) -> RunAgentInput:
        # Inject forwardedProps default so clients that omit it still validate.
        data = json.loads(body)
        data.setdefault("forwardedProps", {})
        return RunAgentInput.model_validate(data)

    def build_event_stream(self) -> OpenPikaAGUIEventStream:
        return OpenPikaAGUIEventStream(
            self.run_input,
            accept=self.accept,
            ag_ui_version=self.ag_ui_version,
        )
