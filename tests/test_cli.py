import httpx
import pytest
import sys
from akshauhini.cli import collector_running, use_own_python


class Reply:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


def test_a_closed_port_means_no_collector_whether_it_is_refused_or_times_out(monkeypatch):
    # Windows retries a closed loopback port for about two seconds, so a one-second probe times out
    # instead of raising ConnectError. Neither may crash `akshauhini run`.
    for error in (httpx.ConnectError('refused'), httpx.ConnectTimeout('timed out')):
        def get(*args, **kwargs):
            raise error
        monkeypatch.setattr(httpx, 'get', get)
        assert collector_running('http://127.0.0.1:1') is False


def test_a_compatible_collector_is_reused_and_a_foreign_service_is_not_adopted(monkeypatch):
    monkeypatch.setattr(httpx, 'get', lambda *args, **kwargs: Reply({'status': 'ok', 'protocol': '1.0'}))
    assert collector_running('http://127.0.0.1:1') is True
    monkeypatch.setattr(httpx, 'get', lambda *args, **kwargs: Reply({'protocol': '9'}))
    with pytest.raises(RuntimeError):
        collector_running('http://127.0.0.1:1')


def test_run_uses_its_own_interpreter_for_a_bare_python_command():
    # `akshauhini run python app.py` from an un-activated venv must not fall back to the PATH Python.
    for name in ('python', 'python3', 'PYTHON.EXE'):
        assert use_own_python([name, 'app.py', '--x']) == [sys.executable, 'app.py', '--x']
    for command in (['/opt/py/bin/python', 'app.py'], ['node', 'app.js'], ['python3.12', 'app.py']):
        assert use_own_python(command) == command


def test_only_local_collectors_are_started_automatically(monkeypatch):
    from akshauhini.sdk import ensure_collector
    monkeypatch.setattr('akshauhini.sdk.collector_running', lambda endpoint: False)
    with pytest.raises(RuntimeError, match='only local collectors'):
        ensure_collector('http://10.1.2.3:8765')


def test_init_without_autostart_never_spawns_and_does_not_break_the_app(monkeypatch):
    import akshauhini
    monkeypatch.setattr('akshauhini.sdk.ensure_collector', lambda *a, **k: (_ for _ in ()).throw(AssertionError('spawned')))
    monkeypatch.setenv('AKSHAUHINI_AUTOSTART', '0')
    with pytest.warns(RuntimeWarning):
        office = akshauhini.init('quiet-app', endpoint='http://127.0.0.1:1')
    assert office.endpoint == 'http://127.0.0.1:1'
    office.close()
