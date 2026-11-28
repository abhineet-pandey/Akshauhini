"""Operational answers computed from recorded telemetry.

Every answer is derived from events the app actually sent and cites them (agent, event sequence, numbers). Nothing is
estimated: when the data needed for an answer was not reported, the answer says what is missing and how to report it.

Questions answered per run and per project:
  stuck       Why is my agent stuck?
  latency     Which agent is responsible for most of the latency?
  loops       Are two agents repeatedly calling each other?
  failure     Why did this workflow fail?
  tokens      Which agent consumed the most tokens?
  versions    Is the latest version performing worse than the previous version?   (project only)
plus the LLM call trace and evaluation results.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import mean, median

# A run that has reported nothing for this long while work is still open is called idle.
IDLE_SECONDS = 60
# Back-and-forth exchanges between the same two agents before they count as a loop.
LOOP_ROUND_TRIPS = 3
# How much worse a version must be before it is called a regression.
WORSE = {"success_rate": 0.10, "duration": 0.20, "tokens": 0.20, "eval_score": 0.05, "eval_pass_rate": 0.10}
INTERACTIONS = ("message.sent", "handoff.started", "task.assigned", "question.routed")
OPERATION_KINDS = ("llm", "tool.call", "task", "review")
FAILURES = ("llm.failed", "tool.call.failed", "task.failed", "agent.failed", "review.rejected", "human.rejected", "task.cancelled")


# ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _time(event):
    try:
        return datetime.fromisoformat(str(event["timestamp"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None


def _seconds(ms):
    return round(ms / 1000, 3)  # millisecond precision: short tool calls must not round to zero


def _n(count, word, plural=None):
    """'1 run', '3 runs': a count with its noun in the right number."""
    return f"{count} {word if count == 1 else plural or word + 's'}"


def _fmt_s(seconds):
    if seconds is None:
        return "unknown time"
    if seconds >= 3600:
        return f"{seconds / 3600:.1f} h"
    if seconds >= 60:
        return f"{seconds / 60:.1f} min"
    if seconds < 0.1:
        return f"{seconds * 1000:.0f} ms"
    return f"{seconds:.1f} s"


def _fmt_tokens(n):
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.1f}k" if n >= 1e3 else str(int(n))


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _short(text, limit=300):
    text = str(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _cite(event):
    return {"seq": event.get("seq"), "event_id": event.get("event_id"), "type": event.get("type"),
            "agent_id": event.get("agent_id"), "task_id": event.get("task_id"), "timestamp": event.get("timestamp")}


def _kind(event_type):
    for kind in OPERATION_KINDS:
        if event_type.startswith(kind + "."):
            return kind
    return None


class _Run:
    """One run's events, indexed once for every analysis."""

    def __init__(self, events, now=None):
        self.events = sorted(events, key=lambda e: e.get("seq") or 0)
        self.agents = {}
        self.identity = {}
        for e in self.events:
            d = e.get("data") or {}
            if e["type"] == "run.started":
                for key in ("app_id", "app_name", "title", "version", "commit"):
                    if isinstance(d.get(key), str) and d[key]:
                        self.identity[key] = d[key]
            if e.get("agent_id"):
                agent = self.agents.setdefault(e["agent_id"], {"id": e["agent_id"], "name": e["agent_id"], "role": "worker"})
                if e["type"] in ("agent.created", "agent.updated"):
                    if isinstance(d.get("name"), str):
                        agent["name"] = d["name"]
                    if isinstance(d.get("role"), str):
                        agent["role"] = d["role"]
        times = [t for t in map(_time, self.events) if t]
        self.started = times[0] if times else None
        self.last = times[-1] if times else None
        ends = [e for e in self.events if e["type"] in ("run.completed", "run.failed")]
        self.end = ends[-1] if ends else None
        self.status = "failed" if self.end and self.end["type"] == "run.failed" else "completed" if self.end else "running"
        self.now = now or datetime.now(timezone.utc)
        # The clock for "how long has this been open": now while running, the end of the run afterwards.
        self.clock = self.now if self.status == "running" else (_time(self.end) or self.last or self.now)
        self.operations = self._operations()

    def name(self, agent_id):
        return self.agents.get(agent_id, {}).get("name", agent_id or "the app")

    def _operations(self):
        """llm/tool/task/review operations, paired by operation_id (or task_id for tasks)."""
        ops = {}
        for e in self.events:
            kind = _kind(e["type"])
            if not kind:
                continue
            phase = e["type"].rsplit(".", 1)[1]
            key = e.get("operation_id") or (f"task:{e.get('task_id')}" if kind == "task" else None)
            if not key:
                if phase in ("completed", "failed") and _number((e.get("data") or {}).get("duration_ms")) is not None:
                    key = f"anon:{e.get('seq')}"  # a completed call reported on its own, with its duration
                else:
                    continue
            op = ops.setdefault(key, {"id": key, "kind": kind, "agent_id": e.get("agent_id"), "task_id": e.get("task_id"),
                                      "start": None, "end": None, "status": "open", "data": {}})
            op["data"].update(e.get("data") or {})
            if phase == "started" or (kind == "task" and phase in ("accepted", "assigned") and not op["start"]):
                op["start"] = op["start"] or e
            elif phase in ("completed", "failed", "cancelled", "approved", "rejected"):
                op["end"] = e
                op["status"] = "failed" if phase in ("failed", "rejected", "cancelled") else "completed"
                op["agent_id"] = op["agent_id"] or e.get("agent_id")
        for op in ops.values():
            measured = _number(op["data"].get("duration_ms"))
            if measured is None and op["start"] and op["end"] and _time(op["start"]) and _time(op["end"]):
                measured = (_time(op["end"]) - _time(op["start"])).total_seconds() * 1000
            op["duration_ms"] = measured
        return list(ops.values())


# ── per-run questions ─────────────────────────────────────────────────────────────────────────────────────────────
def _stuck(run: _Run):
    findings = []
    latest_progress, waiting_tasks, human, queued, last_seen = {}, {}, {}, {}, {}
    finished = set()
    for e in run.events:
        a, d = e.get("agent_id"), e.get("data") or {}
        if not a:
            continue
        last_seen[a] = e
        if e["type"] == "agent.progress":
            latest_progress[a] = e
            if d.get("state") in ("completed", "failed", "cancelled"):
                finished.add(a)
            else:
                finished.discard(a)
        elif e["type"] == "task.waiting":
            waiting_tasks[(a, e.get("task_id"))] = e
        elif e["type"] in ("task.started", "task.completed", "task.failed", "task.cancelled", "task.progress"):
            waiting_tasks.pop((a, e.get("task_id")), None)
        elif e["type"] == "human.requested":
            human[(a, e.get("task_id"))] = e
        elif e["type"] in ("human.approved", "human.rejected"):
            human.pop((a, e.get("task_id")), None)
        elif e["type"] == "tool.queued":
            queued[(a, d.get("tool"))] = e
        elif e["type"] == "tool.dequeued":
            queued.pop((a, d.get("tool")), None)
        elif e["type"] in ("agent.failed", "agent.removed"):
            finished.add(a)

    def age(event):
        t = _time(event)
        return (run.clock - t).total_seconds() if t else None

    for op in run.operations:
        if op["status"] != "open" or not op["start"] or op["kind"] == "task":
            continue
        d = op["data"]
        what = d.get("tool") or d.get("model") or d.get("title") or op["kind"]
        label = {"llm": "an LLM call", "tool.call": "a tool call", "review": "a review"}.get(op["kind"], op["kind"])
        findings.append({"agent_id": op["agent_id"], "reason": "open_operation", "seconds": age(op["start"]),
                         "answer": f"{run.name(op['agent_id'])} started {label} ({what}) {_fmt_s(age(op['start']))} ago and it has not finished.",
                         "evidence": [_cite(op["start"])]})
    for (a, _task), e in human.items():
        findings.append({"agent_id": a, "reason": "human_approval", "seconds": age(e),
                         "answer": f"{run.name(a)} is waiting for human approval, requested {_fmt_s(age(e))} ago.", "evidence": [_cite(e)]})
    for (a, tool), e in queued.items():
        findings.append({"agent_id": a, "reason": "tool_queue", "seconds": age(e),
                         "answer": f"{run.name(a)} is queued for the tool {tool or '(unnamed)'} for {_fmt_s(age(e))}; all its slots are busy.",
                         "evidence": [_cite(e)]})
    for (a, task), e in waiting_tasks.items():
        reason = (e.get("data") or {}).get("reason")
        findings.append({"agent_id": a, "reason": "task_waiting", "seconds": age(e),
                         "answer": f"{run.name(a)} reported task {task} as waiting{f' for {reason}' if reason else ''} {_fmt_s(age(e))} ago.",
                         "evidence": [_cite(e)]})
    for a, e in latest_progress.items():
        d = e.get("data") or {}
        if d.get("state") in ("waiting", "blocked"):
            needs = ", ".join(map(str, d.get("waiting_for") or [])) or "something it did not name"
            findings.append({"agent_id": a, "reason": f"reported_{d['state']}", "seconds": age(e),
                             "answer": f"{run.name(a)} reported it is {d['state']}: waiting for {needs} ({_short(d.get('summary', ''), 160)}).",
                             "evidence": [_cite(e)]})
    if run.status == "running":
        flagged = {f["agent_id"] for f in findings}
        open_work = {op["agent_id"] for op in run.operations if op["status"] == "open"}
        for a, e in last_seen.items():
            silent = age(e)
            if a in flagged or a in finished or silent is None or silent < IDLE_SECONDS or a not in open_work:
                continue
            findings.append({"agent_id": a, "reason": "silent", "seconds": silent,
                             "answer": f"{run.name(a)} has unfinished work but has reported nothing for {_fmt_s(silent)} (last: {e['type']}).",
                             "evidence": [_cite(e)]})
    findings.sort(key=lambda f: -(f["seconds"] or 0))
    if findings:
        answer = findings[0]["answer"] + (f" {_n(len(findings) - 1, 'more signal')} below." if len(findings) > 1 else "")
    elif run.status != "running":
        answer = f"Nothing is stuck: the run {run.status}."
    else:
        answer = "No agent looks stuck: every started operation finished or is recent, and nobody reported waiting or blocked."
    return {"question": "Why is my agent stuck?", "answer": answer, "findings": findings[:20]}


def _latency(run: _Run):
    per_agent = defaultdict(lambda: {"ms": 0.0, "llm_ms": 0.0, "tool_ms": 0.0, "calls": 0, "slowest": None})
    for op in run.operations:
        if op["kind"] not in ("llm", "tool.call") or op["duration_ms"] is None or not op["end"]:
            continue
        row = per_agent[op["agent_id"]]
        row["ms"] += op["duration_ms"]
        row["llm_ms" if op["kind"] == "llm" else "tool_ms"] += op["duration_ms"]
        row["calls"] += 1
        if row["slowest"] is None or op["duration_ms"] > row["slowest"]["duration_ms"]:
            row["slowest"] = op
    total = sum(r["ms"] for r in per_agent.values())
    if not total:
        tasks = [op for op in run.operations if op["kind"] == "task" and op["duration_ms"]]
        if not tasks:
            return {"question": "Which agent is responsible for most of the latency?", "agents": [],
                    "answer": "No durations were reported. Wrap LLM and tool calls in office.operation('llm', ...) or office.llm(...) so their time is measured."}
        for op in tasks:
            per_agent[op["agent_id"]]["ms"] += op["duration_ms"]
            per_agent[op["agent_id"]]["calls"] += 1
        total = sum(r["ms"] for r in per_agent.values())
    rows = []
    for a, r in sorted(per_agent.items(), key=lambda kv: -kv[1]["ms"]):
        slow = r["slowest"]
        rows.append({"agent_id": a, "name": run.name(a), "seconds": _seconds(r["ms"]), "share": round(r["ms"] / total, 3),
                     "llm_seconds": _seconds(r["llm_ms"]), "tool_seconds": _seconds(r["tool_ms"]), "calls": r["calls"],
                     "slowest": {"kind": slow["kind"], "what": slow["data"].get("tool") or slow["data"].get("model") or slow["data"].get("title"),
                                 "seconds": _seconds(slow["duration_ms"]), "evidence": _cite(slow["end"])} if slow else None})
    top = rows[0]
    mix = "LLM calls" if top["llm_seconds"] >= top["tool_seconds"] else "tool calls"
    answer = (f"{top['name']} accounts for {top['share']:.0%} of measured LLM and tool time "
              f"({_fmt_s(top['seconds'])} of {_fmt_s(_seconds(total))}), mostly {mix}")
    if top["slowest"]:
        answer += f"; its slowest call was {top['slowest']['what'] or top['slowest']['kind']} at {_fmt_s(top['slowest']['seconds'])}"
    return {"question": "Which agent is responsible for most of the latency?", "answer": answer + ".", "agents": rows, "total_seconds": _seconds(total)}


def _loops(run: _Run):
    edges = []
    for e in run.events:
        target = (e.get("data") or {}).get("target_agent_id")
        if e["type"] in INTERACTIONS and e.get("agent_id") and isinstance(target, str) and target != e["agent_id"]:
            edges.append((e["agent_id"], target, e))
    # Exchanges are counted per task: one clarifying question on each of many tickets is normal; many on one is a loop.
    pairs = defaultdict(list)
    for a, b, e in edges:
        pairs[(tuple(sorted((a, b))), e.get("task_id"))].append((a, b, e))
    loops = []
    for ((x, y), task), seq in pairs.items():
        # Count direction changes: A→B then B→A is one exchange back; round trips = changes / 2.
        changes = sum(1 for i in range(1, len(seq)) if seq[i][0] != seq[i - 1][0])
        round_trips = (changes + 1) // 2
        if round_trips >= LOOP_ROUND_TRIPS:
            kinds = Counter(e["type"] for _, _, e in seq)
            first, last = _time(seq[0][2]), _time(seq[-1][2])
            span = (last - first).total_seconds() if first and last else None
            loops.append({"agents": [x, y], "names": [run.name(x), run.name(y)], "task_id": task, "round_trips": round_trips,
                          "messages": len(seq), "kinds": dict(kinds), "seconds": span, "evidence": [_cite(e) for _, _, e in seq[:6]],
                          "answer": f"{run.name(x)} and {run.name(y)} went back and forth {round_trips} times"
                                    + (f" on task {task}" if task else "")
                                    + f" ({len(seq)} {', '.join(sorted({k.split('.')[0] for k in kinds}))} events"
                                    + (f" over {_fmt_s(span)})." if span and span >= 0.1 else ").")})
    # Longer cycles: the same directed hand-off repeated many times (A→B→C→A ...).
    repeated = Counter((a, b) for a, b, _ in edges)
    cycles = []
    for (a, b), n in repeated.items():
        if n >= 2 * LOOP_ROUND_TRIPS and not any(set(l["agents"]) == {a, b} for l in loops):
            cycles.append({"from": a, "to": b, "count": n, "answer": f"{run.name(a)} sent work to {run.name(b)} {n} times."})
    loops.sort(key=lambda l: -l["round_trips"])
    if loops:
        answer = loops[0]["answer"] + " That is a likely loop: check the hand-off condition between them."
    elif cycles:
        answer = cycles[0]["answer"] + " No direct ping-pong, but that hand-off repeats a lot."
    elif edges:
        noun = "hand-off or message" if len(edges) == 1 else "hand-offs and messages"
        answer = f"No loops: {len(edges)} {noun} between agents, none bouncing back and forth {LOOP_ROUND_TRIPS}+ times."
    else:
        answer = "No agent-to-agent messages or hand-offs were reported (they need data.target_agent_id)."
    return {"question": "Are two agents repeatedly calling each other?", "answer": answer, "loops": loops, "repeated_handoffs": cycles[:10]}


def _failure(run: _Run):
    failures = [e for e in run.events if e["type"] in FAILURES]
    retries = [e for e in run.events if e["type"] == "tool.retry"]
    end = run.end
    exit_code = (end.get("data") or {}).get("exit_code") if end else None
    if not failures and run.status != "failed":
        answer = "Nothing failed in this run." if run.status == "completed" else "Nothing has failed so far."
        return {"question": "Why did this workflow fail?", "answer": answer, "failed": False, "root_cause": None, "chain": []}
    if not failures:
        return {"question": "Why did this workflow fail?", "failed": True, "root_cause": None, "chain": [], "exit_code": exit_code,
                "answer": f"The process exited with code {exit_code} but no agent reported a failure, so it most likely crashed outside "
                          "instrumented code. Check the app's own output; wrap the failing step in office.operation(...) to capture the error."}
    root = failures[0]
    d = root.get("data") or {}
    error = d.get("error") or d.get("reason") or d.get("comment")
    what = d.get("tool") or d.get("model") or d.get("title") or root.get("task_id") or ""
    open_at_end = [op for op in run.operations if op["status"] == "open" and op["start"]]
    answer = f"The first failure was {root['type']} by {run.name(root.get('agent_id'))}"
    answer += f" ({what})" if what else ""
    answer += f": {_short(error, 240)}" if error else " (no error message was reported)"
    if len(failures) > 1:
        answer += f". {_n(len(failures) - 1, 'later failure')} followed"
    if retries:
        answer += f", after {len(retries)} retr{'y' if len(retries) == 1 else 'ies'}"
    if run.status == "failed":
        answer += f"; the run then failed" + (f" with exit code {exit_code}" if exit_code is not None else "")
    elif run.status == "completed":
        answer += "; the run still completed"
    return {"question": "Why did this workflow fail?", "answer": answer + ".", "failed": True, "exit_code": exit_code,
            "root_cause": {"type": root["type"], "agent_id": root.get("agent_id"), "name": run.name(root.get("agent_id")),
                           "task_id": root.get("task_id"), "what": what or None, "error": _short(error, 2000) if error else None,
                           "evidence": _cite(root)},
            "chain": [{"type": e["type"], "agent_id": e.get("agent_id"), "name": run.name(e.get("agent_id")),
                       "error": _short((e.get("data") or {}).get("error", ""), 300) or None, "evidence": _cite(e)} for e in failures[1:20]],
            "retries": len(retries),
            "unfinished": [{"kind": op["kind"], "agent_id": op["agent_id"], "what": op["data"].get("tool") or op["data"].get("model"),
                            "evidence": _cite(op["start"])} for op in open_at_end[:10]]}


def _tokens(run: _Run):
    per_agent = defaultdict(lambda: {"input": 0, "output": 0, "cache_read": 0, "calls": 0, "cost_usd": 0.0, "models": Counter()})
    cumulative = {}
    for e in run.events:
        d, a = e.get("data") or {}, e.get("agent_id")
        if e["type"] == "x.usage" and a:  # totals reported by local coding-agent sessions
            cumulative[a] = d
            continue
        if e["type"] not in ("llm.completed", "llm.failed"):
            continue
        i, o = _number(d.get("input_tokens")), _number(d.get("output_tokens"))
        if i is None and o is None:
            continue
        row = per_agent[a]
        row["input"] += i or 0
        row["output"] += o or 0
        row["cache_read"] += _number(d.get("cache_read_tokens")) or 0
        row["cost_usd"] += _number(d.get("cost_usd")) or 0
        row["calls"] += 1
        if d.get("model"):
            row["models"][str(d["model"])] += (i or 0) + (o or 0)
    for a, d in cumulative.items():
        if a not in per_agent:
            per_agent[a].update(input=_number(d.get("input")) or 0, output=_number(d.get("output")) or 0,
                                cache_read=_number(d.get("cache_read")) or 0)
    total = sum(r["input"] + r["output"] for r in per_agent.values())
    if not total:
        return {"question": "Which agent consumed the most tokens?", "agents": [], "total": 0,
                "answer": "No token counts were reported. Report input_tokens and output_tokens on llm.completed (office.llm(...) does this)."}
    rows = sorted(({"agent_id": a, "name": run.name(a), "input": r["input"], "output": r["output"], "total": r["input"] + r["output"],
                    "cache_read": r["cache_read"], "calls": r["calls"], "cost_usd": round(r["cost_usd"], 6) or None,
                    "share": round((r["input"] + r["output"]) / total, 3), "models": dict(r["models"].most_common(5))}
                   for a, r in per_agent.items()), key=lambda r: -r["total"])
    top = rows[0]
    answer = (f"{top['name']} used the most: {_fmt_tokens(top['total'])} tokens ({top['share']:.0%} of {_fmt_tokens(total)}; "
              f"{_fmt_tokens(top['input'])} in, {_fmt_tokens(top['output'])} out")
    answer += f", {_n(top['calls'], 'LLM call')})" if top["calls"] else ")"
    cost = sum(r["cost_usd"] or 0 for r in rows)
    if cost:
        answer += f". Reported cost for the run: ${cost:.4f}"
    return {"question": "Which agent consumed the most tokens?", "answer": answer + ".", "agents": rows, "total": total, "cost_usd": round(cost, 6) or None}


def _llm_calls(run: _Run, limit=500):
    calls = []
    for op in run.operations:
        if op["kind"] != "llm":
            continue
        d = op["data"]
        calls.append({"operation_id": op["id"], "agent_id": op["agent_id"], "name": run.name(op["agent_id"]), "task_id": op["task_id"],
                      "model": d.get("model"), "status": op["status"], "started_at": (op["start"] or op["end"] or {}).get("timestamp"),
                      "seconds": _seconds(op["duration_ms"]) if op["duration_ms"] is not None else None,
                      "input_tokens": _number(d.get("input_tokens")), "output_tokens": _number(d.get("output_tokens")),
                      "cost_usd": _number(d.get("cost_usd")), "error": _short(d["error"], 500) if d.get("error") else None,
                      "prompt": d.get("prompt") if isinstance(d.get("prompt"), str) else None,
                      "response": d.get("response") if isinstance(d.get("response"), str) else None,
                      "seq": (op["end"] or op["start"] or {}).get("seq")})
    calls.sort(key=lambda c: c["seq"] or 0)
    return calls[-limit:]


def _evaluations(run: _Run):
    by_name = defaultdict(list)
    for e in run.events:
        if e["type"] == "eval.recorded":
            by_name[str((e.get("data") or {}).get("name"))].append(e)
    results = []
    for name, events in by_name.items():
        scores = [s for s in (_number((e.get("data") or {}).get("score")) for e in events) if s is not None]
        passed = [p for p in ((e.get("data") or {}).get("passed") for e in events) if isinstance(p, bool)]
        results.append({"name": name, "count": len(events), "mean_score": round(mean(scores), 4) if scores else None,
                        "pass_rate": round(sum(passed) / len(passed), 4) if passed else None,
                        "failed": [{"agent_id": e.get("agent_id"), "reason": _short((e.get("data") or {}).get("reason", ""), 300) or None,
                                    "evidence": _cite(e)} for e in events if (e.get("data") or {}).get("passed") is False][:10]})
    return sorted(results, key=lambda r: r["name"])


def _summary(run: _Run):
    duration = (run.clock - run.started).total_seconds() if run.started else None
    return {"status": run.status, "started_at": run.started.isoformat() if run.started else None,
            "duration_seconds": round(duration, 2) if duration is not None else None, "events": len(run.events),
            "agents": len(run.agents), "version": run.identity.get("version"), "commit": run.identity.get("commit"),
            "app_id": run.identity.get("app_id"), "app_name": run.identity.get("app_name") or run.identity.get("title")}


def analyze_run(events, now=None):
    """Answers for one run, from its stored events (dicts as returned by EventStore.events)."""
    run = _Run(events, now)
    return {"summary": _summary(run), "agents": list(run.agents.values()),
            "stuck": _stuck(run), "latency": _latency(run), "loops": _loops(run), "failure": _failure(run), "tokens": _tokens(run),
            "llm_calls": _llm_calls(run), "evaluations": _evaluations(run)}


# ── per-project questions ─────────────────────────────────────────────────────────────────────────────────────────
def _run_metrics(run: _Run):
    tokens = _tokens(run)
    llm = [op["duration_ms"] for op in run.operations if op["kind"] == "llm" and op["duration_ms"] is not None]
    duration = (run.clock - run.started).total_seconds() if run.started else None
    return {"run_id": run.events[0]["run_id"] if run.events else None, "status": run.status, "version": run.identity.get("version"),
            "commit": run.identity.get("commit"), "started_at": run.started.isoformat() if run.started else None,
            "duration_seconds": duration, "tokens": tokens["total"], "llm_median_seconds": _seconds(median(llm)) if llm else None,
            "failures": sum(1 for e in run.events if e["type"] in FAILURES), "evaluations": _evaluations(run)}


def _aggregate(runs):
    finished = [r for r in runs if r["status"] != "running"]
    durations = [r["duration_seconds"] for r in finished if r["duration_seconds"] is not None]
    tokens = [r["tokens"] for r in runs if r["tokens"]]
    llm = [r["llm_median_seconds"] for r in runs if r["llm_median_seconds"] is not None]
    evals = defaultdict(lambda: {"scores": [], "passed": []})
    for r in runs:
        for ev in r["evaluations"]:
            if ev["mean_score"] is not None:
                evals[ev["name"]]["scores"].append(ev["mean_score"])
            if ev["pass_rate"] is not None:
                evals[ev["name"]]["passed"].append(ev["pass_rate"])
    return {"runs": len(runs), "finished": len(finished),
            "success_rate": round(sum(r["status"] == "completed" for r in finished) / len(finished), 4) if finished else None,
            "median_duration_seconds": round(median(durations), 2) if durations else None,
            "median_tokens": median(tokens) if tokens else None,
            "median_llm_seconds": round(median(llm), 3) if llm else None,
            "evaluations": {name: {"mean_score": round(mean(v["scores"]), 4) if v["scores"] else None,
                                   "pass_rate": round(mean(v["passed"]), 4) if v["passed"] else None} for name, v in evals.items()}}


def _compare(latest, previous):
    """Metric-by-metric change from previous to latest; 'worse' only past the WORSE thresholds."""
    changes = []

    def relative(name, label, a, b, higher_is_worse, threshold):
        if a is None or b is None:
            return
        if b == 0:
            change = 0.0 if a == 0 else 1.0
        else:
            change = (a - b) / abs(b)
        worse = change >= threshold if higher_is_worse else change <= -threshold
        better = change <= -threshold if higher_is_worse else change >= threshold
        changes.append({"metric": name, "label": label, "previous": b, "latest": a, "change": round(change, 4),
                        "verdict": "worse" if worse else "better" if better else "same"})

    if latest["success_rate"] is not None and previous["success_rate"] is not None:
        diff = latest["success_rate"] - previous["success_rate"]
        changes.append({"metric": "success_rate", "label": "Success rate", "previous": previous["success_rate"], "latest": latest["success_rate"],
                        "change": round(diff, 4), "verdict": "worse" if diff <= -WORSE["success_rate"] else "better" if diff >= WORSE["success_rate"] else "same"})
    relative("median_duration_seconds", "Median run duration (s)", latest["median_duration_seconds"], previous["median_duration_seconds"], True, WORSE["duration"])
    relative("median_llm_seconds", "Median LLM call latency (s)", latest["median_llm_seconds"], previous["median_llm_seconds"], True, WORSE["duration"])
    relative("median_tokens", "Median tokens per run", latest["median_tokens"], previous["median_tokens"], True, WORSE["tokens"])
    for name in sorted(set(latest["evaluations"]) & set(previous["evaluations"])):
        a, b = latest["evaluations"][name], previous["evaluations"][name]
        relative(f"eval:{name}:score", f"Evaluation '{name}' score", a["mean_score"], b["mean_score"], False, WORSE["eval_score"])
        if a["pass_rate"] is not None and b["pass_rate"] is not None:
            diff = a["pass_rate"] - b["pass_rate"]
            changes.append({"metric": f"eval:{name}:pass_rate", "label": f"Evaluation '{name}' pass rate", "previous": b["pass_rate"],
                            "latest": a["pass_rate"], "change": round(diff, 4),
                            "verdict": "worse" if diff <= -WORSE["eval_pass_rate"] else "better" if diff >= WORSE["eval_pass_rate"] else "same"})
    return changes


def _describe(change):
    if change["metric"] in ("success_rate",) or change["metric"].endswith(":pass_rate"):
        return f"{change['label']} {change['previous']:.0%} → {change['latest']:.0%}"
    return f"{change['label']} {change['previous']:g} → {change['latest']:g} ({change['change']:+.0%})"


def _versions(metrics):
    ordered = sorted(metrics, key=lambda r: r["started_at"] or "")
    labelled = [r for r in ordered if r["version"] or r["commit"]]
    if len({r["version"] or r["commit"] for r in labelled}) >= 2:
        groups = {}
        for r in labelled:
            groups.setdefault(r["version"] or r["commit"], []).append(r)
        names = list(groups)  # in order of first appearance
        latest_name, previous_name = names[-1], names[-2]
        latest, previous = groups[latest_name], groups[previous_name]
        basis = "version"
    else:
        if len(ordered) < 2:
            return {"question": "Is the latest version performing worse than the previous version?", "basis": None, "changes": [],
                    "answer": "Not enough runs to compare yet. Tag runs with a version (akshauhini.init(..., version='1.2.0') or AKSHAUHINI_APP_VERSION) "
                              "and record quality checks with office.evaluate(...) to compare versions."}
        half = min(5, len(ordered) // 2)
        latest, previous = ordered[-half:], ordered[-2 * half:-half]
        latest_name, previous_name = f"latest {_n(half, 'run')}", f"previous {_n(half, 'run')}"
        basis = "recent_runs"
    a, b = _aggregate(latest), _aggregate(previous)
    changes = _compare(a, b)
    worse = [c for c in changes if c["verdict"] == "worse"]
    better = [c for c in changes if c["verdict"] == "better"]
    subject = f"Version {latest_name} vs {previous_name}" if basis == "version" else f"The {latest_name} vs the {previous_name}"
    if worse:
        answer = f"Yes. {subject}: " + "; ".join(_describe(c) for c in worse)
    elif better:
        answer = f"No, it is better. {subject}: " + "; ".join(_describe(c) for c in better)
    elif changes:
        answer = f"No meaningful change. {subject}: every metric is within the regression thresholds"
    else:
        answer = f"Cannot tell yet: {subject} have no comparable measurements (durations, tokens or evaluations)"
    small = min(a["runs"], b["runs"]) < 3
    if small:
        answer += f". Based on only {a['runs']} and {_n(b['runs'], 'run')}, so treat it as a hint"
    if basis == "recent_runs":
        seen = sorted({r["version"] or r["commit"] for r in labelled})
        if seen:
            answer += f". Every run is {'version' if labelled[0]['version'] else 'commit'} {seen[0]}, so recent runs were compared; a new version= will be compared against it"
        else:
            answer += ". Runs carry no version, so recent runs were compared; pass version= to akshauhini.init() to compare releases"
    if not any(c["metric"].startswith("eval:") for c in changes):
        answer += ". Add office.evaluate(...) checks to compare output quality, not only speed and cost"
    return {"question": "Is the latest version performing worse than the previous version?", "answer": answer + ".", "basis": basis,
            "latest": {"label": latest_name, **a}, "previous": {"label": previous_name, **b}, "changes": changes, "small_sample": small}


def _project_loops(loops):
    """One line per pair of agents across all runs, instead of one per looping task."""
    pairs = {}
    for loop in loops:
        key = " and ".join(sorted(loop["names"]))
        row = pairs.setdefault(key, {"names": sorted(loop["names"]), "tasks": 0, "runs": set(), "round_trips": 0})
        row["tasks"] += 1
        row["runs"].add(loop["run_id"])
        row["round_trips"] = max(row["round_trips"], loop["round_trips"])
    rows = sorted(pairs.items(), key=lambda kv: (-len(kv[1]["runs"]), -kv[1]["tasks"]))
    summary = [{"names": r["names"], "round_trips": r["round_trips"], "runs": len(r["runs"]), "tasks": r["tasks"],
                "answer": f"{key} looped on {_n(r['tasks'], 'task')} in {_n(len(r['runs']), 'run')}, up to {r['round_trips']} round trips each."}
               for key, r in rows]
    answer = (f"Yes. {summary[0]['answer']} Check the hand-off condition between them." if summary
              else "No back-and-forth loops in any run.")
    return {"question": "Are two agents repeatedly calling each other?", "answer": answer, "loops": summary[:20]}


def _norm_error(text):
    return re.sub(r"\d+", "N", _short(str(text), 120))


def analyze_project(runs_events, now=None):
    """Answers across a project's runs. runs_events: iterable of event lists, one per run."""
    runs = [_Run(events, now) for events in runs_events if events]
    runs.sort(key=lambda r: r.started or datetime.min.replace(tzinfo=timezone.utc))
    if not runs:
        return {"runs": [], "answer": "No runs recorded for this project yet."}
    metrics = [_run_metrics(r) for r in runs]
    latency, tokens, causes, example_error = defaultdict(float), defaultdict(int), Counter(), {}
    names = {}
    loops = []
    for r, m in zip(runs, metrics):
        names.update({a: v["name"] for a, v in r.agents.items()})
        for row in _latency(r).get("agents", []):
            latency[row["agent_id"]] += row["seconds"]
        for row in _tokens(r).get("agents", []):
            tokens[row["agent_id"]] += row["total"]
        failure = _failure(r)
        if failure.get("root_cause"):
            rc = failure["root_cause"]
            key = (rc["type"], rc["name"], _norm_error(rc["error"] or ""))  # numbers ignored when grouping, shown as recorded
            causes[key] += 1
            example_error.setdefault(key, _short(rc["error"] or "", 160))
        for loop in _loops(r)["loops"]:
            loops.append({"run_id": m["run_id"], **{k: loop[k] for k in ("names", "round_trips", "answer")}})
    total_latency, total_tokens = sum(latency.values()), sum(tokens.values())
    failed = [m for m in metrics if m["status"] == "failed"]
    common = causes.most_common(10)
    latest = runs[-1]
    stuck_now = [f for r in runs if r.status == "running" for f in _stuck(r)["findings"]]

    def top(table, total):
        if not total:
            return None
        a, v = max(table.items(), key=lambda kv: kv[1])
        return a, v, v / total

    lat, tok = top(latency, total_latency), top(tokens, total_tokens)
    return {
        "runs": metrics,
        "stuck": {"question": "Why is my agent stuck?", "findings": stuck_now[:20],
                  "answer": stuck_now[0]["answer"] if stuck_now else "No running run has a stuck agent."},
        "latency": {"question": "Which agent is responsible for most of the latency?",
                    "agents": [{"agent_id": a, "name": names.get(a, a), "seconds": round(v, 2), "share": round(v / total_latency, 3)}
                               for a, v in sorted(latency.items(), key=lambda kv: -kv[1])] if total_latency else [],
                    "answer": f"Across {_n(len(runs), 'run')}, {names.get(lat[0], lat[0])} accounts for {lat[2]:.0%} of measured LLM and tool time ({_fmt_s(lat[1])})."
                              if lat else "No durations were reported in this project's runs."},
        "loops": _project_loops(loops),
        "failure": {"question": "Why did this workflow fail?", "failed_runs": len(failed),
                    "causes": [{"type": k[0], "agent": k[1], "error": example_error[k], "runs": c} for k, c in common],
                    "answer": (f"{len(failed)} of {_n(len(metrics), 'run')} failed. Most common first failure: {common[0][0][0]} by "
                               f"{common[0][0][1]}" + (f" ({example_error[common[0][0]]})" if example_error[common[0][0]] else "")
                               + f", in {_n(common[0][1], 'run')}.") if causes else
                              (f"{len(failed)} of {_n(len(metrics), 'run')} failed without an agent-level error (crashes outside instrumented code)."
                               if failed else f"None of the {_n(len(metrics), 'run')} failed.")},
        "tokens": {"question": "Which agent consumed the most tokens?", "total": total_tokens,
                   "agents": [{"agent_id": a, "name": names.get(a, a), "total": v, "share": round(v / total_tokens, 3)}
                              for a, v in sorted(tokens.items(), key=lambda kv: -kv[1])] if total_tokens else [],
                   "answer": f"Across {_n(len(runs), 'run')}, {names.get(tok[0], tok[0])} used the most: {_fmt_tokens(tok[1])} tokens ({tok[2]:.0%})."
                             if tok else "No token counts were reported in this project's runs."},
        "versions": _versions(metrics),
        "latest_run": metrics[-1]["run_id"] if latest else None,
    }
