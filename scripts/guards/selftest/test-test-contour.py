# -*- coding: utf-8 -*-
"""Самотест scripts/test-contour.sh и scripts/test-contour.ps1 (задача 191).

Зачем: контур приёмки малого маршрута исполнитель поднимает на глазах у владельца; сломанный скрипт
    всплывёт в самый дорогой момент — при показе.
Проверяет: синтаксис sh принимает test-contour.sh (sh -n); оба скрипта держат опорные свойства контура —
    корень из расположения скрипта, свой data_dir во временной папке по хешу пути дерева, свободный порт
    с 8100, печать ссылки http://127.0.0.1 и подсказки метки crew_task contour, режим остановки, бинарники
    основной копии без флага сборки, страницы из src/web дерева; испорченная копия (без каталога данных
    или без ссылки) не проходит проверку свойств.
Не проверяет: живой подъём контура (нужны собранные бинарники основной копии; в задаче 191 проверен вживую,
    дальше — руками при изменении скриптов) и код самого пульта (его тесты — opencode-plugin).
Правило: AGENTS.md п.11 (рабочую копию main не трогаем) и п.14; задача 191.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

ROOT = os.path.normpath(os.path.join(stlib.HERE, "..", "..", ".."))

SH_TOKENS = ("crew-contour-", "8100", "http://127.0.0.1:", "--stop", "--build", "src/web",
             "contour.pid", 'crew_task {action: "contour"', "git rev-parse --git-common-dir")
PS_TOKENS = ("crew-contour-", "8100", "http://127.0.0.1:", "-Stop", "-Build", "src/web",
             "contour.pid", 'crew_task {action: `"contour`"', "git rev-parse --git-common-dir")


def faults(text, tokens):
    return [t for t in tokens if t not in text]


def main():
    pr = stlib.Probes("test-contour")
    with open(os.path.join(ROOT, "scripts", "test-contour.sh"), encoding="utf-8") as handle:
        sh_text = handle.read()
    with open(os.path.join(ROOT, "scripts", "test-contour.ps1"), encoding="utf-8-sig") as handle:
        ps_text = handle.read()

    def sh_syntax():
        proc = stlib.run(("sh", "-n", os.path.join("scripts", "test-contour.sh")), cwd=ROOT)
        assert proc.returncode == 0, proc.out + proc.err

    def props():
        assert not faults(sh_text, SH_TOKENS), "sh: " + ", ".join(faults(sh_text, SH_TOKENS))
        assert not faults(ps_text, PS_TOKENS), "ps1: " + ", ".join(faults(ps_text, PS_TOKENS))

    def red_no_data_dir():
        bad = sh_text.replace("crew-contour-", "crew-")
        assert faults(bad, SH_TOKENS), "копия sh без своего каталога данных по хешу дерева прошла проверку"

    def red_no_link():
        bad = ps_text.replace("http://127.0.0.1:", "http://")
        assert faults(bad, PS_TOKENS), "копия ps1 без печати ссылки прошла проверку"

    pr.probe("законное", "sh -n принимает test-contour.sh", sh_syntax)
    pr.probe("законное", "оба скрипта держат опорные свойства контура (data_dir по хешу дерева, порт 8100+, "
             "ссылка, стоп, бинарники основной копии, src/web дерева, метка contour)", props)
    pr.probe("красная", "копия sh без своего каталога данных — проверка свойств красная", red_no_data_dir)
    pr.probe("красная", "копия ps1 без печати ссылки — проверка свойств красная", red_no_link)
    sys.exit(pr.done())


if __name__ == "__main__":
    main()
