# -*- coding: utf-8 -*-
"""Самотест стража форматов документов задач check-task-docs.py.

Зачем: статус и итог захода читает программа цикла; испорченная первая строка не видна в обзоре, а
    последствия (проверка заново поверх утверждённого документа) дороги.
Проверяет: правильные файлы всех четырёх видов проверки, spec.md и plan.md зелёные; красные —
    чужая первая строка статуса, заход без чисел, номер захода не равен номеру в имени, повторный
    REQ, AC, DNC в начале строки; упоминание номера не в начале строки и вложенные папки не судятся.
Не проверяет: содержание документов.
Правило: doc/canon/process.md (цикл сессий методики); AC-14 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

GOOD_REVIEW = "Заход %d: существенных 1, поверхностных 2, проб 3\n\nтекст\n"


def main():
    pr = stlib.Probes("check-task-docs")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-task-docs.py", repo, env, *args)

    good = {
        "doc/tasks/001-x/spec.md": "Статус: черновик\n\nREQ-01 a\nREQ-02 b\nAC-01 c\nDNC-01 d\n",
        "doc/tasks/001-x/plan.md": "Статус: утверждено, 2026-10-08, владелец\nБаза: ревизия abc, дата\n",
        "doc/tasks/001-x/spec-review-4.md": GOOD_REVIEW % 4,
        "doc/tasks/001-x/plan-review-2.md": GOOD_REVIEW % 2,
        "doc/tasks/001-x/review-3.md": GOOD_REVIEW % 3,
        "doc/tasks/001-x/delivery-review-1.md": GOOD_REVIEW % 1,
    }

    def red(change, rule, where, count=1):
        def fn():
            files = dict(good)
            files.update(change)
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-task-docs: %d нарушений" % count)
            assert stlib.has_line(proc, "FAIL %s: %s:" % (where, rule)), proc.out
        return fn

    def legit_all_kinds():
        stlib.expect(check(fresh(good)), 0, "ок: осмотрено 6 файлов задач")

    def legit_bom_crlf_and_extra():
        files = dict(good)
        files["doc/tasks/001-x/spec.md"] = b"\xef\xbb\xbf\xd0\xa1\xd1\x82\xd0\xb0\xd1\x82\xd1\x83\xd1\x81: \xd1\x87\xd0\xb5\xd1\x80\xd0\xbd\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xba\r\nREQ-01 a\r\n"
        files["doc/tasks/001-x/task/spec.md"] = "not judged: nested folder\n"
        files["doc/tasks/001-x/result.md"] = "Статус: в работе\n"
        files["doc/tasks/001-x/notes-review-9.md"] = "free text\n"
        proc = check(fresh(files))
        stlib.expect(proc, 0, "ок: осмотрено 6 файлов задач")

    def legit_id_mentions_not_at_line_start():
        files = dict(good)
        files["doc/tasks/001-x/spec.md"] = "Статус: черновик\n\nREQ-01 a\nsee REQ-01 and\n| REQ-01 | table |\n  REQ-01 indented\n"
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 6 файлов задач")

    def commit_mode_only_changed():
        repo = fresh(good)
        sha = stlib.commit_file(repo, env, "doc/tasks/001-x/plan-review-3.md", "no numbers here\n", "bad")
        stlib.expect(check(repo, "--commit", sha), 1, "FAIL: check-task-docs: 1 нарушений")
        sha2 = stlib.commit_file(repo, env, "other.txt", "x\n", "other")
        stlib.expect(check(repo, "--commit", sha2), 0, "судить нечего: коммит не меняет файлов этой мишени")

    def no_task_docs():
        stlib.expect(check(fresh({"README.md": "x\n"})), 1, "FAIL: мишень потеряна")

    def empty_repo():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "все четыре вида проверки, spec.md и plan.md", legit_all_kinds)
    pr.probe("законное", "BOM и CRLF в первой строке, вложенные папки и чужие имена не судятся", legit_bom_crlf_and_extra)
    pr.probe("законное", "номер не в начале строки не считается объявлением", legit_id_mentions_not_at_line_start)
    pr.probe("законное", "режим коммита: только изменённые файлы", commit_mode_only_changed)
    pr.probe("красная", "первая строка spec.md — чужая", red({"doc/tasks/001-x/spec.md": "Status: draft\n"}, "task-status", "doc/tasks/001-x/spec.md:1"))
    pr.probe("красная", "статус plan.md «в работе»", red({"doc/tasks/001-x/plan.md": "Статус: в работе\n"}, "task-status", "doc/tasks/001-x/plan.md:1"))
    pr.probe("красная", "заход без чисел", red({"doc/tasks/001-x/spec-review-4.md": "Заход 4: существенных нет\n"}, "review-line", "doc/tasks/001-x/spec-review-4.md:1"))
    pr.probe("красная", "номер захода не равен номеру в имени", red({"doc/tasks/001-x/review-3.md": GOOD_REVIEW % 5}, "review-line", "doc/tasks/001-x/review-3.md:1"))
    pr.probe("красная", "delivery-review без итоговой строки", red({"doc/tasks/001-x/delivery-review-1.md": "\n" + GOOD_REVIEW % 1}, "review-line", "doc/tasks/001-x/delivery-review-1.md:1"))
    pr.probe("красная", "повторный REQ", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nREQ-05 a\nREQ-05 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("красная", "повторный AC", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nAC-01 a\nAC-01 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("красная", "повторный DNC", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nDNC-02 a\nDNC-02 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("иной-синтаксис", "строка статуса с регистром не в начале", red({"doc/tasks/001-x/plan.md": " Статус: утверждено\n"}, "task-status", "doc/tasks/001-x/plan.md:1"))
    pr.probe("иной-синтаксис", "пустой файл spec.md", red({"doc/tasks/001-x/spec.md": ""}, "task-status", "doc/tasks/001-x/spec.md:1"))
    pr.probe("мишень", "нет документов задач — мишень потеряна", no_task_docs)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_repo)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
