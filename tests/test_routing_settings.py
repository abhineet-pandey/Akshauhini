import httpx
import pytest
from fastapi.testclient import TestClient
from akshauhini.server import create_app

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path/'routing.sqlite'))) as c:
        c.post('/api/apps/connect',json={'app_id':'routed-app','name':'Routed','run_id':'r','agents':[{'agent_id':'manager','name':'Manager','role':'manager'},{'agent_id':'researcher','name':'Researcher'}]})
        yield c

def test_manager_routing_findings_and_loop_protection(client):
    root='/api/runs/r/agents/manager/questions';worker='/api/runs/r/agents/researcher/questions'
    q=client.post(root,json={'question':'Which evidence supports this?'}).json()
    claim=client.post(root+'/claim').json()[0]
    routed=client.post(root+'/'+q['id']+'/route',json={'delivery_token':claim['delivery_token'],'target_agent_id':'researcher','reason':'Owns the source findings'})
    assert routed.status_code==200
    assert routed.json()['route']==['manager','researcher']
    claim=client.post(worker+'/claim').json()[0]
    cycle=client.post(worker+'/'+q['id']+'/route',json={'delivery_token':claim['delivery_token'],'target_agent_id':'manager','reason':'Back to manager'})
    assert cycle.status_code==409
    finding={'source_id':'notes:L2','title':'Notes','excerpt':'Offline editing is supported.'}
    reply=client.post(worker+'/'+q['id']+'/answer',json={'delivery_token':claim['delivery_token'],'answer':'Source notes:L2 supports offline editing.','findings':[finding]})
    assert reply.status_code==200
    history=client.get(root).json()[0]
    assert history['answered_by']=='researcher' and history['findings']==[finding]
    types=[e['type'] for e in client.get('/api/runs/r/events').json()]
    assert 'question.routed' in types and 'question.answered' in types
    second=client.post(root,json={'question':'Can you clarify?'}).json()
    context=client.post(root+'/claim').json()[0]
    assert context['id']==second['id'] and context['history'][0]['id']==q['id']

def test_cancel_and_renew_prevent_late_progress(client):
    url='/api/runs/r/agents/manager/questions'
    q=client.post(url,json={'question':'Progress?'}).json();claim=client.post(url+'/claim').json()[0]
    delivery={'delivery_token':claim['delivery_token']}
    assert client.post(url+'/'+q['id']+'/renew',json=delivery).json()['renewed']
    assert client.post(url+'/'+q['id']+'/cancel').json()['status']=='cancelled'
    assert client.post(url+'/'+q['id']+'/answer',json={**delivery,'answer':'late','progress':{'state':'completed','summary':'done'}}).status_code==409
    assert client.post(url+'/claim').json()==[]
    assert not any(e['type']=='agent.progress' for e in client.get('/api/runs/r/events').json())

def test_model_settings_validation_persistence_and_disable(tmp_path,monkeypatch):
    path=str(tmp_path/'settings.sqlite')
    with TestClient(create_app(path)) as c:
        async def models():return ['chat-local','embed-local']
        monkeypatch.setattr(c.app.state.ollama,'models',models)
        assert c.put('/api/settings',json={'llm_model':'missing'}).status_code==422
        assert c.put('/api/settings',json={'llm_model':'chat-local','embedding_model':'embed-local'}).status_code==200
        assert c.app.state.ollama.model=='chat-local'
    with TestClient(create_app(path)) as c:
        assert c.get('/api/settings').json()['embedding_model']=='embed-local'
        assert c.app.state.ollama.model=='chat-local'
        assert c.put('/api/settings',json={'llm_model':None,'embedding_model':None}).status_code==200
        assert c.app.state.ollama.model is None
