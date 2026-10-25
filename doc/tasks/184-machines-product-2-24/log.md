2026-10-25 12:26 документ: постановка написана исполнителем оформления по решению владельца и оркестратора о составе выпуска Алулы 2.24 (пакет `alula` 0.6.0), 2026-10-25, чат Методики и оркестратора; цепочка 182 → 173 → … → 181 → публикация → 184 → 185, эпик 183, оценка в постановке (4 запуска, 3–4 ч), приёмка — один перепрогон команды-критерия; исполнение не начато
2026-10-25 12:59 документ: постановка обновлена под новую нарезку эпика 183 (слова владельца, 2026-10-25, чат оркестратора): зависимости 182, 175, 179, 180, 181; перечень скобок — из журнала 182; критерий без изменений
2026-10-25 19:05 документ: исполнение начато: рабочее дерево и ветка `task-184-machines-product-2-24` от `origin/main` (c75ec91), пакет `alula` 0.6.0 опубликован (коммит 8be13fbfc203367ec9ee223f71dea854e907d960, метка v0.6.0), программа `alula 0.6.0 (Alula 2.24, machine/2)` собрана из того же кода и лежит вне репозитория; Nova Oracle 0.1.0; ничего не публикуется и не пушится

2026-10-25 19:10 документ: **красная проба AC-1 (первая запись работы):** раздел спецификации пакета — «формат 2.24» (журнал изменений 2.24, `docs/history.md`, пункт 40), правила AL-123 (раздел `## Внешние функции`, вызов без `вызвать`) и AL-131 (три функции разбора по роли, таблицы «по роли» нет); команда AC-2 (`accept-184`, текст ниже) на прежнем коде красная, потому что программа 0.6.0 отклоняет и таблицы `format: 2.23`, и деревья `alula_version` 2.23, и `registry.md` с таблицей `## Roles` (строки 72–74 — ошибка AL-131). Красный вывод (папки `src/` в красной пробе пропущены переменной `ACCEPT_184_SRC=skip`; остальное сокращено до 200 знаков в строке):

```
КРАСНОЕ: alula test machines/methodology: 0 из 0 (ожидалось 514 из 514); alula test: registry.md:72: the table by role (`primitive | role | result | reads`) is gone since 2.24 (AL-131): a parse is one
КРАСНОЕ: alula test machines/product: 0 из 0 (ожидалось 81 из 81); machines/product/chat.alula.json:1:1: check: $.alula_version: the alula_version must be 2.24 (the version of the language of the meth
 machines/product/dialog.alula.json:1:1: check: $.alula_version: the alula_version must be 2.24 (the version of the l
КРАСНОЕ: старых форм в machines: 95
alula compile: 1 errors in machines\product\chat.alula.md (0 of 22 rows with notes)
alula compile: 1 errors in machines\product\dialog.alula.md (0 of 19 rows with notes)
trees: 7 tables, differ 7
КРАСНОЕ: деревья не равны сборке
НЕ ПРИНЯТО 184 (5 красных): methodology 0 из 0; product 0 из 0; старых форм 95; деревья не равны; src: пропущено (ACCEPT_184_SRC=skip)
```

2026-10-25 19:10 документ: инвентаризация старых форм до правки (числа; `grep` и разбор таблиц): таблиц машин 7 (методика 5: `agent_step`, `cycle_check`, `dialog_steps`, `session_start`, `task_runner`; продукт 2: `chat`, `dialog`) и образец `machines/methodology/agent-step-sample.txt`; `format: 2.23` — 8 строк (7 таблиц + образец); `machine_version: alula-2.23` — 3 (`agent_step`, `cycle_check`, образец); деревья `alula_version: "2.23"` — 7, из них `version: alula-2.23` у `agent_step` и `cycle_check` (2); раздел `## Примитивы` — 5 (4 таблицы методики + образец; у `dialog_steps` и обеих таблиц продукта его нет), строк-объявлений без стандартной `time_now` — 40 в таблицах (`agent_step` 2, `cycle_check` 1, `session_start` 7, `task_runner` 30) и 2 в образце; вызовов `вызвать(` — 72 (65 в 4 таблицах: `agent_step` 7, `cycle_check` 2, `session_start` 11, `task_runner` 45, и 7 в образце; на 70 строках, потому что в нескольких строках по два вызова), из них `вызвать(time_now)` — стандартная функция, в 2.24 `время_сейчас()`; в `src/` один встроенный текст со словом `вызвать` (`machine_session/errored_test.nv`); `parse_agent_reply` — 4 строки `machines/methodology/registry.md` (строка примитива и 3 строки таблицы `## Roles`, строки 72–74) и 1 тест (`machine_registry/registry_test.nv`); хеш образца файла функций `ebb7658048b2` — 3 в `machines/` (`cycle_check.alula.md`, его дерево, `README.md`) и 1 в `src/machine_cycle/table_test.nv`; тестов `src/` с `2.23` — 13 файлов (`alula_eq_machines` 3, `machines`, `machine_agent`, `machine_agent_en`, `machine_cycle` 2, `machine_dialog`, `machine_runner` 2, `machine_session`, `machine_text_render_machines`); `opencode-plugin/`: деревьев, `alula_version` и формата нет (плагин не правится); общее число строк `grep` по старым формам в `machines/` (критерий) — 95

2026-10-25 19:15 документ: скрипт критерия `accept-184` (вне репозитория; запускается из корня дерева; `ALULA` — программа 0.6.0; папки `src/` — по одной (`ACCEPT_184_PAR` — сколько одновременно, не больше 4), `nova test src/<папка> --jobs 2 --timeout 900`); сверка деревьев — `trees.py` (каждая `*.alula.md` собирается `alula compile … --force` во временную папку вне репозитория, JSON разбирается и сравнивается с лежащим в репозитории дереве). Текст скрипта:

```sh
#!/bin/sh
# accept-184: criterion of the task 184 (the machines of the product on Alula 2.24, the package alula 0.6.0).
# The script is OUTSIDE the repository; its text is recorded in doc/tasks/184-machines-product-2-24/log.md.
# usage (from the root of the working tree):  sh accept-184.sh
# env: ALULA (the program alula 0.6.0), ACCEPT_184_SRC=skip (do not run the folders of src/ - the red probe only),
#      ACCEPT_184_PAR (folders of src/ at once, default 1, at most 4), ACCEPT_184_METHODOLOGY (scenarios, default 514), ACCEPT_184_PRODUCT (default 81).
# The last line: ПРИНЯТО 184: methodology N из N; product 81 из 81; старых форм 0; деревья равны; src: папок K зелёных, красных 0
set -u
export PYTHONUTF8=1
ALULA="${ALULA:-alula}"
PAR="${ACCEPT_184_PAR:-1}"
EXP_METH="${ACCEPT_184_METHODOLOGY:-514}"
EXP_PROD="${ACCEPT_184_PRODUCT:-81}"
OUT="${ACCEPT_184_OUT:-${TMPDIR:-/tmp}/accept-184-$$}"
mkdir -p "$OUT"
BAD=0
fail() { echo "КРАСНОЕ: $*"; BAD=$((BAD + 1)); }

# 1. the scenarios of the two folders of machines
count_of() { # folder -> "N M" or "0 0"
  "$ALULA" test "$1" >"$OUT/$(echo "$1" | tr '/' '_').txt" 2>&1
  line=$(grep -E '[0-9]+ of [0-9]+ scenarios passed' "$OUT/$(echo "$1" | tr '/' '_').txt" | tail -1)
  n=$(echo "$line" | sed -E 's/.*[^0-9]([0-9]+) of ([0-9]+) scenarios passed.*/\1/')
  m=$(echo "$line" | sed -E 's/.*[^0-9]([0-9]+) of ([0-9]+) scenarios passed.*/\2/')
  case "$n$m" in ''|*[!0-9]*) n=0; m=0 ;; esac
  echo "$n $m"
}
set -- $(count_of machines/methodology); MN=$1; MM=$2
set -- $(count_of machines/product); PN=$1; PM=$2
[ "$MN" = "$MM" ] && [ "$MN" = "$EXP_METH" ] || fail "alula test machines/methodology: $MN из $MM (ожидалось $EXP_METH из $EXP_METH); $(head -c 300 "$OUT/machines_methodology.txt" | tr '\n' ' ')"
[ "$PN" = "$PM" ] && [ "$PN" = "$EXP_PROD" ] || fail "alula test machines/product: $PN из $PM (ожидалось $EXP_PROD из $EXP_PROD); $(head -c 300 "$OUT/machines_product.txt" | tr '\n' ' ')"

# 2. the old forms in machines/ (the 2.23 forms and the table by role)
OLD=$(grep -rnF -e 'вызвать(' -e 'parse_agent_reply' -e 'format: 2.23' -e 'alula-2.23' -e 'ebb7658048b2' machines | wc -l)
OLD2=$(grep -rnE -e '^## Примитивы' -e '^## Roles' machines | wc -l)
OLDN=$((OLD + OLD2))
[ "$OLDN" = 0 ] || { fail "старых форм в machines: $OLDN"; grep -rnF -e 'вызвать(' -e 'parse_agent_reply' -e 'format: 2.23' -e 'alula-2.23' -e 'ebb7658048b2' machines | cut -c1-120 | head -5; }

# 3. the trees equal the build of the program 0.6.0 (parse of JSON; chat.alula.json is written by hand: see TREES_PY)
TREES=ok
python "$(dirname "$0")/trees.py" "$ALULA" machines "$OUT" || { fail "деревья не равны сборке"; TREES=no; }

# 4. the units of src/ with the machines
FOLDERS="machines machine_registry machine_agent machine_agent_en machine_cycle machine_dialog machine_chat alula_eq_machines alula_scenarios_machines alula_cli_machines machine_text_machines machine_text_eq_machines machine_text_render_machines machine_session machine_dialog_eq machine_nested_eq machine_nested_run machine_run_machines machine_table_machines machine_runner"
K=0; RED=0
if [ "${ACCEPT_184_SRC:-run}" = skip ]; then
  SRCLINE="src: пропущено (ACCEPT_184_SRC=skip)"
  BAD=$((BAD + 1))
else
  run_folder() {
    f="$1"
    if nova test "src/$f" --jobs 2 --timeout 900 >"$OUT/src_$f.txt" 2>&1; then echo "ok $f" >"$OUT/src_$f.res"; else echo "red $f" >"$OUT/src_$f.res"; fi
  }
  running=0
  for f in $FOLDERS; do
    run_folder "$f" &
    running=$((running + 1))
    if [ "$running" -ge "$PAR" ]; then wait; running=0; fi
  done
  wait
  for f in $FOLDERS; do
    if grep -q '^ok' "$OUT/src_$f.res" 2>/dev/null; then K=$((K + 1)); else RED=$((RED + 1)); echo "красная папка src/$f: $(grep -iE 'FAIL|error' "$OUT/src_$f.txt" | head -3 | tr '\n' ' ')"; fi
  done
  [ "$RED" = 0 ] || BAD=$((BAD + 1))
  SRCLINE="src: папок $K зелёных, красных $RED"
fi

if [ "$BAD" = 0 ]; then
  echo "ПРИНЯТО 184: methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья равны; $SRCLINE"
  exit 0
fi
echo "НЕ ПРИНЯТО 184 ($BAD красных): methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья $([ "$TREES" = ok ] && echo равны || echo не равны); $SRCLINE"
exit 1
```

Текст `trees.py`:

```python
# -*- coding: utf-8 -*-
"""accept-184, the trees: every machines/*/*.alula.md is built by the program (alula compile) and the JSON is compared with the committed
*.alula.json by the parse (not by the bytes). usage: trees.py ALULA MACHINES_DIR OUT_DIR ; exit 0 - all equal. Prints the differing paths."""
import json, os, subprocess, sys, glob

alula, root, out = sys.argv[1:4]
os.makedirs(os.path.join(out, "trees"), exist_ok=True)


def diff(a, b, path="$"):
    if type(a) != type(b):
        return [path + ": " + type(a).__name__ + " != " + type(b).__name__]
    if isinstance(a, dict):
        r = []
        for k in sorted(set(a) | set(b)):
            if k not in a:
                r.append(path + "." + k + ": only in the build")
            elif k not in b:
                r.append(path + "." + k + ": only in the committed")
            else:
                r += diff(a[k], b[k], path + "." + k)
        return r
    if isinstance(a, list):
        if len(a) != len(b):
            return [path + ": length %d != %d" % (len(a), len(b))]
        r = []
        for i, (x, y) in enumerate(zip(a, b)):
            r += diff(x, y, path + "[%d]" % i)
        return r
    return [] if a == b else [path + ": %r != %r" % (a, b)]


bad = 0
n = 0
for md in sorted(glob.glob(os.path.join(root, "*", "*.alula.md"))):
    js = md[:-3] + ".json"
    tmp = os.path.join(out, "trees", os.path.basename(os.path.dirname(md)) + "_" + os.path.basename(js))
    n += 1
    r = subprocess.run([alula, "compile", md, "-o", tmp, "--force"], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0 or not os.path.exists(tmp):
        print("tree %s: compile failed: %s" % (md, (r.stdout + r.stderr).strip()[:300]))
        bad += 1
        continue
    built = json.load(open(tmp, encoding="utf-8"))
    kept = json.load(open(js, encoding="utf-8"))
    d = diff(built, kept)
    if d:
        bad += 1
        print("tree %s differs from the build (%d places), first: %s" % (js, len(d), "; ".join(d[:3])))
print("trees: %d tables, differ %d" % (n, bad))
sys.exit(1 if bad else 0)
```
