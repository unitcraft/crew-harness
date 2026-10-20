"""The flows of the machine "Cycle check": whole sequences through the machine: a clean cycle, a rework, a refusal, a restart, a death between the commit and the send, the pause,
the cancel, the ceiling, the narrowing, the verdicts of the stages."""
from cyclelib import *  # noqa: F401,F403
from sc_rows import F, DATE, LOSS, NOT_DOING, counted, s, rounds_to_gate15, EVIDENCE, NOTE, to_gate9, OOS

STAGE_CODES = {'Analysis': ('s2', 's1_fix'), 'Plan': ('s4', 's3_fix'), 'Implementation': ('s6', 's5_fix'), 'Delivery': ('s8', 's7_fix')}


def accept(event_step):
    """The same event, but the process dies after the commit and before the send: only the commit is made."""
    return dict(event_step, do='accept')


# ---- a clean cycle and a rework -------------------------------------------------------------------------------------------------------------

put('flow-clean', 'a clean cycle: two clean counted passes with enough probes end the check with the verdict clean',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     clean_review(1, e('Gate3', open=[])),
     counted([], None, launched(2, 's2', 2, extra={'number': 2, 'streak': 1})),
     clean_review(2, e('Gate3'), probes=5),
     counted([], None, e('End', journal=[end_line('Clean', '', 3, 1, 0, 0)], open=[], outcome=answer_text('Clean', '', 3, 1, 0, 0),
                         data={'number': 3, 'streak': 0, 'verdict': verdict('Clean'), 'session_attempt': 2}))])

put('flow-rework', 'a rework: the review of the implementation finds an essential finding, the author fixes it, then two clean passes end the check',
    [begin(review_input('Implementation'), launched(1, 's6', 1)),
     finding_review(1, [F], e('Gate3')),
     counted([F], None, launched(2, 's5_fix', 1, 'fix', extra={'number': 2, 'streak': 0})),
     fix_done(2, launched(3, 's6', 2, 'review', extra={'number': 2})),
     clean_review(3, e('Gate3')),
     counted([], None, launched(4, 's6', 3, 'review', extra={'number': 3, 'streak': 1})),
     clean_review(4, e('Gate3')),
     counted([], None, e('End', journal=[end_line('Clean', '', 4, 1, 0, 0)], outcome=answer_text('Clean', '', 4, 1, 0, 0), data={'number': 4, 'session_attempt': 4}))])

put('flow-refusal-stopped', 'a refusal: the human stops the check in the session of the reviewer after a rework: the end HALTED, the refusal StoppedByHuman',
    [begin(review_input('Implementation'), launched(1, 's6', 1)),
     finding_review(1, [F], e('Gate3')),
     counted([F], None, launched(2, 's5_fix', 1, 'fix')),
     fix_done(2, launched(3, 's6', 2, 'review')),
     refuse(3, 'StoppedByHuman', e('Halted', journal=[j('session_launch_failed', session='s6', reason='stopped_by_human'), j('review_stopped', reason='session_launch_stopped_by_human')],
                                  open=[], outcome='refusal:StoppedByHuman', data={'stop_reason': 'session_launch_stopped_by_human'}))])

put('flow-refusal-no-result', 'a refusal: the session of the fix gives no result: the end HALTED, the refusal NoResult',
    [begin(review_input('Plan'), launched(1, 's4', 1)),
     finding_review(1, [F], e('Gate3')),
     counted([F], None, launched(2, 's3_fix', 1, 'fix')),
     refuse(2, 'NoResult', e('Halted', journal=[j('session_launch_failed', session='s3_fix', reason='no_result'), j('review_stopped', reason='session_launch_no_result')],
                            outcome='refusal:NoResult'))])

# ---- restart and death between the commit and the send -------------------------------------------------------------------------------------

put('flow-restart-launch', 'a restart in the middle of the session: the journal gives back the state and the open request, nothing is sent again, the answer goes on',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     step('restart', expect=e('SessionLaunch', open=['session_launch-1'], queue=[], sent=['session_launch-1'])),
     clean_review(1, e('Gate3', open=[]))])

put('flow-restart-gate', 'a restart while the gate 3 waits for the word of the human: the state is the same, nothing is sent, the word goes on',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     clean_review(1, e('Gate3')),
     step('restart', expect=e('Gate3', open=[], queue=[], sent=['session_launch-1'])),
     counted([], None, launched(2, 's2', 2, extra={'number': 2, 'streak': 1}))])

put('flow-restart-end', 'a restart after the end: the answer is the same, nothing is sent',
    [begin(review_input('Analysis', cycle(4, 1, 2, 0)), e('End', outcome=answer_text('Clean', '', 4, 1, 0, 0))),
     step('restart', expect=e('End', outcome=answer_text('Clean', '', 4, 1, 0, 0), queue=[], open=[]))])

put('flow-death-start', 'the process dies between the commit of the start and the send: the restart sends the request once',
    [accept(begin(review_input('Analysis'), e('SessionLaunch', queue=['send session_launch-1'], open=['session_launch-1'], sent=[]))),
     step('restart', expect=e('SessionLaunch', sent=[])),
     step('dispatch', expect=e(queue=[], sent=['session_launch-1'])),
     step('dispatch', expect=e(sent=['session_launch-1'])),
     clean_review(1, e('Gate3'))])

put('flow-death-between', 'the process dies between the commit of the word of the gate 3 and the send of the next request: the restart sends it once',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     clean_review(1, e('Gate3')),
     accept(counted([], None, e('SessionLaunch', queue=['send session_launch-2'], open=['session_launch-2'], sent=['session_launch-1']))),
     step('restart', expect=e('SessionLaunch', sent=['session_launch-1'])),
     step('dispatch', expect=e(queue=[], sent=['session_launch-1', 'session_launch-2'])),
     clean_review(2, e('Gate3', open=[]))])

put('flow-meeting-restart', 'the meeting stage: a restart in the middle of the call gives back the open request, the answer ends the check with the verdict clean',
    [begin(review_input('Meeting', proposal='p', lens_order=['l1'], author_question=None), e('MeetingCall', open=['meeting-1'], sent=['meeting-1'])),
     step('restart', expect=e('MeetingCall', open=['meeting-1'], queue=[], sent=['meeting-1'])),
     meeting_reply(1, meeting_result(), e('End', open=[], outcome=answer_text('Clean', '', 1, 1, 0, 0)))])

# ---- the clean passes without probes ----------------------------------------------------------------------------------------------------------

put('flow-no-probes-repeat', 'two clean passes without probes in a row: the first goes again by itself, the second asks the human, who repeats; two passes with probes end the check',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 0), []), launched(2, 's2', 2, extra={'number': 2, 'no_probes': 1}, journal=[j('pass_clean_without_probes', pass_=1)])),
     reply(2, launch_result('Done', summary(0, 2), []), e('Retry', open=[], journal=[j('pass_clean_without_probes', pass_=2)], data={'number': 3, 'no_probes': 2})),
     word('repeat', None, launched(3, 's2', 3, extra={'number': 3})),
     clean_review(3, e('Gate3', data={'no_probes': 0})),
     counted([], None, launched(4, 's2', 4, extra={'number': 4, 'streak': 1})),
     clean_review(4, e('Gate3')),
     counted([], None, e('End', journal=[end_line('Clean', '', 5, 1, 0, 0)], outcome=answer_text('Clean', '', 5, 1, 0, 0)))])

put('flow-not-counted', 'the human does not count a pass (the probes are not probes): the number grows, the series does not, the review goes again',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     clean_review(1, e('Gate3')),
     word('not_counted', None, launched(2, 's2', 2, extra={'number': 2, 'streak': 0}, journal=[j('pass_probes_not_probes', pass_=1)])),
     clean_review(2, e('Gate3')),
     counted([], None, launched(3, 's2', 3, extra={'number': 3, 'streak': 1}))])

# ---- the ceiling, the narrowing ---------------------------------------------------------------------------------------------------------------


def passes_with_findings(n):
    """n counted passes with a finding, each with a fix, from the pass 1; the last pass is not fixed yet."""
    steps = [begin(review_input('Analysis', ceiling=4), launched(1, 's2', 1))]
    request = 1
    for k in range(1, n + 1):
        steps.append(finding_review(request, [F], e('Gate3')))
        if k < n:
            steps.append(counted([F], None, launched(request + 1, 's1_fix', k, 'fix', extra={'number': k + 1})))
            steps.append(fix_done(request + 1, launched(request + 2, 's2', k + 1, 'review', extra={'number': k + 1})))
            request += 2
        else:
            steps.append(counted([F], None, e('Gate9', open=[], data={'number': n + 1, 'origin': 1})))
    return steps


put('flow-ceiling-another-pass', 'the ceiling: four counted passes with findings reach the gate 9, "another pass" moves the origin, two clean passes end the check',
    passes_with_findings(4) + [
        word('another_pass', None, launched(8, 's1_fix', 4, 'fix', extra={'origin': 5, 'number': 5})),
        fix_done(8, launched(9, 's2', 5, 'review', extra={'number': 5})),
        clean_review(9, e('Gate3')),
        counted([], None, launched(10, 's2', 6, extra={'number': 6, 'streak': 1})),
        clean_review(10, e('Gate3')),
        counted([], None, e('End', journal=[end_line('Clean', '', 7, 5, 0, 0)], outcome=answer_text('Clean', '', 7, 5, 0, 0), data={'origin': 5}))])

put('flow-ceiling-cut-scope', 'the ceiling: the gate 9 after four counted passes, the human cuts the scope: the verdict is requirements with the file of the last pass',
    passes_with_findings(4) + [
        word('cut_scope', None, e('End', journal=[end_line('Requirements', s(4), 5, 5, 0, 0)], outcome=answer_text('Requirements', s(4), 5, 5, 0, 0)))])

put('flow-narrowing-clean', 'the narrowing: a criterion in three counted passes reaches the gate 15, the owner narrows it, two clean passes end the check, the end counts the note',
    rounds_to_gate15(lambda k: [EVIDENCE]) + [
        word('narrow', LOSS, launched(6, 's2', 4, 'review', extra={'gate3_findings': [], 'narrowed': [NOTE]}, journal=[j('owner_narrowed', loss=LOSS)])),
        clean_review(6, e('Gate3')),
        counted([], None, launched(7, 's2', 5, extra={'number': 5, 'streak': 1, 'passes_by_evidence': []})),
        clean_review(7, e('Gate3')),
        counted([], None, e('End', journal=[end_line('Clean', '', 6, 1, 0, 0, 1)], outcome=answer_text('Clean', '', 6, 1, 0, 0), data={'narrowed': [NOTE]}))])

put('flow-criterion-resets', 'a criterion that does not come back resets its counter: one pass with it, a clean pass, then it is counted from one again',
    [begin(review_input('Analysis', ceiling=9), launched(1, 's2', 1)),
     finding_review(1, [EVIDENCE], e('Gate3')),
     counted([EVIDENCE], None, launched(2, 's1_fix', 1, 'fix', extra={'passes_by_evidence': [counter('e1', 1)]})),
     fix_done(2, launched(3, 's2', 2, 'review')),
     clean_review(3, e('Gate3')),
     counted([], None, launched(4, 's2', 3, extra={'passes_by_evidence': [], 'streak': 1})),
     finding_review(4, [EVIDENCE], e('Gate3')),
     counted([EVIDENCE], None, launched(5, 's1_fix', 3, 'fix', extra={'passes_by_evidence': [counter('e1', 1)], 'streak': 0}))])

put('flow-implementation-stop', 'the owner stops the implementation at the gate 15: the author of the fix "not doing" is asked, the check ends with the verdict clean',
    rounds_to_gate15(lambda k: [EVIDENCE], stage_name='Implementation', checker='s6', fixer='s5_fix') + [
        word('stop', DATE, launched(6, 's5_fix', 0, 'not_doing', extra={'launch_source': NOT_DOING, 'passes_by_evidence': [counter('e1', 0)]})),
        fix_done(6, e('End', journal=[end_line('Clean', '', 4, 1, 0, 0)], outcome=answer_text('Clean', '', 4, 1, 0, 0)))])

# ---- the verdicts of the stages ---------------------------------------------------------------------------------------------------------------

put('flow-plan-verdict', 'the implementation: a clean pass, then a finding of the level "plan": the work goes back to the plan, the verdict is plan with the file of the last pass',
    [begin(review_input('Implementation'), launched(1, 's6', 1)),
     clean_review(1, e('Gate3')),
     counted([], None, launched(2, 's6', 2, extra={'number': 2, 'streak': 1})),
     finding_review(2, [finding('Plan', '')], e('Gate3')),
     counted([finding('Plan', '')], None, e('End', journal=[end_line('Plan', s(2), 3, 1, 0, 0)], outcome=answer_text('Plan', s(2), 3, 1, 0, 0)))])

OOS0 = finding('OutOfScope', 'old')
OOS1 = finding('OutOfScope', 'new')
REQ = finding('Requirements', '')

put('flow-requirements-verdict', 'the delivery: the findings out of scope go out with the answer, in the order they were found; a finding of the level "requirements" ends the check',
    [begin(review_input('Delivery', out_of_scope=[OOS0], delivery_short=True), launched(1, 's8', 1, extra={'out_of_scope': [OOS0], 'delivery_short': True})),
     reply(1, launch_result('Done', summary(1, 3), [REQ, OOS1]), e('Gate3')),
     counted([REQ], [OOS1], e('End', journal=[end_line('Requirements', s(1), 2, 1, 0, 0)], outcome=answer_text('Requirements', s(1), 2, 1, 0, 0, [OOS0, OOS1]),
                              data={'out_of_scope': [OOS0, OOS1]}))])

for name, (checker, fixer) in sorted(STAGE_CODES.items()):
    if name == 'Analysis':
        continue
    put('flow-codes-%s' % name.lower(), 'the codes of the sessions of the stage %s: the reviewer is %s, the author of the fix is %s' % (name, checker, fixer),
        [begin(review_input(name), launched(1, checker, 1)),
         finding_review(1, [F], e('Gate3')),
         counted([F], None, launched(2, fixer, 1, 'fix', extra={'launch_source': s(1)}))])

# ---- the pause and the cancel -----------------------------------------------------------------------------------------------------------------

put('flow-pause-at-gate', 'the human stops the check at the gate 3 and continues: the gate is entered again, nothing is sent, the word goes on',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     clean_review(1, e('Gate3')),
     sig('human_stop', stop_input(), e('Pause', journal=[j('human_stop', author='ann', source='console', event='input-4')], data={'previous': 'Gate3'})),
     word('continue', stop_input(), e('Gate3', journal=[j('human_continue', previous='Gate3', author='ann', source='console', event='input-5')], open=[])),
     counted([], None, launched(2, 's2', 2, extra={'number': 2, 'streak': 1}))])

put('flow-pause-answer-dropped', 'KNOWN GAP (rule 14, task 123): the answer of the nested machine comes on the pause and is dropped as event_ignored, not held; the continue enters the state again with no request open',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     sig('human_stop', stop_input(), e('Pause')),
     step('feed', ev('answer', request='session_launch-1', input=launch_result('Done', summary(0, 3), [])),
          expect=e('Pause', journal=[j('event_ignored', event='answer', state='Pause')], open=[], data={'summary': {'$dict': []}})),
     word('continue', stop_input(), e('SessionLaunch', open=[], sent=['session_launch-1'],
                                      journal=[j('human_continue', previous='SessionLaunch', author='ann', source='console', event='input-5'), j('signal_ordered', signal='continue', request='session_launch-1')]))])

put('flow-cancel-in-pause', 'the parent cancels the call while the check is on the pause: the end HALTED, the refusal Cancelled',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     sig('human_stop', stop_input(), e('Pause')),
     sig('cancel_request', UP, e('Halted', outcome='refusal:Cancelled', data={'stop_reason': 'cancel_request'}))])

put('flow-halt-in-pause', 'the human stops the check on the pause: the end HALTED, the refusal StoppedByHuman',
    [begin(review_input('Analysis'), launched(1, 's2', 1)),
     sig('human_stop', stop_input(), e('Pause')),
     word('halt', None, e('Halted', outcome='refusal:StoppedByHuman', data={'stop_reason': 'pause_halt'}))])

put('flow-meeting-stopped', 'the meeting stage: the human stops the nested meeting, the verdict is stopped and the answer is not a refusal',
    [begin(review_input('Meeting', proposal='p', lens_order=['l1', 'l2'], author_question='q?'), e('MeetingCall')),
     meeting_refuse(1, 'StoppedByHuman', e('End', journal=[j('meeting_stopped', reason='stopped_by_human'), end_line('Stopped', '', 1, 1, 0, 0)],
                                              outcome=answer_text('Stopped', '', 1, 1, 0, 0)))])

put('flow-input-below-minimum', 'the numbers below the minimums of the methodology end in ERRORED at once: nothing is sent, the refusal NoResult',
    [begin(review_input('Delivery', clean_needed=0, probes_min=1), e('Errored', open=[], sent=[], outcome='refusal:NoResult'))])
