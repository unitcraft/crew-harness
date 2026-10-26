# machines: machines written as data

The machines of the product CrewHarness as tables of the language Alula (`*.alula.md`; the one extension, task 169; the format 0.27, the package `alula` 0.27.0, task 246), their compiled trees (`*.alula.json`, `machine/2`) and their scenarios
(`tests/*.alula.test.json`, `test/0`). They were samples inside the package `alula` until its version 0.3.2; since task 158 they belong to their owners and the package holds only the language and its own examples
(`examples/` of [nv-lang/nova-alula](https://github.com/nv-lang/nova-alula)).

The relative links inside a table (`*.alula.md`) are the links of the table of a machine, not the navigation of the product: the guard of the links `scripts/guards/check-md-links.py` does not judge them; the other `.md` of this folder (`journal.md`, this file) are judged as everywhere.

| Folder | Whose | What is in it |
|---|---|---|
| `product/` | the product | `chat`, `dialog` (tables and trees), their 81 scenarios, `journal.md` (10 journal codes of the product), `libs/call_cancel.alula.md` (the library «Отмена запроса», see below). The product calls no primitive of its own: no `registry.md`, the registry is the language (`new_id`; the time is the stamp of the event, `event.at`) |

The machines of the methodology (`agent_step`, `cycle_check`, `session_start`, `task_runner`, the pair `dialog_steps`, the called `meeting`, their registry, journal and libraries) lay in `methodology/` until task 249: they live in the set of the methodology,
[`alula-machines/`](https://github.com/unitcraft/ai-dev-methodology/tree/main/alula-machines) of its repository. What the product kept and the set of the methodology does not hold is listed in the log of [task 249](../doc/tasks/249-alula-0-27-gruppa-metodiki-uhodit-iz-pro/log.md).

The table of the journal codes of an owner is data beside its machines (`journal.md`; the form is in `src/machine/README.md` of the package, spec 7a, AL-113). The language owns 35 codes
(the format, the library "Pause", the engine, the executor); the file here holds the codes of the product only.

## Run

The scenarios run by the program `alula` of the package, on the version the product pins (`nova.lock.toml`); the program finds `journal.md` in the folder it is given, a library by the path `- Файл:` beside the table:

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova build <alula>/src/alula.nv -o target/alula.exe       # <alula> is the working tree of the package at the pinned version
target/alula.exe test machines/product                    # 81 of 81 tests passed
```

The tables were moved from 2.25 to 2.26 by the script of the package, `python <alula>/tools/migrate-alula-226.py --alula target/alula.exe machines` (task 240); `--dry-run` on the folder then said «итог: файлов 0, мест 0». Then to 0.27 (Alula 0.27, the release 2.27 renamed by the owner, 2026-10-28) by the script of the package 0.27.0, `python <alula>/tools/migrate-alula-227.py --alula target/alula.exe machines` (task 246): the header `revision` and `alula_version: 0.27`, the trees and the tests with `kind` and `revision`. `--dry-run` says «итог: файлов 0, мест 0».

The same scenarios and the tests of the machines (the tables equal the JSON, every row has a scenario, the journal codes are the table of the owner, the equality with the machine on Nova) run in the units of `src/`
(`machine_chat`, `machine_dialog`, `machine_registry` and the `*_machines` units, see [src/README.md](../src/README.md));
nothing of this folder is compiled into the programs (task 248): the module `crew_harness.machines` (`src/machines/`) reads these files from the disk of the tree for the tests (the library with `library_files()`), `crew_harness.product_machines` (`src/product_machines/`) reads the machines of the product: the hub from the folder `machines/product` beside it (the release kit, `scripts/package-release.sh`: `dialog.alula.json`, `dialog.alula.md`, `journal.md`, `libs/`; no `tests/`, no chat) or the folder of the setting `machines_dir`, and checks the alula_version and the hashes of the libraries when it reads them (`src/server/README.md`, "Where the machine comes from"); `scripts/guards/check-release-kit.py` checks the same in the tree and in a kit.

## The library

Since 2.26 a connection is a library beside the machine (spec 9, AL-140): a heading with the name of the library, `- Файл: libs/…` and `- Хеш: …` (twelve letters of the SHA-256 of the normalized file).

The cancel of the user in the chat machines (`chat`, `dialog`) is the signal of the protocol of a call `отмена_запроса` (`cancel_request`), taken by the common events of the machine in `ПОКОЙ` and `ОЖИДАНИЕ`
(task 240). In 2.26 a signal of the machine is declared only by a connected library: the check refuses a signal of the free input of the user in a row of the appeal to the agent, and a signal of the machine of
its own; so both connect the small library of the product `product/libs/call_cancel.alula.md`, whose one row drops a cancel that comes after the end. The host (`src/server/hub.nv`) sends `cancel_request`.

On the package 0.9.0 a machine that connects a library does not go through the English file: the English text keeps the path of the Russian file of the library, and a library is read in the language of the
machine only (the package says so in its own test c222, task 239); the circles of the tests of `src/` go in Russian for such a machine (`connects_library` in `src/machines/data.nv`).
