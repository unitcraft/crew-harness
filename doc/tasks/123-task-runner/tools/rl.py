"""Library of the generator of the scenarios `runner-*.scenario.test.json` of the machine "Task runner" (task 123): the values of the lossless JSON of the core, the builder of a scenario
with the answers of the host, the golden path of the full route and the positions on it from which the scenarios of the rows branch. The expectations are written by hand in
`sc_rows*.py` and `sc_flows.py` from the table of the methodology; nothing is taken from a run."""
import json

# ---- the values of the lossless JSON of the core ------------------------------------------------------------------------------------------


def var(t, n):
    return {'$variant': t, 'name': n, 'fields': {}}


def rec(name, **fields):
    return {'$record': name, 'fields': dict(sorted(fields.items()))}


STAGES = ['Analysis', 'Plan', 'Implementation', 'Delivery', 'Meeting']
STAGE_OF = {'Analysis': 'Analysis', 'Plan': 'Plan', 'Impl': 'Implementation', 'Delivery': 'Delivery'}


def cyc(number=1, origin=1, streak=0, no_probes=0):
    return rec('Cycle', no_probes=no_probes, number=number, origin=origin, streak=streak)


def cycles(**over):
    """The dict `cycle` of the machine: the stage -> the cycle; `over` gives a stage a cycle."""
    pairs = []
    for s in STAGES:
        pairs.append([var('Stage', s), over.get(s, cyc())])
    return {'$dict': pairs}


def doc(exists=False, status='Draft', stop='NoWord', h=''):
    return rec('TaskDocumentState', exists=exists, status=var('DocumentStatus', status), stop_word=var('StopWord', stop), hash=h)


def approval(h='H1', date='2026-10-20', who='owner'):
    return rec('Approval', date=date, hash=h, who=who)


def prep(outcome='Ready', **over):
    return rec('PreparationResult', outcome=var('PreparationStatus', outcome), cycle=cycles(**over))


def route_settings(ceiling=4, clean=2, probes=3, short=False, relax=None):
    return rec('RouteSettings', ceiling=ceiling, clean_needed=clean, probes_min=probes, delivery_short=short, relaxations=relax or [])


def settings(full=None, fast=None, max_sources=3, max_parts=2, risk='Low'):
    return rec('ProjectSettings', thresholds=rec('RouteThresholds', max_sources=max_sources, max_parts=max_parts, allowed_risk=var('Risk', risk)),
               full=full or route_settings(4, 2, 3), fast=fast or route_settings(2, 1, 3))


def features(goal='g', sources=1, parts=1, risk='Low', irreversible='No', cause_known='Confirmed', touches_norm='No', helper=''):
    return rec('RouteFeatures', goal=goal, sources=sources, parts=parts, risk=var('Risk', risk), irreversible=var('Rating', irreversible),
               cause_known=var('Rating', cause_known), touches_norm=var('Rating', touches_norm), helper_proposal=helper)


def finding(level='Implementation', evidence='', severity='Essential'):
    return rec('Finding', severity=var('Severity', severity), level=var('Level', level), evidence=evidence)


def session_result(result='Done'):
    return rec('SessionLaunchResult', result=var('SessionResult', result), summary=None, findings=None)


def review_result(verdict='Clean', source='', cycle=None, out=None):
    return rec('ReviewResult', verdict=var('Verdict', verdict), source=source, cycle=cycle or cyc(), out_of_scope=out or [])


def without_empty_fields(value):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k == 'fields' and v == {} and '$variant' in value:
                continue
            out[k] = without_empty_fields(v)
        return out
    if isinstance(value, list):
        return [without_empty_fields(x) for x in value]
    return value


def compact(value):
    return json.dumps(without_empty_fields(value), ensure_ascii=False, separators=(',', ':'))


def j(code, **params):
    return {'code': code, 'params': {k.rstrip('_'): str(v) for k, v in params.items()}}


# ---- the host of the tests: the answers of the primitives -----------------------------------------------------------------------------

def base_host():
    return {
        'run_preparation': prep(), 'specification': doc(), 'task_plan': doc(), 'implementation_report': doc(), 'route_features': None, 'project_settings': settings(),
        'source_list': None, 'brief_complete': True, 'copy_approval': approval('HB', date='2026-10-20', who='owner'), 'approval_by_document': approval('H1'),
        'source_with_specification_marks': 'marks', 'last_implementation_review': None, 'has_unresolved_line': False, 'customer_letter': None, 'round_letters': None,
        'secrets_report': 'secrets: none', 'tree_diff': '', 'commit_message': 'm', 'commit_text': 'm', 'feedback_route': None,
        'write_answers': None, 'write_decisions': None, 'write_owner_marks': None, 'save_round_notes': None, 'write_draft_status': None, 'create_approved_copy': None,
        'rename_letter': None, 'release_lock': None, 'show_human': None, 'stop_agent_group': None,
    }


FILES = {}
REGISTERED = {}


class S:
    """A scenario in the making: the steps, the answers of the host that hold, the answers that change before the next step."""

    def __init__(self, **host):
        self.steps = []
        self.cur = None
        self.pending = dict(host)
        self.sent_seen = 0

    # -- the answers of the host
    def h(self, **kw):
        self.pending.update(kw)
        return self

    def _emit(self, step):
        change = {}
        for k, v in self.pending.items():
            if self.cur is None or self.cur.get(k, 'ABSENT') != v:
                change[k] = v
        if self.cur is None:
            self.cur = base_host()
            change = {k: v for k, v in dict(self.cur, **self.pending).items()}
            self.cur.update(self.pending)
        else:
            self.cur.update(change)
        if change:
            step['host'] = change
        self.pending = {}
        self.steps.append(step)
        return self

    def step(self, event, ex=None, do='feed', also=None, on=None):
        s = {'do': do}
        if event is not None:
            s['event'] = event
        if on:
            s['on'] = on
        if ex is not None:
            s['expect'] = ex
        if also is not None:
            s['also'] = also
        return self._emit(s)

    def copy(self):
        o = S()
        o.steps = json.loads(json.dumps(self.steps))
        o.cur = None if self.cur is None else dict(self.cur)
        o.pending = dict(self.pending)
        return o

    # -- events
    def start(self, st, **ex):
        return self.step({'kind': 'start', 'request': 'up-1', 'input': {'task_dir': 't', 'repo_dir': 'w', 'delivery_mode': 'files'}}, e(st, **ex))

    def word(self, name, fields=None, st=None, **ex):
        ev = {'kind': 'word', 'name': name}
        if isinstance(fields, dict) and len(fields) == 1:
            fields = list(fields.values())[0]      # a word with one field takes its text as the input
        if fields is not None:
            ev['input'] = fields
        return self.step(ev, e(st, **ex))

    def sess(self, n, result='Done', st=None, **ex):
        return self.step({'kind': 'answer', 'request': 'session_launch-%d' % n, 'input': session_result(result)}, e(st, **ex))

    def review(self, n, verdict='Clean', source='', cycle=None, out=None, st=None, **ex):
        return self.step({'kind': 'answer', 'request': 'loop_review-%d' % n, 'input': review_result(verdict, source, cycle, out)}, e(st, **ex))

    def fail(self, party, n, code, st=None, **ex):
        return self.step({'kind': 'failure', 'request': '%s-%d' % (party, n), 'code': code}, e(st, **ex))

    def sig(self, name, inp, st=None, **ex):
        return self.step({'kind': 'signal', 'name': name, 'input': inp}, e(st, **ex))

    def restart(self, st=None, **ex):
        return self.step(None, e(st, **ex), do='restart')

    def pump(self, st=None, on=None, **ex):
        return self.step(None, e(st, **ex), do='pump', on=on)


def e(state=None, journal=None, data=None, open=None, sent=None, outcome=None, queue=None, cancelled=None):
    x = {}
    for key, value in (('state', state), ('journal', journal), ('data', data), ('open', open), ('sent', sent), ('outcome', outcome), ('queue', queue), ('cancelled', cancelled)):
        if value is not None:
            x[key] = value
    return x or None


def stop_input(author='ann', source='console'):
    return {'human_word': 'w', 'author': author, 'source': source}


UP = 'up-1'
PROPOSED = None  # set below


def put(file, name, s):
    sc = {'format': 'scenario/0', 'machine': 'task_runner', 'name': name, 'start_at': 1000, 'standalone': True, 'steps': s.steps}
    assert file not in FILES, file
    FILES['runner-%s.scenario.test.json' % file] = sc


# ---- the end lines ---------------------------------------------------------------------------------------------------------------------

def ends_answer(rounds):
    return 'answer:' + compact(rec('RunnerResult', feedback_rounds=rounds))


PROPOSED = j('route_proposed', proposal='полный', source='правило', basis='признаки не записаны')
