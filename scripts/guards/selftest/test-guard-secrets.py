# -*- coding: utf-8 -*-
"""Самотест стража секретов и путей машины guard-secrets.py и определения machine_paths.

Зачем: страж стоит на входе в публичную историю; если он промолчит на секрете или пути машины,
    их уже не вычистить, а если ругается на законные образцы, его обходят (--no-verify).
Проверяет: красную пробу на каждое правило в режимах индекса, коммита и дерева; законные
    образцы (общий корень примеров, образцы поиска из правил, тильда, регулярное выражение времени);
    развод правил индекса и дерева; значение секрета нигде не печатается (с положительным контролем).
Не проверяет: имена из списка владельца (test-check-private-names.py), хук pre-commit целиком
    (test-pre-commit.py).
Правило: AGENTS.md п.15, ADR-0006; AC-01, AC-02 задачи.

Все образцы нарушений собираются при прогоне из кусков: в файле самотеста литералов нет.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

import machine_paths  # noqa: E402

GH = "gh" + "p_" + "A1b2C3d4" * 3
GH_PAT = "github" + "_pat_" + "Zy9Xw8Vu7T" * 3
GL = "gl" + "pat-" + "abcdefghij1234567890"
PEM = "-----BEGIN " + "RSA PRIVATE KEY-----"
URL = "https://" + "alice" + ":" + "s3cretpw" + "@" + "example.test/repo"
PASS = "pass" + 'word = "' + "Zx9Qw3Rt" + '"'
CONFLICT = "<" * 7 + " HEAD"
WIN = "E" + ":/" + "Projects" + "/" + "alpha" + "/file.txt"
WIN_BACK = "E" + ":" + chr(92) + "Projects" + chr(92) + "alpha" + chr(92) + "f.txt"
LINUX = "cd /" + "home" + "/" + "alice" + "/src"
MAC = "open /" + "Users" + "/" + "bob" + "/x"


def main():
    pr = stlib.Probes("guard-secrets")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files=None):
        counter[0] += 1
        return stlib.make_repo(base, env, files or {"README.md": "clean\n"}, name="r%d" % counter[0])

    def stage(repo, rel, content):
        stlib.write_files(repo, {rel: content})
        stlib.git(repo, env, "add", "--", rel)

    def index_red(sample, rule, name=None):
        def fn():
            repo = fresh()
            stage(repo, "doc/note.md", "line one\n" + sample + "\nline three\n")
            proc = stlib.guard("guard-secrets.py", repo, env, "--index")
            got = stlib.expect(proc, 1, "FAIL: guard-secrets: 1 нарушений")
            assert stlib.has_line(proc, "FAIL doc/note.md:2: %s:" % rule), proc.out
            assert sample not in proc.out, "значение напечатано"
            assert "doc/note.md:2" in proc.out, "положительный контроль: адрес должен быть в выводе"
        return fn

    def index_green(sample):
        def fn():
            repo = fresh()
            stage(repo, "doc/note.md", "x\n" + sample + "\n")
            proc = stlib.guard("guard-secrets.py", repo, env, "--index")
            stlib.expect(proc, 0, "ок: осмотрено 1 файлов")
        return fn

    def legit_clean_index():
        repo = fresh()
        stage(repo, "new.txt", "just text\n")
        proc = stlib.guard("guard-secrets.py", repo, env, "--index")
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")

    def legit_clean_tree():
        repo = fresh({"a.txt": "x\n", "b.md": "y\n", "img.png": GH.encode()})
        proc = stlib.guard("guard-secrets.py", repo, env, "--tree")
        stlib.expect(proc, 0, "ок: осмотрено 2 файлов")  # png из списка бинарных не судится

    def empty_index():
        repo = fresh()
        proc = stlib.guard("guard-secrets.py", repo, env, "--index")
        stlib.expect(proc, 0, "судить нечего: индекс пуст")

    def tree_token_old_line():
        repo = fresh({"old.txt": "a\n" + GH + "\nb\n"})
        proc = stlib.guard("guard-secrets.py", repo, env, "--tree")
        stlib.expect(proc, 1, "FAIL: guard-secrets")
        assert stlib.has_line(proc, "FAIL old.txt:2: token-github"), proc.out
        assert GH not in proc.out

    def tree_password_green():
        repo = fresh({"t.js": "const " + PASS + ";\n", "c.txt": CONFLICT + "\nx\n"})
        proc = stlib.guard("guard-secrets.py", repo, env, "--tree")
        stlib.expect(proc, 0, "ок: осмотрено 2 файлов")

    def tree_machine_path_red():
        repo = fresh({"p.txt": "see " + WIN + "\n"})
        proc = stlib.guard("guard-secrets.py", repo, env, "--tree")
        stlib.expect(proc, 1, "FAIL: guard-secrets")
        assert stlib.has_line(proc, "FAIL p.txt:1: machine-path"), proc.out

    def commit_mode_red_and_green():
        repo = fresh()
        sha = stlib.commit_file(repo, env, "x/y.txt", "a\n" + PASS + "\n", "bad")
        proc = stlib.guard("guard-secrets.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-secrets: 1 нарушений")
        assert stlib.has_line(proc, "FAIL x/y.txt:2: password-assign"), proc.out
        good = stlib.commit_file(repo, env, "x/z.txt", "fine\n", "good")
        proc = stlib.guard("guard-secrets.py", repo, env, "--commit", good)
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")

    def commit_only_deletion():
        repo = fresh({"a.txt": "x\n", "b.txt": "y\n"})
        stlib.git(repo, env, "rm", "-q", "--", "b.txt")
        stlib.git(repo, env, "commit", "-q", "-m", "delete")
        proc = stlib.guard("guard-secrets.py", repo, env, "--commit", "HEAD")
        stlib.expect(proc, 0, "судить нечего: коммит не добавляет строк")

    def old_lines_not_judged_in_index():
        # в индексе судятся только добавленные строки: старая строка с паролем не краснит
        repo = fresh({"t.js": "const " + PASS + ";\n"})
        stage(repo, "t.js", "const " + PASS + ";\nconst ok = 1;\n")
        proc = stlib.guard("guard-secrets.py", repo, env, "--index")
        stlib.expect(proc, 0, "ок: осмотрено 1 файлов")

    def line_numbers_second_hunk():
        body = "".join("l%d\n" % i for i in range(1, 30))
        repo = fresh({"f.txt": body})
        changed = body.replace("l25\n", "l25\n" + GL + "\n")
        stage(repo, "f.txt", changed)
        proc = stlib.guard("guard-secrets.py", repo, env, "--index")
        assert stlib.has_line(proc, "FAIL f.txt:26: token-gitlab"), proc.out

    def cyrillic_path_and_crlf():
        repo = fresh()
        stage(repo, "doc/\u0437\u0430\u043c\u0435\u0442\u043a\u0430.md", "a\r\n" + GH_PAT + "\r\nb\r\n")
        proc = stlib.guard("guard-secrets.py", repo, env, "--index")
        stlib.expect(proc, 1, "FAIL: guard-secrets: 1 нарушений")
        assert "doc/\u0437\u0430\u043c\u0435\u0442\u043a\u0430.md:2" in proc.out, proc.out

    def no_target():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "empty")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        proc = stlib.guard("guard-secrets.py", repo, env, "--root", repo, "--tree")
        stlib.expect(proc, 1, "FAIL: мишень потеряна")
        plain = os.path.join(base2, "plain")
        os.makedirs(plain)
        proc = stlib.guard("guard-secrets.py", plain, env, "--root", plain)
        stlib.expect(proc, 1, "FAIL: предпосылка")

    def machine_paths_unit():
        mp = machine_paths.find_machine_paths
        assert mp("x " + WIN) == ["disk-path"]
        assert mp(WIN_BACK) == ["disk-path"]
        assert mp(LINUX) == ["home-path"]
        assert mp(MAC) == ["home-path"]
        for ok_text in ("C:/work/a/b", "c:" + chr(92) + "work" + chr(92) + "a" + chr(92) + "b",
                        "D:/", "D:" + chr(92), "C:" + chr(92) + "Users" + chr(92), "~/notes/x",
                        "/home/", "/Users/", "time " + chr(92) + "d:" + chr(92) + "d", "(" + chr(92) + "d+):(" + chr(92) + "d" + chr(92) + "d)",
                        "see https://example.test/home/alice/x", "src/home/alice/x", "a:b",
                        "ab:/x/y", "1:/x/y"):
            assert mp(ok_text) == [], "ложное срабатывание: %r" % ok_text
        assert mp("C" + ":/work" + "shop/a/b") == ["disk-path"], "work — только точное имя"

    pr.probe("законное", "чистая добавленная строка в индексе", legit_clean_index)
    pr.probe("законное", "чистое дерево: png из списка бинарных не судится", legit_clean_tree)
    pr.probe("законное", "общий корень примеров C:/work/, образцы поиска, тильда, время", index_green(
        "C:/work/a/b ~/x D:/ time (" + chr(92) + "d+):(" + chr(92) + "d" + chr(92) + "d)"))
    pr.probe("законное", "пустой индекс — судить нечего", empty_index)
    pr.probe("законное", "в индексе судятся только добавленные строки", old_lines_not_judged_in_index)
    pr.probe("законное", "дерево: пароль в присваивании и конфликт не применяются", tree_password_green)
    pr.probe("законное", "режим коммита: красный и зелёный коммит", commit_mode_red_and_green)
    pr.probe("законное", "режим коммита: удаление без добавленных строк", commit_only_deletion)
    pr.probe("законное", "определение пути машины: что путь, что нет", machine_paths_unit)
    pr.probe("красная", "конфликт слияния в индексе", index_red(CONFLICT, "conflict-marker"))
    pr.probe("красная", "заголовок приватного ключа", index_red(PEM, "private-key"))
    pr.probe("красная", "токен GitLab", index_red(GL, "token-gitlab"))
    pr.probe("красная", "токен GitHub (ghp)", index_red(GH, "token-github"))
    pr.probe("красная", "токен GitHub (github_pat)", index_red(GH_PAT, "token-github"))
    pr.probe("красная", "учётные данные внутри адреса", index_red(URL, "url-credentials"))
    pr.probe("красная", "пароль в присваивании", index_red(PASS, "password-assign"))
    pr.probe("красная", "путь машины от буквы диска", index_red(WIN, "machine-path"))
    pr.probe("красная", "домашний каталог Linux", index_red(LINUX, "machine-path"))
    pr.probe("красная", "домашний каталог macOS", index_red(MAC, "machine-path"))
    pr.probe("красная", "дерево: токен в старой строке", tree_token_old_line)
    pr.probe("красная", "дерево: путь машины", tree_machine_path_red)
    pr.probe("иной-синтаксис", "путь с обратными косыми", index_red(WIN_BACK, "machine-path"))
    pr.probe("иной-синтаксис", "кириллический путь, концы строк CRLF", cyrillic_path_and_crlf)
    pr.probe("иной-синтаксис", "адрес ftp с учётными данными", index_red(
        "ftp://" + "bob" + ":" + "hunter22x" + "@" + "host.test/x", "url-credentials"))
    pr.probe("иной-синтаксис", "номер строки во втором участке изменений", line_numbers_second_hunk)
    pr.probe("мишень", "пустой репозиторий и папка без git", no_target)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
