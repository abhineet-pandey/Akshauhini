import json
import httpx
from fastapi.testclient import TestClient
from akshauhini.server import create_app
from akshauhini.sdk import Office
from akshauhini.local_agents import _sync_once


def test_loaded_models_are_mirrored_as_idle_agents_and_removed_once_unloaded(tmp_path, monkeypatch):
    with TestClient(create_app(str(tmp_path / 'scan.sqlite'))) as client:
        original = httpx.Client

        def transport(request):
            body = json.loads(request.content) if request.content else None
            response = client.request(request.method, request.url.path, json=body)
            return httpx.Response(response.status_code, json=response.json())

        monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(transport), **kwargs))
        office = Office(run_id='scan-run', strict=True, app_id='local-ollama', app_name='Local LLM')

        monkeypatch.setattr(httpx, 'get', lambda url, timeout=3: httpx.Response(200, json={'models': [{'name': 'llama3:8b'}]}, request=httpx.Request('GET', url)))
        known = _sync_once(office, 'http://127.0.0.1:11434', set())
        assert known == {'llama3:8b'}
        created = [e for e in client.get('/api/runs/scan-run/events').json() if e['type'] == 'agent.created']
        assert created[0]['agent_id'] == 'ollama-llama3-8b'
        assert created[0]['data']['department'] == 'Local LLM'

        monkeypatch.setattr(httpx, 'get', lambda url, timeout=3: httpx.Response(200, json={'models': []}, request=httpx.Request('GET', url)))
        known = _sync_once(office, 'http://127.0.0.1:11434', known)
        assert known == set()
        removed = [e for e in client.get('/api/runs/scan-run/events').json() if e['type'] == 'agent.removed']
        assert removed[0]['agent_id'] == 'ollama-llama3-8b'


def test_an_unreachable_ollama_reports_no_models_instead_of_raising(monkeypatch):
    def raise_connect_error(url, timeout=3):
        raise httpx.ConnectError('refused')
    monkeypatch.setattr(httpx, 'get', raise_connect_error)

    calls = []
    class FakeOffice:
        def agent(self, *a, **k): calls.append(('agent', a, k))
        def emit(self, *a, **k): calls.append(('emit', a, k))

    known = _sync_once(FakeOffice(), 'http://127.0.0.1:11434', {'llama3:8b'})
    assert known == set()
    assert calls == [('emit', ('agent.removed', 'ollama-llama3-8b'), {})]
