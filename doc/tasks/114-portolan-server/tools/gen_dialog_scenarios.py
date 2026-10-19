"""Writes src/machine/scenarios/dialog-*.scenario.test.json (task 114).

Two sources:
  1. the single-turn scenarios chat-*.scenario.test.json (the data form of chat_engine_test.nv) moved to the many-turn machine: the end states
     Done and Failed become Idle, the outcome of the session is "none", the session goes on;
  2. the scenarios of src/server/dialog_test.nv and the rows that only a many-turn session has, written here.
Run from the root of the tree: python doc/tasks/114-portolan-server/tools/gen_dialog_scenarios.py
The expectations are checked by two machines: the Portolan machine (src/machine_run, "every scenario") and the Nova machine
dialog_session (src/machine_dialog, the equality of the traces).
"""
import glob
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..")
SCEN = os.path.join(ROOT, "src", "machine", "scenarios")
PARAMS = {"проект.срок_бездействия": 30000}

# the chat scenarios that have a many-turn form as they are (state names and outcomes mapped)
DERIVED = [
    "ack-discarded", "ack-restart", "ack", "answer-after-cancel", "answer-after-timeout", "cancel-awaiting", "cancel-in-window",
    "chunk-renews-term", "chunks-and-done", "cyrillic", "ignored-chunk", "ignored-second-message", "journal-restart-answer", "late-chunk",
    "message-opens-request", "pump-order", "refused-model-refused", "refused-unknown-code", "restart-after-answer", "restart-after-request",
    "restart-before-send", "second-answer", "silent-agent", "start", "timeout-awaiting", "tool-and-permission", "unknown-name",
    "unknown-request",
]

NAMES = {
    "chunks of the agent accumulate in the state and the answer ends the session": "chunks of the agent accumulate in the state and the answer ends the turn",
    "the cancel of the user while waiting stops the session as human": "the cancel of the user while waiting ends the turn, the session stays open",
    "a refusal with the code ModelRefused ends the session with it": "a refusal with the code ModelRefused ends the turn, the session stays open",
    "a refusal with a code outside the closed list is NoResult": "a refusal with a code outside the closed list is the code NoResult, the turn ends",
    "restart after the answer: stays finished, nothing sent": "restart after the answer: the session is open, nothing sent again",
    "a silent agent ends with Timeout and is cancelled": "a silent agent ends the turn with Timeout and is cancelled",
    "the idle term in Awaiting ends the session with Timeout": "the idle term in Awaiting ends the turn with Timeout",
    "the machine starts in Idle": "the dialog machine starts in Idle",
}


def fix_expect(ex):
    out = {}
    for k, v in ex.items():
        if k == "state" and v in ("Done", "Failed"):
            v = "Idle"
        if k == "outcome" and v != "none":
            v = "none"
        out[k] = v
    return out


def derive(slug):
    path = os.path.join(SCEN, "chat-%s.scenario.test.json" % slug)
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    steps = []
    for s in d["steps"]:
        s = dict(s)
        if "expect" in s:
            s["expect"] = fix_expect(s["expect"])
        steps.append(s)
    return scenario(NAMES.get(d["name"], d["name"]), steps, d["start_at"])


def msg(text, **expect):
    return {"do": "feed", "event": {"kind": "word", "name": "user_message", "input": text}, "expect": expect}


def chunk(req, text, **expect):
    return {"do": "feed", "event": {"kind": "progress", "name": "agent_chunk", "request": req, "input": text}, "expect": expect}


def done(req, **expect):
    return {"do": "feed", "event": {"kind": "answer", "name": "agent_done", "request": req}, "expect": expect}


def refused(req, code, **expect):
    return {"do": "feed", "event": {"kind": "failure", "name": "agent_refused", "request": req, "code": code}, "expect": expect}


def cancel(**expect):
    return {"do": "feed", "event": {"kind": "signal", "name": "cancel"}, "expect": expect}


def scenario(name, steps, start_at=1000):
    return {"format": "scenario/0", "machine": "DialogSession", "name": name, "start_at": start_at, "params": PARAMS, "steps": steps}


def j(_code, **params):
    return {"code": _code, "params": params}


def own():
    out = {}
    out["second-turn"] = scenario("the next message after an answer opens the request agent-2 and nothing of the first turn is carried over", [
        msg("one", state="Awaiting", journal=[j("user_message", text="one")], open=["agent-1"], sent=["agent-1"], outcome="none",
            data={"user": "one", "reply": ""}),
        chunk("agent-1", "A", state="Awaiting", data={"user": "one", "reply": "A"}),
        done("agent-1", state="Idle", journal=[j("agent_done")], open=[], outcome="none", data={"user": "", "reply": ""}),
        msg("two", state="Awaiting", journal=[j("user_message", text="two")], open=["agent-2"], sent=["agent-1", "agent-2"],
            data={"user": "two", "reply": ""}),
        chunk("agent-2", "B", state="Awaiting", data={"user": "two", "reply": "B"}),
        done("agent-2", state="Idle", open=[], sent=["agent-1", "agent-2"], outcome="none"),
    ])
    out["turn-ends"] = scenario("a refusal, a timeout, a cancel and an answer end four turns, the session goes on and numbers the requests", [
        msg("a", state="Awaiting", open=["agent-1"]),
        refused("agent-1", "ModelRefused", state="Idle", journal=[j("agent_refused", code="model_refused")], open=[], outcome="none"),
        msg("b", state="Awaiting", open=["agent-2"], sent=["agent-1", "agent-2"]),
        {"do": "advance", "ms": 31000},
        {"do": "pump", "expect": {"state": "Idle", "journal": [j("no_answer_in_time")], "open": [], "cancelled": ["agent-2"], "outcome": "none"}},
        msg("c", state="Awaiting", open=["agent-3"], sent=["agent-1", "agent-2", "agent-3"]),
        cancel(state="Idle", journal=[j("cancelled_while_waiting")], open=[], cancelled=["agent-2", "agent-3"], outcome="none"),
        msg("d", state="Awaiting", open=["agent-4"]),
        chunk("agent-4", "fine", state="Awaiting"),
        done("agent-4", state="Idle", open=[], sent=["agent-1", "agent-2", "agent-3", "agent-4"], outcome="none"),
    ])
    out["cancel-idle"] = scenario("a cancel in Idle is a note, nothing ends and nothing is cancelled", [
        {"do": "feed", "event": {"kind": "word", "name": "cancel"}, "expect": {
            "state": "Idle", "journal": [j("event_ignored", event="cancel", state="Idle")], "open": [], "sent": [], "cancelled": [], "outcome": "none"}},
        msg("hi", state="Awaiting", open=["agent-1"]),
    ])
    out["cancel-then-next"] = scenario("a cancel closes the turn, the late answer and the late refusal are discarded, the next turn works", [
        msg("slow", state="Awaiting", open=["agent-1"]),
        chunk("agent-1", "start", state="Awaiting", data={"reply": "start"}),
        cancel(state="Idle", journal=[j("cancelled_while_waiting")], open=[], cancelled=["agent-1"], outcome="none"),
        chunk("agent-1", "late", state="Idle", journal=[], open=[]),
        refused("agent-1", "StoppedByHuman", state="Idle", journal=[], open=[]),
        msg("again", state="Awaiting", open=["agent-2"], sent=["agent-1", "agent-2"], data={"user": "again", "reply": ""}),
        chunk("agent-2", "ok", state="Awaiting", data={"reply": "ok"}),
        done("agent-2", state="Idle", open=[], outcome="none"),
    ])
    out["timeout-then-next"] = scenario("the idle term ends the turn with Timeout and the session takes the next message", [
        msg("silent", state="Awaiting", open=["agent-1"]),
        {"do": "advance", "ms": 31000},
        {"do": "pump", "expect": {"state": "Idle", "journal": [j("no_answer_in_time")], "open": [], "cancelled": ["agent-1"], "outcome": "none"}},
        msg("next", state="Awaiting", open=["agent-2"], sent=["agent-1", "agent-2"]),
    ])
    out["restart-before-send-second"] = scenario("death after the commit of the second turn, before the send: sent once as agent-2", [
        msg("one", state="Awaiting"),
        done("agent-1", state="Idle"),
        {"do": "accept", "event": {"kind": "word", "name": "user_message", "input": "two"},
         "expect": {"state": "Awaiting", "sent": ["agent-1"], "queue": ["send agent-2"]}},
        {"do": "restart", "expect": {"state": "Awaiting", "sent": ["agent-1"]}},
        {"do": "dispatch", "expect": {"sent": ["agent-1", "agent-2"], "queue": []}},
        {"do": "restart", "expect": {"state": "Awaiting"}},
        {"do": "dispatch", "expect": {"sent": ["agent-1", "agent-2"]}},
    ])
    out["answer-while-dead"] = scenario("the agent answers while the process is dead: the answer is taken once after the restart and the session goes on", [
        msg("one", state="Awaiting"),
        {"do": "deliver", "event": {"kind": "progress", "name": "agent_chunk", "request": "agent-1", "input": "text", "source": "acp-1"}},
        {"do": "deliver", "event": {"kind": "answer", "name": "agent_done", "request": "agent-1", "source": "acp-2"}},
        {"do": "restart", "expect": {"state": "Awaiting"}},
        {"do": "pump", "expect": {"state": "Idle", "journal": [j("agent_chunk", text="text"), j("agent_done")], "open": [], "outcome": "none"}},
        msg("two", state="Awaiting", open=["agent-2"], sent=["agent-1", "agent-2"]),
    ])
    out["cancel-before-send"] = scenario("death after the cancel was committed, before it was sent: the cancel goes out once and the session goes on", [
        msg("slow", state="Awaiting"),
        {"do": "accept", "event": {"kind": "signal", "name": "cancel"}, "expect": {"state": "Idle", "cancelled": [], "queue": ["cancel agent-1"]}},
        {"do": "restart", "expect": {"state": "Idle"}},
        {"do": "dispatch", "expect": {"cancelled": ["agent-1"], "queue": []}},
        {"do": "restart", "expect": {"state": "Idle"}},
        {"do": "dispatch", "expect": {"cancelled": ["agent-1"]}},
        msg("again", state="Awaiting", sent=["agent-1", "agent-2"]),
    ])
    out["closed-table-only"] = scenario("(table only) the word close_session in Idle ends the session: the end Closed answers closed", [
        msg("hi", state="Awaiting"),
        done("agent-1", state="Idle"),
        {"do": "feed", "event": {"kind": "word", "name": "close_session"}, "expect": {
            "state": "Closed", "journal": [j("session_closed")], "open": [], "outcome": "answer:closed"}},
        msg("late", state="Closed", journal=[j("event_ignored", event="user_message", state="Closed")], outcome="answer:closed"),
    ])
    return out


def dumps(v):
    return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))


def text_of(sc):
    lines = ["{"]
    lines.append('  "format": "scenario/0",')
    lines.append('  "machine": %s,' % dumps(sc["machine"]))
    lines.append('  "name": %s,' % dumps(sc["name"]))
    lines.append('  "start_at": %d,' % sc["start_at"])
    lines.append('  "params": %s,' % dumps(sc["params"]))
    lines.append('  "steps": [')
    n = len(sc["steps"])
    for i, s in enumerate(sc["steps"]):
        lines.append("    " + dumps(s) + ("," if i + 1 < n else ""))
    lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    for f in glob.glob(os.path.join(SCEN, "dialog-*.scenario.test.json")):
        os.remove(f)
    made = {}
    for slug in DERIVED:
        made["flow-" + slug] = derive(slug)
    made.update(own())
    for slug, sc in sorted(made.items()):
        path = os.path.join(SCEN, "dialog-%s.scenario.test.json" % slug)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text_of(sc))
    print(len(made), "files")


main()
