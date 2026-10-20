"""Scenarios of the rows, group A: the preparation, the head of the cycle, the launch of a session, the returns of the work (K_TREBOVANIYAM, K_PLANU)."""
from gold import *

H = var('PreparationStatus', 'Ready')
NORESULT = 'refusal:NoResult'
HUMAN = 'refusal:StoppedByHuman'


def started(**host):
    return S(**host)


# ---- the preparation ----------------------------------------------------------------------------------------------------------------------

R('Preparation', 1, 'the preparation of the executor brings the outcome and the counters of the four stages; the machine goes on to the head of the cycle',
  S(run_preparation=prep(Implementation=cyc(3, 2, 1, 0))).start('Gate14', data={'preparation_outcome': H, 'cycle': cycles(Implementation=cyc(3, 2, 1, 0))}))

R('PreparationOutcome', 1, 'ready and no return: the head of the cycle, the route is not chosen, the gate 14', g14())
R('PreparationOutcome', 3, 'busy by a live process: HALTED, the refusal NoResult, nothing else started',
  S(run_preparation=prep('BusyByLiveProcess')).start('Halted', journal=[j('runner_stopped', reason='task_busy_by_live_process')], outcome=NORESULT, data={'stop_reason': 'task_busy_by_live_process'}))
R('PreparationOutcome', 4, 'the tree is busy with another task: the gate "tree busy"', S(run_preparation=prep('TreeBusyByOtherTask')).start('TreeBusy', open=[]))
R('PreparationOutcome', 5, 'the group of the processes is not stopped: the gate 13 of the preparation', S(run_preparation=prep('GroupNotStopped')).start('Gate13Preparation', open=[]))

R('Gate13Preparation', 1, 'repeat: the preparation again, now ready, the head of the cycle',
  S(run_preparation=prep('GroupNotStopped')).start('Gate13Preparation').h(run_preparation=prep()).word('repeat', None, 'Gate14'))
R('Gate13Preparation', 2, 'halt: HALTED, the refusal StoppedByHuman',
  S(run_preparation=prep('GroupNotStopped')).start('Gate13Preparation').word('halt', None, 'Halted', journal=[j('runner_stopped', reason='gate13_halt')], outcome=HUMAN, data={'stop_reason': 'gate13_halt'}))
R('TreeBusy', 1, 'repeat: the preparation again, the tree is free, the head of the cycle',
  S(run_preparation=prep('TreeBusyByOtherTask')).start('TreeBusy').h(run_preparation=prep()).word('repeat', None, 'Gate14'))
R('TreeBusy', 2, 'halt: HALTED, the refusal StoppedByHuman',
  S(run_preparation=prep('TreeBusyByOtherTask')).start('TreeBusy').word('halt', None, 'Halted', journal=[j('runner_stopped', reason='tree_busy_halt')], outcome=HUMAN, data={'stop_reason': 'tree_busy_halt'}))

# ---- the head of the cycle ------------------------------------------------------------------------------------------------------------------

R('SpecificationReconciliation', 1, 'the status of the specification is not read: the gate 13 of the status', S(specification=doc(True, 'Unparsed')).start('Gate13Status'))
R('SpecificationReconciliation', 2, 'the full route, the specification is approved and the approval is not valid (the text was edited): the approval is taken off, the work goes on to the plan',
  g5a().h(specification=doc(True, 'Approved', h='HX')).word('confirmed', None, 'SessionLaunch', journal=[j('edit_after_approval_specification')], open=['session_launch-2'], data={'session': 's3'}))
R('SpecificationReconciliation', 3, 'the route is not chosen, the specification is approved and the approval is not valid: the approval is taken off, the gate 14 follows',
  S(specification=doc(True, 'Approved', h='HX')).start('Gate14', journal=[j('edit_after_approval_specification'), PROPOSED]))
R('SpecificationReconciliation', 4, 'the fast route, the copy of the brief was edited after the approval: the copy goes back to a draft (the host answers the same to the next read, so the next fork has no row: the error end)',
  fg8().h(specification=doc(True, 'Approved', h='HX')).word('other_decisions', {'owner_decisions': 'ok'}, 'Errored'))
R('SpecificationReconciliation', 5, 'there is no specification: the head of the cycle goes on', g14())
R('SpecificationReconciliation', 6, 'the specification is a draft: the head of the cycle goes on', S(specification=doc(True, 'Draft')).start('Gate14'))
R('SpecificationReconciliation', 7, 'the specification is approved and the approval is valid: the work goes on', sl3())
R('SpecificationReconciliation', 8, 'the status "in work" is not one of the three of a specification: the machine error, the end ERRORED', S(specification=doc(True, 'InProgress')).start('Errored'))

R('SpecificationSnapshot', 1, 'the approval of the specification is taken off: the file goes back to a draft, the record of the approval goes, the journal says so',
  S(specification=doc(True, 'Approved', h='HX')).start('Gate14', journal=[j('edit_after_approval_specification'), PROPOSED], data={'approvals': {'$dict': []}}))
R('CopySnapshot', 1, 'the fast route, the copy was edited: the phase goes back to the analysis, the series of the implementation and the delivery are zero, the record of the approval goes',
  fg8().h(specification=doc(True, 'Approved', h='HX')).word('other_decisions', {'owner_decisions': 'ok'}, 'Errored', data={'phase': phase('Analysis'), 'approvals': {'$dict': []}}))

R('PlanReconciliation', 1, 'the status of the plan is not read: the gate 13 of the status', S(task_plan=doc(True, 'Unparsed')).start('Gate13Status'))
R('PlanReconciliation', 2, 'the plan is approved and the approval is not valid: the approval is taken off', S(task_plan=doc(True, 'Approved', h='HX')).start('Gate14', journal=[j('edit_after_approval_plan'), PROPOSED]))
R('PlanReconciliation', 3, 'there is no plan: the phase switch follows', g14())
R('PlanReconciliation', 4, 'the plan is a draft: the phase switch follows', S(task_plan=doc(True, 'Draft')).start('Gate14'))
R('PlanReconciliation', 5, 'the plan is approved and the approval is valid: the phase switch follows', sl5())
R('PlanReconciliation', 6, 'the status "done" is not one of the three of a plan: the machine error, the end ERRORED', S(task_plan=doc(True, 'Done')).start('Errored'))
R('PlanSnapshot', 1, 'the approval of the plan is taken off: the file goes back to a draft, the record goes, the journal says so',
  S(task_plan=doc(True, 'Approved', h='HX')).start('Gate14', journal=[j('edit_after_approval_plan'), PROPOSED], data={'approvals': {'$dict': []}}))

R('Gate13Status', 1, 'repeat: the head of the cycle again', S(specification=doc(True, 'Unparsed')).start('Gate13Status').h(specification=doc(True, 'Draft')).word('repeat', None, 'Gate14'))
R('Gate13Status', 2, 'halt: HALTED, the refusal StoppedByHuman',
  S(specification=doc(True, 'Unparsed')).start('Gate13Status').word('halt', None, 'Halted', journal=[j('runner_stopped', reason='gate13_halt')], outcome=HUMAN, data={'stop_reason': 'gate13_halt'}))

R('PhaseSwitch', 1, 'the phase analysis: the analysis fork', g14())
R('PhaseSwitch', 2, 'the phase plan: the plan fork', sl3())
R('PhaseSwitch', 3, 'the phase implementation: the implementation fork', sl5())
R('PhaseSwitch', 4, 'the phase delivery: the delivery fork', sl7())
R('PhaseSwitch', 5, 'the phase feedback: the gate 11', g11())

# ---- the launch of a session ------------------------------------------------------------------------------------------------------------------

R('SessionLaunch', 1, 'the nested launch answers: the result of the session is kept, the work goes on to the continuation (the review of the analysis)',
  sl1().sess(1, st='AnalysisReview', data={'result': var('SessionResult', 'Done')}))
R('SessionLaunch', 2, 'the nested launch fails (no result): the journal says so, the end HALTED, the refusal NoResult',
  sl1().fail('session_launch', 1, 'NoResult', 'Halted', journal=[j('session_launch_failed', session='s1', reason='no_result'), j('runner_stopped', reason='session_launch_no_result')], outcome=NORESULT,
             data={'failure_reason': 'no_result', 'stop_reason': 'session_launch_no_result'}))
R('SessionFailure', 1, 'the human stopped the launch: HALTED, the refusal StoppedByHuman',
  sl1().fail('session_launch', 1, 'StoppedByHuman', 'Halted', journal=[j('session_launch_failed', session='s1', reason='stopped_by_human'), j('runner_stopped', reason='session_launch_stopped_by_human')], outcome=HUMAN,
             data={'stop_reason': 'session_launch_stopped_by_human'}))
R('SessionFailure', 2, 'the launch has no result: HALTED, the refusal NoResult', sl1().fail('session_launch', 1, 'NoResult', 'Halted', outcome=NORESULT, data={'stop_reason': 'session_launch_no_result'}))
R('SessionFailure', 3, 'a code of failure that is not named (the term): the machine error, the end ERRORED', sl1().fail('session_launch', 1, 'Timeout', 'Errored', outcome=NORESULT))


# ---- positions off the golden path ---------------------------------------------------------------------------------------------------------

def aq():
    """A queued session of the analysis (s1_fix, 'analysis_queue'): the plan review answers 'requirements'."""
    return pr2().review(2, 'Requirements', source='src', st='SessionLaunch', open=['session_launch-3'],
                        data={'session': 's1_fix', 'continuation': 'analysis_queue', 'phase': phase('Analysis'), 'route_source': 'src'})


def g4q():
    """Gate4Question: the queued session of the analysis stopped with a question."""
    return aq().sess(3, 'Question', st='Gate4Question')


def plq(**host):
    """A queued session of the plan (s3_fix, 'plan_queue'): the plan review asked a question, the human answered 'plan'."""
    return pr2(**host).review(2, 'Question', st='Gate7Plan').word('plan', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-3'],
                                                                    data={'session': 's3_fix', 'continuation': 'plan_queue', 'phase': phase('Plan')})


def iq():
    """A queued session of the implementation (s5_fix, 'implementation_queue'): the implementation review asked a question, the human answered 'implementation'."""
    return ir3().review(3, 'Question', st='Gate7Implementation').word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'],
                                                                       data={'session': 's5_fix', 'continuation': 'implementation_queue'})


def g7step():
    """Gate7ImplementationStep: the first session of the implementation stopped with a question."""
    return sl5().sess(3, 'Question', st='Gate7ImplementationStep')


def sl5x():
    """The continuation of the implementation (s5_extra): the human answered the question of the session."""
    return g7step().word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's5_extra', 'continuation': 'implementation_continuation'})


def sl9(**host):
    """The analysis of the feedback (s9)."""
    return g11(**host).word('feedback', {'feedback': 'f'}, 'SessionLaunch', open=['session_launch-7'], data={'feedback_round': 1, 'session': 's9', 'continuation': 'feedback_analysis'})


R('AfterSession', 1, 'the queued session of the analysis stopped with a question: the gate 4 after a question', g4q())
R('AfterSession', 2, 'the queued session of the analysis is done: the review of the analysis', aq().h(specification=doc(True, 'Draft')).sess(3, 'Done', st='AnalysisReview', open=['loop_review-3']))
R('AfterSession', 3, 'the first session of the analysis: the review of the analysis', ar1())
R('AfterSession', 4, 'the session of the return after a review: the head of the cycle, then the review again',
  ar1().review(1, 'Requirements', source='f1', st='SessionLaunch', open=['session_launch-2'], data={'session': 's1_fix', 'continuation': 'analysis_return', 'launch_source': 'f1'})
  .h(specification=doc(True, 'Draft')).sess(2, st='AnalysisReview', open=['loop_review-2']))
R('AfterSession', 5, 'the session after a question with answers: the start of the count of the analysis moves to the pass, the head of the cycle',
  g4q().word('answers', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'continuation': 'analysis_answers_after_question', 'customer_answers': 'a'})
  .h(specification=doc(True, 'Draft')).sess(4, st='AnalysisReview', open=['loop_review-3'], data={'cycle': cycles(Analysis=cyc(1, 1, 0, 0))}))
R('AfterSession', 6, 'the session after the answers: the specification goes to the approval',
  g4().word('answers', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'continuation': 'analysis_answers', 'session': 's1_fix', 'launch_source': 'Ответы'})
  .h(specification=doc(True, 'Draft')).sess(2, st='Gate5', data={'approval_document': SPEC}))
R('AfterSession', 7, 'the session after the answers that change the goal: the head of the cycle, then the review again',
  g4().word('answers_change_goal', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'continuation': 'analysis_answers_change_goal'})
  .h(specification=doc(True, 'Draft')).sess(2, st='AnalysisReview', open=['loop_review-2']))
R('AfterSession', 8, 'the queued session of the plan stopped with "requirements": the work goes back to the requirements',
  plq().sess(3, 'Requirements', st='SessionLaunch', open=['session_launch-4'], data={'route_source': 'последний абзац плана', 'session': 's1_fix', 'continuation': 'analysis_queue'}))
R('AfterSession', 9, 'the queued session of the plan stopped with a question: the gate 7 of the queue', plq().sess(3, 'Question', st='Gate7PlanQueue'))
R('AfterSession', 10, 'the queued session of the plan is done: the stop word of the plan is looked at, the plan review follows', plq().h(task_plan=doc(True, 'Draft')).sess(3, 'Done', st='PlanReview', open=['loop_review-3']))
R('AfterSession', 11, 'the first session of the plan: the stop word is looked at, the plan review follows', pr2())
R('AfterSession', 12, 'the session after the decisions: the start of the count of the plan moves to the pass, the plan review follows',
  g6().word('decisions_change_plan', {'plan_decisions': 'd'}, 'SessionLaunch', open=['session_launch-3'], data={'session': 's3_fix', 'continuation': 'plan_decided', 'launch_source': 'решено'})
  .sess(3, st='PlanReview', open=['loop_review-3']))
R('AfterSession', 13, 'the queued session of the implementation is done: the implementation review', iq().sess(4, st='ImplementationReview', open=['loop_review-4']))
R('AfterSession', 14, 'the first session of the implementation is done: the implementation review', ir3())
R('AfterSession', 15, 'the continuation of the implementation is done: the implementation review', sl5x().sess(4, st='ImplementationReview', open=['loop_review-3']))
R('AfterSession', 16, 'the delivery session is done: the delivery review', dr4())
R('AfterSession', 17, 'the commit is done: the message of the commit is compared with the prepared text, the gate of the push', g10c())
R('AfterSession', 18, 'the push is done: the gate 10d', g10d())
R('AfterSession', 19, 'the analysis of the feedback is done: the route of the feedback is read, the delivery goes again',
  sl9().h(feedback_route='Маршрут: С7').sess(7, st='SessionLaunch', open=['session_launch-8'], data={'phase': phase('Delivery'), 'session': 's7'}))

R('ToRequirements', 1, 'the plan review answers "requirements": both documents go back to drafts, the records go, the analysis starts with the correction of the specification, the plan with the correction of the plan',
  pr2().review(2, 'Requirements', source='src', st='SessionLaunch', open=['session_launch-3'], data={
      'approvals': {'$dict': []}, 'phase': phase('Analysis'), 'next_session': {'$dict': [[var('Phase', 'Plan'), 's3_fix'], [var('Phase', 'Analysis'), ''], [var('Phase', 'Implementation'), ''],
                                                                                         [var('Phase', 'Delivery'), ''], [var('Phase', 'Feedback'), ''], [var('Phase', 'Completed'), '']]}}))
R('ToPlan', 1, 'the human answers "plan": the plan goes back to a draft, the correction of the plan is queued', plq())
