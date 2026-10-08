#!/bin/sh
# Зачем: прогнать все самотесты стражей одним запуском и выдать один вердикт; локально и в CI.
# Проверяет: каждый selftest/test-*.py и test-*.sh завершается кодом 0 и печатает итог
#     «итого: N проб, упало 0»; тест без итоговой строки или с упавшими пробами — красный.
# Не проверяет: сами правила стражей (это делают сами самотесты) и «доказательство красного»
#     (его делает prove-red.sh).
# Правило: AGENTS.md п.8 (перед пушем весь набор проверок затронутой части).
#
# Использование: sh scripts/guards/selftest/run-selftests.sh
# Самотесты идут по одному, друг за другом. Вывод не содержит времени и путей: два прогона под
# разными локалями сравниваются построчно (REQ-37).
set -u

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$here/../lib/find-python.sh"
find_python || exit 1

tmp=$(mktemp -d 2>/dev/null) || { echo "FAIL: предпосылка: не создать временную папку" >&2; exit 1; }
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

total=0
failed=0
for t in "$here"/test-*.py "$here"/test-*.sh; do
  [ -f "$t" ] || continue
  name=$(basename "$t")
  total=$((total + 1))
  case "$t" in
    *.py) $PYTHON "$t" > "$tmp/out" 2>"$tmp/err"; rc=$? ;;
    *) sh "$t" > "$tmp/out" 2>"$tmp/err"; rc=$? ;;
  esac
  last=$(tail -n 1 "$tmp/out")
  case "$last" in
    "итого: "*" проб, упало 0") good=1 ;;
    *) good=0 ;;
  esac
  if [ "$rc" -eq 0 ] && [ "$good" -eq 1 ]; then
    echo "$name: $last"
  else
    failed=$((failed + 1))
    echo "FAIL $name: код $rc, итог «$last»"
    grep 'FAIL' "$tmp/out" | head -n 20
    head -n 5 "$tmp/err"
  fi
done

if [ "$total" -eq 0 ]; then
  echo "FAIL: мишень потеряна: нет ни одного самотеста test-*"
  exit 1
fi
if [ "$failed" -gt 0 ]; then
  echo "FAIL: самотесты: упало $failed из $total"
  exit 1
fi
echo "ок: осмотрено $total самотестов, упало 0"
