# Market Intelligence System — Sample Project

A realistic **multi-agent market research pipeline** built with the Akshauhini SDK.
Run it to see 5 agents working live in the Akshauhini office visualizer.

---

## 🏗️ Architecture

```
User Query
    │
    ▼
┌───────────────┐
│  Orchestrator  │  Plans work, delegates tasks, answers questions
│  (manager)     │
└───────┬───────┘
        │ delegates
   ┌────┴──────────────────────────┐
   │                               │
   ▼                               ▼
┌──────────────┐         ┌──────────────────┐
│ Web Researcher│         │  Data Analyst     │
│  (researcher) │         │  (analyst)        │
│  web_search   │         │  cross_reference  │
│  scrape_page  │         │  sentiment        │
└──────┬───────┘         └────────┬─────────┘
       │ handoff findings          │ handoff analysis
       └─────────────┬────────────┘
                     ▼
           ┌─────────────────┐
           │  Report Writer   │
           │  (writer)        │
           └────────┬────────┘
                    │ handoff draft
                    ▼
           ┌─────────────────┐
           │ Quality Reviewer │
           │  (reviewer)      │
           │  human gate      │
           └─────────────────┘
```

### Agents

| Agent | Role | Department | Tools |
|-------|------|------------|-------|
| Orchestrator | manager | Operations | delegates, questions |
| Web Researcher | researcher | Research | web_search, scrape_page |
| Data Analyst | analyst | Intelligence | cross_reference, sentiment_score |
| Report Writer | writer | Editorial | write_markdown |
| Quality Reviewer | reviewer | Quality | review_report, human gate |

---

## ⚡ Quickstart

### 1. Start the Akshauhini server (from project root)
```bash
cd /path/to/Akshauhini
source .venv/bin/activate
akshauhini serve
```

### 2. Open the UI
Visit http://localhost:8765 → switch to **Live** mode

### 3. Run the demo (no API keys needed!)
```bash
cd sample_projects/market_intelligence
pip install -e ".[demo]"
python demo_run.py
```

Or run it with your own query. `main.py` runs the same pipeline as `demo_run.py`; the search and analysis tools are mock implementations and no LLM is called:
```bash
python main.py --query "Electric vehicle market trends 2025"
python main.py --query "Electric vehicle market trends 2025" --fast   # 5x compressed timings
```

---

## 📁 Project Structure

```
market_intelligence/
├── README.md              ← You are here
├── pyproject.toml         ← Dependencies
├── main.py                ← Full pipeline entrypoint
├── demo_run.py            ← Canned demo (no LLM needed)
└── tools/
    ├── __init__.py
    ├── search.py          ← Mock web search
    └── analyze.py         ← Mock analysis tools
```

---

## 💬 Asking questions in the UI

Once the demo is running, you can ask agents questions in the Akshauhini UI:

1. Click an agent on the office floor to select them
2. Scroll down in the inspector to **"ASK THIS AGENT"**
3. Type your question and click **Ask agent**
4. The orchestrator will route topic-specific questions to the right specialist

Example questions:
- *"What sources did you find?"* → Web Researcher answers
- *"Is the sentiment positive or negative?"* → Data Analyst answers
- *"What's the key finding?"* → Orchestrator routes to Data Analyst
- *"When will the report be ready?"* → Orchestrator answers directly

---

## 🔧 Configuration

Environment variables:
```bash
AKSHAUHINI_ENDPOINT=http://127.0.0.1:8765   # Collector endpoint
AKSHAUHINI_RUN_ID=my-custom-run-id          # Optional: fixed run ID
```

---

## 📡 Events emitted

The demo emits these Akshauhini event types:
- `run.started` / `run.completed`
- `agent.created` for all 5 agents
- `task.created`, `task.assigned`, `task.accepted`, `task.started`, `task.completed`
- `llm.started` / `llm.completed`
- `tool.call.started` / `tool.call.completed` / `tool.call.failed`
- `handoff.started` / `handoff.completed`
- `message.sent` (group discussions)
- `artifact.created` (research brief, final report)
- `review.started` / `review.approved`
- `human.requested` / `human.approved`
- `agent.progress` (structured progress reports)
- `question.asked` / `question.routed` / `question.answered`
