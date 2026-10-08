# -*- coding: utf-8 -*-
"""Самотест хука pre-commit: отказ на красном страже, зелёный на чистом, вывод через буфер, область коммита.

Зачем: хук - последняя остановка до истории; он должен отказывать на нарушении, не зависеть от того,
    как прочитан его вывод («git commit ... | head -1»), и судить содержимое коммита (индекс, в том числе
    временный при --only), а не чужие незакоммиченные правки рабочей копии.
Проверяет: в одноразовом репозитории с настоящими стражами и установленными хуками: коммит с токеном
    отклонён (файл и строка в выводе, значения нет); коммит с битой ссылкой отклонён (страж дерева по
    индексу); чистый коммит проходит; коммит с --only при грязной рабочей копии (битая ссылка, управляющий
    байт, неверная первая строка spec.md в чужих файлах) проходит; файл исправлен в рабочей копии, но не в
    индексе - красный; ссылка на неотслеживаемый файл - красная; обрезанный вывод не прячет отказ;
    коммит из связанного рабочего дерева; нет списка имён - отказ; пустой коммит.
Не проверяет: сообщение коммита (test-commit-msg.py) и пуш (test-pre-push.py).
Правило: AGENTS.md п.15, п.4; AC-01, AC-24, AC-30 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

GH = "gh" + "p_" + "A1b2C3d4" * 3
P1 = "zorblax" + "-" + "project"
CTRL = chr(1)


def main():
    pr = stlib.Probes("pre-commit")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    names = stlib.names_file(base, [P1])
    env = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
    counter = [0]

    def repo(**kw):
        counter[0] += 1
        return stlib.hooked_repo(base, env, name="h%d" % counter[0], **kw)

    def stage(r, rel, content):
        stlib.write_files(r, {rel: content})
        stlib.git(r, env, "add", "--", rel)

    def legit_clean_commit():
        r = repo()
        stage(r, "doc/note.md", "# Note\n\nclean text with [link](../README.md)\n")
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add a note")
        assert proc.returncode == 0, proc.out + proc.err
        assert stlib.head(r, env) != before, "коммит не создан"

    def red_token():
        r = repo()
        stage(r, "src.txt", "a\nkey = " + GH + "\n")
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add src")
        assert proc.returncode != 0 and stlib.head(r, env) == before, "коммит с токеном не отклонён"
        out = proc.out + proc.err
        assert "src.txt:2" in out and "token-github" in out, out
        assert GH not in out, "значение напечатано"

    def red_broken_link_via_index():
        r = repo()
        stage(r, "doc/bad.md", "see [x](gone.md)\n")
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add bad")
        assert proc.returncode != 0 and stlib.head(r, env) == before
        assert "doc/bad.md:1" in proc.out + proc.err, proc.out + proc.err

    def red_forbidden_name():
        r = repo()
        stage(r, "doc/n.md", "mention " + P1 + "\n")
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add n")
        assert proc.returncode != 0 and stlib.head(r, env) == before
        assert P1 not in proc.out + proc.err and "образец №1" in proc.out + proc.err

    def head_pipe_does_not_hide_refusal():
        r = repo()
        stage(r, "src.txt", "key = " + GH + "\n")
        before = stlib.head(r, env)
        proc = stlib.run(("sh", "-c", "git commit -q -s -m 'Add src' | head -1"), cwd=r, env=env)
        assert stlib.head(r, env) == before, "коммит прошёл при обрезанном выводе"
        assert proc.returncode == 0  # код конвейера — код head; отказ виден по отсутствию коммита

    def only_with_dirty_worktree():
        r = repo(extra={"doc/tasks/002-y/spec.md": "Статус: черновик\n"})
        # чужая работа в той же копии: правки отслеживаемых файлов и неотслеживаемый файл с нарушениями
        stlib.write_files(r, {
            "doc/tasks/002-y/spec.md": "not a status line\n",
            "other/untracked.md": "broken [x](nowhere.md) and " + CTRL + "\n",
        })
        stage(r, "mine.md", "mine, clean\n")
        stlib.write_files(r, {"mine.md": "mine, clean\n"})
        before = stlib.head(r, env)
        proc = stlib.run(("git", "commit", "-q", "-s", "-m", "Add mine", "--only", "--", "mine.md"), cwd=r, env=env)
        assert proc.returncode == 0, proc.out + proc.err
        assert stlib.head(r, env) != before
        st = stlib.git(r, env, "status", "--porcelain").out
        assert "spec.md" in st and "other/" in st, "чужие правки пропали: " + st

    def staged_bad_worktree_fixed():
        r = repo()
        stage(r, "doc/x.md", "see [x](gone.md)\n")
        stlib.write_files(r, {"doc/x.md": "no link now\n"})  # исправлено в рабочей копии, не в индексе
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add x")
        assert proc.returncode != 0 and stlib.head(r, env) == before, proc.out + proc.err

    def link_to_untracked_is_red():
        r = repo()
        stlib.write_files(r, {"doc/exists-on-disk.md": "x\n"})
        stage(r, "doc/y.md", "see [x](exists-on-disk.md)\n")
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Add y")
        assert proc.returncode != 0 and stlib.head(r, env) == before, proc.out + proc.err

    def linked_worktree():
        r = repo()
        wt = os.path.join(base, "wt%d" % counter[0])
        stlib.git(r, env, "worktree", "add", "-q", "-b", "side", wt)
        stage(wt, "src.txt", "key = " + GH + "\n")
        before = stlib.head(wt, env)
        proc = stlib.commit(wt, env, "Add src")
        assert proc.returncode != 0 and stlib.head(wt, env) == before, proc.out + proc.err
        assert "src.txt:1" in proc.out + proc.err
        stlib.git(wt, env, "rm", "-q", "--cached", "--", "src.txt")
        os.remove(os.path.join(wt, "src.txt"))
        stage(wt, "ok.md", "# ok\n")
        proc = stlib.commit(wt, env, "Add ok")
        assert proc.returncode == 0, proc.out + proc.err
        leftovers = [x for x in os.listdir(stlib.git(wt, env, "rev-parse", "--absolute-git-dir").out.strip()) if x.startswith("guards-precommit-out")]
        assert not leftovers, leftovers

    def no_names_list_refuses():
        r = repo()
        stage(r, "doc/ok.md", "# ok\n")
        e = dict(env0, CREW_PRIVATE_NAMES_FILE=os.path.join(base, "absent.txt"))
        before = stlib.head(r, env)
        proc = stlib.commit(r, e, "Add ok")
        assert proc.returncode != 0 and stlib.head(r, env) == before
        assert "CREW_PRIVATE_NAMES" in proc.out + proc.err

    def no_interpreter_refuses():
        r = repo()
        stage(r, "doc/ok.md", "# ok\n")
        e = dict(env, GUARDS_PYTHON_CANDIDATES="no-such-python")
        before = stlib.head(r, env)
        proc = stlib.commit(r, e, "Add ok")
        assert proc.returncode != 0 and stlib.head(r, env) == before
        assert "Python" in proc.out + proc.err

    def allow_empty_commit():
        r = repo()
        before = stlib.head(r, env)
        proc = stlib.commit(r, env, "Empty on purpose", "--allow-empty")
        assert proc.returncode == 0 and stlib.head(r, env) != before, proc.out + proc.err

    def hook_direct_green_and_red():
        r = repo()
        proc = stlib.run(("sh", "scripts/githooks/pre-commit"), cwd=r, env=env)
        assert proc.returncode == 0, proc.out + proc.err
        stage(r, "k.txt", GH + "\n")
        proc = stlib.run(("sh", "scripts/githooks/pre-commit"), cwd=r, env=env)
        assert proc.returncode == 1 and "k.txt:1" in proc.out, proc.out

    pr.probe("законное", "чистый коммит проходит", legit_clean_commit)
    pr.probe("законное", "хук напрямую: зелёный на чистом индексе", hook_direct_green_and_red)
    pr.probe("законное", "AC-30: --only при грязной рабочей копии другой задачи", only_with_dirty_worktree)
    pr.probe("законное", "пустой коммит --allow-empty проходит", allow_empty_commit)
    pr.probe("законное", "связанное рабочее дерево: отказ и проход, буфер убран", linked_worktree)
    pr.probe("красная", "токен в индексе: отказ, файл и строка, значения нет", red_token)
    pr.probe("красная", "битая ссылка судится по индексу", red_broken_link_via_index)
    pr.probe("красная", "имя из списка: отказ, значения нет", red_forbidden_name)
    pr.probe("красная", "AC-24: git commit | head -1 не прячет отказ", head_pipe_does_not_hide_refusal)
    pr.probe("иной-синтаксис", "AC-30: исправлено в рабочей копии, но не в индексе - красный", staged_bad_worktree_fixed)
    pr.probe("иной-синтаксис", "AC-30: ссылка на неотслеживаемый файл - красная", link_to_untracked_is_red)
    pr.probe("мишень", "нет списка имён - отказ с подсказкой", no_names_list_refuses)
    pr.probe("мишень", "нет интерпретатора - отказ с подсказкой", no_interpreter_refuses)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
