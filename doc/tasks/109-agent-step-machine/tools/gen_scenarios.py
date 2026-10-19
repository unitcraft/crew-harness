# -*- coding: utf-8 -*-
"""Generator of the scenarios of the agent step: one scenario for every row of the table that can be reached (file agent-step-<state>-<n>) and the flows.
Run from the root of the repository: python -I -B doc/tasks/109-agent-step-machine/tools/gen_scenarios.py
The expectations are written here by hand from the table (agent_step.table.md) and the journal table of the methodology; the run of the interpreter checks them."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scn import *  # noqa

OUT_DIR = os.path.join("src", "machine", "scenarios")
ALL = {}

HOST0 = {"reply_validation": check("Valid"), "close_agent_turn": None}
STOP = {"human_word": "w", "author": "ann", "source": "console"}
KINDS = ("Read", "Write", "Delete", "Move", "Search", "Execute", "Network", "Think", "SwitchMode", "Other")


def new(fname, title, **kw):
    s = Sc("agent-step-" + fname, title, **kw)
    ALL[fname] = s
    return s


def started(s, req=None, **extra):
    """The start: the request to the agent, the counters and the call request are written by the mechanics."""
    exp = dict(state="AgentTurn", sent=["agent-1"], open=["agent-1"], journal=[],
               data={"turn_count": 1, "started": 1000, "turn": "first", "agent_attempt": 1, "open_requests": ["agent-1"], "call_request_id": "call-1"})
    exp.update(extra)
    s.start(req=req, host=dict(HOST0), **exp)
    return s


# ---- the rows of the states ---------------------------------------------------------------------------------------------------

def start_1():
    s = new("start-1", "START 1: the start writes the time and the number of turns, the agent gets the first request (attempt 1, open request, call request)")
    started(s, data={"turn_count": 1, "started": 1000, "turn": "first", "agent_attempt": 1, "open_requests": ["agent-1"], "call_request_id": "call-1",
                     "previous": None, "usage": None, "stop_reason": "", "retry_count": 0, "gatekeeper_attempt": 0, "enhanced_attempt": 0})


def happy(f, title, text="hello"):
    s = new(f, title)
    started(s)
    s.answer("agent-1", finished(text=text), state="End", journal=[usage_ev()], outcome=answer_text(text=text), open=[],
             data={"reply_text": text, "open_requests": [], "stop_reason": ""})


def stops(f, title, first, journal, result, code, host=None, inp=10, out=5, req=None, cost=None):
    """One answer or failure that ends the step in HALTED: the journal lines before the usage line, the result of the usage, the refusal code."""
    s = new(f, title)
    started(s, req=req)
    if isinstance(first, tuple):
        s.fail("agent-1", first[1], host=host, state="Halted")
    else:
        s.answer("agent-1", first, host=host, state="Halted")
    s.steps[-1]["expect"] = s._expect(state="Halted", journal=journal + [usage_ev(result=result, inp=inp, out=out, cost=cost), ("agent_step_stopped", {"reason": result})],
                                      outcome="refusal:" + code, open=[], data={"stop_reason": result, "open_requests": []})


def build():
    start_1()
    happy("agent-turn-1", "AGENT TURN 1: a finished turn goes through the check of the reply to the accounting and the end")
    happy("reply-validation-1", "REPLY VALIDATION 1: a valid reply goes to the accounting")
    happy("accounting-1", "ACCOUNTING 1: one usage line is written and the machine goes to the outcome fork")
    happy("step-outcome-1", "STEP OUTCOME 1: an empty stop reason leads to the end")
    happy("end-end-1", "END 1: the answer is the text, the artifact and the usage")

    for f, t in (("agent-turn-2", "AGENT TURN 2: a truncated turn goes to the continuation, which sends the turn \"continue\""),
                 ("continuation-1", "CONTINUATION 1: the first truncation is continued: the counter grows, the turn is \"continue\""),
                 ("budget-4", "BUDGET 4: no limit is reached: the number of turns grows and the agent gets the next request")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", truncated(), state="AgentTurn", journal=[("output_truncated_continue", {})], sent=["agent-1", "agent-2"], open=["agent-2"],
                 data={"continuation_count": 1, "turn": "continue", "turn_count": 2, "agent_attempt": 2, "open_requests": ["agent-2"]})

    for f, t in (("continuation-2", "CONTINUATION 2: the second truncation stops the step with the limit of tokens"),
                 ("end-halted-6", "HALTED 6: the stop reason max_tokens is a refusal MaxTokens")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", truncated(), state="AgentTurn")
        s.answer("agent-2", truncated(), state="Halted",
                 journal=[("output_truncated_again", {}), usage_ev(result="max_tokens", inp=20, out=10), ("agent_step_stopped", {"reason": "max_tokens"})],
                 outcome="refusal:MaxTokens", open=[], data={"continuation_count": 1, "stop_reason": "max_tokens"})

    stops("agent-turn-3", "AGENT TURN 3: the limit of the requests of a turn stops the step", turn_limit_hit(), [("turn_requests_exhausted", {})], "max_turn_requests", "MaxTurnRequests")
    stops("end-halted-8", "HALTED 8: max_turn_requests is a refusal MaxTurnRequests", turn_limit_hit(), [("turn_requests_exhausted", {})], "max_turn_requests", "MaxTurnRequests")
    stops("agent-turn-4", "AGENT TURN 4: a refusal of the model stops the step", refusal(), [("model_refused", {})], "model_refused", "ModelRefused")
    stops("end-halted-2", "HALTED 2: model_refused is a refusal ModelRefused", refusal(), [("model_refused", {})], "model_refused", "ModelRefused")
    stops("agent-turn-5", "AGENT TURN 5: a turn stopped by the agent stops the step", stopped(), [("turn_cancelled", {})], "stopped_by_agent", "Cancelled")
    stops("end-halted-9", "HALTED 9: stopped_by_agent is a refusal Cancelled", stopped(), [("turn_cancelled", {})], "stopped_by_agent", "Cancelled")
    stops("agent-turn-7", "AGENT TURN 7: a permanent error stops the step with no result", permanent(), [("agent_permanent_error", {})], "no_result", "NoResult", inp=None, out=None)
    stops("end-halted-1", "HALTED 1: no_result is a refusal NoResult", permanent(), [("agent_permanent_error", {})], "no_result", "NoResult", inp=None, out=None)
    stops("agent-turn-9", "AGENT TURN 9: a failure of the turn (no answer in the term) stops the step", ("failure", "Timeout"), [("turn_failed", {"reason": "timeout"})], "timeout", "Timeout", inp=None, out=None)
    stops("end-halted-5", "HALTED 5: timeout is a refusal Timeout", ("failure", "Timeout"), [("turn_failed", {"reason": "timeout"})], "timeout", "Timeout", inp=None, out=None)
    stops("end-halted-3", "HALTED 3: connection_lost is a refusal ConnectionLost", ("failure", "ConnectionLost"), [("turn_failed", {"reason": "connection_lost"})], "connection_lost", "ConnectionLost", inp=None, out=None)
    stops("flow-failure-no-result", "a failure with the code NoResult is a row 9 too", ("failure", "NoResult"), [("turn_failed", {"reason": "no_result"})], "no_result", "NoResult", inp=None, out=None)
    stops("flow-failure-unknown-code", "a failure whose code no row names (ModelRefused) is read as NoResult", ("failure", "ModelRefused"), [("turn_failed", {"reason": "no_result"})], "no_result", "NoResult", inp=None, out=None)

    for f, t in (("agent-turn-6", "AGENT TURN 6: a transient error goes to the retry"), ("retry-1", "RETRY 1: the first retry: the turn before is kept, the turn is \"retry\"")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", transient(), state="AgentTurn", journal=[("agent_transient_error", {"retry": "1"})], sent=["agent-1", "agent-2"], open=["agent-2"],
                 data={"retry_count": 1, "turn": "retry", "turn_before_retry": "first", "turn_count": 2, "agent_attempt": 2})
    s = new("retry-2", "RETRY 2: the second retry keeps the turn before the first one")
    started(s)
    s.answer("agent-1", transient(), state="AgentTurn")
    s.answer("agent-2", transient(), state="AgentTurn", journal=[("agent_transient_error", {"retry": "2"})], sent=["agent-1", "agent-2", "agent-3"], open=["agent-3"],
             data={"retry_count": 2, "turn": "retry", "turn_before_retry": "first", "turn_count": 3, "agent_attempt": 3})
    for f, t in (("retry-3", "RETRY 3: the retries are used up (3): the step stops with no result"), ("flow-retries-exhausted", "the retries are exhausted after four transient errors")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", transient(), state="AgentTurn")
        s.answer("agent-2", transient(), state="AgentTurn")
        s.answer("agent-3", transient(), state="AgentTurn", data={"retry_count": 3})
        s.answer("agent-4", transient(), state="Halted",
                 journal=[("agent_transient_error_exhausted", {"retries": "3"}), usage_ev(result="no_result", inp=None, out=None), ("agent_step_stopped", {"reason": "no_result"})],
                 outcome="refusal:NoResult", open=[], sent=["agent-1", "agent-2", "agent-3", "agent-4"])

    s = new("reply-validation-2", "REPLY VALIDATION 2: an empty reply stops the step with no result")
    started(s)
    s.answer("agent-1", finished(), host={"reply_validation": check("Empty")}, state="Halted",
             journal=[("agent_no_result", {}), usage_ev(result="no_result"), ("agent_step_stopped", {"reason": "no_result"})], outcome="refusal:NoResult")
    s = new("reply-validation-3", "REPLY VALIDATION 3: a reply that breaks the form is returned once: the turn is \"fix\"")
    started(s)
    s.answer("agent-1", finished(), host={"reply_validation": check("Violated")}, state="AgentTurn", journal=[("reply_form_violated", {})],
             sent=["agent-1", "agent-2"], open=["agent-2"], data={"return_count": 1, "turn": "fix", "turn_count": 2})
    for f, t in (("reply-validation-4", "REPLY VALIDATION 4: the form is not fixed after the one return: the step stops"), ("end-halted-4", "HALTED 4: form_not_fixed is a refusal FormNotFixed")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", finished(), host={"reply_validation": check("Violated")}, state="AgentTurn")
        s.answer("agent-2", finished(), state="Halted",
                 journal=[("reply_form_not_fixed", {}), usage_ev(result="form_not_fixed", inp=20, out=10), ("agent_step_stopped", {"reason": "form_not_fixed"})],
                 outcome="refusal:FormNotFixed", data={"return_count": 1})

    for f, t in (("agent-turn-8", "AGENT TURN 8: the agent asks for a permission: the policy is asked"), ("policy-3", "POLICY 3: the policy says ask, a human is present: the gate PERMISSION")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", needs("Read"), state="Permission", journal=[], open=[], sent=["agent-1"], data={"open_requests": []})
    allow = {"$dict": [[var("ActionKind", k), "allow" if k == "Read" else "ask"] for k in KINDS]}
    s = new("policy-1", "POLICY 1: the project allows reading: the answer is allow, the turn is \"permission\"", params={"PERMISSION_POLICY": allow})
    started(s)
    s.answer("agent-1", needs("Read"), state="AgentTurn", journal=[("permission_auto_allowed", {"action": "read"})], sent=["agent-1", "agent-2"], open=["agent-2"],
             data={"permission_decision": "allow", "turn": "permission", "turn_count": 2})
    s = new("policy-2", "POLICY 2: a call without a human (a lens) asks nothing: the answer is deny")
    started(s, req=request(kind="Lens"))
    s.answer("agent-1", needs("Read"), state="AgentTurn", journal=[("permission_auto_denied", {"action": "read"})], sent=["agent-1", "agent-2"],
             data={"permission_decision": "deny", "turn": "permission"})
    s = new("flow-policy-elevated", "an action of the elevated attention (delete) is never allowed by the table: a human is asked")
    started(s)
    s.answer("agent-1", needs("Delete"), state="Permission")
    s = new("flow-policy-elevated-lens", "an action of the elevated attention without a human is denied")
    started(s, req=request(kind="Gatekeeper"))
    s.answer("agent-1", needs("Execute"), state="AgentTurn", journal=[("permission_auto_denied", {"action": "execute"})])
    for f, t, w, decision, code in (("permission-1", "PERMISSION 1: the human allows", "allow", "allow", "permission_human_allowed"),
                                   ("permission-2", "PERMISSION 2: the human denies", "deny", "deny", "permission_human_denied")):
        s = new(f, t)
        started(s)
        s.answer("agent-1", needs("Read"), state="Permission")
        s.feed("word", w, state="AgentTurn", journal=[(code, {"action": "read"})], sent=["agent-1", "agent-2"], open=["agent-2"],
               data={"permission_decision": decision, "turn": "permission", "turn_count": 2, "agent_attempt": 2, "gatekeeper_attempt": 0})

    s = new("budget-1", "BUDGET 1: the budget of tokens is used up: the step stops")
    started(s, req=request(token_budget=15))
    s.answer("agent-1", truncated(), state="Halted",
             journal=[("output_truncated_continue", {}), ("token_limit", {"spent": "15"}), usage_ev(result="max_tokens"), ("agent_step_stopped", {"reason": "max_tokens"})],
             outcome="refusal:MaxTokens")
    for f, t in (("budget-2", "BUDGET 2: the budget of cost is used up: the step stops"), ("end-halted-7", "HALTED 7: cost_limit is a refusal MaxTokens")):
        s = new(f, t)
        started(s, req=request(cost_budget=0.5))
        s.answer("agent-1", truncated(cost=0.5), state="Halted",
                 journal=[("output_truncated_continue", {}), ("cost_limit", {"spent": "0.5"}), usage_ev(result="cost_limit", cost=0.5), ("agent_step_stopped", {"reason": "cost_limit"})],
                 outcome="refusal:MaxTokens")
    s = new("budget-3", "BUDGET 3: the limit of the turns is reached: the step stops")
    started(s, req=request(turn_limit=1))
    s.answer("agent-1", truncated(), state="Halted",
             journal=[("output_truncated_continue", {}), ("turn_limit", {"sent": "1"}), usage_ev(result="max_turn_requests"), ("agent_step_stopped", {"reason": "max_turn_requests"})],
             outcome="refusal:MaxTurnRequests")
    s = new("step-outcome-2", "STEP OUTCOME 2: a stop reason that is not empty leads to the end HALTED")
    started(s)
    s.answer("agent-1", permanent(), state="Halted")

    # the fragment PAUSE: the common events
    def stopped_in_turn(f, t, signal, fields, journal_code, journal_params):
        s = new(f, t)
        started(s)
        s.signal(signal, **fields)
        s.steps[-1]["expect"] = s._expect(state="Pause", journal=[(journal_code, journal_params)], cancelled=["agent-1"], open=[],
                                          data={"previous": "AgentTurn", "open_requests": []})
        return s
    stopped_in_turn("common-1", "COMMON 1: the stop of a human cancels the open requests and the machine waits in the pause", "human_stop", STOP, "human_stop",
                    {"author": "ann", "source": "console", "event": "input-3"})
    stopped_in_turn("common-2", "COMMON 2: the stop of the parent with the request of the call", "parent_stop", {"request_id": "call-1"}, "pause_by_parent_stop",
                    {"request": "call-1", "event": "input-3"})
    s = new("common-3", "COMMON 3: a cancel of a foreign request is dropped, the state is the same")
    started(s)
    s.signal("cancel_request", request_id="other-1")
    s.steps[-1]["expect"] = s._expect(state="AgentTurn", journal=[("cancel_discarded_foreign_request", {"request": "other-1", "event": "input-3"})], open=["agent-1"], cancelled=[])
    s = new("common-4", "COMMON 4: a cancel of the request of the call after the answer is dropped")
    started(s)
    s.answer("agent-1", finished(), state="End")
    s.signal("cancel_request", request_id="call-1")
    s.steps[-1]["expect"] = s._expect(state="End", journal=[("cancel_discarded_already_replied", {"request": "call-1", "event": "input-4"})])
    for f, t in (("common-5", "COMMON 5: the cancel of the request of the call stops the machine, the open requests are cancelled"),
                 ("end-halted-11", "HALTED 11: cancel_request is a refusal Cancelled"), ("flow-cancel-open", "the cancel of the request of the call, then the late answer is dropped")):
        s = new(f, t)
        started(s)
        s.signal("cancel_request", request_id="call-1")
        s.steps[-1]["expect"] = s._expect(state="Halted", journal=[("request_cancelled", {"request": "call-1", "event": "input-3"}), usage_ev(result="cancel_request", inp=None, out=None),
                                                                   ("agent_step_stopped", {"reason": "cancel_request"})],
                                          cancelled=["agent-1"], open=[], outcome="refusal:Cancelled", data={"stop_reason": "cancel_request", "open_requests": []})
        if f == "flow-cancel-open":
            s.answer("agent-1", finished(), state="Halted", journal=[], outcome="refusal:Cancelled")

    def paused(f, t, signal="human_stop", fields=STOP):
        s = new(f, t)
        started(s)
        s.signal(signal, **fields)
        s.steps[-1]["expect"] = s._expect(state="Pause", cancelled=["agent-1"])
        return s
    s = paused("pause-1", "PAUSE 1: the human continues: the state before the stop is entered again, with a new request")
    s.feed("word", "continue", input=STOP, state="AgentTurn", journal=[("human_continue", {"previous": "AgentTurn", "author": "ann", "source": "console", "event": "input-4"})],
           sent=["agent-1", "agent-2"], open=["agent-2"], data={"agent_attempt": 2, "open_requests": ["agent-2"], "turn": "first"})
    for f, t in (("pause-2", "PAUSE 2: the human halts: the step stops"), ("end-halted-10", "HALTED 10: pause_halt is a refusal StoppedByHuman")):
        s = paused(f, t)
        s.feed("word", "halt", state="Halted", journal=[usage_ev(result="pause_halt", inp=None, out=None), ("agent_step_stopped", {"reason": "pause_halt"})],
               outcome="refusal:StoppedByHuman", data={"stop_reason": "pause_halt"})
    s = paused("pause-3", "PAUSE 3: the parent continues (the request of the call)", "parent_stop", {"request_id": "call-1"})
    s.signal("parent_continue", request_id="call-1")
    s.steps[-1]["expect"] = s._expect(state="AgentTurn", journal=[("parent_continue", {"previous": "AgentTurn", "request": "call-1", "event": "input-4"})], sent=["agent-1", "agent-2"], open=["agent-2"])
    s = paused("pause-4", "PAUSE 4: the parent halts (the request of the call)", "parent_stop", {"request_id": "call-1"})
    s.signal("parent_halt", request_id="call-1")
    s.steps[-1]["expect"] = s._expect(state="Halted", journal=[usage_ev(result="pause_halt", inp=None, out=None), ("agent_step_stopped", {"reason": "pause_halt"})], outcome="refusal:StoppedByHuman")

    s = new("end-errored-1", "ERRORED 1: a machine error (overflow of the term) goes to the end ERRORED, the answer is a refusal NoResult")
    started(s, req=request(silence=9223372036854775807))
    s.answer("agent-1", transient(), state="Errored", outcome="refusal:NoResult", open=[])


def flows():
    happy("flow-happy", "a good turn: the text in Cyrillic reaches the answer", text="Привет, мир")
    s = new("flow-form-fix", "the check of the form with a return: violated, fixed, the usage is summed over the two turns")
    started(s)
    s.answer("agent-1", finished(text="draft"), host={"reply_validation": check("Violated")}, state="AgentTurn", journal=[("reply_form_violated", {})])
    s.answer("agent-2", finished(text="fixed"), host={"reply_validation": check("Valid")}, state="End", journal=[usage_ev(inp=20, out=10)],
             outcome=answer_text(text="fixed", inp=20, out=10), data={"return_count": 1, "turn": "fix", "reply_text": "fixed"})
    s = new("flow-transient-then-answer", "a transient error is repeated and the repeat answers")
    started(s)
    s.answer("agent-1", transient(), state="AgentTurn", journal=[("agent_transient_error", {"retry": "1"})])
    s.answer("agent-2", finished(), state="End", journal=[usage_ev()], outcome=answer_text(), data={"retry_count": 1, "turn": "retry"})
    s = new("flow-timeout", "no answer in the term: the pump makes the failure Timeout, the step is refused, the request is cancelled")
    started(s, req=request(silence=5000))
    s.op("advance", ms=4000)
    s.op("pump", state="AgentTurn", open=["agent-1"], outcome="none")
    s.op("advance", ms=1001)
    s.n += 1
    s.op("pump", state="Halted", journal=[("turn_failed", {"reason": "timeout"}), usage_ev(result="timeout", inp=None, out=None), ("agent_step_stopped", {"reason": "timeout"})],
         outcome="refusal:Timeout", open=[], cancelled=["agent-1"])
    s = new("flow-pause-continue", "stop, continue, then the answer of the new request ends the step")
    started(s)
    s.signal("human_stop", **STOP)
    s.steps[-1]["expect"] = s._expect(state="Pause", cancelled=["agent-1"])
    s.feed("word", "continue", input=STOP, state="AgentTurn", sent=["agent-1", "agent-2"])
    s.answer("agent-2", finished(), state="End", journal=[usage_ev()], outcome=answer_text(), data={"agent_attempt": 2, "open_requests": []})
    s = new("flow-restart-midturn", "a restart in the middle of a turn resumes from the journal: nothing is sent again, the answer is accepted")
    started(s)
    s.n += 1
    s.op("restart", state="AgentTurn", sent=["agent-1"], open=["agent-1"])
    s.answer("agent-1", finished(), state="End", journal=[usage_ev()], outcome=answer_text(), sent=["agent-1"])
    s.n += 1
    s.op("restart", state="End", outcome=answer_text())
    s = new("flow-death-between", "the process dies between the commit and the send: the restart sends the request once")
    s.n += 1
    s.steps.append({"do": "accept", "event": {"kind": "start", "request": "call-1", "input": {"agent_request": request()}}, "host": dict(HOST0),
                    "expect": s._expect(state="AgentTurn", sent=[], open=["agent-1"], queue=["send agent-1"])})
    s.n += 1
    s.op("restart", state="AgentTurn", sent=[])
    s.op("dispatch", sent=["agent-1"], queue=[])
    s.op("dispatch", sent=["agent-1"])
    s.answer("agent-1", finished(), state="End", journal=[usage_ev()])
    s = new("flow-stop-in-window", "the stop arrives in the window between the commit and the send: the request is cancelled before it is sent, the continue sends a new one")
    s.n += 1
    s.steps.append({"do": "accept", "event": {"kind": "start", "request": "call-1", "input": {"agent_request": request()}}, "host": dict(HOST0),
                    "expect": s._expect(state="AgentTurn", sent=[], queue=["send agent-1"])})
    s.n += 1
    s.steps.append({"do": "accept", "event": {"kind": "signal", "name": "human_stop", "input": STOP},
                    "expect": s._expect(state="Pause", open=[], queue=["send agent-1", "cancel agent-1"], journal=[("human_stop", {"author": "ann", "source": "console", "event": "input-3"})])})
    s.op("dispatch", sent=["agent-1"], cancelled=["agent-1"], queue=[])
    s.feed("word", "continue", input=STOP, state="AgentTurn", sent=["agent-1", "agent-2"], open=["agent-2"])
    s.answer("agent-2", finished(), state="End", journal=[usage_ev()])
    s = new("flow-other-party", "in the pause the late answer of the agent and the word of the gate are dropped; the pause waits for its own words")
    started(s)
    s.signal("human_stop", **STOP)
    s.steps[-1]["expect"] = s._expect(state="Pause")
    s.answer("agent-1", finished(), state="Pause", journal=[], open=[])
    s.feed("word", "allow", state="Pause", journal=[("event_ignored", {"event": "allow", "state": "Pause"})])
    s.feed("word", "continue", input=STOP, state="AgentTurn", sent=["agent-1", "agent-2"])
    s = new("flow-permission-human", "the agent asks to delete: a human is asked, allows, the turn goes on and ends")
    started(s)
    s.answer("agent-1", needs("Delete"), state="Permission", open=[])
    s.feed("word", "allow", state="AgentTurn", journal=[("permission_human_allowed", {"action": "delete"})], sent=["agent-1", "agent-2"])
    s.answer("agent-2", finished(), state="End", journal=[usage_ev()])
    s = new("flow-stop-in-permission", "the stop in the gate PERMISSION: the continue enters the gate again, no request is sent")
    started(s)
    s.answer("agent-1", needs("Read"), state="Permission")
    s.signal("human_stop", **STOP)
    s.steps[-1]["expect"] = s._expect(state="Pause", journal=[("human_stop", {"author": "ann", "source": "console", "event": "input-4"})], data={"previous": "Permission"}, cancelled=[])
    s.feed("word", "continue", input=STOP, state="Permission", sent=["agent-1"], open=[],
           journal=[("human_continue", {"previous": "Permission", "author": "ann", "source": "console", "event": "input-5"})])
    s = new("flow-stop-in-pause", "a stop in the pause is dropped")
    started(s)
    s.signal("human_stop", **STOP)
    s.steps[-1]["expect"] = s._expect(state="Pause")
    s.signal("human_stop", **STOP)
    s.steps[-1]["expect"] = s._expect(state="Pause", journal=[("event_ignored", {"event": "human_stop", "state": "Pause"})])
    s = new("flow-continue-outside", "the word continue outside the pause is dropped")
    started(s)
    s.feed("word", "continue", input=STOP, state="AgentTurn", journal=[("event_ignored", {"event": "continue", "state": "AgentTurn"})])
    s = new("flow-parent-wrong-id", "the stop of a parent with another request id is dropped")
    started(s)
    s.signal("parent_stop", request_id="other-1")
    s.steps[-1]["expect"] = s._expect(state="AgentTurn", journal=[("event_ignored", {"event": "parent_stop", "state": "AgentTurn"})])
    s = new("flow-input-missing", "the start without the request of the agent is refused: input_rejected, a refusal NoResult")
    s.n += 1
    s.steps.append({"do": "feed", "event": {"kind": "start", "request": "call-1", "input": {}}, "host": dict(HOST0),
                    "expect": s._expect(state="Start", journal=[("input_rejected", {"reason": "missing", "field": "agent_request"})], outcome="refusal:NoResult")})
    s = new("flow-attempts", "the counters of the attempts grow with every request: the agent after a retry and a continue")
    started(s)
    s.answer("agent-1", transient(), state="AgentTurn", data={"agent_attempt": 2, "open_requests": ["agent-2"]})
    s.answer("agent-2", truncated(), state="AgentTurn", data={"agent_attempt": 3, "open_requests": ["agent-3"], "turn": "continue", "retry_count": 1})
    s.answer("agent-3", finished(), state="End", data={"agent_attempt": 3, "open_requests": []}, journal=[usage_ev(inp=20, out=10)])


def main():
    build()
    flows()
    os.makedirs(OUT_DIR, exist_ok=True)
    for f, s in sorted(ALL.items()):
        with open(os.path.join(OUT_DIR, s.fname + ".scenario.json"), "w", encoding="utf-8", newline="\n") as out:
            out.write(s.render())
    # the list of the embedded files in src/machine/data.nv
    data_path = os.path.join("src", "machine", "data.nv")
    lines = open(data_path, encoding="utf-8").read().split("\n")
    lines = [l for l in lines if "agent-step-" not in l]
    at = [i for i, l in enumerate(lines) if l.startswith("export fn scenario_files()")][0] + 1
    entries = ['    NamedText { name: "%s.scenario.json", text: embed_str("scenarios/%s.scenario.json") },' % ("agent-step-" + f, "agent-step-" + f) for f in sorted(ALL)]
    lines[at:at] = entries
    open(data_path, "w", encoding="utf-8", newline="").write("\n".join(lines))
    print(len(ALL), "scenarios")


if __name__ == "__main__":
    main()
