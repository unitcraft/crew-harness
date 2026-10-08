# -*- coding: utf-8 -*-
"""Самотест стража пустых тестов check-tests-have-checks.py.

Зачем: тест без проверок всегда зелёный; страж должен находить его, не требуя особого стиля
    проверок (в тестах плагина есть и свой вызов cell(, и assert из стандартной библиотеки).
Проверяет: файл с cell( зелёный; файл с assert (без cell() зелёный; файл с литералом true внутри
    cell( не нарушение; пустой файл и файл, где слова проверки только в комментариях, красные;
    служебные .mjs в папке тестов не судятся.
Не проверяет: качество проверок, прогон тестов.
Правило: AGENTS.md п.7, п.8; AC-21 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib


def main():
    pr = stlib.Probes("check-tests-have-checks")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]
    T = "opencode-plugin/test/"

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-tests-have-checks.py", repo, env, *args)

    def legit_two_styles():
        files = {T + "a.test.mjs": "import x from 'y';\ncell('works', () => x());\n",
                 T + "b.test.mjs": "import assert from 'node:assert';\nassert.equal(1, 1);\n",
                 T + "cleanup-tmp.mjs": "// helper, not a test\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 2 файлов тестов")

    def legit_true_literal():
        files = {T + "a.test.mjs": "cell('literal', true);\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 1 файлов тестов")

    def red_empty():
        files = {T + "a.test.mjs": "cell('x', 1);\n", T + "empty.test.mjs": "console.log('hi');\n"}
        proc = check(fresh(files))
        stlib.expect(proc, 1, "FAIL: check-tests-have-checks: 1 нарушений")
        assert stlib.has_line(proc, "FAIL %sempty.test.mjs: empty-test:" % T), proc.out

    def red_comment_only():
        text = "// assert something\n/* cell( not a call */\nconsole.log(1);\n"
        stlib.expect(check(fresh({T + "c.test.mjs": text})), 1, "FAIL: check-tests-have-checks: 1 нарушений")

    def red_zero_byte():
        stlib.expect(check(fresh({T + "z.test.mjs": ""})), 1, "FAIL: check-tests-have-checks: 1 нарушений")

    def similar_words_are_not_checks():
        text = "const assertion = 1; const cellar = 2; cells(3);\n"
        stlib.expect(check(fresh({T + "w.test.mjs": text})), 1, "FAIL: check-tests-have-checks: 1 нарушений")

    def target_lost_no_tests():
        stlib.expect(check(fresh({T + "cleanup-tmp.mjs": "x\n", "a.txt": "x\n"})), 1, "FAIL: мишень потеряна")

    def target_lost_moved():
        stlib.expect(check(fresh({"opencode-plugin/tests/a.test.mjs": "cell('x', 1);\n"})), 1, "FAIL: мишень потеряна")

    def empty_repo():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "cell( и assert, служебный .mjs не судится", legit_two_styles)
    pr.probe("законное", "литерал true в проверке — не нарушение", legit_true_literal)
    pr.probe("красная", "файл без проверок называется по имени", red_empty)
    pr.probe("красная", "слова проверки только в комментариях", red_comment_only)
    pr.probe("иной-синтаксис", "пустой файл", red_zero_byte)
    pr.probe("иной-синтаксис", "похожие слова assertion, cellar, cells( — не проверка", similar_words_are_not_checks)
    pr.probe("мишень", "в папке нет *.test.mjs — мишень потеряна", target_lost_no_tests)
    pr.probe("мишень", "папка тестов переименована — мишень потеряна", target_lost_moved)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_repo)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
