# -*- coding: utf-8 -*-
"""Самотест хука агента guard-git.py: таблица команд AC-10, красная проба на каждое правило, хулиганы.

Зачем: хук работает на каждой команде агента; ложный отказ законной команды мешает работать и ведёт к
    отключению хука, пропуск запрещённой — делает его бесполезным. Таблица команд — данные теста.
Проверяет: ответ хука на каждую строку таблицы (отказ — код 2 с причиной, проход — код 0); для
    каждого правила отдельную красную команду, где отказ даёт именно оно; цепочки и продолжения строк
    bash и PowerShell, heredoc и here-string, обычный апостроф и обратный; кириллицу в команде;
    хулиганские входы (несбалансированная кавычка, пустая команда, битый JSON); запись хука в
    .claude/settings.json через sh в пяти положениях (корень, подкаталог, без CLAUDE_PROJECT_DIR,
    дерево без скрипта, красная команда).
Не проверяет: поведение в живом окне агента (проба по слову владельца).
Правило: AGENTS.md п.4, п.5; AC-10 задачи.

Тест находит хук по пути рядом с собой. Образцы с обратным апострофом собираются из кода символа.
"""
import sys

sys.dont_write_bytecode = True

import importlib.util
import json
import os
import shutil

import stlib

HOOK = os.path.join(stlib.SCRIPTS, "agent-hooks", "guard-git.py")
SETTINGS = os.path.join(stlib.REPO, ".claude", "settings.json")
spec = importlib.util.spec_from_file_location("guard_git", HOOK)
gg = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(gg)
except BaseException:  # заглушка хука может завершить процесс при загрузке: проба тогда должна упасть
    gg = None

T = chr(96)  # обратный апостроф
F = "m.txt"
A = "a.txt"
SCOPED = "git commit -s -F %s --only -- %s" % (F, A)
CYR = "привет"
BS = chr(92)

# (инструмент, команда, ожидаемый код, пояснение)
TABLE = [
    ("Bash", "git add -A", 2, "add -A"),
    ("Bash", "git add .", 2, "add ."),
    ("Bash", "git add -u", 2, "add -u"),
    ("Bash", "git stash", 2, "stash"),
    ("Bash", "git push --force", 2, "push --force"),
    ("Bash", "git push -f", 2, "push -f"),
    ("Bash", "git push --force-with-lease", 2, "push --force-with-lease"),
    ("Bash", "git push origin +main", 2, "push +ref"),
    ("Bash", "git filter-branch --tree-filter x HEAD", 2, "filter-branch"),
    ("Bash", "git filter-repo --path x", 2, "filter-repo"),
    ("Bash", "git commit --no-verify -s -F %s --only -- %s" % (F, A), 2, "commit --no-verify"),
    ("Bash", "git commit -n -s -F %s --only -- %s" % (F, A), 2, "commit -n"),
    ("Bash", "git push --no-verify", 2, "push --no-verify"),
    ("Bash", "git commit -sn -F %s --only -- %s" % (F, A), 0, "слитные флаги — известный пропуск"),
    ("Bash", "git config user.email x@example.test", 2, "config user.email со значением"),
    ("Bash", "git commit -- %s -F %s" % (A, F), 2, "флаг после --"),
    ("Bash", "git commit -s -F %s" % F, 2, "commit без перечня файлов"),
    ("Bash", "git add -- %s && git commit -s -F %s" % (A, F), 2, "commit без перечня после add"),
    ("Bash", "printf %s " + T + "date" + T, 2, "printf с обратным апострофом вне кавычек"),
    ("Bash", "python -c print" + T + "id" + T, 2, "python -c с обратным апострофом вне кавычек"),
    ("PowerShell", "Set-Content -Path a.txt -Value 'x" + T + "ny'", 2, "Set-Content с обратным апострофом"),
    ("Bash", 'git commit -s -m "Fix ' + T + 'cell' + T + '" --only -- ' + A, 2, "commit -m с обратным апострофом"),
    ("Bash", "printf '%s' \"it's fine\"", 0, "обычный апостроф внутри двойных кавычек"),
    ("Bash", "printf '%s' 'Fix " + T + "cell" + T + "' > f.txt", 0, "обратный апостроф внутри одинарных"),
    ("Bash", 'python -c "print(\'' + T + 'x' + T + '\')"', 0, "обратный апостроф внутри двойных"),
    ("Bash", SCOPED, 0, "commit с --only"),
    ("Bash", "git commit -i -s -F %s" % F, 0, "commit -i"),
    ("Bash", "git commit --amend --no-edit", 0, "commit --amend"),
    ("Bash", "git commit -s -F %s # index-verified: whole index is mine" % F, 0, "пометка index-verified"),
    ("Bash", SCOPED + " && git push -u origin task-branch", 0, "commit и push -u"),
    ("Bash", SCOPED + " && git status -s", 0, "commit и status"),
    ("Bash", SCOPED + "; git log -1 -m", 0, "commit; log -m"),
    ("Bash", "git push -n origin task-branch", 0, "push -n (пробный прогон)"),
    ("Bash", "git commit -s -F %s %s\n--only -- %s" % (F, BS, A), 0, "bash: продолжение строки"),
    ("PowerShell", "git commit -s -F %s %s\n--only -- %s" % (F, T, A), 0, "PowerShell: продолжение строки"),
    ("Bash", SCOPED + " || git status", 0, "commit || status"),
    ("Bash", "git log --grep stash", 0, "log --grep stash"),
    ("Bash", "git grep -n stash -- %s" % A, 0, "grep stash"),
    ("Bash", "git config user.email", 0, "config user.email (чтение)"),
    ("Bash", "git config --get user.email", 0, "config --get user.email"),
    ("Bash", "git config user.name && git config user.email", 0, "чтение двух ключей"),
    ("Bash", "git config user.email || echo none", 0, "чтение с || echo"),
    ("Bash", 'grep -n "git stash" AGENTS.md', 0, "grep по тексту про stash"),
    ("Bash", 'git commit -s -m "... git add -A ..." --only -- %s' % A, 0, "git add -A в тексте сообщения"),
    ("Bash", "cat <<EOF\ngit push --force\nEOF", 0, "heredoc: строка в теле"),
    ("Bash", "cat <<\"EOF\"\ngit stash\ngit add -A\nEOF", 0, "heredoc в кавычках"),
    ("PowerShell", "@'\ndoesn't matter\ngit push --force\n'@ | Set-Content a.txt", 0, "here-string с апострофом"),
    ("PowerShell", "$t = @\"\ngit add -A\n\"@\nWrite-Output $t", 0, "here-string в двойных кавычках без записи в файл"),
    ("PowerShell", SCOPED + "; if ($?) { git push origin task-branch }", 0, "PowerShell: commit; if { push }"),
    ("PowerShell", "git status; if ($?) { git log -1 }", 0, "PowerShell: status; if { log }"),
    ("PowerShell", "git add -A; if ($?) { git status }", 2, "PowerShell: add -A; if { status }"),
    ("Bash", "git add -- %s" % A, 0, "add по имени"),
    ("Bash", "git merge --ff-only task-branch", 0, "merge --ff-only"),
    ("Bash", "git rebase main", 0, "rebase"),
    ("Bash", "git rebase --continue", 0, "rebase --continue"),
    ("Bash", "git pull --rebase origin task-branch", 0, "pull --rebase"),
    ("Bash", "git push origin --delete task-branch", 0, "push --delete"),
    ("Bash", "git worktree remove --force ../wt", 0, "worktree remove --force"),
    ("Bash", "git branch -d task-branch", 0, "branch -d"),
]

# Дополнительные пробы по plan-review-1 и хулиганы: (инструмент, команда, код, пояснение)
EXTRA = [
    ("Bash", 'git commit -s -m "Don\'t panic" --only -- %s' % A, 0, "обычный апостроф в сообщении"),
    ("Bash", 'git commit -s -m "Don' + T + 't" --only -- ' + A, 2, "обратный апостроф в сообщении"),
    ("Bash", "echo " + CYR + " && git status", 0, "кириллица в команде"),
    ("Bash", "echo " + CYR + " && git add -A", 2, "кириллица и add -A"),
    ("PowerShell", 'Write-Host "say ' + T + '"git add -A' + T + '""', 0, "PowerShell: экранированные кавычки"),
    ("PowerShell", "Write-Host 'it''s git add -A'", 0, "PowerShell: два апострофа внутри"),
    ("Bash", "git commit -s -m \"$(cat <<'EOF'\nTitle with don't\n\nBody\nEOF\n)\" --only -- %s" % A, 0, "вложенный heredoc в подстановке"),
    ("Bash", "echo \"abc", 0, "несбалансированная кавычка"),
    ("Bash", "echo 'abc", 0, "несбалансированная одинарная кавычка"),
    ("Bash", "", 0, "пустая команда"),
    ("Bash", "   \n  ", 0, "пустая строка"),
    ("Bash", "git", 0, "git без подкоманды"),
    ("Bash", "git -C ../wt status", 0, "git -C status"),
    ("Bash", "git -C ../wt add -A", 2, "git -C add -A"),
    ("Bash", "sudo git stash", 2, "обёртка sudo"),
    ("Bash", "GIT_TRACE=1 git stash", 2, "присваивание перед git"),
    ("Bash", "git.exe stash", 2, "git.exe"),
    ("Bash", "git commit-graph verify", 0, "commit-graph — не commit"),
    ("Bash", "(git stash)", 2, "git в скобках"),
    ("Bash", "{ git stash; }", 2, "git в фигурных скобках"),
    ("Bash", "echo a | git stash", 2, "git после конвейера"),
    ("Bash", "git push origin HEAD:main 2>&1 | tail -1", 0, "перенаправление 2>&1"),
    ("Bash", "git push --force 2>&1", 2, "force и 2>&1"),
    ("Bash", "echo 'x' # git stash", 0, "комментарий"),
]

RULES = {
    "add-all": "git add -A",
    "stash": "git stash",
    "force-push": "git push --force",
    "no-verify": "git push --no-verify",
    "rewrite-history": "git filter-repo --path x",
    "config-user": "git config user.name Someone",
    "commit-scope": "git commit -s -F m.txt",
    "flag-after-dashes": "git commit -- a.txt -F m.txt",
    "backtick": "printf %s " + T + "x" + T,
    "ps-write": "Set-Content a.txt -Value " + T + "n",
    "commit-m-backtick": 'git commit -s -m "a ' + T + 'b' + T + '" --only -- a.txt',
}


def main():
    pr = stlib.Probes("guard-git")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)

    def hook(tool, command, raw=None):
        payload = raw if raw is not None else json.dumps({"tool_name": tool, "tool_input": {"command": command}})
        data = payload if isinstance(payload, bytes) else payload.encode("utf-8")
        return stlib.run((sys.executable, HOOK), env=env, input=data)

    def table_probe(rows):
        def fn():
            bad = []
            for tool, command, want, why in rows:
                verdict = gg.decide(command, tool)
                got = 2 if verdict else 0
                if got != want:
                    bad.append("%s [%s]: ждали %d, получили %d" % (why, tool, want, got))
            assert not bad, "; ".join(bad)
        return fn

    def process_exit_codes():
        # настоящий процесс: код 2 с причиной в stderr, код 0 молча
        proc = hook("Bash", "git add -A")
        assert proc.returncode == 2 and "REFUSED" in proc.err and "add-all" in proc.err, (proc.returncode, proc.err)
        proc = hook("Bash", SCOPED)
        assert proc.returncode == 0 and proc.err == "", (proc.returncode, proc.err)
        proc = hook("PowerShell", "git add -A; if ($?) { git status }")
        assert proc.returncode == 2, proc.returncode

    def per_rule_red(rule, command):
        def fn():
            tool = "PowerShell" if rule == "ps-write" else "Bash"
            verdict = gg.decide(command, tool)
            assert verdict and verdict[0] == rule, "ждали правило %s, получили %r для %r" % (rule, verdict, command)
            proc = hook(tool, command)
            assert proc.returncode == 2 and ("(%s)" % rule) in proc.err, (proc.returncode, proc.err)
        return fn

    def hooligans():
        for raw in (b"{not json", b"", b"[]", b'{"tool_name":"Bash"}', b'{"tool_input":{"command":5}}',
                    b'{"tool_name":"Bash","tool_input":{}}', b"\xff\xfe\x00 bytes"):
            proc = hook("Bash", "", raw=raw)
            assert proc.returncode == 0, (raw, proc.returncode, proc.err)
        deep = "echo " + '"$(' * 60 + "x" + ')"' * 60
        proc = hook("Bash", deep)
        assert proc.returncode == 0, (proc.returncode, proc.err)

    def cyrillic_through_process():
        proc = hook("Bash", "echo " + CYR + " && git add -A")
        assert proc.returncode == 2, (proc.returncode, proc.err)
        proc = hook("Bash", "echo " + CYR + " && git status")
        assert proc.returncode == 0, (proc.returncode, proc.err)

    # --- запись хука в .claude/settings.json --------------------------------------------------
    def settings_command():
        with open(SETTINGS, encoding="utf-8") as handle:
            data = json.load(handle)
        entries = data["hooks"]["PreToolUse"]
        assert len(entries) == 1 and entries[0]["matcher"] == "Bash|PowerShell", entries
        assert "permissions" not in data, "ключ permissions запрещён (DNC-01)"
        return entries[0]["hooks"][0]["command"]

    def run_entry(cwd, extra_env, tool_command):
        command = settings_command()
        e = dict(env)
        e.pop("CLAUDE_PROJECT_DIR", None)
        e.update(extra_env)
        payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": tool_command}}).encode("utf-8")
        return stlib.run(("sh", "-c", command), cwd=cwd, env=e, input=payload)

    def settings_positions():
        repo = stlib.make_repo(base, env, {"a.txt": "x\n"}, name="withhook")
        os.makedirs(os.path.join(repo, "scripts", "agent-hooks"))
        shutil.copy(HOOK, os.path.join(repo, "scripts", "agent-hooks", "guard-git.py"))
        sub = os.path.join(repo, "sub")
        os.makedirs(sub)
        proc = run_entry(repo, {"CLAUDE_PROJECT_DIR": repo}, "git status")
        assert proc.returncode == 0, ("корень, зелёная", proc.returncode, proc.err)
        proc = run_entry(repo, {"CLAUDE_PROJECT_DIR": repo}, "git add -A")
        assert proc.returncode == 2, ("корень, красная", proc.returncode, proc.err)
        proc = run_entry(sub, {}, "git add -A")
        assert proc.returncode == 2, ("подкаталог без переменной, красная", proc.returncode, proc.err)
        proc = run_entry(sub, {}, "git status")
        assert proc.returncode == 0, ("подкаталог, зелёная", proc.returncode, proc.err)
        proc = run_entry(repo, {}, "git add -A")
        assert proc.returncode == 2, ("корень без переменной, красная", proc.returncode, proc.err)

    def settings_no_script():
        repo = stlib.make_repo(base, env, {"a.txt": "x\n"}, name="nohook")
        proc = run_entry(repo, {}, "git add -A")
        assert proc.returncode == 0, ("дерево без скрипта", proc.returncode, proc.err)
        proc = run_entry(repo, {"CLAUDE_PROJECT_DIR": repo}, "git add -A")
        assert proc.returncode == 0, ("переменная указывает на дерево без скрипта", proc.returncode, proc.err)
        plain = os.path.join(base, "plain")
        os.makedirs(plain)
        proc = run_entry(plain, {}, "git add -A")
        assert proc.returncode == 0, ("папка не под git", proc.returncode, proc.err)

    def settings_one_line_json():
        command = settings_command()
        assert "\n" not in command and "python " in command and "python3" not in command, command

    pr.probe("законное", "таблица AC-10 (%d строк)" % len(TABLE), table_probe(TABLE))
    pr.probe("законное", "настоящий процесс: код 2 с причиной, код 0 молча", process_exit_codes)
    pr.probe("законное", "запись в settings.json: одна строка, python, без permissions", settings_one_line_json)
    pr.probe("законное", "запись в settings.json: корень, подкаталог, без CLAUDE_PROJECT_DIR", settings_positions)
    pr.probe("законное", "запись в settings.json: дерево без скрипта — код 0, не отказ", settings_no_script)
    pr.probe("законное", "кириллица в команде через процесс", cyrillic_through_process)
    for rule in sorted(RULES):
        pr.probe("красная", "правило %s" % rule, per_rule_red(rule, RULES[rule]))
    pr.probe("иной-синтаксис", "дополнительные пробы: апострофы, обёртки, скобки, heredoc в подстановке (%d)" % len(EXTRA), table_probe(EXTRA))
    pr.probe("мишень", "хулиганские входы: битый JSON, пустой вход, не строка, глубокая вложенность", hooligans)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
