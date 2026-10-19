# machine: the core of the machines-as-data of the product

The goal of the owner (2026-10-19): every ability of the current plugin and the state machines of the methodology are written as TABLES that one
interpreter on Nova runs inside the bare product CrewHarness; the user writes no Nova. This directory is the first stage, the CORE that does not
depend on the final syntax of the tables: the dynamic value, the tree of an expression, a pure evaluator, the types of the data and the registry of the
primitives of the host. Task 106 (`doc/tasks/106-expr-evaluator/`). The next task is the interpreter of the table of states on top of this core.

The source of the language is the format of the methodology, version 2 (`unitcraft/ai-dev-methodology`, `state-machines/state-machine-table-format.md`:
sections 2, 3, 5, 7 and the catalog of section 12; it replaced the draft v1 while this task was under way), the pilots "Agent step" and "Meeting"
(the markup of the 80 functions of the meeting, the primitives of the agent step) and the dictionary of the methodology (version 7, English names).
Where the format is silent the choice is marked "decision" below and in `doc/tasks/106-expr-evaluator/analysis.md`.

## Run the tests (Windows, Nova Oracle 0.1.0)

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1     # the leading dot matters
cd C:/work/crew-harness
nova test src/machine                # this module: one unit, 163 tests
nova test --strict-effects src/machine
nova test src --jobs 4               # the whole tree (the PostgreSQL units need the temporary container of src/pg/testdb.ps1)
```

Everything for Oracle 0.1.0 is in [`spikes/env/README.md`](../../spikes/env/README.md). `src/machine/` is ONE module, `crew_harness.machine`, so one test unit: a
module in a folder under `src/machine/` is refused by Oracle 0.1.0 (item 25 there), and the output of a unit must stay under 4 KB (item 20), hence the
short names of the tests.

## Layout

| File | What it is |
|---|---|
| `value.nv` | `Value` (`Null`, `Bool`, `Int`, `Float`, `Text`, `List`, `Dict`, `Record`, `Variant`), builders, equality and order, `text(x)`, JSON both ways |
| `types.nv` | `TypeSpec`, `TypeDefs` (named records and variants), `check_value` with the path of the first mismatch |
| `expr.nv` | `Expr`, the tree of an expression, its JSON form (`expr_from_json`, `expr_to_json`), builders, `expr_depth` |
| `eval.nv` | `eval(expr, scope)`, `eval_with(expr, scope, host)`, `EvalError`, the protocol `PrimitiveHost` |
| `registry.nv` | `Primitive`, `Registry`, the class of a primitive in the position of a call, `standard_registry()` and `standard_types()` |
| `*_test.nv` | 163 tests, more than 700 checks (the `assert` lines; loops repeat them) |

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

Not here (the interpreter's, next task): `конец(state)` of the catalog (it needs the states of a machine), the names of the executor (`вход`, `событие`, `состояние`, ...), the actions (`поле = выр`, `журнал`, `для каждого`),
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
