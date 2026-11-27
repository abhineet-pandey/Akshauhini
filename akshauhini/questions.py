import json
import time
from datetime import datetime, timezone
from uuid import uuid4
from .models import Answer, Route
from .protocol import Event

class Questions:
    """Durable routing inbox with atomic telemetry, leases and evidence-bearing answers."""
    def __init__(self, store):
        self.store = store
        with store.lock, store.db:
            store.db.execute('''CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY, run_id TEXT NOT NULL, agent_id TEXT NOT NULL,
                question TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL,
                created_at TEXT NOT NULL, answer TEXT, progress TEXT, answered_at TEXT,
                lease_until REAL NOT NULL DEFAULT 0, delivery_token TEXT, model TEXT)''')
            columns = {row[1] for row in store.db.execute('PRAGMA table_info(questions)')}
            for name, definition in [('assigned_agent_id','TEXT'),('route','TEXT NOT NULL DEFAULT \'[]\''),('findings','TEXT NOT NULL DEFAULT \'[]\''),('answered_by','TEXT')]:
                if name not in columns:
                    store.db.execute(f'ALTER TABLE questions ADD COLUMN {name} {definition}')
            store.db.execute('UPDATE questions SET assigned_agent_id=agent_id WHERE assigned_agent_id IS NULL')
            store.db.execute('CREATE INDEX IF NOT EXISTS questions_inbox ON questions(run_id,assigned_agent_id,status)')

    def _event(self, run, agent, type, id, **data):
        event = Event(run_id=run,agent_id=agent,type=type,data={'question_id':id,**data})
        self.store.db.execute('INSERT INTO events(event_id,run_id,payload) VALUES(?,?,?)',(event.event_id,run,event.model_dump_json()))

    def create(self, run_id, agent_id, question, source="agent", answer=None, model=None):
        id, now = str(uuid4()), datetime.now(timezone.utc).isoformat()
        with self.store.lock, self.store.db:
            self.store.db.execute('BEGIN IMMEDIATE')
            count=self.store.db.execute("SELECT COUNT(*) FROM questions WHERE run_id=? AND status IN ('pending','delivered')",(run_id,)).fetchone()[0]
            if count >= 200:
                raise ValueError('Run inbox is full; answer or cancel pending questions first')
            self.store.db.execute('INSERT INTO questions(id,run_id,agent_id,assigned_agent_id,question,source,status,created_at,answer,answered_at,model,route,answered_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', (id,run_id,agent_id,agent_id,question,source,'answered' if answer else 'pending',now,answer,now if answer else None,model,json.dumps([agent_id]),agent_id if answer else None))
            if source == 'agent':
                self._event(run_id,agent_id,'question.asked',id,question=question)
        return self.get(run_id,agent_id,id)

    def _rows(self, sql, params):
        cursor = self.store.db.execute(sql, params)
        return [dict(zip([c[0] for c in cursor.description], row)) for row in cursor.fetchall()]

    @staticmethod
    def public(row):
        row = dict(row)
        row.pop('delivery_token',None); row.pop('lease_until',None)
        for key in ('progress','route','findings'):
            row[key]=json.loads(row[key]) if row.get(key) else (None if key=='progress' else [])
        return row

    def _row(self, run, agent, id):
        rows=self._rows('SELECT * FROM questions WHERE run_id=? AND id=? AND (agent_id=? OR assigned_agent_id=?)',(run,id,agent,agent))
        if not rows: raise KeyError('Question not found for this agent/run')
        return rows[0]

    def get(self, run, agent, id):
        with self.store.lock: return self.public(self._row(run,agent,id))

    def history(self, run, agent):
        with self.store.lock:
            return [self.public(row) for row in self._rows('SELECT * FROM questions WHERE run_id=? AND (agent_id=? OR assigned_agent_id=?) ORDER BY rowid DESC LIMIT 50',(run,agent,agent))]

    def claim(self, run, agent):
        with self.store.lock, self.store.db:
            self.store.db.execute('BEGIN IMMEDIATE')
            rows=self._rows("SELECT * FROM questions WHERE run_id=? AND assigned_agent_id=? AND source='agent' AND status IN ('pending','delivered') AND lease_until<? ORDER BY rowid LIMIT 1",(run,agent,time.time()))
            if not rows:return []
            row=rows[0]; token=str(uuid4())
            self.store.db.execute("UPDATE questions SET status='delivered',lease_until=?,delivery_token=? WHERE id=?",(time.time()+60,token,row['id']))
            self._event(run,agent,'question.received',row['id'],question=row['question'])
            context=[self.public(r) for r in self._rows("SELECT * FROM questions WHERE run_id=? AND agent_id=? AND status='answered' ORDER BY rowid DESC LIMIT 5",(run,row['agent_id']))]
            return [{**self.public(row),'delivery_token':token,'status':'delivered','history':list(reversed(context))}]

    def _check(self, row, agent, token):
        if row['source']!='agent' or row['assigned_agent_id']!=agent or row['delivery_token']!=token:
            raise ValueError('Invalid or superseded delivery token')
        if row['status']=='cancelled':raise ValueError('Question was cancelled')

    def renew(self, run, agent, id, token):
        with self.store.lock, self.store.db:
            row=self._row(run,agent,id); self._check(row,agent,token)
            if row['status']!='delivered':raise ValueError('Question is no longer delivered')
            self.store.db.execute('UPDATE questions SET lease_until=? WHERE id=?',(time.time()+60,id))
        return {'renewed':True}

    def cancel(self, run, agent, id):
        with self.store.lock, self.store.db:
            row=self._row(run,agent,id)
            if row['status']=='answered':raise ValueError('An answered question cannot be cancelled')
            if row['status']!='cancelled':
                self.store.db.execute("UPDATE questions SET status='cancelled',delivery_token=NULL,lease_until=0 WHERE id=?",(id,))
                self._event(run,row['assigned_agent_id'],'question.cancelled',id)
        return self.get(run,agent,id)

    def route(self, run, agent, id, route: Route):
        target=self.store.agent_snapshot(run,route.target_agent_id)
        if target['events'][-1]['type']=='agent.removed':raise ValueError('Target agent has left the run')
        with self.store.lock, self.store.db:
            self.store.db.execute('BEGIN IMMEDIATE')
            row=self._row(run,agent,id); self._check(row,agent,route.delivery_token)
            if row['status']!='delivered':raise ValueError('Question is no longer delivered')
            path=json.loads(row['route']) or [row['agent_id']]
            if route.target_agent_id in path or len(path)>=8:raise ValueError('Routing cycle or hop limit reached')
            path.append(route.target_agent_id)
            self.store.db.execute("UPDATE questions SET assigned_agent_id=?,route=?,status='pending',delivery_token=NULL,lease_until=0 WHERE id=?",(route.target_agent_id,json.dumps(path),id))
            self._event(run,agent,'question.routed',id,target_agent_id=route.target_agent_id,reason=route.reason,question=row['question'])
        return self.get(run,row['agent_id'],id)

    def answer(self, run, agent, id, reply: Answer):
        now=datetime.now(timezone.utc).isoformat()
        progress=reply.progress.model_dump() if reply.progress else None
        findings=[f.model_dump() for f in reply.findings]
        with self.store.lock, self.store.db:
            self.store.db.execute('BEGIN IMMEDIATE')
            row=self._row(run,agent,id); self._check(row,agent,reply.delivery_token)
            if row['status']=='answered':
                if row['answer']!=reply.answer or (json.loads(row['progress']) if row['progress'] else None)!=progress or json.loads(row['findings'])!=findings:raise ValueError('Question already has a different answer')
                return self.public(row)
            self.store.db.execute("UPDATE questions SET status='answered',answer=?,progress=?,findings=?,answered_by=?,answered_at=? WHERE id=?",(reply.answer,json.dumps(progress) if progress else None,json.dumps(findings),agent,now,id))
            self._event(run,agent,'question.answered',id,target_agent_id=row['agent_id'],answer=reply.answer,findings=findings)
            if reply.progress:
                event=Event(event_id=f'question:{id}:progress',run_id=run,agent_id=agent,task_id=reply.progress.task_id,type='agent.progress',data=reply.progress.event_data())
                self.store.db.execute('INSERT INTO events(event_id,run_id,payload) VALUES(?,?,?)',(event.event_id,run,event.model_dump_json()))
        return self.get(run,agent,id)
