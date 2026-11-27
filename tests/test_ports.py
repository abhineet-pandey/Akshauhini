"""Port selection: 127.0.0.1 always, 8765 preferred, a free port when another program holds it, explicit ports kept."""
import socket

import pytest

from akshauhini import cli, config, sdk


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("AKSHAUHINI_HOME", str(tmp_path))
    monkeypatch.delenv("AKSHAUHINI_ENDPOINT", raising=False)
    monkeypatch.delenv("AKSHAUHINI_PORT", raising=False)


@pytest.fixture
def other_program():
    """A port held by a program that is not an Akshauhini office (it accepts connections but never answers HTTP)."""
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    yield listener.getsockname()[1]
    listener.close()


def test_a_port_held_by_another_program_is_reported_not_crashed_on(other_program):
    with pytest.raises(sdk.PortInUse, match="another program"):
        sdk.collector_running(config.loopback_endpoint(other_program))


def test_a_web_server_without_the_health_api_is_another_program(monkeypatch):
    class NotFound:
        def raise_for_status(self):
            import httpx
            raise httpx.HTTPStatusError("404", request=None, response=None)
    monkeypatch.setattr(sdk.httpx, "get", lambda *a, **k: NotFound())
    with pytest.raises(sdk.PortInUse):
        sdk.collector_running("http://127.0.0.1:1")


def test_port_availability(other_program):
    assert config.port_available(other_program) is False
    free = config.free_port()
    assert config.port_available(free) is True


def test_without_a_chosen_port_8765_is_preferred(monkeypatch):
    monkeypatch.setattr(config, "DEFAULT_PORT", config.free_port())
    assert sdk.locate_office() == (config.loopback_endpoint(config.DEFAULT_PORT), False)


def test_a_free_port_is_used_when_another_program_holds_8765(monkeypatch, other_program):
    monkeypatch.setattr(config, "DEFAULT_PORT", other_program)
    endpoint, running = sdk.locate_office()
    port = int(endpoint.rsplit(":", 1)[1])
    assert running is False and port != other_program and endpoint.startswith("http://127.0.0.1:")
    assert config.port_available(port)


def test_a_running_office_on_a_fallback_port_is_found_through_the_record(monkeypatch):
    config.write_record(54321, 999, True)
    monkeypatch.setattr(sdk, "collector_running", lambda endpoint: endpoint.endswith(":54321"))
    assert sdk.locate_office() == ("http://127.0.0.1:54321", True)
    assert config.default_endpoint() == "http://127.0.0.1:54321"


def test_a_stale_record_falls_back_to_8765(monkeypatch):
    monkeypatch.setattr(config, "DEFAULT_PORT", config.free_port())
    config.write_record(config.free_port(), 999, True)
    assert sdk.locate_office() == (config.loopback_endpoint(config.DEFAULT_PORT), False)


def test_an_explicit_port_is_never_replaced(monkeypatch, other_program):
    with pytest.raises(sdk.PortInUse, match=f"{other_program} is in use by another program.*Choose a different port"):
        sdk.locate_office(config.loopback_endpoint(other_program))
    monkeypatch.setenv("AKSHAUHINI_PORT", str(other_program))
    with pytest.raises(sdk.PortInUse):
        sdk.locate_office()
    assert config.default_endpoint() == config.loopback_endpoint(other_program)


def test_explicit_environment_wins_over_the_record(monkeypatch):
    config.write_record(54321, 999, True)
    monkeypatch.setenv("AKSHAUHINI_ENDPOINT", "http://127.0.0.1:9100/")
    assert config.default_endpoint() == "http://127.0.0.1:9100"


def test_serve_with_a_busy_explicit_port_explains_instead_of_crashing(other_program, capsys):
    assert cli.main(["--port", str(other_program), "serve"]) == 2
    assert f"port {other_program} is already in use" in capsys.readouterr().err


def test_status_on_another_programs_port_explains_instead_of_crashing(other_program, capsys):
    assert cli.main(["--port", str(other_program), "status"]) == 1
    assert "another program" in capsys.readouterr().out


def test_stop_never_signals_a_recorded_process_that_is_not_a_running_office(monkeypatch, capsys):
    config.write_record(config.free_port(), 424242, True)
    killed = []
    monkeypatch.setattr(cli.os, "kill", lambda *a: killed.append(a))
    monkeypatch.setattr(cli.subprocess, "run", lambda *a, **k: killed.append(a))
    assert cli.main(["stop"]) == 1
    assert killed == [] and config.read_record() is None
    assert "was not running" in capsys.readouterr().out
