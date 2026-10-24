# machines: machines written as data

The machines of the product CrewHarness and the algorithms of the methodology as tables of the language Alula (`*.alula.md`; the one extension, task 169), their compiled trees (`*.alula.json`, `machine/2`) and their scenarios
(`scenarios/*.scenario.test.json`, `scenario/0`). They were samples inside the package `alula` until its version 0.3.2; since task 158 they belong to their owners and the package holds only the language and its own examples
(`examples/` of [nv-lang/nova-alula](https://github.com/nv-lang/nova-alula)).

The relative links inside a table (`*.alula.md`) are the links of the table of a machine, not the navigation of the product (the table `agent_step` of the methodology links to the files of the methodology that are not here): the guard of the links `scripts/guards/check-md-links.py` does not judge them; the other `.md` of this folder (`registry.md`, `journal.md`, this file) are judged as everywhere.

| Folder | Whose | What is in it |
|---|---|---|
| `product/` | the product | `chat`, `dialog` (tables and trees), their 81 scenarios, `journal.md` (10 journal codes of the product). The product calls no primitive of its own: no `registry.md`, the registry is the language (`time_now`, `new_id`) |
| `methodology/` | the methodology, kept here until task 159 | `agent_step` (with `agent-step-sample.txt`, the copy of the sample of the specification), `cycle_check`, `session_start`, `task_runner`, `dialog_steps` (the session that calls the agent step), their 514 scenarios, `registry.md` (56 primitives, the roles of the parse, three sets of the types of the signatures), `journal.md` (73 codes of the methodology and the 4 codes of the pair `dialog_steps`) |

The registry of the primitives and the table of the journal codes of an owner are data beside its machines (`registry.md`, `journal.md`; the form is in `src/machine/README.md` of the package, spec 7a, AL-113). The language owns 35 codes
(the format, the fragment "Pause", the engine, the executor); the files here hold the codes of the owner only.

## Run

The scenarios run by the program `alula` of the package, on the version the product pins (`nova.lock.toml`); the program finds `registry.md` and `journal.md` in the folder it is given:

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova build <alula>/src/alula.nv -o target/alula.exe       # <alula> is the working tree of the package at the pinned version
target/alula.exe test machines/product                    # 81 of 81 scenarios passed
target/alula.exe test machines/methodology                # 514 of 514 scenarios passed
```

The same scenarios and the tests of the machines (the tables equal the JSON, every row has a scenario, the journal codes are the table of the owner, the equality with the machine on Nova) run in the units of `src/`
(`machine_runner`, `machine_session`, `machine_cycle`, `machine_agent`, `machine_dialog`, `machine_registry`, `machine_chat`, `machine_dialog_eq` and the `*_machines` units, see [src/README.md](../src/README.md));
the module `crew_harness.machines` (`src/machines/`) embeds these files for the tests, `crew_harness.product_machines` (`src/product_machines/`) embeds the machines of the product for the hub.

## Why `dialog_steps` is in `methodology/`

`dialog_steps` is the session that calls the agent step as a nested machine: it cannot run without `agent_step`, and `alula test` finds the nested machines in the folder it is given. Its journal codes (`user_message`,
`session_closed`, `turn_answered`, `turn_refused`) stand in `methodology/journal.md` beside the codes of the methodology, and in `product/journal.md` as the codes of the product session.

## The included file of definitions

`cycle_check.alula.md` and the meeting include the file of definitions `арифметика_цикла` (spec 8, the hash `642e1f78f0f7`); the translator of the package holds it (`src/machine_text/defs/`) with the specification. It goes to the methodology with task 159.
