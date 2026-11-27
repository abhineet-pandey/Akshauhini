"""Machine-wide defaults: a single collector per machine, so every agentic app reports to one place.

The office prefers port 8765 on 127.0.0.1. If another program holds that port, a free port is used instead and recorded
in ``office.json`` so every app, ``akshauhini run``, ``status`` and ``stop`` find it. A port the user chose explicitly
(``--port``, ``AKSHAUHINI_PORT`` or ``AKSHAUHINI_ENDPOINT``) is never replaced.
"""
import json
import os
import socket
from pathlib import Path

DEFAULT_PORT = 8765
LOOPBACK = "127.0.0.1"


def home() -> Path:
    """Akshauhini's data directory: AKSHAUHINI_HOME, else ~/.akshauhini."""
    path = Path(os.getenv("AKSHAUHINI_HOME") or Path.home() / ".akshauhini").expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_db() -> str:
    """AKSHAUHINI_DB if set, else ~/.akshauhini/akshauhini.sqlite — the same office wherever you start it."""
    return os.getenv("AKSHAUHINI_DB") or str(home() / "akshauhini.sqlite")


def loopback_endpoint(port) -> str:
    return f"http://{LOOPBACK}:{int(port)}"


def explicit_endpoint():
    """The office address the user chose with AKSHAUHINI_ENDPOINT or AKSHAUHINI_PORT, else None."""
    if os.getenv("AKSHAUHINI_ENDPOINT"):
        return os.environ["AKSHAUHINI_ENDPOINT"].rstrip("/")
    if os.getenv("AKSHAUHINI_PORT"):
        return loopback_endpoint(os.environ["AKSHAUHINI_PORT"])
    return None


# ── The running office's address, shared by every process on this machine ────────────────────────────────────────
def _record_path() -> Path:
    return home() / "office.json"


def read_record():
    """{"port", "pid", "background"} of the machine's office, or None. It may be stale: callers probe the port."""
    try:
        record = json.loads(_record_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(record, dict) or not isinstance(record.get("port"), int):
        return None
    return record


def write_record(port, pid, background):
    _record_path().write_text(json.dumps({"port": int(port), "pid": int(pid), "background": bool(background)}), encoding="utf-8")


def clear_record(pid=None):
    """Remove the record; with pid, only if it still belongs to that process."""
    record = read_record()
    if pid is not None and record and record.get("pid") != pid:
        return
    try:
        _record_path().unlink()
    except OSError:
        pass


def default_endpoint() -> str:
    """Where an app sends events: the address the user chose, else the recorded office, else 127.0.0.1:8765."""
    record = read_record()
    return explicit_endpoint() or loopback_endpoint(record["port"] if record else DEFAULT_PORT)


# ── Ports ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def port_available(port, host=LOOPBACK) -> bool:
    """True when nothing accepts connections on the port and it can be bound on host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)  # a closed loopback port can take ~2 s to refuse on Windows; a listener answers at once
        try:
            if probe.connect_ex((LOOPBACK, int(port))) == 0:
                return False
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):  # Windows: refuse to share a port another program has bound
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            probe.bind((host, int(port)))
        except OSError:
            return False
    return True


def free_port(host=LOOPBACK) -> int:
    """A port the operating system reports as unused."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((host, 0))
        return probe.getsockname()[1]
