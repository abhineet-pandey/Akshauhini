import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
import uvicorn
import httpx
from .workflow import WorkSession, ROOT

class Request(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    request: str=Field(min_length=5,max_length=4000)
    requirements: list[str]=Field(default_factory=list,max_length=30)
    documents: str=Field(default='',max_length=60000)
    model: str|None=Field(default=None,max_length=200)
    use_saved_models: bool = False


def create_app(endpoint=None, output_dir=None):
    sessions={};lock=threading.RLock()
    @asynccontextmanager
    async def lifespan(app):
        app.state.pool=ThreadPoolExecutor(max_workers=3)
        yield
        app.state.pool.shutdown(wait=True,cancel_futures=True)
        for session in sessions.values():session.close()
    app=FastAPI(title='Akshauhini Request Studio — separate demo app',lifespan=lifespan)
    @app.get('/',response_class=HTMLResponse)
    def index():return (Path(__file__).parent/'index.html').read_text(encoding='utf-8')
    @app.get('/api/requests')
    def list_requests():
        with lock:return [session.public() for session in reversed(list(sessions.values()))]
    @app.post('/api/requests',status_code=201)
    def submit(body:Request):
        if any(len(r)>2000 for r in body.requirements):raise HTTPException(422,'Requirements must be at most 2000 characters each')
        docs={'provided-document':body.documents} if body.documents.strip() else {p.name:p.read_text(encoding='utf-8') for p in (Path(__file__).parent/'sources').glob('*.md')}
        with lock:
            if len(sessions)>=20:raise HTTPException(409,'Demo session limit reached. Restart the demo to clear in-memory sessions; saved outputs remain.')
            try:
                collector=endpoint or os.getenv('AKSHAUHINI_ENDPOINT','http://127.0.0.1:8765')
                settings={}
                if body.use_saved_models:
                    with httpx.Client(timeout=5,trust_env=False) as client:
                        response=client.get(collector+'/api/settings');response.raise_for_status();settings=response.json()
                session=WorkSession(body.request,[r for r in body.requirements if r.strip()],docs,collector,body.model or settings.get('llm_model'),output_dir,settings.get('embedding_model'),settings.get('ollama_url'))
            except httpx.ConnectError as exc:
                from urllib.parse import urlsplit
                port = urlsplit(collector).port or 8765
                raise HTTPException(503,
                    f'Cannot connect to Akshauhini at {collector}. '
                    f'Start the collector from the project root in another terminal: '
                    f'.venv/bin/akshauhini --port {port} serve. '
                    'Keep it running, then retry this request. If the collector is on another '
                    'machine, check the demo --collector URL and start it there.') from exc
            except Exception as exc:raise HTTPException(503,f'Cannot initialize the demo using {collector}: {exc}') from exc
            sessions[session.id]=session
            app.state.pool.submit(session.run)
            return session.public()
    @app.get('/api/requests/{run_id}')
    def get_request(run_id:str):
        with lock:session=sessions.get(run_id)
        if not session:raise HTTPException(404,'Unknown demo request')
        return session.public()
    return app


def main():
    import argparse
    parser=argparse.ArgumentParser(description='Request-driven multi-agent demo for Akshauhini')
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--collector',default='http://127.0.0.1:8765')
    parser.add_argument('--output-dir',default=str(ROOT/'outputs'))
    args=parser.parse_args()
    print(f'Request Studio: http://127.0.0.1:{args.port}',flush=True)
    uvicorn.run(create_app(args.collector,args.output_dir),host='127.0.0.1',port=args.port)
