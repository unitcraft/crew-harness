# -*- coding: utf-8 -*-
"""Хук агента для команд оболочки: подсказка против опасных и калечащих приёмов git (PreToolUse).

Зачем: агент, правящий общий каталог, одной командой может забрать чужие правки в коммит, спрятать
    чужую работу в stash, переписать историю, обойти хуки или молча испортить текст обратным
    апострофом. Хук напоминает правила проекта (AGENTS.md п.4 и п.5) в момент команды.
Проверяет: каждый вызов git в команде отдельно (цепочки &&, ||, ;, |, перевод строки, скобки,
    отдельные { и } судятся порознь) по правилам: add с -A, --all, -u, --update или точкой; stash; push с
    --force, -f, --force-with-lease, --force-if-includes, +ref; --no-verify у commit и push; -n у
    commit; filter-branch, filter-repo; config user.name и user.email со значением; commit без
    --only, -o, --include, -i, --amend, отдельного -- и без пометки «# index-verified: <причина>»;
    флаг после -- у commit; обратный апостроф вне кавычек у printf и python -c; по сырой команде —
    запись файла командами PowerShell с обратным апострофом или @"…"@, git commit -m с обратным апострофом.
    Литералы командой не считаются: текст в кавычках, тело heredoc, here-string PowerShell.
Не проверяет: это подсказка, а не барьер. Не видит псевдонимы, сокращения флагов, слитные короткие
    флаги, смену каталога, -c и окружение git, команду внутри bash -c, sh -c и powershell -Command,
    запуск git из скрипта, правку .git/config инструментом записи файлов. Ошибка разбора — код 0.
    Дисциплину main держит защита ветки на GitHub, а не этот хук.
Правило: AGENTS.md п.4 (коммиты: файлы по имени, без git add -A) и п.5 (без силового пуша).

Вход: JSON на stdin (tool_name, tool_input.command). Выход: код 2 и причина в stderr — отказ,
код 0 — проход. Запись в .claude/settings.json вызывает хук обёрткой sh: при отсутствии файла хука
выход 0, а не отказ каждой команды.
"""
import sys

sys.dont_write_bytecode = True

import json
import re


class Tok(object):
    __slots__ = ("text", "quoted", "tick")

    def __init__(self):
        self.text = ""
        self.quoted = False
        self.tick = False


_WORD_END = " \t\r\n;&|<>()"


def _skip_heredoc_at(cmd, j):
    """Если в позиции j начинается heredoc внутри подстановки, вернуть позицию после его тела."""
    n = len(cmd)
    k = j + 2
    if k < n and cmd[k] == "-":
        k += 1
    while k < n and cmd[k] in " \t":
        k += 1
    delim, k = _read_delimiter(cmd, k)
    if not delim:
        return j + 2
    nl = cmd.find("\n", k)
    if nl < 0:
        return n
    return _skip_body(cmd, nl + 1, delim, cmd[j + 2:j + 3] == "-")


def _read_delimiter(cmd, k):
    n = len(cmd)
    if k < n and cmd[k] in "'\"":
        q = cmd[k]
        end = cmd.find(q, k + 1)
        if end < 0:
            return "", k
        return cmd[k + 1:end], end + 1
    if k < n and cmd[k] == "\\":
        k += 1
    start = k
    while k < n and cmd[k] not in _WORD_END:
        k += 1
    return cmd[start:k], k


def _skip_body(cmd, pos, delim, strip_tabs):
    """Позиция после строки-ограничителя heredoc (или конец текста)."""
    n = len(cmd)
    while pos < n:
        nl = cmd.find("\n", pos)
        line = cmd[pos:nl] if nl >= 0 else cmd[pos:]
        line = line.rstrip("\r")
        if strip_tabs:
            line = line.lstrip("\t")
        if line == delim:
            return nl + 1 if nl >= 0 else n
        if nl < 0:
            return n
        pos = nl + 1
    return n


def _skip_quoted(cmd, j, quote, ps, depth):
    """Позиция после закрывающей кавычки; j — первый знак после открывающей."""
    n = len(cmd)
    if depth > 40:
        raise ValueError("слишком глубокая вложенность")
    while j < n:
        ch = cmd[j]
        if quote == "'":
            if ch == "'":
                if ps and cmd[j + 1:j + 2] == "'":
                    j += 2
                    continue
                return j + 1
            j += 1
            continue
        if (ch == "`" and ps) or (ch == "\\" and not ps):
            j += 2
            continue
        if ch == '"':
            if ps and cmd[j + 1:j + 2] == '"':
                j += 2
                continue
            return j + 1
        if ch == "$" and cmd[j + 1:j + 2] == "(":
            j = _skip_subst(cmd, j + 2, ps, depth + 1)
            continue
        j += 1
    return n


def _skip_subst(cmd, j, ps, depth):
    """Позиция после «)» подстановки $( … ); j — первый знак после «$(»."""
    n = len(cmd)
    level = 1
    while j < n and level:
        ch = cmd[j]
        if ch in "'\"":
            j = _skip_quoted(cmd, j + 1, ch, ps, depth + 1)
            continue
        if ch == "<" and cmd.startswith("<<", j) and not cmd.startswith("<<<", j) and not ps:
            j = _skip_heredoc_at(cmd, j)
            continue
        if ch == "(":
            level += 1
        elif ch == ")":
            level -= 1
        j += 1
    return j


def lex(cmd, ps=False):
    """Разбор команды на вызовы: список вызовов, вызов — список токенов Tok. Литералы командой не считаются."""
    calls = []
    cur = []
    tok = [None]
    pending = []
    n = len(cmd)
    i = 0

    def add(text, quoted=False, tick=False):
        if tok[0] is None:
            tok[0] = Tok()
        tok[0].text += text
        tok[0].quoted = tok[0].quoted or quoted
        tok[0].tick = tok[0].tick or tick

    def end_tok():
        if tok[0] is not None:
            cur.append(tok[0])
            tok[0] = None

    def end_call():
        end_tok()
        if cur:
            calls.append(list(cur))
            del cur[:]

    while i < n:
        c = cmd[i]
        nxt = cmd[i + 1] if i + 1 < n else ""
        # продолжение строки
        if not ps and c == "\\" and (nxt == "\n" or cmd.startswith("\r\n", i + 1)):
            i += 2 if nxt == "\n" else 3
            continue
        if ps and c == "`" and (nxt == "\n" or cmd.startswith("\r\n", i + 1)):
            i += 2 if nxt == "\n" else 3
            continue
        if c in " \t\r":
            end_tok()
            i += 1
            continue
        if c == "\n":
            end_call()
            i += 1
            for delim, strip in pending:
                i = _skip_body(cmd, i, delim, strip)
            del pending[:]
            continue
        if c == "#" and tok[0] is None:
            nl = cmd.find("\n", i)
            i = n if nl < 0 else nl
            continue
        # here-string PowerShell: @'…'@ и @"…"@ — один литерал
        if ps and c == "@" and nxt in ("'", '"') and re.match(r"[ \t]*\r?(\n|$)", cmd[i + 2:]):
            close = cmd.find("\n" + nxt + "@", i + 2)
            add("", quoted=True)
            i = n if close < 0 else close + 3
            continue
        if not ps and c == "<" and cmd.startswith("<<", i) and not cmd.startswith("<<<", i):
            j = i + 2
            strip = False
            if cmd[j:j + 1] == "-":
                strip = True
                j += 1
            while j < n and cmd[j] in " \t":
                j += 1
            delim, j = _read_delimiter(cmd, j)
            if delim:
                pending.append((delim, strip))
            end_tok()
            i = j
            continue
        if c == "'":
            start = i + 1
            j = _skip_quoted(cmd, start, "'", ps, 0)
            body = cmd[start:j - 1] if j - 1 >= start else ""
            add(body.replace("''", "'") if ps else body, quoted=True)
            i = j
            continue
        if c == '"':
            start = i + 1
            j = _skip_quoted(cmd, start, '"', ps, 0)
            add(cmd[start:max(start, j - 1)], quoted=True)
            i = j
            continue
        if c == "`":
            add(nxt if ps else "`", tick=True)
            i += 2 if ps else 1
            continue
        if c == "\\" and not ps:
            add(nxt)
            i += 2
            continue
        if cmd.startswith("&&", i) or cmd.startswith("||", i):
            end_call()
            i += 2
            continue
        if c == ";" or c == "|":
            end_call()
            i += 1
            continue
        if c == "&":
            prev = cmd[i - 1] if i else ""
            if prev in "<>" or nxt == ">":
                add("&")
            else:
                end_call()
            i += 1
            continue
        if c in "()":
            end_call()
            i += 1
            continue
        if c in "{}" and tok[0] is None and (nxt == "" or nxt in " \t\r\n;"):
            end_call()
            i += 1
            continue
        add(c)
        i += 1
    end_call()
    return calls


# --- разбор вызова git ---------------------------------------------------------------------------

_WRAPPERS = ("sudo", "env", "command", "exec", "time", "nohup")
_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
_GLOBAL_ARG1 = ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path")
_PYTHON = re.compile(r"^python[0-9.]*(\.exe)?$", re.I)


def _base(text):
    return re.split(r"[\\/]", text)[-1]


def _command_tokens(call):
    """Токены вызова после присваиваний и обёрток (sudo, env, command, exec, time)."""
    i = 0
    while i < len(call):
        t = call[i]
        if not t.quoted and _ASSIGN.match(t.text):
            i += 1
        elif not t.quoted and t.text in _WRAPPERS:
            i += 1
            if t.text == "env":
                while i < len(call) and (_ASSIGN.match(call[i].text) or call[i].text.startswith("-")):
                    i += 1
        else:
            break
    return call[i:]


def git_calls(calls):
    """Вызовы git: [(подкоманда, аргументы-токены)]."""
    found = []
    for call in calls:
        toks = _command_tokens(call)
        if not toks or _base(toks[0].text).lower() not in ("git", "git.exe"):
            continue
        i = 1
        while i < len(toks):
            t = toks[i].text
            if t in ("-C", "-c") or t in ("--git-dir", "--work-tree", "--namespace", "--exec-path"):
                i += 2
            elif t.startswith("-"):
                i += 1
            else:
                break
        if i < len(toks):
            found.append((toks[i].text, toks[i + 1:]))
    return found


def _plain(args):
    return [t.text for t in args if not t.quoted]


def rule_add_all(sub, args):
    if sub == "add" and any(a in ("-A", "--all", "-u", "--update", ".") for a in _plain(args)):
        return "add-all", "git add -A / --all / -u / . takes everything, including other people's files; add files by name: git add -- <files>"


def rule_stash(sub, args):
    if sub == "stash":
        return "stash", "git stash hides work of other windows in the shared checkout; do not use it"


def rule_force_push(sub, args):
    if sub == "push":
        for a in _plain(args):
            if a in ("--force", "-f", "--force-if-includes") or a.startswith("--force-with-lease") \
                    or (a.startswith("+") and len(a) > 1):
                return "force-push", "force push is forbidden; history is not rewritten after publishing"


def rule_no_verify(sub, args):
    if sub in ("commit", "push") and "--no-verify" in _plain(args):
        return "no-verify", "--no-verify skips the repository hooks; fix the finding instead"
    if sub == "commit" and "-n" in _plain(args):
        return "no-verify", "-n skips the repository hooks for git commit; fix the finding instead"


def rule_rewrite(sub, args):
    if sub in ("filter-branch", "filter-repo"):
        return "rewrite-history", "%s rewrites the whole history of the shared .git; ask the owner" % sub


def rule_config_user(sub, args):
    if sub == "config":
        for index, tok in enumerate(args):
            if not tok.quoted and tok.text.lower() in ("user.name", "user.email") and index + 1 < len(args):
                value = args[index + 1]
                if value.quoted or not value.text.startswith("-"):
                    return "config-user", "do not write git config user.*; it is the owner's identity"


def rule_commit_scope(sub, args, raw):
    if sub != "commit":
        return None
    plain = _plain(args)
    scoped = any(a in ("--only", "-o", "--include", "-i", "--amend", "--") for a in plain)
    if scoped or re.search(r"#\s*index-verified:\s*\S", raw):
        return None
    return "commit-scope", ("git commit without a file list may take another window's staged files; use "
                            "git commit -s -F <message file> --only -- <files> (a new file first: git add -- <file>), "
                            "or add '# index-verified: <reason>' to the command")


def rule_flag_after_dashes(sub, args):
    if sub == "commit":
        plain = _plain(args)
        if "--" in plain:
            after = plain[plain.index("--") + 1:]
            if any(a.startswith("-") for a in after):
                return "flag-after-dashes", "a flag after -- is read by git as a path; put flags before --"


def rule_backtick_in_call(calls):
    for call in calls:
        toks = _command_tokens(call)
        if not toks:
            continue
        name = _base(toks[0].text)
        is_printf = name == "printf"
        is_python_c = bool(_PYTHON.match(name)) and any(t.text == "-c" and not t.quoted for t in toks[1:])
        if (is_printf or is_python_c) and any(t.tick for t in toks):
            return "backtick", ("a backtick outside quotes in printf / python -c is run by the shell as a command and "
                                "silently eats text; write the text to a file and pass the file")


FILE_WRITERS = re.compile(r"(Set-Content|Out-File|Add-Content|WriteAllText|WriteAllLines)", re.I)
COMMIT_M = re.compile(r"\bgit\b[^\n]*?\bcommit\b(?!-)[^\n]*?\s-m\b.*?`", re.S)


def raw_rules(raw, ps):
    """Правила по сырой команде (вместе с литералами). Продолжение строки обратным апострофом не в счёт."""
    text = re.sub(r"`\r?\n", "", raw) if ps else raw
    if FILE_WRITERS.search(text) and ("`" in text or '@"' in text):
        return "ps-write", ("writing text to a file with PowerShell cmdlets is unsafe with a backtick or an @\"...\"@ "
                            "here-string (the backtick is an escape and eats text); use a script file or @'...'@")
    if COMMIT_M.search(text):
        return "commit-m-backtick", ("git commit -m with a backtick makes bash run a command substitution inside the "
                                     "message; write the message to a file and use -F")
    return None


def decide(command, tool_name="Bash"):
    """None — команда проходит; иначе (правило, причина)."""
    ps = tool_name == "PowerShell"
    calls = lex(command, ps)
    for sub, args in git_calls(calls):
        for rule in (rule_add_all, rule_stash, rule_force_push, rule_no_verify, rule_rewrite,
                     rule_config_user, rule_flag_after_dashes):
            verdict = rule(sub, args)
            if verdict:
                return verdict
        verdict = rule_commit_scope(sub, args, command)
        if verdict:
            return verdict
    verdict = rule_backtick_in_call(calls)
    if verdict:
        return verdict
    return raw_rules(command, ps)


def main():
    try:
        data = sys.stdin.buffer.read().decode("utf-8", "replace")
        payload = json.loads(data)
        command = payload["tool_input"]["command"]
        tool = payload.get("tool_name", "Bash")
        if not isinstance(command, str):
            return 0
        verdict = decide(command, tool if isinstance(tool, str) else "Bash")
    except Exception:
        return 0
    if verdict:
        sys.stderr.write("REFUSED (%s): %s\n" % verdict)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
