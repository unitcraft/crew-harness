# machine_text: the translator of Portolan (tables in Russian or English) into the machine as data, and the reverse generator

Task 108 (`doc/tasks/108-table-translator/`), task 109 (format 2.6), task 110 (format 2.7), task 113 (two languages, formats 2.8 - 2.11, the reverse generator). A machine is a Markdown file of tables in Russian or in English in Portolan, the language of the methodology (a file `*.portolan.md`; the translator does not look at the extension; the former `*.table.md` is not a name of the product), **version 2.5 ... 2.11**
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
target/machine-translate.exe machine.portolan.json --render --language en   # the reverse way: the file of Portolan for a tree
nova test src/machine_text                                              # the translator and its table of words: 198 tests (36 of them task 117)
nova test src/machine_text_unicode                                      # names in any alphabet through the translator and the reverse generator (27 tests, task 117)
nova test src/machine_text_eq                                           # the proofs: the chat machine, the pilot, the examples, the definitions
nova test src/machine_text_fmt                                          # format 2.7: prose, the expansion of a fragment, sets, tables, words, hash (65 tests)
nova test src/machine_text_lang                                         # the two languages, the news of 2.9 - 2.11 (53 tests)
nova test src/machine_text_render                                       # the reverse generator and its circles (49 tests)
nova test src/machine_agent                                             # the sample of the methodology goes through the translator; the agent step of the product
nova test src/machine_agent_en                                          # the English sample of the agent step: the translation, the equality with the Russian one, the 75 scenarios
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
A table after a list item stands at the level of the block after an empty line. `format: 2.6` is read like `format: 2.5`; the key `portolan_version` of the tree is the format of the file (`2.5` or `2.6`). The hash of the sample file of definitions is `1628bec298d9` (the line `format: 2.6` is a part of the hash).

**Format 2.7 (task 110).** Every mark of the version is run (the marks P-1...P-9 of section 0 of the format); the sample of the methodology (`state-machine-agent-step.portolan.md`, 2.7, copied as it is into `src/machine_agent/cases/`) is translated whole, with no error.

| Mark | What the translator does |
|---|---|
| P-1 prose | A paragraph is a comment: a line at the first column after an empty line, outside the tables, the blocks of code (between lines of three backticks) and the key lines, with the lines that follow it up to an empty line, gives no entry (`tx_classify_full`); the signs `` ` `` and `« »` in it are free. A line that begins a declaration (`тип`, `вариант`, `перечисление`, `определение`), a call `Имя(`, the sign `—` and any line of the section `Подключения` is not a paragraph (a file of 2.5 or 2.6 reads as before). A line right after a heading or a table (no empty line) is not a paragraph: it is "лишняя строка". A line of a paragraph that begins with a word of the closed list (`Сторона`, `Срок тишины`, `Вход`, `Правит`, `Возвратов формы`, `При входе`, `При приёме`, `Результат`, `Кроме`, `Предел запросов`, `Куда` - the format 4.1 names the last one too; `Начальное состояние` is not in it), after the marks `-`, a dash, `•`, `*` and spaces, followed by a space, a colon or the end, gives a WARNING `kind: warning` with the line and the column; the warnings are `TranslateReport.warnings`, not `errors`, the command prints them after the errors and does not change the exit code. |
| P-2 fragment | `## Подключения` holds the lines of connection only (`Имя(…)`, `определения: …`); prose, a list, a table, a heading or a key there is the error "только строки подключения". `## Раскрытие фрагмента «Имя»` (a heading that begins with these words, any name) is skipped whole up to the next heading `#`/`##` outside a block of code. A heading `### ПАУЗА — …` of the fragment in `## Состояния` is the error "состояние `ПАУЗА` объявлено дважды" (the fragment registers its states first). |
| P-5 sets | A set of literals `"a" \| "b"` is a type everywhere a type stands: the argument of `словарь[K, V]` and `полный словарь[K, V]`, the result and the parameter of a definition, a cell "type"; the brackets only under `?` and `[]` (the message says so). |
| P-6 tables | A separator row (a line of `-`, `:`, spaces and bars `|`) is skipped; `\|` in a cell is a bar of the text (also in a string literal), the escape is taken off. |
| P-7 words | The enum with words `перечисление Имя = Зн "слово" \| …` has the key `words` in the JSON: the list of the pairs `["Name", "word"]` in the order of the declaration (only of the values that have a word); an enum without words has no key. A word is a Latin word of a code (`[a-z][a-z0-9_]*`), not empty, once in the enum; the words of the built-in `КодСбоя` are the words of the engine (another word is `unsupported`) and do not go to the tree. |
| names | The field of a signal `идентификатор_запроса` is `id` (the dictionary) instead of `request_id`; `portolan_version` of the tree is `2.5`, `2.6` or `2.7`. The hash of the sample file of definitions is `446ddf8041c0` (the line `- format: 2.7` is a part of the hash; `1628bec298d9` was the hash of 2.6). |

## Two languages (task 113)

A file is written in ONE language, `ru` or `en`, declared by the header line `- language: ru|en` (none means `ru`; spec 1a). The translator does not guess: an English header (`# Machine:`, `# Definitions:`, `# Fragment:`) with no `- language: en` is the error "язык шапки английский, а language не объявлен" (a Russian header with `language: en` too; any value but `ru`, `en` is an error); the file is then translated in the language of its header so that one wrong line does not
give a hundred errors. A keyword of the other language is the error of the kind `language` at the line and the column of the first foreign word (a section, a column, a key line, the kind of a state, an event, a destination, an action, a type, an expression word - `if` in a Russian file, `если` in an English one). The names of the author may be of any language: a Latin name that the table of names does not have is the name of the JSON as it is, in both languages; in an English file a Russian word of the dictionary is read too (the words of the kinds `catalog` and `executor` are keywords of the language and not names). The tree `machine/2` is the same for both
files but for the strings of the author (the title, the texts of refusals) and the names of the local variables that the author wrote himself.

**The table of words** is data: `keywords.tsv` is a copy of `portolan-keywords.tsv` of the methodology as it is (219 rows, 16 kinds `kind, ru, en`, the closed list of spec 1a), `keywords_product.tsv` is the layer of the product (the sections `Сигналы`/`Signals` and `Части ответа`/`Response parts`, the events `срок`/`deadline` and `часть`/`part`, the key `сторона`/`party` of `cancel_open`, the fragment `Пауза`/`Pause` and its six parameters). The code never writes a word of the structure: it asks `kw(words, kind, key)` for a kind and the English word (the key) and gets the word of the language of the file, or asks which key a word is (`kw_key`) or whether it belongs to the other language only (`kw_foreign`). The test `wt no cyrillic words` reads the sources of the unit and finds no Cyrillic literal outside the texts of the error messages and the letters of the alphabet of the transliteration; the test `wt asked words exist` finds every pair kind-key that the code asks for in the table. `names_aliases.tsv` has the two English names that the English sample of the methodology writes otherwise than the dictionary (`transport_usage` for the field `usage`, `elevated_attention_executor` for the setting `attention_executor`); they are read in an English file only. Fragments and files of definitions come in both languages (`fragments/pause.fragment.md` and `.en.md`, `defs/cycle-arithmetic.portolan.md` and `.en.portolan.md`; the hashes of the samples of 2.11 are `fad927a77d32` and `afe05e9a1e4d`).

**The news of 2.9 - 2.11 in the reading.** Both writings of the operators (`≥`/`>=`, `≤`/`<=`, `≠`/`!=`, `→`/`->`, `…`/`...`, `∈`/`in`; in English the word `in` is the membership before `{` and ends the value of a `let`); `для каждого`/`for each`; `Вход: нет`/`Input: none`; the heading of a state `### ИМЯ — вид (JsonИмя)` with the brackets needed only when the names differ (a Russian name without them is an error); an event field binding `поле: имя`; a declaration outside a block of code in a machine of 2.9 and later is a comment with a warning (the files of definitions and the fragments are read as before: the sample of the methodology holds its definition outside a block); a paragraph pressed against a table, a heading or a list item is a warning and an extra line (2.9 and later); `Куда` is no key of the list of the prose warning; the heading `## Раскрытие фрагмента «Имя»` whose name is not an included fragment is a warning; an empty section `Вход` (one dash) is no input; `сбой(_ ∈ {…})` binds nothing. Not run (the interpreter has no such thing; the line stays an `unsupported` note or is read as a name): the built-in enum `Сигнал` as a type (its words are the arguments of `передать`), `Состояние` as the enum of the names of the states (it is `text`), `допустимые значения` and `Обязывает` of the file of a fragment (the product's fragment is compiled in, its text is read as before), a nested machine, `Правит`, a profile of a party.

## The reverse generator (task 113)

`render_machine(machine_json, language) -> RenderReport { text, notes }` (and `render`, `render_machine_with(json, language, copy_includes)`) writes a tree `machine/2` as a file of Portolan in `ru` or `en` in the canonical form of section 1b of the specification: the header `# Машина: <Имя>` with the four items, the eleven sections in order and an empty one as `—` under its heading, the keys of a state as list items in the order Party, Idle term, Edits, Form returns, Input, On accept, On entry, Except, the tables with one space round the bar and `\|` in a cell, the declarations in blocks of code, one on a line, the operators of the language (`→`, `>=`, `...`, `∈`, `≥`, `≤` in a Russian file, ASCII only in an English one), the Latin name of a state in its heading with no brackets, UTF-8, LF, one line feed at the end. The words are the table of words; the names are the dictionary words that the reader takes back to the same Latin name, else the Latin name. An included file of definitions is written as its line of connection (its types, constants and definitions are left out), `copy_includes` writes the copies instead; the states, the data, the common events and the signals of an included fragment are written as the machine's own (a section `Common events`, `Signals`, `Response parts` are the product's extensions and are written when there is something to write). What the tree has and the file cannot say (a nested machine, an unknown node) is a note with the place in the JSON. Nothing of the prose is written, and the title is not: the header holds the Latin name of the machine, so a circle gives the same tree but for `title` and `portolan_version`. The pieces are exported for tests (`render_type_in`, `render_expression_in`, `render_actions_in`).

The command: `machine-translate <file.portolan.json> --render [--language ru|en]` writes the file to the standard output (on Windows the standard output turns a line feed into CR LF; the function returns LF). The circles are tests: tree -> file -> tree on the seven machines of `src/machine/machines/` and on the machines written as files (the chat, the table of the agent step, both samples of the methodology, the pilot, the examples of the format) in both languages, "ru -> en -> ru", and the file of the second pass is the file of the first (the canonical form is a fixed point). `check-portolan-samples.py` of the methodology, run on the generated pair of the agent step (Russian and English), finds one difference, and it is the product's section `Signals` that the table of words of the methodology has not got.

## Names in any alphabet, byte offsets (task 117)

The names of the author may be written in any alphabet: Greek, German with umlauts, Chinese, letters of four bytes. The reader of the lines (`lex.nv`) works on **byte offsets** and on `std.unicode`:

| What | How |
|---|---|
| a place in a line | a byte offset; the reader walks a line by the chars (`tx_at` decodes the char at an offset, `len_utf8` is its width) and cuts it with `s[from..to]` (a zero-copy view; every cut point is an offset of the walk, so a border of a char). There is no list of one-letter strings (`tx_chars`, `tx_slice` are gone). |
| a column of an error | still a column in LETTERS (`file:line:column` of the Cyrillic files is unchanged): the reader keeps the column step by step with the offset (`tx_cols` = `s[from..to].chars().count()`); never a byte count. `TxEntry.indent` and `shift` are in letters, `TxEntry.colon` and `TxKvHit.colon` are byte offsets in the text of the entry. |
| a letter of a name | `tx_is_letter`: `a-z`, `A-Z`, `_`, and for a char above U+007F `char.is_alphabetic()`; after the first letter also a digit `0-9` and a combining mark (`Mn`, `Mc`: a decomposed `ö` is one name). A number is ASCII digits only. |
| the case | `tx_is_upper`, `tx_is_lower`: `A-Z`, `a-z`, and `char.is_uppercase()`, `is_lowercase()` above U+007F. A type is told from a constant by `looks_like_type`: the first letter is upper case and a lower case letter follows (`Größe`, `Δείγμα`, `Использование` are types; `ÄRGER`, `ΔΕΙΓΜΑ`, `ПРЕДЕЛ` are constants or data); an alphabet without a case (Chinese, Hebrew) is neither upper nor lower, so such a name is never a type. |
| a space | a space, a tab, or `is_whitespace()` above U+007F (a no-break space, an ideographic space): indent, cells, between words. |
| a JSON name | `tx_translit` writes a name that no table has: a Cyrillic letter by the table of letters, any other letter lower case (`Größe` -> `größe`, `Δ` -> `δ`, `数据` stays). The lower case is lossy for a name written in capitals: the JSON has `δειγμα` for `ΔΕΙΓΜΑ`, and the reverse generator writes it back in lower case. |
| the circle | `md -> JSON -> md -> JSON` gives the same JSON on a lambda parameter, a `пусть` name and a datum of the author in any of these alphabets (`src/machine_text_unicode`), and on a machine whose states have Greek, German or Chinese names. |

What did not change: the data, the types and the parties of a machine still take their JSON names from the dictionary or from a Latin name written next to them (`### ЖДАТЬ — обращение (Wait)`, section 1a); the keywords of the structure are the table of words. The time of the translation of the sample of the agent step (30 KB) fell from about 1.2 s to about 0.45 s (the one-letter strings were the cost).

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
| `language` | a keyword of the other language, or the header and the line `language` disagree (task 113) |
| `warning` | (only in `warnings`) a paragraph that begins like a key; a line pressed against a table; a declaration outside a block of code; the name of an expansion section that is no included fragment |
| `check` | an issue of `check_machine` (reads against the "Input", writes against the data, classes of the primitives, reachability, exhaustiveness of the ends, `new_id`, a literal outside its set); the message begins with the path in the JSON |

A soft error (an unknown word) does not stop the cell: the translation goes on with the Russian word in its place, so a cell with two unknown words says both. A hard error
(a cell that does not parse) stops that cell only; the other rows are translated.

## The names

`names.tsv` is made from the dictionary by `python scripts/glossary-names.py <state-machine-glossary.md> > src/machine_text/names.tsv`: `kind<TAB>Russian<TAB>English`, kinds `type`,
`case`, `state`, `event`, `method`, `function`, `field`, `data`, `constant`, `variable`, `effect`. A Russian word may have two English ones in two kinds (the datum `расход` is
`transport_usage`, the field `расход` is `usage`, section 2.15 of the dictionary); the translator asks for the kind it needs (a datum, a field, a type, a case, a function).
(An English file reads the same tables with the English word as the key, see "Two languages".) `names_format.tsv` holds what the dictionary does not have: `catalog` (the functions of section 12 of the format as the evaluator names them: `есть` -> `has`), `executor`
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
Task 117 (the reader on byte offsets): `s[a..b]` is a byte slice and a view without a copy (a cut inside a char is the panic "slice splits a UTF-8 codepoint"), `s.len()` is gone (`byte_len()`, `chars().count()`), a char is not an index (`tx_at` decodes it at an offset),
`int as char` is refused (D54; `tx_lower_char` uses `to_ascii_lowercase()`), the methods of `char` from `std.unicode` (`is_alphabetic`, `is_uppercase`, `is_lowercase`, `is_whitespace`, `general_category`) come with `import std.unicode.{GeneralCategory}` (an import by a file of the module, `std.unicode.category.{…}`, does not build: `decode_at` is a function of a neighbour file of the module).
These are rules of the language, not defects, so there is no mark for them; the marks `ORACLE-WORKAROUND(N)` of the files of the task are `git grep ORACLE-WORKAROUND src/machine_text*`.
