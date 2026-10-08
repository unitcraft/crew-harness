# -*- coding: utf-8 -*-
"""Самотест хука pre-push: настоящий git push в одноразовый удалённый репозиторий.

Зачем: коммиты, созданные без хуков (cherry-pick, rebase --continue), не проходят pre-commit и commit-msg;
    pre-push - последняя точка, где их ещё можно остановить до публикации в публичный репозиторий.
Проверяет: чистая новая ветка и пуш в существующую ветку проходят; удаление ветки проходит (судить
    нечего); коммит от cherry-pick и от rebase --continue с выдуманным путём машины в файле отклоняет пуш,
    вывод называет коммит и файл и не содержит значения; коммит с не ASCII, без подписи и с именем из списка
    отклоняет пуш; прежней головы нет локально - отказ «сначала git fetch»; пуш из связанного рабочего дерева.
Не проверяет: диапазон сам по себе (test-commit-range.py), стражей по отдельности.
Правило: AGENTS.md п.15, п.4, п.8; AC-12, AC-32 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

P1 = "zorblax" + "-" + "project"
WIN = "E" + ":/" + "Work2" + "/" + "proj" + "/x.txt"
CYR = "привет"


def main():
    pr = stlib.Probes("pre-push")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    names = stlib.names_file(base, [P1])
    env = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
    nohooks = os.path.join(base, "nohooks")
    os.makedirs(nohooks)
    counter = [0]

    remote = os.path.join(base, "remote.git")
    os.makedirs(remote)
    stlib.git(remote, env, "init", "-q", "--bare")
    repo = stlib.hooked_repo(base, env, name="pushrepo")
    stlib.git(repo, env, "remote", "add", "origin", remote)
    stlib.git(repo, env, "push", "-q", "--no-verify", "origin", "main")
    stlib.git(repo, env, "fetch", "-q", "origin")

    def next_name(prefix):
        counter[0] += 1
        return "%s%d" % (prefix, counter[0])

    def commit_nohooks(r, rel, content, message="Add file", signed=True):
        stlib.write_files(r, {rel: content})
        stlib.git(r, env, "add", "--", rel)
        args = ("commit", "-q", "--no-verify", "-m", message)
        if signed:
            args = ("commit", "-q", "--no-verify", "-s", "-m", message)
        stlib.git(r, env, *args)
        return stlib.head(r, env)

    def branch(r, name, start="main"):
        stlib.git(r, env, "checkout", "-q", "-b", name, start)

    def push(r, *args):
        return stlib.run(("git", "push", "-q", "origin") + args, cwd=r, env=env)

    def refused(proc):
        out = proc.out + proc.err
        assert proc.returncode != 0 and "пуш отклонён" in out, out
        assert P1 not in out and WIN not in out, "значение напечатано"
        return out

    def legit_new_and_existing():
        name = next_name("ok")
        branch(repo, name)
        stlib.write_files(repo, {"doc/ok%s.md" % name: "# ok\n"})
        stlib.git(repo, env, "add", "--", "doc/ok%s.md" % name)
        proc = stlib.commit(repo, env, "Add ok file")
        assert proc.returncode == 0, proc.out + proc.err
        proc = push(repo, name)
        assert proc.returncode == 0, proc.out + proc.err
        stlib.write_files(repo, {"doc/ok2%s.md" % name: "# ok2\n"})
        stlib.git(repo, env, "add", "--", "doc/ok2%s.md" % name)
        stlib.commit(repo, env, "Add second ok file")
        proc = push(repo, name)
        assert proc.returncode == 0, proc.out + proc.err
        proc = push(repo, "--delete", name)
        assert proc.returncode == 0, "удаление ветки: " + proc.out + proc.err
        stlib.git(repo, env, "checkout", "-q", "main")

    def cherry_pick_machine_path():
        side = next_name("side")
        branch(repo, side)
        sha = commit_nohooks(repo, "cp/path.txt", "see " + WIN + "\n")
        target = next_name("target")
        branch(repo, target)
        stlib.git(repo, env, "-c", "core.hooksPath=" + nohooks.replace(chr(92), "/"), "cherry-pick", sha)
        proc = push(repo, target)
        out = refused(proc)
        assert "cp/path.txt:1" in out and "machine-path" in out and stlib.git(repo, env, "rev-parse", "--short=7", "HEAD").out.strip() in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def rebase_continue_machine_path():
        a = next_name("ra")
        branch(repo, a)
        commit_nohooks(repo, "rb/f.txt", "from a\n")
        b = next_name("rb")
        branch(repo, b, "main")
        commit_nohooks(repo, "rb/f.txt", "from b\n")
        proc = stlib.run(("git", "-c", "core.hooksPath=" + nohooks.replace(chr(92), "/"), "rebase", a), cwd=repo, env=env)
        assert proc.returncode != 0, "ожидался конфликт"
        stlib.write_files(repo, {"rb/f.txt": "resolved with " + WIN + "\n"})
        stlib.git(repo, env, "add", "--", "rb/f.txt")
        e = dict(env, GIT_EDITOR="true")
        cont = stlib.run(("git", "-c", "core.hooksPath=" + nohooks.replace(chr(92), "/"), "rebase", "--continue"), cwd=repo, env=e)
        assert cont.returncode == 0, cont.out + cont.err
        proc = push(repo, b)
        out = refused(proc)
        assert "rb/f.txt:1" in out and "machine-path" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def non_ascii_message():
        name = next_name("na")
        branch(repo, name)
        commit_nohooks(repo, "na/f.txt", "x\n", message="Add " + CYR)
        out = refused(push(repo, name))
        assert "non-ascii" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def no_signoff():
        name = next_name("ns")
        branch(repo, name)
        commit_nohooks(repo, "ns/f.txt", "x\n", message="No signature", signed=False)
        out = refused(push(repo, name))
        assert "signoff-missing" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def forbidden_name_in_file():
        name = next_name("fn")
        branch(repo, name)
        commit_nohooks(repo, "fn/f.txt", "mention " + P1 + "\n")
        out = refused(push(repo, name))
        assert "fn/f.txt:1" in out and "образец №1" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def second_commit_is_the_bad_one():
        name = next_name("sb")
        branch(repo, name)
        commit_nohooks(repo, "sb/ok.txt", "fine\n")
        bad = commit_nohooks(repo, "sb/bad.txt", "see " + WIN + "\n")
        out = refused(push(repo, name))
        assert bad[:7] in out and "sb/bad.txt:1" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def old_head_not_fetched():
        name = next_name("nf")
        branch(repo, name)
        commit_nohooks(repo, "nf/a.txt", "a\n")
        assert push(repo, name).returncode == 0
        other = os.path.join(base, "clone2%d" % counter[0])
        stlib.git(base, env, "clone", "-q", remote, other)
        stlib.git(other, env, "checkout", "-q", name)
        commit_nohooks(other, "nf/other.txt", "other\n")
        stlib.git(other, env, "push", "-q", "--no-verify", "origin", name)
        commit_nohooks(repo, "nf/b.txt", "b\n")
        proc = push(repo, name)
        out = proc.out + proc.err
        assert proc.returncode != 0 and "git fetch" in out, out
        stlib.git(repo, env, "checkout", "-q", "main")

    def linked_worktree_push():
        wt = os.path.join(base, "wtpush%d" % counter[0])
        name = next_name("wt")
        stlib.git(repo, env, "worktree", "add", "-q", "-b", name, wt, "main")
        commit_nohooks(wt, "wt/bad.txt", "see " + WIN + "\n")
        proc = push(wt, name)
        refused(proc)
        stlib.git(wt, env, "reset", "-q", "--hard", "main")
        stlib.write_files(wt, {"wt/good.md": "# good\n"})
        stlib.git(wt, env, "add", "--", "wt/good.md")
        assert stlib.commit(wt, env, "Add good").returncode == 0
        proc = push(wt, name)
        assert proc.returncode == 0, proc.out + proc.err

    pr.probe("законное", "новая ветка, пуш в существующую, удаление ветки", legit_new_and_existing)
    pr.probe("законное", "связанное рабочее дерево: отказ, затем чистый пуш", linked_worktree_push)
    pr.probe("красная", "cherry-pick с путём машины: коммит и файл названы, значения нет", cherry_pick_machine_path)
    pr.probe("красная", "rebase --continue с путём машины в разрешении конфликта", rebase_continue_machine_path)
    pr.probe("красная", "сообщение не ASCII", non_ascii_message)
    pr.probe("красная", "нет подписи", no_signoff)
    pr.probe("красная", "имя из списка в файле коммита", forbidden_name_in_file)
    pr.probe("иной-синтаксис", "плохой коммит вторым в ветке: назван именно он", second_commit_is_the_bad_one)
    pr.probe("мишень", "прежней головы нет локально: отказ «сначала git fetch»", old_head_not_fetched)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
