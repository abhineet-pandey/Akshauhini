"""A different kind of multi-agent system, connected with plain HTTP and no Akshauhini SDK.

A customer-support swarm: a supervisor router, triage agents, specialists that hand tickets to each
other peer-to-peer, and a reviewer. Nothing here is specific to Akshauhini's built-in samples:

  * the routing agent has the role "supervisor", not "manager"
  * specialists hand work to each other directly, and the sender reports handoff.completed
  * tools have real-world names (vector_search, postgres_query, bash, send_email)
  * a ticket waits for a customer with a free-text reason
  * --scale grows the specialist teams, to show a large office

    python examples/support_swarm_http.py --scale 2        # 17 agents
    akshauhini run python examples/support_swarm_http.py   # inherits the run from the CLI

Only httpx is needed. Pace is the multiplier applied to every simulated duration.
"""
import argparse
import os
import threading
import time
import uuid

import httpx

parser = argparse.ArgumentParser()
parser.add_argument("--endpoint", default=os.getenv("AKSHAUHINI_ENDPOINT", "http://127.0.0.1:8765"))
parser.add_argument("--run-id", default=os.getenv("AKSHAUHINI_RUN_ID") or f"support-swarm-{uuid.uuid4().hex[:8]}")
parser.add_argument("--scale", type=int, default=1, help="specialists per team = 2 x scale")
parser.add_argument("--tickets", type=int, default=4)
parser.add_argument("--pace", type=float, default=0.5)
args = parser.parse_args()

http = httpx.Client(base_url=args.endpoint, timeout=5)
send_lock = threading.Lock()


def post(*events):
    with send_lock:
        http.post("/api/events", json=list(events)).raise_for_status()


def event(type, agent=None, task=None, operation=None, **data):
    body = {"run_id": args.run_id, "type": type, "data": data}
    if agent:
        body["agent_id"] = agent
    if task:
        body["task_id"] = task
    if operation:
        body["operation_id"] = operation
    return body


TEAMS = {"kb": ("knowledge-agent", "Knowledge"), "billing": ("billing-agent", "Billing"), "tech": ("tech-support", "Engineering")}
roster = [("router", "Router", "supervisor", "Triage"), ("intake-1", "Ines", "triage", "Triage"), ("intake-2", "Ivo", "triage", "Triage")]
for key, (role, department) in TEAMS.items():
    roster += [(f"{key}-{i + 1}", f"{key.title()} {i + 1}", role, department) for i in range(args.scale * 2)]
roster += [("qa", "Quinn", "reviewer", "Quality"), ("comms", "Casey", "writer", "Comms")]

# Register the app and its real roster in one call. Agents may also join later with agent.created.
http.post("/api/apps/connect", json={
    "app_id": "support-swarm", "name": "Support Swarm (HTTP only)", "run_id": args.run_id,
    "agents": [{"agent_id": a, "name": n, "role": r, "department": d, "model": "gpt-4o-mini"} for a, n, r, d in roster],
}).raise_for_status()
print(f"{len(roster)} agents. Open {args.endpoint}/?run={args.run_id}", flush=True)


def use_tool(agent, task, tool, seconds, fail_once=False):
    operation = uuid.uuid4().hex
    post(event("tool.call.started", agent, task, operation, tool=tool))
    time.sleep(seconds * args.pace)
    if fail_once:
        post(event("tool.call.failed", agent, task, operation, tool=tool, error=f"{tool} timed out", duration_ms=seconds * 1000))
        post(event("tool.retry", agent, task, tool=tool, attempt=2))
        return use_tool(agent, task, tool, seconds)
    post(event("tool.call.completed", agent, task, operation, tool=tool, duration_ms=seconds * 1000))


def think(agent, task, seconds, tokens):
    operation = uuid.uuid4().hex
    post(event("llm.started", agent, task, operation, model="gpt-4o-mini", input_tokens=tokens))
    time.sleep(seconds * args.pace)
    post(event("llm.completed", agent, task, operation, model="gpt-4o-mini", input_tokens=tokens,
               output_tokens=tokens // 9, duration_ms=seconds * 1000))


def hand_off(sender, receiver, task):
    post(event("handoff.started", sender, task, target_agent_id=receiver))
    time.sleep(1.2 * args.pace)
    post(event("task.accepted", receiver, task))
    # Either side may report completion; naming the receiver in target_agent_id is what matters.
    post(event("handoff.completed", sender, task, target_agent_id=receiver))


def ticket(n):
    task, per_team = f"ticket-{n}", args.scale * 2
    intake, kb, billing, tech = f"intake-{n % 2 + 1}", f"kb-{n % per_team + 1}", f"billing-{n % per_team + 1}", f"tech-{n % per_team + 1}"
    post(event("task.created", "router", task, title=f"Ticket #{n}: cannot export invoices"))
    post(event("task.assigned", "router", task, target_agent_id=intake))
    post(event("task.accepted", intake, task))
    think(intake, task, 2, 2100)
    hand_off(intake, kb, task)
    use_tool(kb, task, "vector_search", 3, fail_once=(n == 1))
    think(kb, task, 2, 6400)
    hand_off(kb, billing, task)
    use_tool(billing, task, "postgres_query", 2)
    post(event("task.waiting", billing, task, reason="customer reply"))
    time.sleep(2 * args.pace)
    post(event("task.started", billing, task))
    hand_off(billing, tech, task)
    use_tool(tech, task, "bash", 3)
    post(event("artifact.created", tech, task, artifact_id=f"fix-{n}", name=f"Fix for ticket {n}", content="Re-run the export with the v2 flag.", version=1))
    hand_off(tech, "qa", task)
    post(event("review.started", "qa", task))
    time.sleep(1.5 * args.pace)
    post(event("review.approved", "qa", task))
    hand_off("qa", "comms", task)
    use_tool("comms", task, "send_email", 1)
    post(event("task.completed", "comms", task))


post(event("run.started", title="Support swarm"))
workers = [threading.Thread(target=ticket, args=(n,)) for n in range(1, args.tickets + 1)]
for worker in workers:
    worker.start()
    time.sleep(0.8 * args.pace)
for worker in workers:
    worker.join()
post(event("run.completed"))
print("done", flush=True)
