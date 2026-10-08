# -*- coding: utf-8 -*-
"""Мета-проверка стражей: каждый документирован, подключён и проверен самотестом.

Зачем: страж, который никто не вызывает, или проверка без самотеста выглядят надёжно и ничего не
    держат; такую дыру не видно, пока нарушение не пройдёт. Мета-проверка делает подключение
    свойством, которое проверяется машиной, а не вниманием.
Проверяет: (1) у каждого стража (check-*, guard-*, хук агента, хуки git, запускающие скрипты) есть
    шапка с метками «Зачем:», «Проверяет:», «Не проверяет:», «Правило:» (REQ-36); (2) есть самотест
    selftest/test-<имя>.py или .sh; (3) стражи вне маски названы в своих хуках и в workflow CI, хуки
    git лежат в scripts/githooks под своими именами и исполняемые; (4) хук агента записан в
    .claude/settings.json на Bash и на PowerShell, команда зовёт существующий scripts/agent-hooks/guard-git.py
    явным интерпретатором python (не python3), и этот интерпретатор запускается.
Не проверяет: содержание самих проверок и самотестов (это делают самотесты и «доказательство красного»),
    стражей, лежащих вне перечисленных папок.
Правило: AGENTS.md п.8 (проверки перед пушем) и п.14 (машина делает то, что может); REQ-25, REQ-36.

Пометок-исключений у этого стража нет. Стражи по маске check-* подключаются построением (run-all.sh).
"""
import sys

sys.dont_write_bytecode = True

import json
import os
import re
import subprocess

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

LABELS = ("Зачем:", "Проверяет:", "Не проверяет:", "Правило:")
GUARD_PATH = re.compile(
    r"^(scripts/guards/(?:check-[^/]+\.(?:py|sh)|guard-[^/]+\.py|[^/]+\.sh)"
    r"|scripts/agent-hooks/[^/]+\.py|scripts/githooks/[^/.]+|scripts/[^/]+\.sh)$")
HOOKS = ("pre-commit", "commit-msg", "pre-push")
WORKFLOW = ".github/workflows/guards.yml"
SETTINGS = ".claude/settings.json"
WORKFLOW_TOKENS = ("run-all.sh", "run-selftests.sh", "prove-red.sh", "probe-empty-root.sh", "check-wiring.py",
                   "guard-secrets.py", "guard-commit-message.py", "commit-range.sh", "ci-mask.sh")
HOOK_NAMES = {
    "scripts/githooks/pre-commit": ("guard-secrets.py", "run-all.sh"),
    "scripts/githooks/commit-msg": ("guard-commit-message.py",),
    "scripts/githooks/pre-push": ("guard-secrets.py", "check-private-names.py", "check-text-hygiene.py",
                                  "guard-commit-message.py", "commit-range.sh"),
}


def check_header(path, text, rep):
    head = "\n".join(text.split("\n")[:80])
    missing = [label for label in LABELS if not re.search(r"(?m)^[#\s\"']*" + re.escape(label), head)]
    if missing:
        rep.add(path, 1, "no-header", "в шапке нет меток: " + ", ".join(missing))


def check_guard(path, entry_paths, rep):
    stem = os.path.splitext(path.rsplit("/", 1)[-1])[0] if "." in path.rsplit("/", 1)[-1] else path.rsplit("/", 1)[-1]
    tests = ["scripts/guards/selftest/test-%s.%s" % (stem, ext) for ext in ("py", "sh")]
    if not any(t in entry_paths for t in tests):
        rep.add(path, None, "no-selftest", "нет самотеста selftest/test-%s.py или .sh" % stem)


def check_hooks(source, entry_paths, rep):
    by_path = dict((e.path, e) for e in source.entries())
    workflow = None
    if WORKFLOW in by_path:
        workflow = (source.read(by_path[WORKFLOW]) or b"").decode("utf-8", "replace")
    for hook in HOOKS:
        path = "scripts/githooks/" + hook
        if path not in by_path:
            rep.add(path, None, "hook-missing", "нет хука git %s в scripts/githooks" % hook)
            continue
        if by_path[path].mode != "100755":
            rep.add(path, None, "hook-not-executable", "хук git не исполняемый (режим %s)" % by_path[path].mode)
        text = (source.read(by_path[path]) or b"").decode("utf-8", "replace")
        for needed in HOOK_NAMES[path]:
            if needed not in text:
                rep.add(path, None, "not-wired", "хук не вызывает %s" % needed)
    if workflow is None:
        rep.add(WORKFLOW, None, "not-wired", "нет workflow CI " + WORKFLOW)
    else:
        for token in WORKFLOW_TOKENS:
            if token not in workflow:
                rep.add(WORKFLOW, None, "not-wired", "workflow не вызывает %s" % token)


def _covers(matcher, tool):
    if matcher in ("", "*", None):
        return True
    try:
        return re.fullmatch(matcher, tool) is not None
    except re.error:
        return False


def check_agent_hook(source, entry_paths, rep, python_cmd):
    by_path = dict((e.path, e) for e in source.entries())
    if SETTINGS not in by_path:
        rep.add(SETTINGS, None, "agent-hook", "нет записи хука агента (.claude/settings.json)")
        return
    try:
        data = json.loads((source.read(by_path[SETTINGS]) or b"").decode("utf-8-sig"))
        entries = data["hooks"]["PreToolUse"]
        assert isinstance(entries, list)
    except Exception:
        rep.add(SETTINGS, None, "agent-hook", "в .claude/settings.json нет hooks.PreToolUse или файл не JSON")
        return
    covered = set()
    good_commands = []
    for entry in entries:
        for tool in ("Bash", "PowerShell"):
            if _covers(entry.get("matcher"), tool):
                covered.add(tool)
        for hook in entry.get("hooks", []):
            command = hook.get("command", "")
            if "scripts/agent-hooks/" in command:
                good_commands.append(command)
    for tool in ("Bash", "PowerShell"):
        if tool not in covered:
            rep.add(SETTINGS, None, "agent-hook", "запись хука агента не покрывает инструмент %s" % tool)
    if not good_commands:
        rep.add(SETTINGS, None, "agent-hook", "команда хука не зовёт скрипт из scripts/agent-hooks")
        return
    for command in good_commands:
        script = re.search(r"scripts/agent-hooks/[A-Za-z0-9_.-]+\.py", command)
        if not script or script.group(0) not in entry_paths:
            rep.add(SETTINGS, None, "agent-hook", "скрипт хука агента из команды не существует")
        m = re.search(r"\bexec\s+(\S+)\s+\"?\$", command) or re.search(r"\b(python[0-9.]*)\b", command)
        word = m.group(1) if m else ""
        if word != "python":
            rep.add(SETTINGS, None, "agent-hook", "хук агента запускается не явным интерпретатором python (на машине python3 бывает заглушкой)")
            continue
        try:
            ok = subprocess.run([python_cmd, "-c", "pass"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        except OSError:
            ok = False
        if not ok:
            rep.add(SETTINGS, None, "agent-hook", "интерпретатор python из команды хука агента не запускается")


def judge(source, args, rep):
    entries = source.entries()
    entry_paths = set(e.path for e in entries)
    if not any(p.startswith("scripts/guards/") for p in entry_paths):
        return guardlib.Outcome(count=0)
    count = 0
    for entry in entries:
        if not GUARD_PATH.match(entry.path):
            continue
        text = (source.read(entry) or b"").decode("utf-8", "replace")
        count += 1
        check_header(entry.path, text, rep)
        check_guard(entry.path, entry_paths, rep)
    check_hooks(source, entry_paths, rep)
    check_agent_hook(source, entry_paths, rep, args.python_cmd)
    return guardlib.Outcome(count=count)


def extra(parser):
    parser.add_argument("--python-cmd", default="python")


if __name__ == "__main__":
    sys.exit(guardlib.run("check-wiring", "стражей", judge, extra=extra,
                          lost="нет папки scripts/guards: стражи потеряны"))
