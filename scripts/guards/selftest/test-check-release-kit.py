# -*- coding: utf-8 -*-
"""Самотест стража машин продукта и релизного комплекта check-release-kit.py.

Зачем: хаб читает машины продукта с диска и при расхождении не стартует; страж, который пропускает
    чужую версию языка или библиотеку другой сборки, выпустит неработающий комплект, а страж,
    который краснит согласованные машины, будут обходить.
Проверяет: зелёные — согласованные machines/product дерева (tests/ не судятся), комплект из программ
    и машин диалога; красные — alula_version дерева, таблицы и библиотеки не та, что у пакета в
    nova.lock.toml; хеш подключения не равен definitions_hash библиотеки (в дереве и в таблице);
    подключённой библиотеки нет; в комплекте нет программы или файла машин, есть tests/, чат или
    чужая папка машин; мишень — нет machines/product.
Не проверяет: сборку программ (это scripts/package-release.sh и его самотест).
Правило: задача 248.

Фикстуры собираются при прогоне.
"""
import sys

sys.dont_write_bytecode = True

import hashlib
import json
import os

import stlib

LOCK = '[[package]]\nname = "alula"\nsource = "git"\nversion = "0.28.0"\n'
LIB = "# Библиотека: Отмена\n\n- library: call_cancel\n- alula_version: 0.28\n\n## Общие события\n\n| Событие | Куда |\n|---|---|\n"


def dhash(text):
    lines = [line.rstrip(" \t") for line in text.replace("\r\n", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return hashlib.sha256(("\n".join(lines) + "\n").encode("utf-8")).hexdigest()[:12]


def machines(lib=LIB, tree_version="0.28", table_version="0.28", tree_hash=None, table_hash=None, with_lib=True):
    tree = {"kind": "machine", "alula_version": tree_version, "machine": "DialogSession",
            "includes": [{"name": "call_cancel", "hash": tree_hash or dhash(LIB), "file": "libs/call_cancel.alula.md"}]}
    table = ("# Машина: Диалог\n\n- machine: DialogSession\n- revision: 1\n- alula_version: %s\n\n## Подключения\n\n"
             "- Файл: libs/call_cancel.alula.md\n- Хеш: %s\n" % (table_version, table_hash or dhash(LIB)))
    files = {"machines/product/dialog.alula.json": json.dumps(tree, ensure_ascii=False),
             "machines/product/dialog.alula.md": table,
             "machines/product/journal.md": "# Журнал продукта\n",
             "machines/product/tests/dialog-x.alula.test.json": "{}\n"}
    if with_lib:
        files["machines/product/libs/call_cancel.alula.md"] = lib
    return files


def main():
    pr = stlib.Probes("check-release-kit")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        f = {"nova.lock.toml": LOCK}
        f.update(files)
        return stlib.make_repo(base, env, f, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-release-kit.py", repo, env, *args)

    def kit(files):
        counter[0] += 1
        path = os.path.join(base, "kit%d" % counter[0])
        stlib.write_files(path, files)
        return path

    def kit_files(extra=None, drop=None):
        files = {"crew-harness.exe": b"MZ", "crew-hub.exe": b"MZ"}
        for k, v in machines().items():
            if "/tests/" not in k:
                files[k] = v
        files.update(extra or {})
        for k in drop or ():
            files.pop(k)
        return files

    def red_tree(files, rule):
        def fn():
            proc = check(fresh(files))
            assert proc.returncode == 1, proc.out
            assert stlib.has_line(proc, ": %s:" % rule), proc.out
        return fn

    def red_kit(files, rule):
        def fn():
            proc = check(fresh(machines()), "--kit", kit(files))
            assert proc.returncode == 1, proc.out
            assert stlib.has_line(proc, ": %s:" % rule), proc.out
        return fn

    pr.probe("законное", "согласованные машины дерева, tests/ не судятся",
             lambda: stlib.expect(check(fresh(machines())), 0, "ок: осмотрено 4"))
    pr.probe("законное", "комплект: программы и машины диалога",
             lambda: stlib.expect(check(fresh(machines()), "--kit", kit(kit_files())), 0, "ок: осмотрено"))
    pr.probe("красная", "дерево чужой версии языка", red_tree(machines(tree_version="0.26"), "alula-version"))
    pr.probe("красная", "таблица чужой версии языка", red_tree(machines(table_version="0.26"), "alula-version"))
    pr.probe("красная", "библиотека чужой версии языка",
             red_tree(machines(lib=LIB.replace("0.28", "0.26"), tree_hash=dhash(LIB.replace("0.28", "0.26")),
                               table_hash=dhash(LIB.replace("0.28", "0.26"))), "alula-version"))
    pr.probe("красная", "хеш подключения в дереве — не хеш библиотеки", red_tree(machines(tree_hash="000000000000"), "library-hash"))
    pr.probe("красная", "хеш подключения в таблице — не хеш библиотеки", red_tree(machines(table_hash="000000000000"), "library-hash"))
    pr.probe("красная", "библиотека изменена после сборки машины",
             red_tree(machines(lib=LIB + "Лишняя строка.\n"), "library-hash"))
    pr.probe("красная", "подключённой библиотеки нет", red_tree(machines(with_lib=False), "library-missing"))
    pr.probe("красная", "в комплекте нет crew-hub.exe", red_kit(kit_files(drop=["crew-hub.exe"]), "kit-program"))
    pr.probe("красная", "в комплекте нет journal.md", red_kit(kit_files(drop=["machines/product/journal.md"]), "kit-machine"))
    pr.probe("красная", "в комплекте tests/",
             red_kit(kit_files({"machines/product/tests/dialog-x.alula.test.json": "{}\n"}), "kit-extra"))
    pr.probe("красная", "в комплекте чат", red_kit(kit_files({"machines/product/chat.alula.json": "{}\n"}), "kit-extra"))
    pr.probe("красная", "в комплекте чужая папка машин",
             red_kit(kit_files({"machines/other/agent_step.alula.json": "{}\n"}), "kit-extra"))
    pr.probe("красная", "в комплекте битый хеш библиотеки",
             red_kit(kit_files({"machines/product/libs/call_cancel.alula.md": LIB + "Лишняя строка.\n"}), "library-hash"))
    pr.probe("иной-синтаксис", "концы строк CRLF и BOM не меняют хеш",
             lambda: stlib.expect(check(fresh(machines(lib="﻿" + LIB.replace("\n", "\r\n")))), 0, "ок: осмотрено"))
    pr.probe("мишень", "нет machines/product — мишень потеряна",
             lambda: stlib.expect(check(fresh({"a.txt": "x\n"})), 1, "FAIL: мишень потеряна"))
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
