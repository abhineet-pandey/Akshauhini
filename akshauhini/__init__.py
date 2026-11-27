"""Akshauhini's framework-independent instrumentation API.

Quick start::

    import akshauhini
    office = akshauhini.init("my-agents")          # starts the local office if it isn't running

    @office.track("researcher", name="Research Agent")
    def research(topic): ...
"""
__version__ = "0.1.0"

from .sdk import Office, init, ensure_collector
from .protocol import Event
from .models import ProgressReport

__all__ = ["Office", "Event", "ProgressReport", "init", "ensure_collector", "__version__"]
