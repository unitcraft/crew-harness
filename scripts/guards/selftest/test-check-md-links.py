# -*- coding: utf-8 -*-
"""Самотест стража ссылок и якорей check-md-links.py.

Зачем: битая ссылка в документе Канона или задачи не видна, пока по ней не пойдёшь; страж, который
    принимает цель по наличию файла в рабочей копии, а не в коммите, пропустил бы ссылку на файл,
    которого нет в истории.
Проверяет: существующие файлы, папки и якоря (повторы с суффиксом, кириллица, setext, HTML-якоря)
    зелёные; несуществующий файл, ссылка за корень, пустая цель, несуществующий якорь красные;
    ссылка внутри блока кода и встроенного кода не ссылка; пометка с причиной снимает ссылку и
    печатает причину, без причины красная; цель судится по источнику (файл вне индекса — нет файла).
Не проверяет: внешние адреса, ссылки-определения, якоря не-.md.
Правило: ADR-0001 (Канон ссылками), AC-06 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

import importlib.util  # noqa: E402

ALLOW = "guard-" + "allow"
spec = importlib.util.spec_from_file_location("check_md_links", os.path.join(stlib.GUARDS, "check-md-links.py"))
mdl = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(mdl)
except BaseException:  # заглушка стража может завершить процесс при загрузке: проба тогда должна упасть
    mdl = None
TICK = "`"


def main():
    pr = stlib.Probes("check-md-links")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-md-links.py", repo, env, *args)

    def red(files, rule, where, count=1):
        def fn():
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-md-links: %d нарушений" % count)
            assert stlib.has_line(proc, "FAIL %s: %s:" % (where, rule)), proc.out
        return fn

    def green(files, count):
        def fn():
            stlib.expect(check(fresh(files)), 0, "ок: осмотрено %d ссылок" % count)
        return fn

    docs = {
        "README.md": "# Title\n\nSee [a](doc/a.md), [dir](doc/), [dir2](doc), [anchor](doc/a.md#second-part).\n",
        "doc/a.md": "# A\n\n## Second part\n\n## Repeat\n\n## Repeat\n\nback [up](../README.md#title)\n",
    }

    def slug_unit():
        cases = {
            "Hello, World!": "hello-world", "foo_bar": "foo_bar", "1. Step": "1-step",
            "Привет мир": "привет-мир",
            TICK + "code" + TICK + " thing": "code-thing", "A — B": "a--b",
            "Link [text](x.md) here": "link-text-here", "  Trim  ": "trim", "What?": "what",
        }
        for heading, want in cases.items():
            got = mdl.github_slug(heading)
            assert got == want, "%r -> %r, ждали %r" % (heading, got, want)

    def anchors_unit():
        text = "# A\n\n## A\n\n### A\n\nSetext one\n==========\n\nSetext two\n---------\n" \
               + TICK * 3 + "\n# not a heading\n" + TICK * 3 + "\n<a id=\"manual\"></a>\n"
        got = mdl.heading_anchors(text)
        for want in ("a", "a-1", "a-2", "setext-one", "setext-two", "manual"):
            assert want in got, (want, sorted(got))
        assert "not-a-heading" not in got

    def legit_files_dirs_anchors():
        proc = check(fresh(docs))
        stlib.expect(proc, 0, "ок: осмотрено 5 ссылок")

    def legit_repeat_cyrillic_setext_html():
        files = {"a.md": "[x](b.md#repeat-1) [y](b.md#%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82) [z](b.md#setext) [h](b.md#manual-id) [s](#self)\n\n# Self\n",
                 "b.md": "# Repeat\n\n## Repeat\n\n# Привет\n\nSetext\n===\n\n<a name=\"manual-id\"></a>\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 5 ссылок")

    def legit_title_angle_space():
        files = {"a.md": "[t](b.md \"a title\") [u](<my file.md>) [v](my%20file.md) [w](/b.md)\n",
                 "b.md": "x\n", "my file.md": "y\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 4 ссылок")

    def legit_external_skipped():
        files = {"a.md": "[x](https://example.test/a.md) [m](mailto:a@b.test) [p](//cdn.test/x) [real](b.md)\n", "b.md": "x\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 1 ссылок")

    def legit_code_is_not_a_link():
        fence = TICK * 3
        files = {"a.md": "real [x](b.md)\n\n" + fence + "\nbroken [y](nope.md)\n" + fence + "\n\ninline " + TICK + "[z](nope2.md)" + TICK
                 + " and ~~~\n\n~~~\n[w](nope3.md)\n~~~\n", "b.md": "x\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 1 ссылок")

    def legit_unpaired_tick_does_not_hide():
        files = {"a.md": "one stray " + TICK + " tick\n\nbroken [y](nope.md)\n\nanother " + TICK + " here\n", "b.md": "x\n"}
        stlib.expect(check(fresh(files)), 1, "FAIL: check-md-links: 1 нарушений")

    def legit_allow_with_reason():
        files = {"a.md": "quote [y](nope.md) <!-- %s(md-link): quoted from an old record -->\n" % ALLOW}
        proc = check(fresh(files))
        stlib.expect(proc, 0, "ок: осмотрено 1 ссылок")
        assert stlib.has_line(proc, "принято a.md:1: md-link: quoted from an old record"), proc.out

    def allow_without_reason():
        files = {"a.md": "quote [y](nope.md) <!-- %s(md-link): -->\n" % ALLOW}
        proc = check(fresh(files))
        stlib.expect(proc, 1, "FAIL: check-md-links: 1 нарушений")
        assert stlib.has_line(proc, "пометка без причины"), proc.out

    def allow_anchor_rule_separate():
        files = {"a.md": "[y](b.md#nope) [z](gone.md) <!-- %s(md-anchor): old heading -->\n" % ALLOW, "b.md": "# B\n"}
        proc = check(fresh(files))
        stlib.expect(proc, 1, "FAIL: check-md-links: 1 нарушений")
        assert stlib.has_line(proc, "md-link: цель ссылки не найдена: gone.md"), proc.out

    def untracked_target_is_missing():
        repo = fresh({"a.md": "[x](b.md)\n"})
        stlib.write_files(repo, {"b.md": "exists on disk only\n"})
        stlib.expect(check(repo), 1, "FAIL: check-md-links: 1 нарушений")
        stlib.expect(check(repo, "--index"), 1, "FAIL: check-md-links: 1 нарушений")

    def index_vs_worktree():
        repo = fresh({"a.md": "[x](b.md)\n", "b.md": "x\n"})
        stlib.write_files(repo, {"a.md": "[x](gone.md)\n"})
        stlib.expect(check(repo, "--index"), 0, "ок: осмотрено 1 ссылок")
        stlib.git(repo, env, "add", "--", "a.md")
        stlib.expect(check(repo, "--index"), 1, "FAIL: check-md-links: 1 нарушений")

    def commit_mode_sees_commit_tree():
        repo = fresh({"a.md": "[x](b.md)\n", "b.md": "x\n"})
        sha = stlib.commit_file(repo, env, "c.md", "[x](b.md) [y](gone.md)\n", "c")
        stlib.expect(check(repo, "--commit", sha), 1, "FAIL: check-md-links: 1 нарушений")

    def cyrillic_names():
        name = "doc/заметка один.md"
        files = {"a.md": "[x](<%s>) [y](%s)\n" % (name, name.replace(" ", "%20")), name: "# Тест\n"}
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 2 ссылок")

    def no_md_target_lost():
        stlib.expect(check(fresh({"a.txt": "[x](nope.md)\n"})), 1, "FAIL: мишень потеряна")

    def md_without_links():
        stlib.expect(check(fresh({"a.md": "no links here\n"})), 0, "судить нечего: нет относительных ссылок в .md")

    def empty_repo():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "файлы, папки (с косой и без), якоря и ссылка вверх", legit_files_dirs_anchors)
    pr.probe("законное", "повторы с суффиксом, кириллица в процентной записи, setext, id и name", legit_repeat_cyrillic_setext_html)
    pr.probe("законное", "заголовок в кавычках, угловые скобки, %20, корневая ссылка", legit_title_angle_space)
    pr.probe("законное", "внешние адреса не судятся", legit_external_skipped)
    pr.probe("законное", "ссылка в блоке кода и во встроенном коде — не ссылка", legit_code_is_not_a_link)
    pr.probe("законное", "пометка с причиной: зелёный, причина напечатана", legit_allow_with_reason)
    pr.probe("законное", "кириллическое имя файла", cyrillic_names)
    pr.probe("законное", "якорь GitHub: что остаётся от заголовка", slug_unit)
    pr.probe("законное", "якоря файла: повторы, setext, код, HTML", anchors_unit)
    pr.probe("законное", "индекс: правка рабочей копии не видна, добавленная видна", index_vs_worktree)
    pr.probe("красная", "несуществующий файл", red({"a.md": "x\n[y](gone.md)\n"}, "md-link", "a.md:2"))
    pr.probe("красная", "ссылка за корень", red({"d/a.md": "[y](../../etc/x.md)\n"}, "md-link", "d/a.md:1"))
    pr.probe("красная", "пустая цель", red({"a.md": "[y]()\n"}, "md-link", "a.md:1"))
    pr.probe("красная", "несуществующий якорь", red({"a.md": "[y](b.md#nope)\n", "b.md": "# B\n"}, "md-anchor", "a.md:1"))
    pr.probe("красная", "несуществующий якорь в том же файле", red({"a.md": "# A\n[y](#nope)\n"}, "md-anchor", "a.md:2"))
    pr.probe("красная", "папка, которой нет", red({"a.md": "[y](nodir/)\n", "b/c.md": "x\n"}, "md-link", "a.md:1"))
    pr.probe("красная", "пометка без причины", allow_without_reason)
    pr.probe("красная", "режим коммита судит дерево коммита", commit_mode_sees_commit_tree)
    pr.probe("иной-синтаксис", "пометка якоря не снимает ссылку на файл", allow_anchor_rule_separate)
    pr.probe("иной-синтаксис", "файл существует в рабочей копии, но не отслеживается", untracked_target_is_missing)
    pr.probe("иной-синтаксис", "непарный знак кода не прячет ссылку", legit_unpaired_tick_does_not_hide)
    pr.probe("мишень", "нет ни одного .md — мишень потеряна", no_md_target_lost)
    pr.probe("мишень", ".md без ссылок — судить нечего", md_without_links)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_repo)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
