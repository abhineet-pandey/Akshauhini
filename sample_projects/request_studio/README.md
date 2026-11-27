# Request Studio — live, request-driven Akshauhini demo

A separate agentic application with its own web page, request API, workflow, source documents and saved output directory. Users submit a question and requirements; a manager coordinates two evidence workers, an analyst, a reviewer and a writer. It streams actual work to Akshauhini and continues answering questions after the report completes.

The default source documents contain **fictional Atlas/Beacon product facts**, clearly labeled as demo data. The work is real document retrieval, source comparison, citation checking and file generation. No fake web searches, random percentages, invented human approvals or artificial delays are used.

## Start both apps

From the Akshauhini repository root, after installing dependencies and building the UI as described in its README:

Terminal 1:

```bash
.venv/bin/akshauhini serve
```

Terminal 2:

```bash
.venv/bin/python sample_projects/request_studio/run.py
```

- Demo request form: **http://127.0.0.1:8766**
- Office monitor: **http://127.0.0.1:8765**

Enter your request and one requirement per line. Optionally paste your own source text, replacing the fictional bundled documents. Click **Send request to the team**, then **Watch the office & ask the manager**. In Akshauhini select an agent, use **Ask manager**, or open **Ask agents**. Short CPU-only requests may finish quickly; use Replay to inspect the exact event history without manufacturing runtime delays.

Example requests:

- “Compare Atlas and Beacon for offline editing and CSV exports.” Requirements: “offline editing”, “CSV exports”, “reviewer approval”, “identify missing pricing”.
- Paste your own policy/project notes and ask “Which requirements are covered, and what evidence is missing?”
- Ask the manager “Which sources support offline editing?” after completion. It routes the question to the evidence specialist and returns exact source excerpts.

## Optional Ollama models and embeddings

In Akshauhini open **Settings** (gear icon):

1. Refresh installed models from your configured Ollama server.
2. Select a chat/reasoning model, an embedding-capable model, or disable either independently.
3. Save. Choices persist in the collector's SQLite database.
4. In this demo check **Use Akshauhini’s saved chat and embedding model settings** before submitting a new request.

The optional chat-model field overrides the saved chat selection for that request. An embedding selection enables real `/api/embed` vector retrieval, ranked by cosine similarity, retaining exact source IDs and quotes. Without embeddings the app uses deterministic keyword retrieval. Without a chat model the final report contains the retrieved evidence and requirement checks; with a chat model it additionally contains an explicitly labeled Ollama synthesis.

Models are never automatically downloaded. An incompatible/unavailable embedding or chat model fails the request visibly instead of silently substituting another provider. Cloud-tagged Ollama models may process supplied documents through Ollama's cloud service. Saved model changes affect **new requests**, not work already running.

Configuration:

```bash
.venv/bin/python sample_projects/request_studio/run.py \
  --port 8766 \
  --collector http://127.0.0.1:8765 \
  --output-dir sample_projects/request_studio/outputs
```

`AKSHAUHINI_OLLAMA_URL` configures the Ollama server for direct model overrides. Requests using saved settings use the collector's configured URL. The default is `http://127.0.0.1:11434`.

## How the workflow maps to the office

| Actual work | Office behavior / output |
| --- | --- |
| App registers its six workers | Dynamic roster and characters, scoped to the run |
| Manager assigns retrieval | Task folders and assignment events |
| Two workers access one shared archive | Actual FIFO queue, capacity and waiting-agent display |
| Keyword or embedding retrieval | Archive/tool animations; source evidence artifacts |
| Analyst checks each requirement | Measured completed requirement count |
| Reviewer checks exact quote fidelity | Review events; missing evidence stays explicit |
| Writer saves report | Versioned report artifact with source lineage |
| Manager receives result | Completed request; manager remains available for questions |
| Manager routes a user question | `question.routed` event, walking/envelope animation and routing trace |
| Specialist answers with source excerpts | `question.answered`, answer-return animation and cited findings |

The report displayed in this demo, the saved `report.md`, and the `report` artifact shown under Akshauhini’s **Findings & artifacts** panel use the same content string. Tests assert this equality. Worker progress snapshots are distinct from the manager's overall request task, so a completed research stage does not prematurely mark the overall request complete.

## Project files

```text
request_studio/
├── README.md
├── pyproject.toml
├── run.py
├── studio/
│   ├── app.py          # request API and lifetime management
│   ├── workflow.py     # real work, routing callbacks and telemetry
│   ├── embeddings.py   # optional Ollama vector retrieval
│   ├── index.html      # request form and live result viewer
│   └── sources/        # clearly fictional demonstration documents
└── outputs/<run-id>/   # generated, ignored by git
    ├── request.json
    ├── findings.json
    └── report.md
```

The project can also be installed with `pip install -e sample_projects/request_studio` after installing Akshauhini. Then run `request-studio --output-dir ./studio-outputs`; use a writable output directory when installing outside this source checkout.

## API

`POST /api/requests`:

```json
{
  "request": "Compare offline editing support",
  "requirements": ["offline editing", "CSV exports"],
  "documents": "Atlas supports offline editing.\nAtlas exports CSV.",
  "use_saved_models": false,
  "model": null
}
```

Returns `run_id`, `monitor_url`, initial status, request, requirements and model configuration. Poll `GET /api/requests/{run_id}` for current status, report, findings and any error. `GET /api/requests` lists the current demo process's sessions. Output files survive restarts; in-memory sessions and question responders do not.

## Question behavior

Manager routing is transparent, deterministic keyword routing, not an unreported LLM action. Source/evidence questions go to Research, requirement/risk questions to Quality, comparison questions to Analysis, and report questions to Editorial. General workflow questions are answered by the manager. Specialist replies quote findings from the actual current run. They do not have access to external sources beyond the supplied documents.

The SDK dispatches each agent's callback independently, renews question leases during execution, accepts cancellation, and attaches the last five answered questions as context. This demo uses the current question and recorded findings; it does not claim general conversational reasoning in deterministic mode. Structured progress in a response updates the same agent's work status. Cancelled questions cannot commit a late reply or progress event.

## Verification

From the parent repository:

```bash
.venv/bin/pytest -q tests/test_resources_demo.py tests/test_routing_settings.py
cd web
npm run test:e2e
```

Tests cover real resource contention, exact saved/visualized report equality, manager routing and cited findings, optional embedding request/response handling, saved model settings, question cancellation, and browser submission through to the final report.

## Limits

- Keyword and vector matches are **candidate evidence**, not proof that a requirement is satisfied. The report states this, preserves conflicting/negative source statements, and flags missing information.
- Review verifies quote fidelity. Optional Ollama prose is separately labeled model interpretation, not an independently verified factual conclusion.
- Embedding mode accepts at most 200 nonempty source lines per document batch and sends input in batches of 32 with truncation disabled.
- At most 20 sessions per demo process, with three concurrently executing request workflows. Restart the demo to reset in-memory sessions; output files remain.
- No external browsing, account access, deployments, or write actions outside the chosen output directory. The apps bind to loopback and do not implement multi-user authentication.
