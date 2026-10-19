# -*- coding: utf-8 -*-
"""Самотест стража меток обходов Oracle check-oracle-workarounds.py.

Зачем: страж, который пропускает метку без текста или с номером, которого нет в README, оставляет
    индекс «пункт -> места» ложью, а тот, что краснит прозу о метках в README модулей или метку
    после кода в строке, будут обходить.
Проверяет: красные - метка без текста, без двоеточия, с пустым списком номеров и с нечисловым
    номером; номер, которого нет в spikes/env/README.md; индекс workarounds.md, которого нет, который
    устарел после новой метки и после удалённой; метка в строке данных (в тексте, не в комментарии);
    README без единого пункта. Зелёные - метка в комментарии `//`, `#`, `<!--`, после кода в строке;
    список `(12, 13, 26)` и пробелы в скобках; CRLF; проза о метках в .md без `<!--`; пункт без метки
    (обходов в коде нет); пункт с пометкой «worked round in the code» без метки - только
    предупреждение; нет ни README, ни меток - судить нечего.
Не проверяет: смысл текста метки и то, что обход правда есть в коде (это приёмка); метки вне src/,
    scripts/ и spikes/ (плагин, doc/).
Правило: spikes/env/README.md, раздел «Marks of the workarounds»; задача 118 (AC-3).

Фикстуры собираются при прогоне; индекс в них строит настоящий scripts/oracle-workarounds.py.
"""
import sys

sys.dont_write_bytecode = True

import os

import stlib

README = "spikes/env/README.md"
INDEX = "spikes/env/workarounds.md"
ITEMS = (
    "# env\n\n## Known problems\n\n"
    "8. **`enum_str_payload`**: a generic sum type with a `str` variant does not compile.\n"
    "9. **`prelude_outcome`**: a user type named like a prelude type breaks the C.\n"
    "    The second line of the item.\n"
    "12. **`inference`**: the type arguments are not inferred.\n"
    "13. **`inference_one`**: the same with one parameter.\n"
    "26. **`explicit_args`**: written out, the arguments compile.\n"
)
MARK = "ORACLE-WORKAROUND"


def main():
    pr = stlib.Probes("check-oracle-workarounds")
    base = pr.mkdtemp()
    env = stlib.isolated_env(base)
    counter = [0]
    script = os.path.join(stlib.SCRIPTS, "oracle-workarounds.py")

    def build(files, readme=ITEMS, index=True, name=None):
        """Репозиторий с README, файлами и свежим индексом (index=True) или без него."""
        counter[0] += 1
        content = dict(files)
        if readme is not None:
            content[README] = readme
        repo = stlib.make_repo(base, env, content, name=name or "r%d" % counter[0])
        if index:
            proc = stlib.run((sys.executable, script, "--index", "--root", repo), cwd=repo, env=env)
            assert proc.returncode == 0, "индекс не построился: %s %s" % (proc.out[-200:], proc.err[-200:])
            stlib.git(repo, env, "add", "--", INDEX)
        return repo

    def check(repo, *args):
        return stlib.guard("check-oracle-workarounds.py", repo, env, *args)

    def red(files, rule, where=None, readme=ITEMS, index=True, text=None):
        def fn():
            proc = check(build(files, readme=readme, index=index))
            stlib.expect(proc, 1, "FAIL: check-oracle-workarounds: 1 нарушений")
            want = "%s: %s:" % (where, rule) if where else ": %s:" % rule
            assert stlib.has_line(proc, want), proc.out
            if text:
                assert stlib.has_line(proc, text), proc.out
        return fn

    def green(files, readme=ITEMS, prefix="ок: осмотрено"):
        def fn():
            stlib.expect(check(build(files, readme=readme)), 0, prefix)
        return fn

    def mark(args, text="what is gone round; how to simplify when item 8 is fixed", lead="// "):
        return "%s%s(%s): %s\n" % (lead, MARK, args, text)

    good = {"src/a/a.nv": "module a\n" + mark("8") + "fn f() => 1\n"}

    def stale_after_new_mark():
        repo = build(good)
        stlib.write_files(repo, {"src/b/b.nv": mark("9") + "fn g() => 2\n"})
        stlib.git(repo, env, "add", "--", "src/b/b.nv")
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-oracle-workarounds: 1 нарушений")
        assert stlib.has_line(proc, "%s: index-stale:" % INDEX), proc.out

    def stale_after_removed_mark():
        repo = build(good)
        stlib.write_files(repo, {"src/a/a.nv": "module a\nfn f() => 1\n"})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-oracle-workarounds: 1 нарушений")
        assert stlib.has_line(proc, "%s: index-stale:" % INDEX), proc.out

    def stale_after_new_item():
        repo = build(good)
        stlib.write_files(repo, {README: ITEMS + "14. **`new_item`**: a new defect.\n"})
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL: check-oracle-workarounds: 1 нарушений")
        assert stlib.has_line(proc, "%s: index-stale:" % INDEX), proc.out

    def crlf():
        files = {"src/a/a.nv": ("module a\r\n" + mark("8").replace("\n", "\r\n") + "fn f() => 1\r\n")}
        stlib.expect(check(build(files)), 0, "ок: осмотрено")

    def only_warning():
        text = ITEMS + "40. **`user_type_child`**: a user record `Child` clashes; worked round in the code by the name `ExprChild`.\n"
        proc = check(build(good, readme=text))
        stlib.expect(proc, 0, "ок: осмотрено")
        assert stlib.has_line(proc, "предупреждение:"), proc.out
        assert stlib.has_line(proc, "40"), proc.out

    def nothing_at_all():
        repo = stlib.make_repo(base, env, {"src/a/a.nv": "module a\nfn f() => 1\n"}, name="empty-%d" % len(pr.tmp))
        stlib.expect(check(repo), 0, "судить нечего:")

    def lost_readme_without_items():
        repo = build(good, readme="# env\n\nno numbered items here\n", index=False)
        proc = check(repo)
        stlib.expect(proc, 1, "FAIL")
        assert stlib.has_line(proc, "no-items"), proc.out

    def commit_mode():
        repo = build(good)
        stlib.git(repo, env, "commit", "-q", "-m", "with index")
        head = stlib.git(repo, env, "rev-parse", "HEAD").out.strip()
        stlib.expect(check(repo, "--commit", head), 0, "ок: осмотрено")

    def index_mode():
        repo = build(good)
        stlib.expect(check(repo, "--index"), 0, "ок: осмотрено")

    def listing():
        repo = build(good)
        proc = stlib.run((sys.executable, script, "--list", "--root", repo), cwd=repo, env=env)
        assert proc.returncode == 0, proc.err
        assert "src/a/a.nv:2" in proc.out and "8" in proc.out, proc.out

    def summary():
        repo = build(good)
        proc = stlib.run((sys.executable, script, "--root", repo), cwd=repo, env=env)
        assert proc.returncode == 0, proc.err
        assert "1" in proc.out.splitlines()[0], proc.out

    # законная проба идёт первой
    pr.probe("законное", "метка в комментарии, README с пунктом, индекс свежий", green(good))
    pr.probe("законное", "пункты без меток: «обходов в коде нет»", green({"src/a/a.nv": "module a\nfn f() => 1\n"}))
    pr.probe("законное", "метка после кода в той же строке",
             green({"src/a/a.nv": "fn f() => 1 " + mark("8")}))
    pr.probe("законное", "список номеров и пробелы в скобках",
             green({"src/a/a.nv": mark("12, 13, 26") + mark(" 8 ,9 ")}))
    pr.probe("законное", "проза о метках в .md без <!-- не метка",
             green({"src/a/README.md": "The places carry the mark `" + MARK + "(N)` and `" + MARK + "(99): text`.\n"}))
    pr.probe("законное", "метка в скрипте после #", green({"scripts/x.py": mark("8", lead="# ")}))
    pr.probe("законное", "метка в .md внутри <!-- -->",
             green({"src/a/README.md": "<!-- " + MARK + "(9): the table is a list; use a table when item 9 is fixed -->\n"}))
    pr.probe("законное", "пометка «worked round in the code» без метки - предупреждение, не ошибка", only_warning)
    pr.probe("законное", "CRLF в файле с меткой", crlf)
    pr.probe("законное", "режим --index", index_mode)
    pr.probe("законное", "режим --commit", commit_mode)
    pr.probe("законное", "--list печатает файл:строка по пунктам", listing)
    pr.probe("законное", "сводка без аргументов", summary)
    pr.probe("красная", "метка без текста после двоеточия",
             red({"src/a/a.nv": "// " + MARK + "(8):\n"}, "bad-mark", "src/a/a.nv:1"))
    pr.probe("красная", "метка без двоеточия",
             red({"src/a/a.nv": "// " + MARK + "(8) text of the mark\n"}, "bad-mark", "src/a/a.nv:1"))
    pr.probe("красная", "пустой список номеров",
             red({"src/a/a.nv": mark("")}, "bad-mark", "src/a/a.nv:1"))
    pr.probe("красная", "нечисловой номер",
             red({"src/a/a.nv": mark("item 8")}, "bad-mark", "src/a/a.nv:1"))
    pr.probe("красная", "список с запятой в конце",
             red({"src/a/a.nv": mark("8,")}, "bad-mark", "src/a/a.nv:1"))
    pr.probe("красная", "номер, которого нет в README",
             red({"src/a/a.nv": mark("99")}, "unknown-item", "src/a/a.nv:1", text="99"))
    pr.probe("красная", "один из двух номеров неизвестен",
             red({"src/a/a.nv": mark("8, 77")}, "unknown-item", "src/a/a.nv:1", text="77"))
    pr.probe("красная", "метка в строке данных: в тексте, не в комментарии",
             red({"src/a/a.nv": 'ro s = "' + MARK + '(8): text"\n'}, "not-comment", "src/a/a.nv:1"))
    pr.probe("красная", "метка в строке данных скрипта",
             red({"scripts/x.py": 'print("' + MARK + '(8): text")\n'}, "not-comment", "scripts/x.py:1"))
    pr.probe("красная", "индекса workarounds.md нет",
             red(good, "index-missing", INDEX, index=False))
    pr.probe("красная", "индекс устарел: добавлена метка", stale_after_new_mark)
    pr.probe("красная", "индекс устарел: метка удалена", stale_after_removed_mark)
    pr.probe("красная", "индекс устарел: в README новый пункт", stale_after_new_item)
    pr.probe("красная", "в README нет ни одного пункта", lost_readme_without_items)
    pr.probe("иной-синтаксис", "метка в комментарии <!-- --> с закрывающим знаком и без текста",
             red({"src/a/README.md": "<!-- " + MARK + "(8):  -->\n"}, "bad-mark", "src/a/README.md:1"))
    pr.probe("иной-синтаксис", "метка в .md не в комментарии <!-- - не метка, а проза",
             green({"src/a/README.md": "text " + MARK + "(99) is only prose here\n"}))
    pr.probe("иной-синтаксис", "метка после ## в sh-скрипте",
             green({"scripts/x.sh": mark("8", lead="## ")}))
    pr.probe("иной-синтаксис", "метка в комментарии /// документации",
             green({"src/a/a.nv": mark("8", lead="/// ")}))
    pr.probe("мишень", "нет ни README, ни меток - судить нечего", nothing_at_all)
    pr.probe("мишень", "метки есть, README нет - номер неизвестен",
             lambda: stlib.expect(check(build(good, readme=None, index=False)), 1, "FAIL"))
    return pr.done()


if __name__ == "__main__":
    sys.exit(main())
