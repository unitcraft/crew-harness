# -*- coding: utf-8 -*-
"""Самотест стража рукописных таблиц статусов check-no-status-table.py.

Зачем: таблица «задача — статус», набранная руками, расходится с правдой; страж, который краснит
    реестр ADR или таблицу частей в README корня, будут обходить, а тот, что пропускает настоящую
    таблицу, бесполезен.
Проверяет: красные — строка таблицы с колонкой «Статус»/«Status»/«State» и ссылкой на папку задачи в
    первой ячейке (одна строка достаточна, любой статус словом или фразой, ссылка относительно
    файла); зелёные — реестр ADR (ссылки на файлы решений), таблица частей корня (первая ячейка —
    папка части, ссылка на задачу в колонке State), таблица без колонки состояния, таблица в блоке
    кода, список задач без таблицы.
Не проверяет: списки задач (их убирает правка README задач), содержимое ячеек статуса.
Правило: doc/canon/process.md (список задач — папки, руками не ведётся); AC-15 задачи.

Фикстура таблицы собирается при прогоне.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

TICK3 = "`" * 3
SEP = "|---|---|\n"


def main():
    pr = stlib.Probes("check-no-status-table")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-no-status-table.py", repo, env, *args)

    folder = {"doc/tasks/001-x/spec.md": "x\n", "doc/tasks/README.md": "x\n"}

    def red(readme, where, path="doc/tasks/README.md"):
        def fn():
            files = dict(folder)
            files[path] = readme
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-no-status-table: 1 нарушений")
            assert stlib.has_line(proc, "FAIL %s:%s: status-table:" % (path, where)), proc.out
        return fn

    def green(readme, files=None, path="doc/tasks/README.md"):
        def fn():
            f = dict(folder)
            f.update(files or {})
            f[path] = readme
            stlib.expect(check(fresh(f)), 0, "ок: осмотрено")
        return fn

    def legit_adr_registry():
        files = {"doc/canon/decisions/README.md": "| № | Решение | Статус |\n|---|---|---|\n"
                 "| [0001](ADR-0001-x.md) | Работа по методике | принято 2026-10-07 |\n",
                 "doc/canon/decisions/ADR-0001-x.md": "x\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено")

    def legit_parts_table():
        text = ("| Папка | Что | State |\n|---|---|---|\n"
                "| `service/` | сервис ([задача](doc/tasks/001-x/)) | planned |\n"
                "| [opencode-plugin/](opencode-plugin/) | плагин | in use |\n")
        stlib.expect(check(fresh({"README.md": text, "doc/tasks/001-x/spec.md": "x\n", "opencode-plugin/a.txt": "x\n"})), 0, "ок: осмотрено")

    pr.probe("законное", "реестр ADR: ссылки на файлы решений", legit_adr_registry)
    pr.probe("законное", "таблица частей корня: задача в колонке State, не в первой ячейке", legit_parts_table)
    pr.probe("законное", "таблица со ссылками на папки задач, но без колонки состояния",
             green("| Задача | Кто |\n" + SEP + "| [001](001-x/) | владелец |\n"))
    pr.probe("законное", "таблица в огороженном блоке кода",
             green("пример:\n" + TICK3 + "\n| Задача | Статус |\n" + SEP + "| [001](001-x/) | идёт |\n" + TICK3 + "\n"))
    pr.probe("законное", "список задач без таблицы этот страж не судит", green("- [001](001-x/) — идёт\n"))
    pr.probe("красная", "колонка «Статус», слово статуса",
             red("# Задачи\n\n| Задача | Статус |\n" + SEP + "| [001 — x](001-x/) | РАЗБОР |\n", "5"))
    pr.probe("красная", "статус фразой с запятыми",
             red("| Задача | Статус |\n" + SEP + "| [001](001-x/) | РАЗБОР: С1 сделана, идёт С2 |\n", "3"))
    pr.probe("красная", "заголовок Status", red("| Task | Status |\n" + SEP + "| [001](001-x) | open |\n", "3"))
    pr.probe("красная", "заголовок State и жирный шрифт", red("| Task | **State** |\n" + SEP + "| [001](001-x/) | open |\n", "3"))
    pr.probe("красная", "одна строка среди нескольких законных",
             red("| Что | Статус |\n" + SEP + "| [ADR](../canon/README.md) | ок |\n| [001](001-x/) | идёт |\n", "4"))
    pr.probe("иной-синтаксис", "ссылка от другого файла: ../tasks/001-x/",
             red("| Задача | Статус |\n" + SEP + "| [001](../tasks/001-x/) | идёт |\n", "3", path="doc/canon/list.md"))
    pr.probe("иной-синтаксис", "ссылка на папку от корня: doc/tasks/001-x",
             red("| Задача | Статус |\n" + SEP + "| [001](doc/tasks/001-x) | идёт |\n", "3", path="README.md"))
    pr.probe("мишень", "нет ни одного .md — мишень потеряна",
             lambda: stlib.expect(check(fresh({"a.txt": "x\n"})), 1, "FAIL: мишень потеряна"))
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
