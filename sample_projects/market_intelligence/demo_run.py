"""
Market Intelligence — Canned Demo Runner
=========================================
Runs a fully realistic 5-agent market research simulation using the
Akshauhini SDK. No API keys needed — all tool calls and LLM operations
use realistic mock implementations with natural delays.

Usage:
    python demo_run.py
    python demo_run.py --query "Electric vehicle market trends"
    python demo_run.py --fast        # Run with compressed timings (5x faster)
    python demo_run.py --endpoint http://localhost:8765

What you'll see in the Akshauhini UI (http://localhost:8765):
    - 5 agents appearing and moving around the office
    - Web Researcher walking to the Research station and using tools
    - Data Analyst cross-referencing at the Engineering station
    - Report Writer typing at their desk
    - Orchestrator walking between agents, routing messages
    - Quality Reviewer at the Human Review station
    - Speech bubbles for question routing
    - Progress bars and status updates in the inspector
    - Artifacts visible in the Findings panel
    - Ask any agent questions using the ? button!
"""
import argparse
import os
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from akshauhini import Office
from tools.search import web_search, scrape_page
from tools.analyze import cross_reference, sentiment_score


def _s(seconds: float, fast: bool) -> float:
    """Apply speed multiplier."""
    return seconds / (5.0 if fast else 1.0)


def run_demo(query: str = "Global AI enterprise adoption trends 2025",
             endpoint: str = "http://127.0.0.1:8765",
             fast: bool = False) -> None:

    print(f"\n{'='*58}")
    print(f"  Market Intelligence Demo")
    print(f"  Query: {query}")
    print(f"  UI:    {endpoint}")
    print(f"  Mode:  {'Fast (5×)' if fast else 'Realistic'}")
    print(f"{'='*58}\n")

    with Office(endpoint=endpoint, app_id="market-intelligence", app_name="Market Intelligence") as office:

        # ── Register all agents ────────────────────────────────────────────
        for agent_id, name, role, dept in [
            ("orchestrator", "Morgan", "manager",    "Operations"),
            ("researcher",   "Riley",  "researcher", "Research"),
            ("analyst",      "Alex",   "analyst",    "Intelligence"),
            ("writer",       "Wren",   "writer",     "Editorial"),
            ("reviewer",     "Robin",  "reviewer",   "Quality"),
        ]:
            office.agent(agent_id, name=name, role=role, department=dept, model="demo-mock")

        office.emit("run.started", title=f"Market Intelligence: {query}")

        main_task = "mi-main"
        office.emit("task.created", "orchestrator", main_task, title=f"Market intelligence: {query}")
        office.emit("task.assigned", "orchestrator", main_task, target_agent_id="orchestrator")

        results_store: dict = {}
        analyst_done  = threading.Event()
        writer_done   = threading.Event()
        reviewer_done = threading.Event()

        # ── Question handlers (wired via answer_questions) ─────────────────
        def orchestrator_q(q, _=None):
            ql = q.lower()
            if any(w in ql for w in ["source","search","web","found","url","scrape"]):
                return {"route_to":"researcher", "reason":"The Web Researcher collected the sources."}
            if any(w in ql for w in ["sentiment","theme","analysis","insight","cross"]):
                return {"route_to":"analyst", "reason":"The Data Analyst handled the cross-referencing."}
            if any(w in ql for w in ["report","draft","written","document"]):
                return {"route_to":"writer", "reason":"The Report Writer drafted the final report."}
            return {"answer":f"I'm Morgan, the Orchestrator. I'm managing a 5-stage pipeline for: {query}. Current stage depends on timing — check the task board for live status."}

        def researcher_q(q, _=None):
            ql = q.lower()
            if any(w in ql for w in ["source","found","how many","count"]):
                return {"answer":"I found 5 web sources and scraped content from the top 3 articles.", "findings":[
                    {"source_id":"web_search","title":"Top results","excerpt":"5 market-relevant sources identified via web_search tool."},
                    {"source_id":"scrape_page","title":"Article content","excerpt":"3 articles scraped for full content (word counts: ~400 words each)."},
                ]}
            return {"answer":"I'm Riley, the Web Researcher. I used web_search and scrape_page tools to collect market data. Ask me about specific sources!"}

        def analyst_q(q, _=None):
            ql = q.lower()
            if "sentiment" in ql or "positive" in ql:
                return {"answer":"Overall market sentiment is POSITIVE (polarity +0.42, confidence 87%). Consumer confidence is at a 3-year high.", "findings":[
                    {"source_id":"sentiment_score","title":"Sentiment Result","excerpt":"Positive · polarity +0.42 · confidence 87%"},
                ]}
            if any(w in ql for w in ["theme","finding","key","insight","main"]):
                return {"answer":"4 key themes found: (1) Growth via tech adoption, (2) Regulatory compliance pressure, (3) Positive consumer confidence, (4) Improved supply chain resilience. Confidence: 83%.", "findings":[
                    {"source_id":"cross_reference","title":"Theme Analysis","excerpt":"4 themes across 5 sources · 83% confidence"},
                ]}
            return {"answer":"I'm Alex, the Data Analyst. I cross-referenced all 5 sources and ran sentiment analysis. Overall: positive market outlook with 83% confidence."}

        def writer_q(q, _=None):
            if any(w in q.lower() for w in ["done","ready","complete","recommendation"]):
                return {"answer":"The report is complete! It covers executive summary, 4 key themes, sentiment table, and strategic recommendations including: accelerate adoption, budget for compliance, address data gaps, and prioritise supply chain resilience."}
            return {"answer":"I'm Wren, the Report Writer. I drafted a structured markdown report using the analyst's findings. Check the Findings & Artifacts panel to read it!"}

        def reviewer_q(q, _=None):
            return {"answer":"I'm Robin, the Quality Reviewer. I checked the report for accuracy, source grounding, and recommendation quality. It passed AI review and received human stakeholder approval."}

        handlers = {
            "orchestrator": orchestrator_q,
            "researcher":   researcher_q,
            "analyst":      analyst_q,
            "writer":       writer_q,
            "reviewer":     reviewer_q,
        }

        with office.answer_questions(handlers):

            def run_orchestrator():
                office.emit("task.accepted", "orchestrator", main_task)
                with office.operation("llm", "orchestrator", main_task, model="demo-planner"):
                    time.sleep(_s(3.5, fast))

                research_task = f"{main_task}-research"
                office.emit("task.created",  "orchestrator", research_task, title="Collect web sources")
                office.emit("task.assigned",  "orchestrator", research_task, target_agent_id="researcher")

                office.progress("orchestrator", state="working", summary="Pipeline planned. Monitoring research phase.",
                    task_id=main_task,
                    completed_items=["Pipeline planned","Research task delegated"],
                    next_steps=["Await research","Commission analysis"])

                analyst_done.wait()

                writer_task = f"{main_task}-report"
                office.emit("task.created",  "orchestrator", writer_task, title="Write market intelligence report")
                office.emit("task.assigned",  "orchestrator", writer_task, target_agent_id="writer")

                office.progress("orchestrator", state="working", summary="Research+analysis done. Writing commissioned.",
                    task_id=main_task,
                    completed_items=["Pipeline planned","Research complete","Analysis complete"],
                    next_steps=["Await report","Assign review"])

                writer_done.wait()

                review_task = f"{main_task}-review"
                office.emit("task.created",  "orchestrator", review_task, title="Quality review and approval")
                office.emit("task.assigned",  "orchestrator", review_task, target_agent_id="reviewer")

                reviewer_done.wait()

                office.emit("task.completed", "orchestrator", main_task)
                office.progress("orchestrator", state="completed", summary=f"Pipeline complete for: {query}",
                    task_id=main_task,
                    completed_items=["Web research","Data analysis","Report writing","Quality review","Human approval"],
                    waiting_for=[], next_steps=[])

            def run_researcher():
                research_task = f"{main_task}-research"
                time.sleep(_s(1.5, fast))
                office.emit("task.accepted", "researcher", research_task)
                office.emit("task.started",  "researcher", research_task, title="Collect web sources")
                office.progress("researcher", state="working", summary="Starting web search.",
                    task_id=research_task, next_steps=["Search","Scrape","Synthesise"])

                sources = []
                with office.operation("tool.call", "researcher", research_task, tool="web_search") as m:
                    sources = web_search(query, 5)
                    m["result_count"] = len(sources)

                scraped = []
                for i, r in enumerate(sources[:3]):
                    with office.operation("tool.call", "researcher", research_task, tool="scrape_page") as m:
                        page = scrape_page(r["url"])
                        scraped.append(page)
                        m["url"] = r["url"]
                    office.progress("researcher", state="working", summary=f"Scraped {i+1}/3 articles.",
                        task_id=research_task, completed_units=i+1, total_units=5)

                with office.operation("llm", "researcher", research_task, model="demo-mock", input_tokens=12400) as m:
                    time.sleep(_s(4.0, fast))
                    m["output_tokens"] = 840

                source_text = "\n\n".join(f"## {r['title']}\n{r['snippet']}" for r in sources)
                office.artifact("researcher", research_task,
                    artifact_id=f"{main_task}-sources",
                    name="Source Collection",
                    content=f"# Research Sources for: {query}\n\n{source_text}")

                results_store["sources"] = sources
                results_store["scraped"] = scraped

                office.progress("researcher", state="completed", summary="Research complete. Findings handed to analyst.",
                    task_id=research_task,
                    completed_items=["Web search","Scraping","Synthesis","Artifact published"],
                    waiting_for=[], next_steps=[], completed_units=5, total_units=5)
                office.emit("task.completed", "researcher", research_task)
                office.emit("handoff.started",   "researcher", research_task, target_agent_id="analyst")
                time.sleep(_s(0.8, fast))
                office.emit("handoff.completed", "analyst",    research_task, target_agent_id="analyst")

            def run_analyst():
                research_task = f"{main_task}-research"
                time.sleep(_s(0.5, fast))

                # Wait for researcher to publish sources
                while "sources" not in results_store:
                    time.sleep(0.3)

                analysis_task = f"{main_task}-analysis"
                office.emit("task.created",  "analyst", analysis_task, title="Cross-reference and analyse sources")
                office.emit("task.accepted", "analyst", analysis_task)
                office.emit("task.started",  "analyst", analysis_task, title="Cross-reference and analyse sources")
                office.progress("analyst", state="working", summary="Received sources. Cross-referencing.",
                    task_id=analysis_task, next_steps=["Cross-reference","Sentiment","Synthesise"])

                sources = results_store["sources"]
                analysis = {}
                with office.operation("tool.call", "analyst", analysis_task, tool="cross_reference") as m:
                    analysis = cross_reference(sources)
                    m["confidence"] = analysis["confidence_score"]

                office.progress("analyst", state="working", summary="Cross-reference done. Running sentiment analysis.",
                    task_id=analysis_task,
                    completed_items=[f"Cross-referenced {len(sources)} sources"],
                    next_steps=["Sentiment analysis"], completed_units=1, total_units=3)

                combined = " ".join(s.get("snippet","") for s in sources)
                sentiment = {}
                with office.operation("tool.call", "analyst", analysis_task, tool="sentiment_score") as m:
                    sentiment = sentiment_score(combined)
                    m["sentiment"] = sentiment["sentiment"]

                # Team discussion
                time.sleep(_s(0.5, fast))
                office.emit("message.sent", "analyst", analysis_task,
                    target_agent_id="writer",
                    participants=["orchestrator","analyst","writer"],
                    message="Sharing findings with team before writing.")

                with office.operation("llm", "analyst", analysis_task, model="demo-mock", input_tokens=18600) as m:
                    time.sleep(_s(5.0, fast))
                    m["output_tokens"] = 1100

                themes_md = "\n".join(f"- {t}" for t in analysis["key_themes"])
                content = (
                    f"# Analysis Findings\n\n"
                    f"**Sentiment:** {sentiment['sentiment'].upper()} (polarity: {sentiment['polarity']:+.3f})\n\n"
                    f"## Key Themes\n{themes_md}\n\n"
                    f"**Confidence:** {analysis['confidence_score']:.0%}"
                )
                office.artifact("analyst", analysis_task,
                    artifact_id=f"{main_task}-analysis",
                    name="Analysis Findings",
                    content=content,
                    parent_ids=[f"{main_task}-sources"])

                results_store["analysis"]  = analysis
                results_store["sentiment"] = sentiment

                office.progress("analyst", state="completed", summary="Analysis complete.",
                    task_id=analysis_task,
                    completed_items=["Cross-reference","Sentiment","Findings artifact"],
                    waiting_for=[], next_steps=[], completed_units=3, total_units=3)
                office.emit("task.completed", "analyst", analysis_task)
                analyst_done.set()  # signal orchestrator

            def run_writer():
                writer_task = f"{main_task}-report"
                # Wait for writer task to be assigned
                while "analysis" not in results_store:
                    time.sleep(0.3)
                time.sleep(_s(1.0, fast))

                office.emit("task.accepted", "writer", writer_task)
                office.emit("task.started",  "writer", writer_task, title="Write market intelligence report")
                office.progress("writer", state="working", summary="Drafting report.",
                    task_id=writer_task, next_steps=["Outline","Write sections","Publish"])

                analysis = results_store.get("analysis", {})
                sentiment = results_store.get("sentiment", {})
                sources   = results_store.get("sources", [])

                with office.operation("llm", "writer", writer_task, model="demo-mock", input_tokens=7200) as m:
                    time.sleep(_s(3.0, fast))
                    m["output_tokens"] = 480

                with office.operation("llm", "writer", writer_task, model="demo-mock", input_tokens=9800) as m:
                    time.sleep(_s(6.0, fast))
                    m["output_tokens"] = 2400

                themes_md  = "\n".join(f"- {t}" for t in analysis.get("key_themes", ["Market growth"]))
                sources_md = "\n".join(f"- [{s['title']}]({s['url']})" for s in sources[:5])
                report = (
                    f"# Market Intelligence Report: {query}\n\n"
                    f"**Generated by the Akshauhini Multi-Agent Pipeline**\n\n"
                    f"## Executive Summary\n\n"
                    f"Overall market sentiment is **{sentiment.get('sentiment','positive').upper()}** "
                    f"(polarity {sentiment.get('polarity',0.42):+.3f}, confidence {sentiment.get('confidence',0.87):.0%}).\n\n"
                    f"## Key Themes\n\n{themes_md}\n\n"
                    f"## Strategic Recommendations\n\n"
                    f"1. Accelerate adoption in core segments\n"
                    f"2. Budget 15–20% of GTM spend for compliance readiness\n"
                    f"3. Address emerging market data gaps before next cycle\n"
                    f"4. Prioritise supply chain resilience\n\n"
                    f"## Sources\n\n{sources_md}\n"
                )
                office.artifact("writer", writer_task,
                    artifact_id=f"{main_task}-report",
                    name="Market Intelligence Report.md",
                    content=report,
                    parent_ids=[f"{main_task}-analysis", f"{main_task}-sources"])
                results_store["report"] = report

                office.progress("writer", state="completed", summary="Report published.",
                    task_id=writer_task,
                    completed_items=["Outline","Executive summary","Key sections","Artifact"],
                    waiting_for=[], next_steps=[], completed_units=3, total_units=3)
                office.emit("task.completed", "writer", writer_task)
                writer_done.set()

            def run_reviewer():
                review_task = f"{main_task}-review"
                while "report" not in results_store:
                    time.sleep(0.3)
                time.sleep(_s(0.5, fast))

                office.emit("task.accepted",  "reviewer", review_task)
                office.emit("review.started", "reviewer", review_task)
                office.progress("reviewer", state="working", summary="Reading report for quality check.",
                    task_id=review_task, next_steps=["Check accuracy","Validate sources","Approve"])

                with office.operation("llm", "reviewer", review_task, model="demo-mock", input_tokens=3800) as m:
                    time.sleep(_s(4.5, fast))
                    m["output_tokens"] = 360

                time.sleep(_s(1.5, fast))
                office.emit("review.approved", "reviewer", review_task)
                office.emit("human.requested", "reviewer", review_task)
                office.progress("reviewer", state="waiting", summary="AI approved. Awaiting human sign-off.",
                    task_id=review_task,
                    completed_items=["Quality review","AI approval"],
                    waiting_for=["Human stakeholder approval"])

                time.sleep(_s(3.0, fast))
                office.emit("human.approved", "reviewer", review_task)

                office.progress("reviewer", state="completed", summary="Human approved. Pipeline complete.",
                    task_id=review_task,
                    completed_items=["Quality review","AI approval","Human approval"],
                    waiting_for=[], next_steps=[], completed_units=3, total_units=3)
                office.emit("task.completed", "reviewer", review_task)
                reviewer_done.set()

            # Launch all threads
            threads = [
                threading.Thread(target=run_orchestrator, name="orchestrator", daemon=True),
                threading.Thread(target=run_researcher,   name="researcher",   daemon=True),
                threading.Thread(target=run_analyst,      name="analyst",      daemon=True),
                threading.Thread(target=run_writer,       name="writer",       daemon=True),
                threading.Thread(target=run_reviewer,     name="reviewer",     daemon=True),
            ]
            for t in threads:
                print(f"  ▶ Starting {t.name}…")
                t.start()

            print(f"\n  All agents running. Open {endpoint} → Live mode")
            print(f"  Press ? in the UI to ask agents questions!\n")
            for t in threads:
                t.join()

        office.emit("run.completed")
        print(f"\n{'='*58}")
        print(f"  ✅ Demo complete!")
        print(f"  View the report in: Findings & Artifacts panel")
        print(f"  UI: {endpoint}")
        print(f"{'='*58}\n")


if __name__ == "__main__":
    # A redirected stdout on Windows uses a legacy code page; never let a banner glyph crash the run.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Market Intelligence Demo (no API keys required)")
    parser.add_argument("--query",    default="Global AI enterprise adoption trends 2025",
                        help="Research query")
    parser.add_argument("--endpoint", default=os.getenv("AKSHAUHINI_ENDPOINT", "http://127.0.0.1:8765"),
                        help="Akshauhini collector endpoint")
    parser.add_argument("--fast",     action="store_true",
                        help="Run with 5× compressed timings")
    args = parser.parse_args()
    run_demo(args.query, args.endpoint, args.fast)
