"""Scenarios of the rows, group B: the route of the task, the approval, the phase analysis."""
from gold import *
from sc_a import aq, g4q, plq, iq

HUMAN = 'refusal:StoppedByHuman'
NORESULT = 'refusal:NoResult'


def proposed(proposal, source, basis):
    return j('route_proposed', proposal=proposal, source=source, basis=basis)


def fg5():
    """Gate5 on the fast route: the copy of the brief was edited (it is a draft)."""
    return g14().h(specification=doc(True, 'Draft')).word('fast', fast_word(), 'Gate5', data={'route': FAST, 'approval_document': SPEC}, open=[])


def rec_line(route, source, basis):
    return j('route_recorded', route=route, source=source, basis=basis)


# ---- the classification of the route ---------------------------------------------------------------------------------------------------------

R('RouteClassification', 1, 'there are no features in the brief: "full", the basis "features are not written", the rule',
  S().start('Gate14', journal=[proposed('полный', 'правило', 'признаки не записаны')], data={'route_proposal': 'полный', 'route_basis': 'признаки не записаны', 'route_choice_source': 'правило'}))
R('RouteClassification', 2, 'the features are incomplete (no goal, no number of sources): "full", the basis names the missing ones',
  S(route_features=features(goal='', sources=None)).start('Gate14', journal=[proposed('полный', 'правило', 'признаки неполны: goal, sources')], data={'route_basis': 'признаки неполны: goal, sources'}))
R('RouteClassification', 3, 'the features are complete and the helper proposes "full": "full", the source "helper"',
  S(route_features=features(helper='полный')).start('Gate14', journal=[proposed('полный', 'помощник', 'помощник предложил полный маршрут')], data={'route_choice_source': 'помощник'}))
R('RouteClassification', 4, 'a feature is over the threshold (five sources, three allowed): "full", the basis names it',
  S(route_features=features(sources=5, irreversible='Confirmed')).start('Gate14', journal=[proposed('полный', 'правило', 'признак выходит за порог: sources, irreversible')], data={'route_basis': 'признак выходит за порог: sources, irreversible'}))
R('RouteClassification', 5, 'all the features are within the thresholds: "fast"',
  S(route_features=features()).start('Gate14', journal=[proposed('быстрый', 'правило', 'все признаки в пределах порогов')], data={'route_proposal': 'быстрый'}))

R('Gate14', 1, 'the human chooses "fast" and gives the word of the factory: the route is fast, the copy of the brief is the approved specification, the implementation starts', fsl5())
R('Gate14', 2, 'the human chooses "full": the route is full, the numbers of the cycle are those of the full route, the first session of the analysis', sl1())
R('Gate14Refusal', 1, 'the settings of the fast route are rejected (clean passes below the minimum): the gate 14 refusal; "accepted" leads to the check of the full route and the full route goes on',
  S(project_settings=settings(fast=route_settings(2, 0, 3))).start('Gate14').word('fast', fast_word(), 'Gate14Refusal', data={'route': FULL, 'route_proposal': 'полный', 'route_choice_source': 'правило'},
                                                                       journal=[j('fast_route_settings_rejected', reason='чистых заходов подряд меньше минимума')])
  .word('accepted', None, 'SessionLaunch', open=['session_launch-1'], data={'session': 's1', 'clean_needed': 2}))

R('FactoryWord', 1, 'the word of the factory and its date are named: the check of the settings of the route follows', fsl5())
R('FactoryWord', 2, 'the word of the factory is empty: the fast route is not accepted, the gate 14 again',
  g14().word('fast', fast_word(word=''), 'Gate14', journal=[j('factory_word_missing')], data={'route': '', 'route_basis': 'слово завода не названо: быстрый маршрут не принят', 'route_choice_source': 'правило'}))
R('FactoryWord', 3, 'the date of the word is empty: the fast route is not accepted, the gate 14 again',
  g14().word('fast', fast_word(date=''), 'Gate14', journal=[j('factory_word_date_missing')], data={'route': '', 'route_basis': 'дата слова завода не названа: быстрый маршрут не принят'}))

R('RouteCheck', 1, 'the full route, the settings are allowed: the route is recorded', sl1())
R('RouteCheck', 2, 'the full route, the settings are not allowed (clean passes below the minimum): HALTED, the refusal NoResult, no other route',
  S(project_settings=settings(full=route_settings(4, 0, 3))).start('Gate14').word('full', {'basis': 'ok'}, 'Halted', outcome=NORESULT, data={'stop_reason': 'route_settings_violate_invariants'},
                                                                         journal=[j('full_route_settings_rejected', reason='чистых заходов подряд меньше минимума'), j('runner_stopped', reason='route_settings_violate_invariants')]))
R('RouteCheck', 3, 'the fast route, the settings are allowed: the route is recorded', fsl5())
R('RouteCheck', 4, 'the fast route, the settings are not allowed (probes below the minimum): the route becomes "full" and the gate 14 refusal shows the basis',
  S(project_settings=settings(fast=route_settings(2, 1, 2))).start('Gate14').word('fast', fast_word(), 'Gate14Refusal', data={'route': FULL, 'route_basis': 'настройки быстрого маршрута отклонены: проб в чистом заходе меньше минимума'},
                                                                       journal=[j('fast_route_settings_rejected', reason='проб в чистом заходе меньше минимума')]))

R('RouteRecording', 1, 'the full route: the numbers of the cycle are taken from the settings of the full route',
  g14().word('full', {'basis': 'ok'}, 'SessionLaunch', journal=[rec_line('полный', 'человек', 'ok')], data={'clean_needed': 2, 'ceiling': 4, 'probes_min': 3, 'delivery_short': False}))
R('RouteRecording', 2, 'the fast route: the numbers of the cycle are taken from the settings of the fast route',
  g14().h(specification=doc(True, 'Approved', h='HB'), project_settings=settings(fast=route_settings(2, 1, 3, short=True))).word('fast', fast_word(), 'SessionLaunch',
                                                                                                                             data={'clean_needed': 1, 'ceiling': 2, 'probes_min': 3, 'delivery_short': True}))

R('BriefCheck', 1, 'the brief is complete: the copy of the brief is made', fsl5())
R('BriefCheck', 2, 'the brief is not complete: the work returns to the full route (the analysis starts again)',
  g14().h(brief_complete=False).word('fast', fast_word(), 'SessionLaunch', open=['session_launch-1'], data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue'},
                                     journal=[rec_line('быстрый', 'человек', 'b'), j('fast_route_brief_incomplete'),
                                              j('full_route_return', source='правило', basis='постановка неполна: нужны критерии AC-N и строка Ветка:'),
                                              rec_line('полный', 'правило', 'постановка неполна: нужны критерии AC-N и строка Ветка:')]))
R('BriefCopy', 1, 'the copy of the brief is made: the record of the approval is written first, then the file; the journal names the word',
  g14().h(specification=doc(True, 'Approved', h='HB')).word('fast', fast_word(), 'SessionLaunch', journal=[rec_line('быстрый', 'человек', 'b'), j('brief_copy_created', factory_word='заводи 1'), j('fast_route_copy_approved'),
                                                                                                       j('fast_route_plan_phase_skipped')],
                                                              data={'approvals': {'$dict': [[SPEC, approval('HB')]]}, 'factory_word': 'заводи 1', 'factory_word_date': '2026-10-20'}))
R('FullPathReturn', 1, 'the human at the gate 8 of the fast route says "full path": the route is full, the analysis starts from s1, the series of the implementation and the delivery are zero, the record of the approval goes',
  fg8().word('full_path', {'basis': 'b'}, 'SessionLaunch', open=['session_launch-2'], data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue', 'approvals': {'$dict': []}},
             journal=[j('full_route_return', source='человек', basis='b'), rec_line('полный', 'человек', 'b'), j('edit_after_approval_specification')]))

# ---- the approval -------------------------------------------------------------------------------------------------------------------------------

R('ApprovalCheck', 1, 'the document on the approval is marked approved but the approval is not valid: the question "is it your approval?"',
  g4().h(specification=doc(True, 'Approved', h='HX')).word('no_answers', None, 'ForeignApproval', open=[], data={'approval_document': SPEC}))
R('ApprovalCheck', 2, 'the document on the approval is a draft: the gate 5', g5a())
R('ForeignApproval', 1, '"yours": the gate 5',
  g4().h(specification=doc(True, 'Approved', h='HX')).word('no_answers', None, 'ForeignApproval').word('yours', None, 'Gate5'))
R('ForeignApproval', 2, '"not yours": the file goes back to a draft, the journal says so, the gate 5',
  g4().h(specification=doc(True, 'Approved', h='HX')).word('no_answers', None, 'ForeignApproval').word('not_yours', None, 'Gate5', journal=[j('foreign_approval_cleared', document='specification')]))
R('ForeignSnapshot', 1, 'the foreign approval is taken off: the file is a draft, the journal names the document',
  g4().h(specification=doc(True, 'Approved', h='HX')).word('no_answers', None, 'ForeignApproval').word('not_yours', None, 'Gate5', journal=[j('foreign_approval_cleared', document='specification')]))
R('Gate5', 1, '"confirmed": the approval is recorded and the work goes on to the plan', sl3())
R('Gate5', 2, '"full path" on the fast route: the work returns to the full route (the copy was edited)',
  fg5().word('full_path', {'basis': 'b'}, 'SessionLaunch', open=['session_launch-1'], data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue'},
             journal=[j('full_route_return', source='человек', basis='b'), rec_line('полный', 'человек', 'b')]))
R('ApprovalRecording', 1, 'the approval of the specification is written: the date, who, the hash of the text', sl3())
R('AfterApproval', 1, 'the specification is approved: the phase is the plan', sl3())
R('AfterApproval', 2, 'the plan is approved: the phase is the implementation', sl5())

# ---- the phase analysis -----------------------------------------------------------------------------------------------------------------------

R('ReviewParsing', 1, 'the route is not chosen: the classification of the route', g14())
R('ReviewParsing', 2, 'the fast route, the copy is approved and valid: the approval is passed, the phase plan is skipped', fsl5())
R('ReviewParsing', 3, 'the fast route, the copy was edited (it is a draft): the approval is asked again', fg5())
R('ReviewParsing', 4, 'the fast route and there is no brief copy: the work returns to the full route',
  g14().word('fast', fast_word(), 'SessionLaunch', journal=[rec_line('быстрый', 'человек', 'b'), j('brief_copy_created', factory_word='заводи 1'), j('fast_route_no_brief'),
                                                            j('full_route_return', source='правило', basis='постановки нет: утверждать нечего'), rec_line('полный', 'правило', 'постановки нет: утверждать нечего')],
             data={'route': FULL, 'session': 's1', 'continuation': 'analysis_queue'}))
R('ReviewParsing', 5, 'the fast route and a correction of the requirements is queued: the work returns to the full route',
  fg8().word('cut_scope', {'owner_decisions': 'x'}, 'SessionLaunch', data={'route': FULL, 'continuation': 'analysis_queue'}))
R('ReviewParsing', 6, 'the full route and a correction is queued: the session of the queue starts', aq())
R('ReviewParsing', 7, 'the full route, no specification: the first session of the analysis', sl1())
R('ReviewParsing', 8, 'the full route, the specification exists: the review of the analysis',
  ar1().review(1, 'Requirements', source='f1', st='SessionLaunch', open=['session_launch-2']).h(specification=doc(True, 'Draft')).sess(2, st='AnalysisReview', open=['loop_review-2']))

R('AnalysisReview', 1, 'the nested check answers: the cycle of the stage and the verdict are kept, the verdict fork follows',
  ar1().review(1, 'Clean', cycle=cyc(2, 1, 1, 0), st='Gate4', data={'cycle': cycles(Analysis=cyc(2, 1, 1, 0)), 'review_stage': var('Stage', 'Analysis'), 'review_verdict': var('Verdict', 'Clean'), 'review_source': ''}))
R('AnalysisReview', 2, 'the nested check fails (no result): the journal says so, HALTED, the refusal NoResult',
  ar1().fail('loop_review', 1, 'NoResult', 'Halted', journal=[j('review_parsing_failed', reason='no_result'), j('runner_stopped', reason='review_no_result')], outcome=NORESULT, data={'stop_reason': 'review_no_result'}))

R('ReviewVerdict', 1, 'the analysis review is clean: the gate 4', g4())
R('ReviewVerdict', 2, 'the analysis review sends the work back to the requirements: the session of the correction of the specification (s1_fix) with the source of the verdict',
  ar1().review(1, 'Requirements', source='f1', st='SessionLaunch', open=['session_launch-2'], data={'session': 's1_fix', 'launch_source': 'f1', 'continuation': 'analysis_return'}))
R('ReviewVerdict', 3, 'the analysis review ends with a question: the gate 4 after a question', ar1().review(1, 'Question', st='Gate4Question'))
R('ReviewVerdict', 4, 'the analysis review sends the work to the plan: the gate 4 as for "clean"', ar1().review(1, 'Plan', st='Gate4'))
R('ReviewVerdict', 5, 'the plan review is clean: the gate 6', g6())
R('ReviewVerdict', 6, 'the plan review sends the work back to the requirements: both documents go back to drafts, the session of the correction of the specification', aq())
R('ReviewVerdict', 7, 'the plan review ends with a question: the gate 7 of the plan', pr2().review(2, 'Question', st='Gate7Plan'))
R('ReviewVerdict', 8, 'the plan review sends the work to the plan: the gate 6 as for "clean"', pr2().review(2, 'Plan', st='Gate6'))
R('ReviewVerdict', 9, 'the implementation review is clean: the findings out of scope are kept, the gate 8',
  ir3().review(3, 'Clean', out=[finding('OutOfScope', 'e')], st='Gate8', data={'out_of_scope': [finding('OutOfScope', 'e')]}))
R('ReviewVerdict', 10, 'the implementation review sends the work to the plan: the correction of the implementation is queued, the correction of the plan starts',
  ir3().review(3, 'Plan', source='f3', st='SessionLaunch', open=['session_launch-4'], data={'session': 's3_fix', 'continuation': 'plan_queue', 'route_source': 'f3'}))
R('ReviewVerdict', 11, 'the implementation review sends the work back to the requirements: the correction of the specification starts',
  ir3().review(3, 'Requirements', source='f3', st='SessionLaunch', open=['session_launch-4'], data={'session': 's1_fix', 'continuation': 'analysis_queue'}))
R('ReviewVerdict', 12, 'the implementation review ends with a question: the gate 7 of the implementation', ir3().review(3, 'Question', st='Gate7Implementation'))
R('ReviewVerdict', 13, 'the implementation review answers "restart", which only the delivery has: the machine error, the end ERRORED', ir3().review(3, 'Restart', st='Errored'))
R('ReviewVerdict', 14, 'the delivery review is clean: the report on secrets is there, the tree has changes, the gate 10a', g10a())
R('ReviewVerdict', 15, 'the delivery review answers "restart": the delivery starts again (s7)', dr4().review(4, 'Restart', st='SessionLaunch', open=['session_launch-5'], data={'session': 's7'}))
R('ReviewVerdict', 16, 'the delivery review sends the work to the plan: the correction of the plan starts', dr4().review(4, 'Plan', source='f4', st='SessionLaunch', open=['session_launch-5'], data={'session': 's3_fix'}))
R('ReviewVerdict', 17, 'the delivery review sends the work back to the requirements: the correction of the specification starts', dr4().review(4, 'Requirements', source='f4', st='SessionLaunch', open=['session_launch-5'], data={'session': 's1_fix'}))
R('ReviewVerdict', 18, 'the delivery review ends with a question: the gate 7 of the delivery', dr4().review(4, 'Question', st='Gate7Delivery'))
R('ReviewVerdict', 19, 'a verdict that the stage does not have (the analysis review answers "restart"): the machine error, the end ERRORED', ar1().review(1, 'Restart', st='Errored'))

R('Gate4', 1, '"no answers": the specification goes to the approval', g5a())
R('Gate4', 2, '"answers": the answers are written, the session of the correction starts (s1_fix, source "Ответы")',
  g4().word('answers', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'session': 's1_fix', 'launch_source': 'Ответы', 'continuation': 'analysis_answers', 'customer_answers': 'a'}))
R('Gate4', 3, '"answers change the goal": the same session, the other continuation',
  g4().word('answers_change_goal', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'continuation': 'analysis_answers_change_goal'}))
R('Gate4Question', 1, '"no answers": the correction goes on with empty answers', g4q().word('no_answers', None, 'SessionLaunch', data={'customer_answers': '', 'continuation': 'analysis_answers_after_question', 'session': 's1_fix'}))
R('Gate4Question', 2, '"answers": the correction goes on with the answers', g4q().word('answers', {'customer_answers': 'a'}, 'SessionLaunch', data={'customer_answers': 'a', 'continuation': 'analysis_answers_after_question'}))
R('Gate4Question', 3, '"answers change the goal": the same continuation', g4q().word('answers_change_goal', {'customer_answers': 'a'}, 'SessionLaunch', data={'continuation': 'analysis_answers_after_question'}))
R('AnswersRecording', 1, 'the answers of the customer are written into the specification and the session of the correction starts',
  g4().word('answers', {'customer_answers': 'a'}, 'SessionLaunch', open=['session_launch-2'], data={'customer_answers': 'a', 'session': 's1_fix'}))
