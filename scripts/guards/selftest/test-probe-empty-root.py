# -*- coding: utf-8 -*-
"""Самотест прогона на пустом корне probe-empty-root.sh.

Зачем: прогон, который сам не умеет краснеть на «ок» при пустоте, ничего не доказывает; здесь он проверяется
    на выдуманных стражах - честном и лгущем.
Проверяет: честный страж (на пустоте красный или «судить нечего») - итог «ок», в таблице три строки на
    стража; лгущий страж (печатает «ок: осмотрено 0» на пустоте) - прогон красный и называет провал;
    страж с неизвестной формой вердикта - красный; нет стражей - мишень потеряна; на настоящих стражах
    прогон зелёный и в его таблице нет ни одного «ок:».
Не проверяет: самих настоящих стражей по правилам (их самотесты).
Правило: AGENTS.md п.8; REQ-27, AC-18 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

PROBE = os.path.join(stlib.GUARDS, "probe-empty-root.sh")
HONEST = ("import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
          "print('FAIL: мишень потеряна: нет файлов')\nsys.exit(1)\n")
NOTHING = ("import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
           "print('судить нечего: пусто')\nsys.exit(0)\n")
LIAR = ("import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
        "print('ок: осмотрено 0 файлов')\nsys.exit(0)\n")
ODD = ("import sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
       "print('всё хорошо')\nsys.exit(0)\n")


def main():
    pr = stlib.Probes("probe-empty-root")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def guards(files):
        counter[0] += 1
        folder = os.path.join(base, "g%d" % counter[0])
        os.makedirs(folder)
        for name, text in files.items():
            with open(os.path.join(folder, name), "w", encoding="utf-8", newline="\n") as handle:
                handle.write(text)
        return folder

    def probe(folder):
        return stlib.run(("sh", PROBE, "--dir", folder), env=env)

    def honest():
        proc = probe(guards({"check-a.py": HONEST, "check-b.py": NOTHING}))
        assert proc.returncode == 0, proc.out
        assert proc.out.count(" | код ") == 6, proc.out
        assert proc.out.strip().splitlines()[-1] == "ок: осмотрено 6 запусков, «ок» на пустоте нет", proc.out
        for label in ("пустой репозиторий git", "папка без git", "пустой каркас"):
            assert label in proc.out, label

    def liar():
        proc = probe(guards({"check-a.py": HONEST, "check-liar.py": LIAR}))
        assert proc.returncode == 1 and "ПРОВАЛ" in proc.out, proc.out
        assert proc.out.strip().splitlines()[-1].startswith("FAIL: на пустоте"), proc.out

    def odd_verdict():
        proc = probe(guards({"check-odd.py": ODD}))
        assert proc.returncode == 1 and "вердикт не из допустимых" in proc.out, proc.out

    def no_guards():
        proc = probe(guards({"readme.txt": "x\n"}))
        assert proc.returncode == 1 and "FAIL: мишень потеряна" in proc.out, proc.out

    def real_guards():
        proc = stlib.run(("sh", PROBE), env=env)
        assert proc.returncode == 0, proc.out + proc.err
        assert "| ок:" not in proc.out, proc.out
        assert proc.out.strip().splitlines()[-1].startswith("ок: осмотрено"), proc.out

    pr.probe("законное", "честные стражи: шесть запусков, итог «ок»", honest)
    pr.probe("законное", "настоящие стражи: ни одного «ок» на пустоте", real_guards)
    pr.probe("красная", "страж, лгущий «ок» на пустоте, краснит прогон", liar)
    pr.probe("иной-синтаксис", "неизвестная форма вердикта краснит прогон", odd_verdict)
    pr.probe("мишень", "нет стражей - мишень потеряна", no_guards)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
