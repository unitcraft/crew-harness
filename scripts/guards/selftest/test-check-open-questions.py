# -*- coding: utf-8 -*-
"""Самотест стража файла открытых вопросов check-open-questions.py.

Зачем: страж, который пропускает пункт без срока или пункт «Не сделано» без пометки, возвращает
    прежнюю беду — неблокирующие вопросы теряются в разборах; страж, который краснит законный файл
    или старые разборы, будут обходить; счёт «просрочено» с ошибкой обманывает владельца на воротах.
Проверяет: законные — файл с пунктами по форме и разбор после даты введения с пометками; разбор,
    начатый до даты введения, не судится; красные — нет поля, срок не датой, источник без даты,
    закрытие без даты, третье продление, второе продление без причины, повтор номера, пункт «Не
    сделано» без пометки, с двумя пометками, ссылка на несуществующий номер, ссылка при отсутствии
    файла; иной синтаксис — поле с продолжением строки, нумерованный пункт и раздел «Что не проверено»; счёт --overdue: число и
    список, ноль, продлённый, закрытый и с применённым умолчанием не просрочены; мишень — пустой
    репозиторий.
Не проверяет: честность умолчаний и правдивость закрытий (приёмка и владелец).
Правило: doc/canon/process.md, «Открытые вопросы»; задача 060.
"""
import sys

sys.dont_write_bytecode = True

import stlib

OQ = "doc/open-questions.md"
NEW = "doc/tasks/070-x/"
OLD = "doc/tasks/050-y/"
NEW_LOG = "2026-10-20 10:00 документ: задание\n"
OLD_LOG = "2026-10-01 10:00 документ: задание\n"


def item(n, extra="", **drop):
    fields = [("Вопрос", "показывать ли цели в /crew?"), ("Адресат", "владелец"),
              ("Решение по умолчанию", "не показывать"), ("Срок", "2026-11-15"),
              ("Источник", "разбор 057, «Не сделано»; задача 060, 2026-10-15")]
    lines = ["## #%d Цели в /crew" % n, ""]
    for key, value in fields:
        if key in drop:
            if drop[key] is None:
                continue
            value = drop[key]
        lines.append("- %s: %s" % (key, value))
    if extra:
        lines.append(extra)
    return "\n".join(lines) + "\n\n"


def oq(*items):
    return "# Открытые вопросы\n\nПравила — в методике.\n\n" + "".join(items)


def analysis(body, head="## 4. Не сделано"):
    return "# Разбор\n\n## 1. Что сделано\n\n- всё\n\n" + head + "\n\n" + body + "\n## 5. Проверка\n\nтесты\n"


def main():
    pr = stlib.Probes("check-open-questions")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-open-questions.py", repo, env, *args)

    def files(oq_text=None, new=None, old=None):
        f = {"doc/tasks/README.md": "x\n"}
        if oq_text is not None:
            f[OQ] = oq_text
        if new is not None:
            f[NEW + "log.md"] = NEW_LOG
            f[NEW + "analysis.md"] = new
        if old is not None:
            f[OLD + "log.md"] = OLD_LOG
            f[OLD + "analysis.md"] = old
        return f

    def green(**kw):
        def fn():
            stlib.expect(check(fresh(files(**kw))), 0, "ок: осмотрено")
        return fn

    def red(rule, **kw):
        def fn():
            proc = check(fresh(files(**kw)))
            stlib.expect(proc, 1, "FAIL: check-open-questions:")
            assert stlib.has_line(proc, ": %s:" % rule), proc.out
        return fn

    good = analysis("- первое → open-questions #1\n- второе → задача 058\n- третье — не нужно, потому что сделано\n"
                    "  продолжение строки пункта\n")
    pr.probe("законное", "файл по форме и разбор с пометками", green(oq_text=oq(item(1), item(2)), new=good))
    pr.probe("законное", "разбор, начатый до даты введения, не судится",
             green(oq_text=oq(item(1)), old=analysis("- без пометки\n")))
    pr.probe("законное", "закрытый, продлённый дважды с причиной и с применённым умолчанием",
             green(oq_text=oq(item(1, "- закрыто: слово владельца, 2026-10-20"),
                              item(2, "- продлено: до 2026-12-01\n- продлено: до 2026-12-20, причина: ждём окно"),
                              item(3, "- применено умолчание: не показывать (2026-11-16)"))))
    pr.probe("иной-синтаксис", "дата источника на строке продолжения",
             green(oq_text=oq(item(1, Источник="разбор 057,\n  «Не сделано»; задача 060, 2026-10-15"))))
    pr.probe("красная", "нет поля «Адресат»", red("oq-field", oq_text=oq(item(1, Адресат=None))))
    pr.probe("красная", "срок не датой", red("oq-field", oq_text=oq(item(1, Срок="через месяц"))))
    pr.probe("красная", "источник без даты", red("oq-field", oq_text=oq(item(1, Источник="разбор 057"))))
    pr.probe("красная", "закрытие без даты", red("oq-close", oq_text=oq(item(1, "- закрыто: слово владельца"))))
    pr.probe("красная", "третье продление",
             red("oq-extend", oq_text=oq(item(1, "- продлено: до 2026-12-01\n- продлено: до 2026-12-02, причина: а\n"
                                                 "- продлено: до 2026-12-03, причина: б"))))
    pr.probe("красная", "второе продление без причины",
             red("oq-extend", oq_text=oq(item(1, "- продлено: до 2026-12-01\n- продлено: до 2026-12-02"))))
    pr.probe("красная", "повтор номера", red("oq-number", oq_text=oq(item(1), item(1))))
    pr.probe("красная", "пункт «Не сделано» без пометки",
             red("oq-mark", oq_text=oq(item(1)), new=analysis("- первое → open-questions #1\n- второе без пометки\n")))
    pr.probe("красная", "две пометки у пункта",
             red("oq-mark", oq_text=oq(item(1)), new=analysis("- первое → open-questions #1 → задача 058\n")))
    pr.probe("красная", "ссылка на несуществующий номер",
             red("oq-ref", oq_text=oq(item(1)), new=analysis("- первое → open-questions #7\n")))
    pr.probe("красная", "ссылка на файл, которого нет",
             red("oq-ref", new=analysis("- первое → open-questions #1\n")))
    pr.probe("иной-синтаксис", "нумерованный пункт без пометки",
             red("oq-mark", oq_text=oq(item(1)), new=analysis("1. **Жирно.** без пометки\n")))
    pr.probe("иной-синтаксис", "раздел «Что не проверено» тоже судится",
             red("oq-mark", oq_text=oq(item(1)), new=analysis("- без пометки\n", head="## 7. Что не проверено")))

    def overdue(text, today, want_first, want_line=None):
        def fn():
            proc = check(fresh(files(oq_text=text)), "--overdue", "--today", today)
            lines = proc.out.splitlines()
            assert proc.returncode == 0 and lines and lines[0] == want_first, (proc.returncode, proc.out)
            if want_line:
                assert stlib.has_line(proc, want_line), proc.out
        return fn

    pr.probe("красная", "--overdue: просроченный пункт — число и список",
             overdue(oq(item(1), item(2, "- закрыто: слово владельца, 2026-10-20")), "2026-11-16", "просрочено: 1",
                     "#1 Цели в /crew — срок 2026-11-15"))
    pr.probe("красная", "--overdue: до срока — ноль", overdue(oq(item(1)), "2026-11-15", "просрочено: 0"))
    pr.probe("красная", "--overdue: продлённый, закрытый и с умолчанием не просрочены",
             overdue(oq(item(1, "- продлено: до 2026-12-01"), item(2, "- закрыто: норма, 2026-10-20"),
                        item(3, "- применено умолчание: не показывать (2026-11-16)")), "2026-11-20", "просрочено: 0"))
    pr.probe("мишень", "нет ни файла, ни папки задач — мишень потеряна",
             lambda: stlib.expect(check(fresh({"a.txt": "x\n"})), 1, "FAIL: мишень потеряна"))
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
