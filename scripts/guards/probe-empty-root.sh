#!/bin/sh
# Зачем: пустота не бывает чистой. Страж, который на пустом корне печатает «ок», проверяет не то, что
#     нужно: переименование папки или потеря мишени сделали бы его вечно зелёным.
# Проверяет: каждого стража дерева (check-* и guard-secrets.py в режиме дерева) на трёх мишенях: пустой
#     репозиторий git, папка без git, пустой каркас (пустые doc/ и opencode-plugin/test/). Ни один вердикт не
#     должен начинаться с «ок:»: допустимы «FAIL: мишень потеряна», «FAIL: предпосылка» и «судить нечего: ...».
#     Печатает таблицу страж, мишень, вердикт, код возврата.
# Не проверяет: страж сообщения (пустое сообщение проверяет его самотест) и стража индекса на пустом индексе
#     (его вердикт «судить нечего» проверяет test-guard-secrets.py).
# Правило: AGENTS.md п.8; REQ-27 и AC-18 задачи.
#
# Использование: sh scripts/guards/probe-empty-root.sh [--dir <папка стражей>]
# Список запрещённых имён для проб - временный, выдуманный: настоящий список не нужен и не читается.
set -u

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$here/lib/find-python.sh"
find_python || exit 1

guards_dir=$here
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) guards_dir=$2; shift 2 ;;
    *) echo "FAIL: предпосылка: неизвестный аргумент $1"; exit 2 ;;
  esac
done

tmp=$(mktemp -d 2>/dev/null) || { echo "FAIL: предпосылка: не создать временную папку"; exit 1; }
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

printf 'zorblax-demo\n' > "$tmp/names.txt"
CREW_PRIVATE_NAMES_FILE="$tmp/names.txt"
export CREW_PRIVATE_NAMES_FILE

mkdir -p "$tmp/t1" "$tmp/t2" "$tmp/t3"
git -C "$tmp/t1" init -q 2>/dev/null
git -C "$tmp/t3" init -q 2>/dev/null
mkdir -p "$tmp/t3/doc" "$tmp/t3/opencode-plugin/test"

probes=0
bad=0
for guard in "$guards_dir"/check-*.py "$guards_dir"/check-*.sh "$guards_dir"/guard-secrets.py; do
  [ -f "$guard" ] || continue
  name=$(basename "$guard")
  for target in t1 t2 t3; do
    case "$target" in
      t1) label="пустой репозиторий git" ;;
      t2) label="папка без git" ;;
      t3) label="пустой каркас" ;;
    esac
    extra=
    [ "$name" = "guard-secrets.py" ] && extra=--tree
    case "$guard" in
      *.py) $PYTHON "$guard" --root "$tmp/$target" $extra > "$tmp/out" 2>&1 ;;
      *) sh "$guard" --root "$tmp/$target" $extra > "$tmp/out" 2>&1 ;;
    esac
    rc=$?
    verdict=$(tail -n 1 "$tmp/out")
    probes=$((probes + 1))
    echo "$name | $label | $verdict | код $rc"
    case "$verdict" in
      "ок:"*) bad=$((bad + 1)); echo "  ^ ПРОВАЛ: «ок» на пустоте" ;;
      "судить нечего:"*|"FAIL"*) ;;
      *) bad=$((bad + 1)); echo "  ^ ПРОВАЛ: вердикт не из допустимых" ;;
    esac
  done
done

if [ "$probes" -eq 0 ]; then
  echo "FAIL: мишень потеряна: нет ни одного стража дерева"
  exit 1
fi
if [ "$bad" -gt 0 ]; then
  echo "FAIL: на пустоте нет красного или «судить нечего»: $bad из $probes запусков"
  exit 1
fi
echo "ок: осмотрено $probes запусков, «ок» на пустоте нет"
