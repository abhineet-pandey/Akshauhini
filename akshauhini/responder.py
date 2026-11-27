"""Concurrent, renewable, read-only question bridge running inside the connected app."""
import threading
import time
import warnings
from urllib.parse import quote
import httpx
from .models import Answer, Route

class Responder:
    def __init__(self, office, handlers, interval=1, contextual=False):
        if interval<0.1:raise ValueError('Polling interval must be at least 0.1 seconds')
        self.endpoint,self.run_id=office.endpoint,office.run_id
        self.handlers=dict(handlers); self.handler_lock=threading.Lock()
        self.interval,self.contextual=interval,contextual
        self.stop=threading.Event(); self.workers={}
        self.thread=threading.Thread(target=self._run,name='akshauhini-questions',daemon=True)

    def register(self, agent_id, handler):
        with self.handler_lock:self.handlers[agent_id]=handler

    def unregister(self, agent_id):
        with self.handler_lock:self.handlers.pop(agent_id,None)

    def _handle(self, url, question, handler):
        done=threading.Event(); valid=threading.Event(); valid.set()
        delivery={'delivery_token':question['delivery_token']}
        base=f'{url}/{question["id"]}'
        def heartbeat():
            with httpx.Client(timeout=5,trust_env=False) as client:
                while not done.wait(20) and not self.stop.is_set():
                    try:
                        response=client.post(base+'/renew',json=delivery)
                        response.raise_for_status()
                    except httpx.HTTPStatusError:
                        valid.clear();return
                    except httpx.HTTPError:
                        pass  # A later renewal or final reply validates the current token.
        heartbeat_thread=threading.Thread(target=heartbeat,daemon=True)
        heartbeat_thread.start()
        try:
            result=handler(question if self.contextual else question['question'])
            if not valid.is_set() or self.stop.is_set():return
            if isinstance(result,str):result={'answer':result}
            if 'route_to' in result:
                body=Route(**delivery,target_agent_id=result['route_to'],reason=result.get('reason','Specialist expertise required')).model_dump(mode='json'); action='route'
            else:
                body=Answer.model_validate({**result,**delivery}).model_dump(mode='json');action='answer'
            with httpx.Client(timeout=5,trust_env=False) as client:
                response=client.post(base+'/'+action,json=body);response.raise_for_status()
        except Exception as exc:
            warnings.warn(f'Akshauhini question handler: {exc}',RuntimeWarning)
        finally:
            done.set();heartbeat_thread.join(timeout=6)

    def _run(self):
        with httpx.Client(timeout=5,trust_env=False) as client:
            while not self.stop.is_set():
                with self.handler_lock:handlers=list(self.handlers.items())
                for agent_id,handler in handlers:
                    if self.stop.is_set():break
                    if self.workers.get(agent_id) and self.workers[agent_id].is_alive():continue
                    url=f'{self.endpoint}/api/runs/{quote(self.run_id,safe="")}/agents/{quote(agent_id,safe="")}/questions'
                    try:
                        response=client.post(url+'/claim');response.raise_for_status()
                        for question in response.json():
                            worker=threading.Thread(target=self._handle,args=(url,question,handler),daemon=True)
                            self.workers[agent_id]=worker;worker.start()
                    except Exception as exc:
                        warnings.warn(f'Akshauhini question inbox for {agent_id}: {exc}',RuntimeWarning)
                self.stop.wait(self.interval)

    def __enter__(self):self.thread.start();return self
    def close(self):
        self.stop.set();deadline=time.monotonic()+6
        if self.thread.is_alive():self.thread.join(timeout=6)
        for worker in list(self.workers.values()):worker.join(timeout=max(0,deadline-time.monotonic()))
    def __exit__(self,*args):self.close()
