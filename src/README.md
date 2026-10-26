# src: the product on Nova and its dependency `alula`

The product CrewHarness on Nova (Oracle 0.1.0) is the folders below. The state machine engine and the core of the machines written as data live in the
package **`alula`** (task 144 moved them out of this folder, with the tests; the history before the move stays in this repository).

## What is where

| In this repository (`src/`) | What it is |
|---|---|
| `chat/` | the chat session machine on Nova (the reference that the machines as data are compared with) |
| `machine_chat/`, `machine_dialog_eq/` | tests only: the chat and the dialog written as tables equal the machines of `chat/`; they need the module `chat`, so they stay here and read the machines and the scenarios of [`machines/product/`](../machines/product/) |
| `product_machines/`, `machines/` | the machines as data compiled in (`embed_str`): `product_machines` — the chat, the dialog, the journal of the product, the registry of the product (the hub embeds the dialog); `machines` (tests only) — also the machines, the scenarios, the registry and the journal of the methodology ([machines/](../machines/README.md)) |
| `machine_runner/`, `machine_session/`, `machine_cycle/`, `machine_agent/`, `machine_agent_en/`, `machine_dialog/`, `machine_nested_eq/`, `machine_nested_run/`, `machine_registry/` | tests only (task 158; they were in the package until 0.3.2): the machines of the methodology and of the product against their tables of the methodology, their scenarios, their registry and journal |
| `alula_cli_machines/`, `alula_eq_machines/`, `alula_tests_machines/`, `machine_run_machines/`, `machine_table_machines/`, `machine_text_machines/`, `machine_text_eq_machines/`, `machine_text_render_machines/` | tests only (task 158): the program, the translator, the checks and the interpreter of the pinned package on the machines of the product and of the methodology |
| `acp/`, `acp_live/` | the ACP client and the handler of `Link` ([README](acp/README.md)) |
| `storage/`, `pgconf/`, `pgdb/`, `pgstore/`, `pg/` | the file and PostgreSQL handlers of `Journal` and `Store` ([README](pg/README.md)) |
| `server/`, `server_live/`, `server_pg/` | the session server and the hub ([README](server/README.md)); the hub runs the dialog machine of the product (`crew_harness.product_machines`, `machines/product/dialog.alula.json`) on the package `alula` |
| `web/` | the console in the browser |
| `crew_harness.nv`, `crew_hub.nv` | the entry points: the front and the hub |

| In the package `alula` (a dependency) | What it is |
|---|---|
| `alula.engine` | the engine: `Machine[S]`, `Engine`, the effects `Journal`, `Store`, `Link`, in-memory handlers |
| `alula.machine`, `alula.machine_table`, `alula.machine_text`, `alula.machine_run` | the tree of a machine, the checks, the translator of Alula tables, the interpreter `AlulaMachine`, the runner of scenarios |
| `alula.alula_cli` and the program `alula` | the commands `compile`, `render`, `convert`, `check`, `summary`, `run`, `test` |
| the data of `alula.machine` | the language registry (two primitives) and the table of the 35 journal codes of the language; the registry and the journal of a host are its data (`registry.md`, `journal.md`, spec 7a); the examples (`examples/` of the package: 15 machines, 66 scenarios); the language is Alula 2.22 (package 0.3, tasks 149 - 152): blocks `{ … }`, `=>`, `функция`, ranges, methods of the macros, insertions, `тип Имя перечисление`, comments, a new lossless lexer; the trees are the same as in 2.17 |
| the tests of the package | 2198 tests (`nova test src` in its repository); the product has 819, 311 of its own and 508 that came with the machines (task 158) |

The border is the import: a file of this folder imports `alula.<module>`; a file of `alula` imports no module of the product (the guard `check-no-product-imports.py`
of that repository). The dictionary of the engine, the format of the machines and the program `alula` are described in the READMEs of `alula`
(`src/engine/README.md`, `src/machine/README.md`, `src/machine_text/README.md`, `src/alula_cli/README.md` there).
The language itself (the specification, the samples, the table of words, the checks, the overview) is kept in the same repository: [`spec/`](https://github.com/nv-lang/nova-alula/tree/main/spec),
[`tools/`](https://github.com/nv-lang/nova-alula/tree/main/tools) and [`docs/`](https://github.com/nv-lang/nova-alula/tree/main/docs) of `nv-lang/nova-alula` (since version 0.3.2; before that the methodology kept them).

## How the dependency is connected

`nova.toml` has `alula = { git = "https://github.com/nv-lang/nova-alula", version = "0.4" }`, like `postgres`, `polaris`, `http` and `tls`, and `nova.lock.toml` pins the commit. Until the tag `v0.4.0` is published, a local `nova.override.toml` (`[replace] alula = { path = "<the working tree of the package>" }`, not committed, in `.gitignore`) points to the package; after the publication `nova update alula` rebuilds `nova.lock.toml`.
Build and tests are as before: `nova test src --jobs 4 --timeout 600` (`--strict-effects` too); the tests of `alula` itself run in its repository.
