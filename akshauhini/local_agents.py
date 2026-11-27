"""Opt-in scanners that mirror tools already running on this machine into the office.

Each scanner only reads what its tool's own local, documented API already exposes, and only runs
when explicitly started with `akshauhini scan <source>` in its own terminal — never automatically,
and never by reading another tool's private files. A scanner that cannot honestly tell what an
agent is doing reports it idle, not working: a loaded-but-silent Ollama model is not evidence of
active generation, and Ollama's API does not say which.
"""
import time
import httpx
from .sdk import Office


def _agent_id(model_name):
    return 'ollama-' + model_name.replace(':', '-').replace('/', '-')


def _sync_once(office, url, known):
    """One poll of Ollama's /api/ps: registers newly loaded models, removes unloaded ones.

    /api/ps reports only model name, size and memory footprint — never prompts or responses — so
    this is safe to poll continuously without exposing conversation content.
    """
    try:
        response = httpx.get(f'{url}/api/ps', timeout=3)
        response.raise_for_status()
        current = {m['name'] for m in response.json().get('models', []) if m.get('name')}
    except httpx.HTTPError:
        current = set()
    for name in current - known:
        office.agent(_agent_id(name), name=name, role='model', department='Local LLM')
    for name in known - current:
        office.emit('agent.removed', _agent_id(name))
    return current


def scan_ollama(endpoint, interval=5, ollama_url=None, strict=False):
    url = (ollama_url or 'http://127.0.0.1:11434').rstrip('/')
    office = Office(endpoint, app_id='local-ollama', app_name='Local LLM', strict=strict)
    known = set()
    print(f'Watching the local LLM at {url} for loaded models. Ctrl+C to stop.', flush=True)
    while True:
        known = _sync_once(office, url, known)
        time.sleep(interval)
