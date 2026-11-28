# Akshauhini implementation log

Updated 2026-09-06.

This repository implements a runnable local MVP. The original product vision also includes a broader product vision. The checklist below distinguishes working implementations from simplified behaviors and work that remains. An unchecked item is not implemented or is incomplete; it is not a claim of support.

## Implemented

- [x] Python package with an `akshauhini` console command and editable installation.
- [x] AOEP v1 envelope, validated event types, UTC timestamps, operation correlation, measured progress validation, and generated JSON schema.
- [x] FastAPI collector, interactive API docs, generic HTTP batch ingestion.
- [x] SQLite durable event store, sequence ordering, run listing, pagination, unique IDs, duplicate suppression, conflicting-ID detection, atomic batch rollback.
- [x] WebSocket catch-up and live updates from durable cursors, including reconnect support in the browser.
- [x] Python SDK with explicit agent registration, arbitrary supported event emission, operation context managers, measured elapsed duration, exception telemetry, and fail-open transport behavior.
- [x] CLI starts/reuses a local collector, passes run/endpoint context to child processes, records actual process exit status, opens the office, and cleans up owned processes.
- [x] OTLP/HTTP JSON adapter for explicitly annotated LLM/tool/task/review spans, original timestamps, token/model fields, failure status, and actual duration.
- [x] React/TypeScript UI and PixiJS isometric office using procedural graphics; no external sprite download required.
- [x] Manager/employee characters, labeled physical tool stations, plants, task folders, context paper stacks, selection highlights.
- [x] Separate state projection, semantic interpretation, presentation scheduling, character controller, navigation, and rendering.
- [x] A* grid navigation around fixed furniture, destination approach slots, event-linked commands, pause/resume/cancel/interrupt/complete controls.
- [x] P0 interruption for failures, cancellation, and human intervention; actual reported metrics remain independent of presentation duration.
- [x] Short successful correlated operations receive a 450 ms minimum presentation window; failures interrupt immediately.
- [x] Distinct procedural indicators for thinking, tool use, reading/review, discussion, waiting, errors, retry, and approval/completion.
- [x] Assignment and handoff movement follows target-agent events. Acceptance/completed handoff returns the sender to its desk.
- [x] Explicit multi-participant messages move known participants to the meeting area.
- [x] Human-review destination and statuses driven by approval/rejection telemetry.
- [x] Task board, event-backed task ownership, artifact labels, known task queue, measured progress only.
- [x] Agent inspector: status, task, action, department, model, tool, tokens, error, state elapsed time, and reported duration.
- [x] Pan, zoom, fit office, follow agent/manager, and follow task carrier or current owner.
- [x] Team filtering by department, secondary technical/raw event view, responsive layout, keyboard-operable agent/task controls.
- [x] Clearly labeled sample telemetry mode, live mode, deterministic stored-event replay, pause, seek, restart, and playback speeds.
- [x] Dependency lockfile for the frontend, Python package metadata, UI packaging script, example instrumented Python application, and integration documentation.

## Simplified MVP behaviors / remaining implementation

- [ ] **Framework auto-instrumentation:** implement and test versioned LangGraph, CrewAI, AutoGen, and other adapters. The CLI currently records only process lifecycle automatically. SDK/HTTP/annotated OTLP integration is required for internal activity.
- [ ] **Full animation choreography:** replace procedural poses with complete sit/stand, reading pages, collecting/binding documents, stamping, physical arm-to-arm transfers, specialized writer/debugging loops, and extended decorative idle variations. Current folder attachment and pose effects communicate these at a simplified level.
- [ ] **Crowd navigation:** destination approach slots reduce overlap, but do not guarantee collision-free travel. Add directional lanes, global reservations, deadlock resolution, local avoidance, and high-agent-count tests.
- [x] **Tool queue model:** SDK resources enforce FIFO capacity within one Office instance and emit authoritative queue/dequeue snapshots for the inspector. Distributed resource locking remains future work.
- [x] **Concurrent operations per agent:** operation ledger and inspector track overlapping operations and resume a still-running foreground operation after another finishes. Full parent/child span scheduling remains future work.
- [ ] **Multi-recipient task ownership:** artifact identity, content, versions, parent lineage and independent inspection are implemented. Explicit object transfer progress and fan-out/fan-in task ownership remain.
- [ ] **Simulation mode:** sample telemetry is a labeled demonstration, not a capacity simulator. Historical what-if staffing/queue/workload simulation remains unimplemented; no fake simulation controls are exposed.
- [ ] **Scale hierarchy:** department filtering exists in the team list; company/department/team spatial levels and aggregated views remain unimplemented. Update 2026-09-18: any team size now gets distinct desks on a floor that grows with the team, so the fixed layout is no longer limited to small teams; zoom levels and aggregation remain open.
- [ ] **Replay at scale:** implement checkpoints, indexed event-time seeking, server replay windows, and replay performance budgets. Current replay seeks rebuild the entire prefix; the browser retains at most 20,000 live events while SQLite retains all events.
- [ ] **Ordering policy across producers:** ingestion sequence is canonical; late timestamps are clamped during playback. Distributed-clock reconciliation, causal ordering, and correction events are not implemented.
- [ ] **OTLP breadth:** add protobuf/gRPC input, standard framework semantic convention mapping, richer partial rejection counts, span events, and streaming in-flight spans. JSON completed spans cannot provide live in-flight status.
- [ ] **SDK production delivery:** add async client/decorators, nonblocking buffering, retry/backoff, offline spool, flush/close guarantees, redaction hooks, and context propagation helpers. The current client is synchronous with a three-second request timeout and warning-on-failure.
- [ ] **CLI lifecycle edge cases:** structured cancellation/spawn-failure events and process-group cleanup for grandchildren remain. Direct child and owned collector termination are implemented.
- [ ] **Production collector:** authentication, authorization, tenant isolation, ingestion rate/body limits, retention/export/deletion policy, connection limits, and observability for the collector itself. Default serving is loopback-only.
- [ ] **Human approval integration:** approvals are observed, not performed. Add authenticated connectors to actual approval systems before exposing mutating UI actions.
- [ ] **Accessibility/graphics coverage:** browser fallback for devices without WebGL, canvas screen-reader descriptions, and broad mobile/GPU testing remain. Reduced-motion travel is implemented. Team/task controls provide keyboard-accessible inspection.
- [ ] **Distribution:** release automation, PyPI publication, signed artifacts, CI matrix, and Python dependency lock/constraints. UI wheel inclusion is implemented via `npm run package-ui` before wheel build.
- [ ] **Optional font self-hosting:** CSS currently requests Google Fonts, with system fallbacks when offline. Bundle fonts if fully offline visual parity is required.

## Scaffolds and placeholders

No empty adapter classes, fake approval endpoints, fabricated integration results, or inert simulation controls are included. `web/src/demo.ts` is intentionally synthetic fixture data, visibly labeled in the UI. `examples/research_team.py` performs a real Python AST parse; it does not pretend to run an LLM. Future implementations are listed above rather than represented by no-op functions.

## Verification record

- Backend unit/integration suite: persistence across reopen, atomic duplicate conflicts, event validation, HTTP ingestion, WebSocket catch-up/live/reconnect, SDK exception propagation, OTLP durations.
- Frontend engine suite: honest progress, deduplication, stale-operation guards, immediate error interruption, deterministic replay positions/state, task ownership, minimum presentation, folder acceptance, A* obstacle avoidance, and controller pause/resume/cancel.
- TypeScript production build: checked with `npm run build`.
- Final results: **5 backend tests passed, 7 engine tests passed, 2 headless Chrome browser tests passed**.
- Browser verification covered PixiJS canvas rendering without JavaScript errors, inspector selection, follow controls, replay seeking, real HTTP-to-WebSocket event delivery, and replay of a persisted run.
- Production TypeScript/Vite build passed. Python wheel build passed; ZIP contents include the HTML/CSS/JavaScript UI, and a collector HTTP smoke check served the built application.
- Screenshot reviewed and saved at `docs/office-preview.png`.
- `git diff --check` passed. Browser tests use installed Google Chrome on macOS by default; set `CHROME_PATH` to another compatible browser executable.

## Known dependency notices

The installed FastAPI/Starlette test client emits upstream deprecation warnings for its httpx/AnyIO compatibility layer. Tests pass; migration can be handled when their replacement API is stable for this project.


## 2026-09-06 — Akshauhini identity and connected-app interaction

Implemented in response to the updated project requirements:

- [x] Canonical product name, UI branding, Python package/import, CLI, environment variables, and OTLP attributes renamed to Akshauhini / `akshauhini` / `AKSHAUHINI_*`. The original source plan is retained unchanged as historical input.
- [x] Live starts with no fabricated roster. Apps register their name, run, and actual agents via `POST /api/apps/connect` or the SDK. The run picker shows app names. Dynamic agent creation, metadata changes, and removal are event-driven.
- [x] Validated structured progress snapshots: work state, completed items, waiting dependencies/blockers, next steps, and optional measured work counts. Waiting/blocked states must identify the missing dependency. Fractions are computed by the server, never generated by an LLM.
- [x] Inspector progress details, timestamps, and per-agent questions. Agent reports and Ollama summaries are labeled separately. Questions are disabled in demo/replay.
- [x] SQLite question inbox, per-run/agent scoping, 60-second delivery leases/reclaim, idempotent replies, conflict detection, and atomic answer-plus-progress event commits.
- [x] Python background question responder dispatches to the real app's read-only callbacks. Progress replies update the office through the existing durable live stream.
- [x] Optional Ollama `/api/tags` discovery and `/api/chat` explanation using the configured server. No independent cloud-provider fallback or automatic model download. Cloud-tagged models are labeled; model selection is explicit unless configured with an environment variable.
- [x] In-app connection guide, `docs/CONNECTING_APPS.md`, and a runnable real file-scanning app demonstrating dynamic registration, measured work, and progress questions.
- [x] Source checkout serves its current web build before packaged assets, avoiding stale UI after a rebuild.

New remaining items and operating limits:

- [ ] Automatic framework discovery/hooks remain future work: connected apps must emit events/progress or adapt their existing callbacks. A monitor cannot infer arbitrary app internals.
- [ ] Question callbacks must be thread-safe, read-only, safe to retry. Leases renew during long-running callbacks; application code should still bound its own work. Use `responder.register(agent_id, callback)` / `unregister(agent_id)` when workers join/leave; handler mapping changes are protected by a lock. An already-dispatched callback may finish after unregistering.
- [ ] Authentication and tenant isolation for the question bridge remain part of deployment hardening. Run/agent routing prevents accidental cross-run delivery but is not an authorization boundary.
- [x] Question cancellation, long-running callback lease renewal, a 200-pending-question quota per run, and last-five-answer callback context are implemented. Cancellation discards late results; arbitrary running callback code cannot be forcibly stopped.
- [ ] Ollama explanations use the latest 100 events for the selected agent and may misinterpret the record. They never modify authoritative progress. The user machine currently lists `gemma4:31b-cloud`; a true local model has not been installed by this implementation.
- [ ] Migration from the initial name is an explicit rename: use the new import, CLI, environment variables, and OTLP attribute names. Old SQLite telemetry can be opened via `AKSHAUHINI_DB`; old CLI/import aliases are not maintained.

Validation for this revision: **13 backend tests + 9 engine tests + 3 Chrome end-to-end tests passed (25 total)**. This includes the SDK polling responder, dynamic handler registration, question leases, idempotency, blocked-state updates, measured work fractions, Ollama request formatting/failure handling, dynamic roster rendering, and the full question/reply/live-progress UI flow. TypeScript/Vite build, UI packaging, renamed Python wheel build, wheel-content checks, and CLI smoke check passed. Screenshot reviewed at `docs/office-preview.png`.

Ollama availability was verified against the real local server using `ollama list`. It currently exposes `gemma4:31b-cloud`. Chat generation was tested with mocked Ollama HTTP responses; no cloud inference request or model download was performed. The application itself is ready to use a model selected by the user.

## Latest revision — workspace, routed findings and Request Studio

- [x] Workspace fills available width and height; Expand/Restore uses the full viewport, canvas resizes with its host, and long question dialogs scroll.
- [x] More detailed articulated people, expressive poses, task props, event-driven routing envelopes and speech. Decorative animation and paused replay timelines use replay time. Full sprite choreography and crowd avoidance remain open above.
- [x] Manager-to-specialist question routing, cycle protection, actual answer attribution, source finding cards, cancellation and renewable delivery leases. Global Ask manager displays the returned answer.
- [x] Durable Settings selectors for installed Ollama chat and optional embedding models, refresh and independent disable options. Models are not downloaded automatically.
- [x] Separate documented `sample_projects/request_studio` application with a request form, six dynamic workers, real source retrieval, shared archive queue, requirement checks, quote review and saved report artifacts.
- [x] Demo report UI, saved report and office artifact share identical output; progress follows real work and failures stop unfinished workers. Optional embeddings use Ollama `/api/embed`; optional chat synthesis is labeled interpretation.

Remaining limitations: embedding capability is checked when inference runs rather than filtered in the model list; real chat/embedding inference was not exercised (HTTP behavior is tested with mocked responses). General conversational reasoning is not claimed by the deterministic demo. Request Studio retains sessions in memory and reports on disk; restart recovery of its responders is future work. The separate Market Intelligence sample is outside this revision's verification. Production authentication and distributed execution remain open above.

Verification: 19 backend tests, 12 engine tests and 5 Chrome end-to-end tests cover routing, cancellation, settings persistence, resource contention, exact report output, full-window layout and model selectors. Final rerun passed: 19 backend tests, 12 engine tests, 5 Chrome tests (36 total), TypeScript/Vite production build, UI packaging, both main and Request Studio wheel builds, wheel-content/current-UI checks, and `git diff --check`. Ollama inference remains mocked in tests.

## Collector connection recovery

- [x] Diagnosed Request Studio connection refusal: collector was not running on port 8765. Started the local collector.
- [x] Missing-collector errors now show the configured endpoint, matching startup command and retry instructions; the demo displays the readable message instead of raw JSON.
- [x] Regression test covers an unavailable collector on a custom port. Demo and collector remain separate processes; keep both running.


## 2026-09-18 — Review of every module, and support for other multi-agent systems

Method: read every module; ran every suite; ran both sample apps; then connected a system that uses none of the built-in conventions (`examples/support_swarm_http.py`: plain HTTP, a `supervisor` instead of a `manager`, peer-to-peer handoffs, real-world tool names, 11 to 23 agents) and inspected the UI in Chrome before and after each fix. Before the review: 20 backend, 12 engine and 5 browser tests passed, but none of them exercised a system shaped differently from the built-in demo.

Result of the review: the core (protocol, store, collector, SDK, question bridge, resources, replay, Request Studio) is implemented as logged, except that Ollama inference is still only tested against mocked responses. The review found defects in the office view, the ingestion path, the CLI and the Market Intelligence sample. All are fixed below. Several scale limits remain and are listed after them.

### Found and fixed

- [x] **Layout at any team size.** Desks overlapped from the sixth agent (27 px apart on screen) and fell off the floor at 60. Desks are now allocated per agent, stay put when others leave, and a bullpen extends the floor as the team grows. The camera fits the grown floor unless the user has moved it.
- [x] **One definition of manager.** Layout, suit, Ask manager and Follow manager each used a different rule, so `supervisor`, `Manager` and `team_lead` behaved inconsistently or not at all, and two managers shared one desk. Matching is now by whole word, ignores case, and allows several managers.
- [x] **Tool stations.** `vector_search`, `rag_search` and `semantic_search` went to the web research terminal, and substring matches sent `average_calc` to the archive and `executive_summary` to engineering. Names are now matched by whole words with the archive checked before generic search. A producer can send `data.station` to decide.
- [x] **Unreachable approach slots.** With seven or more agents on one tool, three had a goal on furniture and showed "Querying records" without walking. Goals snap to the nearest free cell and slots stay near the station.
- [x] **Waiting is always visible as waiting.** A `task.waiting` reason such as "planner output" became the status text, so the badge, the animation and the footer count all missed it. It now reads "Waiting · planner output".
- [x] **Handoff completion from either side.** If the sender reported `handoff.completed`, it never returned to its desk and was labelled "Received folder" for the rest of the run, even after the run completed. Either agent may now report it.
- [x] **Replay of a large run.** Spreading every event timestamp into `Math.max` overflows the call stack somewhere above 120,000 events (measured: 120,000 passed, 150,000 failed) and blanks the page. Verified with a 200,000-event replay in Chrome.
- [x] **OTLP integers.** OTLP/JSON encodes int64 as a string, so token counts from spans were stored as text and never displayed. `intValue`, `doubleValue`, arrays and key/value lists are now decoded.
- [x] **Run identity.** The run picker used only the latest `run.started`, so a second one without an app name erased it. Identity is now merged across all of them.
- [x] **Extension events.** One event type unknown to the schema rejected the whole batch. Producers can now send `x.<vendor>.<name>` events, which are stored and replayed but never change agent or task state. `docs/aoep.schema.json` is regenerated and a test keeps it current.
- [x] **CLI on Windows.** `akshauhini run` crashed whenever no collector was running: Windows retries a closed loopback port for two seconds, so the one-second probe raised `ConnectTimeout`, which was not handled. Tested with a real run: lifecycle events and exit code are recorded.
- [x] **Market Intelligence sample.** `main.py` called `run_v2` on five modules that do not define it, crashed in every thread, and still printed "Pipeline complete" and emitted `run.completed`. The canned demo's routing answers used an unsupported key, so asking the orchestrator about sources never got an answer. Its `run.started` nested its data, hiding the app name. `pyproject.toml` named a build backend that does not exist. All fixed and re-run; the README no longer claims an LLM mode that does not exist.
- [x] **Docs.** A macOS absolute path was in the integration guide. The guide now has the event contract table and the rules above; the packaged copy is in sync. The README mentions Windows.
- [x] Added tests: 10 engine, 7 backend (foreign systems, CLI probe), 1 browser test that connects a 14-agent supervisor system.

Verification after the fixes: **27 backend, 22 engine, 6 Chrome end-to-end tests passed**; TypeScript and Vite build; wheel build with UI and guide checked; `akshauhini run` end to end; Market Intelligence run and a routed question answered; 200,000-event replay; support swarm at 11, 17 and 23 agents.

### Remaining limits found by this review

- [ ] **`/api/runs` and per-agent snapshots scale with total events.** With 200 runs of 5,000 events (1 million rows) `/api/runs` takes 2.3 s and holds the store lock the whole time, which stalls ingestion; each open tab polls it every 5 s. Fix: typed and indexed `type` and `agent_id` columns, plus a run summary table.
- [ ] **Large replays load slowly.** 200,000 events took 28 s to load in headless Chrome, a seek re-simulates the whole prefix, and the engine keeps every event and every event ID in memory. Needs server-side replay windows and checkpoints (already listed above), and a cap on the raw event list.
- [ ] **Standard OpenTelemetry is not consumed.** Spans that follow the GenAI conventions but lack `akshauhini.*` attributes return 200 and are dropped, and the Python OTLP exporter sends protobuf, which this collector rejects. This is the largest gap for zero-code support of other frameworks.
- [ ] **No framework adapters** (LangGraph, CrewAI, AutoGen, OpenAI Agents SDK). Integrators map their concepts through the SDK or HTTP using the table in the guide.
- [ ] **Per-frame vector redraw.** Every character is cleared and redrawn with about a hundred primitives on every frame. Not measured beyond 23 agents; expect a frame-rate cost above roughly 50.
- [ ] **Collector transport.** The live socket sends about eight idle frames a second per client and reads SQLite on the event loop.
- [ ] **Hardening beyond "no authentication".** There is no Host or Origin check, so a web page could reach a loopback collector by DNS rebinding and read telemetry. Add an allowed-host list and a token before any non-local use.
- [x] **Default database location.** Now `~/.akshauhini/akshauhini.sqlite` (override with `AKSHAUHINI_HOME`/`AKSHAUHINI_DB`), so one office serves every app on the machine.
- [ ] **Windows setup.** The browser tests default to the macOS Chrome path and start servers from `.venv/bin`; `npm run package-ui` calls `python3`, which on Windows is often the Store stub. Set `CHROME_PATH` and start the collector and Request Studio yourself, as done in this review.
- [x] Removed the unused `sample_projects/market_intelligence/agents/` folder, a leftover of an earlier barrier-based design that neither entrypoint used.
- [ ] Very dense floors still overlap name labels; there are no department zones.

### Suggested features, in order of value

1. **Zero-code ingestion.** Receive OTLP protobuf and gRPC, map the OpenTelemetry GenAI conventions (`invoke_agent`, `chat`, `execute_tool`, agent and tool names, conversation ID) and OpenInference, resolving each span to its agent through its parent span. Then thin, version-pinned adapters for LangGraph callbacks, CrewAI events, AutoGen and the OpenAI Agents SDK trace processor, each with recorded-event contract tests. A TypeScript SDK covers the JavaScript frameworks.
2. **Mission control across runs.** One page listing every live and recent run with status, duration, agent count, errors and stalls, so several systems can be watched at once. Add run status to the picker, search, delete, retention and export.
3. **Graph view beside the office.** Who handed to whom, edge weight by count and delay. Many frameworks are graph-shaped, and bottlenecks and loops show at once.
4. **Stalls, loops and alerts.** A "no events for N seconds" badge, repeated-tool-call loop detection, and a webhook or Slack alert on failure or stall.
5. **Run analytics.** Critical path, longest waits, queue time per tool, retries, and tokens and cost per agent and task with a price table. A run-level timeline next to the per-agent one.
6. **Scale.** Company, department and team zoom levels, level-of-detail rendering, virtualised task and team lists, and an aggregate view for hundreds of agents.
7. **Sharing.** Export and import a run as one file, and a self-contained replay page.
8. **Approvals.** Authenticated approve and reject actions for `human.requested`, behind the token above.
9. **Simulation mode** from the original plan, once replay metrics are trustworthy.
10. **Opt-in message capture** with redaction hooks, so speech bubbles can show real content when the operator chooses.

## 2026-11-10 — Agents at their own desks, and a flat 8-bit theme

### Desk mapping

Measured by stepping the engine every 50 ms and checking where each agent sat while working at its desk: the demo was clean, but a 6-agent and a 14-agent supervisor system had 68 and 74 samples of an agent working off its seat. Causes and fixes:

- [x] **Visitors took the owner's seat.** A manager delivering a task stood on the worker's exact seat whenever the worker was away, so the worker came back and worked beside its desk. A seat is now reserved for its owner. Visitors stand beside the desk (`VISITOR_SLOTS`), and no approach slot anywhere can land on another agent's seat.
- [x] **Unacknowledged delegation.** Without `task.accepted`, a manager stayed at the last worker's desk forever. It now returns to its own desk after 2.5 s.
- [x] **Nothing brought agents home.** After a failed tool call or a finished station visit, an agent stayed at the station. An idle agent away from its desk now walks back.
- [x] **Desks on stations.** Manager desks 4 and 6 were exactly on Research and Knowledge Vault, and the middle row overlapped the Collab Dome and Human Telemetry on screen. The seats now come from `MANAGER_SEATS` and `WORKER_SEATS`, which are clear of every station on screen, followed by the bullpen as before.
- [x] **Role changes.** An agent whose desk moved because its role changed now walks to the new desk.
- [x] **Desks are drawn.** Each assigned seat has a desk with a computer and the owner's personal item. The owner sits behind it, with no floating laptop. An empty desk shows its owner's name.
- [x] Tests: the agent works only at its own desk in a supervisor system that never accepts; a visitor stands beside an empty desk; no desk is within 90 px of a station on screen; an agent returns after a station visit. Three of the four fail on the previous engine.

After the fix, both swarms have 0 off-seat samples.

### Pixel theme

- [x] New `pixel` colour theme ("Pixel · flat 2D, 8-bit"), drawn by `FlatOffice.tsx` instead of the isometric renderer. It uses the same engine and grid: a top-down floor plan with wooden tables and computers, server racks, bookshelves, a help desk and a meeting table. Agents are 10 × 14 pixel sprites with front, back and side views, a two-frame walk, a typing pose at the desk, and state icons. It keeps selection, follow, fit, pan and zoom, walked paths, message arcs, question bubbles and agent size. Labels step aside instead of overprinting. Labels use Press Start 2P, with a monospace fallback when offline.
- [x] Page chrome tokens for the theme in `style.css`.

Verification: 33 engine tests, TypeScript and Vite build, UI packaged; Chrome screenshots of the demo in the pixel, cool, retro and light themes. The Chrome end-to-end suite was not run: the running Docker collector on :8765 still serves the previous UI image.

## 2026-11-10 — More office themes and a dataflow view

- [x] **Four more flat themes**, all drawn by `FlatOffice.tsx` from the same engine and grid. The art is original; only the styles follow the references.
  - `studio`: a front-view office at night on carpet tiles. Agents wear headsets and sit behind their desks. The CRTs glow, and each desk's LED plate shows the agent's current task. Speech bubbles name the tool in use, with an icon. The lead sits on a red rug. The wall boards are live: the clock shows the run's time, the whiteboard lists real tasks, the "top agent" is whoever completed the most tasks, and the safety sign counts tool calls since the last error.
  - `cozy`: a warm room plan with a lounge, meeting room, workshop and server room. Agents have orange name pills, and a halo shows around anyone at work. A live sprint board (TODO / DOING / DONE) hangs on the back wall.
  - `midnight`: dark, minimal tagged rooms. They include a boss room and a canteen. Orchestration links run between the desks of agents that handed work to each other, and a sprint-wall card shows tasks closed, in progress, agents working, waiting on you, and errors.
  - `rpg`: a 3/4-view RPG office. It has wood planks, navy walls with heavy outlines, a bookshelf back wall, a blue-carpet lounge with red sofas, a checkered floor, beige CRTs and green stools, and outlined big-head sprites. *(Superseded 2026-11-26, see below.)*
  - The room walls are decorative. Pathfinding does not know about them, so the doorways sit where agents' paths cross.
- [x] **Dataflow view**, with an Office / Dataflow switch in the scene header (`Dataflow.tsx`). Agents and tools are cards in lanes. Leads (managers) come first, then each agent one lane after whoever first handed it work, then the tools. Assignments, handoffs, messages, routed questions and tool calls are dotted edges with count pills. They animate while their last event is under 5 s old, and failed tool calls are red. Clicking a card selects the agent.
- [x] Tests: 3 for the dataflow graph (lanes, tool aggregation, every demo handoff). 36 tests pass in total.

Verification: TypeScript and Vite build, UI packaged, Chrome screenshots of the demo in every new theme and in the dataflow view.

## 2026-11-26 — Own palette for the RPG theme

- [x] The `rpg` theme now uses its own "forest lodge" palette: sandstone flagstone floor, moss-green walls and page chrome, a terracotta-rug lounge with ochre sofas, a plum meeting room, slate server tiles, walnut desks with slate monitors and amber screens, and terracotta stools. The genre conventions stay (3/4 view, heavy outlines, big-head sprites). The art was always drawn in code; no assets were ever copied.

## 2026-11-26 — License and notices

- [x] Licensed under PolyForm Noncommercial 1.0.0 (free for research, education, personal and non-commercial use), replacing MIT before the first public release. `pyproject.toml` declares `License-Expression: PolyForm-Noncommercial-1.0.0`.
- [x] `akshauhini/THIRD_PARTY_NOTICES.md` lists the license of every package bundled into the UI (React, PixiJS and 11 dependencies) and the vendored Lucide icons. `scripts/package_ui.py` regenerates it on every UI build, and `scripts/check_dist.py` fails a wheel without it or without LICENSE.
- [x] README: license summary and a note that fonts load from Google Fonts.

## 2026-11-26 — Apache License 2.0

- [x] Relicensed to the Apache License 2.0 before the first public release, replacing the short-lived PolyForm Noncommercial choice: free for everyone, including commercial use. `LICENSE` is the verbatim Apache text (so GitHub detects it), `NOTICE` holds the copyright line and points to the third-party notices, and `pyproject.toml` declares `license = "Apache-2.0"` with both files in `license-files`.

## Insights, LLM tracing and LLM evaluation (0.2.0)

- [x] `akshauhini/insights.py` answers, per run and per project, from recorded events only: stuck agents (open LLM/tool calls, reported waiting/blocked, pending human approval, tool queues, silent agents with open work), latency by agent, back-and-forth loops per task, the first failure and what followed, token use and cost by agent and model, and a version-vs-previous-version comparison (success rate, duration, LLM latency, tokens, evaluation scores and pass rates, with regression thresholds and a small-sample warning).
- [x] Served by `GET /api/insights/runs/{run_id}` and `GET /api/insights/project`, printed by `akshauhini insights`, and shown in the office's Insights panel (key `I`) with the LLM call trace and evaluations.
- [x] SDK: `init(..., version=)`, `AKSHAUHINI_APP_VERSION`, automatic git commit; `office.llm(...)` traces calls (prompts/responses only when capture is enabled, clipped to 4,000 characters); `office.evaluate(...)` records `eval.recorded`; runs from `init()`/`with Office(app_id=...)` now end with `run.completed`/`run.failed`.
- [ ] Natural-language questions over Insights with a local model, and alerting when a regression is detected.
