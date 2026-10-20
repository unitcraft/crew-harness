#!/usr/bin/env python3
"""Writes the scenarios `cycle-*.scenario.test.json` of the machine "Cycle check" (task 122) into src/machine/scenarios and the lines for src/machine/data.nv.

The scenarios are data: events of the machine alone (`standalone`: the parties of the kind `machine`, the session launch and the meeting, are played by the steps: an `answer`
or a `failure` event with the id of the request) and what the machine must leave after each step. The expectations are written by hand in `sc_rows.py` (a row of the table of
the methodology has a scenario named after it, `cycle-<state>-<n>`) and `sc_flows.py` (the flows go through the whole machine, `cycle-flow-*`).
Run from the root of the repository: `python doc/tasks/122-cycle-check/tools/gen_cycle_scenarios.py [out_dir]` (the default is src/machine/scenarios; with another
directory only the scenarios are written).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cyclelib  # noqa: E402
import sc_rows  # noqa: E402,F401
import sc_flows  # noqa: E402,F401

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
DEFAULT_OUT = os.path.join(ROOT, 'src', 'machine', 'scenarios')
OUT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
DATA = os.path.join(ROOT, 'src', 'machine', 'data.nv')


def write_scenarios():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.startswith('cycle-') and old.endswith('.scenario.test.json'):
            os.remove(os.path.join(OUT, old))
    for name, sc in sorted(cyclelib.FILES.items()):
        with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(sc, f, ensure_ascii=False, indent=None, separators=(', ', ': '))
            f.write('\n')
    print('%d scenarios written to %s' % (len(cyclelib.FILES), OUT))


def update_data():
    """The lines of the scenarios in the list of src/machine/data.nv, in the order of the names."""
    with open(DATA, 'r', encoding='utf-8', newline='') as f:
        text = f.read().replace('\r\n', '\n')
    lines = [l for l in text.split('\n') if '"cycle-' not in l]
    entries = ['    NamedText { name: "%s", text: embed_str("scenarios/%s") },' % (n, n) for n in sorted(cyclelib.FILES)]
    result = []
    done = False
    for line in lines:
        s = line.strip()
        if not done and s.startswith('NamedText { name: "') and '.scenario.test.json' in s and s.split('"')[1] > 'cycle-':
            result.extend(entries)
            done = True
        result.append(line)
    if not done:
        raise SystemExit('no place for the entries in data.nv')
    with open(DATA, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(result))
    print('data.nv updated')


if __name__ == '__main__':
    write_scenarios()
    if OUT == DEFAULT_OUT:
        update_data()
