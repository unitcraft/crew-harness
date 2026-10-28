#!/bin/sh
# accept-249.sh - the criterion of task 249: the group of the methodology leaves the product.
#
# Run from the root of the tree: sh doc/tasks/249-alula-0-27-gruppa-metodiki-uhodit-iz-pro/accept-249.sh
# ALULA - the program `alula` 0.27.0 (required). ACCEPT_249_SRC=skip skips the units of `src/`;
# otherwise NOVA_SETUP is the `setup-env.ps1` of Nova Oracle 0.1.0 and the units that import
# `crew_harness.machines` go by `nova test src/<folder> --jobs 2 --timeout 1800`, one by one.
# The heavy part (src) goes through the queue of the machine (AGENTS.md p. 10).
set -u

red=0
say_red() { echo "КРАСНОЕ: $*"; red=$((red + 1)); }

# 1. The folder of the methodology is gone.
if [ -e machines/methodology ]; then say_red "machines/methodology есть ($(find machines/methodology -type f | wc -l) файлов)"; fi

# 2. No reference to the folder and no embed of it: src, machines, the READMEs, scripts, nova.toml.
refs=$(grep -rIl "machines/methodology\|\.\./\.\./machines/methodology" src machines scripts opencode-plugin/README.md README.md nova.toml 2>/dev/null | grep -v "^machines/methodology/" | wc -l)
[ "$refs" -eq 0 ] || say_red "ссылки на machines/methodology: $refs файлов"

# 3. The names of the methodology data in the code of src.
names=$(grep -rIlE "methodology_(registry|journal|nested|machines|tables|libraries|files|scenarios)|agent_step_(machine|table|sample)|cycle_check_(machine|table)|session_start_(machine|table)|task_runner_(machine|table)" src 2>/dev/null | wc -l)
[ "$names" -eq 0 ] || say_red "имена данных методики в src: $names файлов"

# 4. The comment «kept here until task 159» is gone (task 159 is closed).
kept=$(grep -rIl "until task 159" . 2>/dev/null | grep -v "^./doc/tasks/\|^./.git/" | wc -l)
[ "$kept" -eq 0 ] || say_red "«until task 159» осталось: $kept файлов"

# 5. The product: 81 of 81.
product=$("$ALULA" test machines/product 2>&1 | tail -1)
case "$product" in "81 of 81 tests passed") ;; *) say_red "product: $product" ;; esac

# 6. The guards: 9 of 9.
guards=$(sh scripts/guards/run-all.sh 2>&1 | grep "^итого:")
case "$guards" in "итого: ок 9, судить нечего 0, пропущено 0, FAIL 0") ;; *) say_red "стражи: $guards" ;; esac

# 7. The units of src that read the machines (ACCEPT_249_SRC=skip skips them).
src="пропущено (ACCEPT_249_SRC=skip)"
if [ "${ACCEPT_249_SRC:-}" != "skip" ]; then
  green=0; failed=""
  for d in $(grep -rl "import crew_harness.machines\.\|module crew_harness.machines" src --include=*.nv | sed 's|^src/||; s|/.*||' | sort -u); do
    if powershell -NoProfile -Command ". '$NOVA_SETUP' | Out-Null; nova test src/$d --jobs 2 --timeout 1800" > "/tmp/accept-249-$d.log" 2>&1; then
      green=$((green + 1))
    else
      failed="$failed $d"
    fi
  done
  src="папок $green зелёных, красных:${failed:- 0}"
  [ -z "$failed" ] || say_red "src:$failed"
fi

summary="$("$ALULA" version); product ${product% tests passed}; ${guards#итого: }; src: $src"
if [ "$red" -eq 0 ]; then echo "ПРИНЯТО 249: $summary"; else echo "НЕ ПРИНЯТО 249 ($red красных): $summary"; exit 1; fi
