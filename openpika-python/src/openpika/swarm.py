"""Agent swarm — multi-agent event-driven pipelines.

Architecture
------------
Each SwarmNode wraps a pydantic-ai Agent and subscribes to one or more event
types on an isolated EventBus.  When an event arrives, the node converts its
payload into a prompt, runs its agent, then publishes the result as the next
event.  Because EventBus.publish() awaits asyncio.gather over all handlers —
and each handler awaits any downstream publishes — the entire pipeline
completes before Swarm.run() returns.

Built-in event-type constants
------------------------------
    TASK_ASSIGNED   → kicks off the pipeline
    RESEARCH_DONE   → research agent completed
    WRITING_DONE    → writer agent completed
    ANALYSIS_DONE   → analyst agent completed
    REVIEW_DONE     → critic agent completed
    AGENT_ERROR     → any node failed

Built-in preset roles (pass their keys to Swarm.from_presets())
----------------------------------------------------------------
    "research"  researcher  → TaskAssigned   → ResearchCompleted
    "write"     writer      → ResearchDone   → WritingCompleted
    "analyse"   analyst     → ResearchDone   → AnalysisCompleted
    "review"    critic      → WritingDone /
                              AnalysisDone  → ReviewCompleted
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from .eventbus import AgentEvent, EventBus

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Event-type constants
# ---------------------------------------------------------------------------

TASK_ASSIGNED = "TaskAssignedEvent"
RESEARCH_DONE = "ResearchCompletedEvent"
WRITING_DONE = "WritingCompletedEvent"
ANALYSIS_DONE = "AnalysisCompletedEvent"
REVIEW_DONE = "ReviewCompletedEvent"
AGENT_ERROR = "AgentErrorEvent"

ALL_EVENT_TYPES = [
    TASK_ASSIGNED,
    RESEARCH_DONE,
    WRITING_DONE,
    ANALYSIS_DONE,
    REVIEW_DONE,
    AGENT_ERROR,
]


# ---------------------------------------------------------------------------
# Node configuration
# ---------------------------------------------------------------------------


@dataclass
class NodeConfig:
    """Declarative spec for a single agent node in the swarm."""

    name: str
    model: str = ""
    system_prompt: str = ""
    subscribes_to: list[str] = field(default_factory=list)
    output_event: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model": self.model,
            "system_prompt": self.system_prompt,
            "subscribes_to": self.subscribes_to,
            "output_event": self.output_event,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> NodeConfig:
        return cls(
            name=d["name"],
            model=d.get("model", ""),
            system_prompt=d.get("system_prompt", ""),
            subscribes_to=d.get("subscribes_to", []),
            output_event=d.get("output_event", ""),
        )


# ---------------------------------------------------------------------------
# Built-in presets
# ---------------------------------------------------------------------------

PRESETS: dict[str, NodeConfig] = {
    "research": NodeConfig(
        name="researcher",
        system_prompt=(
            "You are a research agent. Given a task, use web_search and available tools "
            "to thoroughly investigate the topic. Return a detailed, structured summary "
            "of your findings with key facts, sources, and relevant context."
        ),
        subscribes_to=[TASK_ASSIGNED],
        output_event=RESEARCH_DONE,
    ),
    "write": NodeConfig(
        name="writer",
        system_prompt=(
            "You are a writer agent. Given research findings provided by a research agent, "
            "produce polished, well-structured written content — articles, reports, or "
            "documentation — that communicates the material clearly to a general audience."
        ),
        subscribes_to=[RESEARCH_DONE],
        output_event=WRITING_DONE,
    ),
    "analyse": NodeConfig(
        name="analyst",
        system_prompt=(
            "You are an analysis agent. Examine the provided information critically, extract "
            "key insights, identify patterns and trends, and produce a structured analytical "
            "summary with actionable conclusions."
        ),
        subscribes_to=[RESEARCH_DONE],
        output_event=ANALYSIS_DONE,
    ),
    "review": NodeConfig(
        name="critic",
        system_prompt=(
            "You are a quality-review agent. Review the provided content for accuracy, clarity, "
            "completeness, and logical consistency. Return specific, constructive improvement "
            "suggestions along with an overall quality assessment."
        ),
        subscribes_to=[WRITING_DONE, ANALYSIS_DONE],
        output_event=REVIEW_DONE,
    ),
}


# ---------------------------------------------------------------------------
# SwarmNode
# ---------------------------------------------------------------------------


class SwarmNode:
    """A named agent that subscribes to events and publishes results."""

    def __init__(self, cfg: NodeConfig, swarm_bus: EventBus) -> None:
        self.cfg = cfg
        self._bus = swarm_bus

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self) -> None:
        for et in self.cfg.subscribes_to:
            self._bus.subscribe(et, self.handle)

    def unregister(self) -> None:
        for et in self.cfg.subscribes_to:
            self._bus.unsubscribe(et, self.handle)

    # ------------------------------------------------------------------
    # Event handler
    # ------------------------------------------------------------------

    async def handle(self, event: AgentEvent) -> None:
        """Convert the event payload into a prompt, run the agent, publish result."""
        from openpika.agent import get_agent, run_agent
        from openpika.config import config

        model = self.cfg.model or config.model
        if ":" not in model:
            model = f"anthropic:{model}"
        prompt = self._build_prompt(event)
        log.info("SwarmNode[%s]: handling %s", self.cfg.name, event.event_type)

        try:
            agent = get_agent(
                model,
                system_prompt=self.cfg.system_prompt or None,
            )
            reply, _ = await run_agent(agent, prompt, [])
        except Exception as exc:
            log.exception("SwarmNode[%s]: agent error", self.cfg.name)
            await self._bus.publish(
                AgentEvent(
                    event_type=AGENT_ERROR,
                    source_agent=self.cfg.name,
                    session_id=event.session_id,
                    payload={"error": str(exc), "original_event": event.event_type},
                )
            )
            return

        if self.cfg.output_event:
            await self._bus.publish(
                AgentEvent(
                    event_type=self.cfg.output_event,
                    source_agent=self.cfg.name,
                    session_id=event.session_id,
                    payload={
                        "result": reply,
                        "task": event.payload.get("task", ""),
                    },
                )
            )
            log.info(
                "SwarmNode[%s]: published %s (%d chars)",
                self.cfg.name,
                self.cfg.output_event,
                len(reply),
            )

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def _build_prompt(self, event: AgentEvent) -> str:
        parts: list[str] = []
        task = event.payload.get("task", "")
        result = event.payload.get("result", "")
        if task:
            parts.append(f"Task: {task}")
        if result:
            parts.append(f"Input from previous agent ({event.source_agent}):\n{result}")
        return "\n\n".join(parts) if parts else str(event.payload)


# ---------------------------------------------------------------------------
# Swarm
# ---------------------------------------------------------------------------


class Swarm:
    """Orchestrates multiple SwarmNodes via an isolated EventBus.

    Each Swarm instance gets its own EventBus so concurrent runs do not
    interfere with each other.
    """

    def __init__(
        self,
        nodes: list[NodeConfig],
        session_id: str | None = None,
    ) -> None:
        self._bus = EventBus()
        self._session_id = session_id or str(uuid.uuid4())
        self._nodes = [SwarmNode(cfg, self._bus) for cfg in nodes]

    @property
    def session_id(self) -> str:
        return self._session_id

    @classmethod
    def from_presets(
        cls,
        preset_keys: list[str],
        session_id: str | None = None,
    ) -> Swarm:
        """Build a Swarm from named preset roles.

        Example:
            swarm = Swarm.from_presets(["research", "write"])
        """
        unknown = [k for k in preset_keys if k not in PRESETS]
        if unknown:
            raise ValueError(f"Unknown preset(s): {unknown}. Available: {list(PRESETS)}")
        return cls([PRESETS[k] for k in preset_keys], session_id=session_id)

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    async def run(self, task: str, timeout: float = 300.0) -> list[AgentEvent]:
        """Publish a TaskAssignedEvent and await the full downstream event chain.

        Because EventBus.publish() awaits all handlers (and each handler awaits
        its downstream publishes), the entire pipeline completes before this
        method returns.

        Returns the full ordered list of events produced during the run.
        """
        for node in self._nodes:
            node.register()

        initial = AgentEvent(
            event_type=TASK_ASSIGNED,
            source_agent="orchestrator",
            session_id=self._session_id,
            payload={"task": task},
        )

        try:
            await asyncio.wait_for(self._bus.publish(initial), timeout=timeout)
        except TimeoutError:
            log.warning("Swarm[%s]: timed out after %.0fs", self._session_id, timeout)
        finally:
            for node in self._nodes:
                node.unregister()

        return self._bus.history(self._session_id)

    def node_names(self) -> list[str]:
        return [n.cfg.name for n in self._nodes]
