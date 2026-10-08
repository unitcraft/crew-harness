# -*- coding: utf-8 -*-
"""Самотест библиотеки стражей guardlib: источники, охват файлов, пометки, формы вердикта.

Зачем: на библиотеке стоят все стражи; ошибка в ней (пропущенный файл, перепутанный индекс и
    рабочая копия) молча сделала бы зелёными их всех.
Проверяет: Source в трёх режимах (в том числе кириллический путь и временный индекс), judged_files
    (бинарные расширения, подмодуль, файл без расширения), пометки с причиной и без, четыре вердикта.
Не проверяет: конкретные стражи; запуск общим скриптом (его проверяет test-run-all.py).
Правило: AGENTS.md п.8 (проверки до пуша), контракт вердиктов REQ-35.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

import guardlib  # noqa: E402  (stlib добавил lib в путь)

ALLOW = "guard-" + "allow"
FIXTURE = "guard-" + "fixture"


def main():
    pr = stlib.Probes("guardlib")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    cyr = "doc/файл один.md"
    files = {
        "a.txt": "line one\n",
        cyr: "text\n",
        "noext": "plain\n",
        "x.weird": "data\n",
        "pic.png": b"\x00\x01\x02binary",
    }
    repo = stlib.make_repo(base, env, files)

    def legit_source_tree():
        with stlib.patched_environ(env):
            src = guardlib.Source(repo, "tree")
            paths = src.paths()
            assert cyr in paths, "кириллический путь потерян: %r" % sorted(paths)
            entry = [e for e in src.entries() if e.path == cyr][0]
            assert src.read(entry) == b"text\n"
            src.close()

    def legit_judged():
        with stlib.patched_environ(env):
            src = guardlib.Source(repo, "tree")
            views, count = guardlib.judged_files(src)
            names = sorted(v.path for v in views)
            assert "pic.png" not in names, "png из списка бинарных судится"
            assert "noext" in names and "x.weird" in names, names
            assert count == len(names) == 4, (count, names)
            src.close()

    def legit_exts_nul_noext():
        # файл без расширения с NUL не исключается списком
        repo2 = stlib.make_repo(base, env, {"hook": b"a\x00b", "z.png": b"\x00"}, name="repo2")
        with stlib.patched_environ(env):
            src = guardlib.Source(repo2, "tree")
            views, count = guardlib.judged_files(src)
            assert [v.path for v in views] == ["hook"], [v.path for v in views]
            src.close()

    def index_vs_tree():
        stlib.write_files(repo, {"a.txt": "edited in tree only\n"})
        with stlib.patched_environ(env):
            tree = guardlib.Source(repo, "tree")
            index = guardlib.Source(repo, "index")
            e_tree = [e for e in tree.entries() if e.path == "a.txt"][0]
            e_index = [e for e in index.entries() if e.path == "a.txt"][0]
            assert tree.read(e_tree) == b"edited in tree only\n"
            assert index.read(e_index) == b"line one\n", "индекс показал рабочую копию"
            tree.close()
            index.close()
        stlib.git(repo, env, "checkout", "--", "a.txt")

    def temp_index_respected():
        # --only: git подставляет временный индекс через GIT_INDEX_FILE; вызовы его соблюдают
        alt = os.path.join(base, "alt-index")
        env2 = dict(env, GIT_INDEX_FILE=alt)
        stlib.git(repo, env2, "read-tree", "HEAD")
        stlib.write_files(repo, {"only.txt": "only in alt\n"})
        stlib.git(repo, env2, "add", "--", "only.txt")
        with stlib.patched_environ(env2):
            idx = guardlib.Source(repo, "index")
            assert "only.txt" in idx.paths(), "временный индекс не виден"
            idx.close()
        with stlib.patched_environ(env):
            idx = guardlib.Source(repo, "index")
            assert "only.txt" not in idx.paths(), "общий индекс подменён"
            idx.close()
        os.remove(os.path.join(repo, "only.txt"))

    def commit_mode():
        sha = stlib.commit_file(repo, env, "b.txt", "new\n", "second")
        with stlib.patched_environ(env):
            src = guardlib.Source(repo, "commit", sha)
            changed = [e.path for e in src.changed()]
            assert changed == ["b.txt"], changed
            assert "a.txt" in src.paths(), "дерево коммита неполное"
            src.close()
            root_sha = stlib.git(repo, env, "rev-list", "--max-parents=0", "HEAD").out.strip()
            src = guardlib.Source(repo, "commit", root_sha)
            assert len(src.changed()) == len(files), "корневой коммит: изменены все файлы"
            src.close()

    def merge_commit():
        stlib.git(repo, env, "checkout", "-q", "-b", "side")
        stlib.commit_file(repo, env, "side.txt", "s\n", "side")
        stlib.git(repo, env, "checkout", "-q", "main")
        stlib.commit_file(repo, env, "main.txt", "m\n", "main")
        stlib.git(repo, env, "merge", "-q", "--no-ff", "-m", "merge", "side")
        sha = stlib.git(repo, env, "rev-parse", "HEAD").out.strip()
        with stlib.patched_environ(env):
            src = guardlib.Source(repo, "commit", sha)
            changed = sorted(e.path for e in src.changed())
            assert changed == ["main.txt", "side.txt"], changed
            src.close()

    def gitlink_counted():
        repo3 = stlib.make_repo(base, env, {"f.txt": "x\n"}, name="repo3")
        oid = stlib.git(repo3, env, "rev-parse", "HEAD").out.strip()
        stlib.git(repo3, env, "update-index", "--add", "--cacheinfo", "160000,%s,sub" % oid)
        with stlib.patched_environ(env):
            src = guardlib.Source(repo3, "index")
            views, count = guardlib.judged_files(src)
            assert count == 2 and [v.path for v in views] == ["f.txt"], (count, views)
            src.close()

    def markers_with_reason():
        rep = guardlib.Report()
        view = guardlib.FileView("m.md", ("bad # %s(md-link): quoted old text\nbad\n" % ALLOW).encode())
        view.report(rep, "md-link", 1, "desc")
        view.report(rep, "md-link", 2, "desc")
        assert [x[1] for x in rep.findings] == [2], rep.findings
        assert rep.accepted == [("m.md", 1, "md-link", "quoted old text")], rep.accepted
        assert "принято m.md:1: md-link: quoted old text" in rep.lines()

    def marker_other_rule_does_not_help():
        rep = guardlib.Report()
        view = guardlib.FileView("m.md", ("x %s(fffd): reason\n" % ALLOW).encode())
        view.report(rep, "md-link", 1, "desc")
        assert len(rep.findings) == 1

    def marker_without_reason_is_red():
        rep = guardlib.Report()
        view = guardlib.FileView("m.md", ("x %s(md-link):   \n" % ALLOW).encode())
        view.report(rep, "md-link", 1, "desc")
        assert rep.findings and "пометка без причины" in rep.findings[0][3], rep.findings

    def marker_comment_end_is_not_a_reason():
        rep = guardlib.Report()
        text = "x <!-- %s(md-link): -->\nx /* %s(md-link): cut */\n" % (ALLOW, ALLOW)
        view = guardlib.FileView("m.md", text.encode())
        view.report(rep, "md-link", 1, "desc")
        view.report(rep, "md-link", 2, "desc")
        assert [x[1] for x in rep.findings] == [1], rep.findings
        assert rep.accepted == [("m.md", 2, "md-link", "cut")], rep.accepted

    def fixture_whole_file():
        rep = guardlib.Report()
        view = guardlib.FileView("f.bin", ("# %s(nul): byte is the subject\nrow\n" % FIXTURE).encode())
        view.report(rep, "nul", None, "desc")
        view.report(rep, "bom", None, "desc")
        assert [x[2] for x in rep.findings] == ["bom"], rep.findings
        assert [x[2] for x in rep.accepted] == ["nul"]

    def four_verdicts():
        assert guardlib.ok(5, "файлов") == "ок: осмотрено 5 файлов"
        assert guardlib.nothing_to_judge("индекс пуст") == "судить нечего: индекс пуст"
        assert guardlib.skipped("нет git") == "пропущено: нет git"
        assert guardlib.fail("check-x", 2) == "FAIL: check-x: 2 нарушений"
        assert guardlib.no_target("нет файлов").startswith("FAIL: мишень потеряна")

    def run_green_and_red():
        with stlib.patched_environ(env):
            code, out = stlib.captured(guardlib.run, "check-x", "файлов",
                                       lambda s, a, r: 3, ["--root", repo])
            assert code == 0 and out.splitlines()[-1] == "ок: осмотрено 3 файлов", (code, out)

            def judge(src, args, rep):
                rep.add("a.txt", 4, "rule-x", "описание")
                return 1
            code, out = stlib.captured(guardlib.run, "check-x", "файлов", judge, ["--root", repo])
            lines = out.splitlines()
            assert code == 1 and lines[-2] == "FAIL a.txt:4: rule-x: описание", out
            assert lines[-1] == "FAIL: check-x: 1 нарушений"

    def run_nothing_and_skip():
        with stlib.patched_environ(env):
            code, out = stlib.captured(guardlib.run, "g", "x",
                                       lambda s, a, r: guardlib.Outcome(nothing="индекс пуст"),
                                       ["--root", repo])
            assert code == 0 and out.strip() == "судить нечего: индекс пуст", out
            code, out = stlib.captured(guardlib.run, "g", "x",
                                       lambda s, a, r: guardlib.Outcome(skip="нет инструмента"),
                                       ["--root", repo])
            assert code == 0 and out.strip() == "пропущено: нет инструмента", out

    def target_lost_on_empty():
        empty = os.path.join(base, "empty")
        os.makedirs(empty)
        stlib.git(empty, env, "init", "-q")
        with stlib.patched_environ(env):
            code, out = stlib.captured(guardlib.run, "g", "x",
                                       lambda s, a, r: guardlib.judged_files(s)[1], ["--root", empty])
            assert code == 1 and out.startswith("FAIL: мишень потеряна"), (code, out)

    def no_git_is_red():
        plain = os.path.join(base, "plain")
        os.makedirs(plain)
        with stlib.patched_environ(env):
            code, out = stlib.captured(guardlib.run, "g", "x", lambda s, a, r: 1, ["--root", plain])
            assert code == 1 and out.startswith("FAIL: предпосылка"), (code, out)

    def subfolder_is_not_root():
        sub = os.path.join(repo, "doc")
        with stlib.patched_environ(env):
            code, out = stlib.captured(guardlib.run, "g", "x", lambda s, a, r: 1, ["--root", sub])
            assert code == 1 and "не корень репозитория" in out, (code, out)

    pr.probe("законное", "источник рабочей копии, кириллический путь", legit_source_tree)
    pr.probe("законное", "охват: png из списка не судится, без расширения и .weird судятся", legit_judged)
    pr.probe("законное", "файл без расширения с NUL судится, png с NUL нет", legit_exts_nul_noext)
    pr.probe("законное", "индекс не видит правки рабочей копии", index_vs_tree)
    pr.probe("законное", "временный индекс GIT_INDEX_FILE соблюдается", temp_index_respected)
    pr.probe("законное", "режим коммита: только изменённые, корневой и слияние", commit_mode)
    pr.probe("законное", "коммит слияния: файлы обеих сторон", merge_commit)
    pr.probe("законное", "подмодуль 160000 учтён в числе, не читается", gitlink_counted)
    pr.probe("законное", "четыре формы вердикта", four_verdicts)
    pr.probe("законное", "пометка с причиной снимает нарушение и печатает причину", markers_with_reason)
    pr.probe("законное", "пометка файла-фикстуры снимает только своё правило", fixture_whole_file)
    pr.probe("законное", "запуск: зелёный и красный вердикт, адрес нарушения", run_green_and_red)
    pr.probe("законное", "запуск: судить нечего и пропущено", run_nothing_and_skip)
    pr.probe("красная", "пометка без причины — красный", marker_without_reason_is_red)
    pr.probe("иной-синтаксис", "пометка другого правила не снимает нарушение", marker_other_rule_does_not_help)
    pr.probe("иной-синтаксис", "закрывающий знак комментария — не причина", marker_comment_end_is_not_a_reason)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", target_lost_on_empty)
    pr.probe("мишень", "папка без git — красная предпосылка", no_git_is_red)
    pr.probe("мишень", "подпапка вместо корня — красная предпосылка", subfolder_is_not_root)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
