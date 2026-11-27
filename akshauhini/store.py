import json
import sqlite3
from threading import RLock
from .protocol import Event

class EventStore:
    def __init__(self, path: str):
        self.lock = RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, run_id TEXT NOT NULL, payload TEXT NOT NULL)")
        self.db.execute("CREATE INDEX IF NOT EXISTS events_run ON events(run_id, seq)")
        self.db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self.db.commit()

    def append(self, events: list[Event]):
        inserted = []
        with self.lock, self.db:
            for event in events:
                payload = event.model_dump(mode="json")
                existing = self.db.execute("SELECT payload FROM events WHERE event_id=?", (event.event_id,)).fetchone()
                if existing:
                    if json.loads(existing[0]) != payload:
                        raise ValueError(f"event_id conflict: {event.event_id}")
                    continue
                cursor = self.db.execute("INSERT INTO events(event_id,run_id,payload) VALUES (?,?,?)", (event.event_id, event.run_id, json.dumps(payload)))
                inserted.append({**payload, "seq": cursor.lastrowid})
        return inserted

    def events(self, run_id: str, after: int = 0, limit: int = 1000):
        with self.lock:
            rows = self.db.execute("SELECT seq,payload FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?", (run_id, after, limit)).fetchall()
        return [{**json.loads(payload), "seq": seq} for seq, payload in rows]

    def runs(self, app_id: str | None = None, limit: int = 200):
        """Latest runs, newest first. With app_id, only that app's runs: other projects never appear."""
        with self.lock:
            rows = self.db.execute("SELECT run_id,COUNT(*),MIN(seq),MAX(seq) FROM events GROUP BY run_id ORDER BY MAX(seq) DESC" + ("" if app_id else f" LIMIT {int(limit)}")).fetchall()
        result = []
        with self.lock:
            for r, n, first, last in rows:
                # Every run.started contributes: the app registers itself with one and a CLI wrapper or the app
                # itself may emit another. A later event may add identity but never erase what an earlier one said.
                identity = {}
                for (payload,) in self.db.execute("SELECT payload FROM events WHERE run_id=? AND json_extract(payload,'$.type')='run.started' ORDER BY seq", (r,)):
                    data = json.loads(payload).get("data", {})
                    for key in ("app_id", "app_name", "title"):
                        if isinstance(data.get(key), str) and data[key]:
                            identity[key] = data[key]
                last_row = self.db.execute("SELECT json_extract(payload,'$.timestamp') FROM events WHERE run_id=? AND seq=?", (r, last)).fetchone()
                if app_id and identity.get("app_id") != app_id:
                    continue
                result.append({"run_id":r,"event_count":n,"first_seq":first,"last_seq":last,"app_id":identity.get("app_id"),"app_name":identity.get("app_name",identity.get("title")),"last_event_at":last_row[0] if last_row else None})
                if len(result) >= limit:
                    break
        return result

    def delete_run(self, run_id: str) -> int:
        """Permanently remove a run's events and questions. Returns the number of events removed."""
        with self.lock, self.db:
            removed = self.db.execute("DELETE FROM events WHERE run_id=?", (run_id,)).rowcount
            if self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='questions'").fetchone():
                self.db.execute("DELETE FROM questions WHERE run_id=?", (run_id,))
        return removed

    def agent_snapshot(self, run_id, agent_id):
        with self.lock:
            rows = self.db.execute("SELECT seq,payload FROM events WHERE run_id=? AND json_extract(payload,'$.agent_id')=? ORDER BY seq DESC LIMIT 100", (run_id,agent_id)).fetchall()
        if not rows:
            raise KeyError("Agent not found in this run")
        events = [{**json.loads(payload), "seq":seq} for seq,payload in reversed(rows)]
        return {"run_id":run_id,"agent_id":agent_id,"last_update":events[-1]["timestamp"],"events":events}


    def settings(self):
        with self.lock:
            row=self.db.execute("SELECT value FROM settings WHERE key='models'").fetchone()
        return json.loads(row[0]) if row else None

    def save_settings(self, settings):
        with self.lock,self.db:
            self.db.execute("INSERT INTO settings(key,value) VALUES('models',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(json.dumps(settings),))

    def close(self):
        self.db.close()
