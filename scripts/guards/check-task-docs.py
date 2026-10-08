# -*- coding: utf-8 -*-
"""Страж форматов документов задач: статус spec.md и plan.md, первая строка проверок, уникальные номера.

Зачем: программа цикла задач и сами сессии читают из этих файлов машинные места (статус, итог
    захода, номера требований); молчаливо испорченная первая строка запускает проверку заново поверх
    утверждённого документа или теряет заход.
Проверяет: в doc/tasks/*/ — первая строка spec.md и plan.md начинается с «Статус: черновик» или
    «Статус: утверждено»; первая строка spec-review-N.md, plan-review-N.md, review-N.md и
    delivery-review-N.md — «Заход N: существенных K, поверхностных M, проб P» с числами и N как в
    имени файла; номера REQ-NN, AC-NN, DNC-NN в начале строки spec.md не повторяются.
Не проверяет: содержание документов, остальные файлы задач (result.md, log.md, материалы task/),
    вложенные папки задач, вторую строку plan.md (база ревизии).
Правило: doc/canon/process.md (цикл сессий методики) и формат машинных мест методики.

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

TASK_FILE = re.compile(r"^doc/tasks/[^/]+/(spec\.md|plan\.md|(?:spec-review|plan-review|review|delivery-review)-(\d+)\.md)$")
STATUS = re.compile(r"^Статус: (черновик|утверждено)")
REVIEW = re.compile(r"^Заход (\d+): существенных (\d+), поверхностных (\d+), проб (\d+)")
IDENT = re.compile(r"^(REQ|AC|DNC)-(\d+)\b")


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


def judge(source, args, rep):
    count = 0
    for entry in source.changed():
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
                          lost="нет ни одного spec.md, plan.md или файла проверки в doc/tasks/*/"))
