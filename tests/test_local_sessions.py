import json
import pytest
from fastapi.testclient import TestClient
from akshauhini.local_sessions import LocalAgents, is_cloud_model, is_local_url
from akshauhini.server import create_app


def write_jsonl(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in records) + "\nnot json\n", encoding="utf-8")


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.delenv("CLAUDE_CONFIG_DIR", raising=False)
    monkeypatch.delenv("CODEX_HOME", raising=False)
    usage = {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 7}
    write_jsonl(tmp_path / ".claude/projects/proj-a/s1.jsonl", [
        {"type": "user", "timestamp": "2026-11-01T10:00:00Z", "cwd": "/work/a", "message": {"role": "user", "content": "Fix the login bug"}},
        {"type": "assistant", "timestamp": "2026-11-01T10:00:01Z", "message": {"id": "m1", "model": "claude-opus-5-5", "usage": usage,
            "content": [{"type": "text", "text": "Looking."}]}},
        # Same API response split into another record: usage must not be double counted.
        {"type": "assistant", "timestamp": "2026-11-01T10:00:02Z", "message": {"id": "m1", "model": "claude-opus-5-5", "usage": usage,
            "content": [{"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "/work/a/auth.py"}},
                        {"type": "tool_use", "id": "t2", "name": "Edit", "input": {"file_path": "/work/a/auth.py", "old_string": "a", "new_string": "b"}},
                        {"type": "tool_use", "id": "t3", "name": "Bash", "input": {"command": "pytest -q"}},
                        {"type": "tool_use", "id": "t4", "name": "WebFetch", "input": {"url": "https://docs.example.com/auth", "prompt": "x"}},
                        {"type": "tool_use", "id": "t5", "name": "mcp__github__create_issue", "input": {"title": "t"}}]}},
        {"type": "user", "timestamp": "2026-11-01T10:00:03Z", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "t3", "content": "1 failed", "is_error": True}]}},
        {"type": "ai-title", "aiTitle": "Login bug fix"},
    ])
    write_jsonl(tmp_path / ".codex/sessions/2026/11/02/rollout-2026-11-02T09-00-00-abc.jsonl", [
        {"type": "session_meta", "timestamp": "2026-11-02T09:00:00Z", "payload": {"id": "abc", "cwd": "/work/b", "cli_version": "0.9"}},
        {"type": "turn_context", "timestamp": "2026-11-02T09:00:00Z", "payload": {"cwd": "/work/b", "model": "gpt-5"}},
        {"type": "response_item", "timestamp": "2026-11-02T09:00:01Z", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Add a README"}]}},
        {"type": "response_item", "timestamp": "2026-11-02T09:00:02Z", "payload": {"type": "function_call", "name": "shell", "call_id": "c1", "arguments": json.dumps({"command": ["bash", "-lc", "ls"]})}},
        {"type": "response_item", "timestamp": "2026-11-02T09:00:03Z", "payload": {"type": "custom_tool_call", "name": "apply_patch", "call_id": "c2", "input": "*** Begin Patch\n*** Add File: README.md\n+hi\n*** End Patch"}},
        {"type": "event_msg", "timestamp": "2026-11-02T09:00:04Z", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 50, "output_tokens": 9, "cached_input_tokens": 20}}}},
    ])
    (tmp_path / ".codex/session_index.jsonl").write_text(json.dumps({"id": "abc", "thread_name": "README work"}) + "\n", encoding="utf-8")
    chat = tmp_path / ".gemini/tmp/hash1/chats/session-1.json"
    chat.parent.mkdir(parents=True)
    chat.write_text(json.dumps({"sessionId": "g1", "startTime": "2026-11-03T08:00:00Z", "messages": [
        {"type": "user", "timestamp": "2026-11-03T08:00:00Z", "content": "Summarize repo"},
        {"type": "gemini", "timestamp": "2026-11-03T08:00:05Z", "content": "Done", "model": "gemini-3-pro", "tokens": {"input": 30, "output": 4},
         "toolCalls": [{"name": "read_file", "args": {"absolute_path": "/work/c/main.py"}}, {"name": "google_web_search", "args": {"query": "repo"}}]},
    ]}), encoding="utf-8")
    monkeypatch.setenv("AKSHAUHINI_LOCAL_HOME", str(tmp_path))
    return tmp_path


def test_claude_transcript_shows_files_commands_network_tokens_without_double_counting(home):
    local = LocalAgents(home, ollama_url="http://127.0.0.1:1")
    [summary] = local.sessions("claude-code")
    assert summary["title"] == "Login bug fix" and summary["cwd"] == "/work/a"
    assert summary["tokens"] == {"input": 117, "output": 5, "cache_read": 100, "cache_write": 7}   # input counts cached tokens too
    assert summary["counts"]["tool_calls"] == 5 and summary["counts"]["tool_errors"] == 1 and summary["counts"]["unparsed"] == 1
    detail = local.session("claude-code", "s1").detail()
    assert detail["files_read"] == [{"path": "/work/a/auth.py", "count": 1}]
    assert detail["files_written"] == [{"path": "/work/a/auth.py", "count": 1}]
    assert detail["commands"][0]["command"] == "pytest -q"
    targets = [n["target"] for n in detail["network"]]
    assert "https://docs.example.com/auth" in targets and "MCP server 'github'" in targets


def test_codex_and_gemini_sessions_are_normalized(home):
    local = LocalAgents(home, ollama_url="http://127.0.0.1:1")
    [codex] = local.sessions("codex")
    assert codex["id"] == "abc" and codex["title"] == "README work" and codex["models"] == ["gpt-5"]
    assert codex["tokens"]["input"] == 50 and codex["files_written"] == 1 and codex["commands"] == 1
    [gemini] = local.sessions("gemini-cli")
    assert gemini["id"] == "g1" and gemini["models"] == ["gemini-3-pro"] and gemini["files_read"] == 1 and gemini["network"] == 1


def test_context_names_its_source_files(home):
    text, sources = LocalAgents(home, ollama_url="http://127.0.0.1:1").context()
    assert {s["agent"] for s in sources} == {"claude-code", "codex", "gemini-cli"}
    assert all(s["path"].startswith(str(home)) for s in sources)
    assert "/work/a/auth.py" in text and "README.md" in text


def test_local_agent_endpoints_are_loopback_only(home, tmp_path):
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        listed = client.get("/api/local-agents").json()["agents"]
        assert {a["id"] for a in listed} >= {"claude-code", "codex", "gemini-cli", "ollama"}
        assert client.get("/api/local-agents/claude-code/sessions/s1").json()["title"] == "Login bug fix"
        assert client.get("/api/local-agents/nope/sessions").status_code == 404
        # A DNS-rebinding page reaches 127.0.0.1 but carries its own Host header.
        assert client.get("/api/local-agents", headers={"host": "evil.example:8765"}).status_code == 403


def test_local_agents_can_be_disabled(home, tmp_path, monkeypatch):
    monkeypatch.setenv("AKSHAUHINI_LOCAL_AGENTS", "0")
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        assert client.get("/api/local-agents").status_code == 404
        assert client.get("/api/config").json()["local_agents"] is False


def test_ask_uses_local_model_only_and_returns_what_it_saw(home, tmp_path, monkeypatch):
    seen = {}

    async def fake_chat(self, system, user, model=None, timeout=120):
        seen["user"] = user
        return "It edited auth.py.", model

    monkeypatch.setattr("akshauhini.ollama.Ollama.chat", fake_chat)
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        cloud = client.post("/api/local-agents/ask", json={"question": "what changed?", "model": "gpt-oss:120b-cloud"})
        assert cloud.status_code == 422 and "cloud" in cloud.text
        reply = client.post("/api/local-agents/ask", json={"question": "what changed?", "agent": "claude-code", "session": "s1", "model": "llama3:8b"}).json()
        assert reply["answer"] == "It edited auth.py." and reply["model"] == "llama3:8b"
        assert reply["sources"][0]["session"] == "s1" and reply["context"] in seen["user"]
        monkeypatch.setenv("AKSHAUHINI_OLLAMA_URL", "http://10.0.0.5:11434")
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        assert client.post("/api/local-agents/ask", json={"question": "q", "model": "llama3:8b"}).status_code == 422


def test_url_and_model_classification():
    assert is_local_url("http://127.0.0.1:11434") and is_local_url("http://localhost:1") and not is_local_url("https://ollama.com")
    assert is_cloud_model("gpt-oss:120b-cloud") and is_cloud_model("qwen3-coder:480b-cloud") and not is_cloud_model("llama3:8b")


def test_office_events_draw_each_session_as_an_agent_with_real_stations(home, tmp_path):
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        events = client.get("/api/local-agents/office").json()
        again = client.get("/api/local-agents/office").json()
        assert client.get("/api/local-agents/office", headers={"host": "evil.example:8765"}).status_code == 403
    # Stable ids: polling again yields the same events, so the office only animates new transcript entries.
    assert [e["event_id"] for e in events] == [e["event_id"] for e in again]
    assert len({e["event_id"] for e in events}) == len(events)
    created = {e["agent_id"]: e["data"] for e in events if e["type"] == "agent.created"}
    assert {d["department"] for d in created.values()} == {"Claude Code", "Codex CLI", "Gemini CLI"}
    claude = created["claude-code:s1"]
    assert claude["role"] == "a" and claude["title"] == "Login bug fix" and claude["path"].startswith(str(home))
    stations = {e["data"]["tool"]: e["data"]["station"] for e in events
                if e["type"] == "tool.call.started" and e["agent_id"] == "claude-code:s1"}
    assert stations == {"Read": "archive", "Edit": "engineering", "Bash": "engineering",
                        "WebFetch": "research", "mcp__github__create_issue": "compute"}
    tasks = [e["data"]["title"] for e in events if e["type"] == "task.started"]
    assert "Fix the login bug" in tasks and "Add a README" in tasks
    assert any(e["type"] == "x.tool.error" for e in events)   # failures are visible but don't freeze a character
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))


def test_session_question_context_covers_every_request_not_only_the_latest(home):
    local = LocalAgents(home, ollama_url="http://127.0.0.1:1")
    text, _ = local.context("claude-code", "s1")
    history = text[text.index("Work history"):]
    assert "REQUEST: Fix the login bug" in history
    assert "Read" in history and "Bash" in history and "1 failed" in history
    assert "LAST REPLY: Looking." in history


def test_quiet_sessions_finish_their_request_and_rest_in_the_lobby(home, tmp_path):
    import os, time as _time
    old = _time.time() - 3600
    for f in home.rglob("*.json*"):
        os.utime(f, (old, old))
    with TestClient(create_app(str(tmp_path / "o.sqlite"))) as client:
        events = client.get("/api/local-agents/office").json()
    claude = [e for e in events if e["agent_id"] == "claude-code:s1"]
    assert claude[-1]["type"] == "agent.progress" and claude[-1]["data"]["state"] == "completed"
    assert any(e["type"] == "task.completed" for e in claude)
