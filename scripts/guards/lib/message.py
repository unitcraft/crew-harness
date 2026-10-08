# -*- coding: utf-8 -*-
"""Что git сохранит в историю из файла сообщения коммита: определение для стража сообщения.

Зачем: хук commit-msg получает файл с шаблоном, комментариями и, при режиме с diff, всем diff
    индекса; судить файл целиком значило бы краснить то, что git выбросит (diff с кириллицей), и
    пропускать то, что он оставит (строки с решёткой при -m и -F).
Проверяет: ничего сам не проверяет; effective_message возвращает строки сообщения с их номерами в
    исходном файле после той обработки, которую выполнит git в данном режиме.
Не проверяет: сами правила сообщения (guard-commit-message.py), core.commentChar со значением auto
    и многосимвольным (считается решётка), перевод служебной строки git (без переводов).
Правило: AGENTS.md п.4 (сообщения коммитов); REQ-14 задачи.

Режимы: «editor» — сообщение набрано в редакторе: git убирает строки-комментарии и хвост за
строкой-ножницами; «message» — коммит с -m или -F (редактор не запускался): сообщение как есть,
строки с решёткой остаются в истории, хвост за строкой-ножницами убирается только при включённом
режиме с diff (commit.verbose). Для готового коммита (pre-push, CI) сообщение берётся как сохранено,
эта функция не нужна.
"""
import sys

sys.dont_write_bytecode = True

SCISSORS = "# " + "-" * 24 + " >8 " + "-" * 24
SERVICE = "# Do not modify or remove the line above."


def effective_message(raw, mode, verbose=False, comment="#"):
    """Строки сообщения [(номер строки в файле, текст)] так, как их сохранит git."""
    lines = [(i, line.rstrip("\r")) for i, line in enumerate(raw.split("\n"), 1)]
    scissors = comment + SCISSORS[1:]
    service = comment + SERVICE[1:]
    cut = None
    for index, (_, line) in enumerate(lines):
        if line == scissors:
            following = lines[index + 1][1] if index + 1 < len(lines) else ""
            if mode == "editor" and following == service:
                cut = index
                break
            if mode == "message" and verbose:
                cut = index
                break
    if cut is not None:
        lines = lines[:cut]
    if mode == "editor":
        lines = [(n, line) for n, line in lines if not line.startswith(comment)]
    while lines and not lines[-1][1].strip():
        lines.pop()
    return lines
