# -*- coding: utf-8 -*-
"""Страж гигиены текста: управляющие байты, NUL, UTF-16, кракозябры, U+FFFD, BOM, смешанные концы строк.

Зачем: порча текста (кириллица, прочитанная не той кодировкой, потерянные байты, невидимые знаки)
    не видна глазами в обзоре, но ломает поиск, ссылки и сравнение; в публичной истории её не
    исправить, поэтому её ловят до коммита.
Проверяет: все отслеживаемые файлы, кроме расширений из списка бинарных (png, pdf, архивы, шрифты и
    т. п.); файл без расширения, с неизвестным расширением, журналы .log, .gitignore и
    .gitattributes судятся. Правила: control-char (байты 0x01-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F),
    nul (байт 0), utf16 (BOM UTF-16), mojibake (подпись «UTF-8, прочитанный как CP1251»), fffd
    (символ замены U+FFFD, он же след недопустимого UTF-8), bom (BOM UTF-8), eol (CRLF и голый LF в
    одном файле). Вид порчи — отдельное правило, красный по каждому.
Не проверяет: бинарные файлы по расширению (у них нет строки для пометки), смысл текста, табуляции
    и одиночные CR. Определению git «бинарный по содержимому» не доверяет: файл в UTF-16 или с
    NUL вне списка расширений красный.
Правило: ADR-0006 (чистый публичный репозиторий), AGENTS.md п.15; .gitattributes проекта не меняется.

Исключения только пометкой с причиной: на строке — «guard-allow(<правило>): <причина>» в любом
комментарии (правила: control-char, mojibake, fffd), для файла, где предмет проверки — сам байт, —
строка «guard-fixture(<правило>): <причина>» (nul, utf16, bom, eol и перечисленные). Пометка без
причины — красный; принятая печатает причину. Исключать папку или маску нельзя.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

# Подписи порчи собраны из кодов символов: литерал порчи сам был бы порчей.
CONTROL = re.compile("[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]")
MOJIBAKE = re.compile("[" + "".join(chr(c) for c in (0x402, 0x403, 0x452, 0x453, 0x45B, 0x45C, 0x459, 0x45A, 0x457, 0x455)) + "]|" + chr(0x201A) + "[" + chr(0x400) + "-" + chr(0x4FF) + "]")
FFFD = chr(0xFFFD)


def check_control(view, rep):
    for number, line in enumerate(view.lines, 1):
        if CONTROL.search(line):
            view.report(rep, "control-char", number, "управляющий байт (не TAB, LF, CR)")


def check_nul_utf16(view, rep):
    """Возвращает True, если файл в UTF-16: остальные правила к нему не применяются."""
    if view.data.startswith((b"\xff\xfe", b"\xfe\xff")):
        view.report(rep, "utf16", 1, "файл в UTF-16 (BOM)")
        return True
    index = view.data.find(b"\x00")
    if index >= 0:
        number = view.data.count(b"\n", 0, index) + 1
        view.report(rep, "nul", number, "байт NUL в текстовом файле")
    return False


def check_mojibake(view, rep):
    for number, line in enumerate(view.lines, 1):
        if MOJIBAKE.search(line):
            view.report(rep, "mojibake", number, "подпись кракозябр (UTF-8, прочитанный как CP1251)")


def check_fffd(view, rep):
    for number, line in enumerate(view.lines, 1):
        if FFFD in line:
            view.report(rep, "fffd", number, "символ замены U+FFFD или недопустимый UTF-8")


def check_bom(view, rep):
    if view.data.startswith(b"\xef\xbb\xbf"):
        view.report(rep, "bom", 1, "BOM UTF-8 в начале файла")


def check_eol(view, rep):
    # последняя строка без перевода строки не имеет стиля концов; у остальных стиль CRLF или LF
    terminated = view.lines[:-1]
    if not terminated:
        return
    first_crlf = terminated[0].endswith("\r")
    for number, line in enumerate(terminated, 1):
        if line.endswith("\r") != first_crlf:
            view.report(rep, "eol", number, "в одном файле CRLF и голый LF")
            return


def judge(source, args, rep):
    views, count = guardlib.judged_files(source)
    for view in views:
        if check_nul_utf16(view, rep):
            continue
        check_bom(view, rep)
        check_control(view, rep)
        check_mojibake(view, rep)
        check_fffd(view, rep)
        check_eol(view, rep)
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-text-hygiene", "файлов", judge))
