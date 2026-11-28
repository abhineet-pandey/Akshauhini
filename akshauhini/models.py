"""Application registration, truthful progress snapshots, and agent questions."""
from __future__ import annotations
from typing import Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class AgentRegistration(StrictModel):
    agent_id: str = Field(min_length=1, max_length=200)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str = Field(default="worker", max_length=100)
    department: str = Field(default="General", max_length=100)
    model: str | None = Field(default=None, max_length=200)

class Connection(StrictModel):
    app_id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    run_id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=200)
    agents: list[AgentRegistration] = Field(default_factory=list, max_length=200)
    # Which build of the app produced this run, so runs can be compared release against release.
    version: str | None = Field(default=None, min_length=1, max_length=100)
    commit: str | None = Field(default=None, min_length=1, max_length=64)

class ProgressReport(StrictModel):
    state: Literal["idle", "working", "waiting", "blocked", "completed", "failed", "cancelled"]
    summary: str = Field(min_length=1, max_length=4000)
    task_id: str | None = Field(default=None, min_length=1, max_length=200)
    completed_items: list[str] = Field(default_factory=list, max_length=100)
    waiting_for: list[str] = Field(default_factory=list, max_length=100)
    next_steps: list[str] = Field(default_factory=list, max_length=100)
    completed_units: int | None = Field(default=None, ge=0, strict=True)
    total_units: int | None = Field(default=None, gt=0, strict=True)

    @model_validator(mode="after")
    def measured_work(self):
        if (self.completed_units is None) != (self.total_units is None):
            raise ValueError("Supply both completed_units and total_units, or neither")
        if self.total_units is not None and self.completed_units > self.total_units:
            raise ValueError("completed_units cannot exceed total_units")
        if self.state in ("waiting", "blocked") and not self.waiting_for:
            raise ValueError("waiting/blocked updates must say what is needed in waiting_for")
        if self.state == "completed" and self.total_units is not None and self.completed_units != self.total_units:
            raise ValueError("A completed report must account for all declared units")
        return self

    def event_data(self):
        data = self.model_dump(exclude={"task_id"})
        data["progress"] = self.completed_units / self.total_units if self.total_units else None
        return data

class Question(StrictModel):
    question: str = Field(min_length=1, max_length=2000)
    source: Literal["agent", "ollama"] = "agent"
    model: str | None = Field(default=None, min_length=1, max_length=200)

class Answer(StrictModel):
    delivery_token: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=8000)
    progress: ProgressReport | None = None
    findings: list[Finding] = Field(default_factory=list, max_length=30)

class Finding(StrictModel):
    source_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    excerpt: str = Field(min_length=1, max_length=5000)

class Delivery(StrictModel):
    delivery_token: str = Field(min_length=1, max_length=200)

class Route(Delivery):
    target_agent_id: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=1, max_length=2000)

Answer.model_rebuild()

class ModelSettings(StrictModel):
    llm_model: str | None = Field(default=None,min_length=1,max_length=200)
    embedding_model: str | None = Field(default=None,min_length=1,max_length=200)
