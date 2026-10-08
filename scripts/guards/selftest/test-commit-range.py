# -*- coding: utf-8 -*-
"""Самотест commit-range.sh: какие коммиты пуша судят хук pre-push и CI.

Зачем: подпись и сообщение проверяются по коммитам пуша; неверный диапазон либо пропустил бы коммит,
    либо потащил бы в проверку прошлые коммиты основной ветки (в проекте есть коммит с подписью не по
    адресу автора, который судить нельзя).
Проверяет: три вида диапазона в одноразовом репозитории с удалённым: пуш в существующую ветку (между
    прежней и новой головой), первый пуш новой ветки (коммиты, которых нет в удалённом репозитории), запрос
    на слияние (от базы до головы); прошлые коммиты основной ветки в диапазон не входят; прежней головы нет
    локально - код 3 «сначала git fetch»; новая ветка без точки отсчёта - код 3; подпись по коммитам
    диапазона в режиме --ci (коммит без подписи красный, с подписью зелёный).
Не проверяет: сами хуки (test-pre-push.py).
Правило: AGENTS.md п.4, п.5; AC-13 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

RANGE = os.path.join(stlib.GUARDS, "commit-range.sh")
ZERO = "0" * 40


def main():
    pr = stlib.Probes("commit-range")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    names = stlib.names_file(base, ["zorblax-nothing"])
    env = dict(env, CREW_PRIVATE_NAMES_FILE=names)

    remote = os.path.join(base, "remote.git")
    os.makedirs(remote)
    stlib.git(remote, env, "init", "-q", "--bare")
    repo = stlib.make_repo(base, env, {"a.txt": "x\n"}, name="local")
    # прошлый коммит основной ветки: подпись не по адресу автора, судить нельзя
    old = stlib.commit_file(repo, env, "old.txt", "o\n", "Old main commit without any signature")
    stlib.git(repo, env, "remote", "add", "origin", remote)
    stlib.git(repo, env, "push", "-q", "origin", "main")
    stlib.git(repo, env, "config", "crewharness.expectedEmail", "author@example.test")

    def signed(subject):
        return "%s\n\nSigned-off-by: Test Author <author@example.test>\n" % subject

    def commit(rel, content, message):
        stlib.write_files(repo, {rel: content})
        stlib.git(repo, env, "add", "--", rel)
        mf = os.path.join(base, "m.txt")
        with open(mf, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(message)
        stlib.git(repo, env, "commit", "-q", "-F", mf)
        return stlib.head(repo, env)

    def rng(*args):
        return stlib.run(("sh", RANGE) + args, cwd=repo, env=env)

    def hashes(proc):
        return [x for x in proc.out.split() if x]

    stlib.git(repo, env, "checkout", "-q", "-b", "feat")
    c1 = commit("f1.txt", "1\n", signed("First on feat"))
    c2 = commit("f2.txt", "2\n", signed("Second on feat"))
    stlib.git(repo, env, "push", "-q", "origin", "feat")
    pushed = stlib.head(repo, env)
    c3 = commit("f3.txt", "3\n", signed("Third on feat"))
    c4 = commit("f4.txt", "4\n", "Fourth without a signature\n")

    def existing_branch():
        proc = rng("--old", pushed, "--new", c4, "--remote", "origin")
        assert proc.returncode == 0 and hashes(proc) == [c3, c4], proc.out + proc.err

    def new_branch():
        proc = rng("--old", ZERO, "--new", c4, "--remote", "origin", "--main", "refs/remotes/origin/main")
        got = hashes(proc)
        assert proc.returncode == 0 and got == [c3, c4], (got, proc.err)
        assert old not in got and c1 not in got, "прошлые коммиты и уже опубликованные не должны входить"

    def new_branch_never_pushed():
        stlib.git(repo, env, "checkout", "-q", "-b", "fresh", "main")
        n1 = commit("n1.txt", "1\n", signed("N1"))
        n2 = commit("n2.txt", "2\n", signed("N2"))
        proc = rng("--old", ZERO, "--new", n2, "--remote", "origin", "--main", "refs/remotes/origin/main")
        assert hashes(proc) == [n1, n2], proc.out + proc.err
        stlib.git(repo, env, "checkout", "-q", "feat")

    def pull_request():
        main_head = stlib.git(repo, env, "rev-parse", "origin/main").out.strip()
        proc = rng("--old", main_head, "--new", c4)
        assert hashes(proc) == [c1, c2, c3, c4], proc.out + proc.err

    def empty_range():
        proc = rng("--old", c4, "--new", c4)
        assert proc.returncode == 0 and hashes(proc) == []

    def merge_commit_included():
        stlib.git(repo, env, "checkout", "-q", "-b", "mrg", c2)
        m1 = commit("m1.txt", "m\n", signed("M1"))
        stlib.git(repo, env, "checkout", "-q", "feat")
        mf = os.path.join(base, "merge.txt")
        with open(mf, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(signed("Merge side"))
        stlib.git(repo, env, "merge", "-q", "--no-ff", "mrg", "-F", mf)
        merged = stlib.head(repo, env)
        proc = rng("--old", c4, "--new", merged)
        got = hashes(proc)
        assert merged in got and m1 in got, got
        stlib.git(repo, env, "reset", "-q", "--hard", c4)

    def old_head_missing():
        proc = rng("--old", "1" * 40, "--new", c4, "--remote", "origin")
        assert proc.returncode == 3 and "git fetch" in proc.err, (proc.returncode, proc.err)

    def new_branch_without_anchor():
        other = stlib.make_repo(base, env, {"b.txt": "x\n"}, name="noremote")
        head = stlib.head(other, env)
        proc = stlib.run(("sh", RANGE, "--old", ZERO, "--new", head, "--remote", "origin"), cwd=other, env=env)
        assert proc.returncode == 3 and "git fetch" in proc.err, (proc.returncode, proc.err)
        proc = stlib.run(("sh", RANGE), cwd=other, env=env)
        assert proc.returncode == 2

    def signature_in_ci_by_range():
        proc = rng("--old", pushed, "--new", c4, "--remote", "origin")
        bad = []
        for h in hashes(proc):
            res = stlib.guard("guard-commit-message.py", repo, env, "--commit", h, "--ci")
            if res.returncode != 0:
                bad.append(h)
        assert bad == [c4], "красным должен быть только коммит без подписи: %r" % bad
        res = stlib.guard("guard-commit-message.py", repo, env, "--commit", c4, "--ci")
        assert "signoff-missing" in res.out and c4[:7] in res.out, res.out
        res = stlib.guard("guard-commit-message.py", repo, env, "--commit", c3, "--ci")
        stlib.expect(res, 0, "ок: осмотрено 1 сообщений")

    def old_main_commit_never_in_range():
        res = stlib.guard("guard-commit-message.py", repo, env, "--commit", old, "--ci")
        assert res.returncode == 1, "контроль: прошлый коммит основной ветки действительно красный"
        for args in (("--old", pushed, "--new", c4, "--remote", "origin"),
                     ("--old", ZERO, "--new", c4, "--remote", "origin", "--main", "refs/remotes/origin/main")):
            assert old not in hashes(rng(*args)), args

    pr.probe("законное", "пуш в существующую ветку: между прежней и новой головой", existing_branch)
    pr.probe("законное", "первый пуш новой ветки: нет в удалённом репозитории", new_branch)
    pr.probe("законное", "новая ветка от основной: только её коммиты", new_branch_never_pushed)
    pr.probe("законное", "запрос на слияние: от базы до головы", pull_request)
    pr.probe("законное", "пустой диапазон", empty_range)
    pr.probe("законное", "коммит слияния входит в диапазон", merge_commit_included)
    pr.probe("красная", "подпись в CI по диапазону: красный только коммит без подписи", signature_in_ci_by_range)
    pr.probe("красная", "прежней головы нет локально: код 3 и «git fetch»", old_head_missing)
    pr.probe("иной-синтаксис", "прошлые коммиты основной ветки не входят и красные, если их судить", old_main_commit_never_in_range)
    pr.probe("мишень", "новая ветка без точки отсчёта и вызов без аргументов", new_branch_without_anchor)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
