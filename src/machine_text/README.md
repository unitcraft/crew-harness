# machine_text: the translator of Portolan (tables in Russian) into the machine as data

Task 108 (`doc/tasks/108-table-translator/`), task 109 (format 2.6), task 110 (format 2.7). A machine is a Markdown file of tables in Russian in Portolan, the language of the methodology (a file `*.portolan.md`; the old `*.table.md` is read too, the translator does not look at the extension), **version 2.5, 2.6 or 2.7**
(`unitcraft/ai-dev-methodology`, `state-machines/state-machine-portolan-spec.md`, read only); the translator turns it into the JSON `machine/2` that the interpreter of
`src/machine_table` + `src/machine_run` runs. The user writes no Nova. The dictionary of the methodology (version 9, `state-machine-glossary.md`) gives the Latin names.

## Run

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1          # the leading dot matters
cd C:/work/crew-harness
nova build src/machine_translate.nv -o target/machine-translate.exe    # the command
target/machine-translate.exe src/machine/machines/chat.portolan.md          # the JSON on the standard output, exit code 0
target/machine-translate.exe machine.portolan.md --summary                          # the summary: states, rows, actions
target/machine-translate.exe machine.portolan.md --lenient                          # the JSON of what could be translated even when there are errors
nova test src/machine_text                                              # the translator: 129 tests
nova test src/machine_text_eq                                           # the proofs: the chat machine, the pilot, the examples, the definitions
nova test src/machine_text_fmt                                          # format 2.7: prose, the expansion of a fragment, sets, tables, words, hash (64 tests)
nova test src/machine_agent                                             # the sample of the methodology goes through the translator; the agent step of the product
```

As a library (module `crew_harness.machine_text`):

| Function | What it does |
|---|---|
| `translate(file_text) -> Result[str, []TranslateError]` | the JSON of a machine, or every error |
| `translate_report(file_text) -> TranslateReport` | the JSON (of what could be translated) with every note, the WARNINGS (`warnings`, a list of their own, format 2.7), and the counts of the rows (`rows_total`, `rows_noted`) |
| `translate_checked(file_text, registry) -> TranslateReport` | the same, then the checks of the table `check_machine` against the registry of the primitives of the host; an issue is put at the line of its row |
| `translate_report_with`, `translate_checked_with` | with the registry of the files of definitions of the caller (`[]NamedText`: the name of the include line, the text) |
| `translate_definitions(text) -> DefsReport` | a file of definitions (format section 8) alone: version, hash, JSON of types, constants, definitions |
| `definitions_hash(text)`, `normalize_definitions(text)` | the hash of a file of definitions: 12 hex letters of SHA-256 after the normalization of the format (BOM, LF, no blanks at the end of a line, one LF at the end) |
| `translate_type(text)`, `translate_types(text)`, `translate_expression(text, data)`, `translate_actions(text, data, parties, empty_lists)` | pieces of a table alone: a type, the declarations of the section `## Типы`, an expression, a list of actions |
| `render_summary(machine_json) -> str` | the summary of a machine: the header, one line per state with the number of rows and actions, the common events, the ends |
| `error_text(error, file) -> str` | `file:line:column: kind: message` and the quoted line (the same for a warning, its `kind` is `warning`) |

The output is deterministic: two translations of one text give the same bytes (a test compares them, and a test on the chat machine compares the tree with the hand-written one).

**Format 2.6 (task 109).** The key lines of a state (`Сторона`, `Срок тишины`, `Правит`, `Возвратов формы`, `Вход`, `При входе`, `При приёме`, `Кроме`, and `Предел запросов`, `Результат` in their sections) are items of a bullet list: `- Сторона: агент`.
The marker `- ` is OPTIONAL when reading (a file of format 2.5, such as `chat.portolan.md`, has none), with and without it the JSON is the same; the columns of the errors stay the columns of the file (`TxEntry.shift` is the width of the marker).
The body of `При входе` of several actions may be a nested list, one action to an item (`  - пусть сейчас = вызвать(time_now);`), the `;` at the end of an item is kept; an item of a nested list is read as a continuation line without its marker.
A table after a list item stands at the level of the block after an empty line. `format: 2.6` is read like `format: 2.5`; the key `table_format` of the tree is the format of the file (`2.5` or `2.6`). The hash of the sample file of definitions is `1628bec298d9` (the line `format: 2.6` is a part of the hash).

**Format 2.7 (task 110).** Every mark of the version is run (the marks P-1...P-9 of section 0 of the format); the sample of the methodology (`state-machine-agent-step.portolan.md`, 2.7, copied as it is into `src/machine_agent/cases/`) is translated whole, with no error.

| Mark | What the translator does |
|---|---|
| P-1 prose | A paragraph is a comment: a line at the first column after an empty line, outside the tables, the blocks of code (between lines of three backticks) and the key lines, with the lines that follow it up to an empty line, gives no entry (`tx_classify_full`); the signs `` ` `` and `« »` in it are free. A line that begins a declaration (`тип`, `вариант`, `перечисление`, `определение`), a call `Имя(`, the sign `—` and any line of the section `Подключения` is not a paragraph (a file of 2.5 or 2.6 reads as before). A line right after a heading or a table (no empty line) is not a paragraph: it is "лишняя строка". A line of a paragraph that begins with a word of the closed list (`Сторона`, `Срок тишины`, `Вход`, `Правит`, `Возвратов формы`, `При входе`, `При приёме`, `Результат`, `Кроме`, `Предел запросов`, `Куда` - the format 4.1 names the last one too; `Начальное состояние` is not in it), after the marks `-`, a dash, `•`, `*` and spaces, followed by a space, a colon or the end, gives a WARNING `kind: warning` with the line and the column; the warnings are `TranslateReport.warnings`, not `errors`, the command prints them after the errors and does not change the exit code. |
| P-2 fragment | `## Подключения` holds the lines of connection only (`Имя(…)`, `определения: …`); prose, a list, a table, a heading or a key there is the error "только строки подключения". `## Раскрытие фрагмента «Имя»` (a heading that begins with these words, any name) is skipped whole up to the next heading `#`/`##` outside a block of code. A heading `### ПАУЗА — …` of the fragment in `## Состояния` is the error "состояние `ПАУЗА` объявлено дважды" (the fragment registers its states first). |
| P-5 sets | A set of literals `"a" \| "b"` is a type everywhere a type stands: the argument of `словарь[K, V]` and `полный словарь[K, V]`, the result and the parameter of a definition, a cell "type"; the brackets only under `?` and `[]` (the message says so). |
| P-6 tables | A separator row (a line of `-`, `:`, spaces and bars `|`) is skipped; `\|` in a cell is a bar of the text (also in a string literal), the escape is taken off. |
| P-7 words | The enum with words `перечисление Имя = Зн "слово" \| …` has the key `words` in the JSON: the list of the pairs `["Name", "word"]` in the order of the declaration (only of the values that have a word); an enum without words has no key. A word is a Latin word of a code (`[a-z][a-z0-9_]*`), not empty, once in the enum; the words of the built-in `КодСбоя` are the words of the engine (another word is `unsupported`) and do not go to the tree. |
| names | The field of a signal `идентификатор_запроса` is `id` (the dictionary) instead of `request_id`; `table_format` of the tree is `2.5`, `2.6` or `2.7`. The hash of the sample file of definitions is `446ddf8041c0` (the line `- format: 2.7` is a part of the hash; `1628bec298d9` was the hash of 2.6). |

## Errors

All errors are listed, not the first one; sorted by place. `TranslateError { line, col, kind, message, quote }`: the line and the column in the file (1-based, in letters), the
quoted line, and the `kind`:

| kind | Meaning |
|---|---|
| `syntax` | the cell cannot be read |
| `name` | a word that the table of names, or the file itself, does not know; the message gives the nearest word (`; возможно, `x``) |
| `type` | a type is wrong |
| `structure` | the shape of the file: the header, the sections, the columns of a table, an extra line |
| `unsupported` | "не поддержано в этой версии": the format has it, the interpreter of task 107 does not run it (below) |
| `warning` | (only in `warnings`) a paragraph that begins like a key |
| `check` | an issue of `check_machine` (reads against the "Input", writes against the data, classes of the primitives, reachability, exhaustiveness of the ends, `new_id`, a literal outside its set); the message begins with the path in the JSON |

A soft error (an unknown word) does not stop the cell: the translation goes on with the Russian word in its place, so a cell with two unknown words says both. A hard error
(a cell that does not parse) stops that cell only; the other rows are translated.

## The names

`names.tsv` is made from the dictionary by `python scripts/glossary-names.py <state-machine-glossary.md> > src/machine_text/names.tsv`: `kind<TAB>Russian<TAB>English`, kinds `type`,
`case`, `state`, `event`, `method`, `function`, `field`, `data`, `constant`, `variable`, `effect`. A Russian word may have two English ones in two kinds (the datum `расход` is
`transport_usage`, the field `расход` is `usage`, section 2.15 of the dictionary); the translator asks for the kind it needs (a datum, a field, a type, a case, a function).
`names_format.tsv` holds what the dictionary does not have: `catalog` (the functions of section 12 of the format as the evaluator names them: `есть` -> `has`), `executor`
(`вход`, `событие`, `сторона` -> `party`, `состояние`, `запись_перехода` -> `transition_note`, `все_данные`, `трасса`, `номер_шага`: the names of `src/machine_table`, equal to the dictionary's since task 109: `party`, `transition_note`), `primitive` (`новый_ид` -> `new_id`, version 9), `word`, `signal`, `signal_field`, `part`, and the names of the machines of the product
(the chat machine). A name that a table introduces itself (a parameter of a definition, a `пусть`, a variable of a lambda, a name of an event) is looked up under `variable` and, if
the dictionary has not got it, written in Latin letters (`л` -> `l`, `полученный` -> `received` by the dictionary). The state names come from the heading: `### ПОЛИТИКА — развилка (Policy)`.

## The file

Markdown, the sections of format section 1 (`## Типы`, `## Константы`, `## Параметры`, `## Вход`, `## Данные`, `## Стороны`, `## Определения`, `## Подключения`, `## Общие события`,
`## Состояния`, `## Концы`, `## Примитивы`). The rules of the reader: a line that starts with `>` is a comment, three backticks are nothing, `//` ends a line, a line that starts with `|` at the
first column is a row (`\|` is a bar of the text, a bar in a string literal is not a cell border), an indented line continues the line before it, any other line outside a construction is "лишняя
строка". Expressions, actions and types are those of sections 2, 3 and 5 (`?T`, `[]T`, `словарь[K, V]`, `полный словарь[K, V]`, tuples, `число≥n`, sets of literals `"a" | "b"`, `ид`; `если`, `пусть`,
`выбор`, lambdas, `{ ...x, поле: выр }`, `Тип.Вариант { … }`, `вызвать(примитив, …)`; `поле = выр`, `+=`, `поле[ключ] = выр`, `журнал(…)`, `ошибка_машины(…)`, `для каждого`, `если … то (…) иначе (…)`).

Extensions of the product (they are the proposals of section 14 of the format, И-4, that the interpreter has): the section `## Части ответа` (`| сторона | имя | поля |`) and the event
`часть(имя(поле: имя))` for a part of an answer that keeps the request open; the event `срок` (the term made by the executor); the section `## Сигналы` (`| имя | поля |`) and `сигнал(имя)` in the
rows of any appeal; `отменить_открытые(сторона: имя)` cancels the open requests of one party. The chat machine (`src/machine/machines/chat.portolan.md`) uses all four.

**Fragments and definitions.** `## Подключения` holds `Пауза(слово_остановки: …, код_остановки: "…", вложенные: [], отмена_запросов: …, вход_заново: …, право_записи: "…")` (all six parameters; the
text of the fragment, `fragments/pause.fragment.md`, is compiled in, `<параметр>` is put in before it is read; its data come before the data of the machine, its common events before the
machine's own, its state `ПАУЗА` after the machine's states) and `определения: <имя> версия <N> хеш <hex12>` (the file is found in the registry by the name, the version and the hash are
checked, a copy of its types, constants and definitions is put in the tree, `includes` gets the line). `вложенные: []` makes `передать(вложенные, …)` and `отменить_открытые(кроме: вложенные)` plain.

## Not supported in this version

The format has them, the interpreter of task 107 does not run them, so the translator answers `unsupported` with the line (the rest of the file is translated, `--lenient`):
the side of the kind `machine` (a nested machine; its row is not translated), the column `профиль` when it is not `—`, `Правит: …; проверка: …`,
`Возвратов формы: N` with N above zero, a fragment with a non-empty list of nested machines and `вход_заново: запросы_из_к_отправке`, the "Where" `возврат_подготовки`.
`src/machine_text_eq/cases/unsupported-examples.portolan.md` has them all; their places are the list of the next task. The line `Предел запросов` is run since task 109 (below, and the README of `src/machine`).

## Oracle 0.1.0: what shaped the code

One folder is one module and one unit, so the translator is one module (`crew_harness.machine_text`) in many files, and the proofs that need the chat machine, the cases and the interpreter are
a unit of their own (`src/machine_text_eq`), with the output of each under 4 KB (item 20). No generics with inferred arguments: the tree of the JSON is a plain sum type (`TxJ`), the
parser passes a mutable record (`TxP`) and the context (`TxCx`). The names of the types begin with `Tx`: type names are global to the program (items 9, 14, 21, 29, 37-39 and the new item 40).
Rules met on the way (items 40-41 of the survey): a local or a parameter with one name and different types in two functions of a unit is mixed up by the code generator (`list`!), a `mut` binding of a
`ro` value is refused (`sc_clone`, `p_copy`), a record literal after `=>` of its own type is "redundant", strings have no `+`, a raw newline in `"…"` is refused (a backtick string), `str.trim` is `trim_ascii`.
