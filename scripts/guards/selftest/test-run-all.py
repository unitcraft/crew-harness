# -*- coding: utf-8 -*-
"""Самотест общего запуска стражей run-all.sh и поиска интерпретатора find-python.sh.

Зачем: общий запуск решает код возврата для хука и CI; если он примет молчаливого или упавшего
    стража за зелёного, вся маска check-* перестанет что-либо гарантировать.
Проверяет: счёт вердиктов по четырём видам, красный при FAIL, при отсутствии вердикта, при
    расхождении кода с вердиктом, при «пропущено» в режиме --ci, при пустой маске, передачу
    аргументов стражам, стражей на sh, поиск интерпретатора.
Не проверяет: правила конкретных стражей; хук pre-commit (его проверяет test-pre-commit.py).
Правило: AGENTS.md п.8, контракт вердиктов REQ-35, подключение по маске REQ-24.
"""
import sys

sys.dont_write_bytecode = True

import os
import shutil

import stlib

RUN_ALL = os.path.join(stlib.GUARDS, "run-all.sh")
FIND = os.path.join(stlib.LIB, "find-python.sh")


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def py_guard(verdict, code=0, extra=""):
    return ("import sys\nsys.stdout.reconfigure(encoding='utf-8')\n%s\n"
            "print(%r)\nsys.exit(%d)\n") % (extra, verdict, code)


def main():
    pr = stlib.Probes("run-all")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    repo = stlib.make_repo(base, env, {"a.txt": "x\n"})

    def make_dir(name, guards):
        folder = os.path.join(base, name)
        os.makedirs(folder, exist_ok=True)
        for fname, text in guards.items():
            write(os.path.join(folder, fname), text)
        return folder

    def run_all(folder, *args):
        return stlib.run(("sh", RUN_ALL, "--dir", folder) + args, cwd=repo, env=env)

    def legit():
        folder = make_dir("g1", {
            "check-a.py": py_guard("ок: осмотрено 2 файлов"),
            "check-b.py": py_guard("судить нечего: индекс пуст"),
            "check-c.sh": "echo 'ок: осмотрено 1 файлов'\n",
            "notes.txt": "не страж\n",
        })
        proc = run_all(folder)
        assert proc.returncode == 0, proc.out + proc.err
        assert "итого: ок 2, судить нечего 1, пропущено 0, FAIL 0" in proc.out, proc.out
        assert "check-a.py -> ок: осмотрено 2 файлов" in proc.out, proc.out
        assert "notes.txt" not in proc.out, "не по маске запущен"

    def skipped_local_green_ci_red():
        folder = make_dir("g2", {"check-s.py": py_guard("пропущено: нет инструмента")})
        local = run_all(folder)
        assert local.returncode == 0 and "пропущено 1" in local.out, local.out
        ci = run_all(folder, "--ci")
        assert ci.returncode == 1 and "в CI пропуск" in ci.out, ci.out

    def red_guard():
        folder = make_dir("g3", {
            "check-ok.py": py_guard("ок: осмотрено 1 файлов"),
            "check-bad.py": py_guard("FAIL: check-bad: 1 нарушений", 1,
                                     "print('FAIL a.txt:3: rule: описание')"),
        })
        proc = run_all(folder)
        assert proc.returncode == 1, proc.out
        assert "FAIL a.txt:3: rule: описание" in proc.out, "строка нарушения потеряна"
        assert "итого: ок 1, судить нечего 0, пропущено 0, FAIL 1" in proc.out

    def crash_without_verdict():
        folder = make_dir("g4", {"check-crash.py": "raise SystemExit(3)\n"})
        proc = run_all(folder)
        assert proc.returncode == 1 and "вердикта нет" in proc.out, proc.out

    def ok_with_bad_code():
        folder = make_dir("g5", {"check-liar.py": py_guard("ок: осмотрено 1 файлов", 1)})
        proc = run_all(folder)
        assert proc.returncode == 1 and "не совпал" in proc.out, proc.out

    def fail_with_zero_code():
        folder = make_dir("g6", {"check-liar.py": py_guard("FAIL: x: 1 нарушений", 0)})
        proc = run_all(folder)
        assert proc.returncode == 1, proc.out

    def args_pass_through():
        folder = make_dir("g7", {})
        write(os.path.join(folder, "check-args.py"), (
            "import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
            "print('args=' + ' '.join(a if i != 1 else 'ROOT' for i, a in enumerate(sys.argv[1:])))\n"
            "print('ок: осмотрено %d аргументов' % len(sys.argv[1:]))\n"))
        proc = run_all(folder, "--index", "--ci", "--root", repo)
        assert "осмотрено 4 аргументов" in proc.out, proc.out
        assert "args=--root ROOT --index --ci" in proc.out, proc.out

    def no_guards_is_red():
        folder = make_dir("g8", {"readme.txt": "пусто\n"})
        proc = run_all(folder)
        assert proc.returncode == 1 and "FAIL: мишень потеряна" in proc.out, proc.out

    def missing_dir_is_red():
        proc = run_all(os.path.join(base, "нет-такой"))
        assert proc.returncode == 1 and "FAIL: мишень потеряна" in proc.out, proc.out

    def stderr_is_shown():
        folder = make_dir("g9", {"check-e.py": (
            "import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
            "sys.stderr.write('warning-text\\n')\nprint('ок: осмотрено 1 файлов')\n")})
        proc = run_all(folder)
        assert proc.returncode == 0 and "warning-text" in proc.out, proc.out

    def python_found():
        proc = stlib.run(("sh", "-c", ". '%s'; find_python && echo \"$PYTHON\"" % FIND.replace("\\", "/")),
                         env=env)
        assert proc.returncode == 0 and proc.out.strip(), (proc.out, proc.err)

    def python_missing_is_red():
        shim = os.path.join(base, "shim")
        os.makedirs(shim, exist_ok=True)
        e = dict(env, GUARDS_PYTHON_CANDIDATES="no-such-python-1,no-such-python-2 -3")
        proc = stlib.run(("sh", "-c", ". '%s'; find_python" % FIND.replace("\\", "/")), env=e)
        assert proc.returncode == 1 and "FAIL: предпосылка" in proc.err, (proc.returncode, proc.err)
        folder = make_dir("g10", {"check-a.py": py_guard("ок: осмотрено 1 файлов")})
        proc = stlib.run(("sh", RUN_ALL, "--dir", folder), cwd=repo, env=e)
        assert proc.returncode == 1 and "ок:" not in proc.out, (proc.out, proc.err)

    SELFTESTS = os.path.join(stlib.GUARDS, "selftest", "run-selftests.sh")
    NL = chr(10)
    GOOD_TEST = NL.join(["print('проба законное a: ок')", "print('проба красная b: ок')",
                         "print('проба иной-синтаксис c: ок')", "print('проба мишень d: ок')",
                         "print('итого: 4 проб, упало 0')", ""])
    BAD_SHAPE = NL.join(["print('проба красная x: ок')", "print('итого: 1 проб, упало 0')", ""])
    RED_TEST = NL.join(["import sys", "print('проба законное x: FAIL')", "print('итого: 1 проб, упало 1')",
                        "sys.exit(1)", ""])
    SILENT_TEST = "print('что-то')" + NL

    def selftests_runner(tests):
        folder = os.path.join(base, "rs%d" % len(os.listdir(base)))
        os.makedirs(os.path.join(folder, "selftest"))
        os.makedirs(os.path.join(folder, "lib"))
        shutil.copy(SELFTESTS, os.path.join(folder, "selftest", "run-selftests.sh"))
        shutil.copy(FIND, os.path.join(folder, "lib", "find-python.sh"))
        for name, text in tests.items():
            write(os.path.join(folder, "selftest", name), text)
        return stlib.run(("sh", os.path.join(folder, "selftest", "run-selftests.sh")), env=dict(env, PYTHONIOENCODING="utf-8"))

    def selftests_good():
        proc = selftests_runner({"test-a.py": GOOD_TEST})
        assert proc.returncode == 0 and proc.out.strip().splitlines()[-1] == "ок: осмотрено 1 самотестов, упало 0", proc.out

    def selftests_bad_shape_and_failures():
        proc = selftests_runner({"test-a.py": GOOD_TEST, "test-bad.py": BAD_SHAPE,
                                 "test-red.py": RED_TEST, "test-silent.py": SILENT_TEST})
        assert proc.returncode == 1 and "FAIL: самотесты: упало 3 из 4" in proc.out, proc.out
        assert "нет законной пробы первой" in proc.out, proc.out

    def selftests_none():
        proc = selftests_runner({})
        assert proc.returncode == 1 and "FAIL: мишень потеряна" in proc.out, proc.out

    pr.probe("законное", "три стража (два Python, один sh): счёт и код 0", legit)
    pr.probe("законное", "run-selftests: хороший самотест принят", selftests_good)
    pr.probe("красная", "run-selftests: плохая форма, упавший и молчащий самотесты красные", selftests_bad_shape_and_failures)
    pr.probe("мишень", "run-selftests: нет самотестов - мишень потеряна", selftests_none)
    pr.probe("законное", "«пропущено» локально зелёное, в CI красное", skipped_local_green_ci_red)
    pr.probe("законное", "аргументы --root, --index, --ci доходят до стражей", args_pass_through)
    pr.probe("законное", "вывод ошибок стража не теряется", stderr_is_shown)
    pr.probe("законное", "рабочий Python найден", python_found)
    pr.probe("красная", "страж с FAIL: код 1, строка нарушения и счёт", red_guard)
    pr.probe("красная", "страж упал без вердикта", crash_without_verdict)
    pr.probe("красная", "«ок» при коде 1 не принимается", ok_with_bad_code)
    pr.probe("иной-синтаксис", "FAIL при коде 0 не принимается", fail_with_zero_code)
    pr.probe("мишень", "ни одного check-* — мишень потеряна", no_guards_is_red)
    pr.probe("мишень", "папки стражей нет — мишень потеряна", missing_dir_is_red)
    pr.probe("мишень", "нет рабочего интерпретатора — красный с подсказкой", python_missing_is_red)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
