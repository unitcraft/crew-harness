# -*- coding: utf-8 -*-
"""Список запрещённых имён: чтение из файла вне репозитория или из секрета, поиск образцов.

Зачем: имена приватных репозиториев и проектов нельзя хранить в публичном репозитории ни в каком
    виде (ADR-0006); поэтому список лежит у владельца в файле, а в CI приходит секретом. Здесь он
    читается одинаково с концами строк LF и CRLF и с BOM, а его отсутствие — красный, не тишина.
Проверяет: наличие, читаемость и непустоту списка; ищет образцы подстрокой без учёта регистра.
Не проверяет: сами файлы репозитория (это check-private-names.py и guard-commit-message.py).
Правило: AGENTS.md п.15, ADR-0006.

Источники по приоритету: переменная окружения CREW_PRIVATE_NAMES (в CI — из секрета с тем же
именем), затем файл CREW_PRIVATE_NAMES_FILE, затем ~/.config/crew-harness/private-names.txt.
Формат: образец на строку, строка с решёткой первым знаком — комментарий, пустые строки пропускаются.
Номер образца — порядковый среди образцов (без комментариев и пустых строк), с единицы.
Значения образцов не попадают ни в вывод, ни в тексты исключений.
"""
import sys

sys.dont_write_bytecode = True

import os

from guardlib import Unavailable

DEFAULT_FILE = os.path.join("~", ".config", "crew-harness", "private-names.txt")
HINT = ("Заведите список: файл ~/.config/crew-harness/private-names.txt (путь переопределяет "
        "CREW_PRIVATE_NAMES_FILE), образец на строку, решётка — комментарий; в CI — секрет "
        "CREW_PRIVATE_NAMES (его заводит scripts/github-setup.sh secret).")


def parse(text):
    """Образцы из текста списка; регистр свёрнут, CRLF и LF одинаковы."""
    patterns = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line.casefold())
    return patterns


def _decode(data):
    if data.startswith((b"\xff\xfe", b"\xfe\xff")) or b"\x00" in data:
        raise Unavailable("список запрещённых имён сохранён в UTF-16 или с нулевыми байтами; "
                          "сохраните его как UTF-8. " + HINT)
    return data.decode("utf-8-sig", "replace")


def load_names():
    """Образцы списка запрещённых имён или Unavailable с подсказкой, как завести недостающее."""
    env = os.environ.get("CREW_PRIVATE_NAMES")
    env_empty = False
    if env is not None:
        patterns = parse(env.lstrip("\ufeff"))
        if patterns:
            return patterns
        env_empty = True
    path = os.environ.get("CREW_PRIVATE_NAMES_FILE") or os.path.expanduser(DEFAULT_FILE)
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError:
        if env_empty:
            raise Unavailable("секрет или переменная CREW_PRIVATE_NAMES пусты. " + HINT)
        raise Unavailable("нет списка запрещённых имён (файл не найден или не читается). " + HINT)
    patterns = parse(_decode(data))
    if not patterns:
        raise Unavailable("список запрещённых имён пуст. " + HINT)
    return patterns


def find_names(text, patterns):
    """Номера (с единицы) образцов, которые встречаются в тексте подстрокой без учёта регистра."""
    folded = text.casefold()
    return [number for number, pattern in enumerate(patterns, 1) if pattern in folded]
