# -*- coding: utf-8 -*-
"""Самотест стража сообщения коммита guard-commit-message.py и определения lib/message.py.

Зачем: сообщения остаются в публичной истории; страж, который судит файл сообщения целиком, краснит
    то, что git выбросит (diff при -v), и пропускает то, что git оставит (строки на решётку при -m и -F).
Проверяет: красную пробу на каждое правило (подпись, подпись не автора, соавтор, не ASCII, адрес
    автора, путь машины, запрещённое имя, пустое сообщение, «#N» номера задачи); режимы editor, message и --commit,
    режим --ci; строки на решётку (в сообщении они в истории, в редакторе — нет), строки цитаты,
    режим с diff и строку-ножницы; значение из списка нигде не печатается (с положительным контролем);
    R8 «#<число> только как ссылка на issue или PR GitHub»: красное голое «#31», «task #94», «(#31 «title»)»,
    «#031» в начале строки, зелёное «Fixes #12», «Refs #3», «see PR #7», «Closes: #4, #5», «#cfg(...)», цвет, строка
    цитаты на «>» и комментарий редактора; режим --commit и --commit --ci (проверка пуша и CI).
Не проверяет: сам хук commit-msg (test-commit-msg.py).
Правило: AGENTS.md п.4, п.15; AC-09, AC-32 задачи.

Режим задаётся аргументом в каждой пробе явно. Список имён и образцы собираются при прогоне.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

import message  # noqa: E402

NAME = "Test Author"
EMAIL = "author@example.test"
SIGN = "Signed-off-by: %s <%s>" % (NAME, EMAIL)
P1 = "zorblax" + "-" + "project"
WIN = "E" + ":/" + "Projects" + "/" + "alpha" + "/f.txt"
CYR = "привет"
SCISSORS = message.SCISSORS
SERVICE = message.SERVICE


def main():
    pr = stlib.Probes("guard-commit-message")
    base = pr.mkdtemp()
    env0 = stlib.isolated_env(base)
    names = stlib.names_file(base, ["# list", P1])
    env = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
    repo = stlib.make_repo(base, env, {"a.txt": "x\n"})
    stlib.git(repo, env, "config", "crewharness.expectedEmail", EMAIL)
    counter = [0]

    def write_msg(text):
        counter[0] += 1
        path = os.path.join(base, "msg%d.txt" % counter[0])
        with open(path, "wb") as handle:
            handle.write(text.encode("utf-8"))
        return path

    def run(text, mode, *extra, **kw):
        e = kw.get("env", env)
        r = kw.get("repo", repo)
        return stlib.guard("guard-commit-message.py", r, e, "--message-file", write_msg(text), "--mode", mode, *extra)

    def good(subject="Add a thing"):
        return "%s\n\nBody line.\n\n%s\n" % (subject, SIGN)

    def red(text, mode, rule, line=None, count=1, extra=()):
        def fn():
            proc = run(text, mode, *extra)
            stlib.expect(proc, 1, "FAIL: guard-commit-message: %d нарушений" % count)
            tail = "%s: %s:" % ("сообщение коммита" + (":%d" % line if line else ""), rule)
            assert stlib.has_line(proc, "FAIL " + tail), proc.out
            assert P1 not in proc.out and WIN not in proc.out, "значение напечатано"
        return fn

    def legit(text, mode, *extra, **kw):
        def fn():
            stlib.expect(run(text, mode, *extra, **kw), 0, "ок: осмотрено 1 сообщений")
        return fn

    def editor_good_with_template_and_diff():
        text = good() + "# Please enter the commit message\n# %s\n" % CYR + SCISSORS + "\n" + SERVICE + "\n# Everything below it will be ignored.\ndiff --git a/x b/x\n+" + CYR + " " + P1 + "\n-" + WIN + "\n"
        stlib.expect(run(text, "editor"), 0, "ок: осмотрено 1 сообщений")

    def verbose_diff_name_in_message_red():
        text = good("Mention " + P1) + SCISSORS + "\n" + SERVICE + "\ndiff\n+x\n"
        proc = run(text, "editor")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "FAIL сообщение коммита:1: forbidden-name: образец №1"), proc.out

    def scissors_with_f_no_verbose_tail_judged():
        text = good() + SCISSORS + "\ntail " + P1 + "\n"
        stlib.expect(run(text, "message"), 1, "FAIL: guard-commit-message: 1 нарушений")

    def scissors_with_verbose_config_cut():
        stlib.git(repo, env, "config", "commit.verbose", "true")
        try:
            text = good() + SCISSORS + "\ntail " + P1 + "\n"
            stlib.expect(run(text, "message"), 0, "ок: осмотрено 1 сообщений")
        finally:
            stlib.git(repo, env, "config", "--unset", "commit.verbose")

    def typed_scissors_without_service_line_judged():
        text = good() + SCISSORS + "\ntail " + P1 + "\n"
        stlib.expect(run(text, "editor"), 1, "FAIL: guard-commit-message: 1 нарушений")

    def hash_line_in_message_mode_red_editor_ok():
        text = good() + "# note " + P1 + "\n"
        proc = run(text, "message")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "forbidden-name"), proc.out
        stlib.expect(run(text, "editor"), 0, "ок: осмотрено 1 сообщений")

    def hash_cyrillic_message_red_editor_ok():
        text = good() + "# " + CYR + "\n"
        stlib.expect(run(text, "message"), 1, "FAIL: guard-commit-message: 1 нарушений")
        stlib.expect(run(text, "editor"), 0, "ок: осмотрено 1 сообщений")

    def quote_line_name_red_both_cyrillic_ok():
        stlib.expect(run(good() + "> " + CYR + " quote\n", "message"), 0, "ок: осмотрено 1 сообщений")
        for mode in ("message", "editor"):
            proc = run(good() + "> quote " + P1 + "\n", mode)
            stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")

    def empty_editor_only_comments():
        stlib.expect(run("# only comments\n\n", "editor"), 1, "FAIL: guard-commit-message: 1 нарушений")

    def empty_message():
        proc = run("", "message")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "empty-message"), proc.out

    def crlf_message_file():
        text = good().replace("\n", "\r\n")
        stlib.expect(run(text, "message"), 0, "ок: осмотрено 1 сообщений")

    def no_email_setting():
        env2 = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
        repo2 = stlib.make_repo(base, env2, {"a.txt": "x\n"}, name="noset")
        proc = run(good(), "message", repo=repo2, env=env2)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "запусти установщик"), proc.out
        env3 = dict(env2, GITHUB_ACTIONS="true")
        proc = run(good(), "message", repo=repo2, env=env3)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "запусти установщик"), proc.out

    def ci_no_setting_nothing_to_judge():
        env2 = dict(env0, CREW_PRIVATE_NAMES_FILE=names)
        repo2 = stlib.make_repo(base, env2, {"a.txt": "x\n"}, name="noset2")
        proc = run(good(), "message", "--ci", repo=repo2, env=env2)
        stlib.expect(proc, 0, "ок: осмотрено 1 сообщений")
        assert stlib.has_line(proc, "судить нечего: CI, нет настройки установщика"), proc.out

    def email_mismatch():
        stlib.git(repo, env, "config", "crewharness.expectedEmail", "other@example.test")
        try:
            proc = run(good(), "message")
            stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
            assert stlib.has_line(proc, "expected-email: адрес автора не совпадает"), proc.out
            stlib.expect(run(good(), "message", "--ci"), 0, "ок: осмотрено 1 сообщений")
        finally:
            stlib.git(repo, env, "config", "crewharness.expectedEmail", EMAIL)

    def no_names_list():
        e = dict(env0, CREW_PRIVATE_NAMES_FILE=os.path.join(base, "absent.txt"))
        proc = run(good(), "message", env=e)
        stlib.expect(proc, 1, "FAIL: предпосылка")

    def missing_arguments():
        proc = stlib.guard("guard-commit-message.py", repo, env)
        stlib.expect(proc, 1, "FAIL: предпосылка")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--message-file", write_msg(good()))
        stlib.expect(proc, 1, "FAIL: предпосылка")

    # --- режим --commit ---------------------------------------------------------------------
    def make_commit(message_text, author_email=None, name="c"):
        path = write_msg(message_text)
        e = dict(env)
        if author_email:
            e["GIT_AUTHOR_EMAIL"] = author_email
        stlib.write_files(repo, {"f_%s_%d.txt" % (name, counter[0]): "x\n"})
        stlib.git(repo, e, "add", "--", "f_%s_%d.txt" % (name, counter[0]))
        stlib.git(repo, e, "commit", "-q", "-F", path)
        return stlib.git(repo, env, "rev-parse", "HEAD").out.strip()

    def commit_good():
        sha = make_commit(good())
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 0, "ок: осмотрено 1 сообщений")

    def commit_no_signoff():
        sha = make_commit("Plain subject\n")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "signoff-missing"), proc.out

    def commit_other_signoff():
        sha = make_commit("Subj\n\nSigned-off-by: Someone Else <else@example.test>\n")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "signoff-author"), proc.out

    def commit_coauthor():
        sha = make_commit(good() + "Co-Authored-By: Bot <bot@example.test>\n")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "co-authored-by"), proc.out

    def commit_ci_author_vs_signoff():
        sha = make_commit(good(), author_email="stranger@example.test")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha, "--ci")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
        assert stlib.has_line(proc, "signoff-author"), proc.out
        sha2 = make_commit("Subj\n\nSigned-off-by: Test Author <stranger@example.test>\n",
                           author_email="stranger@example.test")
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha2, "--ci")
        stlib.expect(proc, 0, "ок: осмотрено 1 сообщений")

    def commit_ci_signoff_matches_author():
        e = dict(env, GIT_AUTHOR_NAME="Alt Person", GIT_AUTHOR_EMAIL="alt@example.test")
        path = write_msg("Subj\n\nSigned-off-by: Alt Person <alt@example.test>\n")
        stlib.write_files(repo, {"alt.txt": "x\n"})
        stlib.git(repo, e, "add", "--", "alt.txt")
        stlib.git(repo, e, "commit", "-q", "-F", path)
        sha = stlib.git(repo, env, "rev-parse", "HEAD").out.strip()
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha, "--ci")
        stlib.expect(proc, 0, "ок: осмотрено 1 сообщений")
        assert stlib.has_line(proc, "судить нечего: CI, нет настройки установщика"), proc.out
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")  # локально адрес не равен ожидаемому

    def commit_private_in_message():
        sha = make_commit(good("Path " + WIN + " and " + P1))
        proc = stlib.guard("guard-commit-message.py", repo, env, "--commit", sha)
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 2 нарушений")
        assert P1 not in proc.out and WIN not in proc.out
        assert stlib.has_line(proc, "machine-path") and stlib.has_line(proc, "образец №1"), proc.out

    def positive_control():
        proc = run(good("Mention " + P1), "message")
        assert "образец №1" in proc.out, "положительный контроль"
        assert proc.out.count(P1) == 0 and proc.err.count(P1) == 0

    # --- R8: «#N» номера задачи (задача 086): ссылка на issue или PR GitHub допустима, номер задачи - нет ------------
    def hash_ok(body, mode="message"):
        return legit(good() + body + "\n", mode)

    def hash_red(body, mode="message", line=6):
        return red(good() + body + "\n", mode, "task-hash", line=line)

    def hash_red_in_subject():
        for subject in ("Task #31 follows", "Fix (#31 \"title\")", "#031 first"):
            proc = run(good(subject), "message")
            stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
            assert stlib.has_line(proc, "FAIL сообщение коммита:1: task-hash:"), proc.out
        assert stlib.has_line(proc, "номер задачи пишется тремя цифрами без #; #N закреплено за номером issue GitHub"), proc.out

    def hash_diagnostic_text():
        proc = run(good() + "task #94 done\n", "message")
        assert stlib.has_line(proc, "FAIL сообщение коммита:6: task-hash: номер задачи пишется тремя цифрами без #; #N закреплено за номером issue GitHub"), proc.out

    def hash_two_in_one_line_one_violation_each():
        proc = run(good() + "a #31 and b #94\n", "message")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 2 нарушений")

    def hash_editor_comment_not_judged():
        text = good() + "# task #31 in the template\n"
        stlib.expect(run(text, "editor"), 0, "ок: осмотрено 1 сообщений")

    def hash_comment_line_in_message_mode_judged():
        proc = run(good() + "# done as #31 here\n", "message")
        stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")

    def hash_commit_mode(text, red_expected, ci=False):
        def fn():
            sha = make_commit(text)
            args = ("--commit", sha) + (("--ci",) if ci else ())
            proc = stlib.guard("guard-commit-message.py", repo, env, *args)
            if red_expected:
                stlib.expect(proc, 1, "FAIL: guard-commit-message: 1 нарушений")
                assert stlib.has_line(proc, "task-hash"), proc.out
            else:
                stlib.expect(proc, 0, "ок: осмотрено 1 сообщений")
        return fn

    sign = good()
    pr.probe("законное", "правильное сообщение, режим message", legit(sign, "message"))
    pr.probe("законное", "правильное сообщение, режим editor", legit(sign, "editor"))
    pr.probe("законное", "CRLF в файле сообщения", crlf_message_file)
    pr.probe("законное", "редактор: комментарии и diff за ножницами не судятся", editor_good_with_template_and_diff)
    pr.probe("законное", "строка на «>» с кириллицей без приватных данных", quote_line_name_red_both_cyrillic_ok)
    pr.probe("законное", "# с именем: message — красный, editor — не судится", hash_line_in_message_mode_red_editor_ok)
    pr.probe("законное", "# с кириллицей: message — красный, editor — проходит", hash_cyrillic_message_red_editor_ok)
    pr.probe("законное", "commit.verbose: хвост за ножницами при -F отрезан", scissors_with_verbose_config_cut)
    pr.probe("законное", "режим --commit: правильный коммит", commit_good)
    pr.probe("законное", "режим --ci: адрес не сверяется, подпись равна автору", commit_ci_signoff_matches_author)
    pr.probe("законное", "режим --ci без настройки: судить нечего по правилу адреса", ci_no_setting_nothing_to_judge)
    pr.probe("красная", "нет Signed-off-by", red("Subject only\n", "message", "signoff-missing"))
    pr.probe("красная", "подпись не автора (имя)", red("S\n\nSigned-off-by: Other Name <%s>\n" % EMAIL, "message", "signoff-author"))
    pr.probe("красная", "подпись не автора (адрес)", red("S\n\nSigned-off-by: %s <x@example.test>\n" % NAME, "message", "signoff-author"))
    pr.probe("красная", "Co-Authored-By", red(good() + "Co-Authored-By: Bot <b@example.test>\n", "message", "co-authored-by", line=6))
    pr.probe("красная", "co-authored-by строчными буквами", red(good() + "co-authored-by: Bot <b@example.test>\n", "message", "co-authored-by", line=6))
    pr.probe("красная", "не ASCII в теме", red(good(CYR + " title"), "message", "non-ascii", line=1))
    pr.probe("красная", "путь машины в теле", red(good("Fix " + WIN), "message", "machine-path", line=1))
    pr.probe("красная", "запрещённое имя в теме", red(good("Mention " + P1), "message", "forbidden-name", line=1))
    pr.probe("красная", "пустое сообщение", empty_message)
    pr.probe("красная", "в редакторе остались одни комментарии", empty_editor_only_comments)
    pr.probe("красная", "нет настройки установщика (в том числе при GITHUB_ACTIONS)", no_email_setting)
    pr.probe("красная", "адрес автора не равен настройке", email_mismatch)
    pr.probe("красная", "нет списка запрещённых имён", no_names_list)
    pr.probe("красная", "режим --commit: нет подписи", commit_no_signoff)
    pr.probe("красная", "режим --commit: подпись не автора", commit_other_signoff)
    pr.probe("красная", "режим --commit: Co-Authored-By", commit_coauthor)
    pr.probe("красная", "режим --commit: путь машины и имя в теме", commit_private_in_message)
    pr.probe("красная", "поиск значения в выводе: 0 с положительным контролем", positive_control)
    pr.probe("законное", "R8: Fixes #12, Closes #4, Resolves #5", hash_ok("Fixes #12\nCloses #4\nResolves #5"))
    pr.probe("законное", "R8: Refs #3, see PR #7, Issue #8, Pull request #9, FIXED #1", hash_ok("Refs #3\nsee PR #7\nIssue #8\nPull request #9\nFIXED #1"))
    pr.probe("законное", "R8: список ссылок «Closes: #4, #5 and #6»", hash_ok("Closes: #4, #5 and #6"))
    pr.probe("законное", "R8: не число - #cfg(target_os), цвета #ff00ff и #123abc, заголовок «# Title»", hash_ok("Use #cfg(target_os) and #ff00ff and #123abc\n# Title"))
    pr.probe("законное", "R8: строка цитаты на «>» с номером", hash_ok("> task #31 was said"))
    pr.probe("законное", "R8: сущность &#31;, адрес чужого репозитория и якорь в слове", hash_ok("entity &#31; and nv-lang/nova#3 and file.md#12"))
    pr.probe("законное", "R8: комментарий редактора с #N не судится", hash_editor_comment_not_judged)
    pr.probe("законное", "R8: --commit, ссылка на issue", hash_commit_mode(good("Fix a thing").replace("Body line.", "Fixes #12"), False))
    pr.probe("законное", "R8: --commit --ci, ссылка на PR", hash_commit_mode(good("Fix a thing").replace("Body line.", "see PR #7"), False, ci=True))
    pr.probe("красная", "R8: голое #31 в теле", hash_red("Follow-up of #31"))
    pr.probe("красная", "R8: task #94", hash_red("task #94 landed"))
    pr.probe("красная", "R8: (#31 «title») в скобках", hash_red("Done (#31 \"title\")"))
    pr.probe("красная", "R8: тема с #31, #031 и номером в начале строки", hash_red_in_subject)
    pr.probe("красная", "R8: текст диагностики и номер строки", hash_diagnostic_text)
    pr.probe("красная", "R8: два номера в строке - два нарушения", hash_two_in_one_line_one_violation_each)
    pr.probe("красная", "R8: -m печатает строку на решётку как есть - судится", hash_comment_line_in_message_mode_judged)
    pr.probe("красная", "R8: --commit (проверка пуша), голое #31", hash_commit_mode(good("Fix").replace("Body line.", "Part of #31"), True))
    pr.probe("красная", "R8: --commit --ci (CI), голое #31", hash_commit_mode(good("Fix").replace("Body line.", "Part of #31"), True, ci=True))
    pr.probe("иной-синтаксис", "режим с diff: имя в самом сообщении — красный", verbose_diff_name_in_message_red)
    pr.probe("иной-синтаксис", "-F без режима с diff: имя за ножницами судится", scissors_with_f_no_verbose_tail_judged)
    pr.probe("иной-синтаксис", "набранная руками ножницы без служебной строки судятся", typed_scissors_without_service_line_judged)
    pr.probe("иной-синтаксис", "режим --commit --ci: автор и подпись с разными адресами", commit_ci_author_vs_signoff)
    pr.probe("мишень", "не указан ни файл сообщения, ни коммит; нет режима", missing_arguments)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
