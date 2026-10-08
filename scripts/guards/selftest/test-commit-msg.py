# -*- coding: utf-8 -*-
"""Самотест хука commit-msg: настоящий git commit в одноразовом репозитории с установленными хуками.

Зачем: режим сообщения (-m, -F, редактор) определяет обёртка хука по GIT_EDITOR; ошибка здесь краснила бы
    законные комментарии редактора или пропускала бы строки, которые git оставит в истории.
Проверяет: коммит с -m и -F проходит с подписью и отклоняется без неё, с соавтором, с чужим адресом, с
    не ASCII, с путём машины и именем из списка; строка на решётку с именем или кириллицей отклонена при -m и
    -F и не судится в редакторе; строка цитаты на «>» судится в обоих; режим с diff (commit.verbose) и хвост
    за строкой-ножницами; git commit --amend -m без изменений индекса (AC-18); связанное рабочее дерево;
    нет списка имён - отказ.
Не проверяет: правила стража на уровне функций (test-guard-commit-message.py), пуш (test-pre-push.py).
Правило: AGENTS.md п.4, п.15; AC-09, AC-18, AC-32 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

import message  # noqa: E402

P1 = "zorblax" + "-" + "project"
CYR = "привет"
EDITOR = (
    "import os, sys\n"
    "path = sys.argv[1]\n"
    "data = open(path, 'rb').read().decode('utf-8')\n"
    "pre = os.environ.get('ST_PREPEND', '')\n"
    "app = os.environ.get('ST_APPEND', '')\n"
    "open(path, 'wb').write((pre + data + app).encode('utf-8'))\n"
)


def main():
    pr = stlib.Probes("commit-msg")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    names = stlib.names_file(base, [P1])
    env = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
    editor_path = os.path.join(base, "editor.py")
    with open(editor_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(EDITOR)
    editor_cmd = '"%s" "%s"' % (sys.executable.replace(chr(92), "/"), editor_path.replace(chr(92), "/"))
    counter = [0]

    def repo(**kw):
        counter[0] += 1
        return stlib.hooked_repo(base, env, name="m%d" % counter[0], **kw)

    def stage_new(r, name="f.txt"):
        counter[0] += 1
        rel = "%s_%d" % (name, counter[0])
        stlib.write_files(r, {rel: "x\n"})
        stlib.git(r, env, "add", "--", rel)
        return rel

    def msg_file(text):
        counter[0] += 1
        path = os.path.join(base, "mf%d.txt" % counter[0])
        with open(path, "wb") as handle:
            handle.write(text.encode("utf-8"))
        return path

    def attempt(r, args, e=None, ok=False, expect=None):
        before = stlib.head(r, env)
        proc = stlib.run(("git", "commit", "-q") + tuple(args), cwd=r, env=e or env)
        out = proc.out + proc.err
        if ok:
            assert proc.returncode == 0 and stlib.head(r, env) != before, out
        else:
            assert proc.returncode != 0 and stlib.head(r, env) == before, "коммит не отклонён: " + out
            if expect:
                assert expect in out, "в выводе нет «%s»: %s" % (expect, out)
            assert P1 not in out, "значение напечатано"
        return out

    def legit_m_and_f():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Add a file"), ok=True)
        stage_new(r)
        attempt(r, ("-s", "-F", msg_file("Another file\n\nBody text.\n")), ok=True)

    def legit_editor_comments_with_cyrillic():
        r = repo()
        stage_new(r)
        e = dict(env, GIT_EDITOR=editor_cmd, ST_PREPEND="Subject from editor\n", ST_APPEND="# %s %s\n" % (CYR, P1))
        attempt(r, ("-s",), e=e, ok=True)

    def legit_quote_with_cyrillic():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Quote it\n\n> %s quoted text" % CYR), ok=True)

    def red_hash_line_with_name_m_and_f():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Subject\n\n# note %s" % P1), expect="forbidden-name")
        attempt(r, ("-s", "-F", msg_file("Subject\n\n# note %s\n" % P1)), expect="forbidden-name")

    def red_hash_cyrillic_f_ok_editor():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-F", msg_file("Subject\n\n# %s\n" % CYR)), expect="non-ascii")
        e = dict(env, GIT_EDITOR=editor_cmd, ST_PREPEND="Subject\n", ST_APPEND="# %s\n" % CYR)
        attempt(r, ("-s",), e=e, ok=True)

    def red_quote_with_name():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Subject\n\n> quoted %s" % P1), expect="forbidden-name")
        e = dict(env, GIT_EDITOR=editor_cmd, ST_PREPEND="Subject\n", ST_APPEND="\n> quoted %s\n" % P1)
        attempt(r, ("-s",), e=e, expect="forbidden-name")

    def verbose_diff_removed_line_passes():
        r = repo(extra={"doc/old.md": "old line " + P1 + " here\nkeep\n"})
        stlib.write_files(r, {"doc/old.md": "keep\n"})
        stlib.git(r, env, "add", "--", "doc/old.md")
        e = dict(env, GIT_EDITOR=editor_cmd, ST_PREPEND="Drop the old line\n")
        attempt(r, ("-s", "-v"), e=e, ok=True)

    def verbose_name_in_message_red():
        r = repo(extra={"doc/old.md": "old line " + P1 + " here\nkeep\n"})
        stlib.write_files(r, {"doc/old.md": "keep\n"})
        stlib.git(r, env, "add", "--", "doc/old.md")
        e = dict(env, GIT_EDITOR=editor_cmd, ST_PREPEND="Mention %s here\n" % P1)
        attempt(r, ("-s", "-v"), e=e, expect="forbidden-name")

    def scissors_in_f_without_verbose_tail_red():
        r = repo()
        stage_new(r)
        text = "Subject\n\n" + message.SCISSORS + "\ntail " + P1 + "\n"
        attempt(r, ("-s", "-F", msg_file(text)), expect="forbidden-name")

    def no_signoff_red():
        r = repo()
        stage_new(r)
        attempt(r, ("-m", "No signature"), expect="signoff-missing")

    def coauthor_red():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Subject\n\nCo-Authored-By: Bot <bot@example.test>"), expect="co-authored-by")

    def non_ascii_red():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Add " + CYR), expect="non-ascii")

    def machine_path_red():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Move to " + "E" + ":/" + "Work2" + "/" + "proj" + "/x"), expect="machine-path")

    def email_mismatch_red():
        r = repo()
        stage_new(r)
        stlib.git(r, env, "config", "crewharness.expectedEmail", "somebody@example.test")
        attempt(r, ("-s", "-m", "Subject"), expect="expected-email")

    def no_setting_red():
        r = repo()
        stage_new(r)
        stlib.git(r, env, "config", "--unset", "crewharness.expectedEmail")
        out = attempt(r, ("-s", "-m", "Subject"), e=dict(env, GITHUB_ACTIONS="true"), expect="установщик")
        assert "scripts/install-hooks.sh" in out

    def amend_message_only():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "First"), ok=True)
        first = stlib.head(r, env)
        out = attempt(r, ("--amend", "-s", "-m", "Better message"), ok=True)
        assert stlib.head(r, env) != first
        subject = stlib.git(r, env, "log", "-1", "--format=%s").out.strip()
        assert subject == "Better message", subject
        del out
        before = stlib.head(r, env)
        attempt(r, ("--amend", "-s", "-m", "Bad " + CYR), expect="non-ascii")
        assert stlib.head(r, env) == before

    def amend_no_edit():
        r = repo()
        stage_new(r)
        attempt(r, ("-s", "-m", "Keep this"), ok=True)
        attempt(r, ("--amend", "--no-edit"), ok=True)

    def linked_worktree():
        r = repo()
        wt = os.path.join(base, "mwt%d" % counter[0])
        stlib.git(r, env, "worktree", "add", "-q", "-b", "side", wt)
        stage_new(wt)
        attempt(wt, ("-m", "No signature in worktree"), expect="signoff-missing")
        attempt(wt, ("-s", "-m", "Signed in worktree"), ok=True)

    def no_names_list():
        r = repo()
        stage_new(r)
        e = dict(env0, CREW_PRIVATE_NAMES_FILE=os.path.join(base, "absent.txt"))
        attempt(r, ("-s", "-m", "Subject"), e=e, expect="CREW_PRIVATE_NAMES")

    pr.probe("законное", "-m и -F с подписью проходят", legit_m_and_f)
    pr.probe("законное", "редактор: комментарий с кириллицей и именем не судится", legit_editor_comments_with_cyrillic)
    pr.probe("законное", "строка цитаты с кириллицей", legit_quote_with_cyrillic)
    pr.probe("законное", "режим с diff: имя только в удалённой строке diff - проходит", verbose_diff_removed_line_passes)
    pr.probe("законное", "AC-18: --amend -m без изменений индекса", amend_message_only)
    pr.probe("законное", "--amend --no-edit", amend_no_edit)
    pr.probe("законное", "связанное рабочее дерево", linked_worktree)
    pr.probe("красная", "нет подписи", no_signoff_red)
    pr.probe("красная", "Co-Authored-By", coauthor_red)
    pr.probe("красная", "не ASCII", non_ascii_red)
    pr.probe("красная", "путь машины в сообщении", machine_path_red)
    pr.probe("красная", "адрес автора не равен настройке установщика", email_mismatch_red)
    pr.probe("красная", "нет настройки установщика (в том числе при GITHUB_ACTIONS)", no_setting_red)
    pr.probe("красная", "строка на решётку с именем: -m и -F красные", red_hash_line_with_name_m_and_f)
    pr.probe("красная", "режим с diff: имя в самом сообщении красное", verbose_name_in_message_red)
    pr.probe("иной-синтаксис", "решётка с кириллицей: -F красный, редактор проходит", red_hash_cyrillic_f_ok_editor)
    pr.probe("иной-синтаксис", "строка цитаты с именем красная в -m и в редакторе", red_quote_with_name)
    pr.probe("иной-синтаксис", "-F без режима с diff: хвост за ножницами судится", scissors_in_f_without_verbose_tail_red)
    pr.probe("мишень", "нет списка имён - отказ с подсказкой", no_names_list)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
