"""Read-only views of coding agents that run on this machine (Claude Code, Codex CLI, Gemini CLI, Ollama).

Each adapter reads only the transcript files the tool itself writes to the user's home directory. Nothing is
modified, copied, uploaded or sent anywhere: the collector serves summaries to the local browser, and a question
about a session is answered by a *local* Ollama model only (see `ask`). Every record reports the exact file it came
from, so the user can always see what Akshauhini read.

Formats are undocumented and change between releases, so parsing is tolerant: unknown records are counted, not
guessed at, and a file that cannot be read is reported with its error instead of hiding the agent.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Callable, Iterable

ACTIVE_SECONDS = 120          # a transcript written in the last two minutes counts as "active now"
TIMELINE_LIMIT = 600          # newest events kept per session detail; older ones are counted, not shown
TEXT_LIMIT = 600              # characters kept per message/tool input in the timeline
URL = re.compile(r"https?://[^\s\"'<>)\]}\\]+")
PATCH_FILE = re.compile(r"\*\*\* (Add|Update|Delete) File: ([^\n\"\\]+)")
CODEX_CMD = re.compile(r'"?\b(?:cmd|command)"?\s*:\s*"((?:[^"\\]|\\.)*)"')   # JSON or JS-object keys

READ_TOOLS = {"read", "glob", "grep", "ls", "notebookread", "read_file", "read_many_files", "list_directory",
              "glob_tool", "search_file_content", "view", "view_file"}
WRITE_TOOLS = {"write", "edit", "multiedit", "notebookedit", "write_file", "replace", "apply_patch", "create_file",
               "str_replace", "edit_file"}
SHELL_TOOLS = {"bash", "powershell", "shell", "run_shell_command", "local_shell", "exec_command", "container.exec"}
NET_TOOLS = {"webfetch", "websearch", "web_fetch", "google_web_search", "web_search", "web_search_call", "fetch"}


# ── normalized session ──────────────────────────────────────────────────────

@dataclass
class Session:
    agent: str
    id: str
    path: str
    size: int
    modified: float
    title: str | None = None
    cwd: str | None = None
    started: str | None = None
    updated: str | None = None
    version: str | None = None
    models: set = field(default_factory=set)
    tokens: dict = field(default_factory=lambda: {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0})
    counts: dict = field(default_factory=lambda: {"user": 0, "assistant": 0, "tool_calls": 0, "tool_errors": 0, "unparsed": 0})
    tools: dict = field(default_factory=dict)
    files_read: dict = field(default_factory=dict)      # path -> count
    files_written: dict = field(default_factory=dict)
    commands: list = field(default_factory=list)
    network: list = field(default_factory=list)          # {"tool", "target"}
    timeline: list = field(default_factory=list)
    timeline_dropped: int = 0

    def stamp(self, ts):
        if isinstance(ts, (int, float)):
            ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts / 1000 if ts > 1e11 else ts))
        if isinstance(ts, str) and ts:
            if not self.started or ts < self.started:
                self.started = ts
            if not self.updated or ts > self.updated:
                self.updated = ts
        return ts if isinstance(ts, str) else None

    def add(self, kind, ts, text, **extra):
        if len(self.timeline) >= TIMELINE_LIMIT:   # keep the newest: the live office and questions need recent work
            self.timeline.pop(0)
            self.timeline_dropped += 1
        item = {"t": ts, "kind": kind, "text": _clip(text)}
        item.update({k: v for k, v in extra.items() if v not in (None, "", [], {})})
        self.timeline.append(item)

    def tool(self, name, ts, args, call_id=None):
        """Record a tool call and classify what it touched: files read/written, commands, network targets."""
        name = str(name or "tool")
        self.counts["tool_calls"] += 1
        self.tools[name] = self.tools.get(name, 0) + 1
        key = name.lower().split("__")[-1] if not name.startswith("mcp__") else "mcp"
        raw = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False, default=str)
        data = args if isinstance(args, dict) else {}
        target = None
        path = next((data[k] for k in ("file_path", "absolute_path", "notebook_path", "path") if isinstance(data.get(k), str)), None)
        if key in READ_TOOLS:
            target = path or data.get("pattern") or data.get("paths")
            if path:
                _bump(self.files_read, path)
        elif key in WRITE_TOOLS:
            paths = [path] if path else [m[1].strip() for m in PATCH_FILE.findall(raw)]
            for p in paths:
                _bump(self.files_written, p)
            target = ", ".join(paths) or None
        elif key in SHELL_TOOLS:
            cmd = data.get("command") or data.get("cmd")
            cmd = " ".join(cmd) if isinstance(cmd, list) else cmd
            target = cmd if isinstance(cmd, str) else raw
            self.commands.append({"t": ts, "command": _clip(target, 400)})
        elif key == "mcp":
            server = name.split("__")[1] if name.count("__") >= 2 else "mcp"
            target = f"MCP server '{server}'"
            self.network.append({"t": ts, "tool": name, "target": target})
        if key in NET_TOOLS:
            target = data.get("url") or data.get("query") or data.get("prompt") or raw
            self.network.append({"t": ts, "tool": name, "target": _clip(str(target), 300)})
        elif key not in SHELL_TOOLS and key != "mcp":
            # Codex wraps calls in JS cells; Gemini/others may embed commands. Pull out what is visible.
            for cmd in CODEX_CMD.findall(raw) if key in {"exec", "js"} else []:
                self.commands.append({"t": ts, "command": _clip(_unescape(cmd), 400)})
            for _, p in PATCH_FILE.findall(raw):
                _bump(self.files_written, p.strip())
        for url in (u.rstrip(".,;:'") for u in URL.findall(raw)[:5]):
            if key not in NET_TOOLS and not any(n["target"] == url for n in self.network[-5:]):
                self.network.append({"t": ts, "tool": name, "target": url})
        self.add("tool", ts, target or raw, tool=name, id=call_id, station=_station(key))

    def summary(self):
        now = time.time()
        return {
            "agent": self.agent, "id": self.id, "title": self.title, "cwd": self.cwd, "path": self.path,
            "size": self.size, "started": self.started, "updated": self.updated, "version": self.version,
            "active": now - self.modified < ACTIVE_SECONDS, "modified": self.modified,
            "models": sorted(self.models), "tokens": self.tokens, "counts": self.counts,
            "tools": dict(sorted(self.tools.items(), key=lambda kv: -kv[1])),
            "files_read": len(self.files_read), "files_written": len(self.files_written),
            "commands": len(self.commands), "network": len(self.network),
        }

    def detail(self):
        return {**self.summary(),
                "files_read": _ranked(self.files_read), "files_written": _ranked(self.files_written),
                "commands": self.commands[-200:], "network": self.network[-200:],
                "timeline": self.timeline, "timeline_dropped": self.timeline_dropped}


def _station(key: str) -> str:
    """The office station a tool call visits (see stationFor in web/src/engine.ts)."""
    if key in NET_TOOLS:
        return "research"
    if key in READ_TOOLS:
        return "archive"
    if key in WRITE_TOOLS or key in SHELL_TOOLS or key in {"exec", "js"}:
        return "engineering"
    return "compute"


def _clip(text, limit=TEXT_LIMIT):
    if text is None:
        return ""
    if not isinstance(text, str):
        text = json.dumps(text, ensure_ascii=False, default=str)
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + f"… [+{len(text) - limit} chars]"


def _unescape(s):
    try:
        return json.loads(f'"{s}"')
    except ValueError:
        return s


def _bump(d, key):
    d[key] = d.get(key, 0) + 1


def _ranked(d):
    return [{"path": k, "count": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])][:300]


def _text_of(content):
    """Join the human-readable text in a message content field (string or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "\n".join(parts)
    return ""


def _jsonl(path: Path) -> Iterable[dict | None]:
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                yield record if isinstance(record, dict) else None
            except ValueError:
                yield None


# ── Claude Code: ~/.claude/projects/<encoded cwd>/<session>.jsonl ──────────

def parse_claude(path: Path, s: Session):
    seen_usage = set()
    for r in _jsonl(path):
        if r is None:
            s.counts["unparsed"] += 1
            continue
        kind, ts = r.get("type"), s.stamp(r.get("timestamp"))
        s.cwd = s.cwd or r.get("cwd")
        s.version = r.get("version") or s.version
        if kind in ("ai-title", "summary"):
            s.title = r.get("aiTitle") or r.get("summary") or s.title
            continue
        message = r.get("message")
        if kind not in ("user", "assistant") or not isinstance(message, dict):
            continue
        content = message.get("content")
        if kind == "assistant":
            if message.get("model") and not str(message["model"]).startswith("<"):
                s.models.add(message["model"])
            usage, mid = message.get("usage"), message.get("id") or r.get("requestId")
            # One API response is split across several records that repeat the same usage; count it once.
            if isinstance(usage, dict) and mid not in seen_usage:
                seen_usage.add(mid)
                # Anthropic's input_tokens excludes cached tokens; "input" here is every prompt token (as Codex and
                # Gemini report it), with cache reads and writes as the parts of it served from / written to cache.
                read, write = int(usage.get("cache_read_input_tokens") or 0), int(usage.get("cache_creation_input_tokens") or 0)
                s.tokens["input"] += int(usage.get("input_tokens") or 0) + read + write
                s.tokens["output"] += int(usage.get("output_tokens") or 0)
                s.tokens["cache_read"] += read
                s.tokens["cache_write"] += write
            for block in content if isinstance(content, list) else [content]:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    s.tool(block.get("name"), ts, block.get("input"), block.get("id"))
                elif isinstance(block, dict) and block.get("type") == "text" and block.get("text", "").strip():
                    s.counts["assistant"] += 1
                    s.add("assistant", ts, block["text"], model=message.get("model"))
                elif isinstance(block, str) and block.strip():
                    s.counts["assistant"] += 1
                    s.add("assistant", ts, block)
        else:
            blocks = content if isinstance(content, list) else [content]
            results = [b for b in blocks if isinstance(b, dict) and b.get("type") == "tool_result"]
            for b in results:
                if b.get("is_error") in (True, "true", "True"):
                    s.counts["tool_errors"] += 1
                    s.add("tool_error", ts, _text_of(b.get("content")), id=b.get("tool_use_id"))
            text = _text_of([b for b in blocks if not (isinstance(b, dict) and b.get("type") == "tool_result")])
            if text.strip() and not r.get("isMeta"):
                s.counts["user"] += 1
                s.add("user", ts, text)
                s.title = s.title or _clip(text.splitlines()[0], 80)


# ── Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ────────────────

def parse_codex(path: Path, s: Session):
    for r in _jsonl(path):
        if r is None:
            s.counts["unparsed"] += 1
            continue
        kind, ts, p = r.get("type"), s.stamp(r.get("timestamp")), r.get("payload")
        if not isinstance(p, dict):
            continue
        ptype = p.get("type")
        if kind == "session_meta":
            s.id = p.get("id") or p.get("session_id") or s.id
            s.cwd = p.get("cwd") or s.cwd
            s.version = p.get("cli_version") or s.version
        elif kind == "turn_context":
            s.cwd = p.get("cwd") or s.cwd
            if p.get("model"):
                s.models.add(p["model"])
        elif kind == "event_msg" and ptype == "thread_settings_applied":
            model = (p.get("thread_settings") or {}).get("model")
            if model:
                s.models.add(model)
        elif kind == "event_msg" and ptype == "token_count":
            total = (p.get("info") or {}).get("total_token_usage") or {}
            # Running totals: keep the latest, not a sum.
            if total:
                s.tokens.update(input=int(total.get("input_tokens") or 0), output=int(total.get("output_tokens") or 0),
                                cache_read=int(total.get("cached_input_tokens") or 0),
                                cache_write=int(total.get("cache_write_input_tokens") or 0))
        elif kind == "response_item" and ptype == "message":
            role, text = p.get("role"), _text_of(p.get("content"))
            if role == "user" and text.strip() and not text.lstrip().startswith(("<environment_context", "<user_instructions", "<permissions")):
                s.counts["user"] += 1
                s.add("user", ts, text)
                s.title = s.title or _clip(text.strip().splitlines()[0], 80)
            elif role == "assistant" and text.strip():
                s.counts["assistant"] += 1
                s.add("assistant", ts, text)
        elif kind == "response_item" and ptype in ("function_call", "custom_tool_call", "local_shell_call", "web_search_call"):
            args = p.get("arguments") if ptype == "function_call" else p.get("input") if ptype == "custom_tool_call" else p.get("action")
            if isinstance(args, str) and ptype == "function_call":
                try:
                    args = json.loads(args)
                except ValueError:
                    pass
            name = p.get("name") or ("shell" if ptype == "local_shell_call" else "web_search" if ptype == "web_search_call" else ptype)
            if name == "wait":
                continue
            s.tool(name, ts, args, p.get("call_id"))
        elif kind == "response_item" and ptype in ("function_call_output", "custom_tool_call_output"):
            out = p.get("output")
            text = _text_of(out) if not isinstance(out, str) else out
            if re.search(r"(exit code|Exit code|exit_code)\W+[1-9]", text or ""):
                s.counts["tool_errors"] += 1
                s.add("tool_error", ts, text, id=p.get("call_id"))


def codex_titles(home: Path) -> dict:
    index = home / ".codex" / "session_index.jsonl"
    titles = {}
    if index.exists():
        try:
            for r in _jsonl(index):
                if r and r.get("id") and r.get("thread_name"):
                    titles[r["id"]] = r["thread_name"]
        except OSError:
            pass
    return titles


# ── Gemini CLI: ~/.gemini/tmp/<project hash>/chats/session-*.json ──────────

def parse_gemini(path: Path, s: Session):
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except ValueError:
        s.counts["unparsed"] += 1
        return
    if not isinstance(data, dict):
        s.counts["unparsed"] += 1
        return
    s.id = data.get("sessionId") or s.id
    s.stamp(data.get("startTime"))
    s.stamp(data.get("lastUpdated"))
    for m in data.get("messages") or []:
        if not isinstance(m, dict):
            s.counts["unparsed"] += 1
            continue
        ts, kind = s.stamp(m.get("timestamp")), m.get("type")
        text = _text_of(m.get("content"))
        if m.get("model"):
            s.models.add(m["model"])
        tokens = m.get("tokens")
        if isinstance(tokens, dict):
            s.tokens["input"] += int(tokens.get("input") or 0)
            s.tokens["output"] += int(tokens.get("output") or 0)
            s.tokens["cache_read"] += int(tokens.get("cached") or 0)
        if kind == "user" and text.strip():
            s.counts["user"] += 1
            s.add("user", ts, text)
            s.title = s.title or _clip(text.strip().splitlines()[0], 80)
        elif kind in ("gemini", "model", "assistant") and text.strip():
            s.counts["assistant"] += 1
            s.add("assistant", ts, text, model=m.get("model"))
        for call in m.get("toolCalls") or []:
            if isinstance(call, dict):
                s.tool(call.get("name"), call.get("timestamp") or ts, call.get("args"), call.get("id"))
                if str(call.get("status", "")).lower() in ("error", "failed", "cancelled"):
                    s.counts["tool_errors"] += 1


# ── sources ────────────────────────────────────────────────────────────────

@dataclass
class Source:
    id: str
    name: str
    vendor: str
    root: Callable[[Path], Path]
    pattern: str
    parser: Callable[[Path, Session], None] | None
    processes: tuple
    note: str = ""


def _claude_root(home):
    configured = os.getenv("CLAUDE_CONFIG_DIR")
    return Path(configured) / "projects" if configured else home / ".claude" / "projects"


def _codex_root(home):
    configured = os.getenv("CODEX_HOME")
    return Path(configured) / "sessions" if configured else home / ".codex" / "sessions"


SOURCES = [
    Source("claude-code", "Claude Code", "Anthropic", _claude_root, "*/*.jsonl", parse_claude, ("claude",)),
    Source("codex", "Codex CLI", "OpenAI", _codex_root, "**/rollout-*.jsonl", parse_codex, ("codex",)),
    Source("gemini-cli", "Gemini CLI", "Google", lambda h: h / ".gemini" / "tmp", "*/chats/*.json", parse_gemini, ("gemini",)),
    Source("antigravity", "Antigravity", "Google", lambda h: h / ".gemini" / "antigravity", "", None, ("antigravity",),
           "Conversations are stored in a binary format Akshauhini does not read; only presence is shown."),
]


class LocalAgents:
    """Discovers local coding agents and parses their transcripts, caching each file by (mtime, size)."""

    def __init__(self, home: Path | None = None, ollama_url: str | None = None):
        self.home = Path(home or os.getenv("AKSHAUHINI_LOCAL_HOME") or Path.home())
        self.ollama_url = (ollama_url or os.getenv("AKSHAUHINI_OLLAMA_URL", "http://127.0.0.1:11434")).rstrip("/")
        self._cache: dict[str, tuple[float, int, Session]] = {}
        self._lock = Lock()
        self._procs: tuple[float, dict] = (0, {})

    def source(self, agent_id) -> Source:
        for src in SOURCES:
            if src.id == agent_id:
                return src
        raise KeyError(f"Unknown local agent {agent_id!r}")

    def _files(self, src: Source, limit=None):
        root = src.root(self.home)
        if not src.pattern or not root.is_dir():
            return []
        files = []
        for f in root.glob(src.pattern):
            try:
                st = f.stat()
            except OSError:
                continue
            if f.is_file() and st.st_size > 0:
                files.append((st.st_mtime, st.st_size, f))
        files.sort(key=lambda x: -x[0])
        return files[:limit] if limit else files

    def _session(self, src: Source, mtime, size, path: Path) -> Session:
        key = str(path)
        with self._lock:
            hit = self._cache.get(key)
            if hit and hit[0] == mtime and hit[1] == size:
                return hit[2]
        s = Session(agent=src.id, id=path.stem, path=key, size=size, modified=mtime)
        try:
            src.parser(path, s)
        except OSError as exc:
            s.title = f"Unreadable: {exc}"
        if src.id == "codex":
            s.id = s.id.split("rollout-")[-1][20:] if s.id.startswith("rollout-") else s.id
            s.title = codex_titles(self.home).get(s.id) or s.title
        if src.id == "claude-code" and not s.cwd:
            s.cwd = path.parent.name
        with self._lock:
            self._cache[key] = (mtime, size, s)
        return s

    def processes(self) -> dict:
        """Running process names (lower-case, without extension), refreshed at most every 5 seconds."""
        at, names = self._procs
        if time.time() - at < 5:
            return names
        names = {}
        try:
            if sys.platform == "win32":
                out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=5,
                                     creationflags=subprocess.CREATE_NO_WINDOW).stdout
                for line in out.splitlines():
                    name = line.split('","')[0].strip('"').lower().removesuffix(".exe")
                    names[name] = names.get(name, 0) + 1
                # Node-based CLIs run as node.exe; their command lines need wmic/powershell, which is slow. Skip.
            else:
                out = subprocess.run(["ps", "-eo", "args="], capture_output=True, text=True, timeout=5).stdout
                for line in out.splitlines():
                    for token in line.split()[:3]:
                        name = Path(token).name.lower()
                        names[name] = names.get(name, 0) + 1
        except (OSError, subprocess.SubprocessError):
            pass
        self._procs = (time.time(), names)
        return names

    def agents(self) -> list[dict]:
        procs = self.processes()
        result = []
        for src in SOURCES:
            root = src.root(self.home)
            files = self._files(src)
            running = sum(procs.get(p, 0) for p in src.processes)
            latest = files[0][0] if files else None
            result.append({
                "id": src.id, "name": src.name, "vendor": src.vendor,
                "installed": root.exists() or bool(shutil.which(src.processes[0])),
                "readable": src.parser is not None, "data_dir": str(root), "pattern": src.pattern or None,
                "session_count": len(files), "last_active": latest,
                "active_sessions": sum(1 for m, _, _ in files if time.time() - m < ACTIVE_SECONDS),
                "processes": running, "note": src.note,
            })
        result.append(self._ollama())
        return result

    def _ollama(self):
        info = {"id": "ollama", "name": "Local LLM", "vendor": "Local offline LLM", "readable": False, "data_dir": self.ollama_url,
                "pattern": None, "session_count": 0, "last_active": None, "active_sessions": 0,
                "processes": self.processes().get("ollama", 0), "installed": bool(shutil.which("ollama")),
                "note": "The local LLM keeps no chat history. Shown: models currently loaded in memory (/api/ps).",
                "loaded_models": []}
        try:
            import httpx
            r = httpx.get(f"{self.ollama_url}/api/ps", timeout=1.5, trust_env=False)
            r.raise_for_status()
            info["loaded_models"] = [{"name": m.get("name"), "size_vram": m.get("size_vram"), "expires_at": m.get("expires_at")}
                                     for m in r.json().get("models", [])]
            info["installed"] = True
            info["active_sessions"] = len(info["loaded_models"])
        except Exception as exc:  # noqa: BLE001 - any failure means "not reachable", which is what we report
            info["error"] = f"Not reachable at {self.ollama_url}: {type(exc).__name__}"
        return info

    def sessions(self, agent_id, limit=50) -> list[dict]:
        src = self.source(agent_id)
        if not src.parser:
            return []
        return [self._session(src, m, size, f).summary() for m, size, f in self._files(src, limit)]

    def session(self, agent_id, session_id) -> Session:
        src = self.source(agent_id)
        if not src.parser:
            raise KeyError(f"{src.name} transcripts are not readable")
        for m, size, f in self._files(src):
            s = self._session(src, m, size, f)
            if session_id in (s.id, f.stem):
                return s
        raise KeyError(f"No {src.name} session {session_id!r}")

    # ── grounded context for the local LLM ───────────────────────────────

    @staticmethod
    def work_history(s: "Session", limit: int = 40) -> str:
        """Every request in the session (oldest first) with what the agent did in response: tools, targets, reply."""
        turns, turn = [], None
        for item in s.timeline:
            if item["kind"] == "user":
                turn = {"t": item.get("t"), "request": item["text"][:240], "tools": {}, "targets": [], "errors": 0, "reply": ""}
                turns.append(turn)
                continue
            if turn is None:
                turn = {"t": item.get("t"), "request": "(earlier request not in the kept transcript)", "tools": {}, "targets": [], "errors": 0, "reply": ""}
                turns.append(turn)
            if item["kind"] == "tool":
                name = item.get("tool") or "tool"
                turn["tools"][name] = turn["tools"].get(name, 0) + 1
                if len(turn["targets"]) < 6:
                    turn["targets"].append(item["text"][:90])
            elif item["kind"] == "tool_error":
                turn["errors"] += 1
            elif item["kind"] == "assistant":
                turn["reply"] = item["text"][:260]
        lines = []
        if s.timeline_dropped:
            lines.append(f"({s.timeline_dropped} oldest transcript entries are not kept; history starts below.)")
        shown = turns if len(turns) <= limit else turns[:5] + [None] + turns[-(limit - 5):]
        for t in shown:
            if t is None:
                lines.append(f"... {len(turns) - limit} requests omitted ...")
                continue
            did = ", ".join(f"{k}x{v}" for k, v in t["tools"].items()) or "no tools"
            if t["errors"]:
                did += f"; {t['errors']} failed"
            if t["targets"]:
                did += "; on: " + " | ".join(t["targets"])
            lines.append(f"- [{t['t'] or '?'}] REQUEST: {t['request']}\n  DID: {did}\n  LAST REPLY: {t['reply'] or '(none)'}")
        return "\n".join(lines)

    def context(self, agent_id=None, session_id=None, budget=16000) -> tuple[str, list[dict]]:
        """Build the exact text a local model will see, and the list of transcript files it came from."""
        # Totals first, so "how many sessions" is answered from the full inventory, not from
        # however many sessions happened to fit in the budget below.
        inventory = [f"- {src.name}: {len(self._files(src))} sessions stored"
                     for src in SOURCES if src.parser and agent_id in (None, src.id)]
        if agent_id and session_id:
            chosen = [self.session(agent_id, session_id)]
        else:
            ids = [agent_id] if agent_id else [s.id for s in SOURCES if s.parser]
            chosen = []
            for aid in ids:
                src = self.source(aid)
                if src.parser:
                    chosen += [self._session(src, m, size, f) for m, size, f in self._files(src, 8)]
            chosen.sort(key=lambda s: -s.modified)
            chosen = chosen[:12]
        parts, sources = [], []
        per = max(1500, budget // max(1, len(chosen)))
        for s in chosen:
            name = self.source(s.agent).name
            head = (f"### {name} session {s.id}\nTitle: {s.title}\nWorking directory: {s.cwd}\nStarted: {s.started}  Updated: {s.updated}\n"
                    f"Models: {', '.join(sorted(s.models)) or 'not recorded'}\nTokens: {s.tokens}\nCounts: {s.counts}\n"
                    f"Tools used: {s.tools}\nFiles read ({len(s.files_read)}): {', '.join(list(s.files_read)[:40])}\n"
                    f"Files written ({len(s.files_written)}): {', '.join(list(s.files_written)[:40])}\n"
                    f"Network/external targets ({len(s.network)}): {'; '.join(n['tool'] + ' → ' + n['target'] for n in s.network[:25])}\n"
                    f"Commands ({len(s.commands)}): {' | '.join(c['command'][:120] for c in s.commands[-20:])}\n")
            if agent_id and session_id:   # one session: include its whole arc, not only the latest entries
                # Capped so the latest raw entries below still fit in the local model's context window.
                head += "Work history (every request, oldest first):\n" + self.work_history(s, limit=20)[:10000] + "\n"
            body, room = [], per - len(head)
            for item in reversed(s.timeline):   # newest first until the budget is used, then restore order
                line = f"[{item.get('t') or ''}] {item['kind']}{'(' + item['tool'] + ')' if item.get('tool') else ''}: {item['text'][:300]}"
                if room - len(line) < 0:
                    break
                body.append(line)
                room -= len(line) + 1
            body.reverse()
            parts.append(head + "Recent timeline:\n" + "\n".join(body))
            sources.append({"agent": s.agent, "session": s.id, "title": s.title, "path": s.path})
        header = ("INVENTORY (complete counts):\n" + "\n".join(inventory) +
                  f"\nThe digest below covers {len(chosen)} session(s), most recent first; it is not the full history.\n\n")
        return (header + "\n\n".join(parts))[:budget], sources


def _n(count: int, noun: str) -> str:
    return f"{count} {noun}{'' if count == 1 else 's'}"


def _short(title: str, limit: int = 18) -> str:
    """A floor label that doesn't collide with its neighbours: whole words up to `limit` characters."""
    if len(title) <= limit:
        return title
    cut = title[:limit].rsplit(" ", 1)[0]
    return (cut if len(cut) >= 8 else title[:limit - 1]) + "…"


def _event_id(*parts) -> str:
    import hashlib
    return hashlib.sha1("\x1f".join(str(p) for p in parts).encode("utf-8", "replace")).hexdigest()[:24]


def office_events(local: "LocalAgents", hours: float = 24, max_sessions: int = 16, per_session: int = 12) -> list[dict]:
    """Recent local sessions as AOEP events, so the office floor can draw them like any connected app.

    One character per session; its department is the agent product (Claude Code, Codex, ...), its role the project
    folder. Each transcript entry becomes the event it really was: a user request starts a task, a model turn is an
    LLM call at the desk, a tool call walks to the station for that kind of tool. Event ids are content hashes, so
    polling again returns the same ids and only new transcript entries are new events.
    """
    cutoff = time.time() - hours * 3600
    sessions = []
    for src in SOURCES:
        if not src.parser:
            continue
        for mtime, size, f in local._files(src, max_sessions):
            if mtime < cutoff:
                break
            try:
                sessions.append((src, local._session(src, mtime, size, f)))
            except Exception:   # an unreadable transcript must not hide the others
                continue
    sessions.sort(key=lambda x: -x[1].modified)
    events = []
    for src, s in sessions[:max_sessions]:
        aid = f"{s.agent}:{s.id}"
        start = s.started or s.updated or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(s.modified))
        folder = Path(s.cwd).name if s.cwd else "unknown folder"
        title = (s.title or "Untitled session").strip()
        model = sorted(s.models)[-1] if s.models else None
        base = {"run_id": "local", "agent_id": aid, "version": "0.1"}
        events.append({**base, "event_id": _event_id(aid, "created"), "type": "agent.created", "timestamp": start,
                       "data": {"name": _short(title), "role": folder, "department": src.name, "model": model,
                                "session": s.id, "local_agent": s.agent, "title": title, "path": s.path}})
        items = [i for i in s.timeline if i["kind"] in ("user", "assistant", "tool", "tool_error")][-per_session:]
        seen, task = {}, None
        for item in items:
            ts = item.get("t") or s.updated or start
            key = (item["kind"], ts, item.get("tool"), item["text"][:120])
            seen[key] = seen.get(key, 0) + 1
            eid = _event_id(aid, *key, seen[key])
            text = item["text"]
            if item["kind"] == "user":
                if task:
                    events.append({**base, "event_id": eid + "d", "type": "task.completed", "timestamp": ts, "task_id": task, "data": {}})
                task = f"{aid}:{eid}"
                events.append({**base, "event_id": eid, "type": "task.started", "timestamp": ts, "task_id": task,
                               "data": {"title": text[:90]}})
            elif item["kind"] == "assistant":
                for suffix, kind in (("s", "llm.started"), ("c", "llm.completed")):
                    events.append({**base, "event_id": eid + suffix, "type": kind, "timestamp": ts, "operation_id": eid,
                                   **({"task_id": task} if task else {}),
                                   "data": {"model": item.get("model") or model, "summary": text[:300]}})
            elif item["kind"] == "tool":
                data = {"tool": item.get("tool") or "tool", "station": item.get("station", "compute"), "target": text[:300]}
                for suffix, kind in (("s", "tool.call.started"), ("c", "tool.call.completed")):
                    events.append({**base, "event_id": eid + suffix, "type": kind, "timestamp": ts, "operation_id": eid,
                                   **({"task_id": task} if task else {}), "data": data})
            else:   # a failed tool call is shown in the activity stream without freezing the character in an error state
                events.append({**base, "event_id": eid, "type": "x.tool.error", "timestamp": ts, "data": {"error": text[:300]}})
        # Running token totals, shown when hovering the character. A new event only when the totals change.
        tk = s.tokens
        if any(tk.values()):
            events.append({**base, "event_id": _event_id(aid, "usage", tk["input"], tk["output"], tk["cache_read"], tk["cache_write"]),
                           "type": "x.usage", "timestamp": s.updated or start, "data": dict(tk)})
        active = time.time() - s.modified < ACTIVE_SECONDS
        # A quiet session has finished its last request: the office walks it to the lobby, where it sleeps until
        # its transcript grows again.
        state = "working" if active else "completed"
        if task and not active:
            events.append({**base, "event_id": _event_id(aid, "done", task, s.updated), "type": "task.completed",
                           "timestamp": s.updated or start, "task_id": task, "data": {}})
        summary = (f"{src.name} session in {folder}: {_n(s.counts['user'], 'request')}, {_n(s.counts['tool_calls'], 'tool call')}, "
                   f"{_n(len(s.files_written), 'file')} written. {'Writing its transcript now.' if active else 'Sleeping since ' + (s.updated or start) + '.'}")
        # One "working" event per session (not one per poll, which would keep pulling the character back to its desk);
        # a new "idle" event each time it goes quiet.
        events.append({**base, "event_id": _event_id(aid, "state", state, "" if active else s.updated), "type": "agent.progress",
                       "timestamp": s.updated or start, **({"task_id": task} if task else {}),
                       "data": {"state": state, "summary": summary, "completed_items": [], "waiting_for": [],
                                "next_steps": [], "progress": None}})
    events.sort(key=lambda e: e["timestamp"])
    for i, e in enumerate(events, 1):
        e["seq"] = i
    return events


def is_local_url(url: str) -> bool:
    host = re.sub(r"^\w+://", "", url).split("/")[0].rsplit(":", 1)[0].strip("[]").lower()
    return host in ("127.0.0.1", "localhost", "::1") or host.startswith("127.")


def is_cloud_model(name: str) -> bool:
    return bool(re.search(r"(^|[-:])cloud($|[-:])", name or ""))
