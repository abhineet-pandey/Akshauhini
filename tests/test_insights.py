"""Operational answers: each question is checked against a run that exhibits (or does not exhibit) the problem."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from akshauhini import cli
from akshauhini.insights import analyze_project, analyze_run
from akshauhini.protocol import Event
from akshauhini.sdk import Office
from akshauhini.server import create_app

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


class Script:
    """Builds a run's stored events: e(seconds, type, agent, **fields)."""

    def __init__(self, run="r1"):
        self.run, self.events = run, []

    def e(self, at, type, agent=None, task=None, op=None, **data):
        self.events.append({"seq": len(self.events) + 1, "event_id": f"{self.run}-{len(self.events)}", "run_id": self.run, "type": type,
                            "timestamp": (T0 + timedelta(seconds=at)).isoformat(), "agent_id": agent, "task_id": task,
                            "operation_id": op, "data": data})
        return self


def team(run="r1", version=None):
    s = Script(run).e(0, "run.started", app_id="bot", app_name="Bot", **({"version": version} if version else {}))
    s.e(0, "agent.created", "lead", name="Lead", role="manager").e(0, "agent.created", "res", name="Researcher").e(0, "agent.created", "wri", name="Writer")
    return s


def test_stuck_names_the_open_llm_call_and_the_blocked_agent():
    s = team().e(1, "llm.started", "res", op="c1", model="gpt-x")
    s.e(2, "agent.progress", "wri", state="blocked", summary="Need sources", waiting_for=["Researcher's sources"])
    out = analyze_run(s.events, now=T0 + timedelta(seconds=301))
    assert "Researcher started an LLM call (gpt-x) 5.0 min ago" in out["stuck"]["answer"]
    reasons = {f["reason"] for f in out["stuck"]["findings"]}
    assert reasons == {"open_operation", "reported_blocked"}
    assert out["stuck"]["findings"][0]["evidence"][0]["seq"] == 5


def test_nothing_is_stuck_in_a_finished_run():
    s = team().e(1, "llm.started", "res", op="c1").e(3, "llm.completed", "res", op="c1", duration_ms=2000).e(4, "run.completed")
    assert analyze_run(s.events)["stuck"]["answer"] == "Nothing is stuck: the run completed."


def test_latency_is_attributed_to_the_agent_with_the_most_measured_time():
    s = team()
    s.e(1, "llm.started", "res", op="a").e(9, "llm.completed", "res", op="a", model="big", duration_ms=8000)
    s.e(9, "tool.call.started", "wri", op="b", tool="search").e(11, "tool.call.completed", "wri", op="b", tool="search", duration_ms=2000)
    out = analyze_run(s.events)["latency"]
    assert out["agents"][0]["name"] == "Researcher" and out["agents"][0]["share"] == 0.8
    assert "Researcher accounts for 80%" in out["answer"] and "big" in out["answer"]


def test_latency_says_what_to_report_when_nothing_was_measured():
    assert "No durations were reported" in analyze_run(team().events)["latency"]["answer"]


def test_ping_pong_between_two_agents_is_a_loop_and_one_way_handoffs_are_not():
    s = team()
    for i in range(4):
        s.e(i * 2, "message.sent", "lead", target_agent_id="res").e(i * 2 + 1, "message.sent", "res", target_agent_id="lead")
    s.e(10, "handoff.started", "res", "t", target_agent_id="wri")
    out = analyze_run(s.events)["loops"]
    assert out["loops"][0]["names"] == ["Lead", "Researcher"] and out["loops"][0]["round_trips"] == 4
    assert "likely loop" in out["answer"]
    calm = team().e(1, "task.assigned", "lead", "t", target_agent_id="res").e(2, "handoff.started", "res", "t", target_agent_id="wri")
    assert analyze_run(calm.events)["loops"]["answer"].startswith("No loops")


def test_failure_finds_the_first_error_and_what_followed():
    s = team().e(1, "tool.retry", "res", tool="search")
    s.e(2, "tool.call.failed", "res", op="x", tool="search", error="HTTP 429 rate limited")
    s.e(3, "task.failed", "wri", "t", error="no sources").e(4, "run.failed", exit_code=1)
    out = analyze_run(s.events)["failure"]
    assert out["root_cause"]["name"] == "Researcher" and out["root_cause"]["error"] == "HTTP 429 rate limited"
    assert out["answer"].startswith("The first failure was tool.call.failed by Researcher (search): HTTP 429")
    assert "1 later failure followed, after 1 retry; the run then failed with exit code 1" in out["answer"]
    assert out["chain"][0]["name"] == "Writer"


def test_a_crash_without_agent_errors_is_explained():
    out = analyze_run(team().e(1, "run.failed", exit_code=3).events)["failure"]
    assert "exited with code 3" in out["answer"] and "outside instrumented code" in out["answer"]


def test_tokens_rank_agents_and_include_cost():
    s = team()
    s.e(1, "llm.completed", "res", op="a", input_tokens=9000, output_tokens=1000, model="m1", cost_usd=0.02)
    s.e(2, "llm.completed", "wri", op="b", input_tokens=1500, output_tokens=500, model="m2", cost_usd=0.01)
    out = analyze_run(s.events)["tokens"]
    assert [a["name"] for a in out["agents"]] == ["Researcher", "Writer"] and out["agents"][0]["share"] == 0.833
    assert out["answer"].startswith("Researcher used the most: 10.0k tokens (83% of 12.0k")
    assert "$0.0300" in out["answer"]


def test_llm_trace_and_evaluations():
    s = team().e(1, "llm.started", "res", op="a", model="m", prompt="What is X?")
    s.e(2, "llm.completed", "res", op="a", model="m", response="X is Y", input_tokens=5, output_tokens=3, duration_ms=1000)
    s.e(3, "eval.recorded", "wri", name="correct", passed=False, reason="Missing citation")
    s.e(4, "eval.recorded", None, name="correct", passed=True, score=1)
    out = analyze_run(s.events)
    call = out["llm_calls"][0]
    assert (call["prompt"], call["response"], call["seconds"], call["status"]) == ("What is X?", "X is Y", 1.0, "completed")
    ev = out["evaluations"][0]
    assert (ev["name"], ev["count"], ev["pass_rate"], ev["failed"][0]["reason"]) == ("correct", 2, 0.5, "Missing citation")


def run_with(version, run, seconds, passed, failed=False):
    s = team(run, version)
    s.e(1, "llm.completed", "res", op="a", duration_ms=seconds * 1000, input_tokens=100, output_tokens=10)
    s.e(2, "eval.recorded", "wri", name="correct", passed=passed)
    return s.e(seconds, "run.failed" if failed else "run.completed").events


def test_a_newer_version_that_fails_its_evaluations_is_called_worse():
    runs = [run_with("1.0", f"a{i}", 10, True) for i in range(3)] + [run_with("1.1", f"b{i}", 10, i == 0) for i in range(3)]
    for i, events in enumerate(runs):  # versions in order of time
        for e in events:
            e["timestamp"] = (datetime.fromisoformat(e["timestamp"]) + timedelta(hours=i)).isoformat()
    out = analyze_project(runs)["versions"]
    assert out["basis"] == "version" and out["latest"]["label"] == "1.1" and out["previous"]["label"] == "1.0"
    assert out["answer"].startswith("Yes. Version 1.1 vs 1.0: Evaluation 'correct' pass rate 100% → 33%")


def test_without_versions_recent_runs_are_compared_and_the_gap_is_explained():
    runs = [run_with(None, f"r{i}", 10 if i < 2 else 30, True) for i in range(4)]
    for i, events in enumerate(runs):
        for e in events:
            e["timestamp"] = (datetime.fromisoformat(e["timestamp"]) + timedelta(hours=i)).isoformat()
    out = analyze_project(runs)["versions"]
    assert out["basis"] == "recent_runs" and "Median run duration (s) 10 → 30 (+200%)" in out["answer"]
    assert "pass version= to akshauhini.init()" in out["answer"]


def test_project_answers_aggregate_across_runs():
    runs = [run_with("1.0", "a", 10, True), run_with("1.0", "b", 10, True, failed=True)]
    out = analyze_project(runs)
    assert "1 of 2 runs failed" in out["failure"]["answer"]
    assert "Researcher used the most" in out["tokens"]["answer"]


def test_eval_events_are_validated():
    Event(run_id="r", type="eval.recorded", data={"name": "ok", "passed": True})
    for bad in ({"passed": True}, {"name": "x"}, {"name": "x", "score": "high"}, {"name": "x", "passed": "yes"}):
        with pytest.raises(ValidationError):
            Event(run_id="r", type="eval.recorded", data=bad)


def test_sdk_traces_llm_calls_without_content_unless_enabled_and_records_evaluations(tmp_path):
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        office = Office("http://testserver", "sdk-run")
        office.client = client
        with office.llm("res", "m", prompt="secret prompt") as call:
            call.update(response="secret answer", input_tokens=7, output_tokens=2)
        with pytest.raises(ValueError):
            with office.llm("res", "m", prompt="p", capture=True) as call:
                raise ValueError("model overloaded")
        office.evaluate("relevance", score=0.6, threshold=0.7, agent_id="res", expected="x" * 5000)
        events = client.get("/api/runs/sdk-run/events").json()
        first = [e for e in events if e["type"] in ("llm.started", "llm.completed")][:2]
        assert all("prompt" not in e["data"] and "response" not in e["data"] for e in first)
        assert first[1]["data"]["input_tokens"] == 7 and first[1]["data"]["duration_ms"] >= 0
        failed = next(e for e in events if e["type"] == "llm.failed")
        assert failed["data"]["error"] == "model overloaded"
        assert next(e for e in events if e["type"] == "llm.started" and e["data"].get("prompt"))["data"]["prompt"] == "p"
        ev = next(e for e in events if e["type"] == "eval.recorded")["data"]
        assert ev["passed"] is False and ev["expected"].endswith("[1000 more characters]")
        insights = client.get("/api/insights/runs/sdk-run").json()
        assert insights["evaluations"][0]["pass_rate"] == 0 and len(insights["llm_calls"]) == 2


def test_an_app_run_records_how_it_ended(tmp_path):
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        def office(run):
            o = Office.__new__(Office)
            Office.__init__(o, "http://testserver", run)
            o.client, o._owns_run = client, True
            o.close = lambda: None  # the test client is shared; leaving a block must not close it
            return o
        with office("ok") as o:
            o.agent("a", "A")
        with pytest.raises(RuntimeError):
            with office("boom") as o:
                raise RuntimeError("database locked")
        o = office("twice")
        o.finish("failed", error="first")
        o.finish("completed")
        types = lambda run: [e["type"] for e in client.get(f"/api/runs/{run}/events").json() if e["type"].startswith("run.")]
        assert types("ok") == ["run.completed"] and types("twice") == ["run.failed"]
        failed = client.get("/api/runs/boom/events").json()[-1]
        assert failed["type"] == "run.failed" and failed["data"]["error"] == "RuntimeError: database locked"
        assert analyze_run(client.get("/api/runs/boom/events").json())["summary"]["status"] == "failed"
        # An Office that did not register an app (e.g. inside `akshauhini run`) leaves ending the run to its owner.
        child = Office("http://testserver", "child")
        child.client, child.close = client, lambda: None
        with child:
            child.agent("a", "A")
        assert types("child") == []


def test_insights_api_for_runs_and_projects(tmp_path):
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        for i, version in enumerate(("1.0", "1.1")):
            run = f"run-{i}"
            client.post("/api/apps/connect", json={"app_id": "bot", "name": "Bot", "run_id": run, "version": version,
                                                   "agents": [{"agent_id": "res", "name": "Researcher"}]})
            client.post("/api/events", json=[{"run_id": run, "agent_id": "res", "type": "llm.completed", "operation_id": "c",
                                              "data": {"duration_ms": 1000 * (i + 1), "input_tokens": 10, "output_tokens": 5}}])
        assert client.get("/api/runs").json()[0]["version"] == "1.1"
        run = client.get("/api/insights/runs/run-1").json()
        assert run["summary"]["version"] == "1.1" and "Researcher" in run["latency"]["answer"]
        project = client.get("/api/insights/project", params={"app_id": "bot"}).json()
        assert len(project["runs"]) == 2 and project["versions"]["basis"] == "version"
        assert client.get("/api/insights/runs/nope").status_code == 404
        assert client.get("/api/insights/project").status_code == 422


def test_cli_prints_the_answers(tmp_path, capsys):
    from akshauhini.store import EventStore
    db = str(tmp_path / "o.sqlite")
    store = EventStore(db)
    store.append([Event(**{k: v for k, v in e.items() if k != "seq"}) for e in run_with("1.0", "cli-run", 5, True)])
    store.close()
    assert cli.main(["insights", "--db", db, "--app", "bot"]) == 0
    out = capsys.readouterr().out
    assert "Run cli-run · Bot · version 1.0 · completed" in out
    assert "Which agent consumed the most tokens?\n  Researcher used the most" in out
    assert "Is the latest version performing worse" in out


def test_runs_that_all_share_one_version_say_so():
    runs = [run_with("2.0", f"s{i}", 10, True) for i in range(2)]
    out = analyze_project(runs)["versions"]
    assert out["basis"] == "recent_runs" and "Every run is version 2.0" in out["answer"] and "carry no version" not in out["answer"]


def test_wording_uses_correct_plurals_and_milliseconds():
    s = team().e(1, "tool.call.completed", "res", op="x", tool="read", duration_ms=12)
    s.e(2, "handoff.started", "res", "t", target_agent_id="wri")
    out = analyze_run(s.events)
    assert "its slowest call was read at 12 ms" in out["latency"]["answer"]
    assert out["loops"]["answer"].startswith("No loops: 1 hand-off or message between agents")
    s.e(3, "llm.completed", "res", op="y", input_tokens=10, output_tokens=5)
    assert "1 LLM call)" in analyze_run(s.events)["tokens"]["answer"]
