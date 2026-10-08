# -*- coding: utf-8 -*-
"""Самотест мета-проверки check-wiring.py: шапка, самотест, подключение стражей и хука агента.

Зачем: страж без вызова или без самотеста выглядит надёжно и ничего не держит; мета-проверка должна
    краснеть именно на этом и называть страж.
Проверяет: на синтетическом дереве, которое собирается в прогоне: зелёное дерево; красные - у стража
    нет шапки (метка за меткой), нет самотеста, страж вне маски не назван в своём хуке, нет хука git или он
    не исполняемый, workflow не вызывает нужный скрипт или отсутствует; запись хука агента покрывает только
    Bash или только PowerShell, команда зовёт python3, скрипт из команды не существует, интерпретатор не
    запускается; самотест на .sh принимается; нет папки стражей - мишень потеряна.
Не проверяет: содержание настоящих стражей (это их самотесты).
Правило: AGENTS.md п.8; AC-16 задачи.
"""
import sys

sys.dont_write_bytecode = True

import json
import os

import stlib

PY_HEADER = '"""Title.\n\nЗачем: a\nПроверяет: b\nНе проверяет: c\nПравило: AGENTS.md п.8\n"""\n'
SH_HEADER = "#!/bin/sh\n# Зачем: a\n# Проверяет: b\n# Не проверяет: c\n# Правило: AGENTS.md п.8\n"
SETTINGS = os.path.join(stlib.REPO, ".claude", "settings.json")


def good_tree():
    files = {
        "scripts/guards/check-a.py": PY_HEADER,
        "scripts/guards/selftest/test-check-a.py": "pass\n",
        "scripts/guards/guard-secrets.py": PY_HEADER,
        "scripts/guards/selftest/test-guard-secrets.py": "pass\n",
        "scripts/guards/guard-commit-message.py": PY_HEADER,
        "scripts/guards/selftest/test-guard-commit-message.py": "pass\n",
        "scripts/guards/check-private-names.py": PY_HEADER,
        "scripts/guards/selftest/test-check-private-names.py": "pass\n",
        "scripts/guards/check-text-hygiene.py": PY_HEADER,
        "scripts/guards/selftest/test-check-text-hygiene.py": "pass\n",
        "scripts/guards/run-all.sh": SH_HEADER,
        "scripts/guards/selftest/test-run-all.py": "pass\n",
        "scripts/guards/commit-range.sh": SH_HEADER,
        "scripts/guards/selftest/test-commit-range.py": "pass\n",
        "scripts/agent-hooks/guard-git.py": PY_HEADER,
        "scripts/guards/selftest/test-guard-git.py": "pass\n",
        "scripts/githooks/pre-commit": SH_HEADER + "guard-secrets.py run-all.sh\n",
        "scripts/guards/selftest/test-pre-commit.py": "pass\n",
        "scripts/githooks/commit-msg": SH_HEADER + "guard-commit-message.py\n",
        "scripts/guards/selftest/test-commit-msg.py": "pass\n",
        "scripts/githooks/pre-push": SH_HEADER + "guard-secrets.py check-private-names.py check-text-hygiene.py guard-commit-message.py commit-range.sh\n",
        "scripts/guards/selftest/test-pre-push.py": "pass\n",
        ".github/workflows/guards.yml": "run-all.sh run-selftests.sh prove-red.sh probe-empty-root.sh check-wiring.py "
                                        "guard-secrets.py guard-commit-message.py commit-range.sh ci-mask.sh\n",
        ".claude/settings.json": open(SETTINGS, encoding="utf-8").read(),
    }
    return files


def main():
    pr = stlib.Probes("check-wiring")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]
    EXEC = ("scripts/githooks/pre-commit", "scripts/githooks/commit-msg", "scripts/githooks/pre-push")

    def build(change=None, drop=(), execs=EXEC):
        files = good_tree()
        files.update(change or {})
        for key in drop:
            files.pop(key, None)
        counter[0] += 1
        repo = stlib.make_repo(base, env, files, name="w%d" % counter[0])
        present = [p for p in execs if p in files]
        if present:
            stlib.git(repo, env, "update-index", "--chmod=+x", "--", *present)
            stlib.git(repo, env, "commit", "-q", "-m", "exec bits")
        return repo

    def check(repo, *args):
        return stlib.guard("check-wiring.py", repo, env, *args)

    def red(repo, rule, where, count=1, *args):
        proc = check(repo, *args)
        stlib.expect(proc, 1, "FAIL: check-wiring: %d нарушений" % count)
        assert stlib.has_line(proc, "FAIL %s" % where) and stlib.has_line(proc, ": %s:" % rule), proc.out

    def legit_good_tree():
        stlib.expect(check(build()), 0, "ок: осмотрено 11 стражей")

    def legit_sh_selftest():
        files = {"scripts/guards/check-b.sh": SH_HEADER, "scripts/guards/selftest/test-check-b.sh": "echo ok\n"}
        stlib.expect(check(build(files)), 0, "ок: осмотрено 12 стражей")

    def legit_matcher_regex():
        data = json.loads(good_tree()[".claude/settings.json"])
        data["hooks"]["PreToolUse"][0]["matcher"] = ".*"
        stlib.expect(check(build({".claude/settings.json": json.dumps(data)})), 0, "ок: осмотрено 11 стражей")

    def legit_two_entries():
        data = json.loads(good_tree()[".claude/settings.json"])
        entry = data["hooks"]["PreToolUse"][0]
        second = json.loads(json.dumps(entry))
        entry["matcher"] = "Bash"
        second["matcher"] = "PowerShell"
        data["hooks"]["PreToolUse"] = [entry, second]
        stlib.expect(check(build({".claude/settings.json": json.dumps(data)})), 0, "ок: осмотрено 11 стражей")

    def header_missing_each_label():
        for label in ("Зачем:", "Проверяет:", "Не проверяет:", "Правило:"):
            text = PY_HEADER.replace(label, "X:") if label != "Проверяет:" else PY_HEADER.replace("Проверяет: b\n", "")
            if label == "Не проверяет:":
                text = PY_HEADER.replace("Не проверяет: c\n", "")
            repo = build({"scripts/guards/check-a.py": text})
            proc = check(repo)
            stlib.expect(proc, 1, "FAIL: check-wiring: 1 нарушений")
            assert stlib.has_line(proc, "FAIL scripts/guards/check-a.py:1: no-header:") and label.rstrip(":") in proc.out.replace("Не проверяет", "Не проверяет"), (label, proc.out)

    def selftest_missing():
        repo = build({"scripts/guards/check-new.py": PY_HEADER})
        red(repo, "no-selftest", "scripts/guards/check-new.py")

    def selftest_missing_for_hook():
        repo = build(drop=("scripts/guards/selftest/test-pre-push.py",))
        red(repo, "no-selftest", "scripts/githooks/pre-push")

    def outofmask_not_named():
        repo = build({"scripts/githooks/pre-commit": SH_HEADER + "run-all.sh\n"})
        red(repo, "not-wired", "scripts/githooks/pre-commit")

    def hook_missing():
        repo = build(drop=("scripts/githooks/commit-msg", "scripts/guards/selftest/test-commit-msg.py"))
        red(repo, "hook-missing", "scripts/githooks/commit-msg")

    def hook_not_executable():
        repo = build(execs=("scripts/githooks/pre-commit", "scripts/githooks/pre-push"))
        red(repo, "hook-not-executable", "scripts/githooks/commit-msg")

    def workflow_lacks_script():
        text = good_tree()[".github/workflows/guards.yml"].replace("prove-red.sh", "")
        red(build({".github/workflows/guards.yml": text}), "not-wired", ".github/workflows/guards.yml")

    def workflow_missing():
        red(build(drop=(".github/workflows/guards.yml",)), "not-wired", ".github/workflows/guards.yml")

    def settings_variant(mutate, rule_text):
        def fn():
            data = json.loads(good_tree()[".claude/settings.json"])
            mutate(data)
            repo = build({".claude/settings.json": json.dumps(data)})
            proc = check(repo)
            stlib.expect(proc, 1, "FAIL: check-wiring")
            assert stlib.has_line(proc, rule_text), proc.out
        return fn

    def only_bash(d):
        d["hooks"]["PreToolUse"][0]["matcher"] = "Bash"

    def only_powershell(d):
        d["hooks"]["PreToolUse"][0]["matcher"] = "PowerShell"

    def python3_command(d):
        cmd = d["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        d["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = cmd.replace("exec python ", "exec python3 ")

    def other_script(d):
        cmd = d["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
        d["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = cmd.replace("guard-git.py", "no-such-guard.py")

    def settings_missing():
        repo = build(drop=(".claude/settings.json",))
        red(repo, "agent-hook", ".claude/settings.json")

    def interpreter_does_not_start():
        repo = build()
        proc = check(repo, "--python-cmd", "no-such-python-binary")
        stlib.expect(proc, 1, "FAIL: check-wiring: 1 нарушений")
        assert stlib.has_line(proc, "не запускается"), proc.out

    def no_guards_dir():
        repo = stlib.make_repo(base, env, {"README.md": "x\n"}, name="noguards")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "зелёное дерево: 11 стражей и хуков", legit_good_tree)
    pr.probe("законное", "самотест на .sh принимается", legit_sh_selftest)
    pr.probe("законное", "matcher регулярным выражением", legit_matcher_regex)
    pr.probe("законное", "две записи: одна на Bash, другая на PowerShell", legit_two_entries)
    pr.probe("красная", "нет каждой из четырёх меток шапки", header_missing_each_label)
    pr.probe("красная", "нет самотеста у check-*", selftest_missing)
    pr.probe("красная", "нет самотеста у хука git", selftest_missing_for_hook)
    pr.probe("красная", "страж вне маски не назван в хуке", outofmask_not_named)
    pr.probe("красная", "нет хука git", hook_missing)
    pr.probe("красная", "хук git не исполняемый", hook_not_executable)
    pr.probe("красная", "workflow не вызывает prove-red.sh", workflow_lacks_script)
    pr.probe("красная", "нет workflow", workflow_missing)
    pr.probe("красная", "хук агента только на Bash",
             settings_variant(only_bash, "не покрывает инструмент PowerShell"))
    pr.probe("красная", "хук агента только на PowerShell",
             settings_variant(only_powershell, "не покрывает инструмент Bash"))
    pr.probe("иной-синтаксис", "команда хука агента зовёт python3 (заглушка)",
             settings_variant(python3_command, "не явным интерпретатором python"))
    pr.probe("иной-синтаксис", "скрипт из команды хука агента не существует",
             settings_variant(other_script, "скрипт хука агента из команды не существует"))
    pr.probe("иной-синтаксис", "нет .claude/settings.json", settings_missing)
    pr.probe("иной-синтаксис", "интерпретатор python из команды не запускается", interpreter_does_not_start)
    pr.probe("мишень", "нет папки scripts/guards - мишень потеряна", no_guards_dir)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
