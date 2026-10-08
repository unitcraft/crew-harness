# -*- coding: utf-8 -*-
"""Самотест стража форматов документов задач check-task-docs.py.

Зачем: статус и итог захода читает программа цикла; испорченная первая строка не видна в обзоре, а
    последствия (проверка заново поверх утверждённого документа) дороги.
Проверяет: правильные файлы всех четырёх видов проверки, spec.md и plan.md зелёные; красные —
    чужая первая строка статуса, заход без чисел, номер захода не равен номеру в имени, повторный
    REQ, AC, DNC в начале строки; упоминание номера не в начале строки и вложенные папки не судятся;
    журнал хода progress.log: законная проба на копиях настоящих отслеживаемых журналов (число
    осмотренных файлов сверено независимым счётчиком), красные пробы — порча тех же копий (строка не
    по форме, путь машины, подпись длиннее 80 знаков в индексе) и выдуманных журналов; предел подписи
    только у добавленных строк существующего журнала в индексе (в дереве и в коммите — нет, у первой
    версии журнала — нет); адрес сайта, k больше N, неверное поле времени, CRLF и пустая строка не
    красные; общий набор строк opencode-plugin/test/progress-vectors.json (его читает и плагин);
    общий запуск run-all.sh --ci на одноразовой копии принимает вердикт.
Не проверяет: содержание документов.
Правило: doc/canon/process.md (цикл сессий методики, «Журнал хода progress.log»); AC-14 и AC-18 задач.
"""
import sys

sys.dont_write_bytecode = True

import importlib.util
import json
import os
import re

import stlib

GOOD_REVIEW = "Заход %d: существенных 1, поверхностных 2, проб 3\n\nтекст\n"


def main():
    pr = stlib.Probes("check-task-docs")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]

    def fresh(files):
        counter[0] += 1
        return stlib.make_repo(base, env, files, name="r%d" % counter[0])

    def check(repo, *args):
        return stlib.guard("check-task-docs.py", repo, env, *args)

    good = {
        "doc/tasks/001-x/spec.md": "Статус: черновик\n\nREQ-01 a\nREQ-02 b\nAC-01 c\nDNC-01 d\n",
        "doc/tasks/001-x/plan.md": "Статус: утверждено, 2026-10-08, владелец\nБаза: ревизия abc, дата\n",
        "doc/tasks/001-x/spec-review-4.md": GOOD_REVIEW % 4,
        "doc/tasks/001-x/plan-review-2.md": GOOD_REVIEW % 2,
        "doc/tasks/001-x/review-3.md": GOOD_REVIEW % 3,
        "doc/tasks/001-x/delivery-review-1.md": GOOD_REVIEW % 1,
    }

    def red(change, rule, where, count=1):
        def fn():
            files = dict(good)
            files.update(change)
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-task-docs: %d нарушений" % count)
            assert stlib.has_line(proc, "FAIL %s: %s:" % (where, rule)), proc.out
        return fn

    def legit_all_kinds():
        stlib.expect(check(fresh(good)), 0, "ок: осмотрено 6 файлов задач")

    def legit_bom_crlf_and_extra():
        files = dict(good)
        files["doc/tasks/001-x/spec.md"] = b"\xef\xbb\xbf\xd0\xa1\xd1\x82\xd0\xb0\xd1\x82\xd1\x83\xd1\x81: \xd1\x87\xd0\xb5\xd1\x80\xd0\xbd\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xba\r\nREQ-01 a\r\n"
        files["doc/tasks/001-x/task/spec.md"] = "not judged: nested folder\n"
        files["doc/tasks/001-x/result.md"] = "Статус: в работе\n"
        files["doc/tasks/001-x/notes-review-9.md"] = "free text\n"
        proc = check(fresh(files))
        stlib.expect(proc, 0, "ок: осмотрено 6 файлов задач")

    def legit_id_mentions_not_at_line_start():
        files = dict(good)
        files["doc/tasks/001-x/spec.md"] = "Статус: черновик\n\nREQ-01 a\nsee REQ-01 and\n| REQ-01 | table |\n  REQ-01 indented\n"
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 6 файлов задач")

    def commit_mode_only_changed():
        repo = fresh(good)
        sha = stlib.commit_file(repo, env, "doc/tasks/001-x/plan-review-3.md", "no numbers here\n", "bad")
        stlib.expect(check(repo, "--commit", sha), 1, "FAIL: check-task-docs: 1 нарушений")
        sha2 = stlib.commit_file(repo, env, "other.txt", "x\n", "other")
        stlib.expect(check(repo, "--commit", sha2), 0, "судить нечего: коммит не меняет файлов этой мишени")

    def no_task_docs():
        stlib.expect(check(fresh({"README.md": "x\n"})), 1, "FAIL: мишень потеряна")

    def empty_repo():
        base2 = pr.mkdtemp()
        repo = os.path.join(base2, "e")
        os.makedirs(repo)
        stlib.git(repo, env, "init", "-q")
        stlib.expect(check(repo), 1, "FAIL: мишень потеряна")

    pr.probe("законное", "все четыре вида проверки, spec.md и plan.md", legit_all_kinds)
    pr.probe("законное", "BOM и CRLF в первой строке, вложенные папки и чужие имена не судятся", legit_bom_crlf_and_extra)
    pr.probe("законное", "номер не в начале строки не считается объявлением", legit_id_mentions_not_at_line_start)
    pr.probe("законное", "режим коммита: только изменённые файлы", commit_mode_only_changed)
    pr.probe("красная", "первая строка spec.md — чужая", red({"doc/tasks/001-x/spec.md": "Status: draft\n"}, "task-status", "doc/tasks/001-x/spec.md:1"))
    pr.probe("красная", "статус plan.md «в работе»", red({"doc/tasks/001-x/plan.md": "Статус: в работе\n"}, "task-status", "doc/tasks/001-x/plan.md:1"))
    pr.probe("красная", "заход без чисел", red({"doc/tasks/001-x/spec-review-4.md": "Заход 4: существенных нет\n"}, "review-line", "doc/tasks/001-x/spec-review-4.md:1"))
    pr.probe("красная", "номер захода не равен номеру в имени", red({"doc/tasks/001-x/review-3.md": GOOD_REVIEW % 5}, "review-line", "doc/tasks/001-x/review-3.md:1"))
    pr.probe("красная", "delivery-review без итоговой строки", red({"doc/tasks/001-x/delivery-review-1.md": "\n" + GOOD_REVIEW % 1}, "review-line", "doc/tasks/001-x/delivery-review-1.md:1"))
    pr.probe("красная", "повторный REQ", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nREQ-05 a\nREQ-05 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("красная", "повторный AC", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nAC-01 a\nAC-01 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("красная", "повторный DNC", red({"doc/tasks/001-x/spec.md": "Статус: черновик\nDNC-02 a\nDNC-02 b\n"}, "dup-id", "doc/tasks/001-x/spec.md:3"))
    pr.probe("иной-синтаксис", "строка статуса с регистром не в начале", red({"doc/tasks/001-x/plan.md": " Статус: утверждено\n"}, "task-status", "doc/tasks/001-x/plan.md:1"))
    pr.probe("иной-синтаксис", "пустой файл spec.md", red({"doc/tasks/001-x/spec.md": ""}, "task-status", "doc/tasks/001-x/spec.md:1"))
    pr.probe("мишень", "нет документов задач — мишень потеряна", no_task_docs)
    pr.probe("мишень", "пустой репозиторий — мишень потеряна", empty_repo)
    # ------------------------------------------------------------------------------------------------
    # журнал хода progress.log (REQ-16, AC-18)
    # ------------------------------------------------------------------------------------------------
    journal = "doc/tasks/001-x/progress.log"
    good_j = dict(good)
    good_j[journal] = "С1 0/2 старт\nС1 1/2 [10:05] шаг\nС1 2/2 [10:30] готово\n"
    disk = "D" + ":" + "/" + "Users/demo/project"  # образец пути машины собирается при прогоне, в файле его нет
    own_line = re.compile(r"^([^ \t]+) ([0-9]+)/([0-9]+) ([^\n]+)$")

    def red_j(change, rule, where, count=1):
        def fn():
            files = dict(good_j)
            files.update(change)
            proc = check(fresh(files))
            stlib.expect(proc, 1, "FAIL: check-task-docs: %d нарушений" % count)
            assert stlib.has_line(proc, "FAIL %s: %s:" % (where, rule)), proc.out
        return fn

    def real_journals():
        proc = stlib.run(("git", "ls-files", "-z", "--", "doc/tasks/*/progress.log"), cwd=stlib.REPO, env=env)
        names = [p for p in proc.out.split("\0") if p]
        files = {}
        for name in names:
            with open(os.path.join(stlib.REPO, *name.split("/")), "rb") as handle:
                files[name] = handle.read()
        assert len(files) >= 3, "мишень: отслеживаемых журналов меньше трёх (001, 002, 003): %d" % len(files)
        return files

    def legit_real_journals():
        files = real_journals()
        # независимый счётчик: файлы и строки по тем же копиям, своим регулярным выражением и делением по LF
        lines = 0
        wrong = 0
        for data in files.values():
            for line in data.decode("utf-8", "replace").split("\n"):
                line = line[:-1] if line.endswith("\r") else line
                if line == "":
                    continue
                lines += 1
                if not own_line.match(line):
                    wrong += 1
        assert wrong == 0 and lines >= 600, "настоящие журналы: строк %d, не по форме %d" % (lines, wrong)
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено %d файлов задач" % len(files))

    def legit_journal_variants():
        long_sig = "x" * 120
        content = "\r\n".join([
            "С5 0/3 старт",
            "С5 15/3 [25:00] поле времени неверно, k больше N",
            "С5 1/3 [9:05] другое неверное поле",
            "С5 2/3 адрес https://example.test/a/b/c не путь",
            "С5 3/3 пример C:/work/demo/file как выдуманный корень",
            "",
            "С5 3/3 " + long_sig,
        ]) + "\r\n"
        files = dict(good_j)
        files[journal] = content
        files["doc/tasks/002-y/progress.log"] = ""
        stlib.expect(check(fresh(files)), 0, "ок: осмотрено 8 файлов задач")

    def legit_long_in_tree_and_commit_modes():
        repo = fresh(good_j)
        sha = stlib.commit_file(repo, env, journal, good_j[journal] + "С1 2/2 " + "y" * 150 + "\n", "long line")
        stlib.expect(check(repo), 0, "ок: осмотрено 7 файлов задач")
        stlib.expect(check(repo, "--commit", sha), 0, "ок: осмотрено 1 файлов задач")

    def legit_first_version_long_in_index():
        repo = fresh(good_j)
        stlib.write_files(repo, {"doc/tasks/002-y/progress.log": "С2 0/1 старт\nС2 1/1 " + "z" * 200 + "\n"})
        stlib.git(repo, env, "add", "--", "doc/tasks/002-y/progress.log")
        stlib.expect(check(repo, "--index"), 0, "ок: осмотрено 8 файлов задач")

    def red_long_in_index_only():
        repo = fresh(good_j)
        stlib.write_files(repo, {journal: good_j[journal] + "С1 2/2 " + "w" * 81 + "\n"})
        stlib.git(repo, env, "add", "--", journal)
        proc = check(repo, "--index")
        stlib.expect(proc, 1, "FAIL: check-task-docs: 1 нарушений")
        assert stlib.has_line(proc, "FAIL %s:4: journal-long:" % journal), proc.out
        stlib.expect(check(repo), 0, "ок: осмотрено 7 файлов задач")  # в дереве предела нет

    def edge_80_and_81_with_time():
        repo = fresh(good_j)
        stlib.write_files(repo, {journal: good_j[journal] + "С1 2/2 [10:31] " + "a" * 80 + "\nС1 2/2 [10:32] " + "b" * 81 + "\n"})
        stlib.git(repo, env, "add", "--", journal)
        proc = check(repo, "--index")
        stlib.expect(proc, 1, "FAIL: check-task-docs: 1 нарушений")
        assert stlib.has_line(proc, "FAIL %s:5: journal-long:" % journal) and not stlib.has_line(proc, "%s:4:" % journal), proc.out

    def real_copy_red(mutate, rule, index=False):
        def fn():
            files = real_journals()
            first = sorted(files)[0]
            repo = fresh(files)
            text = files[first].decode("utf-8").split("\n")
            new_text, line_no = mutate(text)
            stlib.write_files(repo, {first: new_text})
            if index:
                stlib.git(repo, env, "add", "--", first)
                proc = check(repo, "--index")
            else:
                proc = check(repo)
            stlib.expect(proc, 1, "FAIL: check-task-docs: 1 нарушений")
            assert stlib.has_line(proc, "FAIL %s:%d: %s:" % (first, line_no, rule)), proc.out
        return fn

    def strip_count(text):
        i = 4  # пятая строка
        broken = re.sub(r" [0-9]+/[0-9]+ ", " ", text[i], count=1)
        assert broken != text[i], "в строке нет k/N"
        text[i] = broken
        return "\n".join(text), i + 1

    def add_path(text):
        n = len(text)
        rest = [x for x in text if x != ""]
        rest.append("С5 1/2 дописан путь " + disk)
        return "\n".join(rest) + "\n", len(rest)

    def add_long(text):
        rest = [x for x in text if x != ""]
        rest.append("С5 1/2 [10:00] " + "q" * 90)
        return "\n".join(rest) + "\n", len(rest)

    def vectors():
        path = os.path.join(stlib.HERE, "..", "..", "..", "opencode-plugin", "test", "progress-vectors.json")
        assert os.path.isfile(path), "нет файла общего набора строк: %s" % os.path.normpath(path)
        with open(path, "rb") as handle:
            raw = handle.read()
        assert all(b < 128 for b in raw), "в файле векторов есть знаки не ASCII"
        vec = json.loads(raw.decode("ascii"))
        spec = importlib.util.spec_from_file_location("check_task_docs_under_test", os.path.join(stlib.GUARDS, "check-task-docs.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        form = "".join("1" if mod.parse_progress_line(s) else "0" for s in vec["lineForms"]["inputs"])
        assert form == vec["lineForms"]["expect"] == "100110", form
        for item in vec["timeForms"]:
            m = mod.JOURNAL_TIME.match(item["sig"])
            got = item["sig"][1:6] if m else None
            assert got == item["time"], (item["sig"], got)
        data = bytes.fromhex(vec["splitFile"]["hex"])
        lines = mod.split_journal(data)
        got = "".join("1" if mod.parse_progress_line(s) else "0" for s in lines)
        assert len(lines) == vec["splitFile"]["lines"] and got == vec["splitFile"]["expect"] == "11", (len(lines), got)
        bad = mod.split_journal(bytes.fromhex(vec["invalidBytes"]["hex"]))
        assert len(bad) == 1 and bool(mod.parse_progress_line(bad[0])) == vec["invalidBytes"]["isLine"] and "\ufffd" in bad[0], bad

    def run_all_accepts_real_copies():
        files = real_journals()
        base2 = pr.mkdtemp()
        env2 = stlib.isolated_env(base2, {"CREW_PRIVATE_NAMES_FILE": stlib.names_file(base2, ["zz-no-such-" + "name-zz"])})
        repo = stlib.hooked_repo(base2, env2, extra=files, install=False)
        proc = stlib.run(("sh", os.path.join("scripts", "guards", "run-all.sh"), "--ci"), cwd=repo, env=env2)
        last = stlib.verdict(proc)
        assert proc.returncode == 0 and last.startswith("итого: ок") and "FAIL 0" in last, (proc.returncode, proc.out[-400:])
        assert stlib.has_line(proc, "check-task-docs.py -> ок: осмотрено %d файлов задач" % (len(files) + 1)), proc.out[-600:]
        # тот же запуск с испорченной строкой: общий запуск принимает вердикт FAIL нового правила
        first = sorted(files)[0]
        text = files[first].decode("utf-8").split("\n")
        text[4] = "строка без формы"
        stlib.write_files(repo, {first: "\n".join(text)})
        proc2 = stlib.run(("sh", os.path.join("scripts", "guards", "run-all.sh"), "--ci"), cwd=repo, env=env2)
        assert proc2.returncode != 0 and stlib.has_line(proc2, "check-task-docs.py -> FAIL"), proc2.out[-600:]

    pr.probe("законное", "журнал: копии настоящих отслеживаемых журналов, число файлов сверено независимым счётчиком", legit_real_journals)
    pr.probe("законное", "журнал: CRLF, пустая строка, k больше N, неверное поле времени, адрес сайта, выдуманный корень, пустой файл", legit_journal_variants)
    pr.probe("законное", "журнал: подпись длиннее 80 знаков в дереве и в коммите — не красная", legit_long_in_tree_and_commit_modes)
    pr.probe("законное", "журнал: первая версия журнала с длинными подписями в индексе — не красная", legit_first_version_long_in_index)
    pr.probe("законное", "журнал: общий запуск run-all.sh --ci на копии принимает вердикт", run_all_accepts_real_copies)
    pr.probe("красная", "журнал: строка без k/N", red_j({journal: "С1 0/2 старт\nбез формы\n"}, "journal-line", journal + ":2"))
    pr.probe("красная", "журнал: строка из одних пробелов", red_j({journal: "С1 0/2 старт\n   \n"}, "journal-line", journal + ":2"))
    pr.probe("красная", "журнал: строка без подписи", red_j({journal: "С1 0/2 старт\nС1 1/2\n"}, "journal-line", journal + ":2"))
    pr.probe("красная", "журнал: путь машины в строке", red_j({journal: "С1 0/2 старт\nС1 1/2 путь " + disk + "\n"}, "journal-path", journal + ":2"))
    pr.probe("красная", "журнал: подпись длиннее 80 знаков в индексе (журнал уже в HEAD)", red_long_in_index_only)
    pr.probe("красная", "журнал: на настоящей копии убрано k/N из строки", real_copy_red(strip_count, "journal-line"))
    pr.probe("красная", "журнал: на настоящей копии дописан путь машины", real_copy_red(add_path, "journal-path"))
    pr.probe("красная", "журнал: на настоящей копии дописана длинная подпись, индекс", real_copy_red(add_long, "journal-long", index=True))
    pr.probe("иной-синтаксис", "журнал: арабо-индийские цифры вместо k/N — не строка", red_j({journal: "С1 0/2 старт\nС1 \u0663/\u0664 x\n"}, "journal-line", journal + ":2"))
    pr.probe("иной-синтаксис", "журнал: неразрывный пробел на месте разделителя — не строка", red_j({journal: "С1 0/2 старт\nС1\u00a01/2 x\n"}, "journal-line", journal + ":2"))
    pr.probe("иной-синтаксис", "журнал: граница 80 и 81 знак (поле времени не считается)", edge_80_and_81_with_time)
    pr.probe("мишень", "журнал: общий набор строк с плагином существует и читается одинаково", vectors)
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
