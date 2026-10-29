# -*- coding: utf-8 -*-
"""Страж машин продукта и релизного комплекта: машины, которые хаб читает с диска, согласованы.

Зачем: с задачи 248 машины продукта не вшиты в программы, хаб читает их из папки machines/product
    рядом с собой и при расхождении не стартует. Комплект с чужой версией языка, с библиотекой
    другой сборки или без файла ломает запуск у владельца; страж ловит это до выдачи комплекта,
    а в дереве — до коммита (комплект собирается из machines/product дерева).
Проверяет: в дереве (индексе, коммите) — файлы machines/product/ кроме tests/: alula_version каждого
    дерева *.alula.json, таблицы *.alula.md и библиотеки libs/ равна версии пакета alula из
    nova.lock.toml (0.27.0 -> 0.27); хеш каждого подключения библиотеки (includes дерева, строки
    «- Файл:»/«- Хеш:» таблицы) равен definitions_hash файла библиотеки (SHA-256 нормализованного
    текста, 12 букв); подключённая библиотека есть. С --kit <папка> — то же на папке комплекта и
    его состав: crew-harness.exe, crew-hub.exe, machines/product/ с dialog.alula.json,
    dialog.alula.md, journal.md и подключёнными библиотеками; лишнего нет (tests/, чата,
    других файлов).
Не проверяет: что программы комплекта собраны из этого дерева, смысл машин (это alula test и тесты
    src/product_machines).
Правило: задача 248 (машины продукта читаются с диска, релизный комплект); AGENTS.md п.14.

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import hashlib
import json
import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

PREFIX = "machines/product/"
KIT_PROGRAMS = ("crew-harness.exe", "crew-hub.exe")
KIT_MACHINES = ("dialog.alula.json", "dialog.alula.md", "journal.md")
LOCK_VERSION = re.compile(r'name\s*=\s*"alula"[^\[]*?\bversion\s*=\s*"(\d+)\.(\d+)', re.S)


def definitions_hash(text):
    """Хеш файла определений (раздел 8 языка): без BOM, LF, без пробелов в конце строк, один LF в конце."""
    if text.startswith("﻿"):
        text = text[1:]
    lines = [line.rstrip(" \t") for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return hashlib.sha256(("\n".join(lines) + "\n").encode("utf-8")).hexdigest()[:12]


def header_value(text, key):
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- %s:" % key):
            return stripped[len(key) + 3:].strip()
        if stripped.startswith("## "):
            return ""
    return ""


def table_includes(text):
    found = []
    current = None
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- Файл: "):
            current = stripped[len("- Файл: "):].strip()
        elif stripped.startswith("- Хеш: ") and current:
            found.append((current, stripped[len("- Хеш: "):].strip()))
            current = None
    return found


def lock_version(text):
    m = LOCK_VERSION.search(text)
    return "%s.%s" % (m.group(1), m.group(2)) if m else None


def judge_machines(files, version, rep, where):
    """files: имя внутри machines/product -> текст; where(имя) -> путь для отчёта."""
    for name in sorted(files):
        text = files[name]
        if name.endswith(".alula.json"):
            try:
                tree = json.loads(text)
            except ValueError:
                rep.add(where(name), None, "tree", "дерево — не JSON")
                continue
            got = tree.get("alula_version", "") if isinstance(tree, dict) else ""
            includes = [(i.get("file", ""), i.get("hash", "")) for i in (tree.get("includes") or [])
                        if isinstance(i, dict)] if isinstance(tree, dict) else []
        elif name.endswith(".alula.md"):
            got = header_value(text, "alula_version")
            includes = table_includes(text) if not name.startswith("libs/") else []
        else:
            continue
        if got != version:
            rep.add(where(name), None, "alula-version",
                    "alula_version %s, движок (пакет alula из nova.lock.toml) читает %s" % (got or "(нет)", version))
        for lib, want in includes:
            if lib not in files:
                rep.add(where(name), None, "library-missing", "подключённой библиотеки %s нет" % where(lib))
                continue
            have = definitions_hash(files[lib])
            if have != want:
                rep.add(where(lib), None, "library-hash",
                        "в подключении %s хеш %s, definitions_hash файла %s" % (where(name), want, have))


def judge_tree(source, args, rep):
    by_path = {}
    for entry in source.entries():
        by_path[entry.path] = entry
    lock = by_path.get("nova.lock.toml")
    version = lock_version((source.read(lock) or b"").decode("utf-8", "replace")) if lock else None
    files = {}
    for path, entry in by_path.items():
        if path.startswith(PREFIX) and not path.startswith(PREFIX + "tests/") and entry.mode != "160000":
            data = source.read(entry)
            if data is not None:
                files[path[len(PREFIX):]] = data.decode("utf-8", "replace")
    if not files:
        return guardlib.Outcome(count=0)
    if source.mode == "commit" and not any(e.path.startswith(PREFIX) or e.path == "nova.lock.toml" for e in source.changed()):
        return guardlib.Outcome(nothing="коммит не меняет machines/product и nova.lock.toml")
    if version is None:
        rep.add("nova.lock.toml", None, "lock", "нет версии пакета alula")
        return guardlib.Outcome(count=len(files))
    judge_machines(files, version, rep, lambda name: PREFIX + name)
    return guardlib.Outcome(count=len(files))


def judge_kit(kit, root, rep):
    lock = os.path.join(root, "nova.lock.toml")
    version = None
    if os.path.isfile(lock):
        with open(lock, encoding="utf-8") as f:
            version = lock_version(f.read())
    if version is None:
        rep.add("nova.lock.toml", None, "lock", "нет версии пакета alula в дереве, из которого собран комплект")
        return 0
    if not os.path.isdir(kit):
        rep.add(kit, None, "kit-missing", "папки комплекта нет")
        return 0

    def rel(path):
        return os.path.relpath(path, kit).replace("\\", "/")

    listed = []
    for base, dirs, names in os.walk(kit):
        dirs.sort()
        for name in sorted(names):
            listed.append(rel(os.path.join(base, name)))
    files = {}
    for path in listed:
        if path.startswith(PREFIX):
            with open(os.path.join(kit, path), encoding="utf-8", errors="replace", newline="") as f:
                files[path[len(PREFIX):]] = f.read()
    for program in KIT_PROGRAMS:
        full = os.path.join(kit, program)
        if not os.path.isfile(full) or os.path.getsize(full) == 0:
            rep.add("%s/%s" % (kit, program), None, "kit-program", "программы нет в комплекте")
    for name in KIT_MACHINES:
        if name not in files:
            rep.add("%s/%s%s" % (kit, PREFIX, name), None, "kit-machine", "файла машин нет в комплекте")
    needed = set(KIT_MACHINES)
    for name in ("dialog.alula.json", "dialog.alula.md"):
        text = files.get(name, "")
        if name.endswith(".json"):
            try:
                tree = json.loads(text) if text else {}
            except ValueError:
                tree = {}
            for inc in tree.get("includes") or [] if isinstance(tree, dict) else []:
                if isinstance(inc, dict):
                    needed.add(inc.get("file", ""))
        else:
            for lib, _ in table_includes(text):
                needed.add(lib)
    for path in listed:
        inside = path[len(PREFIX):] if path.startswith(PREFIX) else None
        if path in KIT_PROGRAMS or (inside is not None and inside in needed):
            continue
        rep.add("%s/%s" % (kit, path), None, "kit-extra",
                "лишний файл в комплекте: в нём только программы и machines/product без tests/ и чата")
    judge_machines(files, version, rep, lambda name: "%s/%s%s" % (kit, PREFIX, name))
    return len(listed)


def extra(parser):
    parser.add_argument("--kit", help="папка релизного комплекта (scripts/package-release.sh)")


def judge(source, args, rep):
    if args.kit:
        return guardlib.Outcome(count=judge_kit(args.kit, source.root, rep))
    return judge_tree(source, args, rep)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-release-kit", "файлов машин продукта", judge, extra=extra,
                          lost="нет machines/product: машин продукта в дереве нет"))
