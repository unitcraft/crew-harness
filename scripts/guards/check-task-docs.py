# -*- coding: utf-8 -*-
"""Страж форматов документов задач: статус spec.md и plan.md, первая строка проверок, уникальные номера, журнал хода.

Зачем: программа цикла задач и сами сессии читают из этих файлов машинные места (статус, итог
    захода, номера требований, строки хода); молчаливо испорченная первая строка запускает проверку
    заново поверх утверждённого документа или теряет заход, а строка журнала не по форме пропадает
    из панели хода без шума.
Проверяет: в doc/tasks/*/ — первая строка spec.md и plan.md начинается с «Статус: черновик» или
    «Статус: утверждено»; первая строка spec-review-N.md, plan-review-N.md, review-N.md и
    delivery-review-N.md — «Заход N: существенных K, поверхностных M, проб P» с числами и N как в
    имени файла; номера REQ-NN, AC-NN, DNC-NN в начале строки spec.md не повторяются; progress.log —
    файл читается байтами и делится по LF (один CR в конце строки снимается), каждая непустая строка
    по форме «<код> <k>/<N> <подпись>» (journal-line, с адресом «файл:строка»), без пути машины
    (journal-path; определение одно со стражем секретов, lib/machine_paths.py) и, только в режиме
    индекса у добавленных строк журнала, который уже есть в HEAD, с подписью (без поля времени
    [ЧЧ:ММ]) не длиннее 80 знаков (journal-long).
Не проверяет: содержание документов, остальные файлы задач (result.md, log.md, profile.log,
    материалы task/), вложенные папки задач, вторую строку plan.md (база ревизии); честность строки
    журнала («пишется по ходу» судится приёмкой); предел подписи в режимах дерева и коммита и CI
    (там нет добавленных строк); k больше N и неверное поле времени (остаются подписью, как в панели).
Правило: doc/canon/process.md (цикл сессий методики, «Журнал хода progress.log») и формат машинных
    мест методики.

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402
import machine_paths  # noqa: E402

TASK_FILE = re.compile(r"^doc/tasks/[^/]+/(spec\.md|plan\.md|(?:spec-review|plan-review|review|delivery-review)-(\d+)\.md)$")
STATUS = re.compile(r"^Статус: (черновик|утверждено)")
REVIEW = re.compile(r"^Заход (\d+): существенных (\d+), поверхностных (\d+), проб (\d+)")
IDENT = re.compile(r"^(REQ|AC|DNC)-(\d+)\b")
JOURNAL_FILE = re.compile(r"^doc/tasks/[^/]+/progress\.log$")
# строка журнала (Д-11): только ASCII-цифры, остаток — любые знаки кроме LF; в JavaScript тот же язык (progress.ts, LINE_RE)
JOURNAL_LINE = re.compile(r"^([^ \t]+) ([0-9]+)/([0-9]+) ([^\n]+)$")
# необязательное поле времени в начале подписи (REQ-04): общий набор строк test/progress-vectors.json
JOURNAL_TIME = re.compile(r"^\[(?:[01][0-9]|2[0-3]):[0-5][0-9]\] ")
SIGNATURE_MAX = 80


def first_line(text):
    return text.lstrip("\ufeff").split("\n", 1)[0].rstrip("\r")


def check_status_line(path, text, rep):
    if not STATUS.match(first_line(text)):
        rep.add(path, 1, "task-status", "первая строка не «Статус: черновик» и не «Статус: утверждено»")


def check_review_line(path, number, text, rep):
    m = REVIEW.match(first_line(text))
    if not m:
        rep.add(path, 1, "review-line", "первая строка не «Заход N: существенных K, поверхностных M, проб P»")
    elif int(m.group(1)) != int(number):
        rep.add(path, 1, "review-line", "номер захода в строке не равен номеру в имени файла")


def check_unique_ids(path, text, rep):
    seen = {}
    for number, line in enumerate(text.split("\n"), 1):
        m = IDENT.match(line)
        if not m:
            continue
        key = (m.group(1), int(m.group(2)))
        if key in seen:
            rep.add(path, number, "dup-id", "повтор номера %s-%s (первое объявление в строке %d)" % (
                m.group(1), m.group(2), seen[key]))
        else:
            seen[key] = number


def split_journal(data):
    """Байты журнала → строки: UTF-8 с заменой, деление только по LF, один CR в конце снимается."""
    parts = data.decode("utf-8", "replace").split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return [p[:-1] if p.endswith("\r") else p for p in parts]


def parse_progress_line(line):
    """Строка по форме журнала → (код, k, N, подпись) или None."""
    m = JOURNAL_LINE.match(line)
    if not m or "\n" in line:
        return None
    return m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)


def signature_without_time(signature):
    m = JOURNAL_TIME.match(signature)
    return signature[m.end():] if m else signature


def check_progress_log(path, data, source, rep):
    lines = split_journal(data)
    for number, line in enumerate(lines, 1):
        if line == "":
            continue  # пустая строка форму не нарушает (на нынешних журналах их нет, Д-11 о ней молчит)
        if parse_progress_line(line) is None:
            rep.add(path, number, "journal-line", "строка не по форме «<код> <k>/<N> <подпись>»")
        if machine_paths.find_machine_paths(line):
            rep.add(path, number, "journal-path", "в строке путь машины")
    added = source.added_lines(path)
    for number, text in added or ():
        parsed = parse_progress_line(text.rstrip("\r"))
        if parsed is not None and len(signature_without_time(parsed[3])) > SIGNATURE_MAX:
            rep.add(path, number, "journal-long", "подпись добавленной строки длиннее %d знаков" % SIGNATURE_MAX)


def judge(source, args, rep):
    count = 0
    for entry in source.changed():
        if JOURNAL_FILE.match(entry.path) and entry.mode != "160000":
            data = source.read(entry)
            if data is not None:
                count += 1
                check_progress_log(entry.path, data, source, rep)
            continue
        m = TASK_FILE.match(entry.path)
        if not m or entry.mode == "160000":
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        text = data.decode("utf-8", "replace")
        name = m.group(1)
        if name in ("spec.md", "plan.md"):
            check_status_line(entry.path, text, rep)
            if name == "spec.md":
                check_unique_ids(entry.path, text.lstrip("\ufeff"), rep)
        else:
            check_review_line(entry.path, m.group(2), text, rep)
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-task-docs", "файлов задач", judge,
                          lost="нет ни одного spec.md, plan.md, progress.log или файла проверки в doc/tasks/*/"))
