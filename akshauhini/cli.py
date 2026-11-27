import argparse
import os
import signal
import subprocess
import sys
import time
import webbrowser
from uuid import uuid4
import httpx
import uvicorn
from . import __version__
from .config import (DEFAULT_PORT, LOOPBACK, clear_record, default_db, default_endpoint, free_port, home,
                     loopback_endpoint, port_available, read_record, write_record)
from .sdk import Office, collector_running, ensure_collector, locate_office

__all__ = ["main", "collector_running"]

_BARE_PYTHON = {"python", "python3", "python.exe", "python3.exe"}


def use_own_python(command):
    """Run a bare `python`/`python3` with the interpreter Akshauhini is installed in.

    Otherwise an un-activated virtual environment would launch the PATH Python, which cannot import akshauhini.
    Explicit paths (`.venv/bin/python`) and other programs are left untouched.
    """
    if command and command[0].lower() in _BARE_PYTHON and sys.executable:
        return [sys.executable, *command[1:]]
    return list(command)


def _age(iso):
    from datetime import datetime, timezone
    try:
        seconds = (datetime.now(timezone.utc) - datetime.fromisoformat(iso.replace("Z", "+00:00"))).total_seconds()
    except (AttributeError, ValueError):
        return "unknown"
    for unit, size in (("d", 86400), ("h", 3600), ("min", 60)):
        if seconds >= size:
            return f"{int(seconds // size)} {unit} ago"
    return f"{int(seconds)}s ago"


def main(argv=None):
    # Windows consoles default to cp1252; session titles can contain any character. Never crash on output.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(prog="akshauhini", description="Watch every agentic app on this machine in one live office. "
                                     "Run with no command to open the office.")
    parser.add_argument("--port", type=int, default=None,
                        help=f"Office port (default: AKSHAUHINI_PORT, else {DEFAULT_PORT}, or a free port when another program holds {DEFAULT_PORT})")
    parser.add_argument("--version", action="version", version=f"akshauhini {__version__}")
    sub = parser.add_subparsers(dest="action")
    serve = sub.add_parser("serve", help="Run the collector and web office in this terminal")
    serve.add_argument("--host", default="127.0.0.1", help="Interface to bind; 0.0.0.0 exposes the unauthenticated collector to your network (local-agent transcripts stay loopback-only)")
    serve.add_argument("--db", default=None, help=f"SQLite file for this office (default: AKSHAUHINI_DB or {home() / 'akshauhini.sqlite'})")
    serve.add_argument("--app", default=None, help="Serve only this app_id's runs (a per-project office)")
    serve.add_argument("--open", action="store_true", help="Open the office in your browser")
    serve.add_argument("--no-local-agents", action="store_true", help="Hide the Local agents tab (Claude Code, Codex, Gemini CLI transcripts)")
    serve.add_argument("--background", action="store_true", help=argparse.SUPPRESS)  # set by ensure_collector
    sub.add_parser("start", help="Start the office in the background (if needed) and open it")
    sub.add_parser("stop", help="Stop the running office")
    sub.add_parser("status", help="Show whether the office is running and which apps reported recently")
    sub.add_parser("agents", help="List local agents (Claude Code, Codex, Gemini CLI, local LLM) and their sessions")
    delete = sub.add_parser("delete-run", description="Permanently delete one run's events and questions from an office database")
    delete.add_argument("run_id")
    delete.add_argument("--db", default=None, help="SQLite file (default: AKSHAUHINI_DB or ~/.akshauhini/akshauhini.sqlite)")
    run = sub.add_parser("run", help="Run a command with the office attached (AKSHAUHINI_ENDPOINT/RUN_ID are set for it)")
    run.add_argument("--no-open", action="store_true")
    run.add_argument("command", nargs=argparse.REMAINDER)
    scan = sub.add_parser("scan", description="Watch a local tool's own API and mirror what it reports into the office. Opt-in; run in its own terminal.")
    scan.add_argument("source", choices=["ollama"])
    scan.add_argument("--interval", type=float, default=5, help="Seconds between polls")
    args = parser.parse_args(argv)
    # An explicit --port is used as given. Without one, apps and commands find the running office through office.json.
    requested = loopback_endpoint(args.port) if args.port else None

    def fail(message):
        print(f"akshauhini: {message}", file=sys.stderr, flush=True)
        return 2

    if args.action is None or args.action == "start":
        try:
            url = ensure_collector(requested)
        except RuntimeError as exc:
            return fail(exc)
        print(f"Akshauhini office: {url}  (stop with: akshauhini stop)")
        webbrowser.open(url)
        return 0
    if args.action == "serve":
        if args.db:
            os.environ["AKSHAUHINI_DB"] = args.db
        if args.app:
            os.environ["AKSHAUHINI_APP"] = args.app
        if args.no_local_agents:
            os.environ["AKSHAUHINI_LOCAL_AGENTS"] = "0"
        explicit = args.port or (int(os.environ["AKSHAUHINI_PORT"]) if os.getenv("AKSHAUHINI_PORT") else None)
        if explicit:
            port = explicit
            if not port_available(port, args.host):
                return fail(f"port {port} is already in use. Choose a different one with --port, or omit --port to use a free port automatically.")
        else:
            try:
                existing, running = locate_office()
            except RuntimeError:
                running = False
            if running:
                return fail(f"an Akshauhini office is already running at {existing}. Open it there, or start a second office with --port.")
            port = DEFAULT_PORT if port_available(DEFAULT_PORT, args.host) else free_port(args.host)
            if port != DEFAULT_PORT:
                print(f"Port {DEFAULT_PORT} is in use by another program; using free port {port}.", flush=True)
        # The machine office (not a per-project --db/--app office) records its address so apps and commands find it.
        record = read_record()
        if record and not args.background:
            try:
                live = collector_running(loopback_endpoint(record["port"]))
            except RuntimeError:
                live = False
            if not live:
                record = None
        claim = args.background or (record is None and not args.db and not args.app)
        if claim:
            write_record(port, os.getpid(), args.background)
        url = loopback_endpoint(port)
        if args.open:
            import threading
            threading.Timer(1.5, lambda: webbrowser.open(url)).start()
        shown = url if args.host == LOOPBACK else f"http://{args.host}:{port} (open {url} on this machine)"
        print(f"Akshauhini office on {shown}  ·  database {os.getenv('AKSHAUHINI_DB') or default_db()}", flush=True)
        try:
            uvicorn.run("akshauhini.server:create_app", factory=True, host=args.host, port=port, log_level="warning")
        finally:
            if claim:
                clear_record(os.getpid())
        return 0
    if args.action == "stop":
        record = read_record()
        if not record or (args.port and record["port"] != args.port):
            print("No running office recorded. An office started with `akshauhini serve` in a terminal also stops with Ctrl+C.")
            return 1
        office = loopback_endpoint(record["port"])
        try:
            live = collector_running(office)
        except RuntimeError:
            live = False
        if not live:  # never signal a process ID that may since have been reused by another program
            clear_record()
            print(f"The recorded office at {office} was not running.")
            return 1
        pid = record["pid"]
        try:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)
            else:
                os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        clear_record()
        print(f"Stopped office at {office} (pid {pid}).")
        return 0
    endpoint = requested or default_endpoint()
    if args.action == "status":
        try:
            if not requested:
                endpoint, up = locate_office()
            else:
                up = collector_running(endpoint)
        except RuntimeError as exc:
            print(f"Office not running: {exc}")
            return 1
        if not up:
            print(f"Office not running on {endpoint}. Start it with: akshauhini")
            return 1
        health = httpx.get(f"{endpoint}/api/health", timeout=2, trust_env=False).json()
        runs = httpx.get(f"{endpoint}/api/runs", timeout=5, trust_env=False).json()
        print(f"Office running at {endpoint} (v{health.get('version', '?')}), {len(runs)} runs stored")
        apps = {}
        for r in runs:
            apps.setdefault(r.get("app_name") or r.get("app_id") or "unnamed", []).append(r)
        for name, rs in list(apps.items())[:20]:
            print(f"  {name:<32} {len(rs):>4} runs   last event {_age(rs[0].get('last_event_at'))}")
        return 0
    if args.action == "agents":
        from .local_sessions import LocalAgents
        local = LocalAgents()
        for a in local.agents():
            state = "running" if a.get("processes") else "installed" if a.get("installed") else "not found"
            print(f"{a['name']:<14} {state:<10} {a['session_count']:>4} sessions  {a['data_dir']}")
            for s in local.sessions(a["id"], 3) if a.get("readable") else []:
                print(f"    {'*' if s['active'] else '-'} {(s['title'] or s['id'])[:60]:<60} {s['counts']['tool_calls']:>4} tools  {s['files_written']:>3} files written")
        print("\nOpen the Local agents tab in the office for full timelines and to ask a local model about them.")
        return 0
    if args.action == "delete-run":
        from .store import EventStore
        store = EventStore(args.db or default_db())
        try:
            removed = store.delete_run(args.run_id)
        finally:
            store.close()
        if not removed:
            parser.error(f"No run {args.run_id!r} in that database")
        print(f"Deleted run {args.run_id} ({removed} events).")
        return 0
    if args.action == "scan":
        try:
            endpoint, up = (endpoint, collector_running(endpoint)) if requested else locate_office()
        except RuntimeError as exc:
            return fail(exc)
        if not up:
            return fail(f"no office answering at {endpoint}. Start one first: akshauhini")
        from .local_agents import scan_ollama
        try:
            scan_ollama(endpoint, interval=args.interval)
        except KeyboardInterrupt:
            pass
        return 0
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("run requires a command, e.g. akshauhini run python my_app.py")
    server = None
    child = None
    try:
        endpoint, running = locate_office(requested)
    except RuntimeError as exc:
        return fail(exc)
    try:
        if not running:
            port = endpoint.rsplit(":", 1)[1]
            server = subprocess.Popen([sys.executable, "-m", "akshauhini", "--port", port, "serve"])
            for _ in range(150):
                if server.poll() is not None:
                    raise RuntimeError("Collector failed to start")
                try:
                    httpx.get(f"{endpoint}/api/health", timeout=0.2, trust_env=False).raise_for_status()
                    break
                except httpx.HTTPError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Collector startup timed out")
        run_id = str(uuid4())
        print(f"Akshauhini: {endpoint}/?run={run_id}\nUse the Office SDK or AOEP HTTP events for agent-level activity.", flush=True)
        if not args.no_open:
            webbrowser.open(f"{endpoint}/?run={run_id}")
        with Office(endpoint, run_id) as office:
            office.emit("run.started", title=" ".join(command))
            child = subprocess.Popen(use_own_python(command), env={**os.environ, "AKSHAUHINI_ENDPOINT": endpoint, "AKSHAUHINI_RUN_ID": run_id})
            code = child.wait()
            office.emit("run.completed" if code == 0 else "run.failed", exit_code=code)
        if server:
            print("Run stored. Office stays open for inspection; Ctrl+C to stop.", flush=True)
            try:
                server.wait()
            except KeyboardInterrupt:
                pass
        return code
    finally:
        for process in (child, server):
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    sys.exit(main())
