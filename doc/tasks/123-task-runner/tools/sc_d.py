"""Scenarios of the rows, group D: the delivery, the feedback, the ends, the pause and the common events."""
from gold import *
from sc_a import sl9
from sc_b import fg5

NORESULT = 'refusal:NoResult'
HUMAN = 'refusal:StoppedByHuman'
CONT = {'human_word': 'w', 'author': 'ann', 'source': 'console'}


def fg10a():
    """Gate10a on the fast route."""
    return fg8().word('other_decisions', {'owner_decisions': 'ok'}, 'SessionLaunch', open=['session_launch-2'], data={'session': 's7'}).sess(2, st='DeliveryReview', open=['loop_review-2']) \
        .h(tree_diff='diff').review(2, 'Clean', st='Gate10a')


def g7d():
    return dr4().review(4, 'Question', st='Gate7Delivery')


def round1(**host):
    """The delivery of the round 1 (after the feedback): the analysis of the feedback says 'С7' and the delivery starts again."""
    return sl9(**host).h(feedback_route='Маршрут: С7')


# ---- the delivery -----------------------------------------------------------------------------------------------------------------------------

R('DeliveryPhase', 1, 'a line of the report is not decided: the gate 8 of the delivery', g8().h(has_unresolved_line=True).word('other_decisions', {'owner_decisions': 'ok'}, 'Gate8Delivery'))
R('DeliveryPhase', 2, 'all lines are decided: the letter fork follows, the delivery session starts', sl7())
R('Gate8Delivery', 1, '"decisions recorded": the head of the cycle again, the delivery session starts',
  g8().h(has_unresolved_line=True).word('other_decisions', {'owner_decisions': 'ok'}, 'Gate8Delivery').h(has_unresolved_line=False).word('decisions_recorded', None, 'SessionLaunch', open=['session_launch-4'], data={'session': 's7'}))
R('DeliveryLetter', 1, 'the round is zero: the delivery session starts', sl7())
R('DeliveryLetter', 2, 'the round is above zero and there is no letter: the delivery session starts',
  round1().sess(7, st='SessionLaunch', open=['session_launch-8'], data={'session': 's7', 'continuation': 'delivery_main', 'feedback_round': 1}))
R('DeliveryLetter', 3, 'the round is above zero, the letter and the letter of the round are there: the delivery session starts',
  round1().h(customer_letter='l', round_letters='r1').sess(7, st='SessionLaunch', open=['session_launch-8'], data={'session': 's7'}))
R('DeliveryLetter', 4, 'the round is above zero, the letter is there and the letter of the round is not: the letter is renamed, the delivery session starts',
  round1().h(customer_letter='l', round_letters=None).sess(7, st='SessionLaunch', open=['session_launch-8'], data={'session': 's7'}))
R('LetterRenaming', 1, 'the letter of the previous round is renamed with the number of the round (the last, repeatable stage), the delivery session starts',
  round1().h(customer_letter='l', round_letters=None).sess(7, st='SessionLaunch', open=['session_launch-8'], data={'session': 's7', 'continuation': 'delivery_main'}))
R('DeliveryReview', 1, 'the nested check answers: the cycle of the delivery is kept, the report on secrets is looked at',
  dr4().h(tree_diff='diff').review(4, 'Clean', cycle=cyc(2, 1, 1, 0), st='Gate10a', data={'cycle': cycles(Delivery=cyc(2, 1, 1, 0)), 'review_stage': var('Stage', 'Delivery')}))
R('DeliveryReview', 2, 'the nested check fails: the journal says so, HALTED, the refusal NoResult',
  dr4().fail('loop_review', 4, 'NoResult', 'Halted', journal=[j('delivery_review_failed', reason='no_result'), j('runner_stopped', reason='review_no_result')], outcome=NORESULT))
R('Gate7Delivery', 1, '"implementation": the default is confirmed, the delivery starts again',
  g7d().word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-5'], journal=[j('default_confirmed')], data={'session': 's7'}))
R('Gate7Delivery', 2, '"plan": the correction of the implementation is queued, the correction of the plan starts',
  g7d().word('plan', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-5'], data={'session': 's3_fix', 'route_source': 'a'}))
R('Gate7Delivery', 3, '"requirements": the correction of the specification starts', g7d().word('requirements', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-5'], data={'session': 's1_fix'}))
R('DeliverySecrets', 1, 'there is no report on secrets: the gate 12', dr4().h(secrets_report=None, tree_diff='diff').review(4, 'Clean', st='Gate12'))
R('DeliverySecrets', 2, 'the report on secrets is there: the diff of the tree is looked at', g10a())
R('Gate12', 1, '"continue": the diff of the tree is looked at, the gate 10a',
  dr4().h(secrets_report=None, tree_diff='diff').review(4, 'Clean', st='Gate12').word('continue', CONT, 'Gate10a'))
R('DeliveryDiff', 1, 'the tree has no changes of code: the journal says so, the gate 10d (the texts only)',
  dr4().h(tree_diff='').review(4, 'Clean', st='Gate10d', journal=[j('delivery_no_code_changes')]))
R('DeliveryDiff', 2, 'the tree has changes: the gate 10a', g10a())
R('Gate10a', 1, '"allow the commit": the session of the commit starts', slc())
R('Gate10a', 2, '"full path" on the fast route: the work returns to the full route',
  fg10a().word('full_path', {'basis': 'b'}, 'SessionLaunch', data={'route': FULL, 'session': 's1'}, journal=[j('full_route_return', source='человек', basis='b'), j('route_recorded', route='полный', source='человек', basis='b'),
                                                                                                     j('edit_after_approval_specification')]))
R('DeliveryMessage', 1, 'the message of the commit differs from the prepared text: the gate 10b', slc().h(commit_message='x').sess(5, st='Gate10b'))
R('DeliveryMessage', 2, 'the message of the commit equals the prepared text: the gate 10c', g10c())
R('Gate10b', 1, '"continue": the gate 10c', slc().h(commit_message='x').sess(5, st='Gate10b').word('continue', CONT, 'Gate10c'))
R('Gate10c', 1, '"allow the push": the session of the push starts', slp())
R('Gate10d', 1, '"sent": the phase is the feedback, the gate 11', g11())
R('Gate11', 1, '"finish": the phase is completed, the end', g10d().word('sent', None, 'Gate11').word('finish', None, 'End', journal=[j('task_completed', feedback_rounds=0)], outcome=ends_answer(0), data={'phase': phase('Completed')}))
R('Gate11', 2, '"feedback": the number of the round grows, the feedback is saved and the analysis session starts', sl9())
R('FeedbackSaving', 1, 'the feedback of the customer is saved in the folder of the round, the session s9 starts', sl9())

# ---- the route of the feedback ------------------------------------------------------------------------------------------------------------

R('FeedbackRoute', 1, '"С1 правка": the correction of the implementation is queued, the work goes back to the requirements',
  sl9().h(feedback_route='Маршрут: С1 правка').sess(7, st='SessionLaunch', data={'session': 's1_fix', 'continuation': 'analysis_queue', 'route_source': 'файл разбора обратной связи раунда 1'}))
R('FeedbackRoute', 2, '"С3 правка": the work goes back to the plan', sl9().h(feedback_route='Маршрут: С3 правка').sess(7, st='SessionLaunch', data={'session': 's3_fix', 'continuation': 'plan_queue'}))
R('FeedbackRoute', 3, '"С5 правка": the phase is the implementation, the correction of the implementation starts',
  sl9().h(feedback_route='Маршрут: С5 правка').sess(7, st='SessionLaunch', data={'session': 's5_fix', 'continuation': 'implementation_queue', 'phase': phase('Implementation')}))
R('FeedbackRoute', 4, '"С7": the phase is the delivery', round1().sess(7, st='SessionLaunch', data={'phase': phase('Delivery'), 'session': 's7'}))
R('FeedbackRoute', 5, 'a line that is not one of the four: the machine error, the end ERRORED', sl9().h(feedback_route='Маршрут: ??').sess(7, st='Errored'))

R('ReviewFailure', 1, 'the human stopped the check: HALTED, the refusal StoppedByHuman',
  ar1().fail('loop_review', 1, 'StoppedByHuman', 'Halted', journal=[j('review_parsing_failed', reason='stopped_by_human'), j('runner_stopped', reason='review_stopped_by_human')], outcome=HUMAN, data={'stop_reason': 'review_stopped_by_human'}))
R('ReviewFailure', 2, 'the check has no result: HALTED, the refusal NoResult', ar1().fail('loop_review', 1, 'NoResult', 'Halted', outcome=NORESULT, data={'stop_reason': 'review_no_result'}))
R('ReviewFailure', 3, 'a code of failure that is not named: the machine error, the end ERRORED', ar1().fail('loop_review', 1, 'Timeout', 'Errored', outcome=NORESULT))

# ---- the ends -------------------------------------------------------------------------------------------------------------------------------

R('End', 1, 'the end writes the line of the completion with the number of the rounds, releases the lock and shows the human the text; the answer carries the number',
  sl9().h(feedback_route='Маршрут: С7').sess(7, st='SessionLaunch').sess(8, st='DeliveryReview', open=['loop_review-5']).review(5, 'Clean', st='Gate10a').word('allow_commit', None, 'SessionLaunch')
  .sess(9, st='Gate10c').word('allow_push', None, 'SessionLaunch').sess(10, st='Gate10d').word('sent', None, 'Gate11').word('finish', None, 'End', journal=[j('task_completed', feedback_rounds=1)], outcome=ends_answer(1)))
R('Halted', 1, 'busy by a live process: the refusal NoResult', S(run_preparation=prep('BusyByLiveProcess')).start('Halted', outcome=NORESULT, data={'stop_reason': 'task_busy_by_live_process'}))
R('Halted', 2, 'the check has no result: the refusal NoResult', ar1().fail('loop_review', 1, 'NoResult', 'Halted', outcome=NORESULT, data={'stop_reason': 'review_no_result'}))
R('Halted', 3, 'the launch has no result: the refusal NoResult', sl1().fail('session_launch', 1, 'NoResult', 'Halted', outcome=NORESULT, data={'stop_reason': 'session_launch_no_result'}))
R('Halted', 4, 'the settings of the full route break the invariants: the refusal NoResult',
  S(project_settings=settings(full=route_settings(4, 2, 2))).start('Gate14').word('full', {'basis': 'ok'}, 'Halted', outcome=NORESULT, data={'stop_reason': 'route_settings_violate_invariants'}))
R('Halted', 5, 'the human stopped (the gate 13): the refusal StoppedByHuman', S(run_preparation=prep('GroupNotStopped')).start('Gate13Preparation').word('halt', None, 'Halted', outcome=HUMAN))
R('Halted', 6, 'the cancel of the call: the refusal Cancelled', sl1().sig('cancel_request', UP, 'Halted', outcome='refusal:Cancelled', cancelled=['session_launch-1'], data={'stop_reason': 'cancel_request'}))
R('Errored', 1, 'the machine error: the end ERRORED, the refusal NoResult', S(specification=doc(True, 'InProgress')).start('Errored', outcome=NORESULT))

# ---- the pause and the common events ------------------------------------------------------------------------------------------------------

def paused():
    return sl1().sig('human_stop', stop_input(), 'Pause', journal=[j('human_stop', author='ann', source='console', event='input-4'), j('signal_ordered', signal='stop', request='session_launch-1')],
                     open=['session_launch-1'], data={'previous': 'SessionLaunch'})


def paused_by_parent():
    return sl1().sig('parent_stop', UP, 'Pause', journal=[j('pause_by_parent_stop', request=UP, event='input-4'), j('signal_ordered', signal='stop', request='session_launch-1')], open=['session_launch-1'])


R('Common', 1, 'the human stops the runner: the pause, the state before is kept, the signal goes to the nested launch, its request stays open', paused())
R('Common', 2, 'the parent stops the runner by the id of the call: the pause', paused_by_parent())
R('Common', 3, 'a cancel of another request is dropped with a line in the journal, the state is the same',
  sl1().sig('cancel_request', 'other-1', 'SessionLaunch', journal=[j('cancel_discarded_foreign_request', request='other-1', event='input-4')], open=['session_launch-1']))
R('Common', 4, 'a cancel of the call that is over is dropped with a line in the journal',
  g11().word('finish', None, 'End').sig('cancel_request', UP, 'End', journal=[j('cancel_discarded_already_replied', request=UP, event='input-23')]))
R('Common', 5, 'a cancel of the call: the request of the nested launch is cancelled, the end HALTED, the refusal Cancelled',
  sl1().sig('cancel_request', UP, 'Halted', journal=[j('request_cancelled', request=UP, event='input-4'), j('runner_stopped', reason='cancel_request'), j('signal_ordered', signal='cancel', request='session_launch-1')],
            cancelled=['session_launch-1'], outcome='refusal:Cancelled', data={'stop_reason': 'cancel_request'}))
R('Pause', 1, 'the human continues: the state before the stop is entered again, the request of the nested launch is the same',
  paused().word('continue', CONT, 'SessionLaunch', journal=[j('human_continue', previous='SessionLaunch', author='ann', source='console', event='input-5'), j('signal_ordered', signal='continue', request='session_launch-1')],
                open=['session_launch-1']))
R('Pause', 2, 'the human says "halt": HALTED, the refusal StoppedByHuman', paused().word('halt', None, 'Halted', journal=[j('runner_stopped', reason='pause_halt'), j('signal_ordered', signal='halt', request='session_launch-1')],
                                                                                outcome=HUMAN, cancelled=['session_launch-1'], data={'stop_reason': 'pause_halt'}))
R('Pause', 3, 'the parent says "continue": the state before the stop is entered again',
  paused_by_parent().sig('parent_continue', UP, 'SessionLaunch', journal=[j('parent_continue', previous='SessionLaunch', request=UP, event='input-5'), j('signal_ordered', signal='continue', request='session_launch-1')]))
R('Pause', 4, 'the parent says "halt": HALTED, the refusal StoppedByHuman',
  paused_by_parent().sig('parent_halt', UP, 'Halted', journal=[j('runner_stopped', reason='pause_halt'), j('signal_ordered', signal='halt', request='session_launch-1')], outcome=HUMAN,
                         cancelled=['session_launch-1'], data={'stop_reason': 'pause_halt'}))
