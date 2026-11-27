"""OTLP/HTTP JSON span adapter. Explicit AO attributes preserve semantics."""
from datetime import datetime, timezone
from .protocol import Event

def any_value(value):
    """Decode an OTLP/JSON AnyValue. int64 is a decimal *string* in OTLP/JSON, so intValue must be converted."""
    if not isinstance(value, dict) or not value:
        return None
    kind, raw = next(iter(value.items()))
    if kind == "intValue":
        return int(raw)
    if kind == "doubleValue":
        return float(raw)
    if kind == "arrayValue":
        return [any_value(item) for item in raw.get("values", [])]
    if kind == "kvlistValue":
        return {item["key"]: any_value(item.get("value")) for item in raw.get("values", [])}
    return raw  # stringValue, boolValue, bytesValue

def attributes(items):
    return {a["key"]: any_value(a.get("value")) for a in items}

def convert(payload: dict) -> list[Event]:
    result = []
    for resource in payload.get("resourceSpans", []):
        base = attributes(resource.get("resource", {}).get("attributes", []))
        for scope in resource.get("scopeSpans", []):
            for span in scope.get("spans", []):
                a = {**base, **attributes(span.get("attributes", []))}
                agent = a.get("akshauhini.agent.id")
                kind = a.get("akshauhini.operation")
                if not agent or kind not in ("llm", "tool.call", "task", "review"):
                    continue
                run = a.get("akshauhini.run.id", span["traceId"])
                operation = f'{span["traceId"]}:{span["spanId"]}'
                data = {"title": span.get("name", kind), "tool": a.get("tool.name"), "model": a.get("gen_ai.request.model"), "input_tokens": a.get("gen_ai.usage.input_tokens"), "output_tokens": a.get("gen_ai.usage.output_tokens")}
                end_type = "failed" if span.get("status", {}).get("code") == 2 else "completed"
                if kind == "review":
                    # A span ending alone does not imply review approval.
                    end_type = None
                for phase, ns in [("started", span["startTimeUnixNano"]), (end_type, span["endTimeUnixNano"])]:
                    if phase is None:
                        continue
                    result.append(Event(event_id=f"{operation}:{phase}", run_id=run, agent_id=agent, task_id=a.get("akshauhini.task.id"), operation_id=operation, type=f"{kind}.{phase}", timestamp=datetime.fromtimestamp(int(ns) / 1e9, timezone.utc), data={**data, "duration_ms": (int(span["endTimeUnixNano"]) - int(span["startTimeUnixNano"])) / 1e6} if phase != "started" else data))
    return result
