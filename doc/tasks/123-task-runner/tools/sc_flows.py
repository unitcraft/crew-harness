"""Scenarios of the flows of the task runner: the two routes from the start to the end, the reworks, the restarts, the death between the commit and the send, the cancel, a word of another
party in the window, the pause with the answers held, and the flows with the real nested machines (the launch of a session, the agent step: three levels)."""
import json
import os
from gold import *
from sc_a import sl9, aq, g4q
from sc_b import fg5
from sc_c import g7i
from sc_d import fg10a, round1

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
NORESULT = 'refusal:NoResult'
HUMAN = 'refusal:StoppedByHuman'

# ---- the full route and the fast route ---------------------------------------------------------------------------------------------------------

FL('full-clean', 'the full route from the start to the end: the analysis, the plan, the implementation, the delivery, the commit, the push, the end; no round of the feedback',
   g11().word('finish', None, 'End', journal=[j('task_completed', feedback_rounds=0)], outcome=ends_answer(0), data={'phase': phase('Completed'), 'route': FULL}))
FL('fast-clean', 'the fast route from the start to the end: the word of the factory, one implementation session, one clean review, the gates 8, 10a to 10d, the end',
   fg10a().word('allow_commit', None, 'SessionLaunch', data={'session': 'commit'}).sess(3, st='Gate10c').word('allow_push', None, 'SessionLaunch').sess(4, st='Gate10d').word('sent', None, 'Gate11')
   .word('finish', None, 'End', journal=[j('task_completed', feedback_rounds=0)], outcome=ends_answer(0), data={'route': FAST}))
FL('fast-rework', 'the fast route: the review ends with a question, the human answers "implementation", the correction runs and the second review is clean',
   fir1(last_implementation_review='rev.md').review(1, 'Question', st='Gate7Implementation')
   .word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'session': 's5_fix', 'launch_source': 'rev.md\nFACT: a'})
   .sess(2, st='ImplementationReview', open=['loop_review-2']).review(2, 'Clean', st='Gate8'))
FL('fast-ceiling', 'the fast route: the review stops at the ceiling of the passes with a question, the human cuts the scope ("requirements"): the work returns to the full route',
   fir1().review(1, 'Question', st='Gate7Implementation').word('requirements', {'human_answer': 'a'}, 'SessionLaunch', data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue'}))
FL('fast-gate14', 'the gate 14: the word of the factory is empty, then given; the fast route goes on',
   g14().h(specification=doc(True, 'Approved', h='HB')).word('fast', fast_word(word=''), 'Gate14', journal=[j('factory_word_missing')]).word('fast', fast_word(), 'SessionLaunch', data={'route': FAST, 'session': 's5'}))
FL('fast-refused', 'the settings of the fast route are rejected: the gate 14 refusal, "accepted", the full route goes on to the first session of the analysis',
   S(project_settings=settings(fast=route_settings(2, 0, 3))).start('Gate14').word('fast', fast_word(), 'Gate14Refusal').word('accepted', None, 'SessionLaunch', data={'route': FULL, 'session': 's1'}))
FL('full-plan-question', 'the full route: the plan review ends with a question, the human answers "implementation", the gate 6 follows', pr2().review(2, 'Question', st='Gate7Plan').word('implementation', {'human_answer': 'a'}, 'Gate6'))
FL('full-edit-after-approval', 'the full route: the specification is edited after the approval: the approval is taken off, the phase stays, the delivery goes on',
   g8().h(specification=doc(True, 'Approved', h='HX')).word('other_decisions', {'owner_decisions': 'ok'}, 'SessionLaunch', journal=[j('edit_after_approval_specification')], data={'session': 's7', 'phase': phase('Delivery')}))
FL('full-no-code', 'the delivery without changes of code: the gate 10a, the commit and the push are skipped, the gate 10d, the end',
   dr4().h(tree_diff='').review(4, 'Clean', st='Gate10d', journal=[j('delivery_no_code_changes')]).word('sent', None, 'Gate11').word('finish', None, 'End'))
FL('full-feedback-round', 'the feedback: a round of the correction of the delivery (С7) and the end with one round',
   sl9().h(feedback_route='Маршрут: С7').sess(7, st='SessionLaunch', data={'feedback_round': 1, 'phase': phase('Delivery')}))
FL('full-secrets-gate', 'the report on secrets is missing: the gate 12 before the commit', dr4().h(secrets_report=None, tree_diff='diff').review(4, 'Clean', st='Gate12').word('continue', stop_input(), 'Gate10a'))
FL('full-commit-edited', 'the message of the commit was changed: the gate 10b, then the gate 10c', slc().h(commit_message='x').sess(5, st='Gate10b').word('continue', stop_input(), 'Gate10c'))

# ---- the restarts, the death, the cancel, a stranger -----------------------------------------------------------------------------------------

FL('restart-launch', 'a restart in the middle of the session: the journal gives back the state and the open request, nothing is sent again, the answer goes on',
   sl1().restart('SessionLaunch', open=['session_launch-1'], queue=[], sent=['session_launch-1']).sess(1, st='AnalysisReview'))
FL('restart-gate', 'a restart while the gate 4 waits for the word: the state is the same, the word goes on', g4().restart('Gate4', open=[], queue=[]).word('no_answers', None, 'Gate5').restart('Gate5'))
FL('restart-gate14', 'a restart at the gate 14: the proposal and the basis are the same, the classification does not run again, the word goes on',
   S().start('Gate14', journal=[PROPOSED]).restart('Gate14', journal=[], data={'route_proposal': 'полный', 'route_basis': 'признаки не записаны'}).word('full', {'basis': 'ok'}, 'SessionLaunch'))
FL('restart-end', 'a restart after the end: the answer is the same, nothing is sent', g11().word('finish', None, 'End', outcome=ends_answer(0)).restart('End', outcome=ends_answer(0), queue=[], open=[]))
FL('death-start', 'the process dies between the commit of the word of the gate 14 and the send of the first request: the restart sends it once',
   acc(g14().word('full', {'basis': 'ok'}, 'SessionLaunch', queue=['send session_launch-1'], open=['session_launch-1'], sent=[])).restart('SessionLaunch', sent=[])
   .step(None, e(queue=[], sent=['session_launch-1']), do='dispatch').step(None, e(sent=['session_launch-1']), do='dispatch').sess(1, st='AnalysisReview'))
FL('death-between', 'the process dies between the commit of the word of the gate 5 and the send of the next request: the restart sends it once',
   acc(g5a().h(specification=doc(True, 'Approved', h='H1')).word('confirmed', None, 'SessionLaunch', queue=['send session_launch-2'], open=['session_launch-2'], sent=['session_launch-1', 'loop_review-1']))
   .restart('SessionLaunch', sent=['session_launch-1', 'loop_review-1']).step(None, e(queue=[], sent=['session_launch-1', 'loop_review-1', 'session_launch-2']), do='dispatch').h(task_plan=doc(True, 'Draft')).sess(2, st='PlanReview'))
FL('cancel-in-gate', 'the parent cancels the call while the gate 4 waits: HALTED, the refusal Cancelled', g4().sig('cancel_request', UP, 'Halted', outcome='refusal:Cancelled', data={'stop_reason': 'cancel_request'}))
FL('stranger-in-window', 'an answer of a request that is not open (a stranger in the window) at the gate 14 is discarded: the state is the same',
   S().start('Gate14').sess(1, st='Gate14').word('full', {'basis': 'ok'}, 'SessionLaunch'))
FL('stop-at-gate', 'the human stops the runner at the gate 4: the pause; "continue" enters the gate again', g4().sig('human_stop', stop_input(), 'Pause', data={'previous': 'Gate4'}).word('continue', stop_input(), 'Gate4'))

# ---- the pause: the answers are held (rule 14) -------------------------------------------------------------------------------------------

FL('pause-answer-held', 'the answer of the nested launch comes on the pause: it is held, "continue" enters the state again, takes the answer and the review of the analysis starts',
   sl1().sig('human_stop', stop_input(), 'Pause', open=['session_launch-1']).sess(1, st='Pause', journal=[j('answer_held', request='session_launch-1', state='Pause')], data={'open_requests': ['session_launch-1']})
   .word('continue', stop_input(), 'AnalysisReview', open=['loop_review-1'], journal=[j('human_continue', previous='SessionLaunch', author='ann', source='console', event='input-6'),
                                                                                   j('answer_replayed', request='session_launch-1'), j('signal_ordered', signal='continue', request='session_launch-1')],
         data={'open_requests': ['loop_review-1']}))
FL('pause-failure-held', 'the refusal of the nested launch comes on the pause: it is held, "continue" takes it: HALTED, the refusal NoResult',
   sl1().sig('human_stop', stop_input(), 'Pause').fail('session_launch', 1, 'NoResult', 'Pause').word('continue', stop_input(), 'Halted', outcome=NORESULT, data={'stop_reason': 'session_launch_no_result'}))

# ---- with the real nested machines: the runner, the launch of a session, the agent step -------------------------------------------------------------


def nested_host():
    base = json.load(open(os.path.join(ROOT, 'src', 'machine', 'scenarios', 'session-flow-runner-done.scenario.test.json'), encoding='utf-8'))
    return base['steps'][0]['host'], base['steps'][2]['event']


HOST_SESSION, AGENT_ANSWER = nested_host()


def nest_s1():
    s = S(**HOST_SESSION).start('Gate14')
    return s.word('full', {'basis': 'ok'}, 'SessionLaunch', open=['session_launch-1'], also={'session_launch-1': {'state': 'Gate2'}})


def nest_session():
    s = nest_s1()
    return s.step({'kind': 'word', 'name': 'confirm'}, e('Session', open=['agent_step-1']), on='session_launch-1', also={'agent_step-1': {'state': 'AgentTurn'}})


FL('nested-launch', 'the runner calls the launch of a session, which calls the agent step (two levels below the runner): the agent answers, the launch ends with the result, the runner takes it and goes to the review of the analysis',
   nest_session().step(AGENT_ANSWER, e('End'), on='session_launch-1/agent_step-1').pump(on='session_launch-1', st='End').pump('AnalysisReview', open=['loop_review-1'], also={'loop_review-1': {'state': 'SessionLaunch'}}), nested=True)
FL('nested-review', 'the runner calls the cycle check, which calls the launch of the session of the reviewer (the third level) and its agent step (the fourth): the states of the four machines are those of the tables',
   nest_session().step(AGENT_ANSWER, e('End'), on='session_launch-1/agent_step-1').pump(on='session_launch-1', st='End').pump('AnalysisReview', open=['loop_review-1'])
   .step({'kind': 'word', 'name': 'confirm'}, e('Session'), on='loop_review-1/session_launch-1', also={'loop_review-1/session_launch-1/agent_step-1': {'state': 'AgentTurn'}}), nested=True)
FL('nested-pause', 'the human stops the runner while the launch and the agent step run: the stop goes down the two levels as signals, the nested machines wait on their pauses, "continue" goes down and they work on',
   nest_session().sig('human_stop', stop_input(), 'Pause', also={'session_launch-1': {'state': 'Pause'}, 'session_launch-1/agent_step-1': {'state': 'Pause'}})
   .word('continue', stop_input(), 'SessionLaunch', also={'session_launch-1': {'state': 'Session'}}), nested=True)
FL('nested-cancel', 'the parent cancels the runner while the launch and the agent step run: the cancel goes down, the runner ends HALTED with Cancelled, the nested machines end with Cancelled',
   nest_session().sig('cancel_request', UP, 'Halted', outcome='refusal:Cancelled', also={'session_launch-1': {'state': 'Halted'}}), nested=True)
FL('nested-held', 'the launch ends while the runner is stopped between the end and the pump: the answer comes on the pause, the runner holds it, "continue" takes it and the review of the analysis starts',
   nest_session().step(AGENT_ANSWER, e('End'), on='session_launch-1/agent_step-1').pump(on='session_launch-1', st='End').sig('human_stop', stop_input(), 'Pause')
   .pump('Pause', journal=[j('answer_held', request='session_launch-1', state='Pause')]).word('continue', stop_input(), 'AnalysisReview', open=['loop_review-1']), nested=True)
