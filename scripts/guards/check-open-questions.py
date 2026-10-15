# -*- coding: utf-8 -*-
"""Страж файла открытых вопросов проекта и пометок пунктов «Не сделано» в разборах; счёт просроченных.

Зачем: неблокирующие вопросы оседали в разделах «Не сделано» разборов задач и терялись (унификация
    номеров отложена в разборе 044 и всплыла, только когда владелец спросил сам); вопрос без срока и
    умолчания висит вечно, а просрочку без счёта никто не замечает.
Проверяет: doc/open-questions.md — пункты с заголовка «## #N <название>», N не повторяется
    (oq-number); у пункта строки «- Вопрос:», «- Адресат:», «- Решение по умолчанию:», «- Срок:
    ГГГГ-ММ-ДД», «- Источник: … ГГГГ-ММ-ДД» (oq-field); закрытие — «- закрыто: <ссылка на норму или
    слово владельца>, ГГГГ-ММ-ДД» (oq-close); продление — «- продлено: до ГГГГ-ММ-ДД», не больше двух,
    второе — с «причина: …» (oq-extend); истёкший срок — «- применено умолчание: <…> (ГГГГ-ММ-ДД)».
    В analysis.md задач, начатых не раньше OQ_SINCE (первая дата в log.md папки), в разделах «Не
    сделано», «Что не проверено», «Что осталось» — у каждого пункта (строка без отступа, с
    продолжениями) ровно одна пометка: «→ open-questions #N», «→ задача NNN» или «не нужно, потому
    что …» (oq-mark); номер N есть в файле (oq-ref).
    С --overdue [--today ГГГГ-ММ-ДД] печатает «просрочено: N» и по строке на просроченный пункт
    (открыт, последний срок раньше сегодня) — это число оркестратор пишет в запрос «пушь» и его же
    показывает crew_doctor (зовёт этот скрипт; второго счётчика нет).
Не проверяет: разборы, начатые до OQ_SINCE (их хвосты перенесены задачей 060 руками), правдивость
    закрытий и разумность умолчаний (приёмка и владелец), просрочку как нарушение (просрочка — повод
    спросить владельца, а не красный коммит).
Правило: doc/canon/process.md, «Открытые вопросы»; методика unitcraft/ai-dev-methodology,
    doc/open-questions.md и разделы 8 и 10 methodology.md; задача 060.

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import datetime
import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

# Дата введения: разборы задач, начатых с этого дня, обязаны ставить пометки.
OQ_SINCE = "2026-10-16"
OQ_FILE = "doc/open-questions.md"
MAX_EXTEND = 2

DATE = r"\d{4}-\d{2}-\d{2}"
ITEM_HEAD = re.compile(r"^##\s+#(\d+)\s+(.*\S)\s*$")
FIELD = re.compile(r"^-\s+([^:]+?):\s*(.*)$")
FIELDS = ("Вопрос", "Адресат", "Решение по умолчанию", "Срок", "Источник")
ANALYSIS = re.compile(r"^(doc/tasks/[^/]+)/analysis\.md$")
LOG_DATE = re.compile(r"(" + DATE + r")")
HEADING = re.compile(r"^#{1,6}\s+(.*)$")
UNDONE = re.compile(r"не сделано|не проверено|осталось", re.I)
MARK = re.compile(r"→\s*open-questions\s+#(\d+)|→\s*задача\s+\d{3}|не нужно, потому что")


class _FieldSlot(object):
    """Поле пункта как ячейка списка: продолжение строки дописывается к значению."""

    def __init__(self, fields, key):
        self.fields = fields
        self.key = key

    def __getitem__(self, _):
        return self.fields[self.key]

    def __setitem__(self, _, value):
        self.fields[self.key] = value


def parse_oq(text):
    """Пункты файла: список словарей (номер, название, строка, поля, закрытие, продления, умолчание)."""
    items = []
    cur = None
    for number, line in enumerate(guardlib.strip_fenced(text).split("\n"), 1):
        m = ITEM_HEAD.match(line)
        if m:
            cur = {"n": int(m.group(1)), "title": m.group(2), "line": number, "fields": {},
                   "close": [], "extend": [], "applied": []}
            items.append(cur)
            continue
        if line.startswith("#"):
            cur = None
            last = None
            continue
        if cur is None:
            continue
        if line[:1] in (" ", "\t") and line.strip() and last is not None:
            bucket, idx = last
            n0, v0 = bucket[idx]
            bucket[idx] = (n0, v0 + " " + line.strip())
            continue
        f = FIELD.match(line)
        last = None
        if not f:
            continue
        key, value = f.group(1).strip(), f.group(2).strip()
        low = key.lower()
        lists = {"закрыто": "close", "продлено": "extend", "применено умолчание": "applied"}
        if low in lists:
            bucket = cur[lists[low]]
            bucket.append((number, value))
            last = (bucket, len(bucket) - 1)
        elif key in FIELDS and key not in cur["fields"]:
            cur["fields"][key] = (number, value)
            last = (_FieldSlot(cur["fields"], key), 0)
    return items


def deadline(item):
    """Последний срок пункта: дата последнего продления или поле «Срок»."""
    for _, value in reversed(item["extend"]):
        m = re.match(r"^до\s+(" + DATE + r")", value)
        if m:
            return m.group(1)
    srok = item["fields"].get("Срок")
    if srok and re.match(r"^" + DATE + r"$", srok[1]):
        return srok[1]
    return None


def is_open(item):
    return not item["close"] and not item["applied"]


def check_oq(path, text, rep):
    items = parse_oq(text)
    seen = {}
    for it in items:
        where = it["line"]
        if it["n"] in seen:
            rep.add(path, where, "oq-number", "номер #%d уже был в строке %d" % (it["n"], seen[it["n"]]))
        seen.setdefault(it["n"], where)
        for key in FIELDS:
            if key not in it["fields"]:
                rep.add(path, where, "oq-field", "у #%d нет строки «- %s: …»" % (it["n"], key))
        srok = it["fields"].get("Срок")
        if srok and not re.match(r"^" + DATE + r"$", srok[1]):
            rep.add(path, srok[0], "oq-field", "срок — календарной датой ГГГГ-ММ-ДД, а не «%s»" % srok[1])
        src = it["fields"].get("Источник")
        if src and not re.search(DATE, src[1]):
            rep.add(path, src[0], "oq-field", "в источнике нет даты ГГГГ-ММ-ДД")
        for number, value in it["close"]:
            if not re.search(r",\s*" + DATE + r"\s*$", value):
                rep.add(path, number, "oq-close",
                        "закрытие — «- закрыто: <ссылка на норму или слово владельца>, ГГГГ-ММ-ДД»")
        for number, value in it["applied"]:
            if not re.search(r"\(\s*" + DATE + r"\s*\)\s*$", value):
                rep.add(path, number, "oq-close", "умолчание — «- применено умолчание: <что> (ГГГГ-ММ-ДД)»")
        for i, (number, value) in enumerate(it["extend"]):
            if not re.match(r"^до\s+" + DATE + r"\b", value):
                rep.add(path, number, "oq-extend", "продление — «- продлено: до ГГГГ-ММ-ДД[, причина: …]»")
            if i == 1 and "причина:" not in value:
                rep.add(path, number, "oq-extend", "второе продление — с причиной: «…, причина: <почему>»")
            if i >= MAX_EXTEND:
                rep.add(path, number, "oq-extend", "больше %d продлений: решить, закрыть или применить умолчание"
                        % MAX_EXTEND)
    return items


def task_started(source, by_path, folder):
    """Первая дата в log.md папки задачи; нет даты — None (такой разбор судится)."""
    entry = by_path.get(folder + "/log.md")
    data = source.read(entry) if entry is not None else None
    if data is None:
        return None
    m = LOG_DATE.search(data.decode("utf-8", "replace"))
    return m.group(1) if m else None


def undone_items(text):
    """Пункты разделов «Не сделано»: список (строка, текст пункта с продолжениями)."""
    items = []
    inside = False
    cur = None
    for number, line in enumerate(guardlib.strip_fenced(text).split("\n"), 1):
        h = HEADING.match(line)
        if h:
            inside = bool(UNDONE.search(h.group(1)))
            cur = None
            continue
        if not inside or not line.strip():
            continue
        if line[0] in " \t" and cur is not None:
            cur[1] += " " + line.strip()
            continue
        cur = [number, line.strip()]
        items.append(cur)
    return items


def check_analysis(path, text, numbers, have_file, rep):
    for number, body in undone_items(text):
        marks = list(MARK.finditer(body))
        if len(marks) != 1:
            rep.add(path, number, "oq-mark",
                    "%s: у пункта «Не сделано» ровно одна пометка — «→ open-questions #N», «→ задача NNN» "
                    "или «не нужно, потому что …»" % ("нет пометки" if not marks else "пометок %d" % len(marks)))
            continue
        ref = marks[0].group(1)
        if ref is not None:
            if not have_file:
                rep.add(path, number, "oq-ref", "ссылка на #%s, а файла %s нет" % (ref, OQ_FILE))
            elif int(ref) not in numbers:
                rep.add(path, number, "oq-ref", "в %s нет пункта #%s" % (OQ_FILE, ref))


def overdue_list(items, today):
    return [it for it in items if is_open(it) and deadline(it) and deadline(it) < today]


def judge(source, args, rep):
    by_path = dict((e.path, e) for e in source.entries())
    count = 0
    items = []
    have_file = OQ_FILE in by_path
    if have_file:
        data = source.read(by_path[OQ_FILE])
        if data is not None:
            text = data.decode("utf-8", "replace").lstrip("﻿")
            if any(e.path == OQ_FILE for e in source.changed()):
                items = check_oq(OQ_FILE, text, rep)
                count += 1
            else:
                items = parse_oq(text)
    numbers = set(it["n"] for it in items)
    for entry in source.changed():
        m = ANALYSIS.match(entry.path)
        if not m or entry.mode == "160000":
            continue
        started = task_started(source, by_path, m.group(1))
        if started is not None and started < OQ_SINCE:
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        check_analysis(entry.path, data.decode("utf-8", "replace"), numbers, have_file, rep)
    if count == 0:
        if not have_file and not any(p.startswith("doc/tasks/") for p in by_path):
            return guardlib.Outcome(count=0)
        return guardlib.Outcome(nothing="нет файла открытых вопросов и разборов задач с %s" % OQ_SINCE)
    return guardlib.Outcome(count=count)


def extra(parser):
    parser.add_argument("--overdue", action="store_true")
    parser.add_argument("--today")


def overdue_main(argv):
    """Счёт просроченных: «просрочено: N» первой строкой, затем список; код 0, ошибка — код 1."""
    guardlib.setup_io()
    args = guardlib.build_parser(extra, "check-open-questions").parse_args(argv)
    today = args.today or datetime.date.today().isoformat()
    try:
        root = guardlib.find_root(args.root)
    except guardlib.Unavailable as exc:
        print("FAIL: предпосылка: %s" % exc)
        return 1
    try:
        with open(os.path.join(root, *OQ_FILE.split("/")), "rb") as handle:
            text = handle.read().decode("utf-8", "replace").lstrip("﻿")
    except OSError:
        text = ""
    late = overdue_list(parse_oq(text), today)
    print("просрочено: %d" % len(late))
    for it in late:
        who = it["fields"].get("Адресат", (0, "?"))[1]
        print("#%d %s — срок %s, адресат: %s; решить / продлить до даты / закрыть" % (
            it["n"], it["title"], deadline(it), who))
    return 0


if __name__ == "__main__":
    if "--overdue" in sys.argv[1:]:
        sys.exit(overdue_main(sys.argv[1:]))
    sys.exit(guardlib.run("check-open-questions", "файлов (открытые вопросы и разборы)", judge, extra=extra,
                          lost="нет ни файла открытых вопросов, ни папки задач"))
