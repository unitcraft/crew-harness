# -*- coding: utf-8 -*-
"""Страж секретов и путей машины: индекс, коммит или всё дерево; значение нигде не печатается.

Зачем: секрет или путь машины, попавший в публичную историю, не вычистить (силовой пуш запрещён),
    поэтому его останавливают до коммита и до пуша, а в CI проверяют всё дерево пуша.
Проверяет: маркеры конфликта слияния, заголовок приватного ключа PEM, токены GitLab и GitHub,
    учётные данные внутри адреса, непустой пароль или токен в присваивании, путь машины (REQ-06).
    Режимы --index и --commit смотрят ДОБАВЛЕННЫЕ строки и применяют все правила; режим --tree
    (по умолчанию, CI, ручной прогон) читает весь файл и применяет четыре правила высокой
    уверенности: ключ, токены, учётные данные в адресе, путь машины. Конфликты и пароль в
    присваивании в дереве не применяются: в старых строках они дают ложные срабатывания, а старые
    строки уже судил этот же страж при их добавлении.
Не проверяет: имена приватных репозиториев и проектов (check-private-names.py), содержимое бинарных
    расширений, строки, удалённые коммитом, секреты, записанные словами.
Правило: AGENTS.md п.15, ADR-0006.

Использование: guard-secrets.py [--root <папка>] [--index | --commit <хеш> | --tree]
Вердикт: «ок: осмотрено N файлов (...)», «судить нечего: индекс пуст», «FAIL: ...» с адресом без значения.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402
import machine_paths  # noqa: E402

PLACEHOLDER = re.compile(r"(password|passwd|secret|token|api_key|changeme|x{3,}|placeholder|example)\Z", re.I)

# (имя правила, образец, описание, применяется ли в режиме дерева)
RULES = [
    ("conflict-marker",
     re.compile(r"^(<{7}|>{7})(\s|$)|^={7}$"), "маркер конфликта слияния", False),
    ("private-key",
     re.compile(r"BEGIN (RSA |OPENSSH |EC |DSA |ENCRYPTED |PGP )?PRIVATE KEY"),
     "заголовок приватного ключа", True),
    ("token-gitlab", re.compile(r"glpat-[A-Za-z0-9_-]{10,}"), "токен GitLab", True),
    ("token-github",
     re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
     "токен GitHub", True),
    ("url-credentials",
     re.compile(r"[A-Za-z][A-Za-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@"),
     "логин и пароль внутри адреса", True),
    ("password-assign",
     re.compile(r"""(password|passwd|secret|token|api_key)['"]?\s*[:=]\s*['"]([^'"]{6,})['"]""", re.I),
     "непустой пароль или токен в присваивании", False),
]


def judge_line(line, tree_mode):
    """Нарушения строки: список (правило, описание); значения не возвращаются."""
    found = []
    for rule, pattern, desc, in_tree in RULES:
        if tree_mode and not in_tree:
            continue
        m = pattern.search(line)
        if not m:
            continue
        if rule == "password-assign" and PLACEHOLDER.match(m.group(2)):
            continue
        found.append((rule, desc))
    for kind in machine_paths.find_machine_paths(line):
        found.append(("machine-path", "путь машины (%s)" % kind))
    return found


def added_lines(source):
    """Добавленные строки индекса или коммита: [(путь, номер, текст)] из git diff -U0."""
    base = ("-c", "core.quotepath=off")
    opts = ("-U0", "--no-color", "--no-ext-diff", "--text", "--src-prefix=a/", "--dst-prefix=b/",
            "--diff-filter=ACMR")
    if source.mode == "commit":
        raw = guardlib.git(source.root, *(base + ("diff-tree", "-p", "-r", "--root", "-m",
                                                  "--no-commit-id") + opts + (source.commit,)))
    else:
        raw = guardlib.git(source.root, *(base + ("diff", "--cached") + opts))
    out = []
    path = None
    number = 0
    in_hunk = False
    for row in raw.split(b"\n"):
        if row.startswith(b"diff --git "):
            in_hunk = False
            path = None
            continue
        if not in_hunk:
            if row.startswith(b"+++ "):
                name = row[4:].decode("utf-8", "replace").split("\t")[0]
                path = name[2:] if name.startswith("b/") else None
            elif row.startswith(b"@@"):
                m = re.match(rb"@@ -\S+ \+(\d+)", row)
                number = int(m.group(1)) if m else 0
                in_hunk = True
            continue
        if row.startswith(b"@@"):
            m = re.match(rb"@@ -\S+ \+(\d+)", row)
            number = int(m.group(1)) if m else 0
            continue
        if row.startswith(b"+") and path:
            out.append((path, number, row[1:].decode("utf-8", "replace").rstrip("\r")))
            number += 1
    return out


def _binary(path):
    name = path.rsplit("/", 1)[-1]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name.lstrip(".") else ""
    return ext in guardlib.BINARY_EXT


def judge(source, args, rep):
    if source.mode == "tree":
        views, count = guardlib.judged_files(source)
        for view in views:
            for number, line in enumerate(view.lines, 1):
                for rule, desc in judge_line(line.rstrip("\r"), True):
                    rep.add(view.path, number, rule, desc)
        return guardlib.Outcome(count=count)
    lines = [x for x in added_lines(source) if not _binary(x[0])]
    if not lines:
        if source.mode == "index":
            return guardlib.Outcome(nothing="индекс пуст (нет добавленных строк)")
        return guardlib.Outcome(nothing="коммит не добавляет строк")
    for path, number, text in lines:
        for rule, desc in judge_line(text, False):
            rep.add(path, number, rule, desc)
    return guardlib.Outcome(count=len(set(x[0] for x in lines)))


def extra(parser):
    parser.add_argument("--tree", action="store_true")


if __name__ == "__main__":
    sys.exit(guardlib.run("guard-secrets", "файлов", judge, extra=extra,
                          lost="в репозитории нет ни одного файла для проверки"))
