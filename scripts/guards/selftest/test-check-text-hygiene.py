# -*- coding: utf-8 -*-
"""Самотест стража гигиены текста check-text-hygiene.py.

Зачем: порча текста не видна глазами; страж, который не видит NUL, UTF-16 или кракозябры в файле
    без расширения, даёт ложную зелёную картину (так git сам называет такие файлы «бинарными»).
Проверяет: красную пробу на каждое правило (управляющий байт, NUL, UTF-16, кракозябры, U+FFFD, BOM
    UTF-8, смешанные концы строк); то же в файле без расширения, в .log и .gitignore; законное
    (TAB, одиночный CR, файл целиком в CRLF, png из списка бинарных с байтом NUL); пометки с
    причиной на строке и для файла, пометку без причины; режимы индекса и коммита.
Не проверяет: приватность и ссылки (другие стражи).
Правило: ADR-0006; AC-08 задачи.

Образцы порчи собираются при прогоне; в файле самотеста литералов порчи нет.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

ALLOW = "guard-" + "allow"
FIXTURE = "guard-" + "fixture"
CTRL = chr(1)
DEL = chr(127)
FFFD = chr(0xFFFD)
MOJI = chr(0x0402) + chr(0x0453)  # two letters, a trace of UTF-8 read as CP1251
CYR = "привет"


def main():
    pr = stlib.Probes("check-text-hygiene")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-text-hygiene.py", repo, env, *args)

    def red(files, rule, where, count=1):
        def fn():
            repo = fresh(files)
            proc = check(repo)
            stlib.expect(proc, 1, "FAIL: check-text-hygiene: %d нарушений" % count)
            assert stlib.has_line(proc, "FAIL %s: %s:" % (where, rule)), proc.out
        return fn

    def legit_clean():
        repo = fresh({"a.md": "plain\n" + CYR + "\ttab\n", "noext": "x\n", "z.log": "log\n", ".gitignore": "x/\n"})
        stlib.expect(check(repo), 0, "ок: осмотрено 4 файлов")

    def legit_cr_and_crlf_file():
        repo = fresh({"crlf.txt": b"one\r\ntwo\r\nthree", "lone-cr.txt": b"a\rb\n", "lf.txt": b"one\ntwo"})
        stlib.expect(check(repo), 0, "ок: осмотрено 3 файлов")

    def legit_png_with_nul():
        repo = fresh({"p.png": b"\x89PNG\x00\x01", "t.md": "ok\n"})
        stlib.expect(check(repo), 0, "ок: осмотрено 1 файлов")

    def legit_allow_with_reason():
        repo = fresh({"q.md": "quote %s here <!-- %s(fffd): quoted from an old record -->\n" % (FFFD, ALLOW)})
        proc = check(repo)
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")
        assert stlib.has_line(proc, "принято q.md:1: fffd: quoted from an old record"), proc.out

    def legit_fixture_nul():
        repo = fresh({"f.dat": b"# %s(nul): the byte is the subject\n\x00\x00\n" % FIXTURE.encode()})
        proc = check(repo)
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")
        assert stlib.has_line(proc, "принято f.dat:2: nul: the byte is the subject"), proc.out

    def allow_without_reason():
        repo = fresh({"q.md": "x %s <!-- %s(fffd): -->\n" % (FFFD, ALLOW)})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-text-hygiene: 1 нарушений")
        assert stlib.has_line(proc, "пометка без причины"), proc.out

    def allow_other_rule():
        repo = fresh({"q.md": "x %s <!-- %s(mojibake): wrong rule -->\n" % (FFFD, ALLOW)})
        stlib.expect(check(repo), 1, "FAIL: check-text-hygiene: 1 нарушений")

    def fixture_other_rule_does_not_help():
        repo = fresh({"f.dat": b"# %s(bom): other\n\x00\n" % FIXTURE.encode()})
        stlib.expect(check(repo), 1, "FAIL: check-text-hygiene: 1 нарушений")

    def utf16_variants():
        data = "text\n".encode("utf-16")
        repo = fresh({"a.md": data, "noext": data, "b.weird": data})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-text-hygiene: 3 нарушений")
        for name in ("a.md", "noext", "b.weird"):
            assert stlib.has_line(proc, "FAIL %s:1: utf16:" % name), proc.out

    def nul_variants():
        repo = fresh({"hooks/pre-x": b"echo 1\n\x00echo 2\n", "t.txt": b"a\x00b\n", "m.weird": b"\x00"})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-text-hygiene: 3 нарушений")
        assert stlib.has_line(proc, "FAIL hooks/pre-x:2: nul:"), proc.out

    def mixed_eol_line_number():
        repo = fresh({"m.md": b"one\r\ntwo\r\nthree\nfour\r\n"})
        proc = check(repo)
        assert stlib.has_line(proc, "FAIL m.md:3: eol:"), proc.out

    def index_mode():
        repo = fresh({"a.md": "clean\n"})
        stlib.write_files(repo, {"a.md": "dirty " + FFFD + "\n"})
        stlib.expect(check(repo, "--index"), 0, "ок: осмотрено 1 файлов")
        stlib.git(repo, env, "add", "--", "a.md")
        stlib.expect(check(repo, "--index"), 1, "FAIL: check-text-hygiene: 1 нарушений")

    def commit_mode():
        repo = fresh({"a.md": "clean\n"})
        sha = stlib.commit_file(repo, env, "b.md", "bad " + CTRL + "\n", "bad")
        stlib.expect(check(repo, "--commit", sha), 1, "FAIL: check-text-hygiene: 1 нарушений")
        stlib.expect(check(repo, "--commit", "HEAD~1"), 0, "ок: осмотрено 1 файлов")

    def empty_target():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    def only_binary_target_lost():
        repo = fresh({"p.png": b"\x00"})
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "чистые файлы: .md, без расширения, .log, .gitignore", legit_clean)
    pr.probe("законное", "одиночный CR, файл целиком в CRLF, без перевода строки в конце", legit_cr_and_crlf_file)
    pr.probe("законное", "png из списка бинарных с байтом NUL не судится", legit_png_with_nul)
    pr.probe("законное", "пометка на строке с причиной: зелёный, причина напечатана", legit_allow_with_reason)
    pr.probe("законное", "пометка файла-фикстуры с причиной", legit_fixture_nul)
    pr.probe("законное", "индекс: правка рабочей копии не видна, добавленная видна", index_mode)
    pr.probe("законное", "режим коммита", commit_mode)
    pr.probe("красная", "управляющий байт 0x01", red({"a.md": "x" + CTRL + "y\n"}, "control-char", "a.md:1"))
    pr.probe("красная", "управляющий байт 0x7F", red({"a.md": "x" + DEL + "y\n"}, "control-char", "a.md:1"))
    pr.probe("красная", "байт NUL", red({"a.txt": b"a\x00b\n"}, "nul", "a.txt:1"))
    pr.probe("красная", "UTF-16 с BOM", red({"a.md": "x\n".encode("utf-16")}, "utf16", "a.md:1"))
    pr.probe("красная", "подпись кракозябр", red({"a.md": "ok\n" + MOJI + "\n"}, "mojibake", "a.md:2"))
    pr.probe("красная", "символ замены U+FFFD", red({"a.md": "ok " + FFFD + "\n"}, "fffd", "a.md:1"))
    pr.probe("красная", "недопустимый UTF-8", red({"a.md": b"ok \xff\xfe-text\n"}, "fffd", "a.md:1"))
    pr.probe("красная", "BOM UTF-8", red({"a.md": b"\xef\xbb\xbfhello\n"}, "bom", "a.md:1"))
    pr.probe("красная", "смешанные концы строк", red({"a.md": b"a\r\nb\n"}, "eol", "a.md:2"))
    pr.probe("красная", "пометка без причины", allow_without_reason)
    pr.probe("красная", "пометка другого правила не помогает", allow_other_rule)
    pr.probe("красная", "фикстура другого правила не помогает", fixture_other_rule_does_not_help)
    pr.probe("иной-синтаксис", "порча в файле без расширения", red({"hooks/pre": "x" + CTRL + "\n"}, "control-char", "hooks/pre:1"))
    pr.probe("иной-синтаксис", "порча в .log", red({"doc/tasks/1/run.log": "x " + FFFD + "\n"}, "fffd", "doc/tasks/1/run.log:1"))
    pr.probe("иной-синтаксис", "порча в .gitignore", red({".gitignore": "x" + CTRL + "\n"}, "control-char", ".gitignore:1"))
    pr.probe("иной-синтаксис", "UTF-16 без расширения и с неизвестным расширением", utf16_variants)
    pr.probe("иной-синтаксис", "NUL в файле хука, .txt и неизвестном расширении", nul_variants)
    pr.probe("иной-синтаксис", "номер строки при смешанных концах", mixed_eol_line_number)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_target)
    pr.probe("мишень", "остались только бинарные расширения — мишень потеряна", only_binary_target_lost)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
