import importlib.util
import json
import sys
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import httpx
from fastapi.testclient import TestClient
from akshauhini.server import create_app
from akshauhini.resources import Resource

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'sample_projects'/'request_studio'))
from studio.workflow import WorkSession, retrieve
from studio.embeddings import retrieve_embeddings

def test_real_fifo_resource_reports_queue_and_releases_on_error():
    class Office:
        def __init__(self):self.events=[]
        def emit(self,type,agent,task=None,**data):self.events.append((type,data))
        def operation(self,*args,**kwargs):
            from contextlib import nullcontext
            return nullcontext({})
    office=Office();resource=Resource(office,'terminal',1);entered=threading.Event();release=threading.Event();second=threading.Event()
    def first():
        with resource.use('a'):entered.set();assert release.wait(3)
    def next():
        with resource.use('b'):second.set()
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1=pool.submit(first);assert entered.wait(2)
        f2=pool.submit(next)
        # Snapshot synchronization rather than fabricated tool durations.
        import time
        deadline=time.monotonic()+2
        while not any(e[0]=='tool.queued' for e in office.events) and time.monotonic()<deadline:time.sleep(.01)
        assert not second.is_set()
        assert any(e[0]=='tool.queued' and e[1]['waiting_agents']==['b'] for e in office.events)
        release.set();f1.result();f2.result()
    assert resource.active=={} and resource.waiting==[]

def test_demo_real_outputs_and_manager_callback(tmp_path,monkeypatch):
    original=httpx.Client
    with TestClient(create_app(str(tmp_path/'monitor.sqlite'))) as collector:
        def transport(request):
            response=collector.request(request.method,request.url.path,json=json.loads(request.content) if request.content else None)
            return httpx.Response(response.status_code,json=response.json())
        monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(transport),**kwargs))
        session=WorkSession('Compare offline editing support',['offline editing','unknown pricing'],{'atlas':'Atlas supports offline editing.\nAtlas exports CSV.','beacon':'Beacon requires internet editing.'},'http://collector',output_dir=tmp_path/'outputs')
        try:
            session.run();result=session.public()
            assert result['status']=='completed',result['error']
            assert '[atlas:L1] Atlas supports offline editing.' in result['report']
            assert 'MISSING EVIDENCE' in result['report']
            assert (tmp_path/'outputs'/session.id/'report.md').read_text(encoding='utf-8')==result['report']
            assert session.handler('manager')({'question':'What sources support offline editing?'})['route_to']=='researcher'
            answer=session.handler('researcher')({'question':'Offline editing?'})
            assert answer['findings'][0]['source_id']=='atlas:L1'
            events=collector.get(f'/api/runs/{session.id}/events').json()
            final=[e for e in events if e['type']=='artifact.created' and e['data'].get('artifact_id')=='report'][0]
            assert final['data']['content']==result['report']
            assert final['data']['parent_ids']==['comparison']
            assert events[-1]['type']=='run.completed'
        finally:session.close()

def test_ollama_embeddings_keep_exact_source_ids(monkeypatch):
    original=httpx.Client
    def transport(request):
        payload=json.loads(request.content)
        assert request.url.path=='/api/embed' and payload['model']=='embed-test'
        assert payload['truncate'] is False
        return httpx.Response(200,json={'embeddings':[[1,0],[1,0],[0,1]]})
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(transport),**kwargs))
    results=retrieve_embeddings({'doc':'Relevant source.\nUnrelated source.'},'query','embed-test','http://ollama')
    assert results==[{'source_id':'doc:L1','title':'doc','excerpt':'Relevant source.'}]


def test_demo_missing_collector_gives_recovery_command(tmp_path, monkeypatch):
    from studio import app as studio_app
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError('[Errno 61] Connection refused')
    monkeypatch.setattr(studio_app, 'WorkSession', unavailable)
    with TestClient(studio_app.create_app('http://127.0.0.1:9876', tmp_path)) as client:
        response = client.post('/api/requests', json={'request': 'Compare offline support'})
    assert response.status_code == 503
    assert 'http://127.0.0.1:9876' in response.json()['detail']
    assert '.venv/bin/akshauhini --port 9876 serve' in response.json()['detail']
    assert 'retry' in response.json()['detail']
