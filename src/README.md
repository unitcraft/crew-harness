# src: the product on Nova and its dependency `alula`

The product CrewHarness on Nova (Oracle 0.1.0) is the folders below. The state machine engine and the core of the machines written as data live in the
package **`alula`** (task 144 moved them out of this folder, with the tests; the history before the move stays in this repository).

## What is where

| In this repository (`src/`) | What it is |
|---|---|
| `chat/` | the chat session machine on Nova (the reference that the machines as data are compared with) |
| `machine_chat/`, `machine_dialog_eq/` | tests only: the chat and the dialog written as tables equal the machines of `chat/`; they need the module `chat`, so they stay here and read the machines and the scenarios from `alula` |
| `acp/`, `acp_live/` | the ACP client and the handler of `Link` ([README](acp/README.md)) |
| `storage/`, `pgconf/`, `pgdb/`, `pgstore/`, `pg/` | the file and PostgreSQL handlers of `Journal` and `Store` ([README](pg/README.md)) |
| `server/`, `server_live/`, `server_pg/` | the session server and the hub ([README](server/README.md)); the hub runs the dialog machine of `alula` |
| `web/` | the console in the browser |
| `crew_harness.nv`, `crew_hub.nv` | the entry points: the front and the hub |

| In the package `alula` (a dependency) | What it is |
|---|---|
| `alula.engine` | the engine: `Machine[S]`, `Engine`, the effects `Journal`, `Store`, `Link`, in-memory handlers |
| `alula.machine`, `alula.machine_table`, `alula.machine_text`, `alula.machine_run` | the tree of a machine, the checks, the translator of Alula tables, the interpreter `AlulaMachine`, the runner of scenarios |
| `alula.alula_cli` and the program `alula` | the commands `compile`, `render`, `convert`, `check`, `summary`, `run`, `test` |
| the data of `alula.machine` | the registry of the primitives (`standard_registry`), the journal codes, the machines `chat`, `dialog`, `dialog_steps`, `agent_step`, `session_start`, `task_runner`, `cycle_check` and the 621 scenarios, compiled in |
| all the `machine_*` and `alula_*` unit tests | 1657 tests; the product has 311 |

The border is the import: a file of this folder imports `alula.<module>`; a file of `alula` imports no module of the product (the guard `check-no-product-imports.py`
of that repository). The dictionary of the engine, the format of the machines and the program `alula` are described in the READMEs of `alula`
(`src/engine/README.md`, `src/machine/README.md`, `src/machine_text/README.md`, `src/alula_cli/README.md` there).

## How the dependency is connected

`nova.toml` has `alula = { path = "../alula-core" }`: until the repository of `alula` is published, the package is a folder next to the working tree of the product. After the
publication the line becomes `alula = { git = "<the repository of alula>", version = "0.1" }`, like `postgres`, `polaris`, `http` and `tls`, and `nova.lock.toml` is rebuilt.
Build and tests are as before: `nova test src --jobs 4 --timeout 600` (`--strict-effects` too); the tests of `alula` itself run in its repository.
