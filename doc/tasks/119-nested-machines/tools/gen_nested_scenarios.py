#!/usr/bin/env python3
"""Writes the scenarios `nested-*.scenario.test.json` of the pair "parent + nested machine" (task 119) into src/machine/scenarios and the lines for src/machine/data.nv.

The scenarios are data: events of the parent and of the nested machine (`on`: the request that started it) and what each engine must leave (`expect`, `also`).
Run from the root of the repository: `python doc/tasks/119-nested-machines/tools/gen_nested_scenarios.py`. The expectations are written by hand below.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'src', 'machine', 'scenarios')
DATA = os.path.join(ROOT, 'src', 'machine', 'data.nv')

KID = 'callee-1'


def out_json(answer, score):
    return '{"$record":"CallOutput","fields":{"answer":"%s","score":%d}}' % (answer, score)


def ev(kind, name=None, request=None, input=None, code=None):
    e = {'kind': kind}
    if name is not None:
        e['name'] = name
    if request is not None:
        e['request'] = request
    if input is not None:
        e['input'] = input
    if code is not None:
        e['code'] = code
    return e


def step(do='feed', event=None, on=None, ms=None, expect=None, also=None, host=None):
    s = {'do': do}
    if host is not None:
        s['host'] = host
    if event is not None:
        s['event'] = event
    if on is not None:
        s['on'] = on
    if ms is not None:
        s['ms'] = ms
    if expect is not None:
        s['expect'] = expect
    if also is not None:
        s['also'] = also
    return s


def scenario(machine, name, steps, params=None):
    sc = {'format': 'scenario/0', 'machine': machine, 'name': name, 'start_at': 1000}
    if params:
        sc['params'] = params
    sc['steps'] = steps
    return sc


FILES = {}


def put(file, sc):
    FILES['nested-%s.scenario.test.json' % file] = sc


# ---- the parent `caller` and its nested machine `callee` --------------------------------------------------------------------------------------------

def c_start():
    return step('feed', ev('start', request='up-1', input={'task': 't'}),
                expect={'state': 'Call', 'journal': [], 'open': ['callee-1'], 'sent': ['callee-1'], 'queue': [], 'outcome': 'none',
                        'data': {'call_request_id': 'up-1', 'child_attempt': 1, 'open_requests': ['callee-1']}},
                also={KID: {'state': 'Ask', 'open': ['agent-1'], 'sent': ['agent-1'], 'queue': [], 'outcome': 'none',
                            'data': {'label': 't', 'count': 3, 'profile': 'fast', 'call_request_id': 'callee-1', 'agent_attempt': 1, 'open_requests': ['agent-1']}}})


def kid_answers(text='hi'):
    return step('feed', ev('answer', request='agent-1', input=text), on=KID,
                expect={'state': 'Done', 'journal': [{'code': 'callee_answered', 'params': {'label': 't'}}], 'open': [], 'outcome': 'answer:' + out_json(text, 3)},
                also={'parent': {'state': 'Call', 'queue': ['in answer'], 'outcome': 'none'}})


def parent_done(text='hi'):
    return step('pump', expect={'state': 'Done', 'journal': [{'code': 'child_answered', 'params': {'answer': text, 'score': '3'}}], 'open': [], 'queue': [],
                                'outcome': 'answer:' + text})


put('call-ok', scenario('caller', 'a call: the nested machine is started with the request, it answers, the parent gets the answer', [
    c_start(), kid_answers(), parent_done()]))

put('call-refused', scenario('caller', 'a call: the agent of the nested machine fails, the nested machine ends with a refusal, the parent gets the failure', [
    c_start(),
    step('feed', ev('failure', request='agent-1', code='ConnectionLost'), on=KID,
         expect={'state': 'Halted', 'journal': [{'code': 'callee_failed', 'params': {'reason': 'connection_lost'}}], 'outcome': 'refusal:NoResult'},
         also={'parent': {'state': 'Call', 'queue': ['in failure']}}),
    step('pump', expect={'state': 'Failed', 'journal': [{'code': 'child_failed', 'params': {'code': 'no_result'}}], 'outcome': 'refusal:NoResult', 'open': [],
                         'data': {'child_code': 'no_result'}})]))

put('call-silence', scenario('caller', 'a call: the agent of the nested machine is silent, the term passes in the nested machine, the parent gets the failure timeout', [
    c_start(),
    step('advance', ms=6000, on=KID),
    step('pump', on=KID,
         expect={'state': 'Halted', 'journal': [{'code': 'callee_silent', 'params': {'label': 't'}}], 'outcome': 'refusal:Timeout'},
         also={'parent': {'state': 'Call', 'queue': ['in failure']}}),
    step('pump', expect={'state': 'Failed', 'journal': [{'code': 'child_failed', 'params': {'code': 'timeout'}}], 'outcome': 'refusal:NoResult',
                         'data': {'child_code': 'timeout'}})]))

put('call-cancel', scenario('caller', 'a call: the parent is cancelled by its own parent, the nested machine gets the cancel and ends with Cancelled, its reply is dropped', [
    c_start(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': ['callee-1'], 'queue': ['in failure'],
                 'data': {'stop_reason': 'cancel_request', 'open_requests': []}},
         also={KID: {'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': ['agent-1'], 'data': {'stop_reason': 'cancel_request'}}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': []})]))

put('call-answer-after-cancel', scenario('caller', 'a call: the nested machine has answered, then the parent is cancelled; the answer that waits in the inbox is dropped (rule 17)', [
    c_start(), kid_answers(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': ['in answer'], 'open': []}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': [], 'journal': []})]))

put('call-restart', scenario('caller', 'a call: the parent restarts in the middle of the call, its request is sent again with the same identifier, the nested machine does not start twice', [
    c_start(),
    step('restart', expect={'state': 'Call', 'open': ['callee-1'], 'queue': ['send callee-1']},
         also={KID: {'state': 'Ask', 'sent': ['agent-1']}}),
    step('dispatch', expect={'sent': ['callee-1', 'callee-1'], 'queue': []},
         also={KID: {'state': 'Ask', 'sent': ['agent-1'], 'open': ['agent-1']}}),
    kid_answers(), parent_done()]))

put('call-restart-ready', scenario('caller', 'a call: the nested machine has answered and the parent restarts before it takes the answer: the request is repeated, the ready answer comes again, one of them is taken, the other dropped', [
    c_start(), kid_answers(),
    step('restart', expect={'state': 'Call', 'open': ['callee-1'], 'queue': ['send callee-1', 'in answer']}),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:hi', 'queue': ['in answer']}),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:hi', 'queue': [], 'journal': []})]))

put('call-restart-done', scenario('caller', 'a call: the parent has taken the answer and ends; a restart repeats nothing, the nested machine is not touched', [
    c_start(), kid_answers(), parent_done(),
    step('restart', expect={'state': 'Done', 'outcome': 'answer:hi', 'queue': [], 'open': []}),
    step('dispatch', expect={'sent': ['callee-1'], 'queue': []})]))

put('call-death-between', scenario('caller', 'a call: the parent dies between the commit and the send; the restart sends the request once and the nested machine starts once', [
    step('accept', ev('start', request='up-1', input={'task': 't'}),
         expect={'state': 'Call', 'open': ['callee-1'], 'sent': [], 'queue': ['send callee-1']}),
    step('restart', expect={'state': 'Call', 'open': ['callee-1'], 'sent': [], 'queue': ['send callee-1']}),
    step('dispatch', expect={'sent': ['callee-1'], 'queue': []},
         also={KID: {'state': 'Ask', 'sent': ['agent-1'], 'open': ['agent-1']}}),
    step('dispatch', expect={'sent': ['callee-1']}, also={KID: {'sent': ['agent-1']}}),
    kid_answers(), parent_done()]))

put('call-window-stop', scenario('caller', 'a call: a human stops the parent in the window between the commit of the call and its send; the signal waits for the nested machine, which starts and is paused', [
    step('accept', ev('start', request='up-1', input={'task': 't'}),
         expect={'state': 'Call', 'sent': [], 'queue': ['send callee-1']}),
    step('feed', ev('signal', 'human_stop', input={'human_word': 'stop', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Pause', 'sent': ['callee-1'], 'open': ['callee-1'], 'data': {'previous': 'Call'}},
         also={KID: {'state': 'Pause', 'data': {'previous': 'Ask'}, 'cancelled': ['agent-1']}}),
    step('feed', ev('signal', 'continue', input={'human_word': 'go', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Call', 'open': ['callee-1']},
         also={KID: {'state': 'Ask', 'sent': ['agent-1', 'agent-2'], 'open': ['agent-2']}}),
    step('feed', ev('answer', request='agent-2', input='late'), on=KID, expect={'state': 'Done', 'outcome': 'answer:' + out_json('late', 3)}),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:late'})]))

put('call-pause-continue', scenario('caller', 'a call: the stop of a human is passed to the nested machine, it pauses; continue is passed too, the nested machine asks its agent again', [
    c_start(),
    step('feed', ev('signal', 'human_stop', input={'human_word': 'stop', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Pause', 'open': ['callee-1'], 'cancelled': [], 'data': {'previous': 'Call', 'open_requests': ['callee-1']}},
         also={KID: {'state': 'Pause', 'cancelled': ['agent-1'], 'open': [], 'data': {'previous': 'Ask'}}}),
    step('feed', ev('signal', 'continue', input={'human_word': 'go', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Call', 'open': ['callee-1'], 'sent': ['callee-1'], 'data': {'child_attempt': 1}},
         also={KID: {'state': 'Ask', 'sent': ['agent-1', 'agent-2'], 'open': ['agent-2'], 'data': {'agent_attempt': 2}}}),
    step('feed', ev('answer', request='agent-2', input='again'), on=KID, expect={'state': 'Done'}),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:again'})]))

put('call-halt', scenario('caller', 'a call: the stop and then the halt of a human; the halt goes to the nested machine, which answers with StoppedByHuman, the parent ends the same way', [
    c_start(),
    step('feed', ev('signal', 'human_stop', input={'human_word': 'stop', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Pause'}, also={KID: {'state': 'Pause'}}),
    step('feed', ev('signal', 'halt'),
         expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'open': [], 'queue': ['in failure']},
         also={KID: {'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'queue': []})]))

put('call-foreign-cancel', scenario('caller', 'a call: a cancel of another request is dropped with a line of the journal, the call goes on', [
    c_start(),
    step('feed', ev('signal', 'cancel_request', input='other-9'),
         expect={'state': 'Call', 'open': ['callee-1'], 'journal': [{'code': 'cancel_discarded_foreign_request', 'params': {'request': 'other-9', 'event': 'input-3'}}]},
         also={KID: {'state': 'Ask'}}),
    kid_answers(), parent_done()]))

put('call-duplicate-answer', scenario('caller', 'a call: the same answer comes three times; the first is taken, the others are dropped (one request - one answer)', [
    c_start(),
    step('deliver', ev('answer', request='callee-1', input=out_json('dup', 3)), expect={'queue': ['in answer']}),
    step('deliver', ev('answer', request='callee-1', input=out_json('dup', 3))),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:dup', 'queue': [], 'journal': [{'code': 'child_answered', 'params': {'answer': 'dup', 'score': '3'}}]})]))

put('call-unknown-reply', scenario('caller', 'a call: an answer of a request that was never opened is dropped', [
    c_start(),
    step('deliver', ev('answer', request='callee-9', input=out_json('x', 1))),
    step('pump', expect={'state': 'Call', 'open': ['callee-1'], 'queue': [], 'journal': []}),
    kid_answers(), parent_done()]))

put('call-kid-restart', scenario('caller', 'a call: the nested machine restarts in the middle (its process dies), it goes on from its snapshot and answers', [
    c_start(),
    step('restart', on=KID, expect={'state': 'Ask', 'open': ['agent-1']}, also={'parent': {'state': 'Call', 'open': ['callee-1']}}),
    kid_answers(), parent_done()]))

put('call-late-signal', scenario('caller', 'a call: the nested machine has answered; a stop of a human reaches the parent after the answer was taken and the parent has ended: nothing is passed', [
    c_start(), kid_answers(), parent_done(),
    step('feed', ev('signal', 'human_stop', input={'human_word': 'stop', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Done', 'outcome': 'answer:hi'}, also={KID: {'state': 'Done'}})]))


# ---- the parent `fan`: a set of nested machines ----------------------------------------------------------------------------------------------------

def lens_json(a, b, c):
    return '{"a":{"$record":"Lens","fields":{"attempt":%d,"name":"a"}},"b":{"$record":"Lens","fields":{"attempt":%d,"name":"b"}},"c":{"$record":"Lens","fields":{"attempt":%d,"name":"c"}}}' % (a, b, c)


def f_start(order=('a', 'b', 'c')):
    return step('feed', ev('start', request='up-1', input={'order': list(order)}))


def lens_answers(lens, n=1, text=None):
    text = text or ('r' + lens)
    return step('feed', ev('answer', request='agent-1', input=text), on='%s-%d' % (lens, n))


put('set-start', scenario('fan', 'a set: two nested machines go at once (the limit is 2), the third waits in to_send; each element counts its own attempts', [
    step('feed', ev('start', request='up-1', input={'order': ['a', 'b', 'c']}),
         expect={'state': 'Lenses', 'open': ['a-1', 'b-1'], 'sent': ['a-1', 'b-1'],
                 'data': {'to_send': ['c'], 'open_requests': ['a-1', 'b-1'], 'lenses': json.loads(lens_json(1, 1, 0))}},
         also={'a-1': {'state': 'Ask', 'data': {'label': 'a', 'profile': 'lens:a', 'count': 1}},
               'b-1': {'state': 'Ask', 'data': {'label': 'b', 'profile': 'lens:b', 'count': 1}}})]))

put('set-all-answer', scenario('fan', 'a set: the answers come one by one; each frees a place, the next element goes; the end answers with the list', [
    f_start(),
    lens_answers('a'),
    step('pump', expect={'state': 'Lenses', 'open': ['b-1', 'c-1'], 'sent': ['a-1', 'b-1', 'c-1'],
                         'journal': [{'code': 'lens_answered', 'params': {'party': 'a', 'answer': 'ra'}}],
                         'data': {'to_send': [], 'answered': ['a'], 'lenses': json.loads(lens_json(1, 1, 1))}},
         also={'c-1': {'state': 'Ask', 'data': {'label': 'c'}}}),
    lens_answers('b'),
    step('pump', expect={'state': 'Lenses', 'open': ['c-1'], 'data': {'answered': ['a', 'b']}}),
    lens_answers('c'),
    step('pump', expect={'state': 'Done', 'open': [], 'outcome': 'answer:["a","b","c"]'})]))

put('set-one-lost', scenario('fan', 'a set: the agent of one nested machine fails; the element is lost, the others go on and the end lists the ones that answered', [
    f_start(),
    step('feed', ev('failure', request='agent-1', code='ConnectionLost'), on='b-1',
         expect={'state': 'Halted', 'outcome': 'refusal:NoResult'}, also={'parent': {'queue': ['in failure']}}),
    step('pump', expect={'state': 'Lenses', 'journal': [{'code': 'lens_lost', 'params': {'party': 'b', 'code': 'no_result'}}],
                         'open': ['a-1', 'c-1'], 'data': {'lost': ['b'], 'to_send': []}}),
    lens_answers('a'),
    step('pump', expect={'state': 'Lenses', 'open': ['c-1']}),
    lens_answers('c'),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:["a","c"]', 'data': {'lost': ['b'], 'answered': ['a', 'c']}})]))

put('set-order-free', scenario('fan', 'a set: the answers come in any order, the second before the first', [
    f_start(),
    lens_answers('b'),
    lens_answers('a'),
    step('pump', expect={'state': 'Lenses', 'data': {'answered': ['b', 'a']}, 'open': ['c-1']}),
    lens_answers('c'),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:["b","a","c"]'})]))

put('set-limit-one', scenario('fan', 'a set: the limit is 1 (the table of the project), the elements go one by one in the order of the list', [
    step('feed', ev('start', request='up-1', input={'order': ['a', 'b']}),
         expect={'state': 'Lenses', 'open': ['a-1'], 'data': {'to_send': ['b']}}),
    lens_answers('a'),
    step('pump', expect={'open': ['b-1'], 'data': {'to_send': [], 'answered': ['a']}}),
    lens_answers('b'),
    step('pump', expect={'state': 'Done', 'outcome': 'answer:["a","b"]'})],
    params={'проект.предел': 1}))

put('set-no-limit', scenario('fan', 'a set: the limit is large, every element goes at once and to_send is empty', [
    step('feed', ev('start', request='up-1', input={'order': ['a', 'b', 'c']}),
         expect={'open': ['a-1', 'b-1', 'c-1'], 'data': {'to_send': []}})],
    params={'проект.предел': 5}))

put('set-pause-continue', scenario('fan', 'a set: the stop of a human goes to the two running nested machines, the third still waits; continue goes to them and sends nothing; a freed place sends the third', [
    f_start(),
    step('feed', ev('signal', 'human_stop', input={'human_word': 'stop', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Pause', 'open': ['a-1', 'b-1'], 'cancelled': [], 'data': {'to_send': ['c'], 'previous': 'Lenses'}},
         also={'a-1': {'state': 'Pause'}, 'b-1': {'state': 'Pause'}}),
    step('feed', ev('signal', 'continue', input={'human_word': 'go', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Lenses', 'open': ['a-1', 'b-1'], 'sent': ['a-1', 'b-1'], 'data': {'to_send': ['c']}},
         also={'a-1': {'state': 'Ask', 'sent': ['agent-1', 'agent-2']}, 'b-1': {'state': 'Ask'}}),
    step('feed', ev('answer', request='agent-2', input='ra'), on='a-1'),
    step('pump', expect={'state': 'Lenses', 'open': ['b-1', 'c-1'], 'data': {'answered': ['a'], 'to_send': []}})]))

put('set-cancel', scenario('fan', 'a set: the parent is cancelled by its own parent; the nested machines get the cancel, the elements go back to to_send in the order of the list', [
    f_start(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': ['a-1', 'b-1'], 'data': {'to_send': ['a', 'b', 'c'], 'open_requests': []}},
         also={'a-1': {'state': 'Halted', 'outcome': 'refusal:Cancelled'}, 'b-1': {'state': 'Halted', 'outcome': 'refusal:Cancelled'}}),
    step('pump', expect={'state': 'Halted', 'queue': []})]))

put('set-restart', scenario('fan', 'a set: the parent restarts with two requests open; both are sent again, no nested machine starts twice', [
    f_start(),
    step('restart', expect={'state': 'Lenses', 'open': ['a-1', 'b-1'], 'queue': ['send a-1', 'send b-1']}),
    step('dispatch', expect={'sent': ['a-1', 'b-1', 'a-1', 'b-1']},
         also={'a-1': {'sent': ['agent-1']}, 'b-1': {'sent': ['agent-1']}}),
    lens_answers('a'), lens_answers('b'),
    step('pump', expect={'state': 'Lenses', 'open': ['c-1'], 'data': {'answered': ['a', 'b']}})]))


# ---- the parent `dialog_steps`: a chat session whose turn is the nested machine `agent_step` -----------------------------------------------------------

def happy():
    with open(os.path.join(OUT, 'agent-step-flow-happy.scenario.test.json'), encoding='utf8') as f:
        return json.load(f)


H = happy()
START_INPUT = H['steps'][0]['event']['input']          # {"agent_request": {...}} of the agent step
DONE_EVENT = H['steps'][1]['event']                    # the answer of the agent of the first request: Finished
STOP_BY = {'human_word': 'stop', 'author': 'ann', 'source': 'console'}


def s_start():
    return step('feed', ev('start', request='up-1', input=START_INPUT),
                host=H['steps'][0]['host'],
                expect={'state': 'Turn', 'open': ['call-1'], 'sent': ['call-1'], 'outcome': 'none', 'data': {'open_requests': ['call-1'], 'step_attempt': 1}},
                also={'call-1': {'state': 'AgentTurn', 'open': ['agent-1'], 'sent': ['agent-1'], 'data': {'call_request_id': 'call-1', 'open_requests': ['agent-1']}}})


def s_kid_done(call='call-1'):
    e = dict(DONE_EVENT)
    return step('feed', e, on=call, expect={'state': 'End', 'open': []}, also={'parent': {'queue': ['in answer']}})


put('steps-turn', scenario('dialog_steps', 'a chat turn: the agent step is the nested machine; its answer is the answer of the turn and the session waits for the next word', [
    s_start(), s_kid_done(),
    step('pump', expect={'state': 'Wait', 'open': [], 'journal': [{'code': 'turn_answered', 'params': {'session': 's1'}}], 'data': {'turn_count': 1, 'stop_code': '', 'open_requests': []}})]))

put('steps-two-turns', scenario('dialog_steps', 'a chat of two turns: each message is a new request call-N and a new nested machine; the closing word ends the session', [
    s_start(), s_kid_done(),
    step('pump', expect={'state': 'Wait'}),
    step('feed', ev('signal', 'user_message', input='second question'),
         expect={'state': 'Turn', 'open': ['call-2'], 'sent': ['call-1', 'call-2'], 'journal': [{'code': 'user_message', 'params': {'text': 'second question'}}], 'data': {'step_attempt': 2}},
         also={'call-2': {'state': 'AgentTurn', 'open': ['agent-1'], 'data': {'call_request_id': 'call-2'}}, 'call-1': {'state': 'End'}}),
    s_kid_done('call-2'),
    step('pump', expect={'state': 'Wait', 'data': {'turn_count': 2}}),
    step('feed', ev('signal', 'close_session'), expect={'state': 'Closed', 'outcome': 'answer:closed', 'journal': [{'code': 'session_closed'}]})]))

put('steps-refused', scenario('dialog_steps', 'a chat turn: the agent gives no result; the nested machine ends with the refusal, the session records it and waits for the next word', [
    s_start(),
    step('feed', ev('failure', request='agent-1', code='NoResult'), on='call-1',
         expect={'state': 'Halted', 'outcome': 'refusal:NoResult'}, also={'parent': {'queue': ['in failure']}}),
    step('pump', expect={'state': 'Wait', 'journal': [{'code': 'turn_refused', 'params': {'code': 'no_result'}}], 'data': {'stop_code': 'no_result', 'turn_count': 1}})]))

put('steps-stop', scenario('dialog_steps', 'a chat turn: a human stops the session, the stop goes to the agent step (it cancels its agent request); the halt ends both with StoppedByHuman', [
    s_start(),
    step('feed', ev('signal', 'human_stop', input=STOP_BY),
         expect={'state': 'Pause', 'open': ['call-1']},
         also={'call-1': {'state': 'Pause', 'cancelled': ['agent-1']}}),
    step('feed', ev('signal', 'halt'),
         expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'open': []},
         also={'call-1': {'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}})]))

put('steps-continue', scenario('dialog_steps', 'a chat turn: stop and continue of a human go down to the agent step; after continue it asks the agent again and the turn ends', [
    s_start(),
    step('feed', ev('signal', 'human_stop', input=STOP_BY), expect={'state': 'Pause'}, also={'call-1': {'state': 'Pause'}}),
    step('feed', ev('signal', 'continue', input={'human_word': 'go', 'author': 'ann', 'source': 'console'}),
         expect={'state': 'Turn', 'open': ['call-1'], 'sent': ['call-1']},
         also={'call-1': {'state': 'AgentTurn', 'sent': ['agent-1', 'agent-2'], 'open': ['agent-2']}}),
    step('feed', dict(DONE_EVENT, request='agent-2'), on='call-1', expect={'state': 'End'}),
    step('pump', expect={'state': 'Wait', 'journal': [{'code': 'turn_answered', 'params': {'session': 's1'}}]})]))

put('steps-cancel', scenario('dialog_steps', 'a chat turn: the session is cancelled by its parent; the cancel goes down to the agent step and its reply is dropped', [
    s_start(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': ['call-1']},
         also={'call-1': {'state': 'Halted', 'outcome': 'refusal:Cancelled'}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': []})]))


def write_all():
    os.makedirs(OUT, exist_ok=True)
    for name, sc in sorted(FILES.items()):
        with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
            f.write(json.dumps(sc, ensure_ascii=False, indent=2) + '\n')
    # the lines of data.nv: the nested scenarios stay together before the first `variants-` scenario
    with open(DATA, encoding='utf8', newline='') as f:
        text = f.read().replace('\r\n', '\n')
    lines = [l for l in text.split('\n') if not l.lstrip().startswith('NamedText { name: "nested-')]
    new = ['    NamedText { name: "%s", text: embed_str("scenarios/%s") },' % (n, n) for n in sorted(FILES)]
    at = next(i for i, l in enumerate(lines) if 'name: "variants-' in l)
    lines[at:at] = new
    with open(DATA, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('wrote', len(FILES), 'scenarios')


if __name__ == '__main__':
    write_all()
