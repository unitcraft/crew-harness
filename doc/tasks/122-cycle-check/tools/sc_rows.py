"""The scenarios of the rows of the table "Cycle check": one scenario for every row of the table of the methodology that a sequence of events can take, named after it
(`cycle-<state>-<n>`); the rows "иначе" of the forks are defensive and no sequence takes them (SessionFailure 3 is the exception: a code of failure that is not named)."""
from cyclelib import *  # noqa: F401,F403

F = finding('Implementation', '')                     # an essential finding of the level "implementation", no evidence (no criterion)
DATE = '2026-10-20'
LOSS = 'the thin proof'
NOT_DOING = 'решение владельца: не делаю, ' + DATE


def counted(findings, out_of_scope=None, expect=None):
    """The word "counted" of the gate 3 with the essential findings and the findings "out of scope" of the pass."""
    return word('counted', {'gate3_findings': findings, 'pass_out_of_scope': out_of_scope or []}, expect)


def s(text):
    return 'файл проверки захода %d' % text


# ---------------------------------------------------------------------------------------------------------------------------------------------
# ВХОД_ПРОВЕРКИ (ReviewEntry), ЗАХОД (Pass)
# ---------------------------------------------------------------------------------------------------------------------------------------------

put('review-entry-1', 'ReviewEntry 1: the stage is the meeting: the numbers of the cycle are not read, the meeting is called',
    [begin(review_input('Meeting', clean_needed=0, probes_min=0, proposal='p', lens_order=['l1', 'l2'], author_question='q?'),
           e('MeetingCall', journal=[], open=['meeting-1'], sent=['meeting-1'], data={'stage': stage('Meeting'), 'meeting_attempt': 1}))])

put('review-entry-2', 'ReviewEntry 2: clean_needed below the minimum of the methodology: the machine error, the end ERRORED, the refusal NoResult',
    [begin(review_input('Analysis', clean_needed=0),
           e('Errored', journal=errored([], j('clean_needed_below_min'), clean_needed=0), open=[], sent=[], outcome='refusal:NoResult'))])

put('review-entry-3', 'ReviewEntry 3: probes_min below the minimum of the methodology: the machine error, the end ERRORED, the refusal NoResult',
    [begin(review_input('Analysis', probes_min=2),
           e('Errored', journal=errored([], j('probes_min_below_min'), probes_min=2), open=[], sent=[], outcome='refusal:NoResult'))])

put('review-entry-4', 'ReviewEntry 4: the numbers are not below the minimums: the check goes to PASS and asks the reviewer for the pass',
    [begin(review_input('Analysis', clean_needed=1, probes_min=3), launched(1, 's2', 1))])

put('pass-1', 'Pass 1: the stage is the meeting: the proposal, the order of the lenses and the question of the author go to the nested meeting',
    [begin(review_input('Meeting', proposal='the proposal', lens_order=['l1'], author_question=None),
           e('MeetingCall', journal=[], open=['meeting-1'], sent=['meeting-1'], data={'proposal': 'the proposal', 'lens_order': ['l1'], 'author_question': None}))])

put('pass-2', 'Pass 2: a stage other than the meeting and the series of clean passes is shorter than needed: the session of the reviewer of the stage, with the number of the pass',
    [begin(review_input('Analysis', cycle(3, 1, 1, 0)), launched(1, 's2', 3, extra={'launch_source': '', 'number': 3, 'streak': 1}))])

put('pass-3', 'Pass 3: the series of clean passes is full: the verdict is clean, the series goes back to zero, the answer carries the counters',
    [begin(review_input('Analysis', cycle(4, 1, 2, 0), clean_needed=2),
           e('End', journal=[end_line('Clean', '', 4, 1, 0, 0)], open=[], sent=[], outcome=answer_text('Clean', '', 4, 1, 0, 0), data={'streak': 0, 'verdict': verdict('Clean')}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# СОВЕЩАНИЕ (MeetingCall)
# ---------------------------------------------------------------------------------------------------------------------------------------------

MEETING = review_input('Meeting', proposal='the proposal', lens_order=['l1', 'l2'], author_question='q?')

put('meeting-1', 'MeetingCall 1: the nested meeting answers: the verdict is clean, the answer is the verdict with the counters of the cycle',
    [begin(MEETING, e('MeetingCall', open=['meeting-1'])),
     meeting_reply(1, meeting_result(), e('End', journal=[end_line('Clean', '', 1, 1, 0, 0)], open=[], outcome=answer_text('Clean', '', 1, 1, 0, 0), data={'verdict': verdict('Clean')}))])

put('meeting-2', 'MeetingCall 2: the nested meeting fails (the human stopped it): the failure is not passed up, the verdict is stopped',
    [begin(MEETING, e('MeetingCall', open=['meeting-1'])),
     meeting_refuse(1, 'StoppedByHuman', e('End', journal=[j('meeting_stopped', reason='stopped_by_human'), end_line('Stopped', '', 1, 1, 0, 0)], open=[],
                                              outcome=answer_text('Stopped', '', 1, 1, 0, 0), data={'verdict': verdict('Stopped')}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# ЗАПУСК_СЕССИИ (SessionLaunch), ОТКАЗ_СЕССИИ (SessionFailure), ПОСЛЕ_СЕССИИ (AfterSession)
# ---------------------------------------------------------------------------------------------------------------------------------------------

START = review_input('Analysis')

put('launch-1', 'SessionLaunch 1: the session answers: the result is kept, the summary and the findings of the pass are written, the way goes on to AfterSession and SummaryParsing',
    [begin(START, launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 3), [F]), e('Gate3', journal=[], open=[], sent=['session_launch-1'], data={'result': result_of('Done'), 'no_probes': 0}))])

put('launch-2', 'SessionLaunch 2: the session fails (the human stopped it): the failure is written, the way goes to SessionFailure and the end HALTED, the refusal StoppedByHuman',
    [begin(START, launched(1, 's2', 1)),
     refuse(1, 'StoppedByHuman', e('Halted', journal=[j('session_launch_failed', session='s2', reason='stopped_by_human'), j('review_stopped', reason='session_launch_stopped_by_human')],
                                   open=[], outcome='refusal:StoppedByHuman', data={'failure_reason': 'stopped_by_human', 'stop_reason': 'session_launch_stopped_by_human'}))])

put('failure-1', 'SessionFailure 1: the code of the failure is "stopped by human": the stop reason is the human, the end HALTED, the refusal StoppedByHuman',
    [begin(START, launched(1, 's2', 1)),
     refuse(1, 'StoppedByHuman', e('Halted', outcome='refusal:StoppedByHuman', data={'stop_reason': 'session_launch_stopped_by_human'}))])

put('failure-2', 'SessionFailure 2: the code of the failure is "no result": the end HALTED, the refusal NoResult',
    [begin(START, launched(1, 's2', 1)),
     refuse(1, 'NoResult', e('Halted', journal=[j('session_launch_failed', session='s2', reason='no_result'), j('review_stopped', reason='session_launch_no_result')],
                             outcome='refusal:NoResult', data={'failure_reason': 'no_result', 'stop_reason': 'session_launch_no_result'}))])

put('failure-3', 'SessionFailure 3: a code of the failure that the two rows do not name (a term): the machine error, the end ERRORED, the refusal NoResult',
    [begin(START, launched(1, 's2', 1)),
     refuse(1, 'Timeout', e('Errored', journal=errored([j('session_launch_failed', session='s2', reason='timeout')], j('fork_no_match', fork='SessionFailure'),
                                                       session='s2', launch_pass=1, continuation='review', failure_reason='timeout', session_attempt=1),
                            open=[], outcome='refusal:NoResult'))])

put('after-session-1', 'AfterSession 1: the session was a review: the way goes to the reading of the summary',
    [begin(START, launched(1, 's2', 1)),
     clean_review(1, e('Gate3', journal=[], data={'continuation': 'review'}))])

put('after-session-2', 'AfterSession 2: the session was a fix: the way goes to the outcome of the fix, the fix is done, the review goes again with the new number of the pass',
    [begin(START, launched(1, 's2', 1)),
     finding_review(1, [F], None),
     counted([F], None, launched(2, 's1_fix', 1, 'fix', extra={'number': 2})),
     fix_done(2, launched(3, 's2', 2, 'review', extra={'number': 2}))])

# the way to the gate 9: the cycle starts at the pass 5, the ceiling is 4, the review finds an essential finding, the pass is counted
def to_gate9(stage_name, session):
    return [begin(review_input(stage_name, cycle(5, 1, 0, 0), ceiling=4), launched(1, session, 5, extra={'number': 5})),
            finding_review(1, [F], None),
            counted([F], None, e('Gate9', journal=[], open=[], data={'number': 6, 'origin': 1}))]


put('after-session-3', 'AfterSession 3: the delivery stops by the word of the owner, the author of the fix "not doing" is asked, the session is done: the verdict is restart',
    to_gate9('Delivery', 's8') + [
        word('stop', DATE, launched(2, 's5_fix', 0, 'not_doing', extra={'launch_source': NOT_DOING, 'origin': 6})),
        fix_done(2, e('End', journal=[end_line('Restart', '', 6, 6, 0, 0)], open=[], outcome=answer_text('Restart', '', 6, 6, 0, 0), data={'verdict': verdict('Restart')}))])

put('after-session-4', 'AfterSession 4: the implementation stops by the word of the owner, the author of the fix "not doing" is asked, the session is done: the verdict is clean',
    to_gate9('Implementation', 's6') + [
        word('stop', DATE, launched(2, 's5_fix', 0, 'not_doing', extra={'launch_source': NOT_DOING, 'origin': 6})),
        fix_done(2, e('End', journal=[end_line('Clean', '', 6, 6, 0, 0)], open=[], outcome=answer_text('Clean', '', 6, 6, 0, 0), data={'verdict': verdict('Clean')}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# СВОДКА (SummaryParsing), БЕЗ_ПРОБ (NoProbes), ПОВТОР (Retry)
# ---------------------------------------------------------------------------------------------------------------------------------------------

put('summary-1', 'SummaryParsing 1: the file of the pass has no summary line: all the findings are essential, the number of the clean passes without probes is zero, the gate 3',
    [begin(START, launched(1, 's2', 1)),
     reply(1, launch_result('Done', None, [F]), e('Gate3', journal=[j('no_summary_line_all_significant')], data={'no_probes': 0, 'number': 1}))])

put('summary-2', 'SummaryParsing 2: the summary has essential findings: the gate 3',
    [begin(review_input('Analysis', cycle(1, 1, 0, 1)), launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(1, 3), [F]), e('Gate3', journal=[], data={'no_probes': 0}))])

put('summary-3', 'SummaryParsing 3: no essential findings and enough probes: the pass is clean with probes, the gate 3',
    [begin(START, launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 3), []), e('Gate3', journal=[], data={'no_probes': 0, 'number': 1}))])

put('summary-4', 'SummaryParsing 4: no essential findings and too few probes: the pass is not counted, the number of the pass grows, the clean passes without probes are counted',
    [begin(START, launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 1), []), launched(2, 's2', 2, extra={'number': 2, 'no_probes': 1}, journal=[j('pass_clean_without_probes', pass_=1)]))])

put('no-probes-1', 'NoProbes 1: the first clean pass without probes: the review goes again without asking anybody',
    [begin(START, launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 2), []), launched(2, 's2', 2, extra={'number': 2, 'no_probes': 1}))])

put('no-probes-2', 'NoProbes 2: the second clean pass without probes in a row: the gate 13 asks the human',
    [begin(review_input('Analysis', cycle(1, 1, 0, 1)), launched(1, 's2', 1)),
     reply(1, launch_result('Done', summary(0, 0), []), e('Retry', journal=[j('pass_clean_without_probes', pass_=1)], open=[], data={'number': 2, 'no_probes': 2}))])

NO_PROBES_TWICE = [begin(review_input('Analysis', cycle(1, 1, 0, 1)), launched(1, 's2', 1)),
                   reply(1, launch_result('Done', summary(0, 0), []), e('Retry', open=[]))]

put('retry-1', 'Retry 1: the human says "repeat": the review goes again with the same number of the pass',
    NO_PROBES_TWICE + [word('repeat', None, launched(2, 's2', 2, extra={'number': 2, 'no_probes': 2}, journal=[]))])

put('retry-2', 'Retry 2: the human says "halt": the end HALTED, the check is stopped with the refusal "stopped by human"',
    NO_PROBES_TWICE + [word('halt', None, e('Halted', journal=[j('review_stopped', reason='retry_halt')], outcome='refusal:StoppedByHuman', data={'stop_reason': 'retry_halt'}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# В3 (Gate3), ИТОГ_ЗАХОДА (PassOutcome), КРИТЕРИЙ_НЕ_СХОДИТСЯ (CriterionNotConverging)
# ---------------------------------------------------------------------------------------------------------------------------------------------

AT_GATE3 = [begin(START, launched(1, 's2', 1)), finding_review(1, [F], e('Gate3'))]

put('gate3-1', 'Gate3 1: the human says "not counted" (the probes are not probes): the pass is not counted, the number grows, the review goes again',
    AT_GATE3 + [word('not_counted', None, launched(2, 's2', 2, extra={'number': 2}, journal=[j('pass_probes_not_probes', pass_=1)]))])

OOS = finding('OutOfScope', 'far')

put('gate3-2', 'Gate3 2: the human says "counted": the number grows, the findings out of scope are kept apart, the essential findings go on',
    [begin(START, launched(1, 's2', 1)), finding_review(1, [OOS], e('Gate3')),
     counted([], [OOS], launched(2, 's2', 2, extra={'number': 2, 'streak': 1, 'out_of_scope': [OOS], 'gate3_findings': []}))])

put('outcome-1', 'PassOutcome 1: the counted pass has no essential findings: the series of the clean passes grows, the counters of the criteria go back to nothing',
    [begin(START, launched(1, 's2', 1)), clean_review(1, e('Gate3')),
     counted([], None, launched(2, 's2', 2, extra={'streak': 1, 'passes_by_evidence': []}))])

EVIDENCE = finding('Implementation', 'e1')

put('outcome-2', 'PassOutcome 2: the counted pass has an essential finding: the series breaks, the counter of the criterion is one, the way goes on to the fix',
    [begin(START, launched(1, 's2', 1)), finding_review(1, [EVIDENCE], e('Gate3')),
     counted([EVIDENCE], None, launched(2, 's1_fix', 1, 'fix', extra={'streak': 0, 'passes_by_evidence': [counter('e1', 1)], 'gate3_findings': [EVIDENCE]}))])

put('criterion-1', 'CriterionNotConverging 1: the largest counter is below the ceiling of the proof: the way goes on to the check of the ceiling of the passes and the fix',
    [begin(START, launched(1, 's2', 1)), finding_review(1, [EVIDENCE], e('Gate3')),
     counted([EVIDENCE], None, launched(2, 's1_fix', 1, 'fix', extra={'passes_by_evidence': [counter('e1', 1)]}))])


def rounds_to_gate15(findings_of_round, n=3, ceiling=9, stage_name='Analysis', checker='s2', fixer='s1_fix'):
    """n counted passes with the same criterion: the review, the word "counted", the fix; the last pass ends at the gate 15."""
    steps = [begin(review_input(stage_name, ceiling=ceiling), launched(1, checker, 1))]
    request = 1
    for k in range(1, n + 1):
        steps.append(finding_review(request, findings_of_round(k), e('Gate3', data={'number': k})))
        if k < n:
            steps.append(counted(findings_of_round(k), None, launched(request + 1, fixer, k, 'fix', extra={'number': k + 1, 'passes_by_evidence': [counter('e1', k)]})))
            steps.append(fix_done(request + 1, launched(request + 2, checker, k + 1, 'review', extra={'number': k + 1})))
            request += 2
        else:
            steps.append(counted(findings_of_round(k), None, e('Gate15', open=[], data={'number': n + 1, 'passes_by_evidence': [counter('e1', n)]})))
    return steps


put('criterion-2', 'CriterionNotConverging 2: the criterion stood among the essential findings of three counted passes: the gate 15 asks the owner',
    rounds_to_gate15(lambda k: [EVIDENCE]))

# ---------------------------------------------------------------------------------------------------------------------------------------------
# В15 (Gate15), ПОСЛЕ_СУЖЕНИЯ (AfterNarrowing)
# ---------------------------------------------------------------------------------------------------------------------------------------------

AT_GATE15 = rounds_to_gate15(lambda k: [EVIDENCE])
NOTE = 'сужено: ' + LOSS + '; доказательство: e1'

put('gate15-1', 'Gate15 1: the owner narrows the criterion and says what is lost: the record is made, the finding goes out of the essential ones, the counters of the reached go to zero',
    AT_GATE15 + [word('narrow', LOSS, launched(6, 's2', 4, 'review', extra={'number': 4, 'passes_by_evidence': [counter('e1', 0)], 'gate3_findings': [], 'narrowed': [NOTE], 'streak': 0},
                                                                                    journal=[j('owner_narrowed', loss=LOSS)]))])

put('gate15-2', 'Gate15 2: the owner says "another pass": the counters of the reached go to zero, the way goes on to the ceiling of the passes and the fix',
    AT_GATE15 + [word('another_pass', None, launched(6, 's1_fix', 3, 'fix', extra={'number': 4, 'passes_by_evidence': [counter('e1', 0)], 'narrowed': []}, journal=[]))])

put('gate15-3', 'Gate15 3: the owner says "stop": the counters go to zero, the stage is the analysis, so the fix by the findings goes on, as after "another pass"',
    AT_GATE15 + [word('stop', DATE, launched(6, 's1_fix', 3, 'fix', extra={'number': 4, 'passes_by_evidence': [counter('e1', 0)]}))])

put('narrowing-1', 'AfterNarrowing 1: no essential findings are left after the narrowing: the pass is not clean, the review goes again',
    AT_GATE15 + [word('narrow', LOSS, launched(6, 's2', 4, 'review', extra={'gate3_findings': [], 'streak': 0}))])

OTHER = finding('Implementation', 'f1')

put('narrowing-2', 'AfterNarrowing 2: essential findings are left after the narrowing: the way goes on to the ceiling of the passes and the fix of what is left',
    rounds_to_gate15(lambda k: [EVIDENCE, OTHER] if k == 3 else [EVIDENCE])[:-1] + [
        counted([EVIDENCE, OTHER], None, e('Gate15', data={'passes_by_evidence': [counter('e1', 3), counter('f1', 1)]})),
        word('narrow', LOSS, launched(6, 's1_fix', 3, 'fix', extra={'gate3_findings': [OTHER], 'passes_by_evidence': [counter('e1', 0), counter('f1', 1)], 'narrowed': [NOTE]}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# ПОТОЛОК (Ceiling), В9 (Gate9), СТАДИЯ_ОСТАНОВКИ (StopStage)
# ---------------------------------------------------------------------------------------------------------------------------------------------

put('ceiling-1', 'Ceiling 1: the passes since the origin are fewer than the ceiling: the way goes on to the levels and the fix',
    [begin(START, launched(1, 's2', 1)), finding_review(1, [F], e('Gate3')),
     counted([F], None, launched(2, 's1_fix', 1, 'fix', extra={'number': 2, 'origin': 1}))])

put('ceiling-2', 'Ceiling 2: the passes since the origin reached the ceiling: the gate 9 asks the human',
    to_gate9('Analysis', 's2'))

put('gate9-1', 'Gate9 1: the human says "cut the scope": the origin is the number of the pass, the verdict is requirements, the source is the file of the last pass',
    to_gate9('Analysis', 's2') + [word('cut_scope', None, e('End', journal=[end_line('Requirements', s(5), 6, 6, 0, 0)], open=[],
                                                          outcome=answer_text('Requirements', s(5), 6, 6, 0, 0), data={'origin': 6, 'verdict': verdict('Requirements'), 'verdict_source': s(5)}))])

put('gate9-2', 'Gate9 2: the human says "split": the same as "cut the scope"',
    to_gate9('Analysis', 's2') + [word('split', None, e('End', journal=[end_line('Requirements', s(5), 6, 6, 0, 0)], outcome=answer_text('Requirements', s(5), 6, 6, 0, 0),
                                                       data={'origin': 6, 'verdict_source': s(5)}))])

put('gate9-3', 'Gate9 3: the human says "ask the customer": the origin is the number of the pass, the verdict is question',
    to_gate9('Analysis', 's2') + [word('ask_customer', None, e('End', journal=[end_line('Question', '', 6, 6, 0, 0)], outcome=answer_text('Question', '', 6, 6, 0, 0),
                                                              data={'origin': 6, 'verdict': verdict('Question')}))])

put('gate9-4', 'Gate9 4: the human says "stop" and the date: the origin moves, the stage is the analysis, so the fix goes on by the findings',
    to_gate9('Analysis', 's2') + [word('stop', DATE, launched(2, 's1_fix', 5, 'fix', extra={'origin': 6, 'number': 6}))])

put('gate9-5', 'Gate9 5: the human says "another pass": the origin moves to the number of the pass, the way goes on to the levels and the fix',
    to_gate9('Analysis', 's2') + [word('another_pass', None, launched(2, 's1_fix', 5, 'fix', extra={'origin': 6, 'number': 6}))])

put('stop-stage-1', 'StopStage 1: the implementation stops: the author of the fix "not doing" is asked with the word of the owner and the date',
    to_gate9('Implementation', 's6') + [word('stop', DATE, launched(2, 's5_fix', 0, 'not_doing', extra={'launch_source': NOT_DOING}))])

put('stop-stage-2', 'StopStage 2: the delivery stops: the author of the fix "not doing" is asked with the word of the owner and the date',
    to_gate9('Delivery', 's8') + [word('stop', DATE, launched(2, 's5_fix', 0, 'not_doing', extra={'launch_source': NOT_DOING}))])

put('stop-stage-3', 'StopStage 3: the analysis stops: there is no decision "not doing", the fix by the findings goes on',
    to_gate9('Analysis', 's2') + [word('stop', DATE, launched(2, 's1_fix', 5, 'fix', extra={'launch_source': s(5)}))])

put('stop-stage-4', 'StopStage 4: the plan stops: there is no decision "not doing", the fix by the findings goes on with the author of the plan',
    to_gate9('Plan', 's4') + [word('stop', DATE, launched(2, 's3_fix', 5, 'fix', extra={'launch_source': s(5)}))])

# ---------------------------------------------------------------------------------------------------------------------------------------------
# УРОВНИ (Levels), ИТОГ_ПРАВКИ (FixOutcome)
# ---------------------------------------------------------------------------------------------------------------------------------------------

def levels(stage_name, checker, level, then):
    """One review with one essential finding of a level, counted at the pass 1; `then` is what the machine leaves."""
    f = finding(level, '')
    return [begin(review_input(stage_name), launched(1, checker, 1)), finding_review(1, [f], e('Gate3')), counted([f], None, then)]


put('levels-1', 'Levels 1: among the essential findings there is one of the level "requirements": the verdict is requirements, the source is the file of the last pass',
    levels('Analysis', 's2', 'Requirements', e('End', journal=[end_line('Requirements', s(1), 2, 1, 0, 0)], open=[], outcome=answer_text('Requirements', s(1), 2, 1, 0, 0),
                                              data={'verdict': verdict('Requirements'), 'verdict_source': s(1)})))

put('levels-2', 'Levels 2: no finding of the level "requirements" or "plan": the author of the stage fixes by the file of the last pass',
    levels('Analysis', 's2', 'Implementation', launched(2, 's1_fix', 1, 'fix', extra={'launch_source': s(1)})))

put('levels-3', 'Levels 3: a finding of the level "plan" at the implementation: the work goes back to the plan, the verdict is plan',
    levels('Implementation', 's6', 'Plan', e('End', journal=[end_line('Plan', s(1), 2, 1, 0, 0)], open=[], outcome=answer_text('Plan', s(1), 2, 1, 0, 0),
                                             data={'verdict': verdict('Plan'), 'verdict_source': s(1)})))

put('levels-4', 'Levels 4: a finding of the level "plan" at the delivery: the work goes back to the plan, the verdict is plan',
    levels('Delivery', 's8', 'Plan', e('End', journal=[end_line('Plan', s(1), 2, 1, 0, 0)], outcome=answer_text('Plan', s(1), 2, 1, 0, 0), data={'verdict': verdict('Plan')})))

put('levels-5', 'Levels 5: a finding of the level "plan" at the analysis: the author of the analysis fixes it',
    levels('Analysis', 's2', 'Plan', launched(2, 's1_fix', 1, 'fix', extra={'launch_source': s(1)})))

put('levels-6', 'Levels 6: a finding of the level "plan" at the plan: the author of the plan fixes it',
    levels('Plan', 's4', 'Plan', launched(2, 's3_fix', 1, 'fix', extra={'launch_source': s(1)})))


def fixed(result_name, then):
    f = finding('Implementation', '')
    return [begin(START, launched(1, 's2', 1)), finding_review(1, [f], e('Gate3')), counted([f], None, launched(2, 's1_fix', 1, 'fix')),
            reply(2, launch_result(result_name, None, None), then)]


put('fix-outcome-1', 'FixOutcome 1: the fix is done: the review goes again',
    fixed('Done', launched(3, 's2', 2, 'review', extra={'number': 2})))

put('fix-outcome-2', 'FixOutcome 2: the author stopped with a question: the verdict is question',
    fixed('Question', e('End', journal=[end_line('Question', '', 2, 1, 0, 0)], open=[], outcome=answer_text('Question', '', 2, 1, 0, 0), data={'verdict': verdict('Question')})))

put('fix-outcome-3', 'FixOutcome 3: the author asks for a revision of the base of the plan: the verdict is plan, the source is the artifact of the author',
    fixed('Revision', e('End', journal=[end_line('Plan', 'артефакт автора', 2, 1, 0, 0)], outcome=answer_text('Plan', 'артефакт автора', 2, 1, 0, 0),
                        data={'verdict': verdict('Plan'), 'verdict_source': 'артефакт автора'})))

put('fix-outcome-4', 'FixOutcome 4: the author says the plan needs a fix: the verdict is plan, the source is the artifact of the author',
    fixed('Plan', e('End', journal=[end_line('Plan', 'артефакт автора', 2, 1, 0, 0)], outcome=answer_text('Plan', 'артефакт автора', 2, 1, 0, 0), data={'verdict': verdict('Plan')})))

put('fix-outcome-5', 'FixOutcome 5: the author says the requirements need a fix: the verdict is requirements, the source is the artifact of the author',
    fixed('Requirements', e('End', journal=[end_line('Requirements', 'артефакт автора', 2, 1, 0, 0)], outcome=answer_text('Requirements', 'артефакт автора', 2, 1, 0, 0),
                            data={'verdict': verdict('Requirements')})))

# ---------------------------------------------------------------------------------------------------------------------------------------------
# ПАУЗА (Pause), общие события (common), концы (End, Halted, Errored)
# ---------------------------------------------------------------------------------------------------------------------------------------------

LAUNCHED = [begin(START, launched(1, 's2', 1))]

put('common-1', 'Common 1: the human stops the check: the pause, the state before is kept, the signal goes to the nested machine, its request stays open',
    LAUNCHED + [sig('human_stop', stop_input(), e('Pause', journal=[j('human_stop', author='ann', source='console', event='input-3'), j('signal_ordered', signal='stop', request='session_launch-1')], open=['session_launch-1'], cancelled=[],
                                                  data={'previous': 'SessionLaunch'}))])

put('common-2', 'Common 2: the parent stops the check by the id of the call: the pause',
    LAUNCHED + [sig('parent_stop', UP, e('Pause', journal=[j('pause_by_parent_stop', request=UP, event='input-3'), j('signal_ordered', signal='stop', request='session_launch-1')], open=['session_launch-1'], data={'previous': 'SessionLaunch'}))])

put('common-3', 'Common 3: a cancel of another request is dropped with a line in the journal, the state is the same',
    LAUNCHED + [sig('cancel_request', 'other-1', e('SessionLaunch', journal=[j('cancel_discarded_foreign_request', request='other-1', event='input-3')], open=['session_launch-1']))])

put('common-4', 'Common 4: a cancel of the call that is over (the answer is given) is dropped with a line in the journal',
    [begin(review_input('Analysis', cycle(4, 1, 2, 0)), e('End')),
     sig('cancel_request', UP, e('End', journal=[j('cancel_discarded_already_replied', request=UP, event='input-3')]))])

put('common-5', 'Common 5: a cancel of the call: the request of the nested machine is cancelled, the end HALTED, the refusal Cancelled',
    LAUNCHED + [sig('cancel_request', UP, e('Halted', journal=[j('request_cancelled', request=UP, event='input-3'), j('review_stopped', reason='cancel_request'), j('signal_ordered', signal='cancel', request='session_launch-1')], open=[],
                                           cancelled=['session_launch-1'], outcome='refusal:Cancelled', data={'stop_reason': 'cancel_request'}))])

PAUSED = LAUNCHED + [sig('human_stop', stop_input(), e('Pause'))]
PAUSED_BY_PARENT = LAUNCHED + [sig('parent_stop', UP, e('Pause'))]

put('pause-1', 'Pause 1: the human continues: the state before the stop is entered again, the request of the nested machine is the same',
    PAUSED + [word('continue', stop_input(), e('SessionLaunch', journal=[j('human_continue', previous='SessionLaunch', author='ann', source='console', event='input-4'), j('signal_ordered', signal='continue', request='session_launch-1')],
                                               open=['session_launch-1'], sent=['session_launch-1']))])

put('pause-2', 'Pause 2: the human says "halt": the end HALTED cancels the open request of the nested machine, the refusal "stopped by human"',
    PAUSED + [word('halt', None, e('Halted', journal=[j('review_stopped', reason='pause_halt'), j('signal_ordered', signal='halt', request='session_launch-1')], open=[], cancelled=['session_launch-1'],
                                   outcome='refusal:StoppedByHuman', data={'stop_reason': 'pause_halt'}))])

put('pause-3', 'Pause 3: the parent says "continue": the state before the stop is entered again',
    PAUSED_BY_PARENT + [sig('parent_continue', UP, e('SessionLaunch', journal=[j('parent_continue', previous='SessionLaunch', request=UP, event='input-4'), j('signal_ordered', signal='continue', request='session_launch-1')], open=['session_launch-1']))])

put('pause-4', 'Pause 4: the parent says "halt": the end HALTED cancels the open request of the nested machine, the refusal "stopped by human"',
    PAUSED_BY_PARENT + [sig('parent_halt', UP, e('Halted', journal=[j('review_stopped', reason='pause_halt'), j('signal_ordered', signal='halt', request='session_launch-1')], open=[], cancelled=['session_launch-1'],
                                                 outcome='refusal:StoppedByHuman', data={'stop_reason': 'pause_halt'}))])

put('end-end-1', 'End 1: the end writes the line of the state: the verdict, the source, the counters of the cycle and the number of the notes of the narrowing',
    [begin(review_input('Analysis', cycle(7, 3, 2, 0), clean_needed=2), e('End', journal=[end_line('Clean', '', 7, 3, 0, 0, 0)], outcome=answer_text('Clean', '', 7, 3, 0, 0)))])

put('end-halted-1', 'Halted 1: the stop reason is "no result" of the session launch: the refusal NoResult',
    [begin(START, launched(1, 's2', 1)), refuse(1, 'NoResult', e('Halted', outcome='refusal:NoResult'))])

put('end-halted-2', 'Halted 2: the stop reason is the human (the gate 13): the refusal StoppedByHuman',
    NO_PROBES_TWICE + [word('halt', None, e('Halted', outcome='refusal:StoppedByHuman'))])

put('end-halted-3', 'Halted 3: the stop reason is the cancel of the call: the refusal Cancelled',
    LAUNCHED + [sig('cancel_request', UP, e('Halted', outcome='refusal:Cancelled'))])

put('end-errored-1', 'Errored 1: a machine error: the end writes the note of the transition and the data, the refusal is NoResult',
    [begin(review_input('Analysis', clean_needed=0), e('Errored', outcome='refusal:NoResult'))])
