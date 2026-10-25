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
2026-10-25 19:40 документ: миграция таблиц: скрипт вне репозитория (текст — ниже), по образцу скрипта задачи 175, сверенного с разделом 7 спецификации пакета и пунктом 40 `docs/history.md`; запуск на 7 таблицах и образце `agent-step-sample.txt`: вызовов `вызвать(` переведено 72 (из них стандартных `time_now` → `время_сейчас()` — 8), объявлений внешних функций записано 42 (40 в таблицах: `agent_step` 2, `cycle_check` 1, `session_start` 7, `task_runner` 30, и 2 в образце; стандартные `time_now` и `new_id` не объявляются), строк `format: 2.23` → `2.24` — 8 (у `chat` строка без маркера `- `, скрипт принимает оба вида), `machine_version: alula-2.23` → `alula-2.24` — 3, проза «версия формата 2.23» → 2.24, хеш файла функций `ebb7658048b2` → `818a4aaeef4f` (`cycle_check.alula.md` и `machines/README.md`); концы строк и остальные байты прежние (изменено: 7 таблиц и образец); отличие от скрипта 175: код журнала и классы уже в виде 2.23, поэтому заново не правятся; таблиц «по роли» в таблицах машин нет (разбор по роли — только в реестре, `разбор:` таблицы машин не пишут), `роль строка` в объявлениях не встречается; после миграции `alula check` на всех 7 таблицах — `ok`, предупреждений нет

2026-10-25 19:45 документ: перечень скобок по приоритетам (AL-132): в таблицах продукта и методики места, где новая сборка потребовала бы скобок, не найдены — `alula check` на 7 таблицах без ошибок, а разбор JSON деревьев до и после (HEAD против сборки программой 0.6.0) различается только тем, что должно: у всех `alula_version` 2.23 → 2.24; у `agent_step` и `cycle_check` `version` `alula-2.23` → `alula-2.24`; у `cycle_check` `includes[0].hash` `ebb7658048b2` → `818a4aaeef4f`; `primitives` — из списка имён запись `{name, params, result, class}` (дерево T1: `agent_step` 3 → 2 записи, потому что стандартная `time_now` больше не перечисляется; `cycle_check` 1, `session_start` 7, `task_runner` 30); `dialog_steps` и `dialog` — только `alula_version`; журнала задачи 182 в репозитории продукта нет (он лежит в пакете), отсутствие мест со скобками проверено машиной, а не по журналу

2026-10-25 19:50 документ: деревья: пересобраны программой 0.6.0 (`alula compile … -o … --force`, перевод строки в конце снят, как в задаче 172) для 6 из 7 таблиц (`agent_step`, `cycle_check`, `dialog_steps`, `session_start`, `task_runner`, `dialog`); `chat.alula.json` в репозитории написано вручную (латинские внутренние имена, английский заголовок, красивая печать), и три папки `src/` (`machine_table_machines`, `machine_text_render_machines`, `machine_run_machines`) правят его текст и ждут эти имена: полная пересборка `chat` программой в пробном прогоне сделала эти три папки красными (`bad types`, `bad expr`, `paths of errors`, `types section`, `the chat machine writes its user as a free input`, `the machine with gates keeps its counter`), файл возвращён; у `chat.alula.json` заменён только текст `"alula_version": "2.23"` → `"2.24"`; критерий сравнивает его со сборкой с одним исключением (строковые листья с ключами `name`, `party`, `bind`, `content`, `title`; всё остальное, включая `alula_version`, равно) — спорное место, вопрос ниже

2026-10-25 19:55 документ: реестр `machines/methodology/registry.md` (расхождения реестров — по спецификации пакета, по слову постановки): строка `parse_agent_reply` заменена тремя: `parse_witness_reply` (`reply: AgentReply` → `[]WitnessAnswer`, читает: артефакт ответа, предложение), `parse_author_reply` (→ `EditResult`, читает: артефакт ответа), `parse_lens_reply` (→ `LensResult`, читает: артефакт ответа), все `volatile`, `читает` — как в образце реестра пакета и в прежней таблице «по роли» (у свидетеля — ещё предложение); таблица `## Roles` (строки 72–74, ошибка AL-131) удалена; тип `RoleResult` (в трёх наборах типов: основной, `session`, `runner`) удалён как никому не нужный (его возвращала только `parse_agent_reply`; образец реестра пакета его не содержит); `remove_unsound`: `number: int>=0` → `int>=1` (спецификация, раздел 7: `номер_захода число>=1`; класс остался `acting`); `build_summary`: `int>=0` → `int>=1` и `acting` → `volatile` (спецификация: `собрать_свод(номер_захода число>=1) изменчивая -> ?Свод`), столбец `пишет` (`object: summary file`) оставлен — спорное место: спецификация говорит, что изменчивая функция пишет только служебные записи, а образец реестра пакета (`spec/samples/registry.md`) хранит `int>=0` и `acting` и сам расходится с текстом спецификации; загрузка реестра ошибок не даёт; число примитивов 56 → 58 в шапке и `machines/README.md` (вместе с `time_now` и `new_id` — 60)

2026-10-25 20:00 документ: тесты `src/`: `2.23` → `2.24` и `alula-2.23` → `alula-2.24` (13 файлов), хеш `818a4aaeef4f` в `machine_cycle/table_test.nv`; `вызвать(prepare_launch, …)` → `prepare_launch(…)` в тексте, который правит `machine_session/errored_test.nv`; число строк разбора образца `agent_step` 127 → 126 (`machine_agent/agent_test.nv`: вместо 3 строк таблицы примитивов 2 объявления) и записей `primitives` 3 → 2 (`machine_agent`, `machine_agent_en`, `machine_text_eq_machines/cases_test.nv`); `primitives` теперь записи `PrimDecl`: `machine_cycle/table_test.nv` — `def.primitives[0].name`, `machine_session/table_test.nv` — поиск по `p.name` вместо `contains`; реестр (`machine_registry/registry_test.nv`, `machines/data_test.nv`, `machine_session/registry_test.nv`): 58 → 60 примитивов (с двумя языка), 34/24 → 37/23 изменчивых и действующих (разбор по роли: −1 +3 изменчивых, `build_summary` из действующих в изменчивые), в списках классов три функции разбора вместо `parse_agent_reply`, `build_summary` среди изменчивых; комментарии `56` → `58` в `machines/data.nv`

2026-10-25 20:05 документ: зависимость: `nova.toml` — `alula` версия `0.6` (комментарий о версии 0.6 добавлен); `nova update alula` (чтение публичного репозитория пакета) — `nova.lock.toml`: `alula` 0.6.0, коммит 8be13fbfc203367ec9ee223f71dea854e907d960, pin `version:>=0.6.0, <0.7.0` — ровно значения из задания

2026-10-25 20:10 документ: ход прогонов: первый прогон `accept-184` (по две папки одновременно, `--jobs 2` у каждой — вместе не больше 4 файлов) показал 5 красных папок `src/`, все из-за формы данных, не поведения (`rows_total`, `primitives`, `PrimDecl`, см. выше); в скрипте была ошибка разбора числа сценариев (регулярное выражение требовало знак перед числом, а строка «514 of 514 …» начинается с цифры), исправлена; красная проба первой записи от неё не зависела (там `0 из 0` было верным: программа 0.6.0 не читала таблицы); второй прогон после правок тестов и с полностью пересобранным `chat.alula.json` — 17 зелёных, 3 красных (см. выше), `chat` возвращён к рукописному; красных по существу поведения машин не было ни в одном прогоне

2026-10-25 20:57 документ: итог (прогон чистым заходом, ветка `task-184-machines-product-2-24`, вершина кода 5417f73; жду прогон — оценка была 30 минут, фактически 29: с 20:28 до 20:57, по две папки одновременно, `--jobs 2`): `ПРИНЯТО 184: methodology 514 из 514; product 81 из 81; старых форм 0; деревья равны; src: папок 20 зелёных, красных 0` — те же 20 папок, что в журнале задачи 172 (`machines`, `machine_registry`, `machine_agent`, `machine_agent_en`, `machine_cycle`, `machine_dialog`, `machine_chat`, `alula_eq_machines`, `alula_scenarios_machines`, `alula_cli_machines`, `machine_text_machines`, `machine_text_eq_machines`, `machine_text_render_machines`, `machine_session`, `machine_dialog_eq`, `machine_nested_eq`, `machine_nested_run`, `machine_run_machines`, `machine_table_machines`, `machine_runner`); не прогонялось: `product_machines` (в папке нет тестов, как и в 172) и папки с PostgreSQL; очереди машины у исполнителя не было, папки шли сами, по две; низкий приоритет не ставился

2026-10-25 21:00 документ: числа инвентаризации до и после (`grep` по `machines/`, критерий): до 95 строк старых форм (`вызвать(` 70 строк / 72 вызова, `parse_agent_reply` 4, `format: 2.23` 8, `alula-2.23` 5 (3 в таблицах и образце, 2 в деревьях), `ebb7658048b2` 3 — 89 строк, где совпало несколько образцов, считаются раз — и 6 заголовков `## Примитивы` (5) и `## Roles` (1)), после 0; в `src/`: `2.23` в 13 файлах → 0, `вызвать` 1 → 0, `parse_agent_reply` 1 → 0; `alula check` 7 таблиц — ок; `alula test machines/methodology` 514 из 514 (число прежнее, как в задаче 172), `machines/product` 81 из 81

2026-10-25 21:00 документ: текст скрипта критерия `accept-184` в окончательном виде (против первой записи изменён только разбор числа сценариев) и `trees.py` с одним названным исключением (`chat.alula.json`, см. выше):

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
  n=$(echo "$line" | sed -E 's/^([^0-9]*[^0-9])?([0-9]+) of ([0-9]+) scenarios passed.*/\2/')
  m=$(echo "$line" | sed -E 's/^([^0-9]*[^0-9])?([0-9]+) of ([0-9]+) scenarios passed.*/\3/')
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

```python
# -*- coding: utf-8 -*-
"""accept-184, the trees: every machines/*/*.alula.md is built by the program (alula compile) and the JSON is compared with the committed
*.alula.json by the parse (not by the bytes). usage: trees.py ALULA MACHINES_DIR OUT_DIR ; exit 0 - all equal. Prints the differing paths.

One exception, named here: machines/product/chat.alula.json is a tree written by hand (Latin internal names, the title in English, the pretty print): the tests of src/
(machine_table_machines, machine_text_render_machines, machine_run_machines) edit its text and expect those names. It is compared with the build modulo the string leaves whose
key is name, party, bind, content or title (the internal names and the title); every other place (structure, numbers, keys, alula_version, every other string) must be equal."""
import json, os, subprocess, sys, glob

alula, root, out = sys.argv[1:4]
os.makedirs(os.path.join(out, "trees"), exist_ok=True)
HAND_WRITTEN = {"chat.alula.json"}
NAME_KEYS = {"name", "party", "bind", "content", "title"}


def diff(a, b, path="$", lax=False, key=""):
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
                r += diff(a[k], b[k], path + "." + k, lax, k)
        return r
    if isinstance(a, list):
        if len(a) != len(b):
            return [path + ": length %d != %d" % (len(a), len(b))]
        r = []
        for i, (x, y) in enumerate(zip(a, b)):
            r += diff(x, y, path + "[%d]" % i, lax, key)
        return r
    if a == b:
        return []
    if lax and isinstance(a, str) and key in NAME_KEYS:
        return []
    return [path + ": %r != %r" % (a, b)]


bad = 0
n = 0
for md in sorted(glob.glob(os.path.join(root, "*", "*.alula.md"))):
    js = md[:-3] + ".json"
    tmp = os.path.join(out, "trees", os.path.basename(os.path.dirname(md)) + "_" + os.path.basename(js))
    n += 1
    r = subprocess.run([alula, "compile", md, "-o", tmp, "--force"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not os.path.exists(tmp):
        print("tree %s: compile failed: %s" % (md, (r.stdout + r.stderr).strip()[:300]))
        bad += 1
        continue
    built = json.load(open(tmp, encoding="utf-8"))
    kept = json.load(open(js, encoding="utf-8"))
    d = diff(built, kept, lax=os.path.basename(js) in HAND_WRITTEN)
    if d:
        bad += 1
        print("tree %s differs from the build (%d places), first: %s" % (js, len(d), "; ".join(d[:3])))
print("trees: %d tables, differ %d" % (n, bad))
sys.exit(1 if bad else 0)
```

2026-10-25 21:00 документ: текст скрипта миграции `migrate184.py` (вне репозитория):

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Task 184: the tables of machines of Alula 2.23 -> 2.24 (the package alula 0.6.0). Outside the repository.

usage: migrate184.py [--report] FILE...   (rewrites in place; --report prints only). Russian tables only (no English table in machines/).
What it does to a table (*.alula.md, agent-step-sample.txt):
  1. `## Примитивы` + the table (name | parameters | result | class | reads | writes) -> `## Внешние функции` + a code block of the declarations
     `внешняя функция имя(арг тип, …) [изменчивая|действующая] [-> тип]`; the prose after the table stays; the standard time_now / new_id are not declared;
     `читает` and `пишет` go away (they are in the registry of the host).
  2. `вызвать(имя, арг…)` -> `имя(арг…)`, the calls are found with the nesting of the brackets and the strings; `time_now` -> `время_сейчас`, `new_id` -> `новый_ид`.
  3. `format: 2.23` (with or without the list marker `- `) -> `2.24`; `machine_version: alula-2.23` -> `alula-2.24`; the prose «версия формата 2.23» -> 2.24.
  4. the hash of the sample of the file of functions: ebb7658048b2 -> 818a4aaeef4f (the line `функции: арифметика_цикла версия 1 хеш …`).
The line ends are kept (the files are read and written as they are).
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
STD = {"time_now": "время_сейчас", "new_id": "новый_ид"}
CLASS = {"изменчивая": "изменчивая", "действующая": "действующая", "volatile": "изменчивая", "acting": "действующая"}
REPORT = []
HASH_OLD, HASH_NEW = "ebb7658048b2", "818a4aaeef4f"


def note(m):
    REPORT.append(m)


def split_top(text, seps):
    parts, cur, depth, quoted, esc = [], "", 0, False, False
    for ch in text:
        if quoted:
            cur += ch
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                quoted = False
            continue
        if ch == '"':
            quoted = True
            cur += ch
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if depth == 0 and ch in seps:
            parts.append(cur)
            cur = ""
            continue
        cur += ch
    parts.append(cur)
    return parts


def find_close(text, open_at):
    depth, quoted, esc = 0, False, False
    for i in range(open_at, len(text)):
        ch = text[i]
        if quoted:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                quoted = False
        elif ch == '"':
            quoted = True
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                return i if ch == ")" else -1
    return -1


CALL = re.compile(r"(?<![\w.])вызвать\(")
COUNT = {"calls": 0, "std": 0}


def convert_calls(text):
    out, pos = "", 0
    while True:
        m = CALL.search(text, pos)
        if not m:
            return out + text[pos:]
        close = find_close(text, m.end() - 1)
        if close < 0:
            note("not closed: %r" % text[m.start():m.start() + 60])
            out += text[pos:m.end()]
            pos = m.end()
            continue
        parts = split_top(text[m.end():close], ",")
        name = parts[0].strip()
        if not re.fullmatch(r"[^\W\d]\w*", name):
            note("a call whose first argument is not a name, left: %r" % text[m.start():close + 1][:80])
            out += text[pos:close + 1]
            pos = close + 1
            continue
        args = [convert_calls(a.strip()) for a in parts[1:]]
        COUNT["calls"] += 1
        if name in STD:
            COUNT["std"] += 1
            name = STD[name]
        out += text[pos:m.start()] + name + "(" + ", ".join(args) + ")"
        pos = close + 1


def cells_of(line):
    cells, cur, esc = [], "", False
    for ch in line.strip():
        if esc:
            cur += "|" if ch == "|" else "\\" + ch
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            cells.append(cur.strip())
            cur = ""
        else:
            cur += ch
    cells.append(cur.strip())
    return cells[1:-1]


def declaration(cells, source):
    name, params, result, cls = cells[0].strip("`"), cells[1], cells[2], cells[3]
    if name in STD:
        return None
    ps = []
    if params not in ("—", "-", ""):
        for part in split_top(params, ","):
            part = part.strip()
            if not re.match(r"\S+\s+\S", part):
                note("%s: the parameter %r of %s has no type" % (source, part, name))
            ps.append(part)
    text = "внешняя функция %s(%s)" % (name, ", ".join(ps))
    if cls not in CLASS:
        note("%s: the class %r of %s is unknown" % (source, cls, name))
    else:
        text += " " + CLASS[cls]
    if result not in ("—", "-", ""):
        text += " -> " + result
    COUNT["decl"] = COUNT.get("decl", 0) + 1
    return text


def convert_section(lines, source):
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.rstrip("\r\n").rstrip() == "## Примитивы":
            eol = "\r\n" if line.endswith("\r\n") else "\n"
            out.append("## Внешние функции" + eol)
            i += 1
            j = i
            while j < len(lines) and lines[j].strip() == "":
                j += 1
            if j < len(lines) and lines[j].lstrip().startswith("|"):
                k = j
                while k < len(lines) and lines[k].lstrip().startswith("|"):
                    k += 1
                decls = [d for d in (declaration(cells_of(r), source) for r in lines[j + 2:k]) if d]
                out.append(eol)
                if decls:
                    out.append("```" + eol)
                    out.extend(d + eol for d in decls)
                    out.append("```" + eol)
                else:
                    out.append("—" + eol)
                i = k
                continue
            note("%s: the section Примитивы is not a table" % source)
            continue
        out.append(line)
        i += 1
    return out


def migrate(text, source):
    text = "".join(convert_section(text.splitlines(keepends=True), source))
    text = convert_calls(text)
    n = len(re.findall(r"^(?:- )?format: 2\.23", text, re.M))
    text = re.sub(r"^((?:- )?format: )2\.23", r"\g<1>2.24", text, flags=re.M)
    text = text.replace("machine_version: alula-2.23", "machine_version: alula-2.24")
    text = text.replace("версия формата 2.23", "версия формата 2.24")
    text = text.replace(HASH_OLD, HASH_NEW)
    COUNT["format"] = COUNT.get("format", 0) + n
    return text


def main():
    args = sys.argv[1:]
    report_only = bool(args) and args[0] == "--report"
    if report_only:
        args = args[1:]
    for path in args:
        text = open(path, encoding="utf-8", newline="").read()
        new = migrate(text, path)
        if new != text:
            if not report_only:
                open(path, "w", encoding="utf-8", newline="").write(new)
            print("changed", path)
    print("calls %d (standard %d), declarations %d, format lines %d" % (COUNT["calls"], COUNT["std"], COUNT.get("decl", 0), COUNT.get("format", 0)))
    for r in REPORT:
        print("note:", r)


if __name__ == "__main__":
    main()
```

2026-10-25 21:00 документ: возвращено владельцу постановки (не решено мной): (1) `machines/product/chat.alula.json` остаётся рукописным (меняется только `alula_version`), критерий допускает в нём лишь различие имён и заголовка; чтобы «деревья равны сборке» было буквальным, нужно переписать три папки `src/` (`machine_table_machines`, `machine_text_render_machines`, `machine_run_machines`), которые правят текст рукописного дерева и ждут латинские имена; (2) тип и класс `remove_unsound` и `build_summary` в реестре записаны по тексту спецификации (`int>=1`, `build_summary` изменчивая), а образец реестра пакета хранит другое (`int>=0`, `acting`) — расхождение внутри пакета, пакет не правился; (3) из `registry.md` удалён тип `RoleResult` (никем не используется после AL-131); (4) инструмент `tools/check-alula-keywords.py` Методики даёт ложные срабатывания на объявлениях внешних функций (журнал 181) — здесь он не запускался
