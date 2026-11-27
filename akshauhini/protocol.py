"""Akshauhini Event Protocol v1. Time is UTC; collector sequence is replay order."""
from datetime import datetime, timezone
from typing import Annotated, Any, Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

EventType = Literal[
    "run.started", "run.completed", "run.failed", "agent.created", "agent.failed",
    "task.created", "task.assigned", "task.accepted", "task.started", "task.progress",
    "task.waiting", "task.completed", "task.cancelled", "task.failed",
    "llm.started", "llm.completed", "llm.failed", "tool.call.started",
    "tool.call.completed", "tool.call.failed", "tool.queued", "tool.retry",
    "message.sent", "handoff.started", "handoff.completed", "review.started",
    "review.approved", "review.rejected", "human.requested", "human.approved",
    "human.rejected", "artifact.created", "agent.updated", "agent.removed", "agent.progress", "question.asked", "question.received", "question.routed", "question.answered", "question.cancelled", "resource.updated", "tool.dequeued",
]

# Producer-defined extension events, e.g. "x.langgraph.node_entered". They are stored, replayed and listed in the
# raw event stream, but never change agent or task state, so a framework can record concepts AOEP has no type for.
CustomEventType = Annotated[str, StringConstraints(pattern=r"^x\.[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")]

class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["1.0"] = "1.0"
    event_id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=200)
    run_id: str = Field(min_length=1, max_length=200)
    type: EventType | CustomEventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agent_id: str | None = Field(default=None, max_length=200)
    task_id: str | None = Field(default=None, max_length=200)
    operation_id: str | None = Field(default=None, max_length=200)
    data: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_semantics(self):
        if self.timestamp.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        if not self.type.startswith("run.") and not self.agent_id:
            raise ValueError("agent_id is required for non-run events")
        if self.type.startswith("task.") and not self.task_id:
            raise ValueError("task events require task_id")
        if self.type == "task.progress":
            p = self.data.get("progress")
            if isinstance(p, bool) or not isinstance(p, (float, int)) or not 0 <= p <= 1:
                raise ValueError("progress must be a measured number between 0 and 1")
        if self.type == "agent.progress":
            from .models import ProgressReport
            data = {k: v for k, v in self.data.items() if k != "progress"}
            report = ProgressReport.model_validate({**data, "task_id": self.task_id})
            self.data = report.event_data()
        return self
