# -*- coding: utf-8 -*-
"""Страж форматов документов задач: статус spec.md и plan.md, первая строка проверок, уникальные номера, журнал хода.

Зачем: программа цикла задач и сами сессии читают из этих файлов машинные места (статус, итог
    захода, номера требований, строки хода); молчаливо испорченная первая строка запускает проверку
    заново поверх утверждённого документа или теряет заход, а строка журнала не по форме пропадает
    из панели хода без шума.
Проверяет: в doc/tasks/*/ — первая строка spec.md и plan.md начинается с «Статус: черновик» или
    «Статус: утверждено»; первая строка spec-review-N.md, plan-review-N.md, review-N.md и
    delivery-review-N.md — «Заход N: существенных K, поверхностных M, проб P» с числами и N как в
    имени файла; номера REQ-NN, AC-NN, DNC-NN в начале строки spec.md не повторяются; progress.log —
    файл читается байтами и делится по LF (один CR в конце строки снимается), каждая непустая строка
    по форме «<код> <k>/<N> <подпись>» (journal-line, с адресом «файл:строка»), без пути машины
    (journal-path; определение одно со стражем секретов, lib/machine_paths.py) и, только в режиме
    индекса у добавленных строк журнала, который уже есть в HEAD, с подписью (без поля времени
    [ЧЧ:ММ] или [ГГГГ-ММ-ДД ЧЧ:ММ]) не длиннее 80 знаков (journal-long), а строка остановки «стоп:» — с видом
    из списка вопрос, план, ревизия, требования, ворота (journal-stop); log.md — только в режиме
    индекса, добавленные строки (у первой версии файла — все), которые начинаются с даты ГГГГ-ММ-ДД
    не раньше 2026-10-10: такая строка обязана быть «ГГГГ-ММ-ДД ЧЧ:ММ <вид>: <текст>», вид — из
    закрытого списка (решение владельца, заседание, ворота, документ, пуск, слияние, находка),
    иначе log-line; сообщения journal-line, journal-long, journal-stop и log-line называют правило, что именно не так,
    ожидаемую форму, пример верной строки и инструмент плагина (progress_line, log_line; задача 049); «результат и куда он попадает» (норма методики, methodology.md раздел 9 п. 8,
    промпты С1 и С3 task-sessions.md) — только у задач, заведённых не раньше 2026-10-15 14:20 (первая
    запись log.md папки с датой и временем): вторая строка spec.md и третья строка plan.md — дословно
    «Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он
    есть» (result-line); в spec.md есть заголовок «Результат и куда он попадает» вне огороженного кода, в
    его разделе — непустое содержание, а строка «нет: результат — код» (если есть) несёт фразу о том,
    что сдаётся (result-section); результат назван (строки «нет: результат — код» в разделе нет), а в
    папке уже есть result.md — в папке есть current.md (result-current).
Не проверяет: содержание документов, остальные файлы задач (result.md, profile.log, материалы
    task/), записи log.md без даты в начале строки, с датой раньше 2026-10-10 и вне индекса (в
    режимах дерева, коммита и CI добавленных строк нет), usage.log, вложенные папки задач, вторую строку plan.md (база ревизии); честность строки
    журнала («пишется по ходу» судится приёмкой); предел подписи в режимах дерева и коммита и CI
    (там нет добавленных строк), вид остановки там же и в прежних строках; порядок строк сессии (старт первой
    строкой, по строке на единицу, номер захода) — его проверяет инструмент progress_line при записи; k больше N и неверное поле времени (остаются подписью, как в панели);
    по норме о результате — задачи, заведённые раньше 2026-10-15 14:20, и папки без log.md с датой;
    current.md до появления result.md (его создаёт шаг плана в реализации); содержание current.md,
    метки копий, единственность действующего текста и честность строки «нет: результат — код» (это
    проверка С6, п. 5 методики); в режиме коммита — папки, где коммит не меняет spec.md или plan.md.
Правило: doc/canon/process.md (цикл сессий методики, «Журнал хода progress.log», «Результат и куда он
    попадает») и формат машинных мест методики.

Пометок-исключений у этого стража нет.
"""
import sys

sys.dont_write_bytecode = True

import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))

import guardlib  # noqa: E402
import machine_paths  # noqa: E402

TASK_FILE = re.compile(r"^doc/tasks/[^/]+/(spec\.md|plan\.md|(?:spec-review|plan-review|review|delivery-review)-(\d+)\.md)$")
STATUS = re.compile(r"^Статус: (черновик|утверждено)")
REVIEW = re.compile(r"^Заход (\d+): существенных (\d+), поверхностных (\d+), проб (\d+)")
IDENT = re.compile(r"^(REQ|AC|DNC)-(\d+)\b")
JOURNAL_FILE = re.compile(r"^doc/tasks/[^/]+/progress\.log$")
# строка журнала (Д-11): только ASCII-цифры, остаток — любые знаки кроме LF; в JavaScript тот же язык (progress.ts, LINE_RE)
JOURNAL_LINE = re.compile(r"^([^ \t]+) ([0-9]+)/([0-9]+) ([^\n]+)$")
# необязательное поле времени в начале подписи (REQ-04): `[ЧЧ:ММ]` или `[ГГГГ-ММ-ДД ЧЧ:ММ]` (по слову владельца, 2026-10-09);
# общий набор строк test/progress-vectors.json
JOURNAL_TIME = re.compile(r"^\[(?:[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]) )?(?:[01][0-9]|2[0-3]):[0-5][0-9]\] ")
# log.md задачи: новые записи — «ГГГГ-ММ-ДД ЧЧ:ММ <вид>: <текст>»; судятся добавленные строки с датой не раньше LOG_FROM
LOG_FILE = re.compile(r"^doc/tasks/[^/]+/log\.md$")
LOG_DATED = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2})(?![0-9])")
LOG_ENTRY = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} (решение владельца|заседание|ворота|документ|пуск|слияние|находка): ")
LOG_FROM = "2026-10-10"
LOG_KINDS = "решение владельца, заседание, ворота, документ, пуск, слияние, находка"
SIGNATURE_MAX = 80
STOP_KINDS = "вопрос, план, ревизия, требования, ворота"
STOP_KIND_LIST = ("вопрос", "план", "ревизия", "требования", "ворота")
STOP_WORD = re.compile(r"^стоп:[ \t]*([^ \t.,:;!—–-]*)")
# сообщения стража называют правило, ожидаемую форму и пример (задача 049: агенты не видели, что именно не так)
TOOL_HINT = "в окне OpenCode строку собирает инструмент %s"
JOURNAL_EXAMPLE = "«С2 3/34 [2026-10-15 16:20] spec.md прочитан целиком»"
LOG_EXAMPLE = "«2026-10-15 16:20 документ: spec.md передан на С2»"
LOG_TIME = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}(?![0-9])")
# «результат и куда он попадает» (слово владельца, 2026-10-15, чат оркестратора; задача 047): формы строк — дословно из
# промптов С1 и С3 методики (unitcraft/ai-dev-methodology @ 03d28d0); судятся задачи, заведённые не раньше RESULT_FROM
RESULT_FROM = "2026-10-15 14:20"
RESULT_LINE = "Документ задачи: после сдачи история; где действует результат — current.md в этой папке, если он есть"
RESULT_HEAD = re.compile(r"^#{1,6}[ \t]+Результат и куда он попадает[ \t]*$")
ANY_HEAD = re.compile(r"^#{1,6}[ \t]")
NO_RESULT_LINE = re.compile(r"^[ \t]*(?:[-*][ \t]+)?«?нет: результат — код»?(.*)$")
LOG_STARTED = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}) ")


def first_line(text):
    return text.lstrip("\ufeff").split("\n", 1)[0].rstrip("\r")


def check_status_line(path, text, rep):
    if not STATUS.match(first_line(text)):
        rep.add(path, 1, "task-status", "первая строка не «Статус: черновик» и не «Статус: утверждено»")


def check_review_line(path, number, text, rep):
    m = REVIEW.match(first_line(text))
    if not m:
        rep.add(path, 1, "review-line", "первая строка не «Заход N: существенных K, поверхностных M, проб P»")
    elif int(m.group(1)) != int(number):
        rep.add(path, 1, "review-line", "номер захода в строке не равен номеру в имени файла")


def check_unique_ids(path, text, rep):
    seen = {}
    for number, line in enumerate(text.split("\n"), 1):
        m = IDENT.match(line)
        if not m:
            continue
        key = (m.group(1), int(m.group(2)))
        if key in seen:
            rep.add(path, number, "dup-id", "повтор номера %s-%s (первое объявление в строке %d)" % (
                m.group(1), m.group(2), seen[key]))
        else:
            seen[key] = number


def split_journal(data):
    """Байты журнала → строки: UTF-8 с заменой, деление только по LF, один CR в конце снимается."""
    parts = data.decode("utf-8", "replace").split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return [p[:-1] if p.endswith("\r") else p for p in parts]


def parse_progress_line(line):
    """Строка по форме журнала → (код, k, N, подпись) или None."""
    m = JOURNAL_LINE.match(line)
    if not m or "\n" in line:
        return None
    return m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)


def signature_without_time(signature):
    m = JOURNAL_TIME.match(signature)
    return signature[m.end():] if m else signature


def check_progress_log(path, data, source, rep):
    lines = split_journal(data)
    for number, line in enumerate(lines, 1):
        if line == "":
            continue  # пустая строка форму не нарушает (на нынешних журналах их нет, Д-11 о ней молчит)
        if parse_progress_line(line) is None:
            rep.add(path, number, "journal-line", "строка не по форме «<код> <k>/<N> [ГГГГ-ММ-ДД ЧЧ:ММ] <подпись>»: код без "
                    "пробелов, пробел, два числа ASCII-цифрами через «/», пробел, непустая подпись (методика, task-runner.md, "
                    "«Строки progress.log»); пример %s; %s" % (JOURNAL_EXAMPLE, TOOL_HINT % "progress_line"))
        if machine_paths.find_machine_paths(line):
            rep.add(path, number, "journal-path", "в строке путь машины")
    added = source.added_lines(path)
    for number, text in added or ():
        parsed = parse_progress_line(text.rstrip("\r"))
        if parsed is None:
            continue
        signature = signature_without_time(parsed[3])
        if len(signature) > SIGNATURE_MAX:
            rep.add(path, number, "journal-long", "подпись добавленной строки — %d знаков, предел %d без поля времени (методика: "
                    "«подпись без времени — не длиннее 80 знаков»); сократи на %d, подробности — в отчёт или log.md; пример %s; "
                    "%s, он не пропускает длинную подпись" % (len(signature), SIGNATURE_MAX, len(signature) - SIGNATURE_MAX,
                                                         JOURNAL_EXAMPLE, TOOL_HINT % "progress_line"))
        m = STOP_WORD.match(signature)
        if m and m.group(1) not in STOP_KIND_LIST:
            found = "вид «%s» не из списка" % m.group(1) if m.group(1) else "вид не назван"
            rep.add(path, number, "journal-stop", "строка остановки: %s; форма «стоп: <вид> — <причина>», вид — одно из слов: %s "
                    "(методика, task-runner.md, «Строки progress.log»); пример «С2 5/40 [2026-10-15 16:20] стоп: вопрос — нужен "
                    "ответ о составе описи»; %s (kind stop)" % (found, STOP_KINDS, TOOL_HINT % "progress_line"))


def log_line_fault(text):
    """Что именно не так в записи log.md с датой: время, вид или двоеточие."""
    m = LOG_TIME.match(text)
    if not m:
        return "после даты нет времени «ЧЧ:ММ» через пробел"
    rest = text[m.end():]
    if not rest.startswith(" "):
        return "после времени нет пробела"
    rest = rest[1:]
    for kind in LOG_KINDS.split(", "):
        if rest.startswith(kind):
            return "после вида «%s» нет двоеточия с пробелом" % kind
    head = rest.split(":", 1)[0] if ":" in rest else ""
    if head and len(head) <= 40:
        return "вид «%s» не из списка" % head
    return "нет вида с двоеточием после времени"


def check_log_md(path, data, source, rep):
    """log.md: добавленные в индексе строки с датой не раньше LOG_FROM — по шаблону новой записи."""
    if source.mode != "index":
        return
    added = source.added_lines(path)
    if added is None:  # первая версия файла (или репозиторий без коммитов): все строки добавлены
        added = list(enumerate(data.decode("utf-8", "replace").split("\n"), 1))
    for number, text in added:
        text = text.rstrip("\r")
        m = LOG_DATED.match(text)
        if m and m.group(1) >= LOG_FROM and not LOG_ENTRY.match(text):
            rep.add(path, number, "log-line", "запись с датой не раньше %s не по форме «ГГГГ-ММ-ДД ЧЧ:ММ <вид>: <текст>»: %s "
                    "(вид — один из: %s; Канон, process.md, «Дата в каждой записи журналов»); пример %s; %s" % (
                        LOG_FROM, log_line_fault(text), LOG_KINDS, LOG_EXAMPLE, TOOL_HINT % "log_line"))


def task_started(folder, by_path, source, cache):
    """Дата и время первой записи log.md папки задачи («ГГГГ-ММ-ДД ЧЧ:ММ») или None."""
    if folder not in cache:
        cache[folder] = None
        entry = by_path.get(folder + "/log.md")
        data = source.read(entry) if entry is not None and entry.mode != "160000" else None
        if data is not None:
            for line in data.decode("utf-8", "replace").lstrip("﻿").split("\n"):
                m = LOG_STARTED.match(line)
                if m:
                    cache[folder] = m.group(1)
                    break
    return cache[folder]


def text_lines(text):
    return [line.rstrip("\r") for line in text.lstrip("﻿").split("\n")]


def check_result_line(path, text, number, rep):
    lines = text_lines(text)
    if len(lines) < number or lines[number - 1] != RESULT_LINE:
        rep.add(path, number, "result-line", "строка %d не «%s» (промпты С1 и С3 методики)" % (number, RESULT_LINE))


def check_result_section(path, text, folder, paths, rep):
    """Раздел «Результат и куда он попадает» в spec.md; current.md, если результат назван и result.md уже есть."""
    lines = text_lines(guardlib.strip_fenced(text.lstrip("﻿")))
    start = next((i for i, line in enumerate(lines) if RESULT_HEAD.match(line)), None)
    if start is None:
        rep.add(path, None, "result-section", "нет раздела «Результат и куда он попадает» (промпт С1 методики, п. 7)")
        return
    body = []
    for line in lines[start + 1:]:
        if ANY_HEAD.match(line):
            break
        body.append(line)
    if not any(line.strip() for line in body):
        rep.add(path, start + 1, "result-section", "раздел «Результат и куда он попадает» пуст")
        return
    no_result = [NO_RESULT_LINE.match(line) for line in body]
    no_result = [m for m in no_result if m]
    for m in no_result:
        if not m.group(1).strip(" \t;:,.—–-"):
            rep.add(path, start + 1, "result-section", "строка «нет: результат — код» без фразы, что именно сдаётся")
    if not no_result and folder + "/result.md" in paths and folder + "/current.md" not in paths:
        rep.add(path, start + 1, "result-current", "результат назван, result.md уже есть, а current.md в папке задачи нет")


def judge(source, args, rep):
    count = 0
    by_path = None
    started = {}
    for entry in source.changed():
        if LOG_FILE.match(entry.path) and entry.mode != "160000":
            data = source.read(entry)
            if data is not None:
                count += 1
                check_log_md(entry.path, data, source, rep)
            continue
        if JOURNAL_FILE.match(entry.path) and entry.mode != "160000":
            data = source.read(entry)
            if data is not None:
                count += 1
                check_progress_log(entry.path, data, source, rep)
            continue
        m = TASK_FILE.match(entry.path)
        if not m or entry.mode == "160000":
            continue
        data = source.read(entry)
        if data is None:
            continue
        count += 1
        text = data.decode("utf-8", "replace")
        name = m.group(1)
        if name in ("spec.md", "plan.md"):
            check_status_line(entry.path, text, rep)
            if name == "spec.md":
                check_unique_ids(entry.path, text.lstrip("\ufeff"), rep)
            if by_path is None:
                by_path = dict((e.path, e) for e in source.entries())
            folder = entry.path.rsplit("/", 1)[0]
            since = task_started(folder, by_path, source, started)
            if since is not None and since >= RESULT_FROM:
                if name == "spec.md":
                    check_result_line(entry.path, text, 2, rep)
                    check_result_section(entry.path, text, folder, by_path, rep)
                else:
                    check_result_line(entry.path, text, 3, rep)
        else:
            check_review_line(entry.path, m.group(2), text, rep)
    return guardlib.Outcome(count=count)


if __name__ == "__main__":
    sys.exit(guardlib.run("check-task-docs", "файлов задач", judge,
                          lost="нет ни одного spec.md, plan.md, progress.log, log.md или файла проверки в doc/tasks/*/"))
