2026-10-26 04:05 документ: малый маршрут «супер быстро»: машины и тесты `src/` продукта переводятся на пакет `alula` 0.8.0 (проверки `*.scenario.test.json` → `*.alula.test.json`, формат проверок `scenario/0` → `test/0`; формат Алулы 2.25 не меняется), затем на 0.8.1 (по слову оркестратора: в 0.8.1 единственное отличие — явный отказ `alula test`/`alula run` на старом имени файла). Ветка `task-2-25-machines` (после 225), рабочее дерево 225. Журнал — одним файлом, код — первым коммитом, зависимость и журнал — вторым.

2026-10-26 04:10 документ: что сделано (скрипты вне репозитория, правка — `git mv` и `sed`): (1) `git mv` 595 файлов `machines/{methodology,product}/scenarios/*.scenario.test.json` → `machines/{methodology,product}/tests/*.alula.test.json` (методика 514, продукт 81; каталоги `scenarios/` исчезли); ключ `"format": "scenario/0"` → `"test/0"` в 595 файлах; (2) `src/`: 33 файла с именами пакета — `Scenario` → `Test`, `ScenarioRun` → `TestRun`, `parse_scenario` → `parse_test`, `run_scenario` → `run_test`, `drive_scenario` → `drive_test`, `drive_table_scenario` → `drive_table_test`, `drive_nested_scenario` → `drive_nested_test`, `run_nested_scenario` → `run_nested_test`, `scenario_incoming` → `test_incoming`, `scenario_through_parent` → `test_through_parent`, `scenario_problem` → `test_problem`, `scenario_files` → `test_files`, `scenarios_with` → `tests_with`; пути `…/scenarios/` → `…/tests/`, `.scenario.test.json` → `.alula.test.json`, `scenario/0` → `test/0`, строка «N of M scenarios passed» → «tests passed»; папка `src/alula_scenarios_machines` → `src/alula_tests_machines` (как `alula_scenarios` → `alula_tests` в пакете), `machine_run_machines/scenario_test.nv` → `test_file_test.nv` (как в пакете); `machines/README.md`, `src/README.md`, индекс `spikes/env/workarounds.md` (его строки зависят от списков файлов; `python scripts/oracle-workarounds.py --index`). Не менялись: история (`doc/tasks/*`, прежние записи `doc/issues.md`, `doc/research/`), русское слово «сценарий» в прозе, английские слова «scenario» в комментариях и именах локальных функций тестов, сценарии живого сервера `src/server/` (другое понятие, не проверки машин). (3) `nova.toml`: версия `0.8.1` (а не `0.8`: от записи `0.8` страж пакетов даёт pin `>=0.8.0, <0.9.0`; чтобы pin был `>=0.8.1, <0.9.0`, как велено, версия записана полностью), `nova.lock.toml`: alula 0.8.1, commit `ae6c943c0eeb2e0dce12eb2148ddbe81e50bc9e6` (хеш проверен `git rev-parse v0.8.1^{commit}` в дереве пакета; в задании для 0.8.0 стоял хеш `647f3a76…0b7c2`, настоящий — `647f3a765637f452e6a8b849f227656206b51253`); `nova update alula` обновил замок.

2026-10-26 04:20 документ: красная проба (accept-230 на коде до переименования: `git archive` вершины 4ff384c в каталог вне репозитория, программа 0.8.0, `ACCEPT_230_SRC=skip`) — красная, как и должна быть:

```
КРАСНОЕ: alula test machines/methodology: 0 из 0 (ожидалось 514 из 514); alula test: no tests in machines/methodology
 
КРАСНОЕ: alula test machines/product: 0 из 0 (ожидалось 81 из 81); alula test: no tests in machines/product
 
КРАСНОЕ: старых форм: файлов/папок 597, ключей 596, в коде и тексте 894
trees: 7 tables, differ 0
НЕ ПРИНЯТО 230 (4 красных): methodology 0 из 0; product 0 из 0; старых форм 2087; деревья равны; src: пропущено (ACCEPT_230_SRC=skip)
```

(в «старых формах» 2087 — сумма: 597 файлов/папок + 596 файлов с ключом + 894 строки в коде и тексте.)

2026-10-26 06:12 документ: итог — прогон `accept-230` чистым заходом на программе 0.8.1 (дерево на коммите кода c87dbf0 + зависимость 0.8.1; по две папки `src/` одновременно, `--jobs 2`, `--timeout 1800`; 37 минут (05:34 - 06:11); первый прогон на 0.8.0 дал 19 зелёных папок из 20 и был прерван перезапуском, поэтому после перехода на 0.8.1 прогон сделан заново целиком, а не склеен из кусков):

```
trees: 7 tables, differ 0
ПРИНЯТО 230: methodology 514 из 514; product 81 из 81; старых форм 0; деревья равны; src: папок 20 зелёных, красных 0
```

Числа: 595 переименований (514 + 81); старых форм 0; деревья `*.alula.json` пересобраны программой 0.8.1 и равны закоммиченным по разбору JSON (7 таблиц; `chat.alula.json` рукописный, как в 184/225, сравнивается по правилу из `trees.py`) — формат Алулы тот же 2.25, деревья не менялись; `src`: 20 папок, красных 0.

2026-10-26 06:12 документ: не сделано / оставлено: русское «сценарий» в прозе и английские «scenario» в комментариях `src/` (терминологию Алулы владелец ещё решает); публикации и push нет; слияние в `main` — после приёмки (ребейз ветки потом); локальные имена вроде `scenario_of`, `chat_scenarios` в тестах не переименовывались (не часть пакета).

2026-10-26 06:12 документ: текст скрипта критерия `accept-230` (вне репозитория; запускается из корня дерева; окружение — в следующем блоке; программа `alula` 0.8.1 — переменная `ALULA`):

```sh
#!/bin/sh
# accept-230: criterion of the task 230 (the machines of the product on Alula 2.25, the package alula 0.8.1).
# The script is OUTSIDE the repository; its text is recorded in doc/tasks/230-machines-product-2-24/log.md.
# usage (from the root of the working tree):  sh accept-230.sh
# env: ACCEPT_230_REUSE=1 (keep the green folders already in ACCEPT_230_OUT: after an interrupted run), ACCEPT_230_TIMEOUT (seconds per test file of src/, default 1800), ALULA (the program alula 0.8.1), ACCEPT_230_SRC=skip (do not run the folders of src/ - the red probe only),
#      ACCEPT_230_PAR (folders of src/ at once, default 1, at most 4), ACCEPT_230_METHODOLOGY (scenarios, default 514), ACCEPT_230_PRODUCT (default 81).
# The last line: ПРИНЯТО 230: methodology N из N; product 81 из 81; старых форм 0; деревья равны; src: папок K зелёных, красных 0
set -u
export PYTHONUTF8=1
ALULA="${ALULA:-alula}"
PAR="${ACCEPT_230_PAR:-1}"
TMO="${ACCEPT_230_TIMEOUT:-1800}"
EXP_METH="${ACCEPT_230_METHODOLOGY:-514}"
EXP_PROD="${ACCEPT_230_PRODUCT:-81}"
OUT="${ACCEPT_230_OUT:-${TMPDIR:-/tmp}/accept-230-$$}"
mkdir -p "$OUT"
BAD=0
fail() { echo "КРАСНОЕ: $*"; BAD=$((BAD + 1)); }

# 1. the tests of the two folders of machines
count_of() { # folder -> "N M" or "0 0"
  "$ALULA" test "$1" >"$OUT/$(echo "$1" | tr '/' '_').txt" 2>&1
  line=$(grep -E '[0-9]+ of [0-9]+ tests passed' "$OUT/$(echo "$1" | tr '/' '_').txt" | tail -1)
  n=$(echo "$line" | sed -E 's/^([^0-9]*[^0-9])?([0-9]+) of ([0-9]+) tests passed.*/\2/')
  m=$(echo "$line" | sed -E 's/^([^0-9]*[^0-9])?([0-9]+) of ([0-9]+) tests passed.*/\3/')
  case "$n$m" in ''|*[!0-9]*) n=0; m=0 ;; esac
  echo "$n $m"
}
set -- $(count_of machines/methodology); MN=$1; MM=$2
set -- $(count_of machines/product); PN=$1; PM=$2
[ "$MN" = "$MM" ] && [ "$MN" = "$EXP_METH" ] || fail "alula test machines/methodology: $MN из $MM (ожидалось $EXP_METH из $EXP_METH); $(head -c 300 "$OUT/machines_methodology.txt" | tr '\n' ' ')"
[ "$PN" = "$PM" ] && [ "$PN" = "$EXP_PROD" ] || fail "alula test machines/product: $PN из $PM (ожидалось $EXP_PROD из $EXP_PROD); $(head -c 300 "$OUT/machines_product.txt" | tr '\n' ' ')"

# 2. the old forms: files *.scenario.test.json, the folders scenarios/, the key scenario/0, "scenarios passed", the old names of the package API
OLDF=$(find machines -name '*.scenario.test.json' -o -type d -name scenarios | wc -l)
OLDK=$(grep -rlF 'scenario/0' machines | wc -l)
OLDS=$(grep -rnE '\.scenario\.test\.json|parse_scenario|run_scenario|ScenarioRun|(^|[^_a-z])scenario_files([^_a-z]|$)|machines/(product|methodology)/scenarios|scenarios passed' src machines scripts 2>/dev/null | grep -v '^src/server/' | wc -l)
OLDN=$((OLDF + OLDK + OLDS))
[ "$OLDN" = 0 ] || fail "старых форм: файлов/папок $OLDF, ключей $OLDK, в коде и тексте $OLDS"

# 3. the trees equal the build of the program 0.8.1 (parse of JSON; chat.alula.json is written by hand: see TREES_PY)
TREES=ok
python "$(dirname "$0")/trees.py" "$ALULA" machines "$OUT" || { fail "деревья не равны сборке"; TREES=no; }

# 4. the units of src/ with the machines
FOLDERS="machines machine_registry machine_agent machine_agent_en machine_cycle machine_dialog machine_chat alula_eq_machines alula_tests_machines alula_cli_machines machine_text_machines machine_text_eq_machines machine_text_render_machines machine_session machine_dialog_eq machine_nested_eq machine_nested_run machine_run_machines machine_table_machines machine_runner"
K=0; RED=0
if [ "${ACCEPT_230_SRC:-run}" = skip ]; then
  SRCLINE="src: пропущено (ACCEPT_230_SRC=skip)"
  BAD=$((BAD + 1))
else
  run_folder() {
    f="$1"
    if [ "${ACCEPT_230_REUSE:-}" = 1 ] && grep -q '^ok' "$OUT/src_$f.res" 2>/dev/null; then return; fi
    if nova test "src/$f" --jobs 2 --timeout "$TMO" >"$OUT/src_$f.txt" 2>&1; then echo "ok $f" >"$OUT/src_$f.res"; else echo "red $f" >"$OUT/src_$f.res"; fi
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
  echo "ПРИНЯТО 230: methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья равны; $SRCLINE"
  exit 0
fi
echo "НЕ ПРИНЯТО 230 ($BAD красных): methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья $([ "$TREES" = ok ] && echo равны || echo не равны); $SRCLINE"
exit 1
```

окружение (Oracle 0.1.0 из каталога вне репозитория, пути — общие):

```sh
R="C:/work/oracle/nova-oracle-0.1.0-windows-x86_64"
export NOVA_STD_PATH="$R/std"
export NOVA_CG_INCLUDE="$R"
export NOVA_RT_DIR="$R/nova_rt"
export NOVA_GC_LIB_DIR="$R/gc/lib"
export NOVA_GC_INCLUDE_DIR="$R/gc/include"
export PATH="/d/Sources/worktrees/_oracle-scratch/nova/nova-oracle-0.1.0-windows-x86_64:$PATH"
export ALULA="C:/work/nova-alula/target/alula.exe"
```

Скрипт деревьев `trees.py` — тот же, что в `doc/tasks/225-machines-product-2-25/log.md` (без изменений).

2026-10-26 11:05 документ: доставка: ветка перебазирована на origin/main (2d85bb8: задача 191, серия 192 пульта), конфликт один — `spikes/env/workarounds.md` (взята версия main, индекс перестроен `python scripts/oracle-workarounds.py --index`); после ребейза стражи 9 из 9, `alula test` на 0.8.1 — 514 из 514 и 81 из 81, старых форм 0, деревья равны, `nova test src/server` (2 файла) и `src/acp` (1 файл) зелёные; семь коммитов отправлены в `main` как есть (ff-only), вершина — в сообщении слияния владельцу.
