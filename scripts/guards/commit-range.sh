#!/bin/sh
# Зачем: одно место, где решается, какие коммиты пуша судить; им пользуются хук pre-push и CI (подпись
#     и страж сообщения), чтобы диапазон не расходился между локальной и серверной проверкой.
# Проверяет: ничего не судит; печатает хеши коммитов диапазона, старые первыми. Пуш в существующую ветку —
#     коммиты между прежней и новой головой; первый пуш новой ветки — коммиты, которых нет в удалённом
#     репозитории (все его ветки) или в основной ветке; запрос на слияние — от базы до головы.
# Не проверяет: сами коммиты и файлы. Прошлые коммиты основной ветки в диапазон не входят.
# Правило: AGENTS.md п.4 (подпись и сообщение), п.5 (история не переписывается); контракт REQ-18, REQ-19.
#
# Использование: sh commit-range.sh --old <хеш|нулевой> --new <хеш> [--remote <имя>] [--main <ссылка>]
# Прежняя голова не найдена локально — код 3 с подсказкой «сначала git fetch» (диапазон не угадывается).
# Нет ни --remote, ни --main у новой ветки — код 3: не от чего отсчитать.
set -u

old=
new=
remote=
main=
while [ $# -gt 0 ]; do
  case "$1" in
    --old) old=${2-}; shift 2 ;;
    --new) new=${2-}; shift 2 ;;
    --remote) remote=${2-}; shift 2 ;;
    --main) main=${2-}; shift 2 ;;
    *) echo "FAIL: предпосылка: неизвестный аргумент $1" >&2; exit 2 ;;
  esac
done

if [ -z "$new" ]; then
  echo "FAIL: предпосылка: не указана новая голова (--new)" >&2
  exit 2
fi

is_zero=0
if [ -z "$old" ]; then
  is_zero=1
else
  stripped=$(printf '%s' "$old" | tr -d '0')
  [ -z "$stripped" ] && is_zero=1
fi

if [ "$is_zero" -eq 0 ]; then
  if ! git cat-file -e "$old^{commit}" 2>/dev/null; then
    echo "FAIL: прежней головы $old нет локально: сначала git fetch, потом повторите пуш" >&2
    exit 3
  fi
  git rev-list --reverse "$old..$new"
  exit $?
fi

# первый пуш новой ветки: коммиты, которых нет в удалённом репозитории и в основной ветке
found=0
if [ -n "$remote" ] && [ -n "$(git for-each-ref "refs/remotes/$remote/" --count=1 --format=x 2>/dev/null)" ]; then
  found=1
fi
if [ -n "$main" ] && git rev-parse --verify --quiet "$main^{commit}" >/dev/null 2>&1; then
  found=1
fi
if [ "$found" -eq 0 ]; then
  echo "FAIL: предпосылка: новая ветка, а удалённых веток и основной ветки локально нет: сначала git fetch" >&2
  exit 3
fi
set -- "$new" --not
[ -n "$remote" ] && set -- "$@" "--remotes=$remote"
if [ -n "$main" ] && git rev-parse --verify --quiet "$main^{commit}" >/dev/null 2>&1; then
  set -- "$@" "$main"
fi
git rev-list --reverse "$@"
