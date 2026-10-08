# -*- coding: utf-8 -*-
"""Страж рукописных таблиц статусов: список задач с состоянием руками не ведётся.

Зачем: таблица «задача — статус», набранная руками в .md, расходится с папками задач и их журналом
    через неделю и становится ложью; правду о задачах дают сами папки doc/tasks/ и log.md в них.
Проверяет: в отслеживаемых .md строку таблицы, у которой первая ячейка — ссылка на папку задачи
    (цель, разрешённая от файла, — doc/tasks/NNN-…), если у таблицы есть колонка «Статус», «Status»
    или «State». Одной такой строки достаточно. Слово статуса не перечисляется: признак — колонка.
Не проверяет: реестр ADR (его ссылки ведут на файлы решений, а не на папки задач), таблицы, где
    ссылка на задачу стоит не в первой ячейке (например, «What is here» корня: первая ячейка — папка
    части), таблицы внутри блоков кода, списки задач без таблицы.
Правило: doc/canon/process.md (список задач — папки doc/tasks/, руками не ведётся).

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import posixpath
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

STATUS_COLUMN = re.compile(r"^[*_ ]*(статус|status|state)[*_ ]*$", re.I)
SEPARATOR = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")
FIRST_LINK = re.compile(r"^[*_ ]*!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+[\"'][^)]*)?\)")
TASK_FOLDER = re.compile(r"^doc/tasks/\d+[^/]*/?$")


def split_row(line):
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", body)]


def find_status_tables(path, text):
    """Строки таблиц статусов: список (номер строки) для файла path."""
    lines = guardlib.strip_fenced(text).split("\n")
    found = []
    i = 0
    while i + 1 < len(lines):
        if lines[i].lstrip().startswith("|") and SEPARATOR.match(lines[i + 1]) and "|" in lines[i + 1]:
            header = split_row(lines[i])
            has_status = any(STATUS_COLUMN.match(cell) for cell in header)
            j = i + 2
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                if has_status:
                    cells = split_row(lines[j])
                    m = FIRST_LINK.match(cells[0]) if cells else None
                    if m:
                        target = m.group(1).split("#")[0]
                        if not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
                            joined = posixpath.normpath(posixpath.join(posixpath.dirname(path), target))
                            if TASK_FOLDER.match(joined):
                                found.append(j + 1)
                j += 1
            i = j
        else:
            i += 1
    return found


def judge(source, args, rep):
    count = 0
    for entry in source.changed():
        if not entry.path.lower().endswith(".md") or entry.mode == "160000":
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        text = data.decode("utf-8", "replace").lstrip("\ufeff")
        for number in find_status_tables(entry.path, text):
            rep.add(entry.path, number, "status-table",
                    "рукописная таблица статусов задач: список задач — папки doc/tasks/")
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-no-status-table", "файлов .md", judge, lost="нет ни одного .md в репозитории"))
