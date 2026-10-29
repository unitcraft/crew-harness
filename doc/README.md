# doc: документы репозитория

Правила разработки — в [Каноне](canon/README.md). Задачи — в `tasks/NNN-<слаг>/`. Режимы работы пульта (тексты для хаба) — в [routes/](routes/README.md).

## Где что лежит (настройки и данные пульта управления)

Решение — [ADR-0016](canon/decisions/ADR-0016-config-layout.md) (владелец, 2026-10-29); подробности и команды — раздел «Where things lie» в [src/server/README.md](../src/server/README.md).

Корень экземпляра `CREW_HOME`: аргумент `--home <папка>` → переменная `CREW_HOME` → `<домашняя папка>/.crew-harness`. Портативного режима нет.

| Где | Папка | Что лежит | Можно удалить |
|---|---|---|---|
| корень | `config/` | настройки пользователя: `config.json`, `roles.json`, `presets/`, `modes/`, `prompts/`, `secrets.json` | нет |
| корень | `data/` | `projects.json`, `sessions/<id>/` (журнал, снимок, `acp.jsonl`, `inbox`, `images`) | нет |
| корень | `state/` | `serve.*.log`, `stt.pid`, `last_dir.txt`, резервные копии и отчёты `migrate` | да |
| корень | `cache/` | `agents.json` (каталог семей), `agent-config/` (копия настроек OpenCode без плагина) | да |
| корень | `tools/` | тяжёлые установки: `whisper/`; `CREW_TOOLS_DIR` или `voice.dir` переопределяют | да |
| репозиторий | `.crew-harness/config.json` | общие настройки проекта (в git) | нет |
| репозиторий | `.crew-harness/local.json` | личные настройки (абсолютные пути); в `.gitignore` | нет |
| репозиторий | `.crew-harness/modes/`, `presets/`, `prompts/`, `roles.json` | то же по именам, что в `config/` | нет |
| репозиторий | `doc/tasks/` | задачи (остаются здесь) | нет |

Слои настроек (нижние перекрываются верхними): значения в коде → `config/config.json` → файл сервера (`serve <файл>`, `CREW_SERVER_CONFIG`) → `.crew-harness/config.json` → `.crew-harness/local.json` →
`config/secrets.json` → переменные `CREW_*` → аргументы (`--set ключ=значение`). Режимы работы: `.crew-harness/modes` → `config/modes` → `doc/routes`; роли, наборы и подсказки — те же слои по именам.

Старый `data_dir` остаётся рабочим (плоская раскладка в этой папке); `crew-harness migrate` переносит её в новую. Команды: `crew-harness config list --show-origin`, `config get`, `config set`, `doctor`, `migrate`.
