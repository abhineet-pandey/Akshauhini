"""Actual FIFO tool concurrency, instrumented separately from presentation queues."""
from contextlib import contextmanager
from threading import Condition
from uuid import uuid4
import time

class Resource:
    def __init__(self, office, name, capacity):
        if capacity<1:raise ValueError('capacity must be positive')
        self.office,self.name,self.capacity=office,name,capacity
        self.condition=Condition();self.waiting=[];self.active={}

    def snapshot(self, agent, task=None, type='resource.updated'):
        self.office.emit(type,agent,task,tool=self.name,capacity=self.capacity,
            active_agents=list(self.active.values()),waiting_agents=[a for _,a in self.waiting],queue_depth=len(self.waiting))

    @contextmanager
    def use(self, agent_id, task_id=None, timeout=60):
        token=str(uuid4());start=time.monotonic();acquired=False
        with self.condition:
            self.waiting.append((token,agent_id))
            try:
                if len(self.active)>=self.capacity or self.waiting[0][0]!=token:
                    self.snapshot(agent_id,task_id,'tool.queued')
                while len(self.active)>=self.capacity or self.waiting[0][0]!=token:
                    remaining=timeout-(time.monotonic()-start)
                    if remaining<=0:raise TimeoutError(f'Timed out waiting for {self.name}')
                    self.condition.wait(remaining)
                self.waiting.pop(0);self.active[token]=agent_id;acquired=True
                self.snapshot(agent_id,task_id,'tool.dequeued')
            except BaseException as exc:
                self.waiting=[entry for entry in self.waiting if entry[0]!=token]
                if acquired:self.active.pop(token,None)
                self.condition.notify_all()
                try:
                    self.snapshot(agent_id,task_id)
                    self.office.emit('tool.call.failed',agent_id,task_id,tool=self.name,error=f'Resource acquisition failed: {exc}')
                except Exception:
                    pass
                raise
        try:
            with self.office.operation('tool.call',agent_id,task_id,tool=self.name) as metrics:yield metrics
        finally:
            with self.condition:
                self.active.pop(token,None)
                self.condition.notify_all()
                self.snapshot(agent_id,task_id)
