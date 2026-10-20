# -*- coding: utf-8 -*-
"""Helpers of the generator of the scenarios of the agent step (task 109): values in the lossless JSON form of the core, steps, expectations."""
import json

OUT = None  # set by gen_scenarios.py


def rec(name, **fields):
    return {"$record": name, "fields": fields}


def var(type_name, name, **fields):
    return {"$variant": type_name, "name": name, "fields": fields}


def model(mid="m1", provider="p", variant=None):
    return rec("AgentModel", id=mid, provider=provider, variant=variant)


def tokens(inp=10, out=5, reasoning=None, cache_read=None, cache_write=None):
    return rec("TokenUsage", input=inp, output=out, reasoning=reasoning, cache_read=cache_read, cache_write=cache_write)


def transport(inp=10, out=5, cost=None, started=5, mid="m1", ctx=None, **kw):
    return rec("TransportUsage", model=model(mid), tokens=tokens(inp, out, **kw), cost=cost, context_used=ctx, request_started=started)


def request(kind="CycleSession", family="claude", mdl="m1", effort=None, session="s1", dialog="main", context="ctx",
            silence=None, token_budget=None, cost_budget=None, turn_limit=None, trace="t1", step=0):
    return rec("AgentRequest", kind=var("CallerKind", kind), profile=rec("AgentProfile", family=family, model=mdl, effort=effort),
               session=session, dialog_kind=dialog, context=context,
               limits=rec("AgentLimits", silence_term=silence, token_budget=token_budget, cost_budget=cost_budget, turn_limit=turn_limit),
               trace=trace, step=step)


def finished(text="hello", artifact=None, **kw):
    return var("TurnResult", "Finished", text=text, artifact=artifact, usage=transport(**kw))


def truncated(**kw):
    return var("TurnResult", "Truncated", usage=transport(**kw))


def turn_limit_hit(**kw):
    return var("TurnResult", "TurnRequestLimit", usage=transport(**kw))


def refusal(**kw):
    return var("TurnResult", "ModelRefusal", usage=transport(**kw))


def stopped(**kw):
    return var("TurnResult", "Stopped", usage=transport(**kw))


def transient():
    return var("TurnResult", "TransientError")


def permanent():
    return var("TurnResult", "PermanentError")


def needs(action="Read", description="d"):
    return var("TurnResult", "NeedsPermission", permission_request=rec("PermissionRequest", action=var("ActionKind", action), description=description))


def check(name):
    return var("ReplyCheck", name)


def word(x):
    return "none" if x is None else str(x)


def usage_ev(result="reply", inp=10, out=5, reasoning=None, cache_read=None, cache_write=None, cost=None, mid="m1", session="s1"):
    return ("agent_usage", {"session": session, "result": result, "model": mid, "input": word(inp), "output": word(out),
                            "reasoning": word(reasoning), "cache_read": word(cache_read), "cache_write": word(cache_write), "cost": word(cost)})


def canon(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def answer_text(text="hello", artifact=None, result="reply", inp=10, out=5, cost=None, started=5, created=1000, updated=1000,
                request_started=5, session="s1", mid="m1"):
    usage = rec("Usage", session=session, result=result, family="claude", model=model(mid), tokens=tokens(inp, out), cost=cost,
                created=created, updated=updated, context_used=None, trace="t1", step=0)
    return "answer:" + canon(rec("AgentReply", text=text, artifact=artifact, usage=usage, request_started=request_started))


KIND = {"word": "input", "signal": "input", "start": "input", "answer": "answered", "failure": "refused", "timeout": "expired", "progress": "progress"}


class Sc:
    def __init__(self, fname, title, params=None, call="call-1"):
        self.fname = fname
        self.title = title
        self.params = params
        self.call = call
        self.steps = []
        self.n = 1  # the event counter of the engine after start_engine

    def eid(self, kind):
        self.n += 1
        return "%s-%d" % (KIND[kind], self.n)

    def _expect(self, **e):
        out = {}
        for k in ("state", "journal", "data", "queue", "open", "outcome", "sent", "cancelled"):
            if k in e and e[k] is not None:
                v = e[k]
                if k == "journal":
                    v = [{"code": c, "params": p} if p else {"code": c} for (c, p) in v]
                out[k] = v
        return out

    def add(self, step):
        self.steps.append(step)
        return self

    def start(self, req=None, host=None, **expect):
        ev = {"kind": "start", "request": self.call, "input": (req if req is not None else request())["fields"]}
        self.eid("start")
        st = {"do": "feed", "event": ev}
        if host:
            st["host"] = host
        st["expect"] = self._expect(**expect)
        return self.add(st)

    def feed(self, kind, name=None, request_id=None, input=None, code=None, host=None, op="feed", **expect):
        ev = {"kind": kind}
        if name:
            ev["name"] = name
        if request_id:
            ev["request"] = request_id
        if input is not None:
            ev["input"] = input
        if code:
            ev["code"] = code
        self.eid(kind)
        st = {"do": op, "event": ev}
        if host:
            st["host"] = host
        ex = self._expect(**expect)
        if ex:
            st["expect"] = ex
        return self.add(st)

    def answer(self, rid, value, **kw):
        return self.feed("answer", "agent_done", request_id=rid, input=value, **kw)

    def fail(self, rid, code, **kw):
        return self.feed("failure", "agent_refused", request_id=rid, code=code, **kw)

    def signal(self, name, **fields):
        # a signal or a word with one field takes the text as the field, with more fields an object (the reading of the event in the interpreter)
        if len(fields) == 1:
            return self.feed("signal", name, input=list(fields.values())[0])
        return self.feed("signal", name, input=fields or None)

    def op(self, do, ms=None, host=None, count_event=False, **expect):
        st = {"do": do}
        if ms is not None:
            st["ms"] = ms
        if count_event:
            self.n += 1
        if host:
            st["host"] = host
        ex = self._expect(**expect)
        if ex:
            st["expect"] = ex
        return self.add(st)

    def render(self):
        lines = ['{', '  "format": "scenario/0",', '  "machine": "agent_step",', '  "name": %s,' % json.dumps(self.title, ensure_ascii=False)]
        if self.params:
            lines.append('  "params": %s,' % canon(self.params))
        lines.append('  "start_at": 1000,')
        lines.append('  "steps": [')
        body = []
        for s in self.steps:
            body.append('    ' + json.dumps(s, ensure_ascii=False, separators=(", ", ": ")))
        lines.append(",\n".join(body))
        lines.append('  ]')
        lines.append('}')
        return "\n".join(lines) + "\n"
