# machine: the core of the machines-as-data of the product

The goal of the owner (2026-10-19): every ability of the current plugin and the state machines of the methodology are written as TABLES that one
interpreter on Nova runs inside the bare product CrewHarness; the user writes no Nova. This directory is the first stage, the CORE that does not
depend on the final syntax of the tables: the dynamic value, the tree of an expression, a pure evaluator, the types of the data and the registry of the
primitives of the host. Task 106 (`doc/tasks/106-expr-evaluator/`). Task 107 (`doc/tasks/107-table-machine/`) added the interpreter of the table of states on top of this core (see "The interpreter of a machine that is data" below); the next tasks are the translator of the tables of the methodology into the JSON and the transfer of the agent step and of the other machines.

The source of the language is the format of the methodology, version 2.2 (`unitcraft/ai-dev-methodology`, `state-machines/state-machine-table-format.md`, read only), the pilots
"Agent step" and "Meeting" (the markup of the 80 functions of the meeting, the primitives of the agent step) and the dictionary of the methodology (English names).
Where the format is silent the choice is marked "decision" below and in `doc/tasks/106-expr-evaluator/analysis.md` and `doc/tasks/107-table-machine/analysis.md`.

Task 107 (`doc/tasks/107-table-machine/`) built the interpreter on top of this core. It lives in three more folders, because one folder is one module and one unit of
tests under Oracle 0.1.0 and the output of a unit must stay under 4 KB:

| Folder | Module | What it is |
|---|---|---|
| `src/machine/` | `crew_harness.machine` | the core (task 106) and the data files compiled into the binary: `schema/`, `machines/`, `scenarios/` |
| `src/machine_table/` | `crew_harness.machine_table` | the model of a machine, the decoder of the JSON tree `machine/2`, the type syntax, the checks of a table |
| `src/machine_run/` | `crew_harness.machine_run` | the interpreter `TableMachine`, the state, the host of the primitives, the scenario runner `scenario/0` |
| `src/machine_chat/` | `crew_harness.machine_chat` | tests only: the proof that the chat machine as data equals the chat machine on Nova |

## Run the tests (Windows, Nova Oracle 0.1.0)

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1     # the leading dot matters
cd C:/work/crew-harness
nova test src/machine                # the core: 170 tests
nova test src/machine_table          # the decoder and the checks: 54 tests
nova test src/machine_run            # the interpreter and the scenarios: 60 tests
nova test src/machine_chat           # the equality with the chat machine: 11 tests
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
| `data.nv` | the data files of the directories `schema/`, `machines/`, `scenarios/` compiled in (`embed_str`), `machine_files()`, `scenario_files()`, `schema_files()` |
| `*_test.nv` | 170 tests, more than 750 checks (the `assert` lines; loops repeat them) |

## The value

One sum type, no generics (Oracle 0.1.0 breaks the C of generic functions with inferred type arguments, items 12 and 13 of the survey): a typed list or a typed dict is a
`Value`, and the check against a type is `check_value`.

- `Dict` keeps its entries in the order of insertion (`keys` and `values` give the order of the first record of a key); its key is any value (text, int, enum value, tuple, record).
  Two dicts with the same entries in a different order are equal and have the same place in the order of values.
- `Record { name, fields }` keeps its fields sorted by name. A tuple is the anonymous record (name `""`) with the fields `1`, `2`, ... (`t.1`, `t.2`); `make_tuple`.
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

`TypeSpec`: `IntType`, `IntMin(n)` (`int>=n`), `FloatType`, `TextType`, `TextSet(words)` (`text from {...}`), `BoolType`, `NothingType` (the type of "no result", the value is `none`), `OptionalType(T)` (`?T`:
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

`standard_registry()` is filled with stubs (the name, the types and the class are the methodology's, the body is the host's) - 21 primitives; `standard_types()` declares the records and variants their signatures use.

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
| `reply_validation` | - | `ReplyCheck` | reading |
| `close_agent_turn` | - | nothing | irreversible |
| `check_cache` | `dialog_kind: text from {"main", "delivery"}` | nothing | writing |

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
`Machine[TableState]` of the engine, so `start_engine[TableState, TableMachine](machine, id)` runs it with the journal, the snapshots and the link of the product,
and a restart resumes it. The examples are `machines/*.machine.json` (chat, calc, actions, gate, lenses, variants), their scenarios `scenarios/*.scenario.json`.

## The file `machine/2`

The keys are English, the structure is the format 2.2 of the methodology (sections 1-9, 12, 13) in a tree; the JSON Schema is
[`schema/machine-2.schema.json`](schema/machine-2.schema.json), the reference is the decoder `src/machine_table/json.nv` (a key the schema does not know is refused; a test compares the
key lists and the kinds of the schema with the decoder's). Expressions are the trees of the core (`{"op":"name","name":"x"}`, `{"op":"+","left":E,"right":E}`, see the top of `expr.nv`);
the types are written as the format writes them (`int>=0`, `?text`, `[]Finding`, `{text: int}`, `text from {"a", "b"}`, `full {K: V}`, `(text, int)`).

| Key of the root | Meaning (format section) |
|---|---|
| `format`, `machine`, `version`, `title` | the header: `machine/2`, the Latin name (the name in the journal), the version |
| `types` | `records`, `variants` (an enum is a variant without fields); `FailCode`, the closed list of the ten failure causes, is built in (2) |
| `constants`, `params` | `name`, `type`, `value` / `default` (+ `project_key`); evaluated in order when the machine is built (1, 8) |
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
(`reads` in the registry); `input`, `all_data`, `transition_record`, `trace`/`step` only where they are defined; **the writes against the data** (a root that is not a datum, a datum whose `writes` is not rows,
a path with `writes: mechanics`); the entry of a state changes no data (rule 29); **the class of every primitive in the place of its call** (`check_expr_positions`), a primitive that is not registered or not listed in `primitives`;
**the reachability of the states** (a return to `@previous` reaches every appeal); **the exhaustiveness of the ends** (a row with `when: true`, or a chain of `field == "..."` that covers the closed set of the datum minus `except`; no overlap);
the definitions (no recursion, no catalog name, the number of arguments); an `if` does not nest in a branch of another `if`; the journal codes and parameters are lower case Latin; the includes (a 12-digit hash); the counters of the parties; the set is the datum `to_send`.

## The interpreter

`table_step(machine, state, event, environment, host)` is the whole `step` (`Machine[TableState].step` calls it with the default `ScriptedHost`). It reads its arguments only; the clock is the stamp of the event (`time_now` of the default
host), any other primitive goes to the `PrimitiveHost` that is passed in. The state is `TableState { name, started, input, data }` - values of the core, written as one JSON object under `state` of the snapshot.

The order of a step: the event of the engine is read as the event of the machine (`Input` - a word or a signal by name, with the fields decoded from `input`: one field is the text itself or a number or a JSON value by its type, several fields are a JSON object;
`Progress` - a part of an answer; `Answered` - the answer, its type is the `result` of the party of the appeal (a text, or a JSON value of the core); `Refused` - a failure with the case of `FailCode`; `Expired` - the term). A name no party and no signal knows is the journal event
`event_unknown`, a text that does not fit the fields is `event_malformed`. Then the common events, then (for an answer, a failure, a timeout) "On accept", then the first row of the state that fits (pattern, then `cond`); a failure that no row names is read as `NoResult`
(format 4.3); no row: `event_ignored` (`event`, `state`). The actions run in the order of writing and each sees the results of the previous; every write is checked against the type of the datum (a violation is a machine error `bound_violation`). The chain goes on through
operations and forks to an appeal (it orders `SendOrder` to the party - to each id of the `set`, and the datum `to_send` is emptied - with the text of its one field, or the JSON of the fields, and the term of `silence`) or to an end (it orders `Conclusion` by the first row of the table
"Ends"; a value that is not a text is written as JSON). After the chain `monotonic` and its bound are checked, and a snapshot is ordered when a row was taken (the convention of the MVP of the engine).

- **Start.** A machine with an `input` section, or whose initial state would order something, waits for the event `start` (a word named `start`, its input is the object of the input; `input_rejected` with `reason` `json`, `missing`, `type` or `invariant` finishes it with `NoResult`). A machine whose initial state is
  an appeal to a gate is started at once. Events before the start are `event_ignored`.
- **Machine errors** (an overflow, a division by zero, a repeated key, a missing key, a list index, a bound): the event `machine_error` with `reason` (or the event of the `machine_error` action, or `fork_no_match` with `fork`), then the end `error_end` (its entry runs with `transition_record` defined, then the table "Ends"); without an `error_end` the machine finishes with `NoResult`.
  A **defect** (`require(none)`, `non_empty("")`, a type that the checks would have refused, a primitive that fails): `machine_defect`, the machine finishes with `NoResult`, the state stays as it was, and only those two orders are given.
- **Orders** are collected and given to the environment at the end of the step, in the order of giving: journal events, `order_send`, `order_cancel` (the action `cancel_open`), `order_finish`, then `order_save`.
- **Determinism.** The step is a pure function of the state and the event; two runs give the same journal and data (tested on every scenario).

## Scenarios (`scenario/0`)

A scenario is a file of data - events and what they must leave ([`schema/scenario-0.schema.json`](schema/scenario-0.schema.json); the top of `src/machine_run/scenario.nv` has an example). `parse_scenario(text)` reads it, `run_scenario(machine, scenario)` runs it on the
engine of the product over the in-memory handlers and compares after every step the name of the state, the structural journal (code and parameters of the lines the MACHINE wrote), a subset of the data, the queue, the open requests, the requests sent and cancelled, the outcome;
a part the file does not name is not compared. `report_text(run)` is empty for a run that agrees, else the name and one line per difference: `step 2 (feed): state: expected Failed, got Awaiting`. `drive_scenario[S, M](machine, scenario)` runs any `Machine[S]` (the Nova chat machine too) and gives
the traces, which is how the equality below is proved. The operations of a step: `feed`, `accept` (the process dies before the send), `dispatch`, `pump`, `deliver`, `advance`, `restart`.

## The chat machine as data and the proof of equality

`machines/chat.machine.json` is the machine of `src/chat/chat.nv` (Idle, Awaiting, Done, Failed; the words `user_message`, `cancel`; the part `agent_chunk`; the answer, the failure, the term) written by hand. `src/machine_chat/equal_test.nv` runs the SAME scenarios on both machines -
the 39 files `scenarios/chat-*.scenario.json`, which reproduce every case of `chat_test.nv` and `chat_engine_test.nv` (the ten failure codes and an unknown one, the cancel in both states, the term, ignored and unknown events, tool and permission parts, Cyrillic, the discarded replies, the pump, the three restarts, the
acknowledgement of the source key, the cancel in the window between the commit and the send) - and compares at the level of the engine, step by step: the name of the state, the data both machines hold, the events of the machine, ALL journal lines with the envelope (trace, step, cause, state, request, time), the open, sent and cancelled
requests, the queue, the acknowledged keys, the outcome and the number of the step; and at the level of the machine (one `step`, no engine): the orders in order (journal event with parameters, send, cancel, finish with the text, save), the transition (`Go`/`Stay`) and the data. A deliberate change in the JSON machine turns the tests red (checked).
The data view is the one both can show: `Awaiting` the message and the reply, `Done` the reply, `Failed` the code (the table machine keeps the rest too).

## Decisions where the format is silent or the engine differs

- **Events.** The format has `answer`, `failure(reason)`, `word`, `signal`. The engine of the product also has parts of an answer that keep the request open (`Progress`) and a term made by the executor (`Expired`); both are events of the JSON (`progress`, `timeout`) and a failure row names the refusals of the party only. A word or a
  signal is the same `Input` event by name: a word is declared by the party of the appeal, a signal in `signals`; a signal may stand in the rows of any appeal (the format keeps signals for the common events and the pause).
- **Events that no row takes**: `event_ignored` / `event_unknown` / `event_malformed` are written by the interpreter itself (the format: "the executor discards and journals, rule 17"); the label of an ignored event is its name.
- **Request text**: a request with one field of text is that text, with none is empty, else the JSON of a record of the fields. The identifier of a request is the engine's `<party id>-<attempt>`; the side of an answer is the id without the attempt.
- **`order_save`** is ordered after a step that took a row (the chat machine on Nova does it at every state change; the engine saves a snapshot at every commit anyway).
- **A step that fails**: no rollback of the writes made before the error (the format: the ERROR end sees the data as they are); only a defect leaves the state as it was.
- **Enum words** are the code word of the case (`StoppedByHuman` - `stopped_by_human`, `text()` of the core); the explicit words per case of the format are not read. `all_data` writes composite values as the lossless JSON of the core.
- **`record_text`** (`text_of_record` of the format) writes the English prefix `event `.

## Not implemented (and why)

- `@prepare_return` (rule 24: the preparation is the executor's) - refused by the checks. `trace`, `step` (the envelope of a nested machine call) - allowed by the checks, not bound at run time. A nested machine as a party (`kind: machine`) is decoded and checked; the engine of the product has no nested machines, so `pass` only journals `signal_passed`.
- A writing primitive that changes data of the machine (`writes` in the registry): `PrimitiveHost` gives back a value only. `profile` of a party, `request_limit`, `edits` / `edit_check`, `form_returns` are decoded and checked, not executed (`SendOrder` has no profile; the engine has no
  return of the form and no check of the object).
- The data of the mechanics (`open_requests`, the attempt counters) are not kept by the interpreter: the engine keeps the counters (`PartyCounter`) and the open requests. `includes` are checked for shape (name, version, 12-digit hash); the file of definitions is not read; a fragment is the expanded tree.
- The qualified `answer: Type.Variant`, explicit enum words, the encoding of `all_data` of format 2.2 (item 1 of the pilot's edits) beyond the lossless JSON of the core.

## Oracle 0.1.0: more limits met in task 107

The rules that cost a compile and the four reproductions (items 36-39, `spikes/env/repro_engine/src/`) are in the survey README. What shaped this code: a type of the program has a global name (`Next`, `Reading`, `Slot`, `Pair` clash with the standard library, with a case of another enum or with a record of another
module - the records here are `Goto`, `EventRead`, `ReqField`); `embed_str` reads a file relative to the source; a variable named `b` of a list type can leak into the prelude; a record literal after `=>` of its own type is a "redundant type prefix"; a mutable copy of a field of a `ro` parameter is `E_READONLY_COERCE` (the chain of a step is a recursion over `ro` values).
