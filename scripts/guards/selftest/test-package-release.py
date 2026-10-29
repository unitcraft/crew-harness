# -*- coding: utf-8 -*-
"""Самотест сборщика релизного комплекта scripts/package-release.sh.

Зачем: комплект — то, что владелец запускает; сборщик, который забыл файл машины, положил тесты,
    чат или чужие машины или не позвал стража, выдаёт комплект, который не стартует или несёт лишнее.
Проверяет: зелёные — из дерева с программами в target/ собирается комплект: две программы,
    machines/product с dialog.alula.json, dialog.alula.md, journal.md и libs/, без tests/ и chat.*,
    страж комплекта зелёный; красные — нет target/crew-hub.exe; папка комплекта не пуста; машины
    дерева несогласованы (страж красный); без папки комплекта — отказ с кодом 2.
Не проверяет: сборку программ nova build (флаг --build), сам страж (его самотест test-check-release-kit.py).
Правило: задача 248.

Фикстуры собираются при прогоне.
"""
import sys

sys.dont_write_bytecode = True

import hashlib
import json
import os

import stlib

SCRIPT = os.path.join(stlib.SCRIPTS, "package-release.sh")
LOCK = '[[package]]\nname = "alula"\nsource = "git"\nversion = "0.27.0"\n'
LIB = "# Библиотека: Отмена\n\n- library: call_cancel\n- alula_version: 0.27\n\n## Общие события\n"


def dhash(text):
    lines = [line.rstrip(" \t") for line in text.split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return hashlib.sha256(("\n".join(lines) + "\n").encode("utf-8")).hexdigest()[:12]


def tree_files(lib_hash=None, hub=True):
    tree = {"kind": "machine", "alula_version": "0.27",
            "includes": [{"hash": lib_hash or dhash(LIB), "file": "libs/call_cancel.alula.md"}]}
    files = {"nova.lock.toml": LOCK,
             "machines/product/dialog.alula.json": json.dumps(tree),
             "machines/product/dialog.alula.md": "# Машина: Диалог\n\n- alula_version: 0.27\n",
             "machines/product/chat.alula.json": json.dumps({"alula_version": "0.27"}),
             "machines/product/chat.alula.md": "# Машина: Чат\n\n- alula_version: 0.27\n",
             "machines/product/journal.md": "# Журнал\n",
             "machines/product/libs/call_cancel.alula.md": LIB,
             "machines/product/tests/dialog-x.alula.test.json": "{}\n",
             "machines/other/agent_step.alula.json": "{}\n",
             "target/crew-harness.exe": "MZ"}
    if hub:
        files["target/crew-hub.exe"] = "MZ"
    return files


def main():
    pr = stlib.Probes("package-release")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def package(repo, *args):
        return stlib.run(("sh", SCRIPT) + args, cwd=repo, env=env)

    def kit_path():
        counter[0] += 1
        return os.path.join(base, "kit%d" % counter[0])

    def legit():
        kit = kit_path()
        proc = package(fresh(tree_files()), kit)
        assert proc.returncode == 0, proc.out + proc.err
        listed = sorted(os.path.relpath(os.path.join(b, n), kit).replace("\\", "/")
                        for b, _, names in os.walk(kit) for n in names)
        assert listed == ["crew-harness.exe", "crew-hub.exe", "machines/product/dialog.alula.json",
                          "machines/product/dialog.alula.md", "machines/product/journal.md",
                          "machines/product/libs/call_cancel.alula.md"], listed
        assert stlib.has_line(proc, "ок: осмотрено"), proc.out

    def no_hub():
        proc = package(fresh(tree_files(hub=False)), kit_path())
        assert proc.returncode == 1 and stlib.has_line(proc, "нет target/crew-hub.exe"), proc.out

    def not_empty():
        kit = kit_path()
        stlib.write_files(kit, {"old.txt": "x"})
        proc = package(fresh(tree_files()), kit)
        assert proc.returncode == 1 and stlib.has_line(proc, "не пуста"), proc.out

    def broken_hash():
        proc = package(fresh(tree_files(lib_hash="000000000000")), kit_path())
        assert proc.returncode == 1 and stlib.has_line(proc, "library-hash") and stlib.has_line(proc, "страж комплекта красный"), proc.out

    def no_kit():
        proc = package(fresh(tree_files()))
        assert proc.returncode == 2, proc.out

    pr.probe("законное", "комплект: две программы и машины диалога, без tests/, чата и чужих машин", legit)
    pr.probe("красная", "нет target/crew-hub.exe", no_hub)
    pr.probe("красная", "папка комплекта не пуста", not_empty)
    pr.probe("красная", "хеш подключения не равен хешу библиотеки — страж красный", broken_hash)
    pr.probe("мишень", "папка комплекта не названа — отказ", no_kit)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
