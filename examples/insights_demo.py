"""A simulated support desk that gives every Insights question something to find. No model credentials needed.

Run:  python examples/insights_demo.py
Then open the office, pick "Support Desk" and press I (or click Insights).

It records three runs of version 1.0 and three of version 1.1. Version 1.1 is deliberately worse: its researcher is
slower and uses more tokens, the triage agent and the researcher bounce questions back and forth, the answer checks
fail more often, and one run crashes on a rate-limited search tool. The LLM calls are simulated (time.sleep) but are
traced exactly like real ones, through office.llm(...), and graded with office.evaluate(...).
"""
import random
import time

import akshauhini

AGENTS = [
    {"agent_id": "triage", "name": "Triage", "role": "manager", "department": "Support"},
    {"agent_id": "researcher", "name": "Researcher", "role": "researcher", "department": "Knowledge"},
    {"agent_id": "writer", "name": "Writer", "role": "writer", "department": "Support"},
]
TICKETS = ["Refund for a duplicate charge", "Cannot export reports to CSV", "Password reset email never arrives"]


def fake_llm(office, agent, model, prompt, seconds, tokens_in, tokens_out, task):
    with office.llm(agent, model, task_id=task, prompt=prompt) as call:
        time.sleep(seconds)
        call.update(response=f"[{model}] answer to: {prompt[:40]}", input_tokens=tokens_in, output_tokens=tokens_out,
                    cost_usd=round((tokens_in * 0.15 + tokens_out * 0.6) / 1e6, 6))
        return call["response"]


def handle(office, version, ticket, crash=False):
    newer = version == "1.1"
    task = f"ticket-{TICKETS.index(ticket)}"
    office.emit("task.created", "triage", task, title=ticket)
    office.emit("task.assigned", "triage", task, target_agent_id="researcher")
    office.emit("task.accepted", "researcher", task)
    # 1.1 lost a routing rule: triage and the researcher keep asking each other for clarification.
    for _ in range(4 if newer else 1):
        office.emit("message.sent", "triage", task, target_agent_id="researcher", text="Which product area is this?")
        office.emit("message.sent", "researcher", task, target_agent_id="triage", text="Unclear, please clarify.")
    with office.operation("tool.call", "researcher", task, tool="kb_search") as metrics:
        time.sleep(0.05)
        if crash:
            office.emit("tool.retry", "researcher", task, tool="kb_search", attempt=2)
            raise RuntimeError("kb_search: HTTP 429 Too Many Requests (rate limited)")
        metrics["results"] = 3
    fake_llm(office, "researcher", "gpt-4o" if newer else "gpt-4o-mini", f"Summarise the knowledge base hits for: {ticket}",
             0.45 if newer else 0.15, 5200 if newer else 1800, 400 if newer else 250, task)
    office.emit("handoff.started", "researcher", task, target_agent_id="writer")
    office.emit("handoff.completed", "writer", task, target_agent_id="writer")
    reply = fake_llm(office, "writer", "gpt-4o-mini", f"Write a reply to the customer about: {ticket}", 0.1, 900, 300, task)
    grounded = random.random() > (0.6 if newer else 0.05)
    office.evaluate("answer_grounded", passed=grounded, agent_id="writer", task_id=task, evaluator="citation_check",
                    reason=None if grounded else "Reply cites no knowledge-base article", actual=reply)
    office.evaluate("tone", score=round(random.uniform(0.6, 0.8) if newer else random.uniform(0.8, 0.95), 2), threshold=0.75,
                    agent_id="writer", task_id=task, evaluator="llm_judge")
    office.emit("task.completed", "writer", task)


def main():
    random.seed(7)
    for version, runs in (("1.0", 3), ("1.1", 3)):
        for i in range(runs):
            crash = version == "1.1" and i == 1
            office = akshauhini.init("support-desk", "Support Desk", agents=AGENTS, version=version, capture_content=True)
            try:
                with office:
                    for ticket in TICKETS:
                        handle(office, version, ticket, crash=crash and ticket == TICKETS[1])
            except RuntimeError as exc:
                print(f"version {version} run {i + 1} failed as intended: {exc}")
    print("Done. Open the office, choose 'Support Desk', and press I for Insights.")


if __name__ == "__main__":
    main()
