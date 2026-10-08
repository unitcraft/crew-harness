#!/bin/sh
# Зачем: настройки GitHub, от которых зависят стражи, делаются скриптом, а не руками в веб-интерфейсе:
#     защита ветки main (дисциплина истории, которую хуки не держат) и секрет со списком запрещённых имён
#     для CI. Повтор ничего не меняет, а каждое изменение читается обратно и сверяется с заданным.
# Проверяет: после записи защиты читает её и сверяет значения (запрет силового пуша и удаления, обязательная
#     линейная история, действие на администраторов, нет правил «pull request» и «status checks»); перед
#     секретом проверяет, что файл списка есть и не пуст; log-search ищет значения пробы в журнале прогона
#     с положительным контролем.
# Не проверяет: содержимое списка имён и сами стражи. Скрипт запускает агент только по слову владельца.
# Правило: ADR-0006, AGENTS.md п.3 и п.5; REQ-17, REQ-04 задачи.
#
# Использование: sh scripts/github-setup.sh [--dry-run] [--repo <владелец/имя>] [--branch <ветка>] <команда> [аргументы]
# Команды: protect, status, secret, probe-set, probe-branch <слаг>, probe-clear, unprotect, log-search <номер прогона>
#     (log-search --file <файл> читает журнал из файла: проверка логики без GitHub).
# --dry-run печатает действия и тело запроса и ничего не вызывает. Значения секретов нигде не печатаются,
# трассировка (set -x) не включается. Для main снятия защиты в скрипте нет: unprotect работает только со
# служебными ветками.
set -u

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$here/guards/lib/find-python.sh"

repo=unitcraft/crew-harness
branch=main
dry=0
rest=
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    --repo) repo=${2-}; shift 2 ;;
    --branch) branch=${2-}; shift 2 ;;
    *) break ;;
  esac
done
cmd=${1-}
[ $# -gt 0 ] && shift
rest=$*

names_file=${CREW_PRIVATE_NAMES_FILE:-${HOME:-}/.config/crew-harness/private-names.txt}
probe_values=${TMPDIR:-/tmp}/crew-probe-values.txt

die() {
  echo "FAIL: $1"
  exit 1
}

need_gh() {
  [ "$dry" -eq 1 ] && return 0
  command -v gh >/dev/null 2>&1 || die "предпосылка: нет команды gh (GitHub CLI); установите и войдите (gh auth login)"
}

# step <описание> <команда...>: в режиме --dry-run только печатает, иначе выполняет.
step() {
  desc=$1
  shift
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] $desc"
    return 0
  fi
  "$@"
}

protection_body='{"required_status_checks":null,"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}'

# check_protection <json-файл>: сверка прочитанной защиты с заданной; печатает расхождения.
check_protection() {
  find_python || exit 1
  $PYTHON - "$1" <<'PYEOF'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
def flag(name):
    value = data.get(name)
    return value.get("enabled") if isinstance(value, dict) else value
want = {"allow_force_pushes": False, "allow_deletions": False, "required_linear_history": True, "enforce_admins": True}
bad = ["%s: ждали %s, получили %s" % (k, v, flag(k)) for k, v in want.items() if flag(k) != v]
for absent in ("required_pull_request_reviews", "required_status_checks"):
    if data.get(absent):
        bad.append("%s должно отсутствовать" % absent)
for line in bad:
    print("расхождение: " + line)
sys.exit(1 if bad else 0)
PYEOF
}

cmd_protect() {
  endpoint="repos/$repo/branches/$branch/protection"
  echo "защита ветки $branch в $repo: запрет силового пуша и удаления, линейная история, действие на администраторов; правил pull request и status checks нет"
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] gh api -X PUT $endpoint --input - с телом:"
    echo "$protection_body"
    echo "[dry-run] затем gh api $endpoint и сверка со значениями выше"
    return 0
  fi
  need_gh
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT
  if gh api "$endpoint" > "$tmp" 2>/dev/null && check_protection "$tmp" >/dev/null 2>&1; then
    echo "ничего не изменилось: защита уже задана"
    return 0
  fi
  printf '%s' "$protection_body" | gh api -X PUT "$endpoint" --input - >/dev/null || die "GitHub отклонил запись защиты ветки"
  gh api "$endpoint" > "$tmp" || die "не удалось прочитать защиту после записи"
  if check_protection "$tmp"; then
    echo "ок: защита ветки $branch применена и сверена"
  else
    die "защита записана, но прочитанные значения не совпали с заданными"
  fi
}

cmd_status() {
  need_gh
  step "gh api repos/$repo/branches/$branch/protection" gh api "repos/$repo/branches/$branch/protection"
  step "gh secret list --repo $repo" gh secret list --repo "$repo"
}

cmd_secret() {
  if [ ! -s "$names_file" ]; then
    die "предпосылка: нет файла со списком запрещённых имён или он пуст (путь переопределяет CREW_PRIVATE_NAMES_FILE; по умолчанию ~/.config/crew-harness/private-names.txt)"
  fi
  need_gh
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] gh secret set CREW_PRIVATE_NAMES --repo $repo < <файл списка> (значение не печатается)"
    return 0
  fi
  gh secret set CREW_PRIVATE_NAMES --repo "$repo" < "$names_file" >/dev/null || die "не удалось записать секрет"
  echo "ок: секрет CREW_PRIVATE_NAMES записан (значение не печатается)"
}

cmd_probe_set() {
  need_gh
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] создать локальный файл с двумя выдуманными значениями пробы ($probe_values)"
    echo "[dry-run] gh secret set CREW_PRIVATE_NAMES_PROBE --repo $repo < <файл пробы> (значения не печатаются)"
    return 0
  fi
  find_python || exit 1
  $PYTHON - "$probe_values" <<'PYEOF'
import secrets, sys
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as handle:
    handle.write("probe-" + secrets.token_hex(6) + "\nprobe-" + secrets.token_hex(6) + "\n")
PYEOF
  gh secret set CREW_PRIVATE_NAMES_PROBE --repo "$repo" < "$probe_values" >/dev/null || die "не удалось записать секрет пробы"
  echo "ок: секрет CREW_PRIVATE_NAMES_PROBE записан из двух выдуманных значений (локальный файл значений создан)"
}

cmd_probe_branch() {
  slug=$rest
  [ -n "$slug" ] || die "предпосылка: нужен слаг: probe-branch <слаг>"
  case "$slug" in *[!A-Za-z0-9._-]*) die "предпосылка: слаг из букв, цифр, точки, дефиса и подчёркивания" ;; esac
  name="probe/$slug"
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] git worktree add -b $name <временная папка> HEAD; скопировать scripts/guards/probe/probe-log.yml.tmpl в .github/workflows/probe-log.yml; записать probe/planted.txt с первым значением; закоммитить; удалить временное дерево"
    return 0
  fi
  [ -s "$probe_values" ] || die "предпосылка: нет файла значений пробы; сначала probe-set"
  root=$(git rev-parse --show-toplevel) || die "предпосылка: запустите из рабочего дерева репозитория"
  [ -f "$root/scripts/guards/probe/probe-log.yml.tmpl" ] || die "предпосылка: нет шаблона scripts/guards/probe/probe-log.yml.tmpl"
  wt=$(mktemp -d) || die "не создать временную папку"
  rmdir "$wt"
  git -C "$root" worktree add -q -b "$name" "$wt" HEAD || die "не удалось создать ветку $name"
  mkdir -p "$wt/.github/workflows" "$wt/probe"
  cp "$root/scripts/guards/probe/probe-log.yml.tmpl" "$wt/.github/workflows/probe-log.yml"
  head -n 1 "$probe_values" > "$wt/probe/planted.txt"
  empty_hooks=$(mktemp -d)
  git -C "$wt" add -- .github/workflows/probe-log.yml probe/planted.txt
  git -C "$wt" -c "core.hooksPath=$empty_hooks" commit -q -s -m "Probe: check that the CI log hides the secret values" -- .github/workflows/probe-log.yml probe/planted.txt || die "не удалось закоммитить пробу"
  rm -rf "$empty_hooks"
  git -C "$root" worktree remove --force "$wt"
  echo "ок: локальная ветка $name готова (пуш - по слову владельца)"
}

cmd_probe_clear() {
  need_gh
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] gh secret delete CREW_PRIVATE_NAMES_PROBE --repo $repo; удалить локальный файл значений"
    case "$branch" in probe/*) echo "[dry-run] снять защиту и удалить удалённую ветку $branch" ;; esac
    return 0
  fi
  gh secret delete CREW_PRIVATE_NAMES_PROBE --repo "$repo" >/dev/null 2>&1
  rm -f "$probe_values"
  case "$branch" in
    probe/*)
      gh api -X DELETE "repos/$repo/branches/$branch/protection" >/dev/null 2>&1
      git push origin --delete "$branch" ;;
  esac
  echo "ок: секрет пробы удалён, локальный файл значений убран"
}

cmd_unprotect() {
  case "$branch" in
    probe/*) ;;
    *) die "снимать защиту можно только со служебных веток probe/*; для main в скрипте снятия защиты нет" ;;
  esac
  need_gh
  if [ "$dry" -eq 1 ]; then
    echo "[dry-run] gh api -X DELETE repos/$repo/branches/$branch/protection"
    return 0
  fi
  gh api -X DELETE "repos/$repo/branches/$branch/protection" >/dev/null || die "не удалось снять защиту ветки $branch"
  echo "ок: защита ветки $branch снята"
}

cmd_log_search() {
  find_python || exit 1
  file=
  run_id=
  if [ "${rest%% *}" = "--file" ]; then
    file=${rest#--file }
  else
    run_id=$rest
    [ -n "$run_id" ] || die "предпосылка: нужен номер прогона: log-search <номер>"
  fi
  [ -s "$probe_values" ] || die "предпосылка: нет файла значений пробы ($probe_values); сначала probe-set"
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT
  if [ -n "$file" ]; then
    cp "$file" "$tmp" || die "нет файла журнала"
  else
    need_gh
    gh run view "$run_id" --repo "$repo" --log > "$tmp" 2>&1 || die "не удалось получить журнал прогона"
  fi
  $PYTHON - "$tmp" "$probe_values" <<'PYEOF'
import re, sys
log = open(sys.argv[1], encoding="utf-8", errors="replace").read()
values = [x.strip() for x in open(sys.argv[2], encoding="utf-8").read().splitlines() if x.strip()]
found = [i for i, v in enumerate(values, 1) if v in log]
marker = log.count("PROBE-MARKER")
guard = re.search(r"FAIL \S+:\d+: forbidden-name: \S+ №\d+", log)
print("значений пробы: %d, найдено в журнале: %d" % (len(values), len(found)))
print("положительный контроль PROBE-MARKER в журнале: %d" % marker)
print("строка стража с файлом, строкой и номером образца: %s" % ("есть" if guard else "нет"))
ok = not found and marker > 0 and guard is not None
print("ок: значений в журнале нет" if ok else "FAIL: проба журнала не пройдена")
sys.exit(0 if ok else 1)
PYEOF
}

case "$cmd" in
  protect) cmd_protect ;;
  status) cmd_status ;;
  secret) cmd_secret ;;
  probe-set) cmd_probe_set ;;
  probe-branch) cmd_probe_branch ;;
  probe-clear) cmd_probe_clear ;;
  unprotect) cmd_unprotect ;;
  log-search) cmd_log_search ;;
  *) die "команда не задана или неизвестна; см. шапку скрипта (protect, status, secret, probe-set, probe-branch, probe-clear, unprotect, log-search)" ;;
esac
