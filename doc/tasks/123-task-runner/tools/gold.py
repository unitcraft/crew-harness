"""The golden path of the full route and of the fast route: the positions (the states where the machine waits) from which the scenarios of the rows branch. A position is a builder `S` that has
done the steps to it; a scenario of a row copies it and goes on."""
from rl import *


def kebab(name):
    out = ''
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0 and (name[i - 1].islower() or name[i - 1].isdigit()):
            out += '-'
        out += ch.lower()
    return out


def R(state, n, text, s):
    """The scenario of a row: `runner-<state>-<n>`."""
    put('%s-%d' % (kebab(state), n), '%s %d: %s' % (state, n, text), s)


def SP(approval_document=None):
    return var('TaskDocument', approval_document)


FULL = 'полный'
FAST = 'быстрый'
SPEC = var('TaskDocument', 'Specification')
PLAN = var('TaskDocument', 'Plan')
REPORT = var('TaskDocument', 'ImplementationReport')


def phase(name):
    return var('Phase', name)


# ---- the full route -----------------------------------------------------------------------------------------------------------------------

def g14(**host):
    """Gate14: the first gate of the task (the route is not chosen)."""
    return S(**host).start('Gate14', open=[], data={'route': '', 'phase': phase('Analysis')})


def sl1(**host):
    """SessionLaunch: the first session of the analysis (s1)."""
    return g14(**host).word('full', {'basis': 'ok'}, 'SessionLaunch', open=['session_launch-1'],
                            data={'route': FULL, 'clean_needed': 2, 'ceiling': 4, 'probes_min': 3, 'session': 's1', 'continuation': 'analysis_first_session', 'route_choice_source': 'человек'})


def ar1(**host):
    """AnalysisReview: the review of the specification (loop_review-1)."""
    return sl1(**host).sess(1, st='AnalysisReview', open=['loop_review-1'])


def g4(**host):
    return ar1(**host).review(1, 'Clean', st='Gate4', open=[])


def g5a(**host):
    """Gate5 for the specification."""
    return g4(**host).h(specification=doc(True, 'Draft')).word('no_answers', None, 'Gate5', data={'approval_document': SPEC})


def sl3(**host):
    """SessionLaunch: the first session of the plan (s3), the specification is approved."""
    return g5a(**host).h(specification=doc(True, 'Approved', h='H1')).word(
        'confirmed', None, 'SessionLaunch', open=['session_launch-2'],
        data={'phase': phase('Plan'), 'session': 's3', 'continuation': 'plan_first_session', 'approvals': {'$dict': [[SPEC, approval('H1')]]}})


def pr2(**host):
    return sl3(**host).h(task_plan=doc(True, 'Draft')).sess(2, st='PlanReview', open=['loop_review-2'])


def g6(**host):
    return pr2(**host).review(2, 'Clean', st='Gate6', open=[])


def g5b(**host):
    """Gate5 for the plan."""
    return g6(**host).word('decisions_keep_plan', {'plan_decisions': 'd'}, 'Gate5', data={'approval_document': PLAN})


def sl5(**host):
    """SessionLaunch: the first session of the implementation (s5), both documents are approved."""
    return g5b(**host).h(task_plan=doc(True, 'Approved', h='H2'), approval_by_document=approval('H2')).word(
        'confirmed', None, 'SessionLaunch', open=['session_launch-3'],
        data={'phase': phase('Implementation'), 'session': 's5', 'continuation': 'implementation_first_session'})


def ir3(**host):
    return sl5(**host).sess(3, st='ImplementationReview', open=['loop_review-3'])


def g8(**host):
    return ir3(**host).review(3, 'Clean', st='Gate8', open=[])


def sl7(**host):
    """SessionLaunch: the delivery session (s7)."""
    return g8(**host).word('other_decisions', {'owner_decisions': 'ok'}, 'SessionLaunch', open=['session_launch-4'],
                            data={'phase': phase('Delivery'), 'session': 's7', 'continuation': 'delivery_main'})


def dr4(**host):
    return sl7(**host).sess(4, st='DeliveryReview', open=['loop_review-4'])


def g10a(**host):
    return dr4(**host).h(tree_diff='diff').review(4, 'Clean', st='Gate10a', open=[])


def slc(**host):
    return g10a(**host).word('allow_commit', None, 'SessionLaunch', open=['session_launch-5'], data={'session': 'commit', 'continuation': 'delivery_commit'})


def g10c(**host):
    return slc(**host).sess(5, st='Gate10c', open=[])


def slp(**host):
    return g10c(**host).word('allow_push', None, 'SessionLaunch', open=['session_launch-6'], data={'session': 'push', 'continuation': 'delivery_push'})


def g10d(**host):
    return slp(**host).sess(6, st='Gate10d', open=[])


def g11(**host):
    return g10d(**host).word('sent', None, 'Gate11', data={'phase': phase('Feedback')})


# ---- the fast route -----------------------------------------------------------------------------------------------------------------------

def fast_word(basis='b', word='заводи 1', date='2026-10-20'):
    return {'basis': basis, 'factory_word': word, 'factory_word_date': date}


def fsl5(**host):
    """The fast route: the copy of the brief is approved by the word of the factory, the analysis and the plan are skipped, the first session of the implementation (s5)."""
    return g14(**host).h(specification=doc(True, 'Approved', h='HB')).word(
        'fast', fast_word(), 'SessionLaunch', open=['session_launch-1'],
        data={'route': FAST, 'clean_needed': 1, 'ceiling': 2, 'probes_min': 3, 'session': 's5', 'continuation': 'implementation_first_session', 'phase': phase('Implementation'),
              'approvals': {'$dict': [[SPEC, approval('HB')]]}})


def fir1(**host):
    return fsl5(**host).sess(1, st='ImplementationReview', open=['loop_review-1'])


def fg8(**host):
    return fir1(**host).review(1, 'Clean', st='Gate8', open=[])


def FL(name, text, s, nested=False):
    put('flow-%s' % name, 'FLOW: %s' % text, s, nested)
