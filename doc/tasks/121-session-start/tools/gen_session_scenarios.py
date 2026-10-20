#!/usr/bin/env python3
"""Writes the scenarios `session-*.scenario.test.json` of the machine "Session start" (task 121) into src/machine/scenarios and the lines for src/machine/data.nv.

The parent is `session_start`; its nested machine is the agent step (`agent_step`), which the nested runner starts when the parent sends the request `agent_step-N` to its party. A step acts on
the parent, or on the nested machine when it has `on` (the id of the request that started it). What each engine must leave is `expect` (the engine of the step) and `also` (the others).
The expectations are written by hand below from the table of the methodology (task-runner-session-states.md) and the pause fragment, not taken from a run.
Run from the root of the repository: `python doc/tasks/121-session-start/tools/gen_session_scenarios.py`.
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'src', 'machine', 'scenarios')
DATA = os.path.join(ROOT, 'src', 'machine', 'data.nv')

PARENT = 'session_start'
FILES = {}


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


def scenario(name, steps, params=None):
    sc = {'format': 'scenario/0', 'machine': PARENT, 'name': name, 'start_at': 1000}
    if params:
        sc['params'] = params
    sc['steps'] = steps
    return sc


def put(file, sc):
    FILES['session-%s.scenario.test.json' % file] = sc


# ---- the values of the core in the lossless JSON ------------------------------------------------------------------------------------------------

def variant(type_name, name):
    return {'$variant': type_name, 'name': name, 'fields': {}}


def record(type_name, fields):
    return {'$record': type_name, 'fields': fields}


def lossless(v):
    """The text of a value as the core writes it (a record has its fields sorted by name, no spaces): the form of `outcome: answer:`."""
    if isinstance(v, dict) and '$record' in v:
        fs = ','.join('%s:%s' % (json.dumps(k), lossless(v['fields'][k])) for k in sorted(v['fields']))
        return '{"$record":%s,"fields":{%s}}' % (json.dumps(v['$record']), fs)
    if isinstance(v, dict) and '$variant' in v:
        return '{"$variant":%s,"name":%s}' % (json.dumps(v['$variant']), json.dumps(v['name']))
    if isinstance(v, list):
        return '[' + ','.join(lossless(x) for x in v) + ']'
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def summary(essential, probes):
    return record('Summary', {'essential': essential, 'probes': probes})


def finding(severity, level, evidence):
    return record('Finding', {'severity': variant('Severity', severity), 'level': variant('Level', level), 'evidence': evidence})


def parsing(result='Done', summ=None, findings=None):
    return record('SessionParsing', {'result': variant('SessionResult', result), 'summary': summ, 'findings': findings})


def launch_result(result='Done', summ=None, findings=None):
    return record('SessionLaunchResult', {'result': variant('SessionResult', result), 'summary': summ, 'findings': findings})


def answer_of(result='Done', summ=None, findings=None):
    return 'answer:' + lossless(launch_result(result, summ, findings))


# ---- the events and the host ----------------------------------------------------------------------------------------------------------------------

def happy():
    with open(os.path.join(OUT, 'agent-step-flow-happy.scenario.test.json'), encoding='utf8') as f:
        return json.load(f)


H = happy()
HOST_AGENT = H['steps'][0]['host']                     # the agent step: reply_validation Valid, close_agent_turn
DONE_EVENT = H['steps'][1]['event']                    # the answer of the agent of the first request: Finished
STOP_BY = {'human_word': 'stop', 'author': 'ann', 'source': 'console'}
GO_BY = {'human_word': 'go', 'author': 'ann', 'source': 'console'}


def host(scope='Fits', result='Done', summ=None, findings=None, session='s3', **more):
    h = dict(HOST_AGENT)
    h['launch_scope'] = variant('LaunchScope', scope)
    h['launch_profile'] = record('AgentProfile', {'family': 'claude', 'model': 'm1', 'effort': None})
    h['session_context'] = 'the prompt of %s' % session
    h['parse_session_artifact'] = parsing(result, summ, findings)
    h['stop_agent_group'] = None
    h.update(more)
    return h


def sinput(session='s3', **more):
    i = {'session': session, 'task_dir': '/t', 'repo_dir': '/r', 'delivery_mode': 'files', 'route': 'full', 'delivery_short': False}
    i.update(more)
    return i


def kid(n):
    return 'agent_step-%d' % n


def kids(upto):
    return [kid(i) for i in range(1, upto + 1)]


def word(name, input=None):
    """A word of the keeper (a gate is not a request of the engine: the word comes by its name)."""
    return ev('word', name, input=input)


def s_start(session='s3', inp=None, h=None, data=None):
    d = {'call_request_id': 'up-1', 'step_attempt': 0, 'open_requests': [], 'session': session, 'stop_reason': ''}
    if data:
        d.update(data)
    return step('feed', ev('start', request='up-1', input=inp or sinput(session)), host=h or host(session=session),
                expect={'state': 'Gate2', 'journal': [], 'open': [], 'sent': [], 'queue': [], 'outcome': 'none', 'data': d})


def s_confirm(k=1, h=None):
    """The keeper confirms (B2 -> the volume fits -> the session): the request `agent_step-k` goes, the nested machine starts and asks its agent."""
    return step('feed', word('confirm'), host=h,
                expect={'state': 'Session', 'open': [kid(k)], 'sent': kids(k), 'outcome': 'none',
                        'data': {'step_attempt': k, 'open_requests': [kid(k)]}},
                also={kid(k): {'state': 'AgentTurn', 'open': ['agent-1'], 'sent': ['agent-1'], 'outcome': 'none',
                               'data': {'call_request_id': kid(k), 'open_requests': ['agent-1']}}})


def s_kid_done(k=1):
    """The agent of the nested machine answers: the nested machine ends with its answer, which waits in the inbox of the parent."""
    return step('feed', DONE_EVENT, on=kid(k), expect={'state': 'End', 'open': []}, also={'parent': {'queue': ['in answer']}})


def s_pump_end(session='s3', result='Done', outcome=None, summ=None, findings=None, data=None):
    d = {'open_requests': []}
    if data:
        d.update(data)
    return step('pump', expect={'state': 'End', 'journal': [{'code': 'session_result', 'params': {'session': session, 'outcome': outcome or result.lower()}}],
                                'open': [], 'queue': [], 'outcome': answer_of(result, summ, findings), 'data': d})


# ---- one scenario for every row of the table ----------------------------------------------------------------------------------------------------

put('gate2-1', scenario('B2 1: the keeper confirms the profile and the price (the word `confirm`); the volume fits, so the session is asked of the agent step', [
    s_start(), s_confirm()]))

put('scope-1', scenario('SCOPE 1: the volume fits -> SESSION: the request goes to the agent step with the session, and the nested machine asks its agent', [
    s_start('s1'), s_confirm()]))

put('scope-2', scenario('SCOPE 2: the volume does not fit -> B1: the keeper is told so and asked to repeat the launch or to stop it', [
    s_start(),
    step('feed', word('confirm'), host=host(scope='DoesNotFit'),
         expect={'state': 'Gate1', 'open': [], 'sent': [], 'outcome': 'none', 'journal': [], 'data': {'step_attempt': 0}})]))

put('gate1-1', scenario('B1 1: the keeper says repeat (the volume was changed by hand) -> B2 asks the profile again; the volume is measured again after the new confirm', [
    s_start(),
    step('feed', word('confirm'), host=host(scope='DoesNotFit'), expect={'state': 'Gate1'}),
    step('feed', word('repeat'), expect={'state': 'Gate2', 'open': [], 'sent': [], 'journal': [], 'data': {'stop_reason': ''}}),
    step('feed', word('confirm'), host=host(scope='Fits'), expect={'state': 'Session', 'open': [kid(1)], 'sent': kids(1)},
         also={kid(1): {'state': 'AgentTurn'}})]))

put('gate1-2', scenario('B1 2: the keeper says halt -> HALTED with the reason gate1_halt; the group of the agent is stopped, the refusal is StoppedByHuman', [
    s_start(),
    step('feed', word('confirm'), host=host(scope='DoesNotFit'), expect={'state': 'Gate1'}),
    step('feed', word('halt'),
         expect={'state': 'Halted', 'open': [], 'outcome': 'refusal:StoppedByHuman',
                 'journal': [{'code': 'session_launch_stopped', 'params': {'reason': 'gate1_halt'}}], 'data': {'stop_reason': 'gate1_halt'}})]))


# the answers and failures of the agent of the nested machine (the events of the scenarios of the agent step)
def agent_event(file, step_no=1):
    with open(os.path.join(OUT, file), encoding='utf8') as f:
        return json.load(f)['steps'][step_no]['event']


MODEL_REFUSED = agent_event('agent-step-agent-turn-4.scenario.test.json')
PERMANENT = agent_event('agent-step-agent-turn-7.scenario.test.json')
TIMEOUT = agent_event('agent-step-agent-turn-9.scenario.test.json')
CONNECTION_LOST = dict(TIMEOUT, code='ConnectionLost')


def s_kid_ends(event, k=1, code='NoResult'):
    """The agent of the nested machine fails: the nested machine stops with a refusal, which waits in the inbox of the parent."""
    return step('feed', dict(event, request='agent-1'), on=kid(k), expect={'state': 'Halted', 'open': [], 'outcome': 'refusal:' + code}, also={'parent': {'queue': ['in failure']}})


def s_pump_gate13(session='s3', reason='no_result', k=1):
    """The parent takes the refusal: the session did not finish, the keeper is asked (B13)."""
    return step('pump', expect={'state': 'Gate13Session', 'open': [], 'queue': [], 'outcome': 'none',
                                'journal': [{'code': 'session_not_finished', 'params': {'session': session, 'reason': reason}}],
                                'data': {'step_attempt': k, 'open_requests': []}})


def s_repeat13(k):
    """B13 'repeat': the session is entered again with a new request; the first nested machine has ended, the new one starts."""
    return step('feed', word('repeat'), expect={'state': 'Session', 'open': [kid(k)], 'sent': kids(k), 'journal': [], 'data': {'step_attempt': k, 'open_requests': [kid(k)]}},
                also={kid(k): {'state': 'AgentTurn', 'open': ['agent-1'], 'sent': ['agent-1']}})


def stop_signal(by=STOP_BY):
    return ev('signal', 'human_stop', input=by)


def continue_word(by=GO_BY):
    return ev('word', 'continue', input=by)


put('session-1', scenario('SESSION 1: the nested machine answers (the answer of its agent, validated) -> RESULT PARSING reads the artifact and the launch ends with the result', [
    s_start(), s_confirm(), s_kid_done(), s_pump_end()]))

put('session-2', scenario('SESSION 2: the nested machine refuses (the connection of its agent broke, the retries are its own) -> B13 asks the keeper; the journal says the session did not finish', [
    s_start(), s_confirm(), s_kid_ends(CONNECTION_LOST, code='ConnectionLost'), s_pump_gate13(reason='connection_lost')]))

put('result-parsing-1', scenario('RESULT PARSING 1: a check session with the number of the pass reads the summary line and the findings of the file and keeps them by the pass; the result is a question to the human', [
    s_start('s2', inp=sinput('s2', launch_pass=3), h=host(session='s2', result='Question', summ=summary(1, 3), findings=[finding('Essential', 'Plan', 'e1')]),
            data={'launch_pass': 3}),
    s_confirm(), s_kid_done(),
    s_pump_end('s2', 'Question', summ=summary(1, 3), findings=[finding('Essential', 'Plan', 'e1')],
               data={'result': variant('SessionResult', 'Question')})]))

put('gate13-1', scenario('B13 1: the keeper says repeat -> SESSION again with a new request and a new nested machine; B2 is not shown again (the profile is not asked twice)', [
    s_start(), s_confirm(), s_kid_ends(PERMANENT), s_pump_gate13(), s_repeat13(2)]))

put('gate13-2', scenario('B13 2: the keeper says halt -> HALTED with the reason gate13_halt; the refusal is StoppedByHuman', [
    s_start(), s_confirm(), s_kid_ends(MODEL_REFUSED, code='ModelRefused'), s_pump_gate13(reason='model_refused'),
    step('feed', word('halt'), expect={'state': 'Halted', 'open': [], 'outcome': 'refusal:StoppedByHuman',
                                       'journal': [{'code': 'session_launch_stopped', 'params': {'reason': 'gate13_halt'}}], 'data': {'stop_reason': 'gate13_halt'}})]))

put('pause-1', scenario('PAUSE 1: a human stopped the launch in the middle of the session (the nested request stays open, the stop is passed to the agent step) and says continue: the session goes on with the same request', [
    s_start(), s_confirm(),
    step('feed', stop_signal(), expect={'state': 'Pause', 'open': [kid(1)], 'cancelled': [], 'data': {'previous': 'Session', 'open_requests': [kid(1)]}},
         also={kid(1): {'state': 'Pause', 'cancelled': ['agent-1'], 'data': {'previous': 'AgentTurn'}}}),
    step('feed', continue_word(), expect={'state': 'Session', 'open': [kid(1)], 'sent': [kid(1)]},
         also={kid(1): {'state': 'AgentTurn', 'sent': ['agent-1', 'agent-2'], 'open': ['agent-2']}}),
    step('feed', dict(DONE_EVENT, request='agent-2'), on=kid(1), expect={'state': 'End'}, also={'parent': {'queue': ['in answer']}}),
    s_pump_end()]))

put('pause-2', scenario('PAUSE 2: the human says halt in the pause -> HALTED with the reason pause_halt; the halt is passed to the agent step, which ends with StoppedByHuman, the launch refuses the same', [
    s_start(), s_confirm(),
    step('feed', stop_signal(), expect={'state': 'Pause'}, also={kid(1): {'state': 'Pause'}}),
    step('feed', word('halt'), expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'open': [], 'queue': ['in failure'], 'data': {'stop_reason': 'pause_halt', 'previous': 'Session'}},
         also={kid(1): {'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'queue': []})]))

put('pause-3', scenario('PAUSE 3: the parent of the launch stops it (the signal with the id of the request) and then says continue: the launch is paused and goes on', [
    s_start(), s_confirm(),
    step('feed', ev('signal', 'parent_stop', input='up-1'), expect={'state': 'Pause', 'open': [kid(1)], 'data': {'previous': 'Session'}}, also={kid(1): {'state': 'Pause'}}),
    step('feed', ev('signal', 'parent_continue', input='up-1'), expect={'state': 'Session', 'open': [kid(1)], 'sent': [kid(1)]},
         also={kid(1): {'state': 'AgentTurn', 'sent': ['agent-1', 'agent-2'], 'open': ['agent-2']}})]))

put('pause-4', scenario('PAUSE 4: the parent of the launch stops it and then says halt: HALTED with the reason pause_halt', [
    s_start(), s_confirm(),
    step('feed', ev('signal', 'parent_stop', input='up-1'), expect={'state': 'Pause'}, also={kid(1): {'state': 'Pause'}}),
    step('feed', ev('signal', 'parent_halt', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'open': [], 'data': {'stop_reason': 'pause_halt'}},
         also={kid(1): {'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}})]))

put('common-1', scenario('COMMON 1: the stop of a human in a gate: the launch is paused there, the word of the human is journaled with its author and its source; no nested request is open', [
    s_start(),
    step('feed', stop_signal(), expect={'state': 'Pause', 'open': [], 'journal': [{'code': 'human_stop', 'params': {'author': 'ann', 'source': 'console', 'event': 'input-3'}}],
                                        'data': {'previous': 'Gate2'}})]))

put('common-2', scenario('COMMON 2: the stop of the parent in a gate: the launch is paused, the journal says that the parent did it', [
    s_start(),
    step('feed', ev('signal', 'parent_stop', input='up-1'),
         expect={'state': 'Pause', 'journal': [{'code': 'pause_by_parent_stop', 'params': {'request': 'up-1', 'event': 'input-3'}}], 'data': {'previous': 'Gate2'}})]))

put('common-3', scenario('COMMON 3: a cancel of another request is dropped with a line of the journal, the launch goes on', [
    s_start(),
    step('feed', ev('signal', 'cancel_request', input='other-9'),
         expect={'state': 'Gate2', 'outcome': 'none', 'journal': [{'code': 'cancel_discarded_foreign_request', 'params': {'request': 'other-9', 'event': 'input-3'}}]})]))

put('common-4', scenario('COMMON 4: a cancel of the request of the launch after its answer was given is dropped with a line of the journal', [
    s_start(),
    step('feed', word('confirm'), host=host(scope='DoesNotFit'), expect={'state': 'Gate1'}),
    step('feed', word('halt'), expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'journal': [{'code': 'cancel_discarded_already_replied', 'params': {'request': 'up-1', 'event': 'input-5'}}]})]))

put('common-5', scenario('COMMON 5: the cancel of the request of the launch in a gate: HALTED with the reason cancel_request, the refusal is Cancelled', [
    s_start(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [],
                 'journal': [{'code': 'request_cancelled', 'params': {'request': 'up-1', 'event': 'input-3'}}, {'code': 'session_launch_stopped', 'params': {'reason': 'cancel_request'}}],
                 'data': {'stop_reason': 'cancel_request'}})]))

put('end-end-1', scenario('END 1: the launch of a session from the runner (no number of a pass): the answer is the result of the session, the summary and the findings are empty', [
    s_start('s1', data={'launch_pass': None}), s_confirm(), s_kid_done(),
    step('pump', expect={'state': 'End', 'outcome': answer_of('Done'), 'queue': [], 'open': [],
                         'journal': [{'code': 'session_result', 'params': {'session': 's1', 'outcome': 'done'}}]})]))

put('end-halted-1', scenario('HALTED 1: the keeper stops the launch at B1 (the volume does not fit): the reason gate1_halt, the refusal StoppedByHuman', [
    s_start('s5'),
    step('feed', word('confirm'), host=host(scope='DoesNotFit', session='s5'), expect={'state': 'Gate1'}),
    step('feed', word('halt'), expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'data': {'stop_reason': 'gate1_halt'},
                                       'journal': [{'code': 'session_launch_stopped', 'params': {'reason': 'gate1_halt'}}]})]))

put('end-halted-2', scenario('HALTED 2: the halt in the pause: the reason pause_halt, the refusal StoppedByHuman', [
    s_start(),
    step('feed', stop_signal(), expect={'state': 'Pause'}),
    step('feed', word('halt'), expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'data': {'stop_reason': 'pause_halt'},
                                       'journal': [{'code': 'session_launch_stopped', 'params': {'reason': 'pause_halt'}}]})]))

put('end-halted-3', scenario('HALTED 3: the cancel of the request of the launch in the middle of the session: the reason cancel_request, the refusal Cancelled, the nested request is cancelled', [
    s_start(), s_confirm(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': [kid(1)], 'data': {'stop_reason': 'cancel_request'},
                 'journal': [{'code': 'request_cancelled', 'params': {'request': 'up-1', 'event': 'input-4'}}, {'code': 'session_launch_stopped', 'params': {'reason': 'cancel_request'}},
                             {'code': 'signal_ordered', 'params': {'signal': 'cancel', 'request': kid(1)}}, {'code': 'signal_passed', 'params': {'signal': 'cancel', 'request': kid(1)}}]},
         also={kid(1): {'state': 'Halted', 'outcome': 'refusal:Cancelled', 'cancelled': ['agent-1']}})]))


# ---- flows --------------------------------------------------------------------------------------------------------------------------------------------

def agent_reply(text):
    """An answer of the agent step as the parent reads it (a record `AgentReply`)."""
    usage = record('Usage', {
        'session': 's3', 'result': 'reply', 'family': 'claude', 'model': record('AgentModel', {'id': 'm1', 'provider': 'p', 'variant': None}),
        'tokens': record('TokenUsage', {'input': 10, 'output': 5, 'reasoning': None, 'cache_read': None, 'cache_write': None}), 'cost': None,
        'created': 1000, 'updated': 1000, 'context_used': None, 'trace': 't', 'step': 0})
    return record('AgentReply', {'text': text, 'artifact': None, 'usage': usage, 'request_started': 5})


def request_of(session, context, dialog_kind='main'):
    """The request of the agent step that the session builds: the kind of the caller, the profile of the host, the session, the dialog, the context of the host, no limits, the envelope."""
    return record('AgentRequest', {
        'kind': variant('CallerKind', 'CycleSession'),
        'profile': record('AgentProfile', {'family': 'claude', 'model': 'm1', 'effort': None}),
        'session': session, 'dialog_kind': dialog_kind, 'context': context,
        'limits': record('AgentLimits', {'silence_term': None, 'token_budget': None, 'cost_budget': None, 'turn_limit': None}),
        'trace': 't1000-chat-1', 'step': 3})


def s_confirm_with_request(session, context, dialog_kind='main', k=1):
    """B2 confirm; the nested machine holds the request that the session built (its data `agent_request`)."""
    st = s_confirm(k)
    st['also'][kid(k)]['data']['agent_request'] = request_of(session, context, dialog_kind)
    return st


put('flow-runner-done', scenario('FLOW: a session of the runner (no number of the pass, no phase): start, confirm, the agent answers, the result is Done and the summary and the findings are empty', [
    s_start('s1'), s_confirm(), s_kid_done(), s_pump_end('s1', data={'result': variant('SessionResult', 'Done')})]))

put('flow-review-pass', scenario('FLOW: a check session of the review of the cycle with the pass 3: the summary line and the findings are kept by the pass and go out with the answer', [
    s_start('s2', inp=sinput('s2', launch_pass=3, phase='implementation', source='file of pass 2', source_list='README.md'),
            h=host(session='s2', result='Done', summ=summary(1, 3), findings=[finding('Essential', 'Plan', 'e1'), finding('Superficial', 'Implementation', 'e2')]),
            data={'launch_pass': 3, 'phase': 'implementation', 'launch_source': 'file of pass 2', 'source_list': 'README.md'}),
    s_confirm(), s_kid_done(),
    s_pump_end('s2', 'Done', summ=summary(1, 3), findings=[finding('Essential', 'Plan', 'e1'), finding('Superficial', 'Implementation', 'e2')])]))

for result in ['Question', 'Revision', 'Plan', 'Requirements']:
    put('flow-result-' + result.lower(), scenario('FLOW: the artifact of the session ends with the stop word %s: the result of the launch says so, the machine does not branch on it' % result.lower(), [
        s_start('s1', h=host(session='s1', result=result)), s_confirm(), s_kid_done(), s_pump_end('s1', result)]))

put('flow-scope-retry', scenario('FLOW: the volume does not fit twice, the keeper repeats twice (B1 -> B2), then it fits and the session runs', [
    s_start(),
    step('feed', word('confirm'), host=host(scope='DoesNotFit'), expect={'state': 'Gate1', 'sent': []}),
    step('feed', word('repeat'), expect={'state': 'Gate2'}),
    step('feed', word('confirm'), expect={'state': 'Gate1'}),
    step('feed', word('repeat'), expect={'state': 'Gate2'}),
    step('feed', word('confirm'), host=host(scope='Fits'), expect={'state': 'Session', 'sent': kids(1)}, also={kid(1): {'state': 'AgentTurn'}}),
    s_kid_done(), s_pump_end()]))

put('flow-session-retry', scenario('FLOW: the nested machine refuses, B13 repeats the session with a new request (agent_step-2), the second nested machine answers', [
    s_start(), s_confirm(), s_kid_ends(PERMANENT), s_pump_gate13(), s_repeat13(2), s_kid_done(2),
    s_pump_end(data={'step_attempt': 2})]))

put('flow-retry-twice', scenario('FLOW: the session is repeated twice (agent_step-2, agent_step-3) and the third nested machine answers; the attempts are counted by the machine', [
    s_start(), s_confirm(), s_kid_ends(PERMANENT), s_pump_gate13(), s_repeat13(2), s_kid_ends(MODEL_REFUSED, 2, 'ModelRefused'), s_pump_gate13(reason='model_refused', k=2), s_repeat13(3),
    s_kid_done(3), s_pump_end(data={'step_attempt': 3})]))

put('flow-fail-connection', scenario('FLOW: the connection of the agent broke: the failure code reaches B13 as a word of the code', [
    s_start(), s_confirm(), s_kid_ends(CONNECTION_LOST, code='ConnectionLost'), s_pump_gate13(reason='connection_lost')]))

put('flow-fail-model-refused', scenario('FLOW: the model refused: the failure code reaches B13 as a word of the code', [
    s_start(), s_confirm(), s_kid_ends(MODEL_REFUSED, code='ModelRefused'), s_pump_gate13(reason='model_refused')]))

put('flow-fail-no-result', scenario('FLOW: the agent gave no result (a permanent error): the failure code reaches B13 as a word of the code', [
    s_start(), s_confirm(), s_kid_ends(PERMANENT), s_pump_gate13(reason='no_result')]))

put('flow-stop-in-gate2', scenario('FLOW: a human stops the launch at B2 and then says continue: the gate is entered again (no request: the gate waits for a word), the launch goes on', [
    s_start(),
    step('feed', stop_signal(), expect={'state': 'Pause', 'data': {'previous': 'Gate2'}}),
    step('feed', continue_word(), expect={'state': 'Gate2', 'journal': [{'code': 'human_continue', 'params': {'previous': 'Gate2', 'author': 'ann', 'source': 'console', 'event': 'input-4'}}]}),
    s_confirm()]))

put('flow-stop-in-gate13', scenario('FLOW: a human stops the launch at B13 and then says continue: B13 again; the session is repeated after it', [
    s_start(), s_confirm(), s_kid_ends(PERMANENT), s_pump_gate13(),
    step('feed', stop_signal(), expect={'state': 'Pause', 'data': {'previous': 'Gate13Session'}}),
    step('feed', continue_word(), expect={'state': 'Gate13Session'}),
    s_repeat13(2)]))

put('flow-pause-halt', scenario('FLOW: a human stops the launch while the agent works and halts it: both machines end with StoppedByHuman, the group of the agent is stopped', [
    s_start(), s_confirm(),
    step('feed', stop_signal(), expect={'state': 'Pause'}, also={kid(1): {'state': 'Pause'}}),
    step('feed', word('halt'), expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'open': [], 'data': {'stop_reason': 'pause_halt'}},
         also={kid(1): {'state': 'Halted', 'outcome': 'refusal:StoppedByHuman'}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:StoppedByHuman', 'queue': []})]))

put('flow-parent-stop', scenario('FLOW: the parent of the launch stops it and lets it go on while the agent works: the stop and the continue go to the agent step, which asks its agent again and answers', [
    s_start(), s_confirm(),
    step('feed', ev('signal', 'parent_stop', input='up-1'), expect={'state': 'Pause'}, also={kid(1): {'state': 'Pause'}}),
    step('feed', ev('signal', 'parent_continue', input='up-1'), expect={'state': 'Session'}, also={kid(1): {'state': 'AgentTurn', 'open': ['agent-2']}}),
    step('feed', dict(DONE_EVENT, request='agent-2'), on=kid(1), expect={'state': 'End'}, also={'parent': {'queue': ['in answer']}}),
    s_pump_end()]))

put('flow-cancel-midcall', scenario('FLOW: the cancel comes while the agent works: the nested request is cancelled, the nested machine ends with Cancelled, its reply is dropped', [
    s_start(), s_confirm(),
    step('feed', ev('signal', 'cancel_request', input='up-1'),
         expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': [kid(1)], 'queue': ['in failure'], 'data': {'stop_reason': 'cancel_request', 'open_requests': []}},
         also={kid(1): {'state': 'Halted', 'outcome': 'refusal:Cancelled'}}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': [], 'journal': []})]))

put('flow-cancel-answered', scenario('FLOW: the nested machine has answered and the parent has not taken the answer yet when the cancel comes: the answer is dropped, the launch is Cancelled', [
    s_start(), s_confirm(), s_kid_done(),
    step('feed', ev('signal', 'cancel_request', input='up-1'), expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': ['in answer']}),
    step('pump', expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'queue': [], 'journal': []})]))

put('flow-cancel-in-gate', scenario('FLOW: the cancel comes while the keeper decides at B2: no request to cancel, the launch is Cancelled', [
    s_start(),
    step('feed', ev('signal', 'cancel_request', input='up-1'), expect={'state': 'Halted', 'outcome': 'refusal:Cancelled', 'open': [], 'cancelled': []})]))

put('flow-restart-gate2', scenario('FLOW: the process restarts while the keeper decides at B2: the machine goes on from its snapshot and the keeper confirms', [
    s_start(),
    step('restart', expect={'state': 'Gate2', 'open': [], 'queue': []}),
    s_confirm()]))

put('flow-restart-midcall', scenario('FLOW: the process restarts in the middle of the session: the request to the agent step is sent again with the same identifier, the nested machine is not started twice', [
    s_start(), s_confirm(),
    step('restart', expect={'state': 'Session', 'open': [kid(1)], 'queue': ['send agent_step-1']}, also={kid(1): {'state': 'AgentTurn', 'sent': ['agent-1']}}),
    step('dispatch', expect={'sent': [kid(1), kid(1)], 'queue': []}, also={kid(1): {'state': 'AgentTurn', 'sent': ['agent-1'], 'open': ['agent-1']}}),
    s_kid_done(), s_pump_end()]))

put('flow-restart-kid', scenario('FLOW: the nested machine restarts in the middle (its process dies) and goes on from its snapshot; the session ends as usual', [
    s_start(), s_confirm(),
    step('restart', on=kid(1), expect={'state': 'AgentTurn', 'open': ['agent-1']}, also={'parent': {'state': 'Session', 'open': [kid(1)]}}),
    s_kid_done(), s_pump_end()]))

put('flow-restart-after-answer', scenario('FLOW: the nested machine has answered and the parent restarts before it takes the answer: the request is sent again, the ready answer comes again, one is taken, the other is dropped', [
    s_start(), s_confirm(), s_kid_done(),
    step('restart', expect={'state': 'Session', 'open': [kid(1)], 'queue': ['send agent_step-1', 'in answer']}),
    step('pump', expect={'state': 'End', 'outcome': answer_of('Done'), 'queue': ['in answer']}),
    step('pump', expect={'state': 'End', 'outcome': answer_of('Done'), 'queue': [], 'journal': []})]))

put('flow-death-between', scenario('FLOW: the process dies between the commit of the step into the session and the send of the request: the restart sends it once and the nested machine starts once', [
    s_start(),
    step('accept', word('confirm'), expect={'state': 'Session', 'open': [kid(1)], 'sent': [], 'queue': ['send agent_step-1']}),
    step('restart', expect={'state': 'Session', 'open': [kid(1)], 'sent': [], 'queue': ['send agent_step-1']}),
    step('dispatch', expect={'sent': [kid(1)], 'queue': []}, also={kid(1): {'state': 'AgentTurn', 'sent': ['agent-1'], 'open': ['agent-1']}}),
    s_kid_done(), s_pump_end()]))

put('flow-input-missing', scenario('FLOW: the input has no session: the call is refused with NoResult and the journal says what is missing; nothing is asked of anybody', [
    step('feed', ev('start', request='up-1', input={'task_dir': '/t', 'repo_dir': '/r', 'delivery_mode': 'files', 'route': 'full', 'delivery_short': False}), host=host(),
         expect={'outcome': 'refusal:NoResult', 'open': [], 'sent': [], 'journal': [{'code': 'input_rejected', 'params': {'reason': 'missing', 'field': 'session'}}]})]))

put('flow-input-type', scenario('FLOW: the number of the pass is negative: the type of the field is violated, the call is refused with NoResult', [
    step('feed', ev('start', request='up-1', input=sinput('s2', launch_pass=-1)), host=host(),
         expect={'outcome': 'refusal:NoResult', 'open': [], 'sent': [], 'journal': [{'code': 'input_rejected', 'params': {'reason': 'type', 'field': 'launch_pass'}}]})]))

put('flow-input-full', scenario('FLOW: every optional field of the input is given: the data keep them; the launch starts', [
    s_start('s4', inp=sinput('s4', source='the answers', phase='analysis', launch_pass=2, source_list='a.md, b.md', route='quick', delivery_short=True),
            data={'launch_source': 'the answers', 'phase': 'analysis', 'launch_pass': 2, 'source_list': 'a.md, b.md', 'route': 'quick', 'delivery_short': True, 'task_dir': '/t', 'repo_dir': '/r', 'delivery_mode': 'files'})]))

put('flow-input-absent', scenario('FLOW: the optional fields of the input are absent: they are none (the source is the empty text), the launch starts', [
    s_start('s1', data={'launch_source': '', 'phase': None, 'launch_pass': None, 'source_list': None, 'route': 'full', 'delivery_short': False})]))

put('flow-unknown-word', scenario('FLOW: the keeper says a word that B2 does not wait for (halt): the word is discarded with a line of the journal, the state is the same', [
    s_start(),
    step('feed', word('halt'), expect={'state': 'Gate2', 'outcome': 'none', 'journal': [{'code': 'event_ignored', 'params': {'event': 'halt', 'state': 'Gate2'}}]})]))

put('flow-late-answer', scenario('FLOW: the same reply of the nested machine comes twice: the first is taken, the second is dropped (one request - one answer)', [
    s_start(), s_confirm(), s_kid_done(),
    step('deliver', ev('answer', request='agent_step-1', input=lossless(agent_reply('again'))), expect={'queue': ['in answer', 'in answer']}),
    step('pump', expect={'state': 'End', 'queue': [], 'journal': [{'code': 'session_result', 'params': {'session': 's3', 'outcome': 'done'}}]}),
    step('pump', expect={'state': 'End', 'queue': [], 'journal': []})]))

put('flow-delivery-kind', scenario('FLOW: a session of the delivery (s7) asks the agent step for the delivery dialog; the request carries the prompt of the host', [
    s_start('s7'), s_confirm_with_request('s7', 'the prompt of s7', 'delivery')]))

put('flow-request-fields', scenario('FLOW: the request of the agent step: the kind of the caller (a cycle session), the profile and the context of the host, the session, the main dialog, no limits', [
    s_start('s3'), s_confirm_with_request('s3', 'the prompt of s3', 'main')]))


def write_all():
    os.makedirs(OUT, exist_ok=True)
    for name, sc in sorted(FILES.items()):
        with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
            f.write(json.dumps(sc, ensure_ascii=False, indent=2) + '\n')
    # the lines of data.nv: the scenarios of the session start stay together before the first `variants-` scenario
    with open(DATA, encoding='utf8', newline='') as f:
        text = f.read().replace('\r\n', '\n')
    lines = [l for l in text.split('\n') if not l.lstrip().startswith('NamedText { name: "session-')]
    new = ['    NamedText { name: "%s", text: embed_str("scenarios/%s") },' % (n, n) for n in sorted(FILES)]
    at = next(i for i, l in enumerate(lines) if 'name: "variants-' in l)
    lines[at:at] = new
    with open(DATA, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('wrote', len(FILES), 'scenarios')


if __name__ == '__main__':
    write_all()
