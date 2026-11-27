import os
import subprocess
import sys
import time
import warnings
import inspect
from contextlib import contextmanager
from functools import wraps
from uuid import uuid4
import httpx
from .protocol import Event
from .models import ProgressReport, Connection
from .responder import Responder
from .resources import Resource
from threading import Lock
from . import config
from .config import default_endpoint, home


class PortInUse(RuntimeError):
    """The office's port is held by a program that is not a compatible Akshauhini office."""


def collector_running(endpoint):
    """True when a compatible collector answers, False when nothing is listening on the port.

    A closed loopback port is not always refused immediately: Windows retries for about two seconds, so a short
    probe times out instead of raising ConnectError. Both mean that no collector is there.
    Raises PortInUse when something else answers there (another web server, a non-HTTP program, an incompatible version).
    """
    try:
        response = httpx.get(f"{endpoint}/api/health", timeout=1, trust_env=False)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        return False
    except httpx.HTTPError:
        raise PortInUse(f"{endpoint} is in use by another program, not an Akshauhini office") from None
    try:
        response.raise_for_status()
        protocol = response.json().get("protocol")
    except (httpx.HTTPError, ValueError, AttributeError):
        raise PortInUse(f"{endpoint} is in use by another program, not an Akshauhini office") from None
    if protocol != "1.0":
        raise PortInUse(f"{endpoint} is an incompatible Akshauhini version (protocol {protocol})")
    return True


def _loopback_port(endpoint):
    host_port = endpoint.split("://", 1)[-1].split("/")[0]
    host, _, port = host_port.rpartition(":")
    if host not in ("127.0.0.1", "localhost") or not port.isdigit():
        raise RuntimeError(f"No collector at {endpoint}; only local collectors can be started automatically")
    return int(port)


def locate_office(endpoint=None):
    """Find the office to use: (endpoint, running).

    When it is not running, endpoint names the port a new office should use, which was free when checked.
    An explicit endpoint (argument, AKSHAUHINI_ENDPOINT or AKSHAUHINI_PORT) is used as given: if another program holds
    it, PortInUse is raised. Otherwise the recorded office or port 8765 is reused when an office answers there, and a new
    office gets 8765, or a free port when another program holds 8765.
    """
    chosen = (endpoint or config.explicit_endpoint() or "").rstrip("/")
    if chosen:
        busy = "Choose a different port, or leave it unset to use a free one automatically."
        try:
            if collector_running(chosen):
                return chosen, True
        except PortInUse as exc:
            raise PortInUse(f"{exc}. {busy}") from None
        port = _loopback_port(chosen)
        if not config.port_available(port):
            raise PortInUse(f"Port {port} is in use by another program. {busy}")
        return chosen, False
    record = config.read_record()
    for port in dict.fromkeys(([record["port"]] if record else []) + [config.DEFAULT_PORT]):
        candidate = config.loopback_endpoint(port)
        try:
            if collector_running(candidate):
                return candidate, True
        except PortInUse:
            continue
    port = config.DEFAULT_PORT if config.port_available(config.DEFAULT_PORT) else config.free_port()
    return config.loopback_endpoint(port), False


def ensure_collector(endpoint=None, timeout=15, open_browser=False):
    """Return the endpoint of a running local office, starting one in the background if none is listening.

    The started collector runs as a detached background process: it keeps serving after
    your script exits so you can inspect the run. Stop it with `akshauhini stop`. Only loopback endpoints are
    auto-started; a remote endpoint must already be running. Without an explicit endpoint, port 8765 is preferred
    and a free port is used when another program holds it.
    """
    endpoint, running = locate_office(endpoint)
    if running:
        return endpoint
    port = str(_loopback_port(endpoint))
    log = open(home() / "collector.log", "ab")
    flags = {}
    if sys.platform == "win32":
        # CREATE_NO_WINDOW gives the collector a hidden console that its own children (tasklist, ...) inherit.
        # DETACHED_PROCESS would leave it console-less, so Windows pops a new terminal for every child it runs.
        flags["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        flags["start_new_session"] = True
    # The office records its own address and process ID in office.json (see config.write_record).
    process = subprocess.Popen([sys.executable, "-m", "akshauhini", "--port", port, "serve", "--background"],
                               stdin=subprocess.DEVNULL, stdout=log, stderr=log, close_fds=True, **flags)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Collector exited during startup; see {home() / 'collector.log'}")
        if collector_running(endpoint):
            break
        time.sleep(0.2)
    else:
        raise RuntimeError(f"Collector did not start within {timeout}s; see {home() / 'collector.log'}")
    if open_browser:
        import webbrowser
        webbrowser.open(endpoint)
    return endpoint


def init(app_id, app_name=None, *, agents=None, endpoint=None, run_id=None, autostart=True, open_browser=False, strict=False):
    """One-line setup for any agentic app: make sure the local office is up, register the app, return an Office.

    >>> office = akshauhini.init("support-bot", "Support Bot")
    Set AKSHAUHINI_AUTOSTART=0 (or autostart=False) to never spawn a collector, e.g. in CI.
    """
    requested = endpoint
    endpoint = (endpoint or default_endpoint()).rstrip("/")
    if autostart and os.getenv("AKSHAUHINI_AUTOSTART", "1") != "0":
        try:
            # Pass only what the caller chose, so an unset endpoint can fall back to a free port.
            endpoint = ensure_collector(requested, open_browser=open_browser)
        except RuntimeError as exc:
            if strict:
                raise
            warnings.warn(f"Akshauhini office not started: {exc}", RuntimeWarning, stacklevel=2)
    office = Office(endpoint, run_id, strict=strict, app_id=app_id, app_name=app_name or app_id, agents=agents)
    print(f"Akshauhini: watching '{app_name or app_id}' at {endpoint}/?run={office.run_id}", file=sys.stderr, flush=True)
    return office

class Office:
    """Explicit, framework-independent telemetry; failures do not break agent work."""
    def __init__(self, endpoint=None, run_id=None, strict=False, app_id=None, app_name=None, agents=None):
        self.endpoint = (endpoint or default_endpoint()).rstrip("/")
        self.run_id = run_id or os.getenv("AKSHAUHINI_RUN_ID") or str(uuid4())
        self.strict = strict
        self.client = httpx.Client(timeout=3, trust_env=False)
        self._resources = {}
        self._resource_lock = Lock()
        if app_id:
            self.connect(app_id, app_name or app_id, agents)

    def emit(self, event_type, agent_id=None, task_id=None, operation_id=None, **data):
        event = Event(run_id=self.run_id, type=event_type, agent_id=agent_id, task_id=task_id, operation_id=operation_id, data=data)
        try:
            self.client.post(f"{self.endpoint}/api/events", json=[event.model_dump(mode="json")]).raise_for_status()
        except httpx.HTTPError as exc:
            if self.strict:
                raise
            warnings.warn(f"Akshauhini telemetry unavailable: {exc}", RuntimeWarning, stacklevel=2)
        return event

    def agent(self, agent_id, name=None, role="worker", department="General", **data):
        if name:
            data["name"] = name
        return self.emit("agent.created", agent_id, role=role, department=department, **data)

    def track(self, agent_id, *, name=None, role="worker", department="General", title=None):
        """Decorate a sync or async agent function with live task telemetry.

        This is the lowest-friction integration for an existing multi-agent app:
        it registers the agent and emits task creation, acceptance, timing,
        completion, and failure events while leaving the function's behavior
        and return value untouched.
        """
        def decorate(function):
            task_title = title or function.__name__.replace("_", " ").strip().title()

            def begin():
                task_id = f"{agent_id}:{function.__name__}:{uuid4().hex[:10]}"
                self.agent(agent_id, name=name, role=role, department=department)
                self.emit("task.created", agent_id, task_id, title=task_title)
                self.emit("task.accepted", agent_id, task_id, title=task_title)
                return task_id

            if inspect.iscoroutinefunction(function):
                @wraps(function)
                async def async_tracked(*args, **kwargs):
                    task_id = begin()
                    with self.operation("task", agent_id, task_id, title=task_title):
                        return await function(*args, **kwargs)
                return async_tracked

            @wraps(function)
            def tracked(*args, **kwargs):
                task_id = begin()
                with self.operation("task", agent_id, task_id, title=task_title):
                    return function(*args, **kwargs)
            return tracked
        return decorate

    def connect(self, app_id, name, agents=None):
        """Register the actual app's agent roster; more agents can arrive later."""
        connection = Connection(app_id=app_id,name=name,run_id=self.run_id,agents=agents or [])
        try:
            response = self.client.post(f"{self.endpoint}/api/apps/connect",json=connection.model_dump(mode="json"))
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            if self.strict:
                raise
            warnings.warn(f"Akshauhini connection unavailable: {exc}",RuntimeWarning,stacklevel=2)
            return None

    def progress(self, agent_id, *, state, summary, task_id=None, completed_items=None,
                 waiting_for=None, next_steps=None, completed_units=None, total_units=None):
        """Publish a factual snapshot. Percentages are calculated only from work units."""
        report = ProgressReport(state=state,summary=summary,task_id=task_id,
            completed_items=completed_items or [],waiting_for=waiting_for or [],
            next_steps=next_steps or [],completed_units=completed_units,total_units=total_units)
        return self.emit("agent.progress",agent_id,task_id,**report.event_data())

    def answer_questions(self, handlers, interval=1, contextual=False):
        """Context manager polling each agent's read-only progress callback.

        handlers maps agent IDs to functions accepting a question string and returning
        {"answer": str, "progress": ProgressReport-compatible dict (optional)}.
        Callbacks must be read-only and thread-safe. Leases renew during execution.
        With contextual=True the callback receives the claimed question and prior history.
        Return {"route_to": agent_id, "reason": text} to delegate to a specialist.
        Answer replies may include "findings": [{"source_id", "title", "excerpt"}].
        """
        return Responder(self,handlers,interval,contextual)

    def resource(self, name, capacity=1):
        """Shared FIFO resource within this Office instance; returns a .use() context."""
        with self._resource_lock:
            if name not in self._resources:self._resources[name]=Resource(self,name,capacity)
            if self._resources[name].capacity!=capacity:raise ValueError('Resource capacity cannot change during a run')
            return self._resources[name]

    def artifact(self, agent_id, task_id, *, artifact_id, name, content, version=1, parent_ids=None):
        if not 1<=version or len(content)>100000:raise ValueError('Use a positive version and at most 100,000 characters')
        return self.emit('artifact.created',agent_id,task_id,artifact_id=artifact_id,name=name,
                         content=content,version=version,parent_ids=parent_ids or [])

    @contextmanager
    def operation(self, kind, agent_id, task_id=None, **data):
        if kind not in ("llm", "tool.call", "task"):
            raise ValueError("operation kind must be llm, tool.call, or task")
        operation_id = str(uuid4())
        self.emit(f"{kind}.started", agent_id, task_id, operation_id, **data)
        start = time.perf_counter()
        metrics = {}
        try:
            yield metrics
        except BaseException as exc:
            self.emit(f"{kind}.failed", agent_id, task_id, operation_id, **{**data, **metrics, "error": str(exc), "duration_ms": (time.perf_counter() - start) * 1000})
            raise
        else:
            self.emit(f"{kind}.completed", agent_id, task_id, operation_id, **{**data, **metrics, "duration_ms": (time.perf_counter() - start) * 1000})

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
