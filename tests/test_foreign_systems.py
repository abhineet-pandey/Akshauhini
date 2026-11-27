"""Behaviour a producer we did not write depends on: standard OTLP encoding, extension events, run identity."""
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from akshauhini.otel import any_value, convert
from akshauhini.protocol import Event
from akshauhini.server import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path / 'foreign.sqlite'))) as client:
        yield client


def test_otlp_json_values_decode_to_python_types():
    # OTLP/JSON encodes int64 as a decimal string; a string here would never count as a token total.
    assert any_value({'intValue': '1234'}) == 1234
    assert any_value({'intValue': 7}) == 7
    assert any_value({'doubleValue': '0.5'}) == 0.5
    assert any_value({'boolValue': True}) is True
    assert any_value({'stringValue': 'x'}) == 'x'
    assert any_value({'arrayValue': {'values': [{'intValue': '1'}, {'stringValue': 'b'}]}}) == [1, 'b']
    assert any_value({'kvlistValue': {'values': [{'key': 'k', 'value': {'intValue': '2'}}]}}) == {'k': 2}
    assert any_value({}) is None and any_value(None) is None


def test_otlp_token_counts_reach_the_event_as_numbers():
    def text(k, v): return {'key': k, 'value': {'stringValue': v}}
    def number(k, v): return {'key': k, 'value': {'intValue': v}}
    span = {'traceId': 't', 'spanId': 's', 'name': 'chat', 'startTimeUnixNano': '1000000000', 'endTimeUnixNano': '2000000000',
            'attributes': [text('akshauhini.agent.id', 'writer'), text('akshauhini.operation', 'llm'),
                           number('gen_ai.usage.input_tokens', '1200'), number('gen_ai.usage.output_tokens', '80')]}
    started, completed = convert({'resourceSpans': [{'scopeSpans': [{'spans': [span]}]}]})
    assert completed.data['input_tokens'] == 1200 and isinstance(completed.data['input_tokens'], int)
    assert completed.data['output_tokens'] == 80


def test_extension_events_are_accepted_but_unknown_core_types_are_not(client):
    ok = Event(run_id='r', type='x.langgraph.node_entered', agent_id='planner', data={'node': 'plan'})
    assert ok.type == 'x.langgraph.node_entered'
    response = client.post('/api/events', json=[ok.model_dump(mode='json')])
    assert response.status_code == 200 and response.json()['accepted'] == 1
    assert client.get('/api/runs/r/events').json()[0]['type'] == 'x.langgraph.node_entered'
    for bad in ('agent.thinking', 'x.', 'x. spaced', 'X.upper-prefix', 'x.' + 'a' * 101):
        with pytest.raises(ValidationError):
            Event(run_id='r', type=bad, agent_id='a')
    with pytest.raises(ValidationError):
        Event(run_id='r', type='x.needs_an_agent')


def test_run_identity_survives_a_later_run_started_and_is_not_erased(client):
    run = 'identity-run'
    # A CLI wrapper announces the command, the app registers itself, then the app announces the run once more.
    client.post('/api/events', json=[{'run_id': run, 'type': 'run.started', 'event_id': 'cli', 'data': {'title': 'python app.py'}}])
    client.post('/api/apps/connect', json={'app_id': 'support-swarm', 'name': 'Support Swarm', 'run_id': run, 'agents': []})
    client.post('/api/events', json=[{'run_id': run, 'type': 'run.started', 'event_id': 'again', 'data': {'title': 'Ticket burst'}}])
    client.post('/api/events', json=[{'run_id': run, 'type': 'run.started', 'event_id': 'bare', 'data': {'data': {'nested': 'by mistake'}}}])
    listed = {r['run_id']: r for r in client.get('/api/runs').json()}[run]
    assert listed['app_id'] == 'support-swarm'
    assert listed['app_name'] == 'Support Swarm'   # app_name outranks a title, and later events never erase it


def test_committed_schema_describes_the_current_protocol():
    committed = json.loads((Path(__file__).parent.parent / 'docs' / 'aoep.schema.json').read_text())
    assert committed == Event.model_json_schema()
