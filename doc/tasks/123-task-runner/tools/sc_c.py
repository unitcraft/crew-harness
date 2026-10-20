"""Scenarios of the rows, group C: the phase plan, the phase implementation."""
from gold import *
from sc_a import aq, plq, iq, g7step, sl5x

NORESULT = 'refusal:NoResult'


def g7p():
    """Gate7Plan: the plan review ends with a question."""
    return pr2().review(2, 'Question', st='Gate7Plan')


def g7pq():
    """Gate7PlanQueue: the queued session of the plan stopped with a question."""
    return plq().sess(3, 'Question', st='Gate7PlanQueue')


def g7i():
    """Gate7Implementation: the implementation review ends with a question."""
    return ir3(last_implementation_review='rev.md').review(3, 'Question', st='Gate7Implementation')


# ---- the phase plan -----------------------------------------------------------------------------------------------------------------------------

R('PlanPhase', 1, 'the fast route and no correction of the plan is queued: the phase is skipped, the implementation starts', fsl5())
R('PlanPhase', 2, 'the fast route and a correction of the plan is queued (the implementation review asks for the plan): the work returns to the full route',
  fir1().review(1, 'Question', st='Gate7Implementation').word('plan', {'human_answer': 'a'}, 'SessionLaunch', data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue'}))
R('PlanPhase', 3, 'the full route and a correction of the plan is queued: the session of the queue starts', plq())
R('PlanPhase', 4, 'the full route and no plan: the first session of the plan', sl3())
R('PlanPhase', 5, 'the full route and the plan exists: the stop word is looked at', pr2())

R('PlanStopWord', 1, 'the session of the plan stopped with "requirements": the work goes back to the requirements',
  sl3().h(task_plan=doc(True, 'Draft', 'Requirements')).sess(2, st='SessionLaunch', open=['session_launch-3'], data={'route_source': 'последний абзац плана', 'session': 's1_fix', 'continuation': 'analysis_queue'}))
R('PlanStopWord', 2, 'any other stop word: the plan review', pr2())
R('PlanStopWord', 3, 'the plan is not there after the session: the machine error, the end ERRORED', sl3().h(task_plan=doc()).sess(2, st='Errored'))

R('PlanReview', 1, 'the nested check answers: the cycle of the plan and the verdict are kept',
  pr2().review(2, 'Clean', cycle=cyc(2, 1, 1, 0), st='Gate6', data={'cycle': cycles(Plan=cyc(2, 1, 1, 0)), 'review_stage': var('Stage', 'Plan'), 'review_verdict': var('Verdict', 'Clean')}))
R('PlanReview', 2, 'the nested check fails: the journal says so, HALTED, the refusal NoResult',
  pr2().fail('loop_review', 2, 'NoResult', 'Halted', journal=[j('plan_review_failed', reason='no_result'), j('runner_stopped', reason='review_no_result')], outcome=NORESULT))

R('Gate7PlanQueue', 1, '"implementation": the default is confirmed, the stop word of the plan is looked at, the plan review follows',
  g7pq().h(task_plan=doc(True, 'Draft')).word('implementation', {'human_answer': 'a'}, 'PlanReview', journal=[j('default_confirmed')], open=['loop_review-3']))
R('Gate7PlanQueue', 2, '"plan": the plan goes back to a draft, the correction of the plan is queued and starts',
  g7pq().word('plan', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix', 'continuation': 'plan_queue', 'route_source': 'a'}))
R('Gate7PlanQueue', 3, '"requirements": both documents go back to drafts, the correction of the specification starts',
  g7pq().word('requirements', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix', 'continuation': 'analysis_queue', 'route_source': 'a'}))
R('Gate7Plan', 1, '"implementation": the default is confirmed, the gate 6', g7p().word('implementation', {'human_answer': 'a'}, 'Gate6', journal=[j('default_confirmed')]))
R('Gate7Plan', 2, '"plan": the correction of the plan is queued and starts', plq())
R('Gate7Plan', 3, '"requirements": the correction of the specification starts', g7p().word('requirements', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-3'], data={'session': 's1_fix', 'route_source': 'a'}))

R('Gate6', 1, '"decisions do not change the plan": the decisions are recorded, the plan goes to the approval',
  g6().word('decisions_keep_plan', {'plan_decisions': 'd'}, 'Gate5', data={'plan_decisions': 'd', 'decisions_change_plan': False, 'approval_document': PLAN}))
R('Gate6', 2, '"decisions change the plan": the decisions are recorded, the session of the correction of the plan starts',
  g6().word('decisions_change_plan', {'plan_decisions': 'd'}, 'SessionLaunch', open=['session_launch-3'], data={'decisions_change_plan': True, 'session': 's3_fix', 'launch_source': 'решено', 'continuation': 'plan_decided'}))
R('DecisionsRecording', 1, 'the decisions of the human are written into the plan', g5b())
R('DecisionsOutcome', 1, 'the decisions change the plan: the session of the correction of the plan', g6().word('decisions_change_plan', {'plan_decisions': 'd'}, 'SessionLaunch', data={'session': 's3_fix'}))
R('DecisionsOutcome', 2, 'the decisions do not change the plan: the plan goes to the approval', g5b())

# ---- the phase implementation -------------------------------------------------------------------------------------------------------------

R('ImplementationPhase', 1, 'a correction of the implementation is queued: the session of the queue starts', iq())
R('ImplementationPhase', 2, 'there is no report: the first session of the implementation', sl5())
R('ImplementationPhase', 3, 'the report is "in work": the session of the implementation goes on',
  g5b().h(task_plan=doc(True, 'Approved', h='H2'), approval_by_document=approval('H2'), implementation_report=doc(True, 'InProgress')).word('confirmed', None, 'SessionLaunch', open=['session_launch-3'], data={'session': 's5'}))
R('ImplementationPhase', 4, 'the report is "done": the implementation review at once',
  g5b().h(task_plan=doc(True, 'Approved', h='H2'), approval_by_document=approval('H2'), implementation_report=doc(True, 'Done')).word('confirmed', None, 'ImplementationReview', open=['loop_review-3']))
R('ImplementationPhase', 5, 'the status of the report is not read: the gate 13 of the status',
  g5b().h(task_plan=doc(True, 'Approved', h='H2'), approval_by_document=approval('H2'), implementation_report=doc(True, 'Unparsed')).word('confirmed', None, 'Gate13Status'))
R('ImplementationPhase', 6, 'the report is a draft (not a status of a report): the machine error, the end ERRORED',
  g5b().h(task_plan=doc(True, 'Approved', h='H2'), approval_by_document=approval('H2'), implementation_report=doc(True, 'Draft')).word('confirmed', None, 'Errored'))

R('ImplementationOutcome', 1, 'the session is done: the implementation review', ir3())
R('ImplementationOutcome', 2, 'the session stopped with "revision": the correction of the plan is queued and starts (the approval of the plan is taken off)',
  sl5().sess(3, 'Revision', st='SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix', 'continuation': 'plan_queue', 'route_source': 'последний абзац отчёта реализации'}))
R('ImplementationOutcome', 3, 'the session stopped with "plan": the same', sl5().sess(3, 'Plan', st='SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix'}))
R('ImplementationOutcome', 4, 'the session stopped with "requirements": the correction of the specification starts', sl5().sess(3, 'Requirements', st='SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix'}))
R('ImplementationOutcome', 5, 'the session stopped with a question: the gate 7 of the step', g7step())

R('Gate7ImplementationStep', 1, '"implementation": the default is confirmed, the session goes on (s5_extra) with the answer as the source',
  g7step().word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], journal=[j('default_confirmed')], data={'session': 's5_extra', 'launch_source': 'a', 'continuation': 'implementation_continuation'}))
R('Gate7ImplementationStep', 2, '"plan": the correction of the plan starts', g7step().word('plan', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix', 'route_source': 'a'}))
R('Gate7ImplementationStep', 3, '"requirements": the correction of the specification starts', g7step().word('requirements', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix'}))

R('ImplementationReview', 1, 'the nested check answers: the cycle and the findings out of scope are kept, the last file of the review is read at the acceptance',
  ir3(last_implementation_review='rev.md').review(3, 'Clean', cycle=cyc(2, 1, 1, 0), out=[finding('OutOfScope', 'e')], st='Gate8',
                                                  data={'cycle': cycles(Implementation=cyc(2, 1, 1, 0)), 'last_review': 'rev.md', 'review_stage': var('Stage', 'Implementation')}))
R('ImplementationReview', 2, 'the nested check fails: the journal says so, HALTED, the refusal NoResult',
  ir3().fail('loop_review', 3, 'NoResult', 'Halted', journal=[j('implementation_review_failed', reason='no_result'), j('runner_stopped', reason='review_no_result')], outcome=NORESULT))
R('Gate7Implementation', 1, '"implementation": the correction of the implementation is queued with the answer added to the last file of the review as a fact',
  g7i().word('implementation', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's5_fix', 'launch_source': 'rev.md\nFACT: a', 'continuation': 'implementation_queue'}))
R('Gate7Implementation', 2, '"plan": the correction of the implementation is queued with the answer, the correction of the plan starts',
  g7i().word('plan', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix', 'continuation': 'plan_queue', 'route_source': 'a'}))
R('Gate7Implementation', 3, '"requirements": the correction of the specification starts', g7i().word('requirements', {'human_answer': 'a'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix', 'continuation': 'analysis_queue'}))

R('Gate8', 1, '"close by hand": the decisions are recorded, the gate 8 asks to confirm',
  g8().word('close_manually', {'owner_decisions': 'r'}, 'Gate8Confirmation', data={'owner_decisions': 'r', 'gate8_outcome': 'закрыть руками'}))
R('Gate8', 2, '"cut the scope": the correction is queued, the work goes back to the requirements', g8().word('cut_scope', {'owner_decisions': 'r'}, 'SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix', 'route_source': 'r'}))
R('Gate8', 3, '"other decisions": the decisions are recorded, the delivery starts', sl7())
R('Gate8', 4, '"full path" on the fast route: the work returns to the full route', fg8().word('full_path', {'basis': 'b'}, 'SessionLaunch', data={'route': FULL}))
R('OwnerDecisionsRecording', 1, 'the decisions of the owner are marked in the report, the findings out of scope are cleared, the start of the count of the implementation moves to the pass',
  ir3().review(3, 'Clean', cycle=cyc(3, 1, 1, 0), out=[finding('OutOfScope', 'e')], st='Gate8').word('close_manually', {'owner_decisions': 'r'}, 'Gate8Confirmation',
                                                                                                data={'out_of_scope': [], 'cycle': cycles(Implementation=cyc(3, 3, 1, 0))}))
R('Gate8Outcome', 1, '"close by hand": the gate asks to confirm', g8().word('close_manually', {'owner_decisions': 'r'}, 'Gate8Confirmation'))
R('Gate8Outcome', 2, '"cut the scope": the correction of the implementation is queued with the source "решение владельца", the work goes back to the requirements',
  g8().word('cut_scope', {'owner_decisions': 'r'}, 'SessionLaunch', data={'session': 's1_fix', 'route_source': 'r'}))
R('Gate8Outcome', 3, '"other decisions": the phase is the delivery', sl7())
R('Gate8Confirmation', 1, '"verified": the series of clean passes is zero, the implementation review starts again',
  ir3().review(3, 'Clean', cycle=cyc(3, 1, 1, 0), st='Gate8').word('close_manually', {'owner_decisions': 'r'}, 'Gate8Confirmation')
  .h(implementation_report=doc(True, 'Done')).word('verified', None, 'ImplementationReview', open=['loop_review-4'], data={'cycle': cycles(Implementation=cyc(3, 3, 0, 0))}))
