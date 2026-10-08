#!/bin/sh
# Зачем: подключить хуки git проекта одной командой и записать ожидаемый адрес автора для стража
#     сообщения; повторный запуск ничего не меняет, а отказ громкий — тихой подмены чужой настройки нет.
# Проверяет: корень репозитория; три хука (pre-commit, commit-msg, pre-push) на месте; рабочий Python;
#     git config user.email задан; core.hooksPath пуст или уже равен scripts/githooks; адрес автора пуст
#     или уже равен user.email. Иная настройка — отказ с подсказкой флага --reset.
# Не проверяет: сами стражи (их проверяют самотесты) и содержимое чужих хуков в .git/hooks (только
#     предупреждает, что они перестанут работать).
# Правило: AGENTS.md п.14 (не должно быть ручных команд там, где их может сделать программа) и п.8.
#
# Использование: sh scripts/install-hooks.sh [--reset]
# Относительный путь core.hooksPath живёт в общей конфигурации ВСЕХ рабочих деревьев репозитория: в дереве
# на ветке, созданной до слияния задачи стражей, папки scripts/githooks нет, и хуки там молча не работают;
# такие ветки обновляются ребейзом на main.
set -u

reset=0
for arg in "$@"; do
  case "$arg" in
    --reset) reset=1 ;;
    *) echo "FAIL: предпосылка: неизвестный аргумент $arg"; exit 2 ;;
  esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "FAIL: предпосылка: запустите из рабочего дерева репозитория git"; exit 1; }
here=scripts/githooks

for hook in pre-commit commit-msg pre-push; do
  if [ ! -f "$root/$here/$hook" ]; then
    echo "FAIL: предпосылка: нет хука $here/$hook в этом дереве; обновите ветку (git rebase main) и повторите"
    exit 1
  fi
done

# shellcheck disable=SC1091
. "$root/scripts/guards/lib/find-python.sh"
find_python || exit 1

email=$(git config --get user.email 2>/dev/null)
if [ -z "$email" ]; then
  echo "FAIL: предпосылка: не задан git config user.email; задайте его (git config user.email <адрес>) и повторите"
  exit 1
fi

cur_path=$(git config --get core.hooksPath 2>/dev/null)
cur_email=$(git config --get crewharness.expectedEmail 2>/dev/null)

if [ -n "$cur_path" ] && [ "$cur_path" != "$here" ] && [ "$reset" -eq 0 ]; then
  echo "FAIL: core.hooksPath уже задан другим значением; ничего не изменено. Если это ваша настройка и она не нужна, повторите с --reset"
  exit 1
fi
if [ -n "$cur_email" ] && [ "$cur_email" != "$email" ] && [ "$reset" -eq 0 ]; then
  echo "FAIL: crewharness.expectedEmail уже задан другим адресом; ничего не изменено. Повторите с --reset, чтобы взять текущий user.email"
  exit 1
fi

changed=0
if [ "$cur_path" != "$here" ]; then
  git config --local core.hooksPath "$here" || { echo "FAIL: не удалось записать core.hooksPath"; exit 1; }
  echo "записано: core.hooksPath = $here"
  changed=1
fi
if [ "$cur_email" != "$email" ]; then
  git config --local crewharness.expectedEmail "$email" || { echo "FAIL: не удалось записать crewharness.expectedEmail"; exit 1; }
  echo "записано: crewharness.expectedEmail = адрес из user.email"
  changed=1
fi

hooks_dir=$(git rev-parse --git-common-dir 2>/dev/null)/hooks
live=
if [ -n "$hooks_dir" ] && [ -d "$hooks_dir" ]; then
  for f in "$hooks_dir"/*; do
    [ -f "$f" ] || continue
    case "$f" in *.sample) continue ;; esac
    live="$live $(basename "$f")"
  done
fi
if [ -n "$live" ]; then
  echo "предупреждение: в .git/hooks есть действующие хуки, они перестанут работать из-за core.hooksPath:$live"
fi

if [ "$changed" -eq 0 ]; then
  echo "ничего не изменилось: хуки уже подключены"
else
  echo "ок: хуки подключены. Настройка общая для всех рабочих деревьев этого репозитория:"
  echo "в дереве на ветке без папки $here хуки молча не работают; обновите такую ветку ребейзом на main."
fi
exit 0
