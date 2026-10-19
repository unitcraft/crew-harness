# machine: the core of the machines-as-data of the product

The goal of the owner (2026-10-19): every ability of the current plugin and the state machines of the methodology are written as TABLES that one
interpreter on Nova runs inside the bare product CrewHarness; the user writes no Nova. This directory is the first stage, the CORE that does not
depend on the final syntax of the tables: the dynamic value, the tree of an expression, a pure evaluator, the types of the data and the registry of the
primitives of the host. Task 106 (`doc/tasks/106-expr-evaluator/`). Task 107 (`doc/tasks/107-table-machine/`) added the interpreter of the table of states on top of this core (see "The interpreter of a machine that is data" below); the next tasks are the translator of the tables of the methodology into the JSON and the transfer of the agent step and of the other machines.

The source of the language is Portolan, the format of the methodology, version 2.5 (`unitcraft/ai-dev-methodology`, `state-machines/state-machine-portolan-spec.md`, read only), the pilots
"Agent step" and "Meeting" (the markup of the 80 functions of the meeting, the primitives of the agent step) and the dictionary of the methodology (English names).
Where the format is silent the choice is marked "decision" below and in `doc/tasks/106-expr-evaluator/analysis.md` and `doc/tasks/107-table-machine/analysis.md`.

Task 107 (`doc/tasks/107-table-machine/`) built the interpreter on top of this core. It lives in three more folders, because one folder is one module and one unit of
tests under Oracle 0.1.0 and the output of a unit must stay under 4 KB:

| Folder | Module | What it is |
|---|---|---|
| `src/machine/` | `crew_harness.machine` | the core (task 106) and the data files compiled into the binary: `schema/`, `machines/`, `scenarios/` |
| `src/machine_table/` | `crew_harness.machine_table` | the model of a machine, the decoder of the JSON tree `machine/2`, the type syntax, the checks of a table |
| `src/machine_run/` | `crew_harness.machine_run` | the interpreter `PortolanMachine`, the state, the host of the primitives, the scenario runner `scenario/0` |
| `src/machine_chat/` | `crew_harness.machine_chat` | tests only: the proof that the chat machine as data equals the chat machine on Nova |
| `src/machine_text/` | `crew_harness.machine_text` | the translator of Portolan (the tables in Russian or English, format 2.5 - 2.11) into the JSON `machine/2` and the reverse generator JSON -> Portolan ([README](../machine_text/README.md), tasks 108, 113) |
| `src/machine_text_eq/` | `crew_harness.machine_text_eq` | tests only: the chat table equals the hand-written chat machine on 39 scenarios; the pilot "Agent step", the examples of the format |
| `src/machine_agent/` | `crew_harness.machine_agent` | tests only: the agent step of the product (task 109): the table equals its JSON, every row has a scenario, the journal codes are the methodology's; task 110: the sample of the methodology (format 2.7) is translated whole and the product table is that sample with two project keys |
| `src/machine_text_lang/` | `crew_harness.machine_text_lang` | tests only (task 113): the two languages of Portolan - an English file gives the JSON of the Russian one, a word of the other language is an error with its line, the news of 2.9 - 2.11 |
| `src/machine_text_render/` | `crew_harness.machine_text_render` | tests only (task 113): the reverse generator - the canonical form, the circles "tree - file - tree" in both languages on every machine |
| `src/machine_agent_en/` | `crew_harness.machine_agent_en` | tests only (task 113): the English sample of the agent step of the methodology goes through the translator, equals the Russian one and runs the 75 scenarios |
| `src/machine_text_fmt/` | `crew_harness.machine_text_fmt` | tests only (task 110): format 2.7 in the translator - prose and warnings, the expansion of a fragment, sets of literals, separators and `\|`, enum words, the hash of the sample of definitions |

## Run the tests (Windows, Nova Oracle 0.1.0)

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1     # the leading dot matters
cd C:/work/crew-harness
nova test src/machine                # the core: 170 tests
nova test src/machine_table          # the decoder and the checks: 85 tests
nova test src/machine_run            # the interpreter and the scenarios (the 75 of the agent step too): 111 tests
nova test src/machine_chat           # the equality with the chat machine: 11 tests
nova test src/machine_text           # the translator of Portolan and its table of words: 162 tests
nova test src/machine_text_eq        # the proofs of the translator: 45 tests
nova test src/machine_agent          # the proofs of the agent step and of the sample of the methodology: 29 tests
nova test src/machine_text_fmt       # format 2.7 in the translator: 65 tests
nova test src/machine_text_lang      # the two languages of Portolan, the news of 2.9 - 2.11: 53 tests
nova test src/machine_text_render    # the reverse generator JSON -> Portolan and its circles: 49 tests
nova test src/machine_agent_en       # the English sample of the agent step (75 scenarios too): 14 tests (slow, about a minute)
nova test --strict-effects src       # the same, and an effect used without being declared in a signature is an error
nova test src --jobs 4               # the whole tree (the PostgreSQL units need the temporary container of src/pg/testdb.ps1)
```

Everything for Oracle 0.1.0 is in [`spikes/env/README.md`](../../spikes/env/README.md). `src/machine/` is ONE module, `crew_harness.machine`; a module in a folder UNDER `src/machine/`
is refused by Oracle 0.1.0 (item 25 there), so the interpreter's units are sibling folders `src/machine_*`. The output of a unit must stay under 4 KB (item 20), hence the short names of the tests.

## Layout

| File | What it is |
|---|---|
| `value.nv` | `Value` (`Null`, `Bool`, `Int`, `Float`, `Text`, `List`, `Dict`, `Record`, `Variant`), builders, equality and order, `text(x)`, JSON both ways |
| `types.nv` | `TypeSpec`, `TypeDefs` (named records and variants), `check_value` with the path of the first mismatch |
| `expr.nv` | `Expr`, the tree of an expression, its JSON form (`expr_from_json`, `expr_to_json`), builders, `expr_depth` |
| `eval.nv` | `eval(expr, scope)`, `eval_with(expr, scope, host)`, `EvalError`, the protocol `PrimitiveHost` |
| `registry.nv` | `Primitive`, `Registry`, the class of a primitive in the position of a call, `standard_registry()` and `standard_types()` |
| `data.nv` | the data files of the directories `schema/`, `machines/`, `scenarios/` compiled in (`embed_str`), `machine_files()`, `scenario_files()`, `schema_files()`; the names: a machine in Portolan is `*.portolan.md` (or `.portolan.txt`; `is_table_name` takes these two names only), a compiled machine (the JSON `machine/2`) is `*.portolan.json` (`is_machine_json_name` takes this name only), a scenario is `*.scenario.test.json` (task 112; there is no transitional period for the former names, Portolan 2.11) |
| `*_test.nv` | 170 tests, more than 750 checks (the `assert` lines; loops repeat them) |

## The value

One sum type, no generics (Oracle 0.1.0 breaks the C of generic functions with inferred type arguments, items 12 and 13 of the survey): a typed list or a typed dict is a
`Value`, and the check against a type is `check_value`.

- `Dict` keeps its entries in the order of insertion (`keys` and `values` give the order of the first record of a key); its key is any value (text, int, enum value, tuple, record).
  Two dicts with the same entries in a different order are equal and have the same place in the order of values.
- `Record { name, fields }` keeps its fields sorted by name. A tuple is the anonymous record (name `""`) with the fields `0`, `1`, ... (`t.0`, `t.1`: from zero, as in Nova, format 2.3); `make_tuple`.
- `Variant { type_name, name, fields }` is a case of a sum type; an enum value is a case without fields (`enum_value`).
- Equality is structural, the order of values is total (null < bool < int < float < text < list < dict < record < variant). An int and a float are never equal.
- `text(x)`: an int is the decimal form; a float is the shortest decimal form that reads back, `1.0` and `0.0` for whole values, no exponent for
  1e-4 <= |x| < 1e16, else `1e-7`, `1.5e20`; an enum value is the word of its code (`StoppedByHuman` -> `stopped_by_human`); `none` for `Null`; `true`/`false`; a text
  is itself. A list, a dict, a record and a case with fields have no text. NaN and infinities have none.

JSON form, lossless (`value_to_json`, `value_json`, `value_from_json`, `parse_value`, written with `std.encoding.json`, UTF-8 as it is, 4-byte letters and surrogate escapes read):
null, bool, int, float (always with a fraction or an exponent: `1.0`), text and list are the JSON ones; a dict with text keys none of which starts with `$` is a JSON
object in the order of insertion; the rest is tagged with one `$` key: `{"$dict":[[k,v],...]}`, `{"$tuple":[a,b]}`, `{"$record":"Name","fields":{...}}`,
`{"$variant":"Type","name":"Case","fields":{...}}`, `{"$float":"NaN"}`. The reader refuses an unknown tag, an integer beyond `int`, a repeated key, a value deeper than 64.

## The tree of an expression

One JSON object per node, the key `op` (the full list with the keys is at the top of `expr.nv`): `lit`, `name`, `field`, `index`, `call` (a function or a macro of the language,
a `lambda` is an argument), `primitive_call`, `match`, `let`, `if`, `record`, `with_field` (a record with changed fields), `variant`, `list`, `tuple`, `dict`, the operators
`+ - * / % == != < <= > >= and or ??` (their symbols are the `op`), `not`, `neg`. The draft form of a lambda `{"lambda":["x"],"body":E}` is read too. A tree deeper than 64 is refused
by the reader and by the evaluator. An error of the reader is `{ path, message }` with the path in the tree (`$.args[1].body`).

## The evaluator

`eval(expr, scope) -> Result[Value, EvalError]` is a pure function: it reads its two arguments, writes nothing, has no effects in its signature (`nova test --strict-effects` is green) and gives the
same result on every run. The only door to the world is a primitive of the host: a `primitive_call` node goes to the `PrimitiveHost` that the caller passes to `eval_with`
(`eval` passes a host that refuses every primitive); the core does not know what a primitive does.

- Order: strict, left to right (the arguments of a call, the fields of a record, the items of a list). Lazy are `if`, `and`, `or`, `??` only: the part that is not needed is not evaluated.
- `match` is exhaustive: no arm accepts the value - `NoMatchArm`. An arm has alternatives (`A | B`), patterns `any`, a literal, a case (by name, and by type when given) that binds fields to names, and an optional guard
  (evaluated after a pattern accepted, with the bound names).
- Numbers: `+ - *` on two ints are checked (`Overflow`); `/` and `%` on ints truncate toward zero (decision: the format is silent), a zero divisor is `DivisionByZero`, `min / -1` is `Overflow`;
  floats `+ - * /`, a result that is not finite is `Overflow`, `/ 0.0` is `DivisionByZero`; an int and a float never mix (`float(x)`, `int(x)`); `<`, `<=`, `>`, `>=` take two ints or two floats.
  `+` also joins two texts and two lists (the left first). `==` and `!=` are structural on any two values.
- The index of a dict by an absent key and the index of a list out of its bounds are `none` (owner, 2026-10-19), not an error. A field of a record that is not there is `UnknownField`.
- Errors are values: `EvalError { kind, message, path }`, the kinds `TypeMismatch`, `UnknownName`, `UnknownField`, `UnknownFunction`, `BadArity`, `Overflow`, `DivisionByZero`, `NoMatchArm`, `Unreachable`,
  `DuplicateKey`, `LambdaMisplaced`, `TooDeep`, `OutOfBudget`, `PrimitiveFailed`; the path is the place in the tree (`$.args[1].body.left`). `Unreachable` is the DEFECT of the format (`require(none)`):
  the executor stops, it is not a machine error with an ERROR end.
- Totality: the language has no loops and no recursion; a macro walks a finite list. A run is bounded all the same: the depth of a tree (`MAX_EXPR_DEPTH` 64), the number of nodes evaluated
  (`MAX_STEPS` 50000) and the length of a list built by `range`, `+` (`MAX_ITEMS` 10000) - `TooDeep`, `OutOfBudget`.

Macros and functions (the `fn` of a `call` node; the catalog of the format, section 12; every one is pure):

| Name | Meaning |
|---|---|
| `filter(list, x -> bool)`, `map(list, x -> v)` | the items that pass; the list of results |
| `any`, `all` | with a predicate; stop at the first item that decides; `false` and `true` on the empty list |
| `count(list, x -> bool)`, `first_where(list, x -> bool)` | the number of items that pass; the first one or `none` |
| `fold(list, start, (acc, x) -> v)` | from the left; the start on the empty list |
| `dict(list, x -> key, x -> value)` | a dict from a list; a repeated key is `DuplicateKey` |
| `range(a, b)` | `[a, b)`, empty when `b <= a`; longer than `MAX_ITEMS` is `OutOfBudget` |
| `keys(dict)`, `values(dict)` | in the order of the first record of a key |
| `length(x)` | the items of a list or a dict, the letters (code points) of a text |
| `has(x)`, `require(x)` | `x` is not `none`; the value, or the defect `Unreachable` on `none` |
| `remove(list, item)` | the list without ALL items equal to `item` (owner, 2026-10-19) |
| `without_key(dict, key)` | the dict without the key (an absent key: the same dict) |
| `text(x)`, `float(n)`, `int(f)` | `text(x)` as above; the conversions are explicit, `int` cuts the fraction toward zero, outside the range of `int` is `Overflow` |
| `max(a, b)`, `min(a, b)` | two ints or two floats |
| `journal_event(code, name, text, ...)` | the record `JournalEvent { code, params }`, `params` a list of tuples (name, text) |

Task 107 added to the evaluator: `eval_defs(expr, scope, table, host)` with a `DefTable { fns, types, globals, registry, checked }` - the definitions of a machine (`DefFn`: typed parameters, a typed result, a body that sees its parameters and the globals only, never the names of the caller), and, when `checked` is true, the check of the arguments and the result of every primitive call against the registry; the catalog got `record_text(e)` (`event <code>` or `event <code>: name=value, ...`, format 2.2) and `non_empty(x)` (a text that is not `""`, else the defect `Unreachable`).

Not here (the interpreter's, `src/machine_run`): `конец(state)` of the catalog (it needs the states of a machine), the names of the executor (`вход`, `событие`, `состояние`, ...), the actions (`поле = выр`, `журнал`, `для каждого`),
the check "an `if` does not nest in the branch of another `if`", the sets of values of a closed text (3.2 of the format).

## The types

`TypeSpec`: `IntType`, `IntMin(n)` (`int>=n`), `FloatType`, `TextType`, `TextSet(words)` (the set of literals `"a" | "b"`, two or more; format 2.5), `IdType` (`id`, a text of the form 8-4-4-4-12 lower case hexadecimal digits, format 2.5), `BoolType`, `NothingType` (the type of "no result", the value is `none`), `OptionalType(T)` (`?T`:
`none` or a `T`, which is the lifting of `T` to `?T`), `ListType(T)`, `DictType { key, value }`, `FullDictType { key, value }` (the key is an enum and every one of its values is a key),
`TupleType(items)`, `RecordType(name)`, `VariantType(name)`. The named types are declared in `TypeDefs`. `check_value(spec, value, defs)` gives the first mismatch with a path
(`$.findings[2].severity`, `$["key"][1]`, `$.1` for a tuple field); a record or a case needs every declared field and no other.

## The registry of the primitives of the host

`Primitive { name, params: []ParamSpec, result: TypeSpec, class, reads, writes }`; `class` is `Pure`, `Reading`, `Writing` or `Irreversible`. `register` refuses an empty name, a second primitive of a name, a repeated
parameter name. `check_call_position(registry, name, position)` and `check_expr_positions(registry, tree, position)` (it walks a tree and gives the path of the first call that does not fit) say whether the class is
allowed in the place (section 7 of the format):

| Class | Where a call may stand |
|---|---|
| `Pure` | everywhere |
| `Reading` | `InputPos` (the table "Input" of an appeal), `ProfilePos`, `ForkEntryPos`, `OperationEntryPos`, `EndEntryPos`, `AcceptPos`; not in a condition (`ConditionPos`), not in an action (`ActionPos`) |
| `Writing`, `Irreversible` | `OperationEntryPos`, `EndEntryPos`, `ActionPos`; not in a condition, not in "Input", not in the profile, not in "On entry" of a fork, not in "On accept" |

`check_call_args` and `check_call_result` check the count and the types of the arguments and the type of the result of a call against the signature. `reads` and `writes` name what a primitive reads or writes without an
argument (rule 11 of the specification): they join the "Input" of the state of the call.

`standard_registry()` is filled with stubs (the name, the types and the class are the methodology's, the body is the host's) - 22 primitives; `standard_types()` declares the records and variants their signatures use.

| Primitive | Parameters | Result | Class |
|---|---|---|---|
| `party_profile` | `party: text` | `AgentProfile` | reading |
| `role_context` | `context: RoleContext` | `text` | reading |
| `call_trace` | - | `text` | reading |
| `call_step` | - | `int>=0` | reading |
| `parse_agent_reply` | `reply: AgentReply` | `RoleResult` | reading |
| `proposal_read` | - | `bool` | reading |
| `proposal_with_fingerprint` | - | `text` | reading |
| `proposal_changed_since_attempt` | - | `bool` | reading |
| `count_in_model_tally` | `finding: Finding` | nothing | writing |
| `journal_findings` | `findings: []Finding` | nothing | writing |
| `journal_machine_data` | - | nothing | writing |
| `journal_decision` | `decision: text, source: text, passes: int>=0, open: []Finding` | nothing | writing |
| `remove_unsound` | `number: int>=0` | nothing | writing |
| `build_summary` | `number: int>=0` | `?Summary` | writing |
| `close_for_writing` | `object: text` | nothing | irreversible |
| `open_for_writing` | `object: text` | nothing | irreversible |
| `move_to_archive` | `number: int>=0, suffix: int>=0` | nothing | irreversible |
| `time_now` | - | `int` | reading |
| `new_id` | - | `id` | reading |
| `reply_validation` | - | `ReplyCheck` | reading |
| `close_agent_turn` | - | nothing | irreversible |
| `check_cache` | `dialog_kind: "main" \| "delivery"` | nothing | writing |

The first 17 are the 17 functions of the meeting that its markup (`functions-markup.md`) makes primitives of the host: 8 reading, 6 writing, 3 irreversible; the last four are the agent step (`check_cache` is the
check of the cache that the specification of the step puts after every accepted result of a turn; the pilot's code does not have it). No pure primitive: `fingerprint` stays inside `proposal_with_fingerprint`.

## Decisions where the format is silent

- Division and remainder of ints truncate toward zero (the sign of the remainder is the sign of the dividend), as C and Nova do.
- `<`, `<=`, `>`, `>=` take numbers only (the format says so); `==` of an int and a float is `false`, not an error (the check of the table would refuse it earlier).
- Missing optional fields of a record are not allowed in `check_value`: every declared field is there (`none` for an absent `?T`).
- A repeated key in a dict literal and in `dict(...)` is `DuplicateKey` (the format says so for `dict`); `make_dict` (the Nova API) keeps the place of the first record and takes the last value, like `d[k] = v`.
- A field of a variant is read only through `match`; `x.f` needs a record.
- Order of text: `value_compare` compares texts by bytes (UTF-8), which is the order of code points.

## Oracle 0.1.0: limits met and the ways round them

The rules of the language that cost a compile and the three new defects (items 33-35, with reproductions in `spikes/env/repro_engine/`) are in the survey README. What shaped this code:

- No generics with inferred arguments, no protocols with type parameters: `Value`, `Expr`, `TypeSpec` are plain sum types; the door to the host is the protocol `PrimitiveHost` without parameters, passed as `mut host PrimitiveHost` (as the engine passes `Environment`).
- An `Option[Expr]` field in a record declared before the enum breaks the C (item 34): the guard of an arm is a list of zero or one expression.
- `for x in [A, B]` over an enum literal list breaks the codegen (item 33): the tests take the list from a function.
- One folder is one module and one unit (item 25): the tests carry short names so that the output of the unit stays under 4 KB (item 20).

# The interpreter of a machine that is data (task 107)

`src/machine_table/` reads and checks a machine, `src/machine_run/` runs it. A machine is ONE JSON file, `format: "machine/2"`; the interpreter gives the protocol
`Machine[PortolanState]` of the engine, so `start_engine[PortolanState, PortolanMachine](machine, id)` runs it with the journal, the snapshots and the link of the product,
and a restart resumes it. The examples are `machines/*.portolan.json` (chat, calc, actions, gate, lenses, variants), their scenarios `scenarios/*.scenario.test.json`.

## The file `machine/2`

The keys are English, the structure is the format 2.5 of the methodology (sections 1-9, 12, 13) in a tree; the JSON Schema is
[`schema/machine-2.schema.json`](schema/machine-2.schema.json), the reference is the decoder `src/machine_table/json.nv` (a key the schema does not know is refused; a test compares the
key lists and the kinds of the schema with the decoder's). Expressions are the trees of the core (`{"op":"name","name":"x"}`, `{"op":"+","left":E,"right":E}`, see the top of `expr.nv`);
the types are written as the format writes them (`int>=0`, `?text`, `[]Finding`, `{text: int}`, `"a" | "b"` (under `?` and `[]` in parentheses, `?("a" | "b")`), `id`, `full {K: V}`, `(text, int)`).

| Key of the root | Meaning (format section) |
|---|---|
| `format`, `machine`, `version`, `title` | the header: `machine/2`, the Latin name (the name in the journal), the version |
| `types` | `records`, `variants` (an enum is a variant without fields; the key `words` of a variant is the list of the pairs `["Name", "word"]` of its values, format 2.7); `FailCode`, the closed list of the ten failure causes, is built in (2) |
| `constants`, `params` | `name`, `type`, `value` / `default` (+ `project_key`: the key after `проект.` of the column "project override", format 2.7); evaluated in order when the machine is built (1, 8) |
| `input` | `fields`, `invariants` - the input of a call; the event `start` carries it as an object (1) |
| `data` | `name`, `type`, `initial` (`{"expr": E}` or `{"from_input": "field"}`), `monotonic` (`true`, or `{"bound": E}` for `<= E`), `writes` (`rows`, `mechanics`, `rows_and_mechanics`, `fragment`, `rows_and_fragment`); a name `x[*].f` is a path datum that carries only the marks (2) |
| `parties` | `name`, `id`, `kind` (`agent`, `human`, `enhanced`, `gatekeeper`, `machine`), `words` (gates), `progress` (parts of an answer), `result` (the type of the answer, required for agent and machine), `counter` (the datum of the attempt counter, required), `profile`, `setting`, `nested` (1) |
| `signals` | words from outside that belong to no party (stop, cancel) (4.3 `signal`) |
| `definitions`, `includes` | pure functions `name(params) -> result = body`; the lines `definitions: <name> version <N> hash <hex12>` (8) |
| `initial`, `error_end` | the initial state; the end ERROR (A4) |
| `common_events` | the rows of signals tried before the rows of a state - the fragment "Pause", expanded in the tree (9) |
| `states` | the states (4) |
| `ends` | `result` and the rows `{state, n, when, answer}`, `answer` is `{"kind":"answer","value":E}` or `{"kind":"refusal","code":E,"text":E}` (4.7) |
| `primitives` | the primitives of the host that the machine calls (7) |

A state: `name`, `kind` (`appeal`, `operation`, `fork`, `end`), `reads` (the line `Input:`), `reads_all` (the end ERROR), and by kind:
an appeal - `party`, `inputs` (the table "Input": `{field, value, reads: party|executor}`), `silence` (the term, ms), `set` (a list of party ids: a request to each), `accept` ("On accept"), `rows`;
an operation / a fork - `entry` ("On entry": `bind` and `call`), `rows` (`{"kind":"now"}`; a fork row may have `cond` or `else`);
an end - `entry` (actions with the journal), `except` (`{field, values}` of the format's "Except").
A row: `n`, `event`, `cond`, `else`, `actions`, `to` (a state, `@previous`, `@same`, `@prepare_return`; absent when the actions end in `machine_error`), `restart`.
An event: `answer` (`bind`), `answer_variant` (`variant`, `bind` {field: name}), `failure` (`reasons`, `bind`), `timeout`, `progress` (`name`, `bind`), `word` (`word`, `bind`), `signal` (`name`, `bind`), `now`.
An action (`do`): `assign`, `add` (`+=`), `journal` (`code`, `params`), `journal_value`, `journal_all`, `for_each`, `let`, `bind`, `if`, `call`, `machine_error`, `cancel_open`, `pass`;
the target of `assign` and `add` is a datum or `{"name": "x", "path": [{"key": E}, {"field": "f"}]}` (`x[key].f = v` is one path).

## The checks of a table (`check_machine`, format section 10)

`load_machine(text, registry)` decodes and checks; `check_machine(def, registry)` gives every issue as `<path in the JSON>: <message>`, in a fixed order. Checked: the names (Latin, unique, no shadowing of
a datum, a constant or a parameter by a binding); the shape of each kind of a state; the events against the words, signals and progress of the party, the cases of the result variant, the `FailCode` cases;
the targets; **the reads against the "Input" of the state (rule 11)** - every datum an expression reads is in the Input table of the appeal or the `reads` line of the state, and so are the hidden reads of a primitive
(`reads` in the registry); `input`, `all_data`, `transition_note`, `trace`/`step` only where they are defined; **the writes against the data** (a root that is not a datum, a datum whose `writes` is not rows,
a path with `writes: mechanics`); the entry of a state changes no data (rule 29); **the class of every primitive in the place of its call** (`check_expr_positions`), a primitive that is not registered or not listed in `primitives`;
**the reachability of the states** (a return to `@previous` reaches every appeal); **the exhaustiveness of the ends** (a row with `when: true`, or a chain of `field == "..."` that covers the closed set of the datum minus `except`; no overlap);
the definitions (no recursion, no catalog name, the number of arguments); an `if` does not nest in a branch of another `if`; the journal codes and parameters are lower case Latin; the includes (a 12-digit hash); the counters of the parties; the set is the datum `to_send`.

## The interpreter

`portolan_step(machine, state, event, environment, host)` is the whole `step` (`Machine[PortolanState].step` calls it with the default `ScriptedHost`). It reads its arguments only; the clock is the stamp of the event (`time_now` of the default
host), any other primitive goes to the `PrimitiveHost` that is passed in. The state is `PortolanState { name, started, input, data }` - values of the core, written as one JSON object under `state` of the snapshot.

The order of a step: the event of the engine is read as the event of the machine (`Input` - a word or a signal by name, with the fields decoded from `input`: one field is the text itself or a number or a JSON value by its type, several fields are a JSON object;
`Progress` - a part of an answer; `Answered` - the answer, its type is the `result` of the party of the appeal (a text, or a JSON value of the core); `Refused` - a failure with the case of `FailCode`; `Expired` - the term). A name no party and no signal knows is the journal event
`event_unknown`, a text that does not fit the fields is `event_malformed`. Then the common events, then (for an answer, a failure, a timeout) "On accept", then the first row of the state that fits (pattern, then `cond`); a failure that no row names is read as `NoResult`
(format 4.3); no row: `event_ignored` (`event`, `state`). The actions run in the order of writing and each sees the results of the previous; every write is checked against the type of the datum (a violation is a machine error `bound_violation`). The chain goes on through
operations and forks to an appeal (it orders `SendOrder` to the party - to each id of the `set`, and the datum `to_send` is emptied - with the text of its one field, or the JSON of the fields, and the term of `silence`) or to an end (it orders `Conclusion` by the first row of the table
"Ends"; a value that is not a text is written as JSON). After the chain `monotonic` and its bound are checked, and a snapshot is ordered when a row was taken (the convention of the MVP of the engine).

- **Start.** A machine with an `input` section, or whose initial state would order something, waits for the event `start` (a word named `start`, its input is the object of the input; `input_rejected` with `reason` `json`, `missing`, `type` or `invariant` finishes it with `NoResult`). A machine whose initial state is
  an appeal to a gate is started at once. Events before the start are `event_ignored`.
- **Machine errors** (an overflow, a division by zero, a repeated key, a missing key, a list index, a bound): the event `machine_error` with `reason` (or the event of the `machine_error` action, or `fork_no_match` with `fork`), then the end `error_end` (its entry runs with `transition_note` defined, then the table "Ends"); without an `error_end` the machine finishes with `NoResult`.
  A **defect** (`require(none)`, `non_empty("")`, a type that the checks would have refused, a primitive that fails): `machine_defect`, the machine finishes with `NoResult`, the state stays as it was, and only those two orders are given.
- **Orders** are collected and given to the environment at the end of the step, in the order of giving: journal events, `order_send`, `order_cancel` (the action `cancel_open`), `order_finish`, then `order_save`.
- **Determinism.** The step is a pure function of the state and the event; two runs give the same journal and data (tested on every scenario).

## Scenarios (`scenario/0`)

A scenario is a file of data - events and what they must leave ([`schema/scenario-0.schema.json`](schema/scenario-0.schema.json); the top of `src/machine_run/scenario.nv` has an example). `parse_scenario(text)` reads it, `run_scenario(machine, scenario)` runs it on the
engine of the product over the in-memory handlers and compares after every step the name of the state, the structural journal (code and parameters of the lines the MACHINE wrote), a subset of the data, the queue, the open requests, the requests sent and cancelled, the outcome;
a part the file does not name is not compared. `report_text(run)` is empty for a run that agrees, else the name and one line per difference: `step 2 (feed): state: expected Failed, got Awaiting`. `drive_scenario[S, M](machine, scenario)` runs any `Machine[S]` (the Nova chat machine too) and gives
the traces, which is how the equality below is proved. The operations of a step: `feed`, `accept` (the process dies before the send), `dispatch`, `pump`, `deliver`, `advance`, `restart`.

## The chat machine as data and the proof of equality

`machines/chat.portolan.json` is the machine of `src/chat/chat.nv` (Idle, Awaiting, Done, Failed; the words `user_message`, `cancel`; the part `agent_chunk`; the answer, the failure, the term) written by hand. `src/machine_chat/equal_test.nv` runs the SAME scenarios on both machines -
the 39 files `scenarios/chat-*.scenario.test.json`, which reproduce every case of `chat_test.nv` and `chat_engine_test.nv` (the ten failure codes and an unknown one, the cancel in both states, the term, ignored and unknown events, tool and permission parts, Cyrillic, the discarded replies, the pump, the three restarts, the
acknowledgement of the source key, the cancel in the window between the commit and the send) - and compares at the level of the engine, step by step: the name of the state, the data both machines hold, the events of the machine, ALL journal lines with the envelope (trace, step, cause, state, request, time), the open, sent and cancelled
requests, the queue, the acknowledged keys, the outcome and the number of the step; and at the level of the machine (one `step`, no engine): the orders in order (journal event with parameters, send, cancel, finish with the text, save), the transition (`Go`/`Stay`) and the data. A deliberate change in the JSON machine turns the tests red (checked).
The data view is the one both can show: `Awaiting` the message and the reply, `Done` the reply, `Failed` the code (the table machine keeps the rest too).

## Decisions where the format is silent or the engine differs

- **Events.** The format has `answer`, `failure(reason)`, `word`, `signal`. The engine of the product also has parts of an answer that keep the request open (`Progress`) and a term made by the executor (`Expired`); both are events of the JSON (`progress`, `timeout`) and a failure row names the refusals of the party only. A word or a
  signal is the same `Input` event by name: a word is declared by the party of the appeal, a signal in `signals`; a signal may stand in the rows of any appeal (the format keeps signals for the common events and the pause).
- **Events that no row takes**: `event_ignored` / `event_unknown` / `event_malformed` are written by the interpreter itself (the format: "the executor discards and journals, rule 17"); the label of an ignored event is its name.
- **Request text**: a request with one field of text is that text, with none is empty, else the JSON of a record of the fields. The identifier of a request is the engine's `<party id>-<attempt>`; the party of an answer is the id without the attempt.
- **`order_save`** is ordered after a step that took a row (the chat machine on Nova does it at every state change; the engine saves a snapshot at every commit anyway).
- **A step that fails**: no rollback of the writes made before the error (the format: the ERROR end sees the data as they are); only a defect leaves the state as it was.
- **Enum words** (format 2.7, P-7): `text(x)` of an enum value is its word from the key `words` of the type; a value without a word is the code word of the case (`StoppedByHuman` - `stopped_by_human`, as before; `FailCode` has the words of the engine). `all_data` is written by section 5 of the format (below, task 110).
- **`record_text`** (`text_of_record` of the format) writes the English prefix `event `.

## Not implemented (and why)

- `@prepare_return` (rule 24: the preparation is the executor's) - refused by the checks. `trace`, `step` (the envelope of a nested machine call) - allowed by the checks, not bound at run time. A nested machine as a party (`kind: machine`) is decoded and checked; the engine of the product has no nested machines, so `pass` only journals `signal_passed`.
- A writing primitive that changes data of the machine (`writes` in the registry): `PrimitiveHost` gives back a value only. `profile` of a party, `edits` / `edit_check`, `form_returns` are decoded and checked, not executed (`SendOrder` has no profile; the engine has no
  return of the form and no check of the object).
- The data of the mechanics (`open_requests`, `call_request_id`, a plain attempt counter) are kept by the interpreter since task 109 (below); the counters of the elements of a set (`lenses[*].attempt`) and the return of a cancelled party to `to_send` are still the engine's / not run. `includes` are checked for shape (name, version, 12-digit hash); the file of definitions is not read; a fragment is the expanded tree.
- The qualified `answer: Type.Variant`.

## Oracle 0.1.0: more limits met in task 107

The rules that cost a compile and the four reproductions (items 36-39, `spikes/env/repro_engine/src/`) are in the survey README. What shaped this code: a type of the program has a global name (`Next`, `Reading`, `Slot`, `Pair` clash with the standard library, with a case of another enum or with a record of another
module - the records here are `Goto`, `EventRead`, `ReqField`); `embed_str` reads a file relative to the source; a variable named `b` of a list type can leak into the prelude; a record literal after `=>` of its own type is a "redundant type prefix"; a mutable copy of a field of a `ro` parameter is `E_READONLY_COERCE` (the chain of a step is a recursion over `ro` values).

# Format 2.5 and the translator (task 108)

Task 108 (`doc/tasks/108-table-translator/`) brought the interpreter from the format 2.2 of task 107 to **2.5** and wrote the translator of the tables in Russian ([`src/machine_text/`](../machine_text/README.md)). What changed here:

- **A set of literals** `"a" | "b"` replaces `text from {"a", "b"}` (2.5, T-1): two values or more, under `?` and `[]` in parentheses (`?("a" | "b")`); `spec_text` and `parse_spec` follow; a literal outside the set assigned
  to a datum, or an initial value outside it, is an issue of the table; at run time every write is checked against the type (`bound_violation`).
- **`id`** (`IdType`, 2.5, T-2): a text 8-4-4-4-12 of lower case hexadecimal digits (`is_uuid`); checked in `check_value`, so also for a datum, a word, the input of the machine (`input_rejected`, `reason=type`) and the arguments of a primitive.
- **`new_id`** (reading, no parameters, result `id`), in `standard_registry()`. The check of the table: it may stand only in a binding of the entry of an operation and the binding must be written to the data by a row of that state.
  `ScriptedHost` answers it with `Uuid.v7()` under `with Time = th.fixed_ms(at), Random = th.seeded(...)` (the stamp of the event and the number of the call in the step): the same step gives the same ids; a scripted reply of the host wins.
  The host of the product that wants real random ids is another `PrimitiveHost`.
- **Tuple fields from zero** (2.3): `t.0`, `t.1`; `make_tuple` names them `0`, `1`, ...; the lossless JSON `{"$tuple": [...]}` is the same.
- The root key **`portolan_version`** (optional, `"2.5"` ... `"2.11"`; absent means 2.5; the version of the language Portolan that the tree follows; task 113 renamed the key from `table_format`, the old name is a key the schema does not know and the loader refuses it). The built-in record **`JournalEvent`** (`СобытиеЖурнала`, section 2) beside `FailCode`. The name of an included file of definitions is a name of the registry (any letters, not a path).
- **Common events (the fragment "Pause", section 9)** read the data of a fragment (the marks `fragment`, `rows_and_fragment`, `mechanics`) without an Input and write the data with the marks `fragment` and `rows_and_fragment`.
- The record `Child` of `expr.nv` is `ExprChild` (item 40 of the survey of Oracle 0.1.0: a program with `import std.os` could not be built).
- `machines/chat.portolan.md` is the chat machine in Portolan (as tables); its translation equals `chat.portolan.json` (a test compares the trees without `title` and `portolan_version`) and runs the 39 scenarios of the chat in the same way.
- `machines/dialog.portolan.md` (task 114) is the MANY-turn chat in Portolan 2.11 (`Idle`, `Awaiting`, the end `Closed`; after an answer, a refusal, a term and a cancel the session returns to `Idle`); its translation `dialog.portolan.json` is what the session server runs (`src/server`, [README](../server/README.md)). The idle term is the parameter `IDLE_TERM` with the key of the project `проект.срок_бездействия` (`load_portolan_machine_with` of `src/machine_run` takes the table of the project). Its 37 scenarios are `scenarios/dialog-*` (28 moved from the chat scenarios, 8 new, 1 for the way only the table has: the word `close_session`; the generator is `doc/tasks/114-portolan-server/tools/gen_dialog_scenarios.py`); `src/machine_dialog` takes every row of the table by a scenario, `src/machine_dialog_eq` runs them on the machine in Nova (`dialog_session`) and on this one and compares everything.
- `data.nv`: `table_files()`, `chat_table_text()`; `data_dir_names("tables")`.

# The agent step as data (task 109)

`machines/agent_step.portolan.txt` (since task 110 with the extension `.txt`, as the copy of the sample: its prose has the relative links of the folder of the methodology and the guard of the links reads `.md` only) is the machine "Agent step" of the methodology in Portolan (as tables, format 2.6, the key lines are list items, the fragment "Pause" is a connection); `machines/agent_step.portolan.json`
is its translation by the program `portolan` (`portolan compile`, `src/portolan.nv`; a test compares them byte by byte). It passes the checks of the load without a note `unsupported`: 14 states (37 rows of the states, 4 of the pause,
6 common events), 13 rows of the ends, 16 definitions, 3 parties, 21 data. The machine is run by the same interpreter as the chat; the user writes no Nova.

What the interpreter got for it (decisions are in `doc/tasks/109-agent-step-machine/analysis.md`):

- **`Предел запросов` (`request_limit`)**: the value is evaluated at the build (an int, at least 1; `PortolanMachine.limit`, 0 when the line is not written). An appeal that would pass the limit of the requests that
  the machine holds open is a defect `request_limit`. A machine with a limit and a set of parties is refused at the build (the counters of the elements are the engine's).
- **The mechanics of the contract** (rules 14, 15, 18, 21): the counter of the attempts of a party (`counter`, a plain datum) grows at every send, the request id is `<id>-<counter>`; the datum `open_requests` gets the id
  when the request is sent and loses it at the outcome (answer, failure, term), at a cancel and at an end; the datum `call_request_id` is the request that started the machine (the field `request` of the event `start`).
  A machine that has not got these data does not get them (the chat machine is as it was). Requests to a human (a gate) do not exist in the engine: a gate waits for a word, so `open_requests` holds the requests to agents.
- **`отменить_открытые`** (`cancel_open`) cancels the open requests of the datum `open_requests`: all, or those of the named party; a machine without the datum cancels the request of the party of the state as before.
- **A term that passed** is read as the failure `Timeout` by an appeal whose rows do not name the term (the event `timeout`): the failure rows of the format (`сбой(причина ∈ {…НетОтветаВСрок…})`) take it (format 4.3, rule 16).
- **The mark `taken`** of `PortolanState`: the rows the last step took (`State#n`, `common#n`, `end:State#n`); it is the proof of the coverage of the rows by the scenarios, not data of the machine.
- **Scenarios**: the step key `host` (the answers of the primitives of the host from this step on, in the lossless JSON of the core: `reply_validation`, `close_agent_turn`), the file key `params` (the values of the parameters
  of the machine that the project gives, `portolan_machine_with`), the field `request` of the event `start`. `scenarios/agent-step-*` are 75 files: a scenario for every row that can be taken (`agent-step-<state>-<n>`,
  `agent-step-common-<n>`, `agent-step-end-<end>-<n>`) and the flows (`agent-step-flow-*`). Seven rows cannot be taken by any events (the rows `else` of the forks and the row 6 of the common events); the test names them.
- Not run (still `unsupported`): the profile of a party, `Возвратов формы` above zero, `Правит`, nested machines, `вход_заново: запросы_из_к_отправке`.

# Format 2.7 (task 110)

Task 110 (`doc/tasks/110-format-27/`) brought the tree, the interpreter and the translator to format 2.7 of the methodology (marks P-1...P-9 of section 0 of the format). The sample of the agent step of the methodology
(`state-machine-agent-step.portolan.md`, 2.7) is translated whole and with no hand edit; the table of the product (`machines/agent_step.portolan.txt`) is that sample with the two keys of the project in the column "project override".

- **The tree.** `portolan_version` may be `2.7`. A variant that is an enum has the optional key **`words`**, the list of the pairs `["Name", "word"]` in the order of the declaration (only the values that have a word; a
  word is lower case Latin letters, digits and `_`, once in the enum, the case has no fields): `VariantDef.words` (`EnumWord { name, word }`). The schema [`machine-2.schema.json`](schema/machine-2.schema.json) and
  a test of the unit `machine_table` say the same keys. `text(x)` takes the word (`enum_word(defs, type, case)`); the core `value_text` does not know the types and stays as it was.
- **`все_данные`** (`журнал(все_данные)`, the event `machine_data` with the one parameter `data`, section 5 of the format): `name=value; ...` in the order of the table of data (the data of the fragments first, the paths
  `x[*].f` are not among them). An integer is decimal, a float is `text(x)`, a text and a set of literals are as they are (an empty one is nothing after `=`), a bool is `yes`/`no`, an absent optional value is `none`, an enum value
  is its WORD (without a word - the name of the value as the tree has it, `FailCode` - the word of the engine). A list, a dict, a record, a variant with fields and a tuple are compact JSON (`src/machine_run/encode.nv`:
  no spaces, UTF-8, the quote, the backslash and the control signs escaped by RFC 8259 with lower case `\u00xx`): `none` is `null`, a bool is `true`/`false`, a record is an object with the fields in the order of its type,
  a variant with fields is `{"Name":{fields}}`, an enum value and a variant without fields are a string, a dict is an object (text keys) or the array of the pairs `[[key,value],...]`, a tuple is an array.
- **The table of the project (P-9).** `portolan_machine_with(def, registry, params)` takes `[]ProjectValue { key, value }`: the key is `проект.<ключ>` (`PROJECT_PREFIX`), `<ключ>` is the `project_key` of a parameter
  (the column "project override"). A key that has no such parameter, a key twice, a key not of the form `проект.…` refuse the machine (`Err` before anything is evaluated); the value is checked against the type of the
  parameter like a default (a full dict by the rules of section 2); a parameter that is not named keeps its default. `portolan_machine(def, registry)` is `portolan_machine_with(def, registry, [])`. A scenario (`scenario/0`)
  carries the same table as `params` (`"params": {"проект.политика_разрешений": {...}}`); a key of another form is a mistake of the file.
- **P-8, the data of an event of a scenario.** A word or a signal with ONE field has the value of the field as the `input` (a text: `"ivan"`, `"other-1"`), with several fields an object `{field: value}`, with none no `input`
  (it was so since task 109; the schema `scenario/0` and tests of the unit `machine_run` say it).
- **Names by the dictionary.** The field `идентификатор_запроса` of a signal is `id` (it was `request_id`, which is not a name of the dictionary); the datum `call_request_id` of the mechanics is the dictionary's `запрос_вызова`.
- Tests of the task: `nova test src/machine_table` (85 tests), `src/machine_run` (111), `src/machine_agent` (29), `src/machine_text_fmt` (65).

# Portolan 2.11, two languages, the reverse generator (task 113)

Task 113 (`doc/tasks/113-portolan-bilingual/`). The names: the interpreter is `PortolanMachine` (`PortolanState`, `portolan_machine`, `portolan_machine_with`, `load_portolan_machine`, `portolan_step`; they were `TableMachine`, `TableState`,
`table_machine`, `table_machine_with`, `load_table_machine`, `table_step`). The key of the tree is `portolan_version` with the values `2.5` ... `2.11` (the decoder has `portolan_versions()`; the old `table_format` is refused as an unknown key). There is no
transitional period for the former names of the files (Portolan 2.11, Я-22): `is_table_name` takes `*.portolan.md` and `*.portolan.txt`, `is_machine_json_name` takes `*.portolan.json`, nothing else. The translator reads a file in Russian or in English by the line
`- language: ru|en` and writes the same tree (`src/machine_text`, [README](../machine_text/README.md)); the reverse generator writes a tree back as a file of Portolan in either language. The tests: `nova test src/machine_table` (85), `src/machine_run` (111),
`src/machine_text` (162), `src/machine_text_lang` (53), `src/machine_text_render` (49), `src/machine_agent_en` (14).
