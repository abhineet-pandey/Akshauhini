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


CONTENT_LIMIT = 4000  # characters kept of a captured prompt, response, expected or actual output


def _finish_at_exit(office):
    """Mark an init() run completed when the process exits, or failed with the error if it dies of an exception."""
    import atexit
    previous = sys.excepthook

    def hook(exc_type, exc, tb):
        try:
            office.finish("failed", error=f"{exc_type.__name__}: {exc}"[:2000])
        except Exception:
            pass
        previous(exc_type, exc, tb)

    def at_exit():
        with warnings.catch_warnings():  # an unreachable office is not worth a warning while the process shuts down
            warnings.simplefilter("ignore")
            office.finish("completed")

    sys.excepthook = hook
    atexit.register(at_exit)


def _clip(text):
    text = str(text)
    return text if len(text) <= CONTENT_LIMIT else text[:CONTENT_LIMIT] + f"… [{len(text) - CONTENT_LIMIT} more characters]"


def app_version(version=None):
    """The app's version and commit for this run: explicit values, else AKSHAUHINI_APP_VERSION / AKSHAUHINI_APP_COMMIT,
    else the current git commit when the app runs inside a git checkout. Missing values are left out."""
    info = {"version": version or os.getenv("AKSHAUHINI_APP_VERSION") or None, "commit": os.getenv("AKSHAUHINI_APP_COMMIT") or None}
    if not info["commit"]:
        try:
            flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=2, **flags)
            if out.returncode == 0 and out.stdout.strip():
                info["commit"] = out.stdout.strip()[:64]
        except (OSError, subprocess.SubprocessError):
            pass
    return {k: v for k, v in info.items() if v}


def init(app_id, app_name=None, *, agents=None, endpoint=None, run_id=None, autostart=True, open_browser=False, strict=False,
         version=None, capture_content=None):
    """One-line setup for any agentic app: make sure the local office is up, register the app, return an Office.

    >>> office = akshauhini.init("support-bot", "Support Bot", version="1.4.0")
    Set AKSHAUHINI_AUTOSTART=0 (or autostart=False) to never spawn a collector, e.g. in CI.
    version tags this run so releases can be compared (default AKSHAUHINI_APP_VERSION; the git commit is added when found).
    capture_content=True records LLM prompts and responses passed to office.llm() (default AKSHAUHINI_CAPTURE_CONTENT=1).
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
    office = Office(endpoint, run_id, strict=strict, app_id=app_id, app_name=app_name or app_id, agents=agents,
                    version=version, capture_content=capture_content)
    _finish_at_exit(office)
    print(f"Akshauhini: watching '{app_name or app_id}' at {endpoint}/?run={office.run_id}", file=sys.stderr, flush=True)
    return office

class Office:
    """Explicit, framework-independent telemetry; failures do not break agent work."""
    def __init__(self, endpoint=None, run_id=None, strict=False, app_id=None, app_name=None, agents=None, version=None,
                 capture_content=None):
        self.endpoint = (endpoint or default_endpoint()).rstrip("/")
        self.run_id = run_id or os.getenv("AKSHAUHINI_RUN_ID") or str(uuid4())
        self.strict = strict
        # Prompts and responses can hold private data: they are recorded only when explicitly enabled.
        self.capture_content = os.getenv("AKSHAUHINI_CAPTURE_CONTENT") == "1" if capture_content is None else bool(capture_content)
        self.client = httpx.Client(timeout=3, trust_env=False)
        self._resources = {}
        self._resource_lock = Lock()
        # An Office that registered an app owns its run, so it also records how the run ended (see finish()).
        self._owns_run = bool(app_id)
        self._finished = False
        if app_id:
            self.connect(app_id, app_name or app_id, agents, version=version)

    def finish(self, status="completed", **data):
        """Record that this run ended: run.completed, or run.failed (pass error=...). Only the first call counts.

        Called automatically when a `with Office(app_id=...)` block or an init() process ends.
        """
        if self._finished or not self._owns_run:
            return None
        self._finished = True
        if self.client.is_closed:
            self.client = httpx.Client(timeout=3, trust_env=False)
        return self.emit("run.failed" if status == "failed" else "run.completed", **data)

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

    def connect(self, app_id, name, agents=None, version=None):
        """Register the actual app's agent roster and version; more agents can arrive later."""
        connection = Connection(app_id=app_id,name=name,run_id=self.run_id,agents=agents or [])
        try:
            response = self.client.post(f"{self.endpoint}/api/apps/connect",json=connection.model_dump(mode="json",exclude_none=True))
            response.raise_for_status()
            result = response.json()
        except httpx.HTTPError as exc:
            if self.strict:
                raise
            warnings.warn(f"Akshauhini connection unavailable: {exc}",RuntimeWarning,stacklevel=2)
            return None
        # The version travels on its own run.started event rather than in the connect request: an office from before
        # versions existed rejects unknown connect fields, but stores any run.started data, and runs merge identity
        # from every run.started they receive.
        info = app_version(version)
        if info:
            self.emit("run.started", app_id=app_id, app_name=name, **info)
        return result

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

    @contextmanager
    def llm(self, agent_id, model=None, *, task_id=None, prompt=None, capture=None):
        """Trace one LLM call: its time, tokens, cost and errors, and (only when enabled) its prompt and response.

        >>> with office.llm("researcher", "gpt-4o-mini", prompt=messages) as call:
        ...     reply = client.chat.completions.create(model="gpt-4o-mini", messages=messages)
        ...     call.update(response=reply.choices[0].message.content,
        ...                 input_tokens=reply.usage.prompt_tokens, output_tokens=reply.usage.completion_tokens)

        Set any of: response, input_tokens, output_tokens, cache_read_tokens, cost_usd, model. Prompt and response are
        kept only with capture=True, Office(capture_content=True) or AKSHAUHINI_CAPTURE_CONTENT=1, and are clipped to
        CONTENT_LIMIT characters. An exception inside the block is recorded as llm.failed and re-raised.
        """
        capture = self.capture_content if capture is None else capture
        operation_id = str(uuid4())
        base = {"model": model} if model else {}
        self.emit("llm.started", agent_id, task_id, operation_id, **base, **({"prompt": _clip(prompt)} if capture and prompt is not None else {}))
        call = {}
        start = time.perf_counter()

        def finish(phase, extra):
            data = {**base, **{k: v for k, v in call.items() if k not in ("prompt", "response")}, **extra,
                    "duration_ms": (time.perf_counter() - start) * 1000}
            if capture and call.get("response") is not None:
                data["response"] = _clip(call["response"])
            self.emit(f"llm.{phase}", agent_id, task_id, operation_id, **data)

        try:
            yield call
        except BaseException as exc:
            finish("failed", {"error": str(exc)})
            raise
        else:
            finish("completed", {})

    def evaluate(self, name, *, score=None, passed=None, threshold=None, agent_id=None, task_id=None, expected=None,
                 actual=None, reason=None, evaluator=None, **data):
        """Record a quality check on an output, so runs and versions can be compared on quality, not only speed.

        >>> office.evaluate("answer_correct", passed=answer == expected, agent_id="writer")
        >>> office.evaluate("relevance", score=0.82, threshold=0.7, evaluator="llm_judge", reason="Cites both sources")

        Give a score, a pass/fail result, or both; with a score and a threshold, passed is score >= threshold.
        expected and actual are clipped to CONTENT_LIMIT characters.
        """
        if passed is None and score is not None and threshold is not None:
            passed = score >= threshold
        fields = {"name": name, "score": score, "passed": passed, "threshold": threshold, "reason": reason, "evaluator": evaluator,
                  "expected": _clip(expected) if expected is not None else None, "actual": _clip(actual) if actual is not None else None}
        return self.emit("eval.recorded", agent_id, task_id, **{k: v for k, v in fields.items() if v is not None}, **data)

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is not None and not issubclass(exc_type, (KeyboardInterrupt, GeneratorExit)):
                self.finish("failed", error=f"{exc_type.__name__}: {exc}"[:2000])
            else:
                self.finish("completed")
        finally:
            self.close()
