# -*- coding: utf-8 -*-
"""Страж запрещённых имён: образцы из списка вне репозитория не встречаются в файлах и их путях.

Зачем: имена приватных репозиториев и проектов владельца не должны попасть в публичную историю
    (ADR-0006); общий образец пути машины их не видит, поэтому список ведёт владелец вне репозитория.
Проверяет: все отслеживаемые файлы, кроме бинарных расширений (любое расширение, включая файлы без
    расширения и папки задач), и пути файлов; образец — подстрока без учёта регистра. Вердикт называет
    файл, строку и номер образца, но не сам образец (в CI значения списка к тому же маскируются).
Не проверяет: сообщения коммитов (guard-commit-message.py), пути машины и секреты
    (guard-secrets.py), содержимое бинарных файлов. Нет списка, он пуст или нечитаем — красный с
    подсказкой, а не пропуск.
Правило: AGENTS.md п.15, ADR-0006.

Источники списка: CREW_PRIVATE_NAMES (секрет в CI), файл CREW_PRIVATE_NAMES_FILE или
~/.config/crew-harness/private-names.txt. Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402
import names  # noqa: E402


def shown(path, patterns):
    """Путь для вывода: совпавшая часть заменена на звёздочки, иначе путь выдал бы образец."""
    out = path
    for pattern in patterns:
        out = re.sub(re.escape(pattern), "***", out, flags=re.I)
    return out if not names.find_names(out, patterns) else "<путь скрыт>"


def judge(source, args, rep):
    patterns = names.load_names()
    views, count = guardlib.judged_files(source)
    for entry in source.changed():
        for number in names.find_names(entry.path, patterns):
            rep.add(shown(entry.path, patterns), None, "forbidden-name",
                    "путь файла содержит образец №%d" % number)
    for view in views:
        label = shown(view.path, patterns)
        for lineno, line in enumerate(view.lines, 1):
            for number in names.find_names(line, patterns):
                rep.add(label, lineno, "forbidden-name", "образец №%d" % number)
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-private-names", "файлов", judge))
