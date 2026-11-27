import json
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from akshauhini.server import create_app
from akshauhini.models import ProgressReport
from akshauhini.protocol import Event
from akshauhini.sdk import Office
from akshauhini.ollama import Ollama

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path/'office.sqlite'))) as client:
        yield client

def connect(client, run='r', agent='a'):
    response=client.post('/api/apps/connect',json={'app_id':'actual-app','name':'Actual App','run_id':run,'agents':[{'agent_id':agent,'name':'Dynamic Agent','role':'reviewer'}]})
    assert response.status_code==200

def test_dynamic_app_registration_and_isolation(client):
    connect(client)
    connect(client,'other','b')
    assert client.get('/api/runs').json()[0]['app_name']=='Actual App'
    events=client.get('/api/runs/r/events').json()
    assert [e['agent_id'] for e in events if e['type']=='agent.created']==['a']
    assert client.post('/api/runs/r/agents/b/questions',json={'question':'Progress?'}).status_code==404
    assert client.get('/api/connection-guide').status_code==200

def test_validated_progress_counts_and_waiting():
    with pytest.raises(ValidationError):
        ProgressReport(state='waiting',summary='waiting')
    with pytest.raises(ValidationError):
        ProgressReport(state='working',summary='work',completed_units=2,total_units=1)
    with pytest.raises(ValidationError):
        ProgressReport(state='completed',summary='done',completed_units=1,total_units=3)
    event=Event(run_id='r',agent_id='a',type='agent.progress',data={'state':'working','summary':'Two done','completed_units':2,'total_units':5,'progress':.99})
    assert event.data['progress']==.4  # Cannot override computed fraction.
    event=Event(run_id='r',agent_id='a',type='agent.progress',data={'state':'blocked','summary':'No access','waiting_for':['Credentials']})
    assert event.data['progress'] is None

def test_question_roundtrip_progress_atomicity_and_idempotency(client):
    connect(client)
    url='/api/runs/r/agents/a/questions'
    q=client.post(url,json={'question':'What is blocking you?'}).json()
    assert q['status']=='pending'
    claimed=client.post(url+'/claim').json()[0]
    assert client.post(url+'/claim').json()==[]
    reply={'delivery_token':claimed['delivery_token'],'answer':'Waiting for access','progress':{'state':'waiting','summary':'Research done; need access','task_id':'t','completed_items':['Research'],'waiting_for':['Credentials'],'next_steps':['Retrieve records'],'completed_units':2,'total_units':5}}
    assert client.post(url+'/'+q['id']+'/answer',json={**reply,'delivery_token':'wrong'}).status_code==409
    response=client.post(url+'/'+q['id']+'/answer',json=reply)
    assert response.status_code==200 and response.json()['status']=='answered'
    assert 'delivery_token' not in response.json()
    assert client.post(url+'/'+q['id']+'/answer',json=reply).status_code==200
    assert client.post(url+'/'+q['id']+'/answer',json={**reply,'answer':'different'}).status_code==409
    events=client.get('/api/runs/r/events').json()
    reports=[e for e in events if e['type']=='agent.progress']
    assert len(reports)==1
    assert reports[0]['data']['progress']==.4
    assert reports[0]['data']['waiting_for']==['Credentials']
    assert client.get(url).json()[0]['answer']=='Waiting for access'

def test_abandoned_question_reclaims_and_invalidates_old_token(client):
    connect(client)
    url='/api/runs/r/agents/a/questions'
    q=client.post(url,json={'question':'Progress?'}).json()
    old=client.post(url+'/claim').json()[0]
    with client.app.state.store.db:
        client.app.state.store.db.execute('UPDATE questions SET lease_until=0 WHERE id=?',(q['id'],))
    new=client.post(url+'/claim').json()[0]
    assert old['delivery_token']!=new['delivery_token']
    assert client.post(url+'/'+q['id']+'/answer',json={'delivery_token':old['delivery_token'],'answer':'Old'}).status_code==409

def test_ollama_is_labeled_and_cannot_change_progress(client,monkeypatch):
    connect(client)
    async def explain(question,snapshot,model):
        assert snapshot['agent_id']=='a'
        return 'Ollama summary: no progress has been reported.',model
    monkeypatch.setattr(client.app.state.ollama,'explain',explain)
    response=client.post('/api/runs/r/agents/a/questions',json={'question':'Progress?','source':'ollama','model':'local-model'})
    assert response.status_code==200
    assert response.json()['source']=='ollama'
    assert response.json()['status']=='answered'
    assert len(client.get('/api/runs/r/events').json())==2
    async def fail(*args):
        raise httpx.ConnectError('not running')
    monkeypatch.setattr(client.app.state.ollama,'explain',fail)
    assert client.post('/api/runs/r/agents/a/questions',json={'question':'Progress?','source':'ollama','model':'local-model'}).status_code==503

def test_ollama_http_uses_only_configured_server(monkeypatch):
    import asyncio
    calls=[]
    def handler(request):
        calls.append(request)
        if request.url.path=='/api/tags':return httpx.Response(200,json={'models':[{'name':'test-local'}]})
        payload=json.loads(request.content)
        assert payload['stream'] is False
        assert payload['model']=='test-local'
        return httpx.Response(200,json={'message':{'content':'Recorded progress only'}})
    original=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    model=Ollama()
    assert asyncio.run(model.models())==['test-local']
    assert asyncio.run(model.explain('Progress?',{'events':[]},'test-local'))[0]=='Recorded progress only'
    assert all(str(r.url).startswith('http://127.0.0.1:11434/') for r in calls)

def test_sdk_register_and_progress_payload():
    sent=[]
    def handler(req):
        sent.append((req.url.path,json.loads(req.content)))
        return httpx.Response(200,json={'run_id':'r'})
    with Office(run_id='r',strict=True) as office:
        office.client.close()
        office.client=httpx.Client(transport=httpx.MockTransport(handler))
        office.connect('my-app','My App',[{'agent_id':'a','name':'A'}])
        office.progress('a',state='working',summary='One complete',completed_units=1,total_units=4)
    assert sent[0][0]=='/api/apps/connect'
    assert sent[1][1][0]['data']['progress']==.25

def test_sdk_track_decorator_preserves_results_and_reports_lifecycle():
    sent=[]
    def handler(req):
        sent.extend(json.loads(req.content))
        return httpx.Response(200,json={'accepted':1})
    with Office(run_id='tracked',strict=True) as office:
        office.client.close()
        office.client=httpx.Client(transport=httpx.MockTransport(handler))
        @office.track('researcher',name='Research Agent',role='researcher',title='Find evidence')
        def research(topic):
            return {'topic':topic,'sources':3}
        assert research('markets')=={'topic':'markets','sources':3}
    assert [e['type'] for e in sent]==[
        'agent.created','task.created','task.accepted','task.started','task.completed'
    ]
    assert sent[0]['data']['name']=='Research Agent'
    assert sent[1]['task_id']==sent[-1]['task_id']
    assert sent[-1]['data']['duration_ms']>=0

def test_sdk_track_decorator_supports_async_agents():
    import asyncio
    sent=[]
    def handler(req):
        sent.extend(json.loads(req.content))
        return httpx.Response(200,json={'accepted':1})
    office=Office(run_id='async-tracked',strict=True)
    office.client.close()
    office.client=httpx.Client(transport=httpx.MockTransport(handler))
    try:
        @office.track('planner')
        async def plan(value):
            return value*2
        assert asyncio.run(plan(4))==8
        assert sent[-1]['type']=='task.completed'
    finally:
        office.close()

def test_sdk_creates_declared_roster_on_connect(client,monkeypatch):
    original=httpx.Client
    def transport(request):
        response=client.request(request.method,request.url.path,json=json.loads(request.content) if request.content else None)
        return httpx.Response(response.status_code,json=response.json())
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(transport),**kwargs))
    with Office(run_id='roster-run',strict=True,app_id='roster-app',app_name='Roster App',
                agents=[{'agent_id':'lead','name':'Lead','role':'manager'},{'agent_id':'worker'}]):
        pass
    created=[e for e in client.get('/api/runs/roster-run/events').json() if e['type']=='agent.created']
    assert [e['agent_id'] for e in created]==['lead','worker']
    assert created[0]['data']['name']=='Lead'
    assert 'name' not in created[1]['data']

def test_sdk_responder_delivers_live_state(client,monkeypatch):
    import time
    connect(client)
    url='/api/runs/r/agents/a/questions'
    question=client.post(url,json={'question':'How much is done?'}).json()
    original=httpx.Client
    def transport(request):
        body=json.loads(request.content) if request.content else None
        response=client.request(request.method,request.url.path,json=body)
        return httpx.Response(response.status_code,json=response.json())
    office=Office(run_id='r')
    monkeypatch.setattr(httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(transport),**kw))
    def answer(question_text):
        assert question_text=='How much is done?'
        return {'answer':'Three files scanned','progress':{'state':'working','summary':'Scanned three files','completed_units':3,'total_units':4,'completed_items':['A','B','C']}}
    try:
        with office.answer_questions({},interval=.1) as responder:
            responder.register('a',answer)
            deadline=time.monotonic()+3
            while time.monotonic()<deadline:
                rows=client.get(url).json()
                if rows[0]['status']=='answered':break
                time.sleep(.02)
            else:pytest.fail('Responder did not answer')
        assert rows[0]['id']==question['id']
        assert rows[0]['progress']['completed_units']==3
        events=client.get('/api/runs/r/events').json()
        assert events[-1]['type']=='agent.progress'
        assert events[-1]['data']['progress']==.75
    finally:
        office.close()


def test_local_llm_token_usage_is_counted_from_each_reply():
    model = Ollama()
    model._count({"message": {"content": "hi"}, "prompt_eval_count": 1200, "eval_count": 80})
    model._count({"message": {"content": "again"}, "prompt_eval_count": 300, "eval_count": 20})
    model._count({"message": {"content": "no counts"}})
    assert model.usage == {"input": 1500, "output": 100, "calls": 3}
