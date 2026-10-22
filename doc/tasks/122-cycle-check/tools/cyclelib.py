"""Helpers of the generator of the scenarios `cycle-*.scenario.test.json` (task 122): the values of the lossless JSON of the core, the steps of a scenario, the pieces that
bring the machine "Cycle check" to a state. The expectations are written by hand in `sc_rows.py` and `sc_flows.py`."""
import json

# ---- the values of the lossless JSON of the core ------------------------------------------------------------------------------------------


def variant(type_name, name):
    return {'$variant': type_name, 'name': name, 'fields': {}}


def record(name, **fields):
    return {'$record': name, 'fields': dict(sorted(fields.items()))}


def stage(name):
    return variant('Stage', name)


def verdict(name):
    return variant('Verdict', name)


def result_of(name):
    return variant('SessionResult', name)


def cycle(number=1, origin=1, streak=0, no_probes=0):
    return record('Cycle', number=number, origin=origin, streak=streak, no_probes=no_probes)


def finding(level='Implementation', evidence='', severity='Essential'):
    return record('Finding', severity=variant('Severity', severity), level=variant('Level', level), evidence=evidence)


def summary(essential, probes):
    return record('Summary', essential=essential, probes=probes)


def launch_result(result='Done', summary_=None, findings=None):
    return record('SessionLaunchResult', result=result_of(result), summary=summary_, findings=findings)


def meeting_result(decision='p', source='human', passes=2, open_=None):
    return record('MeetingResult', decision=decision, source=source, passes=passes, open=open_ or [])


def review_result(verdict_name, source, cycle_, out_of_scope=None):
    return record('ReviewResult', verdict=verdict(verdict_name), source=source, cycle=cycle_, out_of_scope=out_of_scope or [])


def counter(evidence, passes):
    return record('Counter', evidence=evidence, passes=passes)


def review_input(stage_name='Analysis', cycle_=None, out_of_scope=None, clean_needed=2, ceiling=4, probes_min=3, route='full', delivery_short=False,
                 proposal=None, lens_order=None, author_question=None, task_dir='t', repo_dir='w', delivery_mode='files'):
    return {'stage': stage(stage_name), 'cycle': cycle_ if cycle_ is not None else cycle(), 'out_of_scope': out_of_scope or [], 'task_dir': task_dir,
            'repo_dir': repo_dir, 'delivery_mode': delivery_mode, 'route': route, 'clean_needed': clean_needed, 'ceiling': ceiling, 'probes_min': probes_min,
            'delivery_short': delivery_short, 'proposal': proposal, 'lens_order': lens_order or [], 'author_question': author_question}


def without_empty_fields(value):
    """The outcome of a run writes a case of a variant without fields as `{"$variant":"V","name":"N"}`."""
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
    """The text of a lossless JSON value the way the outcome of a scenario writes it: no blanks."""
    return json.dumps(without_empty_fields(value), ensure_ascii=False, separators=(',', ':'))


# ---- the steps ------------------------------------------------------------------------------------------------------------------------------


def ev(kind, name=None, request=None, input=None, code=None):
    x = {'kind': kind}
    if name is not None:
        x['name'] = name
    if request is not None:
        x['request'] = request
    if input is not None:
        x['input'] = input
    if code is not None:
        x['code'] = code
    return x


def step(do='feed', event=None, ms=None, expect=None, host=None):
    s = {'do': do}
    if host is not None:
        s['host'] = host
    if event is not None:
        s['event'] = event
    if ms is not None:
        s['ms'] = ms
    if expect is not None:
        s['expect'] = expect
    return s


def scenario(name, steps):
    return {'format': 'scenario/0', 'machine': 'cycle_check', 'name': name, 'start_at': 1000, 'standalone': True, 'steps': steps}


def j(code, **params):
    """A line of the journal: the code and the parameters (all texts)."""
    return {'code': code, 'params': {k.rstrip('_'): str(v) for k, v in params.items()}}


def e(state=None, journal=None, data=None, open=None, sent=None, outcome=None, queue=None, cancelled=None):
    """What a step expects; a part that is not named is not compared."""
    x = {}
    for key, value in (('state', state), ('journal', journal), ('data', data), ('open', open), ('sent', sent), ('outcome', outcome), ('queue', queue), ('cancelled', cancelled)):
        if value is not None:
            x[key] = value
    return x


FILES = {}


def put(file, name, steps):
    FILES['cycle-%s.scenario.test.json' % file] = scenario(name, steps)


HOST = {'stop_agent_group': None}
UP = 'up-1'                      # the request that started the machine


def begin(inp, expect=None):
    return step('feed', ev('start', request=UP, input=inp), host=HOST, expect=expect)


def reply(n, result, expect=None):
    """The answer of the nested machine of the session launch to the request session_launch-n."""
    return step('feed', ev('answer', request='session_launch-%d' % n, input=result), expect=expect)


def refuse(n, code, expect=None):
    return step('feed', ev('failure', request='session_launch-%d' % n, code=code), expect=expect)


def meeting_reply(n, result, expect=None):
    return step('feed', ev('answer', request='meeting-%d' % n, input=result), expect=expect)


def meeting_refuse(n, code, expect=None):
    return step('feed', ev('failure', request='meeting-%d' % n, code=code), expect=expect)


def word(name, inp=None, expect=None):
    return step('feed', ev('signal', name, input=inp), expect=expect)


def sig(name, inp, expect=None):
    return step('feed', ev('signal', name, input=inp), expect=expect)


def stop_input(author='ann', source='console'):
    return {'human_word': 'w', 'author': author, 'source': source}


# ---- the lines of the end and the answer ----------------------------------------------------------------------------------------------------

CODE_WORD = {'Clean': 'clean', 'Requirements': 'requirements', 'Plan': 'plan', 'Question': 'question', 'Restart': 'restart', 'Stopped': 'stopped'}


def end_line(verdict_name, source, number, origin, streak, no_probes, narrowed=0):
    """The line `review_state` that the end KONETS writes."""
    return {'code': 'review_state', 'params': {'verdict': CODE_WORD[verdict_name], 'source': source, 'pass': str(number), 'origin': str(origin), 'streak': str(streak),
                                               'no_probes': str(no_probes), 'narrowed': str(narrowed)}}


def answer_text(verdict_name, source, number, origin, streak, no_probes, out_of_scope=None):
    return 'answer:' + compact(review_result(verdict_name, source, cycle(number, origin, streak, no_probes), out_of_scope))


def launched(n, session, launch_pass, cont='review', extra=None, journal=None):
    """The state after the machine sends the request n of the session launch."""
    d = {'session': session, 'launch_pass': launch_pass, 'continuation': cont}
    if extra:
        d.update(extra)
    return e('SessionLaunch', data=d, open=['session_launch-%d' % n], sent=['session_launch-%d' % i for i in range(1, n + 1)], journal=journal)


def clean_review(n, expect=None, probes=3):
    """The reviewer answers: no essential findings, `probes` probes."""
    return reply(n, launch_result('Done', summary(0, probes), []), expect)


def finding_review(n, findings, expect=None, probes=3):
    return reply(n, launch_result('Done', summary(len(findings), probes), findings), expect)


def fix_done(n, expect=None):
    """The author of the fix answers `done`."""
    return reply(n, launch_result('Done', None, None), expect)


# ---- the data of the machine as `machine_data` writes them -----------------------------------------------------------------------------------

DATA_ORDER = [('previous', 'none'), ('call_request_id', 'up-1'), ('open_requests', '[]'), ('stage', 'Analysis'), ('number', '1'), ('origin', '1'), ('streak', '0'), ('no_probes', '0'),
              ('clean_needed', '2'), ('ceiling', '4'), ('probes_min', '3'), ('route', 'full'), ('delivery_short', 'no'), ('out_of_scope', '[]'), ('gate3_findings', '[]'),
              ('passes_by_evidence', '[]'), ('narrowed', '[]'), ('verdict', 'none'), ('verdict_source', ''), ('session', ''), ('launch_source', ''), ('launch_pass', '0'),
              ('continuation', ''), ('result', 'none'), ('failure_reason', ''), ('stop_reason', ''), ('session_attempt', '0'), ('meeting_attempt', '0'), ('gatekeeper_attempt', '0'),
              ('enhanced_attempt', '0'), ('summary', '{}'), ('findings', '{}'), ('task_dir', 't'), ('repo_dir', 'w'), ('delivery_mode', 'files'), ('proposal', 'none'),
              ('lens_order', '[]'), ('author_question', 'none')]


def data_line(**overrides):
    """The line `machine_data` of the end ERRORED: the data of the machine in the order of the table, `name=value; ...`."""
    known = [n for n, d in DATA_ORDER]
    for k in overrides:
        assert k in known, k
    return {'code': 'machine_data', 'params': {'data': '; '.join('%s=%s' % (n, overrides.get(n, d)) for n, d in DATA_ORDER)}}


def errored(before, error, **data):
    """The journal of a step that ends in ERRORED: what was written before, the line of the error, the same line as the note of the transition, the data."""
    return list(before) + [error, error, data_line(**data)]
