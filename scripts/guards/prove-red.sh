#!/bin/sh
# Зачем: доказать, что самотесты стражей действительно ловят поломку: проверка, которая проходит и тогда, когда
#     страж заменён заглушкой «всегда успех», не доказывает ничего.
# Проверяет: во ВРЕМЕННОЙ копии (scripts/, .claude/, .github/) каждый страж подменяется заглушкой на его языке
#     (Python - модуль, выходящий с кодом 0; sh и хуки git - скрипт с exit 0). Заглушка сначала запускается:
#     не исполняется - не засчитана. Затем запускается самотест стража (test-<имя>.py или .sh) из копии; он
#     обязан упасть хотя бы на одной красной пробе («проба красная ...: FAIL»). Итог: «доказано N из N».
# Не проверяет: сами правила стражей (это делают их самотесты) и стражей, не вошедших в перечень
#     (check-*, guard-*.py в scripts/guards, хук агента guard-git.py, хуки git pre-commit, commit-msg, pre-push).
# Правило: AGENTS.md п.3 и п.11: рабочее дерево не меняется, все подмены - в копии во временной папке.
#
# Использование: sh scripts/guards/prove-red.sh [--root <папка>] [--only <часть имени>] [--py-stub-file <файл>]
# --root - откуда копировать (по умолчанию корень этого дерева), --only - один страж по части имени,
# --py-stub-file - свой текст заглушки Python (для проверки самого прогона). Самотесты идут по одному:
# прогон тяжёлый, не запускайте его параллельно с другими тяжёлыми командами.
set -u

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$here/lib/find-python.sh"
find_python || exit 1

root=$(cd "$here/../.." && pwd)
only=
stub_file=
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root=$(cd "$2" && pwd) || exit 1; shift 2 ;;
    --only) only=$2; shift 2 ;;
    --py-stub-file) stub_file=$2; shift 2 ;;
    *) echo "FAIL: предпосылка: неизвестный аргумент $1"; exit 2 ;;
  esac
done

tmp=$(mktemp -d 2>/dev/null) || { echo "FAIL: предпосылка: не создать временную папку"; exit 1; }
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
copy="$tmp/copy"
mkdir -p "$copy"

make_copy() {
  rm -rf "$copy"
  mkdir -p "$copy"
  for d in scripts .claude .github; do
    [ -d "$root/$d" ] && cp -R "$root/$d" "$copy/$d"
  done
  find "$copy" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null
  return 0
}

# stub <файл в копии>: заменить файл заглушкой на его языке.
stub() {
  case "$1" in
    *.py)
      if [ -n "$stub_file" ]; then cp "$stub_file" "$1"; else printf 'import sys\nsys.exit(0)\n' > "$1"; fi ;;
    *) printf '#!/bin/sh\nexit 0\n' > "$1" ;;
  esac
}

proved=0
total=0
failed_names=
make_copy
list=
for f in "$copy"/scripts/guards/check-*.py "$copy"/scripts/guards/check-*.sh "$copy"/scripts/guards/guard-*.py \
         "$copy"/scripts/agent-hooks/guard-git.py "$copy"/scripts/githooks/pre-commit \
         "$copy"/scripts/githooks/commit-msg "$copy"/scripts/githooks/pre-push; do
  [ -f "$f" ] || continue
  list="$list $f"
done

if [ -z "$list" ]; then
  echo "FAIL: мишень потеряна: в копии нет ни одного стража для подмены"
  exit 1
fi

for f in $list; do
  rel=${f#"$copy"/}
  base=$(basename "$f")
  stem=${base%.*}
  [ "$stem" = "$base" ] && stem=$base
  if [ -n "$only" ]; then
    case "$rel" in *"$only"*) ;; *) continue ;; esac
  fi
  total=$((total + 1))
  make_copy
  stub "$copy/$rel"
  case "$rel" in
    *.py) $PYTHON "$copy/$rel" > "$tmp/stub.out" 2>&1; src=$? ;;
    *) sh "$copy/$rel" > "$tmp/stub.out" 2>&1; src=$? ;;
  esac
  if [ "$src" -ne 0 ]; then
    echo "НЕ ДОКАЗАНО $rel: заглушка не исполняется (код $src), не засчитана"
    failed_names="$failed_names $rel"
    continue
  fi
  if [ -f "$copy/scripts/guards/selftest/test-$stem.py" ]; then
    (cd "$copy" && $PYTHON "scripts/guards/selftest/test-$stem.py") > "$tmp/test.out" 2>&1
    trc=$?
  elif [ -f "$copy/scripts/guards/selftest/test-$stem.sh" ]; then
    (cd "$copy" && sh "scripts/guards/selftest/test-$stem.sh") > "$tmp/test.out" 2>&1
    trc=$?
  else
    echo "НЕ ДОКАЗАНО $rel: нет самотеста test-$stem.py или .sh"
    failed_names="$failed_names $rel"
    continue
  fi
  if [ "$trc" -ne 0 ] && grep -q 'проба красная .*: FAIL' "$tmp/test.out"; then
    proved=$((proved + 1))
    echo "доказано $rel"
  else
    echo "НЕ ДОКАЗАНО $rel: с заглушкой самотест не упал на красной пробе (код $trc)"
    failed_names="$failed_names $rel"
  fi
done

if [ "$total" -eq 0 ]; then
  echo "FAIL: мишень потеряна: под --only ничего не нашлось"
  exit 1
fi
if [ "$proved" -eq "$total" ]; then
  echo "ок: доказано $proved из $total"
  exit 0
fi
echo "FAIL: доказано $proved из $total"
exit 1
