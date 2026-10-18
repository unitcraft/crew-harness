# Baseline — С3

## Собственное дерево

- HEAD: `492c166fbd12e00a6a924efab065f6adb4bd91f6`; branch: `plan/061-initial`.
- Начальное состояние `git status --short --branch` зафиксировано сразу после session move. Имеющиеся untracked/modified файлы 061, `doc/open-questions.md`, `log.md`, журналы и исторические папки задачи предшествуют этой сессии и не принадлежат ей. Не трогать/не чистить.
- Разрешённые новые пути С3: только `doc/tasks/061-kanon-i-aktualnaya-metodika/plan.md`, собственная `NEWs3-1/` и ожидаемые append-only сессионные журналы `progress.log`, `profile.log`, `usage.log`; `log.md` не изменять.

## Immutable / protected baseline

| Path | SHA-256 при чтении |
|---|---|
| `task/message.md` | `45354b28004cc46168ef5b4f7c4b4a1070b46ff18981b5238d5648ae13d73727` |
| `spec.md` | `359819ee6b75d789b94853ac7054742c1c675597e6aee3d05f36ad43abd11c0b` |
| `analysis.md` | `e830c14b03532526583b1bf2e520bfc5479f10cb34d16d15060cae21393ce3af` |
| `031-impact.md` | `7b6414860e7eab13981758c8fc5bfdb4df6b9dfff9f248ae76506dc53f7ca2cb` |
| `spec-trace.md` | `f83c3b36d5c4f846d0a0c8d1e7daaa972c9e040f7aa8942231bb71b0746e9038` |
| `method-delta.md` | `c3ec6b250aef815b37a10afd2d1a28728630816739b357a7f25e6ecedef0e065` |
| `source-inventory.md` | `17bcbc65e7337143eb8d45557dfbc495d025a3880e08e383b48c5ec92fae320b` |
| `owner-gate-decisions.md` | `af2adfbcec277365a40d48684776921a4467930c3ed55024c77dbe60cc1cd2c9` |
| `catalog-owner-decision-2026-10-16.md` | `ee04eab7cfa9b863d7a5b8f723f74126ced37d5c70bc63e112929bad084ce465` |
| `doc/canon/README.md` | `b1f38d8faca5d1154b597ffb58de1ddfe464db5bb44d4a83155c6cdbbc8e05cf` |
| `doc/canon/process.md` | `1f3edf393dc194bb74baf8ee332e564bdaf8476c5609a60a2c23ccbf0171e210` |
| `doc/canon/decisions/README.md` | `f16270148caccfb7d6171930bd1a00c8463f14c15a69b20bc91c417ecb8351c6` |
| `AGENTS.md` | `3963c74cfe98e5d3830dfc39f18b5ff27b58befcfba82342de40bb9902797b37` |
| `.opencode/crew-harness.json` | `03e8a7f8dccdaf65e183ef7fd84947ac0e102214e677643316805d272ef9bf60` |

`spec.md` equals the assignment's current supplied SHA. Its prior approved body is separately frozen in `s1p-5/submitted/spec.md` per assignment; S3 does not edit either. This list is a baseline of selected protected paths, not whole-repository proof.
