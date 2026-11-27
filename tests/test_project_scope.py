from fastapi.testclient import TestClient

from akshauhini.server import create_app
from akshauhini.store import EventStore


def connect(client, app_id, run_id):
    client.post('/api/apps/connect', json={'app_id': app_id, 'name': app_id.title(), 'run_id': run_id, 'agents': [{'agent_id': 'a', 'name': 'A'}]}).raise_for_status()


def test_runs_can_be_filtered_to_one_project(tmp_path):
    with TestClient(create_app(str(tmp_path / 'office.sqlite'))) as client:
        connect(client, 'grantsentinel', 'g1')
        connect(client, 'mainstreet', 'm1')
        connect(client, 'grantsentinel', 'g2')
        assert client.get('/api/config').json()['app_id'] is None
        assert [r['run_id'] for r in client.get('/api/runs').json()] == ['g2', 'm1', 'g1']
        assert [r['run_id'] for r in client.get('/api/runs', params={'app_id': 'grantsentinel'}).json()] == ['g2', 'g1']


def test_a_scoped_office_never_lists_other_projects(tmp_path):
    with TestClient(create_app(str(tmp_path / 'office.sqlite'), app_scope='grantsentinel')) as client:
        connect(client, 'grantsentinel', 'g1')
        connect(client, 'mainstreet', 'm1')
        assert client.get('/api/config').json()['app_id'] == 'grantsentinel'
        assert [r['run_id'] for r in client.get('/api/runs').json()] == ['g1']
        assert client.get('/api/runs', params={'app_id': 'mainstreet'}).json() == []


def test_delete_run_removes_only_that_run(tmp_path):
    path = str(tmp_path / 'office.sqlite')
    with TestClient(create_app(path)) as client:
        connect(client, 'grantsentinel', 'g1')
        connect(client, 'mainstreet', 'm1')
        client.post('/api/runs/m1/agents/a/questions', json={'question': 'Status?', 'source': 'agent'}).raise_for_status()
    store = EventStore(path)
    try:
        assert store.delete_run('m1') == 3  # run.started, agent.created, question.asked
        assert store.delete_run('m1') == 0
        assert [r['run_id'] for r in store.runs()] == ['g1']
        assert store.db.execute("SELECT COUNT(*) FROM questions WHERE run_id='m1'").fetchone()[0] == 0
    finally:
        store.close()
