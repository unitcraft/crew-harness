# -*- coding: utf-8 -*-
"""Страж ссылок и якорей в отслеживаемых .md: цель существует, лежит внутри репозитория, якорь есть.

Зачем: документы Канона и папок задач ссылаются друг на друга; перенос папки молча ломал ссылку, и
    читатель (человек или агент) попадал в пустоту. Эти ошибки не видны глазами в обзоре.
Проверяет: каждую относительную ссылку вида «](цель)» вне огороженных блоков кода и встроенного
    кода, в том числе в материалах задач. Цель — файл или папка из списка путей источника (рабочая
    копия, индекс или коммит; файл вне источника — нет файла); ссылка за корень репозитория —
    нарушение; якорь («#...» в том же файле или в другом .md) совпадает с якорем заголовка в том виде,
    как его строит GitHub (нижний регистр, дефисы вместо пробелов, без знаков препинания, суффиксы
    -1, -2 у повторов, кириллица сохраняется, заголовки setext, HTML-якоря id и name).
Не проверяет: внешние адреса (схема или //), ссылки-определения «[id]: цель» и HTML-теги a, якоря в
    файлах не-.md, существование страниц по внешним адресам.
Правило: AGENTS.md п.1 и decisions/README (ссылки между документами Канона) через ADR-0001.

Исключение — только пометка с причиной на строке ссылки: «guard-allow(md-link): <причина>» для
файла или папки, «guard-allow(md-anchor): <причина>» для якоря; причина печатается. Исключить файл или
папку целиком нельзя. Пометка без причины — красный.
"""
import sys

sys.dont_write_bytecode = True

import os
import posixpath
import re
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402

SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
CODE_SPAN = re.compile(r"(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)", re.S)
ATX = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
ATX_EMPTY = re.compile(r"^ {0,3}#{1,6}[ \t]*$")
SETEXT = re.compile(r"^ {0,3}(=+|-+)[ \t]*$")
HTML_ANCHOR = re.compile(r"""\b(?:id|name)\s*=\s*["']([^"']+)["']""", re.I)


def _blank(match):
    return re.sub(r"[^\n]", " ", match.group(0))


def strip_code(text):
    """Текст без огороженных блоков кода и встроенного кода; длина и переводы строк сохранены."""
    out = []
    fence = None
    for line in text.split("\n"):
        m = guardlib.FENCE.match(line)
        if fence is None:
            if m and not (m.group(2)[0] == "`" and "`" in m.group(3)):
                fence = (m.group(2)[0], len(m.group(2)))
                out.append(" " * len(line))
            else:
                out.append(line)
        else:
            out.append(" " * len(line))
            if m and m.group(2)[0] == fence[0] and len(m.group(2)) >= fence[1] and not m.group(3).strip():
                fence = None
    # встроенный код не выходит за абзац: непарный знак не гасит текст дальше пустой строки
    parts = re.split(r"(\n[ \t]*\n)", "\n".join(out))
    return "".join(part if i % 2 else CODE_SPAN.sub(_blank, part) for i, part in enumerate(parts))


def _read_destination(text, pos):
    """Цель ссылки после «](» с позиции pos: (цель, найдена ли закрывающая скобка)."""
    n = len(text)
    if pos < n and text[pos] == "<":
        end = text.find(">", pos)
        line_end = text.find("\n", pos)
        if end < 0 or (0 <= line_end < end):
            return None
        target = text[pos + 1:end]
        rest = end + 1
    else:
        depth = 0
        i = pos
        while i < n and text[i] not in " \t\n":
            if text[i] == "\\" and i + 1 < n:
                i += 2
                continue
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                if depth == 0:
                    break
                depth -= 1
            i += 1
        target = text[pos:i]
        rest = i
    # необязательный заголовок в кавычках, затем закрывающая скобка
    tail = re.match(r"""[ \t]*(?:"[^"\n]*"|'[^'\n]*')?[ \t]*\)""", text[rest:rest + 400])
    if not tail:
        return None
    return target


def extract_links(text):
    """Ссылки «](цель)» вне кода: список (номер строки, цель)."""
    clean = strip_code(text)
    found = []
    pos = 0
    while True:
        index = clean.find("](", pos)
        if index < 0:
            break
        target = _read_destination(clean, index + 2)
        if target is not None:
            found.append((clean.count("\n", 0, index) + 1, target))
        pos = index + 2
    return found


def github_slug(heading):
    """Якорь заголовка в том виде, в каком его строит GitHub (без суффикса повтора)."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)
    text = re.sub(r"<[^>]*>", "", text).strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def heading_anchors(text):
    """Множество якорей файла: заголовки ATX и setext, суффиксы повторов, HTML id и name."""
    anchors = set()
    counts = {}
    lines = guardlib.strip_fenced(text).split("\n")

    def add(heading):
        base = github_slug(heading)
        n = counts.get(base, 0)
        counts[base] = n + 1
        anchors.add(base if n == 0 else "%s-%d" % (base, n))

    skip = False
    for number, line in enumerate(lines):
        if skip:
            skip = False
            continue
        m = ATX.match(line)
        if m and not ATX_EMPTY.match(line):
            add(m.group(2))
            continue
        if line.strip() and number + 1 < len(lines) and SETEXT.match(lines[number + 1]) \
                and not re.match(r"^ {0,3}(#|>|[-*+] |\d+[.)] )", line):
            add(line.strip())
            skip = True
    for m in HTML_ANCHOR.finditer(strip_code(text)):
        anchors.add(m.group(1).lower())
    return anchors


class Checker(object):
    def __init__(self, source):
        self.source = source
        self.entries = dict((e.path, e) for e in source.entries())
        self.dirs = set()
        for path in self.entries:
            parts = path.split("/")
            for i in range(1, len(parts)):
                self.dirs.add("/".join(parts[:i]))
        self._anchors = {}

    def anchors_of(self, path):
        if path not in self._anchors:
            data = self.source.read(self.entries[path])
            text = data.decode("utf-8", "replace").lstrip("\ufeff") if data is not None else ""
            self._anchors[path] = heading_anchors(text)
        return self._anchors[path]

    def check_target(self, view, line, target, rep):
        """Проверка одной ссылки; возвращает False, если ссылка не судится (внешняя)."""
        raw = target.strip()
        if SCHEME.match(raw) or raw.startswith("//"):
            return False
        if raw == "":
            view.report(rep, "md-link", line, "пустая цель ссылки")
            return True
        base, _, frag = raw.partition("#")
        base = base.partition("?")[0]
        base = urllib.parse.unquote(base)
        frag = urllib.parse.unquote(frag)
        if base == "":
            dest = view.path
        else:
            if base.startswith("/"):
                joined = posixpath.normpath(base.lstrip("/"))
            else:
                joined = posixpath.normpath(posixpath.join(posixpath.dirname(view.path), base))
            if joined == ".." or joined.startswith("../") or posixpath.isabs(joined):
                view.report(rep, "md-link", line, "ссылка ведёт за корень репозитория")
                return True
            dest = "" if joined == "." else joined
            if dest in self.entries:
                pass
            elif dest == "" or dest in self.dirs:
                return True  # папка с путями источника; якорь у папки не проверяется
            else:
                view.report(rep, "md-link", line, "цель ссылки не найдена: %s" % dest)
                return True
        if frag and dest.lower().endswith(".md") and dest in self.entries:
            if frag.lower() not in self.anchors_of(dest):
                view.report(rep, "md-anchor", line, "якорь не найден: #%s" % frag)
        return True


def judge(source, args, rep):
    docs = [e for e in source.changed() if e.path.lower().endswith(".md") and e.mode != "160000"]
    if not docs:
        return guardlib.Outcome(count=0)
    checker = Checker(source)
    judged = 0
    for entry in docs:
        data = source.read(entry)
        if data is None:
            continue
        view = guardlib.FileView(entry.path, data)
        text = view.text.lstrip("\ufeff")
        for line, target in extract_links(text):
            if checker.check_target(view, line, target, rep):
                judged += 1
    if judged == 0:
        return guardlib.Outcome(nothing="нет относительных ссылок в .md")
    return guardlib.Outcome(count=judged)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-md-links", "ссылок", judge, lost="нет ни одного .md в репозитории"))
