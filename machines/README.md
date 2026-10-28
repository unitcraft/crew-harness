# machines: machines written as data

The machines of the product CrewHarness and the algorithms of the methodology as tables of the language Alula (`*.alula.md`; the one extension, task 169; the format 0.27, the package `alula` 0.27.0, task 246), their compiled trees (`*.alula.json`, `machine/2`) and their scenarios
(`tests/*.alula.test.json`, `test/0`). They were samples inside the package `alula` until its version 0.3.2; since task 158 they belong to their owners and the package holds only the language and its own examples
(`examples/` of [nv-lang/nova-alula](https://github.com/nv-lang/nova-alula)).

The relative links inside a table (`*.alula.md`) are the links of the table of a machine, not the navigation of the product (the table `agent_step` of the methodology links to the files of the methodology that are not here): the guard of the links `scripts/guards/check-md-links.py` does not judge them; the other `.md` of this folder (`registry.md`, `journal.md`, this file) are judged as everywhere.

| Folder | Whose | What is in it |
|---|---|---|
| `product/` | the product | `chat`, `dialog` (tables and trees), their 81 scenarios, `journal.md` (10 journal codes of the product), `libs/call_cancel.alula.md` (the library «Отмена запроса», see below). The product calls no primitive of its own: no `registry.md`, the registry is the language (`new_id`; the time is the stamp of the event, `event.at`) |
| `methodology/` | the methodology, kept here until task 159 | `agent_step` (with `agent-step-sample.txt` and `agent-step-sample.en.txt`, the copies of the sample of the specification and of its English twin), `cycle_check`, `session_start`, `task_runner`, `dialog_steps` (the session that calls the agent step), `meeting` (the file of the methodology called by `cycle_check`, no tree), their 514 scenarios, `registry.md` (58 primitives, among them the three functions of the parse by role, three sets of the types of the signatures), `journal.md` (73 codes of the methodology and the 4 codes of the pair `dialog_steps`), `libs/` (the libraries «Пауза» and `арифметика_цикла` with their English twins, the files of `libs/` of the package) |

The registry of the primitives and the table of the journal codes of an owner are data beside its machines (`registry.md`, `journal.md`; the form is in `src/machine/README.md` of the package, spec 7a, AL-113). The language owns 35 codes
(the format, the library "Pause", the engine, the executor); the files here hold the codes of the owner only.

## Run

The scenarios run by the program `alula` of the package, on the version the product pins (`nova.lock.toml`); the program finds `registry.md` and `journal.md` in the folder it is given, a library by the path `- Файл:` beside the table:

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova build <alula>/src/alula.nv -o target/alula.exe       # <alula> is the working tree of the package at the pinned version
target/alula.exe test machines/product                    # 81 of 81 tests passed
target/alula.exe test machines/methodology                # 514 of 514 tests passed
```

The tables were moved from 2.25 to 2.26 by the script of the package, `python <alula>/tools/migrate-alula-226.py --alula target/alula.exe machines` (task 240); `--dry-run` on the folder then said «итог: файлов 0, мест 0». Then to 0.27 (Alula 0.27, the release 2.27 renamed by the owner, 2026-10-28) by the script of the package 0.27.0, `python <alula>/tools/migrate-alula-227.py --alula target/alula.exe machines` (task 246): the header `revision` and `alula_version: 0.27`, the three sections `## Требует данные` / `## Требует стороны` / `## Требует концы` of a library, the party `machine имя` without the types (they come from the called machine beside, AL-146), the trees and the tests with `kind` and `revision`. `--dry-run` says «итог: файлов 0, мест 0». `cycle_check` calls `meeting`: its file `methodology/meeting.alula.md` is the file of the methodology as it is (its commit 1db4005, task 247), a called machine only — it gives the types of the party and has no tree (the program does not build it alone: the primitives of its host); with it beside, the tree of `cycle_check` is the build of `alula compile`.

The same scenarios and the tests of the machines (the tables equal the JSON, every row has a scenario, the journal codes are the table of the owner, the equality with the machine on Nova) run in the units of `src/`
(`machine_runner`, `machine_session`, `machine_cycle`, `machine_agent`, `machine_dialog`, `machine_registry`, `machine_chat`, `machine_dialog_eq` and the `*_machines` units, see [src/README.md](../src/README.md));
the module `crew_harness.machines` (`src/machines/`) embeds these files for the tests (the libraries with `library_files()`), `crew_harness.product_machines` (`src/product_machines/`) embeds the machines of the product for the hub.

## Why `dialog_steps` is in `methodology/`

`dialog_steps` is the session that calls the agent step as a nested machine: it cannot run without `agent_step`, and `alula test` finds the nested machines in the folder it is given. Its journal codes (`user_message`,
`session_closed`, `turn_answered`, `turn_refused`) stand in `methodology/journal.md` beside the codes of the methodology, and in `product/journal.md` as the codes of the product session.

## The libraries

Since 2.26 a connection is a library beside the machine (spec 9, AL-140): `### Пауза` or `### арифметика_цикла` with `- Файл: libs/…` and `- Хеш: …` (twelve letters of the SHA-256 of the normalized file).
`cycle_check.alula.md` connects `libs/cycle_arithmetic.alula.md` (the hash `34ef3ee7c00b`) and «Пауза»; the other machines of the methodology connect «Пауза» (`87162f9feb8c`). They go to the methodology with task 159.

The cancel of the user in the chat machines (`chat`, `dialog`) is the signal of the protocol of a call `отмена_запроса` (`cancel_request`), taken by the common events of the machine in `ПОКОЙ` and `ОЖИДАНИЕ`
(task 240). In 2.26 a signal of the machine is declared only by a connected library: the check refuses a signal of the free input of the user in a row of the appeal to the agent, and a signal of the machine of
its own; so both connect the small library of the product `product/libs/call_cancel.alula.md`, whose one row drops a cancel that comes after the end. The host (`src/server/hub.nv`) sends `cancel_request`.

On the package 0.9.0 a machine that connects a library does not go through the English file: the English text keeps the path of the Russian file of the library, and a library is read in the language of the
machine only (the package says so in its own test c222, task 239); the circles of the tests of `src/` go in Russian for such a machine (`connects_library` in `src/machines/data.nv`).
