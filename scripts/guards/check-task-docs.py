# -*- coding: utf-8 -*-
"""Страж форматов документов задач: статус spec.md и plan.md, первая строка проверок, уникальные номера, журнал хода.

Зачем: программа цикла задач и сами сессии читают из этих файлов машинные места (статус, итог
    захода, номера требований, строки хода); молчаливо испорченная первая строка запускает проверку
    заново поверх утверждённого документа или теряет заход, а строка журнала не по форме пропадает
    из панели хода без шума.
Проверяет: номер папки задачи doc/tasks/NNN-<slug>/ не повторяется — две папки с одним номером NNN красные (task-number-dup,
    адрес — обе папки; задача 058: одна задача — один номер; в режиме коммита — только если коммит меняет одну из них);
    в doc/tasks/*/ — первая строка spec.md и plan.md начинается с «Статус: черновик» или
    «Статус: утверждено»; первая строка spec-review-N.md, plan-review-N.md, review-N.md и
    delivery-review-N.md — «Заход N: существенных K, поверхностных M, проб P» с числами и N как в
    имени файла; номера REQ-NN, AC-NN, DNC-NN в начале строки spec.md не повторяются; progress.log —
    файл читается байтами и делится по LF (один CR в конце строки снимается), каждая непустая строка
    по форме «<код> <k>/<N> <подпись>» (journal-line, с адресом «файл:строка»), без пути машины
    (journal-path; определение одно со стражем секретов, lib/machine_paths.py) и, только в режиме
    индекса у добавленных строк журнала, который уже есть в HEAD, с подписью (без поля времени
    [ЧЧ:ММ] или [ГГГГ-ММ-ДД ЧЧ:ММ]) не длиннее 80 знаков (journal-long), а строка остановки «стоп:» — с видом
    из списка вопрос, план, ревизия, требования, ворота (journal-stop), строка «поправка:» — по форме «поправка: к строке
    «<начало подписи после времени, от 10 до 30 знаков, а если подпись короче — вся>» — <что не так>», начало — начало подписи
    прежней строки того же кода (journal-fix); «готово» при k меньше N из строки «старт» своей сессии, не исправленное позже по делу:
    строкой «стоп: <вид из списка>» или «готово — N завышено: <причина>» того же кода с тем же k либо дальнейшими единицами (journal-done;
    сессия — строки кода от строки запуска или первой строки до итоговой, после итоговой её продолжают только повтор с тем же k и «стоп:»
    после «готово»; «готово» при k меньше N итоговой строкой не является; старт, дописанный не первой строкой, — старт сессии); в журнале,
    начатом не раньше 2026-10-16 00:00 (первая строка с полем [ГГГГ-ММ-ДД ЧЧ:ММ]), у добавленных строк — поле времени
    [ГГГГ-ММ-ДД ЧЧ:ММ] (journal-time) и строка запуска «<код> 0/0 [время] запуск №<n>»: номер не повторяет прежний номер запуска в файле, а в
    log.md папки есть запись «запуск №<n> <код>» (journal-launch; методика ab2a4ef: границу сессии ставит запускающий); journal-long и
    journal-stop не судят строку,
    исправленную позже в файле строкой той же сессии (тот же код): поправкой с началом подписи этой строки после поля времени, а итоговую
    строку («готово», «стоп:», и с ошибкой в ключевом слове) — только её повтором с тем же k и ключевым словом в верной форме
    (задачи 050 и 053; методика unitcraft/ai-dev-methodology @ ab2a4ef); log.md — только в режиме
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
    папке уже есть result.md — в папке есть current.md (result-current); образец задания (задача 065) — только у задач, заведённых
    не раньше 2026-10-17 01:00 (первая запись log.md с датой и временем): в task/message.md до первого раздела есть заголовок
    «# Задание: <название>» (message-title), разделы второго уровня «Чего хочет владелец», «Что нужно», «Критерии приёмки»,
    «Результат и куда он попадает», «Связи», «Границы» есть все и в этом порядке (пояснение в скобках после названия допустимо),
    ни один не пуст и «нет:» в них — с причиной (message-section), в разделе слов владельца есть дата ГГГГ-ММ-ДД в заголовке или
    теле, если раздел не «нет: …» (message-owner).
Не проверяет: содержание документов, остальные файлы задач (result.md, profile.log, материалы
    task/), записи log.md без даты в начале строки, с датой раньше 2026-10-10 и вне индекса (в
    режимах дерева, коммита и CI добавленных строк нет), usage.log, вложенные папки задач, вторую строку plan.md (база ревизии); честность строки
    журнала («пишется по ходу» судится приёмкой); предел подписи в режимах дерева и коммита и CI
    (там нет добавленных строк), вид остановки там же и в прежних строках; порядок строк сессии (старт первой
    строкой, по строке на единицу, номер захода) — его проверяет инструмент progress_line при записи; k больше N и неверное поле времени (остаются подписью, как в панели);
    «готово» без строки «старт» или после второй, строку после итоговой (существенные находки приёмки по методике, страж их не держит:
    новой строкой их не исправить, красный страж требовал бы переписать журнал, а прежние строки не переписываются; progress_line таких
    строк не пишет); неисправленную ошибку ключевого слова итоговой строки (ошибка, только если строка осталась последней в сессии, а при
    записи этого не видно; судит приёмка); поправку после итоговой строки (её не принимает progress_line); прежние
    строки истории (не добавленные) по правилам задачи 053 — задним числом их не исправить, не переписав историю; journal-time и
    journal-launch в журналах, начатых раньше 2026-10-16 00:00 или без даты в первой строке (переход: строки запуска без номера и время
    [ЧЧ:ММ] в них законны по прежним правилам, а дописать номер или запись в log.md задним числом — переписать историю); кто написал
    строку запуска и запись в log.md (журнал — сигнал, а не доказательство; автора строка не несёт);
    по норме о результате — задачи, заведённые раньше 2026-10-15 14:20, и папки без log.md с датой;
    current.md до появления result.md (его создаёт шаг плана в реализации); содержание current.md,
    метки копий, единственность действующего текста и честность строки «нет: результат — код» (это
    проверка С6, п. 5 методики); в режиме коммита — папки, где коммит не меняет spec.md или plan.md; по образцу задания — задачи,
    заведённые раньше 2026-10-17 01:00, папки без log.md с датой, шапку задания, дополнительные разделы, дословность слов владельца
    и честность «нет: <почему>» (судит приёмка), задание в режиме коммита, если коммит не меняет task/message.md.
Правило: doc/canon/process.md (цикл сессий методики, «Журнал хода progress.log», «Задача, сессия, подзадача», «Результат и
    куда он попадает», «Задание task/message.md») и формат машинных мест методики.

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
# задача 062 (методика unitcraft/ai-dev-methodology @ 0b0e6d4, раздел 4): остановка на воротах заканчивается вопросом владельцу; строка log.md о
# воротах называет канал и время вопроса — слово «канал» и время ЧЧ:ММ после «ворота: »; судятся задачи, заведённые не раньше GATE_FROM
LOG_GATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} ворота: (.*)$")
GATE_CHANNEL = re.compile(r"канал", re.I)
GATE_TIME = re.compile(r"(?<![0-9:])(?:[01][0-9]|2[0-3]):[0-5][0-9](?![0-9:])")
GATE_FROM = "2026-10-16 17:00"
GATE_EXAMPLE = "«2026-10-16 18:00 ворота: В2, вопрос владельцу задан в окне OpenCode, канал question, 17:55»"
LOG_KINDS = "решение владельца, заседание, ворота, документ, пуск, слияние, находка"
SIGNATURE_MAX = 80
STOP_KINDS = "вопрос, план, ревизия, требования, ворота"
STOP_KIND_LIST = ("вопрос", "план", "ревизия", "требования", "ворота")
STOP_WORD = re.compile(r"^стоп:[ \t]*([^ \t.,:;!—–-]*)")
# строка-поправка (задачи 050 и 053; методика unitcraft/ai-dev-methodology @ d5f1e80, task-runner.md, «Строки progress.log»): ключевое
# слово «поправка» с двоеточием, начало подписи ошибочной строки после времени — от 10 до 30 знаков (короче — вся подпись) в кавычках «»
CORRECTION_WORD = re.compile(r"^поправка:")
CORRECTION_FORM = re.compile(r"^поправка: к строке «([^«»]{1,30})» — \S")
CORRECTION_MIN = 10
CORRECTION_EXAMPLE = "«С1 31/32 [2026-10-15 12:14] поправка: к строке «опись source inventory» — подпись 93 знака»"
KEYWORD_START = re.compile(r"^старт(?:$|[ \t.,:;!—–-])")
KEYWORD_LAUNCH = re.compile(r"^запуск(?:$|[ \t.,:;!—–-])")
DONE_EXAMPLE = "«С6 7/7 [2026-10-15 16:20] готово — N завышено: AC семь»"
# «готово — N завышено: <причина>» (методика ab2a4ef): итоговая строка и завершение и при k меньше N из строки «старт»
OVERSTATED = re.compile(r"^готово[ \t.,:;!—–-]+N завышено:")
# журналы, начатые не раньше JOURNAL_FROM (первая строка с полем [ГГГГ-ММ-ДД ЧЧ:ММ]), судятся по journal-time и journal-launch (переход)
JOURNAL_FROM = "2026-10-16 00:00"
JOURNAL_DATED = re.compile(r"^\[([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})\] ")
LAUNCH_NUMBERED = re.compile(r"^запуск №([1-9][0-9]*)(?:$|[ \t.,:;!—–-])")
LAUNCH_EXAMPLE = "«С5 0/0 [2026-10-16 09:00] запуск №3» и в log.md «2026-10-16 09:00 пуск: запуск №3 С5 [2026-10-16 09:00]»"
# итоговая строка, в том числе с ошибкой в ключевом слове («Готово», «стоп» без двоеточия): её исправляет только повтор с тем же k
FINAL_LIKE = re.compile(r"^(готово|стоп)(?:$|[ \t.,:;!—–-])", re.IGNORECASE)
KEYWORD_DONE = re.compile(r"^готово(?:$|[ \t.,:;!—–-])")
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
# папка задачи с номером (задача 058): номер — цифры до первого дефиса
TASK_FOLDER = re.compile(r"^(doc/tasks/([0-9]{3,})-[^/]+)/")
# образец задания task/message.md (слово владельца, 2026-10-17, чат оркестратора; задача 065): заголовок «# Задание: …», разделы второго
# уровня по порядку, не пустые, «нет:» с причиной, дата в разделе слов владельца; судятся задачи, заведённые не раньше MESSAGE_FROM
MESSAGE_FILE = re.compile(r"^(doc/tasks/[^/]+)/task/message\.md$")
MESSAGE_FROM = "2026-10-17 01:00"
MESSAGE_SECTIONS = ("Чего хочет владелец", "Что нужно", "Критерии приёмки", "Результат и куда он попадает", "Связи", "Границы")
MESSAGE_TITLE = re.compile(r"^#[ \t]+Задание:[ \t]*\S")
MESSAGE_HEAD = re.compile(r"^##[ \t]+(.+?)[ \t]*$")
MESSAGE_ANY_HEAD = re.compile(r"^#{1,2}[ \t]")
MESSAGE_PAREN = re.compile(r"[ \t]*\(.*\)$")
MESSAGE_NONE = re.compile(r"^[ \t]*(?:[-*][ \t]+)?нет:")
MESSAGE_BARE_NONE = re.compile(r"^[ \t]*(?:[-*][ \t]+)?нет:[ \t.,;:—–-]*$")
MESSAGE_DATE = re.compile(r"(?<![0-9])[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?![0-9])")
MESSAGE_RULE = "Канон, process.md, «Задание task/message.md»"


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


def stop_fault(signature):
    """Что не так в строке остановки «стоп:» (вид не из списка или не назван) или None."""
    m = STOP_WORD.match(signature)
    if m and m.group(1) not in STOP_KIND_LIST:
        return "вид «%s» не из списка" % m.group(1) if m.group(1) else "вид не назван"
    return None


def well_formed_final(signature, word):
    """Итоговая строка в верной форме: «готово» строчными или «стоп: <вид из списка>», подпись до предела."""
    if len(signature) > SIGNATURE_MAX:
        return False
    if word == "готово":
        return bool(KEYWORD_DONE.match(signature))
    return bool(STOP_WORD.match(signature)) and stop_fault(signature) is None


def corrected(lines, number, parsed):
    """Исправлена ли ошибка формы строки number (задачи 050 и 053, методика d5f1e80): позже в файле есть строка той же сессии (тот же
    код) — поправка «поправка: к строке «<начало>» — …», где начало — начало подписи после поля времени; итоговую строку («готово»,
    «стоп:», и с ошибкой в ключевом слове) исправляет только её повтор с тем же k и ключевым словом в верной форме."""
    code, k, _, signature = parsed
    text = signature_without_time(signature)
    final = FINAL_LIKE.match(text)
    for later in lines[number:]:
        other = parse_progress_line(later)
        if other is None or other[0] != code:
            continue
        later_text = signature_without_time(other[3])
        if final:
            if other[1] == k and well_formed_final(later_text, final.group(1).lower()):
                return True
            continue
        m = CORRECTION_FORM.match(later_text)
        if m and text.startswith(m.group(1)):
            return True
    return False


def correction_fault(lines, number, code, quote):
    """Что не так с началом в поправке (методика d5f1e80): это начало подписи после времени прежней строки того же кода, от 10 до 30
    знаков, а если подпись короче — вся подпись; иначе None."""
    earlier = []
    for line in lines[:number - 1]:
        other = parse_progress_line(line)
        if other is not None and other[0] == code:
            earlier.append(signature_without_time(other[3]))
    starts = [text for text in earlier if text.startswith(quote)]
    if not starts:
        return "начало «%s» — не начало подписи (после поля времени) ни одной прежней строки кода %s" % (quote, code)
    if len(quote) < CORRECTION_MIN and quote not in starts:
        return "начало «%s» короче %d знаков, а подпись длиннее" % (quote, CORRECTION_MIN)
    return None


def session_start(lines, number, code):
    """N из строки «старт» сессии строки number, если строка «старт» в сессии одна; иначе None. Сессия — строки кода от строки запуска
    (или первой строки) до итоговой; после итоговой её продолжают только повтор с тем же k и «стоп:» после «готово» с тем же k, другая
    строка открывает новую сессию; упавший k — новая сессия без старта (так читают progress_line и панель; методика d5f1e80)."""
    start_n, starts, last_k, final = None, 0, -1, None
    for line in lines[:number]:
        other = parse_progress_line(line)
        if other is None or other[0] != code:
            continue
        _, k, n, signature = other
        text = signature_without_time(signature)
        if CORRECTION_WORD.match(text):
            continue
        if KEYWORD_LAUNCH.match(text) and k == 0 and n == 0:
            start_n, starts, last_k, final = None, 0, -1, None
            continue
        word = FINAL_LIKE.match(text)
        word = word.group(1).lower() if word else None
        if word == "готово" and KEYWORD_DONE.match(text) and starts == 1 and start_n is not None and k < start_n \
                and not OVERSTATED.match(text):
            word = None  # «готово» при k меньше N итоговой строкой не является (методика ab2a4ef)
        if final is not None:
            if k == last_k and (word == final or (final == "готово" and text.startswith("стоп:"))):
                final = word
                continue
            start_n, starts, last_k, final = None, 0, -1, None
        if KEYWORD_START.match(text):
            if last_k < 0:
                start_n, starts, last_k = n, 1, k
            elif starts == 0:
                start_n, starts = n, 1  # старт, дописанный не первой строкой (методика ab2a4ef)
            else:
                starts += 1
        elif last_k >= 0 and k < last_k:
            start_n, starts, last_k = None, 0, k
        else:
            last_k = k
        final = word
    return start_n if starts == 1 else None


def low_done_fixed(lines, number, code, k):
    """«готово» при k меньше N исправлено позже по делу (методика ab2a4ef): строкой «стоп: <вид из списка>» или «готово — N завышено:
    <причина>» того же кода с тем же k либо дальнейшей единицей той же сессии (работа идёт)."""
    for later in lines[number:]:
        other = parse_progress_line(later)
        if other is None or other[0] != code:
            continue
        text = signature_without_time(other[3])
        if CORRECTION_WORD.match(text):
            continue
        if KEYWORD_LAUNCH.match(text) or KEYWORD_START.match(text):
            return False
        if other[1] == k and (well_formed_final(text, "стоп") or OVERSTATED.match(text)):
            return True
        if other[1] > k:
            return True
    return False


def journal_started(lines):
    """Дата и время первой строки журнала из поля [ГГГГ-ММ-ДД ЧЧ:ММ] или None (журнал без даты в первой строке — прежний)."""
    for line in lines:
        parsed = parse_progress_line(line)
        if parsed is not None:
            m = JOURNAL_DATED.match(parsed[3])
            return m.group(1) if m else None
    return None


def launch_fault(lines, number, parsed, log_text):
    """Что не так со строкой запуска нового журнала (методика ab2a4ef) или None."""
    code, k, n, signature = parsed
    text = signature_without_time(signature)
    m = LAUNCH_NUMBERED.match(text)
    if k != 0 or n != 0 or not m:
        return "строка запуска не по форме «<код> 0/0 [ГГГГ-ММ-ДД ЧЧ:ММ] запуск №<n>»"
    number_n = m.group(1)
    for line in lines[:number - 1]:
        other = parse_progress_line(line)
        if other is not None:
            prev = LAUNCH_NUMBERED.match(signature_without_time(other[3]))
            if prev and prev.group(1) == number_n:
                return "номер запуска №%s уже был в журнале (вторая строка с тем же номером — существенная находка)" % number_n
    if not re.search(r"(?:^|[^0-9])запуск №%s %s(?:$|[ \t\[])" % (number_n, re.escape(code)), log_text or "", re.MULTILINE):
        return "в log.md папки нет записи «запуск №%s %s» оркестратора (запуск без записи — существенная находка)" % (number_n, code)
    return None


def check_progress_log(path, data, source, rep, log_text=None):
    lines = split_journal(data)
    started = journal_started(lines)
    new_journal = started is not None and started >= JOURNAL_FROM
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
        if CORRECTION_WORD.match(signature):
            form = CORRECTION_FORM.match(signature)
            fault = None if not form or number > len(lines) else correction_fault(lines, number, parsed[0], form.group(1))
            if not form or fault:
                rep.add(path, number, "journal-fix", "строка-поправка не по форме «поправка: к строке «<начало подписи ошибочной строки "
                        "после времени, от 10 до 30 знаков, а если подпись короче — вся>» — <что не так>»%s (методика, task-runner.md, "
                        "«Строки progress.log»); пример %s; %s (kind correction)" % (
                            ": " + fault if fault else "", CORRECTION_EXAMPLE, TOOL_HINT % "progress_line"))
        if new_journal and not JOURNAL_DATED.match(parsed[3]):
            rep.add(path, number, "journal-time", "в строке нет поля времени [ГГГГ-ММ-ДД ЧЧ:ММ] — в журнале, начатом не раньше %s, у новой "
                    "строки время с датой (методика, task-runner.md, машинный хвост: «в форме [ГГГГ-ММ-ДД ЧЧ:ММ]»); пример %s; %s, он "
                    "ставит дату и время машины" % (JOURNAL_FROM, JOURNAL_EXAMPLE, TOOL_HINT % "progress_line"))
        if new_journal and KEYWORD_LAUNCH.match(signature) and number <= len(lines):
            fault = launch_fault(lines, number, parsed, log_text)
            if fault:
                rep.add(path, number, "journal-launch", "%s (методика, task-runner.md, «Строки progress.log»: запуск несёт порядковый "
                        "номер, тот же номер — в перечне запусков оркестратора в log.md); пример %s; строку запуск и запись в log.md "
                        "пишет запускающий (оркестратор, раннер), агент их не пишет" % (fault, LAUNCH_EXAMPLE))
        if KEYWORD_DONE.match(signature) and not OVERSTATED.match(signature) and number <= len(lines):
            start_n = session_start(lines, number, parsed[0])
            if start_n is not None and parsed[1] < start_n and not low_done_fixed(lines, number, parsed[0], parsed[1]):
                rep.add(path, number, "journal-done", "«готово» при k=%d, а N из строки «старт» — %d: такое «готово» завершением не "
                        "считается (методика, task-runner.md, «Строки progress.log»: k сравнивается с N из строки «старт»); прежняя "
                        "строка не переписывается — исправь по делу: работа сделана, а N завышено, — «готово — N завышено: <причина>» "
                        "с тем же k, например %s; остановка — «стоп: <вид> — <причина>» с тем же k; работа идёт — следующая единица; "
                        "%s (kind done или stop), он такого «готово» не пишет" % (parsed[1], start_n, DONE_EXAMPLE, TOOL_HINT % "progress_line"))
        fault_long = len(signature) > SIGNATURE_MAX
        fault_stop = stop_fault(signature)
        if (fault_long or fault_stop) and number <= len(lines) and corrected(lines, number, parsed):
            continue  # ошибка формы исправлена поправкой или повтором итоговой строки — прежняя строка не переписывается
        if fault_long:
            rep.add(path, number, "journal-long", "подпись добавленной строки — %d знаков, предел %d без поля времени (методика: "
                    "«подпись без времени — не длиннее 80 знаков»); сократи на %d, подробности — в отчёт или log.md; пример %s; "
                    "%s, он не пропускает длинную подпись; прежняя строка не переписывается — допиши строку-поправку "
                    "(kind correction), у итоговой строки — её повтор с тем же k" % (
                        len(signature), SIGNATURE_MAX, len(signature) - SIGNATURE_MAX, JOURNAL_EXAMPLE, TOOL_HINT % "progress_line"))
        if fault_stop:
            rep.add(path, number, "journal-stop", "строка остановки: %s; форма «стоп: <вид> — <причина>», вид — одно из слов: %s "
                    "(методика, task-runner.md, «Строки progress.log»); пример «С2 5/40 [2026-10-15 16:20] стоп: вопрос — нужен "
                    "ответ о составе описи»; %s (kind stop); прежняя строка не переписывается — допиши её повтор с тем же k и "
                    "верным видом" % (fault_stop, STOP_KINDS, TOOL_HINT % "progress_line"))


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


def check_log_gate(path, number, text, rep):
    m = LOG_GATE.match(text)
    if not m:
        return
    rest = m.group(1)
    lack = []
    if not GATE_CHANNEL.search(rest):
        lack.append("слова «канал» (где задан вопрос)")
    if not GATE_TIME.search(rest):
        lack.append("времени вопроса «ЧЧ:ММ»")
    if lack:
        rep.add(path, number, "log-gate", "запись «ворота» задачи, заведённой не раньше %s, без %s: остановка на воротах заканчивается вопросом владельцу, строка называет "
                "канал и время вопроса (Канон, process.md, «Остановка на воротах — вопрос владельцу»; методика @ 0b0e6d4); пример %s" % (GATE_FROM, " и ".join(lack), GATE_EXAMPLE))


def check_log_md(path, data, source, rep):
    """log.md: добавленные в индексе строки с датой не раньше LOG_FROM — по шаблону новой записи."""
    if source.mode != "index":
        return
    added = source.added_lines(path)
    if added is None:  # первая версия файла (или репозиторий без коммитов): все строки добавлены
        added = list(enumerate(data.decode("utf-8", "replace").split("\n"), 1))
    gated = False  # задача 062: задача заведена не раньше GATE_FROM (первая запись с датой и временем)
    for line in data.decode("utf-8", "replace").lstrip("﻿").split("\n"):
        sm = LOG_STARTED.match(line)
        if sm:
            gated = sm.group(1) >= GATE_FROM
            break
    for number, text in added:
        text = text.rstrip("\r")
        if gated:
            check_log_gate(path, number, text, rep)
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


def check_message(path, text, rep):
    """task/message.md задачи, заведённой не раньше MESSAGE_FROM: заголовок, разделы образца по порядку, не пустые, дата у слов владельца."""
    lines = text_lines(guardlib.strip_fenced(text.lstrip("﻿")))
    heads = []
    for number, line in enumerate(lines, 1):
        m = MESSAGE_HEAD.match(line)
        if m:
            heads.append((number, MESSAGE_PAREN.sub("", m.group(1)).strip(), line))
    first = heads[0][0] if heads else len(lines) + 1
    if not any(MESSAGE_TITLE.match(line) for line in lines[:first - 1]):
        rep.add(path, None, "message-title", "нет заголовка «# Задание: <название>» перед разделами (%s)" % MESSAGE_RULE)
    found = []
    for name in MESSAGE_SECTIONS:
        hit = next((h for h in heads if h[1] == name), None)
        if hit is None:
            rep.add(path, None, "message-section", "нет раздела «%s»: разделы образца — %s, заголовки второго уровня «## …» в этом "
                    "порядке, пустой раздел пишется «нет: <почему>», а не пропускается (%s)" % (
                        name, ", ".join("«%s»" % x for x in MESSAGE_SECTIONS), MESSAGE_RULE))
        else:
            found.append((name, hit))
    for (prev_name, prev), (name, hit) in zip(found, found[1:]):
        if hit[0] < prev[0]:
            rep.add(path, hit[0], "message-section", "раздел «%s» стоит раньше «%s»: порядок образца — %s (%s)" % (
                name, prev_name, ", ".join("«%s»" % x for x in MESSAGE_SECTIONS), MESSAGE_RULE))
    for name, (number, _, head) in found:
        body = []
        for line in lines[number:]:
            if MESSAGE_ANY_HEAD.match(line):
                break
            body.append(line)
        filled = [line for line in body if line.strip()]
        if not filled:
            rep.add(path, number, "message-section", "раздел «%s» пуст — пустой раздел пишется «нет: <почему>» (%s)" % (name, MESSAGE_RULE))
            continue
        bare = next((i for i, line in enumerate(body) if MESSAGE_BARE_NONE.match(line)), None)
        if bare is not None:
            rep.add(path, number + 1 + bare, "message-section", "в разделе «%s» «нет:» без причины — пишется «нет: <почему>» (%s)" % (
                name, MESSAGE_RULE))
            continue
        if name == MESSAGE_SECTIONS[0] and not MESSAGE_DATE.search(head) and not any(MESSAGE_DATE.search(line) for line in body) \
                and not MESSAGE_NONE.match(filled[0]):
            rep.add(path, number, "message-owner", "в разделе «%s» нет даты ГГГГ-ММ-ДД: слова владельца — дословно, с датой и источником "
                    "(AGENTS.md, п. 2; %s); пример «- «сделай X» (владелец, 2026-10-17, чат оркестратора)» или заголовок «## %s (его "
                    "слова, 2026-10-17, чат оркестратора)»" % (name, MESSAGE_RULE, name))


def check_number_dup(source, changed, rep):
    """Две папки задач с одним номером NNN (задача 058): по нарушению на каждую папку, в тексте — обе."""
    folders = {}
    for entry in source.entries():
        m = TASK_FOLDER.match(entry.path)
        if m:
            folders.setdefault(int(m.group(2)), set()).add(m.group(1))
    for number in sorted(folders):
        names = sorted(folders[number])
        if len(names) < 2:
            continue
        if source.mode == "commit" and not any(p.startswith(f + "/") for f in names for p in changed):
            continue
        for folder in names:
            rep.add(folder, None, "task-number-dup", "номер %03d у двух папок задач: %s — одна задача — один номер (Канон, process.md, "
                    "«Задача, сессия, подзадача»); новой задаче номер выдают crew_spawn плагина или scripts/task-number.mjs, "
                    "переименуй одну из папок на свободный номер" % (number, " и ".join(names)))


def judge(source, args, rep):
    count = 0
    check_number_dup(source, [e.path for e in source.changed()], rep)
    by_path = None
    started = {}
    for entry in source.changed():
        mm = MESSAGE_FILE.match(entry.path)
        if mm and entry.mode != "160000":
            if by_path is None:
                by_path = dict((e.path, e) for e in source.entries())
            since = task_started(mm.group(1), by_path, source, started)
            data = source.read(entry) if since is not None and since >= MESSAGE_FROM else None
            if data is not None:
                count += 1
                check_message(entry.path, data.decode("utf-8", "replace"), rep)
            continue
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
                if by_path is None:
                    by_path = dict((e.path, e) for e in source.entries())
                log_entry = by_path.get(entry.path.rsplit("/", 1)[0] + "/log.md")
                log_data = source.read(log_entry) if log_entry is not None and log_entry.mode != "160000" else None
                check_progress_log(entry.path, data, source, rep, log_data.decode("utf-8", "replace") if log_data is not None else "")
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
                          lost="нет ни одного spec.md, plan.md, progress.log, log.md, task/message.md новой задачи или файла проверки в doc/tasks/*/"))
