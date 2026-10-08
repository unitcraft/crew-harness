# -*- coding: utf-8 -*-
"""Самотест прогона «доказательство красного» prove-red.sh.

Зачем: прогон, который засчитывает самотест, проходящий и при заглушке «всегда успех», создаёт ложную
    уверенность в стражах; он сам должен краснеть на слабом самотесте и на заглушке, которая не запускается.
Проверяет: на выдуманных корнях, собранных в прогоне: сильный самотест (падает с заглушкой на красной
    пробе) засчитан; слабый самотест (проходит с заглушкой) не засчитан; заглушка с синтаксической ошибкой не
    засчитана; страж без самотеста не засчитан; самотест на .sh засчитывается; итог «доказано N из N»; на
    настоящем корне один страж доказывается, а рабочее дерево не меняется (git status до и после).
Не проверяет: полный прогон по всем настоящим стражам (его делает сам prove-red.sh на шаге приёмки).
Правило: AGENTS.md п.3 и п.11; REQ-26, AC-17 задачи.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

PROVE = os.path.join(stlib.GUARDS, "prove-red.sh")
GUARD_RED = "import sys\nprint('FAIL: x: 1 нарушений')\nsys.exit(1)\n"
TEST_STRONG = (
    "import os, subprocess, sys\n"
    "sys.stdout.reconfigure(encoding='utf-8')\n"
    "guard = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '%s')\n"
    "rc = subprocess.run([sys.executable, guard], stdout=subprocess.DEVNULL).returncode\n"
    "ok = rc == 1\n"
    "print('проба красная нарушение: ' + ('ок' if ok else 'FAIL'))\n"
    "print('итого: 1 проб, упало %d' % (0 if ok else 1))\n"
    "sys.exit(0 if ok else 1)\n"
)
TEST_WEAK = (
    "import sys\n"
    "sys.stdout.reconfigure(encoding='utf-8')\n"
    "print('проба красная нарушение: ок')\n"
    "print('итого: 1 проб, упало 0')\n"
)
TEST_SH = (
    "#!/bin/sh\n"
    "d=$(cd \"$(dirname \"$0\")/..\" && pwd)\n"
    "python \"$d/check-shy.py\" > /dev/null\n"
    "rc=$?\n"
    "if [ \"$rc\" -eq 1 ]; then echo 'проба красная нарушение: ок'; echo 'итого: 1 проб, упало 0'; exit 0; fi\n"
    "echo 'проба красная нарушение: FAIL'; echo 'итого: 1 проб, упало 1'; exit 1\n"
)


def main():
    pr = stlib.Probes("prove-red")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fixture(files):
        counter[0] += 1
        root = os.path.join(base, "fx%d" % counter[0])
        for rel, text in files.items():
            full = os.path.join(root, *rel.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(text)
        return root

    def prove(root, *args):
        return stlib.run(("sh", PROVE, "--root", root) + args, env=env)

    def strong():
        root = fixture({"scripts/guards/check-strong.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-strong.py": TEST_STRONG.replace("{GUARD}", "check-strong.py")})
        proc = prove(root)
        assert proc.returncode == 0 and "доказано scripts/guards/check-strong.py" in proc.out, proc.out
        assert proc.out.strip().splitlines()[-1] == "ок: доказано 1 из 1", proc.out

    def weak():
        root = fixture({"scripts/guards/check-weak.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-weak.py": TEST_WEAK})
        proc = prove(root)
        assert proc.returncode == 1 and "НЕ ДОКАЗАНО scripts/guards/check-weak.py" in proc.out, proc.out
        assert proc.out.strip().splitlines()[-1] == "FAIL: доказано 0 из 1", proc.out

    def mixed_count():
        root = fixture({"scripts/guards/check-strong.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-strong.py": TEST_STRONG.replace("{GUARD}", "check-strong.py"),
                        "scripts/guards/check-weak.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-weak.py": TEST_WEAK})
        proc = prove(root)
        assert proc.returncode == 1 and proc.out.strip().splitlines()[-1] == "FAIL: доказано 1 из 2", proc.out

    def broken_stub_not_counted():
        root = fixture({"scripts/guards/check-strong.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-strong.py": TEST_STRONG.replace("{GUARD}", "check-strong.py")})
        bad = os.path.join(base, "bad-stub.py")
        with open(bad, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("def (:\n")
        proc = prove(root, "--py-stub-file", bad)
        assert proc.returncode == 1 and "заглушка не исполняется" in proc.out, proc.out

    def no_selftest():
        root = fixture({"scripts/guards/check-lonely.py": GUARD_RED})
        proc = prove(root)
        assert proc.returncode == 1 and "нет самотеста" in proc.out, proc.out

    def sh_selftest():
        root = fixture({"scripts/guards/check-shy.py": GUARD_RED,
                        "scripts/guards/selftest/test-check-shy.sh": TEST_SH})
        proc = prove(root)
        assert proc.returncode == 0 and "доказано scripts/guards/check-shy.py" in proc.out, proc.out

    def sh_guard_stubbed_with_sh():
        guard_sh = "#!/bin/sh\necho 'FAIL: x: 1 нарушений'\nexit 1\n"
        test = TEST_STRONG.replace("{GUARD}", "check-shg.sh")
        test = test.replace("[sys.executable, guard]", "['sh', guard]")
        root = fixture({"scripts/guards/check-shg.sh": guard_sh, "scripts/guards/selftest/test-check-shg.py": test})
        proc = prove(root)
        assert proc.returncode == 0 and "доказано scripts/guards/check-shg.sh" in proc.out, proc.out

    def hook_stubbed_with_sh():
        hook = "#!/bin/sh\necho 'FAIL: x'\nexit 1\n"
        test = TEST_STRONG.replace("{GUARD}", "../githooks/pre-commit")
        test = test.replace("[sys.executable, guard]", "['sh', guard]")
        root = fixture({"scripts/githooks/pre-commit": hook, "scripts/guards/selftest/test-pre-commit.py": test})
        proc = prove(root)
        assert proc.returncode == 0 and "доказано scripts/githooks/pre-commit" in proc.out, proc.out

    def nothing_to_stub():
        root = fixture({"scripts/other.txt": "x\n"})
        proc = prove(root)
        assert proc.returncode == 1 and "FAIL: мишень потеряна" in proc.out, proc.out

    def real_root_one_guard_tree_unchanged():
        before = stlib.git(stlib.REPO, env, "status", "--porcelain").out
        proc = stlib.run(("sh", PROVE, "--only", "check-tests-have-checks"), env=env)
        after = stlib.git(stlib.REPO, env, "status", "--porcelain").out
        assert proc.returncode == 0 and proc.out.strip().splitlines()[-1] == "ок: доказано 1 из 1", proc.out
        assert before == after, "рабочее дерево изменилось"

    pr.probe("законное", "сильный самотест засчитан, итог «доказано 1 из 1»", strong)
    pr.probe("законное", "самотест на .sh засчитывается", sh_selftest)
    pr.probe("законное", "страж на sh подменяется заглушкой на sh", sh_guard_stubbed_with_sh)
    pr.probe("законное", "хук git подменяется заглушкой на sh", hook_stubbed_with_sh)
    pr.probe("законное", "настоящий корень: один страж, дерево не меняется", real_root_one_guard_tree_unchanged)
    pr.probe("красная", "слабый самотест (проходит с заглушкой) не засчитан", weak)
    pr.probe("красная", "счёт: один из двух доказан", mixed_count)
    pr.probe("иной-синтаксис", "заглушка с синтаксической ошибкой не засчитана", broken_stub_not_counted)
    pr.probe("иной-синтаксис", "страж без самотеста не засчитан", no_selftest)
    pr.probe("мишень", "в корне нет ни одного стража - мишень потеряна", nothing_to_stub)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
