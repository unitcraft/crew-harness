# -*- coding: utf-8 -*-
"""Самотест скрипта маскирования значений секрета в журнале CI ci-mask.sh.

Зачем: если скрипт исказит значение (съест обратную косую, раскроет звёздочку, потеряет последнюю строку),
    маскироваться будет не то, что напечатает страж, и значение попадёт в публичный журнал.
Проверяет: вывод скрипта сравнивается побайтово с ожидаемым под sh и, где они есть, под dash и bash:
    CRLF и LF, пустые строки и комментарии, пробел внутри значения, ведущий и хвостовой пробел,
    обратная косая (значение вроде a, косая, new, косая, tools, косая, x), процент, звёздочка, кавычки, кириллица, нет перевода
    строки в конце, пустая и не заданная переменная, неверное имя переменной.
Не проверяет: сам журнал GitHub (проба AC-31 в Actions).
Правило: ADR-0006; REQ-04 и AC-31 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os
import shutil

import stlib

SCRIPT = os.path.join(stlib.GUARDS, "ci-mask.sh")
BS = chr(92)
CYR = "имя"


def shell_works(shell, env):
    """Оболочка есть и исполняет сам скрипт (на машине bash.exe бывает заглушкой WSL, не видящей путей Windows)."""
    if not shutil.which(shell):
        return False
    try:
        proc = stlib.run((shell, SCRIPT, "CREW_TEST_PROBE"), env=dict(env, CREW_TEST_PROBE="x"))
    except OSError:
        return False
    return proc.returncode == 0 and proc.stdout == b"::add-mask::x\n"


def main():
    pr = stlib.Probes("ci-mask")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    shells = [s for s in ("sh", "dash", "bash") if shell_works(s, env)]

    def run(shell, value, name="CREW_TEST_LIST", unset=False):
        e = dict(env)
        if not unset:
            e[name] = value
        return stlib.run((shell, SCRIPT, name), env=e)

    def expect_all(value, expected_lines, **kw):
        want = "".join("::add-mask::" + x + "\n" for x in expected_lines).encode("utf-8")
        for shell in shells:
            proc = run(shell, value, **kw)
            assert proc.returncode == 0, (shell, proc.err)
            assert proc.stdout == want, "%s: %r вместо %r" % (shell, proc.stdout, want)

    def two_values_lf_and_crlf():
        expect_all("alpha-one\nbeta-two\n", ["alpha-one", "beta-two"])
        expect_all("alpha-one\r\nbeta-two\r\n", ["alpha-one", "beta-two"])

    def blanks_and_comments():
        expect_all("# comment\n\n   \nalpha\n  # indented comment\nbeta\n", ["alpha", "beta"])

    def no_trailing_newline():
        expect_all("alpha\nlast-without-newline", ["alpha", "last-without-newline"])

    def inner_space():
        expect_all("two words here\n", ["two words here"])

    def edge_spaces():
        expect_all("  padded  \n", ["padded", "  padded  "])

    def backslashes():
        value = "a" + BS + "new" + BS + "tools" + BS + "x"
        expect_all(value + "\n", [value])
        expect_all("C" + BS + "dir" + BS + "t" + BS + "n" + BS + "\n", ["C" + BS + "dir" + BS + "t" + BS + "n" + BS])

    def special_characters():
        expect_all("50% *glob* \"q\" 'sq' $HOME `tick`\n", ["50% *glob* \"q\" 'sq' $HOME `tick`"])
        expect_all("a%sb%d\n", ["a%sb%d"])

    def cyrillic():
        expect_all(CYR + "\n", [CYR])

    def empty_and_unset():
        for shell in shells:
            proc = run(shell, "")
            assert proc.returncode == 0 and proc.stdout == b"", (shell, proc.stdout)
            proc = run(shell, "", unset=True)
            assert proc.returncode == 0 and proc.stdout == b"", (shell, proc.stdout)

    def bad_name():
        for shell in shells:
            for bad in ("", "1ABC", "A-B", "A;B", "A B"):
                proc = stlib.run((shell, SCRIPT, bad), env=env) if bad else stlib.run((shell, SCRIPT), env=env)
                assert proc.returncode == 2 and proc.stdout == b"", (shell, bad, proc.returncode)

    def injection_is_not_executed():
        marker = os.path.join(base, "injected.txt")
        for shell in shells:
            proc = stlib.run((shell, SCRIPT, "CREW_TEST_LIST; touch '%s'" % marker.replace(BS, "/")), env=env)
            assert proc.returncode == 2
        assert not os.path.exists(marker), "имя переменной исполнено как команда"

    pr.probe("законное", "два значения, LF и CRLF", two_values_lf_and_crlf)
    pr.probe("законное", "пустые строки и комментарии пропускаются", blanks_and_comments)
    pr.probe("законное", "последняя строка без перевода строки", no_trailing_newline)
    pr.probe("законное", "пробел внутри значения", inner_space)
    pr.probe("законное", "кириллица", cyrillic)
    pr.probe("красная", "обратные косые сохраняются (a" + BS + "new" + BS + "tools" + BS + "x)", backslashes)
    pr.probe("красная", "процент, звёздочка, кавычки, знак доллара", special_characters)
    pr.probe("красная", "ведущий и хвостовой пробел: маскируется и с ними, и без них", edge_spaces)
    pr.probe("иной-синтаксис", "имя переменной не исполняется как команда", injection_is_not_executed)
    pr.probe("мишень", "пустая и не заданная переменная - ничего не печатается", empty_and_unset)
    pr.probe("мишень", "неверное имя переменной - код 2", bad_name)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
