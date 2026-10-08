# -*- coding: utf-8 -*-
"""Страж пустых тестов: файл теста плагина без единой проверки.

Зачем: тест без проверок всегда зелёный и создаёт ощущение покрытия; он появляется при копировании
    заготовки или незаконченной правке и не виден в обзоре.
Проверяет: каждый opencode-plugin/test/*.test.mjs содержит хотя бы одну проверку — вызов cell( или
    слово assert вне комментариев. Что внутри проверки (в том числе литерал true), не судится.
Не проверяет: качество проверок, покрытие кода, прочие .mjs в той же папке (например, служебная
    очистка), результат прогона тестов.
Правило: AGENTS.md п.7 и п.8 (тесты плагина и их прогон перед пушем).

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

TEST_FILE = re.compile(r"^opencode-plugin/test/[^/]+\.test\.mjs$")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"^[ \t]*//.*$", re.M)
CHECK = re.compile(r"\bcell\s*\(|\bassert\b")


def count_checks(text):
    """Число проверок в тексте теста: cell( и assert вне комментариев."""
    text = BLOCK_COMMENT.sub("", text)
    text = LINE_COMMENT.sub("", text)
    return len(CHECK.findall(text))


def judge(source, args, rep):
    count = 0
    for entry in source.changed():
        if not TEST_FILE.match(entry.path) or entry.mode == "160000":
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        if count_checks(data.decode("utf-8", "replace")) == 0:
            rep.add(entry.path, None, "empty-test", "в тесте нет ни одной проверки (cell( или assert)")
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-tests-have-checks", "файлов тестов", judge,
                          lost="нет ни одного opencode-plugin/test/*.test.mjs"))
