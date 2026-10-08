# -*- coding: utf-8 -*-
"""Самотест стража запрещённых имён check-private-names.py и загрузчика списка names.py.

Зачем: страж с недоступным списком, который молча печатает «ок», хуже его отсутствия: четыре недели
    список с концами строк CRLF не находил ни одного имени. Здесь каждый случай отсутствия списка
    красный, а значения из списка нигде не печатаются.
Проверяет: образец в строке и в пути файла (без учёта регистра, кириллица), номера образцов, список
    с CRLF, BOM и комментариями, секрет из переменной сильнее файла, четыре случая отсутствия списка
    (нет файла, нет секрета, пуст, нет интерпретатора), UTF-16, режимы индекса и коммита, поиск
    значения в выводе с положительным контролем.
Не проверяет: сообщения коммитов (test-guard-commit-message.py); журнал CI (проба AC-31 в CI).
Правило: AGENTS.md п.15, ADR-0006; AC-03, AC-04 задачи.

Список для проб — выдуманный, собирается при прогоне во временной папке.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

RUN_ALL = os.path.join(stlib.GUARDS, "run-all.sh")
P1 = "zorblax" + "-" + "project"
P2 = "Квартал" + "-" + "7"  # кириллический образец


def main():
    pr = stlib.Probes("check-private-names")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env0, files, name="r%d" % counter[0])

    def with_list(patterns, **kw):
        path = stlib.names_file(base, patterns, **kw)
        return dict(env0, CREW_PRIVATE_NAMES_FILE=path)

    def check(repo, env, *args):
        return stlib.guard("check-private-names.py", repo, env, *args)

    def legit_clean():
        repo = fresh({"a.md": "clean text\n", "doc/b.txt": "also clean\n"})
        proc = check(repo, with_list([P1, P2]))
        stlib.expect(proc, 0, "ок: осмотрено 2 файлов")

    def legit_crlf_list():
        repo = fresh({"a.md": "x\nuses " + P1 + " here\n"})
        for crlf in (False, True):
            proc = check(repo, with_list(["# comment", "", P2, P1], crlf=crlf))
            stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")
            assert stlib.has_line(proc, "FAIL a.md:2: forbidden-name: образец №2"), proc.out
            assert P1 not in proc.out and P2 not in proc.out, "значение напечатано"

    def legit_bom_list():
        repo = fresh({"a.md": "uses " + P1 + "\n"})
        path = os.path.join(base, "bom.txt")
        with open(path, "wb") as handle:
            handle.write(b"\xef\xbb\xbf" + (P1 + "\n").encode())
        proc = check(repo, dict(env0, CREW_PRIVATE_NAMES_FILE=path))
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")

    def legit_env_wins():
        repo = fresh({"a.md": "has " + P1 + "\n"})
        env = dict(with_list(["no-such-name-here"]), CREW_PRIVATE_NAMES="# c\n" + P1 + "\n")
        proc = check(repo, env)
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")
        assert stlib.has_line(proc, "образец №1"), proc.out

    def legit_env_multiline_crlf():
        repo = fresh({"a.md": "has " + P2 + "\n"})
        env = dict(env0, CREW_PRIVATE_NAMES=P1 + "\r\n" + P2 + "\r\n")
        proc = check(repo, env)
        assert stlib.has_line(proc, "FAIL a.md:1: forbidden-name: образец №2"), proc.out

    def red_case_insensitive_cyrillic():
        repo = fresh({"a.md": "text " + P2.upper() + " end\n"})
        proc = check(repo, with_list([P2.lower()]))
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")

    def red_file_without_extension_and_task_folder():
        repo = fresh({"hooks/pre": "echo " + P1 + "\n", "doc/tasks/009-x/task/m.txt": P1 + "\n"})
        proc = check(repo, with_list([P1]))
        stlib.expect(proc, 1, "FAIL: check-private-names: 2 нарушений")

    def red_in_path():
        repo = fresh({"docs/" + P1 + "-notes.md": "clean\n"})
        proc = check(repo, with_list([P1]))
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")
        assert "путь файла содержит образец №1" in proc.out, proc.out
        assert P1 not in proc.out and "docs/***-notes.md" in proc.out, proc.out

    def png_not_judged():
        repo = fresh({"img.png": P1.encode(), "t.md": "ok\n"})
        proc = check(repo, with_list([P1]))
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")

    def index_mode_sees_index_only():
        repo = fresh({"a.md": "clean\n"})
        stlib.write_files(repo, {"a.md": "dirty " + P1 + "\n"})
        proc = check(repo, with_list([P1]), "--index")
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")
        stlib.git(repo, env0, "add", "--", "a.md")
        proc = check(repo, with_list([P1]), "--index")
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")

    def commit_mode():
        repo = fresh({"a.md": "clean\n"})
        sha = stlib.commit_file(repo, env0, "b.md", "has " + P1 + "\n", "bad")
        proc = check(repo, with_list([P1]), "--commit", sha)
        stlib.expect(proc, 1, "FAIL: check-private-names: 1 нарушений")
        old = stlib.git(repo, env0, "rev-parse", "HEAD~1").out.strip()
        proc = check(repo, with_list([P1]), "--commit", old)
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")

    def red_no_file():
        repo = fresh({"a.md": "x\n"})
        env = dict(env0, CREW_PRIVATE_NAMES_FILE=os.path.join(base, "нет-такого-файла.txt"))
        proc = check(repo, env)
        stlib.expect(proc, 1, "FAIL: предпосылка")
        assert "CREW_PRIVATE_NAMES" in proc.out, "нет подсказки, как завести список"

    def red_empty_secret():
        repo = fresh({"a.md": "x\n"})
        env = dict(env0, CREW_PRIVATE_NAMES="", CREW_PRIVATE_NAMES_FILE=os.path.join(base, "none.txt"))
        proc = check(repo, env)
        stlib.expect(proc, 1, "FAIL: предпосылка")
        assert "пусты" in proc.out and "CREW_PRIVATE_NAMES" in proc.out

    def red_empty_list():
        repo = fresh({"a.md": "x\n"})
        proc = check(repo, with_list(["# only a comment", "", "   "]))
        stlib.expect(proc, 1, "FAIL: предпосылка")
        assert "пуст" in proc.out

    def red_utf16_list():
        repo = fresh({"a.md": "x\n"})
        path = os.path.join(base, "u16.txt")
        with open(path, "wb") as handle:
            handle.write((P1 + "\n").encode("utf-16"))
        proc = check(repo, dict(env0, CREW_PRIVATE_NAMES_FILE=path))
        stlib.expect(proc, 1, "FAIL: предпосылка")
        assert "UTF-16" in proc.out

    def red_no_interpreter():
        repo = fresh({"a.md": "x\n"})
        env = dict(with_list([P1]), GUARDS_PYTHON_CANDIDATES="no-such-python")
        proc = stlib.run(("sh", RUN_ALL), cwd=repo, env=env)
        assert proc.returncode == 1 and "Python" in proc.err, (proc.out, proc.err)

    def empty_repo_target_lost():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env0, "init", "-q")
        proc = check(repo, with_list([P1]))
        stlib.expect(proc, 1, "FAIL: мишень потеряна")

    def positive_control_in_output():
        # поиск значения в выводе: 0 совпадений, при том что известная строка того же вывода находится
        repo = fresh({"a.md": "x " + P1 + " y\n", "b.md": "z " + P2 + "\n"})
        proc = check(repo, with_list([P1, P2]))
        assert "FAIL a.md:1" in proc.out, "положительный контроль не найден"
        assert proc.out.count(P1) == 0 and proc.out.count(P2) == 0 and proc.err.count(P1) == 0

    pr.probe("законное", "чистый репозиторий — ок с числом файлов", legit_clean)
    pr.probe("законное", "список с LF и CRLF, комментарии и пустые строки; значение не печатается", legit_crlf_list)
    pr.probe("законное", "список с BOM", legit_bom_list)
    pr.probe("законное", "переменная окружения сильнее файла", legit_env_wins)
    pr.probe("законное", "секрет из переменной с CRLF, номер образца", legit_env_multiline_crlf)
    pr.probe("законное", "png из списка бинарных не судится", png_not_judged)
    pr.probe("законное", "индекс: правка рабочей копии не видна, добавленная видна", index_mode_sees_index_only)
    pr.probe("законное", "режим коммита", commit_mode)
    pr.probe("красная", "образец без учёта регистра, кириллица", red_case_insensitive_cyrillic)
    pr.probe("красная", "файл без расширения и материал папки задачи", red_file_without_extension_and_task_folder)
    pr.probe("красная", "образец в пути файла", red_in_path)
    pr.probe("красная", "поиск значения в выводе: 0 с положительным контролем", positive_control_in_output)
    pr.probe("иной-синтаксис", "нет файла списка — красный с подсказкой", red_no_file)
    pr.probe("иной-синтаксис", "секрет пуст — красный", red_empty_secret)
    pr.probe("иной-синтаксис", "список из одних комментариев — красный", red_empty_list)
    pr.probe("иной-синтаксис", "список в UTF-16 — красный", red_utf16_list)
    pr.probe("мишень", "нет рабочего интерпретатора — красный с подсказкой", red_no_interpreter)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_repo_target_lost)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
