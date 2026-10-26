2026-10-26 01:10 документ: исполнение начато по заданию оркестратора (чат, 2026-10-26; папки `task/` нет — постановка пришла текстом): машины продукта и методики из `machines/` и встроенные тексты в `src/` переводятся на формат 2.25 (пакет `alula` 0.7.0); образец — задача 184. Ветка `task-2-25-machines` от `origin/main` (98085ec), рабочее дерево — отдельное, вне основной копии. Пакет `alula` 0.7.0 опубликован (коммит d816e3797ef68ec9427851421df7db47cb844a5b, метка v0.7.0), программа `alula 0.7.0 (Alula 2.25, machine/2)` собрана из этого коммита и лежит вне репозитория; Nova Oracle 0.1.0. Ничего не публикуется и не пушится

2026-10-26 01:17 документ: **красная проба AC-1 (первая запись работы):** раздел спецификации пакета — «формат 2.25» (журнал изменений 2.25, правила AL-133 — функции `время_в_текст` и `текст_во_время`, AL-134 — штамп события `событие.момент` вместо `время_сейчас()`); команда `accept-225` (текст в конце задачи) на прежнем коде красная, потому что программа 0.7.0 отклоняет деревья `alula_version` 2.24, таблицы `format: 2.24` и вызов `время_сейчас()` в `agent_step` (строка 249). Красный вывод (папки `src/` в красной пробе пропущены переменной `ACCEPT_225_SRC=skip`; остальное сокращено до 200 знаков в строке):

```
КРАСНОЕ: alula test machines/methodology: 0 из 514 (ожидалось 514 из 514); machines/methodology/agent_step.alula.json:1:1: check: $.alula_version: the alula_version must be 2.25 (the version of the language of the methodology; there is no transition period), got 2.24
КРАСНОЕ: alula test machines/product: 0 из 81 (ожидалось 81 из 81); machines/product/chat.alula.json:1:1: check: $.alula_version: the alula_version must be 2.25 (the version of the language of the methodology; there is no transition period), got 2.24
КРАСНОЕ: старых форм в machines: 33
tree machines\methodology\agent_step.alula.md: compile failed: ... structure: формат 2.24: версия не известна переводчику, он читает формат 2.25 (строка `format: 2.25`); переходного периода нет
machines\methodology\agent_step.alula.md:249:29: syntax: `время_сейчас()` в формате 2.24 не бывает (AL-134 ...
tree machines\methodology\cycle_check.alula.md: compile failed: ... формат 2.24: версия не известна переводчику ...
  (и так для dialog_steps, session_start, task_runner, product/chat, product/dialog)
trees: 7 tables, differ 7
КРАСНОЕ: деревья не равны сборке
НЕ ПРИНЯТО 225 (5 красных): methodology 0 из 514; product 0 из 81; старых форм 33; деревья не равны; src: пропущено (ACCEPT_225_SRC=skip)
```

2026-10-26 01:20 документ: инвентаризация старых форм до правки (числа, `grep` по строкам): в `machines/` — `format: 2.24` 8 строк (7 таблиц и образец `agent-step-sample.txt`), `alula-2.24` 5 (3 в таблицах и образце — `machine_version`, 2 в деревьях — `version` у `agent_step` и `cycle_check`), `"alula_version":"2.24"` 6 строк (деревья; 7-е, `chat.alula.json`, рукописное с красивой печатью — другая запись), хеш образца файла функций `818a4aaeef4f` 3 (`cycle_check.alula.md`, его дерево, `machines/README.md`; английского `431e7018e2bb` нет), `время_сейчас` 8 строк (по 4 вызова в `agent_step.alula.md` и в образце `agent-step-sample.txt` — СТАРТ `начато`, УЧЁТ, ОСТАНОВЛЕНО, ОШИБКА `сейчас` — плюс по строке «Соответствие коду» в каждом; в деревьях `agent_step.alula.json` — запись внешнего вызова), `time_now` 7 строк (проза «`time_now` — миллисекунды эпохи» в таблице и образце, шапка и таблица `registry.md`, `machines/README.md`, дерево); в `src/` — `2.24` в 13 файлах тестов (кроме `src/web/app.css`, другая вещь), `time_now` в 2 файлах (`machines/data_test.nv`, `machine_registry/registry_test.nv`), хеш `818a4aaeef4f` в `machine_cycle/table_test.nv`; `opencode-plugin/`: деревьев, `alula_version` и формата нет (плагин не правится)

2026-10-26 01:25 документ: миграция таблиц: скрипт вне репозитория (текст — ниже), по образцу `migrate184.py` и скрипта пакета 0.7.0 (перенос данных пакета: строка `format`, `событие.момент` вместо прежней функции времени); запуск на 7 таблицах и образце `agent-step-sample.txt`: строк `format: 2.24` → `2.25` — 8, вызовов `время_сейчас()` → `событие.момент` — 8 (СТАРТ `начато`, УЧЁТ, ОСТАНОВЛЕНО, ОШИБКА `сейчас` — по 4 в таблице и в образце), строк прозы про `time_now` — 4 (строка «Соответствие коду» и строка под таблицей внешних функций, в таблице и в образце: `time_now` больше не примитив, время — `событие.момент`), хеш образца файла функций `818a4aaeef4f` → `f757b8aa7b08` (русский; английского хеша в `machines/` нет) — `cycle_check.alula.md` и `machines/README.md`; проза «версия формата 2.24» → 2.25 (таблица и образец `agent_step`). Объявления внешней функции для времени не было (стандартная не объявлялась) — убирать из таблиц нечего. `machine_version` оставлена `alula-2.24` (см. «спорные места»). `alula check` на 7 таблицах — ok

2026-10-26 01:35 документ: деревья: шесть из семи пересобраны программой 0.7.0 (`alula compile … -o … --force`, перевод строки в конце снят, как в 184); `chat.alula.json` рукописный — заменён только текст `"alula_version": "2.24"` → `"2.25"` (узкое исключение критерия для строковых листьев — по решению владельца, 2026-10-25, как в 184). Разбор JSON деревьев до и после (HEAD против сборки) различается только тем, что должно: у всех `alula_version` 2.24 → 2.25; у `agent_step` четыре записи вызова `time_now` (`primitive_call`) → чтение поля `at` события (`field` от `event`) в СТАРТ, УЧЁТ, ОСТАНОВЛЕНО, ОШИБКА; у `cycle_check` `includes[0].hash` `818a4aaeef4f` → `f757b8aa7b08`; других отличий нет

2026-10-26 01:40 документ: реестр `registry.md` — правится только шапка (время теперь не примитив: «примитив `new_id` — язык, время — штамп события»); таблица примитивов не менялась (`time_now` в ней и не стояла: стандартные давал реестр языка пакета). Реестр языка пакета 0.7.0 содержит один примитив `new_id`, поэтому счёт примитивов методики вместе с языком 60 → 59, изменчивых 37 → 36, действующих 23 без изменений, реестр продукта 2 → 1, общий 60 → 59 (`machines/data_test.nv`, `machine_registry/registry_test.nv`, `machine_session/registry_test.nv`, комментарий в `machines/data.nv`); проверки `time_now` в тестах заменены на `new_id` (класс, подпись `id`, результат — UUID) и добавлена проверка, что `time_now` в реестре нет

2026-10-26 01:50 документ: тесты `src/`: `2.24` → `2.25` в 13 файлах (формат, `alula_version`), хеш `818a4aaeef4f` → `f757b8aa7b08` (`machine_cycle/table_test.nv`); запись события сценария в пакете получила поля `has_at`, `at` — в двух папках (`machine_chat/equal_test.nv`, `machine_dialog_eq/equal_test.nv`, 9 литералов `ScEvent`) дописано `has_at: false, at: 0` (кодогенерация падала: `E_MISSING_FIELD_IN_LITERAL`); `machine_version` в тестах осталась `alula-2.24`: английская копия образца «Шаг агента» берётся из пакета, где версия образца `alula-2.24`, и тесты `machine_agent_en` («ae header», «ae the keyed sample is the product table») требуют ту же версию в нашей таблице. Зависимость: `nova.toml` версия `0.7` (комментарий о 0.7 добавлен), `nova update alula` — `nova.lock.toml`: `alula` 0.7.0, коммит d816e3797ef68ec9427851421df7db47cb844a5b, pin `version:>=0.7.0, <0.8.0` — ровно значения из задания

2026-10-26 02:25 документ: ход прогонов: первый прогон `accept-225` (по две папки, `--jobs 2`, ограничение файла 900 с) — 16 зелёных, 4 красных: `machine_agent_en` (версия `alula-2.25` в таблице при `alula-2.24` в английской копии образца пакета — таблица возвращена к `alula-2.24`, деревья `agent_step` и `cycle_check` пересобраны), `machine_chat` и `machine_dialog_eq` (поля `has_at`, `at`, см. выше) и `machine_runner` — `checks_test` убит по времени (998 с; в 184 тот же файл шёл около 13 минут; сам файл не менялся, по существу красного нет: тест — текстовые проверки, время уходит на сборку со встроенными таблицами; машина в это время была занята другими окнами). Повторный прогон одной папки `machine_runner` с ограничением 900 с — снова убит (998 с); поэтому в окончательном скрипте ограничение файла 1800 с (переменная `ACCEPT_225_TIMEOUT`); число и смысл проверок не менялись

2026-10-26 03:11 документ: итог (прогон чистым заходом, ветка `task-2-25-machines`, вершина кода d0d56f7; жду прогон — оценка была 30 минут, фактически 45: с 02:26 до 03:11, по две папки одновременно, `--jobs 2`, последние ~15 минут — одна папка `machine_runner`): `ПРИНЯТО 225: methodology 514 из 514; product 81 из 81; старых форм 0; деревья равны; src: папок 20 зелёных, красных 0` — те же 20 папок, что в журнале 184; не прогонялось: `product_machines` (в папке нет тестов) и папки с PostgreSQL; очереди машины у исполнителя не было, низкий приоритет не ставился. Числа прежние (514 и 81 как в 184): меняется только запись, число сценариев то же

2026-10-26 03:15 документ: числа до и после (`grep` по `machines/`, критерий): до 33 строки старых форм (`format: 2.24` 8, `"alula_version":"2.24"` 6, `818a4aaeef4f` 3, `время_сейчас` 8, `time_now` 7; строки с несколькими образцами считаются раз), после 0; в `src/`: `2.24` в 13 файлах → 0 (кроме версии машины `alula-2.24`), проверки `time_now` → проверки отсутствия; `alula check` 7 таблиц — ок; `alula test machines/methodology` 514 из 514, `machines/product` 81 из 81; деревья равны сборке 7 из 7 (`chat` — с названным узким исключением)

2026-10-26 03:15 документ: спорные места (не решены мной): (1) `machine_version` остаётся `alula-2.24` в `agent_step`, `cycle_check` и образце `agent-step-sample.txt`: так в образцах пакета 0.7.0 (версия образца при выпуске 2.25 не менялась) и этого требует английская копия образца в тестах `machine_agent_en`; задание допускало `alula-2.25`, но тогда `machine_agent_en` красная; Методике при переносе `agent_step` держать то же значение; (2) прежнее: `chat.alula.json` рукописный, критерий допускает в нём лишь различие имён и заголовка (решение владельца, 2026-10-25); (3) `checks_test` в `machine_runner` идёт 13–17 минут из-за сборки, а не из-за поведения — стоит вынести в более лёгкий тест отдельной задачей; (4) в образце пакета (`spec/samples/agent-step.alula.md`) осталась проза «версия формата 2.24», в нашей копии образца исправлена на 2.25; (5) критерий `accept-225` не ищет `alula-2.24` (это версия машины), в остальном как у 184

2026-10-26 03:15 документ: текст скрипта критерия `accept-225` в окончательном виде (вне репозитория; запускается из корня дерева; против 184 изменены проверка старых форм — формы 2.24 и функция времени, ограничение файла `ACCEPT_225_TIMEOUT`, версии):

```sh
#!/bin/sh
# accept-225: criterion of the task 225 (the machines of the product on Alula 2.25, the package alula 0.7.0).
# The script is OUTSIDE the repository; its text is recorded in doc/tasks/225-machines-product-2-24/log.md.
# usage (from the root of the working tree):  sh accept-225.sh
# env: ACCEPT_225_TIMEOUT (seconds per test file of src/, default 1800), ALULA (the program alula 0.7.0), ACCEPT_225_SRC=skip (do not run the folders of src/ - the red probe only),
#      ACCEPT_225_PAR (folders of src/ at once, default 1, at most 4), ACCEPT_225_METHODOLOGY (scenarios, default 514), ACCEPT_225_PRODUCT (default 81).
# The last line: ПРИНЯТО 225: methodology N из N; product 81 из 81; старых форм 0; деревья равны; src: папок K зелёных, красных 0
set -u
export PYTHONUTF8=1
ALULA="${ALULA:-alula}"
PAR="${ACCEPT_225_PAR:-1}"
TMO="${ACCEPT_225_TIMEOUT:-1800}"
EXP_METH="${ACCEPT_225_METHODOLOGY:-514}"
EXP_PROD="${ACCEPT_225_PRODUCT:-81}"
OUT="${ACCEPT_225_OUT:-${TMPDIR:-/tmp}/accept-225-$$}"
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

# 2. the old forms in machines/ (the 2.24 forms: the time function, the hashes, the versions)
OLD=$(grep -rnF -e 'вызвать(' -e 'parse_agent_reply' -e 'format: 2.24' -e '"alula_version":"2.24"' -e '818a4aaeef4f' -e '431e7018e2bb' -e 'время_сейчас' -e 'time_now' machines | wc -l)
OLD2=$(grep -rnE -e '^## Примитивы' -e '^## Roles' machines | wc -l)
OLDN=$((OLD + OLD2))
[ "$OLDN" = 0 ] || { fail "старых форм в machines: $OLDN"; grep -rnF -e 'вызвать(' -e 'parse_agent_reply' -e 'format: 2.24' -e '"alula_version":"2.24"' -e '818a4aaeef4f' -e '431e7018e2bb' -e 'время_сейчас' -e 'time_now' machines | cut -c1-120 | head -5; }

# 3. the trees equal the build of the program 0.7.0 (parse of JSON; chat.alula.json is written by hand: see TREES_PY)
TREES=ok
python "$(dirname "$0")/trees.py" "$ALULA" machines "$OUT" || { fail "деревья не равны сборке"; TREES=no; }

# 4. the units of src/ with the machines
FOLDERS="machines machine_registry machine_agent machine_agent_en machine_cycle machine_dialog machine_chat alula_eq_machines alula_scenarios_machines alula_cli_machines machine_text_machines machine_text_eq_machines machine_text_render_machines machine_session machine_dialog_eq machine_nested_eq machine_nested_run machine_run_machines machine_table_machines machine_runner"
K=0; RED=0
if [ "${ACCEPT_225_SRC:-run}" = skip ]; then
  SRCLINE="src: пропущено (ACCEPT_225_SRC=skip)"
  BAD=$((BAD + 1))
else
  run_folder() {
    f="$1"
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
  echo "ПРИНЯТО 225: methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья равны; $SRCLINE"
  exit 0
fi
echo "НЕ ПРИНЯТО 225 ($BAD красных): methodology $MN из $MM; product $PN из $PM; старых форм $OLDN; деревья $([ "$TREES" = ok ] && echo равны || echo не равны); $SRCLINE"
exit 1
```

Текст `trees.py` (против 184 — только номера в шапке; исключение для `chat.alula.json` то же):

```python
# -*- coding: utf-8 -*-
"""accept-225, the trees: every machines/*/*.alula.md is built by the program (alula compile) and the JSON is compared with the committed
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

Текст скрипта миграции `migrate225.py` (вне репозитория):

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Task 225: the tables of machines of Alula 2.24 -> 2.25 (the package alula 0.7.0). Outside the repository.

usage: migrate225.py [--report] FILE...   (rewrites in place; --report prints only). Russian tables only (no English table in machines/).
What it does to a table (*.alula.md, agent-step-sample.txt):
  1. `format: 2.24` (with or without the list marker `- `) -> `2.25`; `machine_version: alula-2.24` -> `alula-2.25`; the prose «версия формата 2.24» -> 2.25.
  2. the former function of the time `время_сейчас()` -> the stamp of the event `событие.момент` (AL-134).
  3. the prose about the standard function of the time: `time_now` as a primitive -> «время — `событие.момент`»; the line «`time_now` — миллисекунды эпохи» -> the stamp of the event.
  4. the hash of the sample of the file of functions (the line `функции: арифметика_цикла версия 1 хеш …`): 818a4aaeef4f -> f757b8aa7b08 (ru), 431e7018e2bb -> 75062faf50d1 (en).
The line ends and every other byte are kept (the files are read and written as they are).
"""
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
COUNT = {"format": 0, "version": 0, "time": 0, "prose": 0, "hash": 0}
PROSE = [
    ("`reply_validation`, `close_agent_turn`, `time_now` — примитивы (раздел «Примитивы»).",
     "`reply_validation`, `close_agent_turn` — примитивы (раздел «Внешние функции»); время — `событие.момент`."),
    ("`time_now` — миллисекунды эпохи. ", "`событие.момент` — штамп события, миллисекунды эпохи. "),
]
HASHES = [("818a4aaeef4f", "f757b8aa7b08"), ("431e7018e2bb", "75062faf50d1")]


def migrate(text):
    n = len(re.findall(r"^(?:- )?format: 2\.24", text, re.M))
    text = re.sub(r"^((?:- )?format: )2\.24", r"\g<1>2.25", text, flags=re.M)
    COUNT["format"] += n
    COUNT["version"] += text.count("machine_version: alula-2.24")
    text = text.replace("machine_version: alula-2.24", "machine_version: alula-2.25")
    text = text.replace("версия формата 2.24", "версия формата 2.25")
    COUNT["time"] += text.count("время_сейчас()")
    text = text.replace("время_сейчас()", "событие.момент")
    for a, b in PROSE:
        COUNT["prose"] += text.count(a)
        text = text.replace(a, b)
    for a, b in HASHES:
        COUNT["hash"] += text.count(a)
        text = text.replace(a, b)
    return text


def main():
    args = sys.argv[1:]
    report_only = bool(args) and args[0] == "--report"
    if report_only:
        args = args[1:]
    for path in args:
        text = open(path, encoding="utf-8", newline="").read()
        new = migrate(text)
        if new != text:
            if not report_only:
                open(path, "w", encoding="utf-8", newline="").write(new)
            print("changed", path)
    print("format lines %(format)d, machine_version %(version)d, time calls %(time)d, prose %(prose)d, hash %(hash)d" % COUNT)


if __name__ == "__main__":
    main()
```
