"""In-process async event bus for agent-to-agent messaging (multi-agent swarms)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

Handler = Callable[["AgentEvent"], Awaitable[None]]


class AgentEvent(BaseModel):
    """Envelope for all messages flowing through the swarm event bus."""

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = "AgentEvent"
    source_agent: str = ""
    session_id: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
    payload: dict[str, Any] = Field(default_factory=dict)


class EventBus:
    """Lightweight in-process async event bus.

    publish() awaits asyncio.gather over all subscribed handlers, and each
    handler that publishes further events also awaits those publishes — so the
    entire downstream event chain completes before the original publish() call
    returns.  Cycles in the event graph are not supported and will recurse
    indefinitely.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = {}
        self._history: list[AgentEvent] = []

    # ------------------------------------------------------------------
    # Subscription management
    # ------------------------------------------------------------------

    def subscribe(self, event_type: str, handler: Handler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def unsubscribe(self, event_type: str, handler: Handler) -> None:
        try:
            self._handlers.get(event_type, []).remove(handler)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    async def publish(self, event: AgentEvent) -> int:
        """Deliver *event* to all subscribed handlers concurrently.

        Returns the number of handlers invoked.  Handler exceptions are logged
        but do not propagate — the bus continues delivering to remaining handlers.
        """
        self._history.append(event)
        handlers = list(self._handlers.get(event.event_type, []))
        if not handlers:
            log.debug("EventBus: no handlers for %s", event.event_type)
            return 0
        log.debug(
            "EventBus: %s from '%s' → %d handler(s)",
            event.event_type,
            event.source_agent,
            len(handlers),
        )
        results = await asyncio.gather(*(h(event) for h in handlers), return_exceptions=True)
        for r in results:
            if isinstance(r, BaseException):
                log.error("EventBus handler raised: %s", r)
        return len(handlers)

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------

    def history(self, session_id: str | None = None) -> list[AgentEvent]:
        """Return recorded events, optionally filtered by session_id."""
        if session_id is None:
            return list(self._history)
        return [e for e in self._history if e.session_id == session_id]

    def clear(self) -> None:
        self._history.clear()
        self._handlers.clear()

    # ------------------------------------------------------------------
    # Wait helper
    # ------------------------------------------------------------------

    async def wait_for(
        self,
        event_type: str,
        *,
        session_id: str | None = None,
        timeout: float = 60.0,
    ) -> AgentEvent | None:
        """Block until the next matching event arrives, or return None on timeout.

        Useful for external callers that want to react to a specific event
        without being part of the synchronous publish→handler chain.
        """
        loop = asyncio.get_event_loop()
        fut: asyncio.Future[AgentEvent] = loop.create_future()

        async def _once(event: AgentEvent) -> None:
            if not fut.done():
                if session_id is None or event.session_id == session_id:
                    fut.set_result(event)

        self.subscribe(event_type, _once)
        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
        except TimeoutError:
            return None
        finally:
            self.unsubscribe(event_type, _once)


# Process-level singleton — import this for ad-hoc event publishing outside swarms.
bus: EventBus = EventBus()
