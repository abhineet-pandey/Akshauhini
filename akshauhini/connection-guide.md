# Connect another agentic app to Akshauhini

Akshauhini observes your existing app. The connected app supplies its actual agent IDs, work events, results, and progress. Live mode starts empty; sample agents appear only when you explicitly choose Demo. Apps can register any agent names/roles and add, update, or remove agents during a run.

## Fastest path: decorate an existing agent function

For a Python multi-agent project, add one `Office` instance and decorate each agent entry point. Both synchronous and asynchronous functions are supported. The original return value and exception behavior stay unchanged.

```python
from akshauhini import Office

office = Office(app_id="my-agents", app_name="My Agent Team")

@office.track("planner", name="Planning Agent", role="manager")
async def planner(request):
    return await run_planner(request)
```

Run the project with `akshauhini run python your_app.py`. The decorator automatically reports agent registration plus task creation, acceptance, start, duration, completion, and failure. Add explicit `office.progress`, `office.operation`, or `office.artifact` calls only when the dashboard should show richer work units, tool calls, or result content.

## 1. Start the monitor

From this repository:

```bash
source .venv/bin/activate
akshauhini serve
```

Open the address it prints: http://127.0.0.1:8765, or a free port if another program already uses 8765 (apps on this machine find it automatically). The office listens on 127.0.0.1 only; `akshauhini serve --host 0.0.0.0` exposes it to your network. If installing from source for the first time, follow README.md to install Python dependencies and build the web UI.

## 2. Install the SDK into your other app

In that app's Python environment, install the local project (it is not published to PyPI):

```bash
pip install -e /path/to/Akshauhini   # the folder that contains pyproject.toml
```

Use `Office(endpoint='http://127.0.0.1:8765', ...)` or set `AKSHAUHINI_ENDPOINT`. Each Office instance gets a new run ID unless you pass `run_id` or set `AKSHAUHINI_RUN_ID`. Share the run ID across cooperating processes; keep it different across unrelated apps/runs. The collector is local and has no authentication: use a private tunnel if the app runs on a different machine, rather than exposing the collector publicly.

## 3. Register your real agents and publish progress

```python
from akshauhini import Office

monitor = Office(app_id='my-research-app', app_name='My Research App')
# Iterate YOUR application's roster; names here are examples only.
for agent in my_app.agents:
    monitor.agent(agent.id, name=agent.name, role=agent.role,
                  department=agent.team, model=agent.model_name)

# Call on actual work-state transitions / after a completed item:
monitor.progress(
    agent_id='researcher-1', task_id='sources-42',
    state='working', summary='Reviewed 3 of 10 known sources',
    completed_items=['Reviewed sources A, B, C'],
    completed_units=3, total_units=10,
    waiting_for=[], next_steps=['Review remaining sources'],
)

# When blocked, say WHAT is needed. This does not imply new computation:
monitor.progress(
    agent_id='researcher-1', task_id='sources-42',
    state='waiting', summary='Need approval before using private sources',
    completed_items=['Reviewed public sources'],
    waiting_for=['Human source approval', 'Credentials from data owner'],
    next_steps=['Resume private source review after approval'],
)
```

States: `idle`, `working`, `waiting`, `blocked`, `completed`, `failed`, `cancelled`. Waiting/blocked reports require at least one `waiting_for` item. A percentage is computed only when both integer `completed_units` and positive `total_units` are supplied. Omit them for indeterminate work such as LLM reasoning. Every snapshot replaces the prior snapshot, so include the currently relevant completed/waiting/next lists. A report without counts clears the old percentage.

Publish `artifact.created` with a task ID and `name` to display produced artifacts. Use `Office.operation('llm', ...)` or `Office.operation('tool.call', ..., tool='web_search')` around actual calls to drive work animations and measured durations. The app must emit updates when its state changes; the monitor cannot inspect uninstrumented internal state automatically.

Dynamic membership:

```python
monitor.agent('new-worker', name='Verifier', role='reviewer')
monitor.emit('agent.updated', 'new-worker', name='Senior verifier', department='Quality')
monitor.emit('agent.removed', 'new-worker')
```

In the UI choose **Live → your app/run**. Click its agents to see completed work, current state, waiting dependencies, next steps, measured progress, and results. Separate runs never share an agent roster even when agent IDs are identical.

## 4. Let the user ask each agent about progress

Run a question responder inside the connected app. It receives the user's question and reads that agent's current, real state. It should be a read-only, thread-safe callback; never interpret arbitrary questions as commands to execute.

```python
from akshauhini import Office

with Office(app_id='my-app', app_name='My Agentic App') as monitor:
    monitor.agent('researcher-1', name='Researcher', role='researcher')

    def answer_progress(question):
        # Replace this with your app's thread-safe state read.
        state = my_app.get_progress('researcher-1')
        return {
            'answer': state['summary'],
            'progress': {
                'state': state['state'],
                'summary': state['summary'],
                'task_id': state['task_id'],
                'completed_items': state['completed_items'],
                'waiting_for': state['waiting_for'],
                'next_steps': state['next_steps'],
                # Include counts only when grounded in actual work units.
            },
        }

    with monitor.answer_questions({'researcher-1': answer_progress}):
        my_app.run()
```

Click an agent → **Ask this agent → Connected agent**. The question is persisted, collected by its app's handler, and answered in the inspector. A structured progress reply is committed atomically with its answer and streamed to the office, updating status and task progress. If no handler is running, the UI says it is waiting; it never fabricates an answer. The worker polls once per second, claims a 60-second lease, and retries abandoned deliveries after expiry. Callbacks should finish within 60 seconds and be safe to repeat after a transport failure. Return only `{'answer': '...'}` for a response that should not change progress.

For agents spawned later, bind `with monitor.answer_questions(handlers) as responder:` and call `responder.register(new_agent_id, callback)` after registering the new agent. Use `responder.unregister(agent_id)` when it leaves.

Keep the responder context alive while you want to answer questions, including after a task completes. To see a complete working example without any agent-framework dependency:

```bash
akshauhini run python examples/connected_app.py --directory . --seconds 90
```

This app registers real file-scanning workers, reports work units as files are read, and answers questions for 90 seconds after scanning. It does not use an LLM or fabricate work.

## 5. Optional Ollama explanations

No LLM is needed for monitoring, progress reporting, or structured agent responses. If you want natural-language explanations of reported telemetry, run your locally installed Ollama server and install a model of your choice using Ollama. Akshauhini lists the models returned by that server; it does not automatically download a model or call a separate LLM provider. Ollama can serve local or cloud-backed models: models tagged `cloud` may send the summary request and its telemetry through Ollama’s cloud service. Select the model explicitly; use a locally installed model if the telemetry must remain on your machine.

```bash
ollama serve
ollama list
# Optional default: use an exact installed model name from ollama list.
export AKSHAUHINI_OLLAMA_MODEL='your-installed-model-name'
# Default is http://127.0.0.1:11434; change only for your own Ollama server.
export AKSHAUHINI_OLLAMA_URL='http://127.0.0.1:11434'
akshauhini serve
```

Select **Ollama · recorded telemetry summary** under Ask this agent, then choose an installed model. No model is selected automatically unless you configured `AKSHAUHINI_OLLAMA_MODEL`. The response is labeled as an Ollama summary; it does not impersonate a fresh reply from the connected agent and cannot change task progress. It summarizes up to the latest 100 recorded events for that agent. An unavailable server/model produces a visible error without falling back to another provider. Ollama may still misinterpret telemetry; the structured progress panel remains the authoritative reported data.

Ollama integration uses the documented [chat endpoint](https://docs.ollama.com/api/chat) and [installed-model list](https://docs.ollama.com/api/tags).

## Generic HTTP / non-Python apps

Register an app and its initial agents:

```bash
curl http://127.0.0.1:8765/api/apps/connect \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"my-app","name":"My App","run_id":"run-42","agents":[{"agent_id":"worker-1","name":"Worker","role":"researcher"}]}'
```

Publish a progress event (the server calculates the fraction):

```bash
curl http://127.0.0.1:8765/api/events \
  -H 'Content-Type: application/json' \
  -d '[{"run_id":"run-42","agent_id":"worker-1","task_id":"task-1","type":"agent.progress","data":{"state":"working","summary":"Read two of five sources","completed_units":2,"total_units":5,"completed_items":["Source A","Source B"],"waiting_for":[],"next_steps":["Read remaining sources"]}}]'
```

Question bridge endpoints (URL-encode IDs):

1. UI creates: `POST /api/runs/{run}/agents/{agent}/questions` with `{"question":"What is blocking you?","source":"agent"}`.
2. App polls: `POST /api/runs/{run}/agents/{agent}/questions/claim` (no body). Returns zero or one question with `id` and `delivery_token`.
3. App replies: `POST /api/runs/{run}/agents/{agent}/questions/{id}/answer` with `{"delivery_token":"...","answer":"Waiting for credentials","progress":{"state":"waiting","summary":"Need data access","waiting_for":["Credentials"],"task_id":"task-1"}}`.
4. UI reads: `GET /api/runs/{run}/agents/{agent}/questions` (latest 50).

Duplicate identical replies with the same token are idempotent. A conflicting reply or superseded token returns 409. Questions are scoped to the run AND agent. HTTP question endpoints are intended for trusted local applications until authentication is implemented.

Existing generic AOEP and annotated OTLP/HTTP JSON event ingestion remain available. This rename uses `akshauhini.*` OTLP attributes, `AKSHAUHINI_*` environment variables, the `akshauhini` import, and the `akshauhini` CLI. The AOEP envelope version remains 1.0 with additional event types. Old databases remain readable by setting `AKSHAUHINI_DB` to their path.

## Connecting a different multi-agent system

The office is not tied to any sample app. Any system that can send AOEP events over HTTP, or use the Python SDK, appears as its own run with its own roster. A LangGraph supervisor graph, a CrewAI crew, an AutoGen group chat, a peer-to-peer swarm and a hand-written pipeline all use the same events. A complete example that uses only HTTP and no SDK is `examples/support_swarm_http.py`:

```bash
python examples/support_swarm_http.py --scale 2      # 17 agents, no manager role, peer-to-peer handoffs
```

Map your framework's concepts onto these events. Fields not listed are ignored by the office and kept in the stream.

| Your system does this | Send | Fields the office reads |
| --- | --- | --- |
| An agent exists, changes or leaves | `agent.created`, `agent.updated`, `agent.removed` | `name`, `role`, `department`, `model` |
| Work is created, given to someone, picked up | `task.created`, `task.assigned`, `task.accepted`, `task.started` | `task_id`; `title`; `target_agent_id` on `task.assigned` |
| Work is waiting for something | `task.waiting` | `reason` is shown as "Waiting · reason" |
| Work ends | `task.completed`, `task.failed`, `task.cancelled` | `error` |
| A model call | `llm.started` then `llm.completed` or `llm.failed` | same `operation_id` on both; `model`, `input_tokens`, `output_tokens`, `duration_ms`, `error` |
| A tool call | `tool.call.started` then `tool.call.completed` or `tool.call.failed` | same `operation_id` on both; `tool`, optional `station`, `duration_ms`, `error` |
| A retry | `tool.retry` | `tool` |
| An agent passes work to a peer | `handoff.started`, then `handoff.completed` | `task_id`; `target_agent_id` is the receiver |
| Agents talk | `message.sent` | `target_agent_id`; three or more `participants` gather at the meeting table |
| A reviewer decides | `review.started`, `review.approved`, `review.rejected` | none |
| A person is asked | `human.requested`, `human.approved`, `human.rejected` | none |
| Output exists | `artifact.created` | `artifact_id`, `name`, `content`, `version`, `parent_ids` |
| Something the office has no type for | `x.<vendor>.<name>`, for example `x.langgraph.node_entered` | anything; stored and replayed, never changes agent or task state |

Rules the office applies, so that your system is shown truthfully:

- **Roles.** A role containing the word manager, orchestrator, supervisor, coordinator or director, or "team lead", "tech lead", gets a manager desk along the back wall and the suit. Matching is by whole word and ignores case, so `SupervisorAgent` and `team_lead` match while `management-consultant` does not. Several managers are allowed.
- **Tool stations.** A tool visits a station chosen from whole words in its name: `vector_search`, `rag_search`, `retrieve_docs` go to the knowledge archive, `sql_query` and `postgres` to records, `bash`, `python_repl`, `github_api` to engineering, `web_search`, `browser`, `fetch_url` to research, and everything else to the compute room. Words are never matched inside other words, so `average_calc` is not a RAG tool. Send `"station": "archive"` (one of `research`, `archive`, `database`, `engineering`, `compute`) with the tool event to choose the station yourself; it takes precedence over the name.
- **Handoffs.** Either agent may send `handoff.completed`. Name the receiver in `target_agent_id`, or send it as the receiver. The receiver owns the task afterwards and the sender walks back to its desk.
- **Team size.** The first five workers sit in the middle of the office. Further workers get desks in an open-plan area that extends the floor, so any team size is shown without characters overlapping. A desk never moves when other agents join or leave.
- **Run identity.** An app's name comes from any `run.started` or `POST /api/apps/connect` for the run. A later `run.started` can change or add a name or title but never erases one.
- **Unknown event types.** A type that is neither in the schema nor an `x.` extension is rejected with 422 and the whole batch is rejected, so mistyped types are caught early.

## Manager routing, findings and conversational context

Enable `contextual=True` on `office.answer_questions(...)` to pass each callback the claimed question object, including `question`, `route`, and the previous five answered questions in `history`. String callbacks remain supported by default.

```python
def manager(message):
    if 'source' in message['question'].lower():
        return {'route_to': 'researcher', 'reason': 'Research owns the source findings'}
    return {'answer': 'Here is the current run summary ...'}

def researcher(message):
    return {
        'answer': 'The supplied requirements document states that offline editing is needed.',
        'findings': [{'source_id': 'requirements:L3', 'title': 'Requirements',
                      'excerpt': 'The field team needs offline editing.'}],
        # Optional factual progress snapshot as before.
    }

with office.answer_questions({'manager': manager, 'researcher': researcher}, contextual=True):
    your_app.run()
```

Use actual excerpts from your app's findings, not the illustrative text above. Routing is decided by your real app callback, recorded atomically, and shown as a handoff. The same question stays visible in the original manager's history while the specialist answers. Answers include `answered_by`, routing path and source excerpts. Cycles and more than eight routing hops are rejected.

Additional HTTP actions under `/api/runs/{run}/agents/{agent}/questions/{id}`:

- `POST /route`: `delivery_token`, `target_agent_id`, `reason`.
- `POST /renew`: `delivery_token`; renews a delivered question for 60 seconds.
- `POST /cancel`: prevents future claims/replies and emits cancellation telemetry.

The SDK runs callbacks concurrently across agents and renews their leases every 20 seconds. Cancellation cannot forcibly stop arbitrary application code already running, but cancelled/superseded callbacks cannot commit answers or progress. Keep callbacks read-only and safe to repeat after a process failure.

## Tool queues and inspectable output

`archive = office.resource('knowledge_retrieval', capacity=1)` creates a real FIFO tool resource shared inside that Office instance. Wrap work in `with archive.use(agent_id, task_id): ...`. It enforces concurrency and emits authoritative capacity, active-agent and waiting-agent snapshots, separate from visual travel. Resources are not distributed locks across processes.

`office.artifact(agent_id, task_id, artifact_id='report', name='Report.md', content=report, version=1, parent_ids=['source-evidence'])` publishes inspectable content and lineage. All correlated operations remain in the inspector even when several execute for the same agent.

## Saved model settings and window controls

The Settings gear exposes chat and optional embedding model selectors using the configured Ollama server. `GET /api/settings` returns saved `llm_model`, `embedding_model` and `ollama_url`; `PUT /api/settings` persists model choices. Null disables either default. Model names must be available on the server; selecting an embedding-capable model is required for actual embedding calls.

The workspace fills available width and viewport height. **Expand workspace** maximizes the office and inspector; **Restore workspace** or Escape returns to the page. **Reduce motion** preserves runtime status while reducing visual movement.

A complete separate implementation is documented in `sample_projects/request_studio/README.md`. It reads saved model settings when the user enables that option and verifies that saved and visualized output agree.
