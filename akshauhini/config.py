"""Machine-wide defaults: a single collector per machine, so every agentic app reports to one place."""
import os
from pathlib import Path

DEFAULT_PORT = 8765


def home() -> Path:
    """Akshauhini's data directory: AKSHAUHINI_HOME, else ~/.akshauhini."""
    path = Path(os.getenv("AKSHAUHINI_HOME") or Path.home() / ".akshauhini").expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_db() -> str:
    """AKSHAUHINI_DB if set, else ~/.akshauhini/akshauhini.sqlite — the same office wherever you start it."""
    return os.getenv("AKSHAUHINI_DB") or str(home() / "akshauhini.sqlite")


def default_endpoint() -> str:
    return (os.getenv("AKSHAUHINI_ENDPOINT") or f"http://127.0.0.1:{os.getenv('AKSHAUHINI_PORT', DEFAULT_PORT)}").rstrip("/")
