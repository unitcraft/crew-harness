# 014 — переименование: opencode-peers → CrewHarness (crew-harness)

Статус: ✅ ЗАКРЫТ 2026-10-07: переключено; ветка nova влита (`.opencode/crew-harness.json` в main nova), самопроверка без замечаний.

Владелец 2026-10-06: «opencode-peers уже сильно не соответствует название»; выбрано «opencode-harness-crew», затем (2026-10-07, после внешней оценки названия) — **CrewHarness**, репозиторий `crew-harness` без приставки opencode: план 015 выносит задачи из OpenCode, и продукт перестаёт быть только плагином OpenCode;
«следующий план — переименовать название и сделать рефакторинг всех внутренних команд под новое название»;
«старые имена команд не сохраняем, сразу меняем на новые везде и в доке»; «предупреди перед переименованием».

## Решения

| № | Решение | Кто | Дата |
|---|---------|-----|------|
| 0 | Название CrewHarness, репозиторий и пакет `crew-harness`, русская подпись «ИИ-команда в упряжке — обвязка для команды ИИ-агентов»; имя свободно: npm `crew-harness` — 404, на GitHub репозитория с таким именем нет (есть чужие `harness-crew`, `crew-agent-harness`, `crewup-harness`) — проверено 2026-10-07 | владелец | 2026-10-07 |
| 1 | Инструменты `crew_*` (crew_send, crew_task, crew_watch, …), MCP-сервер `crew` (`mcp__crew__crew_send`), команды окна `/crew`, `/crew-config` (`/plans` — как было) | владелец | 2026-10-06 |
| 2 | Старые имена инструментов и команд не сохраняются | владелец | 2026-10-06 |
| 3 | Репозиторий на GitHub и папка на диске — `crew-harness` | владелец | 2026-10-06 |
| 4 | Ящик — `<данные OpenCode>/crew-harness`, ссылкой на настоящую папку прежнего ящика (данные не двигаются) | Claude | 2026-10-07 |
| 5 | Файл настроек проекта — `.opencode/crew-harness.json`; прежний `.opencode/opencode-peers.json` читается, `crew_doctor` просит переименовать: иначе проекты остались бы без настроек в момент переключения | Claude | 2026-10-07 |
| 6 | Переменные окружения наблюдения — `CREW_SESSION_ID`, `CREW_ROLE`, `CREW_PROJECT`, `CREW_REVIEW_N`, `CREW_TASK_N`; MCP — `OPENCODE_CREW_SESSION`, `OPENCODE_CREW_PROJECTS`; тестовые — `CREW_HARNESS_*` | Claude | 2026-10-07 |
| 7 | Исторические планы (`doc/plans`, `doc/research`) не переписываются: они — летопись под прежним именем | Claude | 2026-10-07 |

## Что переименовано (ветка rename-crew)

Имена инструментов и их описания, MCP-сервер и его инструкции, команды и панель окна («Crew · nova»), отправитель
писем плагина (`crew-harness`, «⚙ crew → …»), журнал (`crew-harness …`), id плагинов, тесты (`test/crew-*.test.mjs`),
README, лицензия, package.json (0.5.0). Метка `[opencode-peers]` в начале писем остаётся узнаваемой: так выглядят
письма в старой истории сессий.

## Переключение (одним заходом, по слову владельца)

1. Соседняя сессия, работающая в рабочей копии `main` плагина (`github.ts` и тесты к нему), коммитит или уносит свои
   файлы — иначе они окажутся в переименованной папке незакоммиченными.
2. Интегратор nova готовит ветку с новыми именами (список ниже) — вливается сразу после перезапуска.
3. Вливание `rename-crew` в `main` плагина и провайдера (MCP `crew`), пуш.
4. Переименование репозитория на GitHub (`gh repo rename`; GitHub ведёт со старого адреса) и папки на диске;
   путь в `opencode.jsonc`.
5. Владелец перезапускает сервис; идущие ходы продолжатся письмом «прервана перезапуском».
6. Интегратор вливает ветку nova; `crew_doctor` — без замечаний.

## Что поменять в nova (интегратору)

| Где | Было | Стало |
|---|---|---|
| `.opencode/opencode-peers.json` | имя файла | `git mv` → `.opencode/crew-harness.json` |
| `scripts/tools/land-task.sh` | `PEERS_ROLE`, `PEERS_REVIEW_N`, `PEERS_SESSION_ID`, `peer_watch`, `peer_task`, `opencode-peers` | `CREW_ROLE`, `CREW_REVIEW_N`, `CREW_SESSION_ID`, `crew_watch`, `crew_task`, `crew-harness` |
| `scripts/claude-hooks/guard-stop-v2.py` (+ самотест) | `peer_watch`, `PEERS_*` в тестовых данных | `crew_watch` (в транскрипте: `mcp__crew__crew_watch`) |
| `scripts/claude-hooks/remind-stuck-tasks.py` | `peer_task` | `crew_task` |
| `.claude/commands/integrator.md`, `carina.md`, `docs/dev/prompts/*handoff.md` | `peer_*`, `mcp__peers__*`, `/peers`, `opencode-peers` | `crew_*`, `mcp__crew__*`, `/crew`, `crew-harness` |
| `scripts/tools/double-build.sh`, `scripts/guards/worktree-count.baseline` | `peer_watch`, `peer_task`, `peer_spawn`, `opencode-peers.json` | новые имена |
| `.claude/settings.json` (разрешения) | `mcp__peers__*` | `mcp__crew__*` |
| `AGENTS.md`, `.claude/commands/flow.md` (добавлено по вопросу интегратора) | `peer_watch`, `peer_task merge` | `crew_watch`, `crew_task merge` |

Пути к ящику (`nova-peers`, `opencode-peers`) в скриптах продолжают работать: прежние папки остаются на месте;
новое имя — `crew-harness`.

`/peers` в handoff-файлах nova не меняется: это прежняя команда Claude Code (теперь `/old-peers`), история, а не команда
плагина.

## Ход

- 2026-10-07: `main` плагина `3ed9121` и провайдера `0500f04` запушены; репозиторий — `unitcraft/crew-harness`, папка —
  `<папка плагинов>\crew-harness`; пути в `opencode.jsonc` и `cli.json`; ссылки в README соседних плагинов.
  Сервис перезапущен владельцем, плагин загружен из новой папки, ящик `crew-harness` — ссылка на `nova-peers`.
  Ветка nova `crew-harness-rename` ждёт зелёного CI и вливается интегратором.
- 2026-10-07, позже: nova влила ветку переименования; `/crew-doctor` — «всё в порядке». Попутно: claude-limits держал
  настройки незакоммиченными (закоммичены как `.opencode/crew-harness.json`, самопроверка теперь называет такой случай);
  `/crew_help` → `/crew-help`, новая `/crew-doctor`; вкладки влитой задачи закрываются до уборки (открытая вкладка
  держала папку дерева #26 nova).
