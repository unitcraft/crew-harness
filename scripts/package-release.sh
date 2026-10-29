#!/bin/sh
# Зачем: собрать релизный комплект продукта одной командой (задача 248): машины продукта не вшиты в
#     программы, хаб читает их из machines/product рядом с собой, поэтому комплект — это программы и
#     эта папка; руками её не собирают, а собранное проверяет страж.
# Проверяет: target/crew-harness.exe и target/crew-hub.exe есть (с --build собирает их nova build);
#     папка комплекта пуста или её нет; кладёт обе программы и machines/product: dialog.alula.json,
#     dialog.alula.md, journal.md и libs/ (без tests/, без чата chat.* — он только для тестов);
#     затем зовёт стража scripts/guards/check-release-kit.py --kit на собранной папке.
# Не проверяет: что программы собраны из этого дерева без --build, что nova в PATH (без --build не нужна).
# Правило: задача 248; AGENTS.md п.14 (не должно быть ручных команд там, где их может сделать программа).
#
# Использование: sh scripts/package-release.sh <папка комплекта> [--build]
# Код 0 — комплект собран и страж зелёный; иначе — строка FAIL и код 1 (2 — неверные аргументы).
set -u

kit=""
build=0
for arg in "$@"; do
  case "$arg" in
    --build) build=1 ;;
    -*) echo "FAIL: предпосылка: неизвестный аргумент $arg"; exit 2 ;;
    *) if [ -n "$kit" ]; then echo "FAIL: предпосылка: папка комплекта названа дважды"; exit 2; fi; kit=$arg ;;
  esac
done
[ -n "$kit" ] || { echo "FAIL: предпосылка: назовите папку комплекта: sh scripts/package-release.sh <папка> [--build]"; exit 2; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "FAIL: предпосылка: запустите из рабочего дерева репозитория git"; exit 1; }
PYTHON=${PYTHON:-python}
here=$(cd "$(dirname "$0")" && pwd)

if [ "$build" = 1 ]; then
  (cd "$root" && nova build src/crew_hub.nv -o target/crew-hub.exe) || { echo "FAIL: nova build crew-hub"; exit 1; }
  (cd "$root" && nova build src/crew_harness.nv -o target/crew-harness.exe) || { echo "FAIL: nova build crew-harness"; exit 1; }
fi
for program in crew-harness.exe crew-hub.exe; do
  [ -f "$root/target/$program" ] || { echo "FAIL: предпосылка: нет target/$program; соберите (--build)"; exit 1; }
done
if [ -e "$kit" ] && [ -n "$(ls -A "$kit" 2>/dev/null)" ]; then
  echo "FAIL: предпосылка: папка комплекта $kit не пуста"; exit 1
fi

mkdir -p "$kit/machines/product/libs" || { echo "FAIL: папка $kit не создаётся"; exit 1; }
cp "$root/target/crew-harness.exe" "$root/target/crew-hub.exe" "$kit/" || { echo "FAIL: программы не скопированы"; exit 1; }
for name in dialog.alula.json dialog.alula.md journal.md; do
  cp "$root/machines/product/$name" "$kit/machines/product/" || { echo "FAIL: machines/product/$name не скопирован"; exit 1; }
done
for lib in "$root"/machines/product/libs/*.alula.md; do
  [ -f "$lib" ] || continue
  cp "$lib" "$kit/machines/product/libs/" || { echo "FAIL: $lib не скопирован"; exit 1; }
done

"$PYTHON" "$here/guards/check-release-kit.py" --root "$root" --kit "$kit" || { echo "FAIL: страж комплекта красный"; exit 1; }
echo "комплект: $kit"
