# -*- coding: utf-8 -*-
"""Самотест скрипта настроек GitHub github-setup.sh на подставной команде gh (настоящий GitHub не вызывается).

Зачем: скрипт меняет защиту main и секреты публичного репозитория; ошибка в нём либо оставит ветку
    незащищённой, либо напечатает секрет, поэтому его логика проверяется целиком до первого настоящего запуска.
Проверяет: --dry-run печатает действие и тело запроса и не вызывает gh; protect пишет защиту, читает её
    обратно и сверяет, повтор ничего не меняет, расхождение после записи - красный; unprotect отказывает для
    main и работает для probe/*; secret требует непустой файл списка и передаёт значение по stdin, не печатая
    его; probe-set пишет два выдуманных значения; probe-branch готовит локальную ветку со шаблоном и файлом
    пробы, не трогая рабочее дерево; log-search находит значение в журнале (красный), не находит (зелёный) и
    требует положительного контроля; в тексте скрипта нет трассировки set -x.
Не проверяет: настоящий GitHub (ворота владельца Г4, проба AC-31 в Actions).
Правило: ADR-0006, AGENTS.md п.3 и п.5; AC-11, AC-31 задачи.
"""
import sys

sys.dont_write_bytecode = True

import json
import os

import stlib

SETUP = os.path.join(stlib.SCRIPTS, "github-setup.sh")
FAKE_GH = '''import json, os, sys
state = os.environ["FAKE_GH_STATE"]
args = sys.argv[1:]
with open(os.path.join(state, "calls.log"), "a", encoding="utf-8") as log:
    log.write(" ".join(args) + "\\n")
prot = os.path.join(state, "protection.json")
if args[:1] == ["api"]:
    if "-X" in args and args[args.index("-X") + 1] == "PUT":
        body = json.loads(sys.stdin.read())
        bad = os.environ.get("FAKE_GH_MODE") == "bad-response"
        out = {"enforce_admins": {"enabled": body["enforce_admins"]},
               "required_linear_history": {"enabled": body["required_linear_history"]},
               "allow_force_pushes": {"enabled": True if bad else body["allow_force_pushes"]},
               "allow_deletions": {"enabled": body["allow_deletions"]}}
        json.dump(out, open(prot, "w"))
        print("{}")
    elif "-X" in args and args[args.index("-X") + 1] == "DELETE":
        if os.path.exists(prot):
            os.remove(prot)
    else:
        if not os.path.exists(prot):
            sys.exit(1)
        print(open(prot).read())
elif args[:2] == ["secret", "set"]:
    name = args[2]
    os.makedirs(os.path.join(state, "secrets"), exist_ok=True)
    open(os.path.join(state, "secrets", name), "wb").write(sys.stdin.buffer.read())
elif args[:2] == ["secret", "delete"]:
    path = os.path.join(state, "secrets", args[2])
    if os.path.exists(path):
        os.remove(path)
elif args[:2] == ["secret", "list"]:
    folder = os.path.join(state, "secrets")
    for n in (sorted(os.listdir(folder)) if os.path.isdir(folder) else []):
        print(n)
elif args[:2] == ["run", "view"]:
    sys.stdout.buffer.write(open(os.environ["FAKE_GH_LOG_FILE"], "rb").read())
else:
    sys.exit(2)
'''


def main():
    pr = stlib.Probes("github-setup")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    bindir = os.path.join(base, "bin")
    os.makedirs(bindir)
    fake_py = os.path.join(bindir, "fakegh.py").replace(chr(92), "/")
    with open(fake_py, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(FAKE_GH)
    with open(os.path.join(bindir, "gh"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write('#!/bin/sh\nexec python "%s" "$@"\n' % fake_py)
    os.chmod(os.path.join(bindir, "gh"), 0o755)
    counter = [0]

    def sandbox(**extra):
        counter[0] += 1
        state = os.path.join(base, "state%d" % counter[0])
        os.makedirs(state)
        tmpdir = os.path.join(base, "tmp%d" % counter[0])
        os.makedirs(tmpdir)
        e = dict(env0, FAKE_GH_STATE=state, TMPDIR=tmpdir,
                 PATH=os.path.dirname(bindir.replace(chr(92), "/")) + "/bin" + os.pathsep + env0["PATH"])
        e["PATH"] = bindir + os.pathsep + env0["PATH"]
        e.update(extra)
        return e, state, tmpdir

    def setup(env, *args, cwd=None):
        return stlib.run(("sh", SETUP) + args, cwd=cwd, env=env)

    def calls(state):
        path = os.path.join(state, "calls.log")
        return open(path, encoding="utf-8").read().splitlines() if os.path.exists(path) else []

    def names(base_env, patterns):
        path = stlib.names_file(base, patterns, name="n%d.txt" % counter[0])
        return dict(base_env, CREW_PRIVATE_NAMES_FILE=path), path

    def dry_run_protect():
        e, state, _ = sandbox()
        proc = setup(e, "--dry-run", "protect")
        assert proc.returncode == 0, proc.out + proc.err
        assert "repos/unitcraft/crew-harness/branches/main/protection" in proc.out, proc.out
        for piece in ('"enforce_admins":true', '"required_linear_history":true', '"allow_force_pushes":false',
                      '"allow_deletions":false', '"required_pull_request_reviews":null', '"required_status_checks":null'):
            assert piece in proc.out, piece
        assert calls(state) == [], "в --dry-run вызван gh"

    def dry_run_everything():
        e, state, _ = sandbox()
        e, _ = names(e, ["zorblax-demo"])
        for cmd in (("status",), ("secret",), ("probe-set",), ("probe-branch", "demo"), ("probe-clear",), ("unprotect", "--x")):
            args = ("--dry-run",) + (("--branch", "probe/x") if cmd[0] == "unprotect" else ()) + (cmd if cmd[0] != "unprotect" else ("unprotect",))
            proc = setup(e, *args)
            assert proc.returncode == 0 and "[dry-run]" in proc.out, (cmd, proc.out, proc.err)
        assert calls(state) == [], "в --dry-run вызван gh"

    def protect_real_and_repeat():
        e, state, _ = sandbox()
        proc = setup(e, "protect")
        assert proc.returncode == 0 and "применена и сверена" in proc.out, proc.out + proc.err
        first = calls(state)
        assert any("-X PUT" in c for c in first), first
        proc = setup(e, "protect")
        assert proc.returncode == 0 and "ничего не изменилось" in proc.out, proc.out
        second = calls(state)[len(first):]
        assert second and not any("PUT" in c for c in second), second

    def protect_mismatch_after_write():
        e, state, _ = sandbox(FAKE_GH_MODE="bad-response")
        proc = setup(e, "protect")
        assert proc.returncode == 1 and "расхождение" in proc.out and "не совпали" in proc.out, proc.out

    def unprotect_main_refused():
        e, state, _ = sandbox()
        proc = setup(e, "unprotect")
        assert proc.returncode == 1 and "main" in proc.out and calls(state) == [], proc.out
        proc = setup(e, "--branch", "main", "unprotect")
        assert proc.returncode == 1 and calls(state) == []
        setup(e, "protect")
        proc = setup(e, "--branch", "probe/demo", "unprotect")
        assert proc.returncode == 0 and any("DELETE" in c and "probe/demo" in c for c in calls(state)), proc.out

    def secret_reads_file_and_hides_value():
        e, state, _ = sandbox()
        e, path = names(e, ["zorblax-one", "zorblax-two"])
        proc = setup(e, "secret")
        assert proc.returncode == 0, proc.out + proc.err
        assert "zorblax" not in proc.out + proc.err, "значение напечатано"
        stored = open(os.path.join(state, "secrets", "CREW_PRIVATE_NAMES"), "rb").read()
        assert stored == open(path, "rb").read(), "секрет не равен файлу списка"
        assert any(c.startswith("secret set CREW_PRIVATE_NAMES") for c in calls(state))

    def secret_without_file():
        e, state, _ = sandbox(CREW_PRIVATE_NAMES_FILE=os.path.join(base, "absent.txt"))
        proc = setup(e, "secret")
        assert proc.returncode == 1 and "нет файла" in proc.out and calls(state) == [], proc.out
        empty = os.path.join(base, "empty.txt")
        open(empty, "w").close()
        proc = setup(dict(e, CREW_PRIVATE_NAMES_FILE=empty), "secret")
        assert proc.returncode == 1 and calls(state) == []

    def probe_set_two_values():
        e, state, tmpdir = sandbox()
        proc = setup(e, "probe-set")
        assert proc.returncode == 0, proc.out + proc.err
        values = open(os.path.join(tmpdir, "crew-probe-values.txt"), encoding="utf-8").read().split()
        assert len(values) == 2 and values[0] != values[1], values
        assert all(v not in proc.out + proc.err for v in values), "значение напечатано"
        stored = open(os.path.join(state, "secrets", "CREW_PRIVATE_NAMES_PROBE"), encoding="utf-8").read().split()
        assert stored == values
        proc = setup(e, "probe-clear")
        assert proc.returncode == 0 and not os.path.exists(os.path.join(tmpdir, "crew-probe-values.txt"))
        assert not os.path.exists(os.path.join(state, "secrets", "CREW_PRIVATE_NAMES_PROBE"))

    def probe_branch_local_only():
        e, state, tmpdir = sandbox()
        repo = stlib.hooked_repo(base, env0, name="probesrc", install=False)
        assert setup(e, "probe-set").returncode == 0
        before = stlib.git(repo, env0, "status", "--porcelain").out
        branch_before = stlib.git(repo, env0, "branch", "--show-current").out.strip()
        proc = setup(e, "probe-branch", "demo1", cwd=repo)
        assert proc.returncode == 0, proc.out + proc.err
        files = stlib.git(repo, env0, "ls-tree", "-r", "--name-only", "probe/demo1").out.split()
        assert ".github/workflows/probe-log.yml" in files and "probe/planted.txt" in files, files
        planted = stlib.git(repo, env0, "show", "probe/demo1:probe/planted.txt").out.strip()
        values = open(os.path.join(tmpdir, "crew-probe-values.txt"), encoding="utf-8").read().split()
        assert planted == values[0], "в файле пробы должно быть первое значение"
        assert stlib.git(repo, env0, "status", "--porcelain").out == before, "рабочее дерево тронуто"
        assert stlib.git(repo, env0, "branch", "--show-current").out.strip() == branch_before
        assert "probe/demo1" in stlib.git(repo, env0, "branch", "--list", "probe/*").out
        wts = stlib.git(repo, env0, "worktree", "list").out.strip().splitlines()
        assert len(wts) == 1, "остался временный каталог: %r" % wts
        assert not any("push" in c for c in calls(state)), "скрипт не должен пушить"

    def log_search_cases():
        e, state, tmpdir = sandbox()
        assert setup(e, "probe-set").returncode == 0
        values = open(os.path.join(tmpdir, "crew-probe-values.txt"), encoding="utf-8").read().split()
        good = os.path.join(base, "good.log")
        with open(good, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("2026-10-08T10:00:00Z ***\n2026-10-08T10:00:00Z ***\nPROBE-MARKER\n"
                         "FAIL probe/planted.txt:1: forbidden-name: образец №1\n")
        proc = setup(e, "log-search", "--file", good)
        assert proc.returncode == 0 and "ок: значений в журнале нет" in proc.out, proc.out + proc.err
        leaky = os.path.join(base, "leaky.log")
        with open(leaky, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("line %s here\nPROBE-MARKER\nFAIL probe/planted.txt:1: forbidden-name: образец №1\n" % values[1])
        proc = setup(e, "log-search", "--file", leaky)
        assert proc.returncode == 1 and "найдено в журнале: 1" in proc.out and values[1] not in proc.out, proc.out
        nomarker = os.path.join(base, "nomarker.log")
        with open(nomarker, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("***\nFAIL probe/planted.txt:1: forbidden-name: образец №1\n")
        proc = setup(e, "log-search", "--file", nomarker)
        assert proc.returncode == 1 and "PROBE-MARKER в журнале: 0" in proc.out, proc.out
        noguard = os.path.join(base, "noguard.log")
        with open(noguard, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("***\nPROBE-MARKER\n")
        proc = setup(e, "log-search", "--file", noguard)
        assert proc.returncode == 1 and "нет" in proc.out, proc.out
        # через gh: журнал приходит подставной командой
        e2 = dict(e, FAKE_GH_LOG_FILE=good)
        proc = setup(e2, "log-search", "12345")
        assert proc.returncode == 0 and any(c.startswith("run view 12345") for c in calls(state)), (proc.out + proc.err, calls(state), os.path.exists(good))

    def log_search_requires_values_file():
        e, state, tmpdir = sandbox()
        proc = setup(e, "log-search", "--file", os.path.join(base, "good.log"))
        assert proc.returncode == 1 and "сначала probe-set" in proc.out, proc.out

    def unknown_and_empty_command():
        e, state, _ = sandbox()
        for args in ((), ("frobnicate",)):
            proc = setup(e, *args)
            assert proc.returncode == 1 and "FAIL" in proc.out and calls(state) == [], (args, proc.out)

    def no_trace_in_script():
        text = open(SETUP, encoding="utf-8").read()
        assert "set -u" in text, "положительный контроль: поиск работает"
        assert "set -x" not in text.replace("(set -x)", "") and "set -xe" not in text and "sh -x" not in text

    pr.probe("законное", "--dry-run protect: действие и тело запроса, gh не вызван", dry_run_protect)
    pr.probe("законное", "--dry-run для остальных команд: gh не вызван", dry_run_everything)
    pr.probe("законное", "protect: запись, чтение, сверка; повтор ничего не меняет", protect_real_and_repeat)
    pr.probe("законное", "probe-set: два выдуманных значения, секрет пробы; probe-clear убирает", probe_set_two_values)
    pr.probe("законное", "probe-branch: локальная ветка с шаблоном и файлом пробы, дерево не тронуто", probe_branch_local_only)
    pr.probe("законное", "secret: значение передано по stdin и не напечатано", secret_reads_file_and_hides_value)
    pr.probe("красная", "protect: после записи значения не совпали - красный", protect_mismatch_after_write)
    pr.probe("красная", "unprotect: для main отказ, для probe/* работает", unprotect_main_refused)
    pr.probe("красная", "log-search: значение в журнале, нет маркера, нет строки стража", log_search_cases)
    pr.probe("иной-синтаксис", "в тексте скрипта нет трассировки", no_trace_in_script)
    pr.probe("мишень", "secret без файла списка или с пустым - отказ без вызова gh", secret_without_file)
    pr.probe("мишень", "log-search без файла значений пробы - отказ", log_search_requires_values_file)
    pr.probe("мишень", "пустая и неизвестная команда - отказ без вызова gh", unknown_and_empty_command)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
