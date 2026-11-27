from datetime import datetime, timezone
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from akshauhini.protocol import Event
from akshauhini.server import create_app
from akshauhini.store import EventStore
from akshauhini.sdk import Office
from akshauhini.otel import convert


def event(id='e1', **kwargs):
    return Event(event_id=id, run_id='run', type='agent.created', agent_id='worker', timestamp=datetime(2026,1,1,tzinfo=timezone.utc), **kwargs)


def test_validation():
    with pytest.raises(ValidationError):
        Event(run_id='r', type='llm.started')
    with pytest.raises(ValidationError):
        Event(run_id='r', type='task.progress', agent_id='a', task_id='t', data={'progress':1.1})
    with pytest.raises(ValidationError):
        Event(run_id='r', type='run.started', timestamp=datetime(2026,1,1))


def test_durable_order_idempotency_and_atomic_conflict(tmp_path):
    path=str(tmp_path/'events.sqlite')
    store=EventStore(path)
    first=event()
    assert store.append([first])[0]['seq']==1
    assert store.append([first])==[]
    with pytest.raises(ValueError):
        store.append([event('new'),event(data={'name':'changed'})])
    assert len(store.events('run'))==1
    store.close()
    reopened=EventStore(path)
    assert reopened.events('run')[0]['event_id']=='e1'
    assert reopened.events('other')==[]
    reopened.close()


def test_http_websocket_catchup_and_validation(tmp_path):
    with TestClient(create_app(str(tmp_path/'test.sqlite'))) as client:
        payload=event().model_dump(mode='json')
        assert client.post('/api/events',json=[payload]).json()['accepted']==1
        assert client.post('/api/events',json=[payload]).json()['duplicates']==1
        assert client.post('/api/events',json=[{**payload,'data':{'name':'conflict'}}]).status_code==409
        assert client.post('/api/events',json=[]).status_code==422
        assert client.get('/api/runs').json()[0]['event_count']==1
        assert client.get('/api/runs').json()[0]['last_event_at']==payload['timestamp']
        with client.websocket_connect('/api/live/run') as ws:
            assert ws.receive_json()['events'][0]['seq']==1
            second=event('e2').model_dump(mode='json')
            client.post('/api/events',json=[second])
            for _ in range(10):
                batch=ws.receive_json()['events']
                if batch:
                    assert batch[0]['event_id']=='e2'
                    break
            else:
                pytest.fail('live event not received')
        with client.websocket_connect('/api/live/run?after=1') as ws:
            assert [e['event_id'] for e in ws.receive_json()['events']]==['e2']
        assert client.get('/api/runs/run/events?after=1').json()[0]['event_id']=='e2'


def test_sdk_failure_and_metrics():
    sent=[]
    def handler(req):
        import json
        sent.extend(json.loads(req.content))
        return httpx.Response(200,json={'accepted':1})
    with Office(strict=True) as office:
        office.client.close()
        office.client=httpx.Client(transport=httpx.MockTransport(handler))
        with pytest.raises(RuntimeError,match='broken'):
            with office.operation('tool.call','a','t',tool='python'):
                raise RuntimeError('broken')
        assert [e['type'] for e in sent]==['tool.call.started','tool.call.failed']
        assert sent[0]['operation_id']==sent[1]['operation_id']
        assert sent[1]['data']['duration_ms']>=0
        assert sent[1]['data']['error']=='broken'


def test_otlp_requires_explicit_semantics_and_preserves_duration():
    def attr(k,v):return {'key':k,'value':{'stringValue':v}}
    span={'traceId':'trace','spanId':'span','name':'Search','startTimeUnixNano':'1000000000','endTimeUnixNano':'1027000000','attributes':[attr('akshauhini.agent.id','r'),attr('akshauhini.operation','tool.call'),attr('tool.name','web_search')]}
    result=convert({'resourceSpans':[{'scopeSpans':[{'spans':[span]}]}]})
    assert [e.type for e in result]==['tool.call.started','tool.call.completed']
    assert result[-1].data['duration_ms']==27
    assert convert({'resourceSpans':[{'scopeSpans':[{'spans':[{**span,'attributes':[]}]}]}]})==[]
