# spikes/env: the environment for the product on Nova

A survey, not product code. It answers one question: what of the stack the CrewHarness product needs
(a Nova program, a child process over pipes, an HTTP + WebSocket server, an ACP agent over stdio) works
on **Nova Oracle 0.1.0 on Windows x86_64**, and with which exact commands. Results of the survey: the report of
task 090 (`doc/tasks/090-product-env-spike/`).

| Directory | What it is | Check |
|---|---|---|
| `hello/` | `Hello, Nova!` | run it, exit code 0 |
| `child_echo/` | Nova starts `node child_echo_child.js` through the `Proc` effect, writes two JSON lines to its stdin, reads two replies from its stdout, closes stdin, waits, prints the exit code | the output below |
| `ws_echo/` | Polaris server on `127.0.0.1`: `GET /` (HTML), `GET /health`, WebSocket echo `/ws` | `ws_echo_check.mjs` (Node) |
| `acp/` | `acp_initialize.mjs`: one `initialize` request to `opencode acp` over stdio, no login, no session | exit code 0 and the printed version |
| `repro_mut_binding/` | minimal reproduction of a Polaris documentation example that Oracle 0.1.0 rejects | see "Known problems" |
| `repro_engine/` | minimal reproductions of Oracle 0.1.0 defects found while writing the state machine engine (task 091, items 8-13), its PostgreSQL store (task 098, items 21, 23-25), its alignment to the dictionary (task 102, items 26-28), the expression evaluator of the machines (task 106, items 33-35), the interpreter of a machine that is data (task 107, items 36-39) and the translator of tables (task 108, items 40-41) the agent step as data (task 109, item 42), format 2.7 of the tables (task 110, item 43) and the reverse generator of Alula (task 113, items 44-47), the program `alula` (task 116, items 52-53) and the marks of the workarounds (task 118, items 54-55) | see "Known problems", items 8-55 |
| `repro_acp/` | minimal reproductions of Oracle 0.1.0 defects found while writing the ACP client (task 095) | see "Known problems", items 14-18 and 20 |
| `repro_child_pipes/` | a program: pipes of a child process that now and then do not come back (task 095) | see "Known problems", item 19 |
| `repro_pg_event/` | a user record `Event` next to the driver `postgres.pgnet` (task 098, item 22); needs `nova update` (the driver comes from git) | see "Known problems", item 22 |
| `repro_server/` | the PostgreSQL driver and Polaris in one program; user types named like types of `http` and of the driver (task 099, items 29-30); needs `nova update` | see "Known problems", items 29-30 |
| `repro_stdin_read/` | a program: `Stdin.read` and the worker thread of its fiber (task 099, item 31); `node run.mjs` after `nova build stdin_read.nv` | see "Known problems", item 31 |
| `repro_text_import/` | a program: `import std.text` and a pattern variable `text` of another module (task 099, item 32); `nova build src/text_import.nv` | see "Known problems", item 32 |

Binaries, `target/` and downloaded archives are not committed (`.gitignore`).

## 1. Install Oracle 0.1.0 (no system changes)

Needs: Windows 10/11 x86_64, Clang (LLVM) installed on the machine, Node 22+ (global `WebSocket`), `gh` or `curl`.
Everything below uses PowerShell; the environment variables and `PATH` change for the current session only.

```powershell
# download and verify (SHA-256 must equal the line in SHA256SUMS)
mkdir C:/work/oracle-dl; cd C:/work/oracle-dl
gh release download oracle-v0.1.0 -R nv-lang/nova -p "nova-oracle-0.1.0-windows-x86_64.zip" -p SHA256SUMS
(Get-FileHash nova-oracle-0.1.0-windows-x86_64.zip -Algorithm SHA256).Hash   # compare with the next line
Get-Content SHA256SUMS                                                         # the line for the windows zip
# expected: 54093317b1474028f3e4ef5ace4ac2c59b38dd52074f2668cd425f5e2670141f

# unpack
Expand-Archive nova-oracle-0.1.0-windows-x86_64.zip -DestinationPath C:/work/nova

# every new PowerShell session: dot-source the setup script (the leading dot matters)
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova --version        # nova 0.1.0
```

The archive name in the quickstart on the release tag (`nova-v0.1.0-windows-x64.zip`) is not the real name
(`nova-oracle-0.1.0-windows-x86_64.zip`).

### C compiler

`nova build` picks the compiler itself (`--toolchain auto`). On the survey machine that is **Clang from
`C:\Program Files\LLVM\bin`, which is not in `PATH`** - the compiler found it. Explicitly: `nova build x.nv --toolchain clang`
(or `--clang <path to clang.exe>`). `--toolchain msvc` fails on Oracle 0.1.0, see "Known problems". Whether Clang
alone (without any Visual Studio) can link on a clean machine was not isolated: the survey machine has Visual Studio 2022
Community and Build Tools 2026 installed.

## 2. hello

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
cd C:/work/crew-harness/spikes/env/hello
nova build hello.nv          # hello.exe next to the source
.\hello.exe                  # Hello, Nova!
```

A project needs its own `nova.toml` (`[package] name`, `version`); the module name of a file in the project root equals
the package name. Build time: the first build in a directory also builds libuv into `<project>/target/`
(about 25-40 s), later builds 4-15 s.

## 3. child_echo (child process over pipes)

```powershell
cd C:/work/crew-harness/spikes/env/child_echo
nova build child_echo.nv
.\child_echo.exe             # run from this directory: the child script is found by a relative path
```

Output:

```
echo:{"id":1,"method":"ping"}
echo:{"id":2,"method":"pong"}
child exit code: 0
```

Red check: run it from another directory (the child cannot find its script) - it prints `child exit code: 1`.

## 4. ws_echo (server and WebSocket)

```powershell
cd C:/work/crew-harness/spikes/env/ws_echo
nova update                  # resolves polaris 0.2.4, http 0.2.1, tls 0.2.1, compress 0.1.3 from git into ~/.nova/git
nova build ws_echo.nv
Start-Process .\ws_echo.exe -ArgumentList 18091 -WindowStyle Hidden   # or in a second window: .\ws_echo.exe 18091
node ws_echo_check.mjs 18091 # five PASS lines, ALL PASSED, exit code 0
# open http://127.0.0.1:18091/ in a browser for the page with a working echo form
Stop-Process -Name ws_echo   # stop the server
```

The server binds `127.0.0.1` only; the port is the first argument (default 18091). `nova.lock.toml` in the directory is
the result of `nova update` and equals the pins in the Oracle 0.1.0 release notes. Red check: run `ws_echo_check.mjs`
with no server - `FAIL server not reachable`, exit code 1.

## 5. acp_initialize (agent over stdio)

```powershell
node C:/work/crew-harness/spikes/env/acp/acp_initialize.mjs        # runs `opencode acp`
```

Prints the reply to `initialize`: protocol version 1, `agentInfo`, `agentCapabilities`, `authMethods` (OpenCode 2.0.26
answers in under a second, no account needed). The script runs the agent in an empty temporary directory and kills it.
Another agent: `node acp_initialize.mjs <command> <args...>`.

## All at once

```powershell
powershell -File C:/work/crew-harness/spikes/env/run-checks.ps1 -NovaHome C:/work/nova/nova-oracle-0.1.0-windows-x86_64
```

Builds and checks all four (about 30 s with a warm cache) and prints `ALL STEPS PASSED`.

## Known problems (for the Nova integrator)

1. **`--toolchain msvc` does not build anything**, not even hello:
   `nova build hello/hello.nv --toolchain msvc` -> `error C2099` at generated `hello.c` lines for
   `Nova_const_runtime_fmt_buf_FLOAT_POW5_INV_BITCOUNT` / `..._FLOAT_POW5_BITCOUNT`: a `static const nova_int` initialised
   from another `static const` (`(A) - 64`), which C accepts only as a Clang/GCC extension. `--toolchain clang` (and `auto`,
   which picks Clang here) works.
2. **Polaris docs and example 08 do not compile.** `docs/websocket.md` and `examples/08-websocket-echo` write
   `mut w = sock` and then `w.close(...)`; Oracle 0.1.0 rejects it with `E_VIEW_BINDING_FORBIDDEN` and `D157-consume-via-view`.
   The accepted form is `consume w = sock`. Reproduction: `cd repro_mut_binding; nova check repro_mut_binding.nv`
   (after `nova update`).
3. **The quickstart does not match the release**: archive name (see above).
4. `setup-env.ps1` prints non-ASCII text in Windows PowerShell 5.1 as mojibake (the file is UTF-8 without BOM).
5. `nova check`/`build` print dozens of lint warnings from dependency packages (`compress`, `[new-then-cap]`), which hides real
   errors in the output; filter the output with `Select-String` as `run-checks.ps1` does.
6. The runtime archive cache is written one level **above** the unpacked folder (`C:/work/nova/target/`), and libuv is rebuilt
   in every project's `target/`.
7. Not Nova: on Windows Node 24, `process.exit()` right after closing a WebSocket aborts with a libuv assertion
   (`UV_HANDLE_CLOSING`, `async.c:76`, exit code `-1073740791`); `ws_echo_check.mjs` sets `process.exitCode` instead.

Found by task 091 (the state machine engine, `src/engine/`); the reproductions are in `repro_engine/`, one directory
per defect under `src/`, each a complete test file that must PASS and does not on Oracle 0.1.0. Run one with
`cd repro_engine; nova test src/<name>`; `nova test src` runs all of them and prints one FAIL per defect:

8. **`enum_str_payload`**: a generic sum type with a `str` variant (`type Output[I] enum | Send(I) | Log(str)`) does not
   compile: the constructor of `Log` is called with `void *` instead of `nova_str`. A record payload or a non-generic enum is fine.
9. **`prelude_outcome`** (with the helper module `prelude_outcome_def`): a user type named like a prelude type (`Outcome`,
   the prelude has `Outcome[T]`) passes the checker and breaks the C of the importing module (`redefinition of 'Nova_Outcome'`).
   The checker should report the clash; the engine calls its type `Response`.
10. **`nested_generic_pattern`**: the nested pattern `Some(Answer(reply))` over a generic payload binds `reply` to a NULL
    pointer in the C (`*(nova_str*)(NULL)`), the program does not link (`undefined symbol: Nova_str_method_eq`). Two nested
    `match`es, one level each, work.
11. **`protocol_typed_field`**: a record field whose type is a protocol cannot be called through (`e.machine.initial()`): the
    C passes a `NovaBox_Machine` where the method wants the concrete struct. A record generic over the machine type
    (`Engine[M]`, `M Machine`) works and is what the engine uses.
12. **`generic_protocol_inference`**: a generic function bounded by a protocol with two type parameters (`M Machine[S, B]`),
    called with `S`, `B` to be inferred, generates C with an undeclared variable (`use of undeclared identifier 'r'`).
13. **`generic_protocol_one_param`**: the same with one type parameter (`M Machine[S]`, `S` a sum type). The engine therefore
    uses a protocol without type parameters over concrete types, and the machine state crosses it as encoded text.
    **Task 102 found the way round (item 26): written out, the type arguments compile; the engine now has a typed state.**

Two more observed while writing the engine and not reduced to a reproduction: `Some(Answer(...))` returned from a method of a
generic record as `Option[Response[str]]` once produced C with the inner enum without its type argument (`returning
'NovaOpt_Nova_Response_p' from a function with incompatible result type`; binding the enum with an explicit type first,
`ro response Response[str] = Answer(...)`, fixed it), and an anonymous record literal of a generic record as the argument of
`push` (`v.push({ id, input })` with `Request[str]`) was rejected by the code generator with `anonymous record literal without
spread not supported in codegen` (a function returning the record fixed it).

Found by task 095 (the ACP client, `src/acp/`, and the file handlers, `src/storage/`); the reproductions are in `repro_acp/`
(the same form as `repro_engine/`: one directory per defect under `src/`, a test file that must PASS and does not):

14. **`user_output_vs_std_os`**: a user type named `Output` (the engine had one) breaks the C (`field has incomplete type
    'NovaValue_Output'`) as soon as a module of the compile unit imports `std.os`, whose `Output` is the result of
    `Command.output()`. The checker says nothing. The engine type is now `StepOutput`.
15. **`char_param_str_literal`**: `trim_end_matches` takes a `char`. A one-character string literal (`"\r"`) is refused by the checker for a plain `str` receiver, but when the
    receiver is the loop variable of `for part in text.split(...)` it passes the checker and the C gets a `nova_str` for a `nova_char`. `strip_suffix` compiles.
16. **`fluent_assign_back`**: the setters of `Command` change it in place and return it (`-> @`); `command = command.arg(a)`
    does not compile (a pointer assigned to a value in the C). A statement `command.arg(a)` works.
17. **`atomic_in_record_copy`**: an `AtomicInt` put into a record is a copy of the variable; a store through the variable is not seen through the
    field. A value that a fiber and the holder of a record share must be a channel (`Chan[int]`, a reference).
18. **`consume_capture_vs_field`**: the name of a `consume` binding captured by a fiber body is a C macro; a field with the same name used in
    the body (`done.tx` in `spawn consume tx { ... }`) is rewritten by the preprocessor and the C does not compile. Rename the binding.
19. **`repro_child_pipes`** (a program, not a test): the pipes of a child process now and then do not come back. A write to the stdin of a
    child parks and never returns - neither when the child dies, nor when a `supervised(timeout:)` around it expires (a cancel of a
    `spawn`ed scope does end a write that is merely blocked on a full pipe); a fiber started with `detach` is not seen again; a binary that
    has finished its tests does not exit (the runtime prints `NOVA_RUNTIME_DUMP reason=pre-exit-drain-10s-remote-1` after 10 s and waits for
    ever). It shows up about once in 400-3000 starts of a child, much oftener when the machine is busy and when the fibers are `detach`ed
    one by one. In the ACP client what helped: all the fibers of a client in one `supervised` scope of a detached keeper fiber, the writer in a scope
    that can be cancelled, and a `close()` that waits for the fibers to end (100 runs of the 40-process test binary in a row, none hung; before,
    about one in twenty).
20. **`output_over_4k`**: a test binary blocks on its stdout when its lines (`  PASS: <name>` per test) come to more than 4096 bytes and nobody reads
    the pipe. `nova test` of one unit reads it; `nova test <dir>` over several units that run at once did not, and killed the idle binary after
    about 70 s (`TIMEOUT`). Keep the output of a unit under 4 KB: split it, shorten the names.

Also met in task 095 and not reduced: `exists` is a reserved word (a function of that name is a syntax error); the names of
functions are one namespace per folder, so the peer test files of a module cannot declare a helper twice; a test that fails
before it closes its ACP client leaves the agent process alive and `nova test` then waits for the pipes of that process.

Found by task 098 (the PostgreSQL store, `src/pg*`); the reproductions are in `repro_engine/src/` (items 21, 23, 24, 25) and
`repro_pg_event/` (item 22), run the same way:

21. **`std_os_output`** (with the helper module `std_os_output_def`): a user enum named `Output` (the engine has one) in the same
    program as `std.os`, which exports a value type `Output`. The compiler takes the std type for the user's one: `Output.Log(...)`
    is E_NO_STATIC_METHOD ("declared in this module and has no static method `Log`"); in the real engine with its peers the same
    clash reached the C compiler (`returning 'Nova_Output *' from a function with incompatible result type 'NovaValue_Output'`).
    Any import of `std.os` (even for `env`) is enough. Task 095 renames the engine's type to `StepOutput`; the modules of task 098
    keep `std.os` out of every module that holds the engine until then.
22. **`repro_pg_event`**: a user record named `Event` (the engine has one) in the same program as `postgres.pgnet` of the driver
    nova-postgres: the driver's own file `pgnet/listener.nv` (`ListenerMsg.Event { event: ... }`) is read as a record literal
    of the user's `Event`, E_MISSING_FIELD_IN_LITERAL in a file of the foreign package. A variant name and an unrelated record
    name share one table. Task 098 does not import `pgnet`; it repeats its socket loop over `postgres.Session`.
23. **`handler_op_panic`**: the body of an operation of an effect handler that is only `panic(...)`, for an operation that returns
    a value (`Option[int]`): the C returns `(nova_int)0` from a function that returns the option (`returning 'nova_int' from a
    function with incompatible result type 'NovaOpt_nova_int'`). A `panic` in a `match` arm, or after another statement, is fine.
24. **`handler_op_vec_new`**: `return []int.new()` as a statement in the body of a handler operation: the generated C writes
    `ctx->cap = cap` for a variable `cap` that does not exist (`use of undeclared identifier 'cap'`). `mut out = []int.new()` and
    then `out` compiles.
25. **`nested_module`**: a module in a folder two levels under the source root (`src/nested_module/inner/inner.nv`, no `.nv` in the
    middle folder), declared as the path from the source root with the package prefix: E_D78_MODULE_PATH_MISMATCH although the
    "expected (rev-1 legacy)" text printed by the compiler equals the declared one.

Found by task 102 (the engine aligned to the dictionary of the methodology, version 6); the reproductions are in `repro_engine/src/`:

26. **`typed_state_explicit`** (a working sample, PASS): the defects of items 12 and 13 are in the INFERENCE of the type arguments. With the arguments of the free
    functions written out (`start_engine[ChatState, ChatSession](...)`, `resume_engine[ChatState, ChatSession](...)`) the protocol `Machine[S]`, the records
    `Engine[M, S]` and `EngineState[S]` with a sum type `S` that has payloads, `Transition[S]` and a protocol parameter `mut environment Environment` all compile and
    run; methods of a generic record need no arguments (`e.on_arrival(...)`). The engine of the product uses this form since task 102 (the state is typed, encoded
    only at the border of the snapshot). Parsing detail met on the way: a record literal in the head of a `match` (`match f[A, B](Chat { ... }) { ... }`) is a
    syntax error (`expected ')', got '{'`), a name bound before the `match` works.
27. **`option_try_generic_enum`**: the operator `?` on an `Option` whose payload is a sum type, in a generic function instantiated with that type, writes the local
    with the type name `Nova_Mode_p`, which does not exist (`unknown type name`, then pointer/value mismatches). `match value { None => ..., Some(inner) => ... }` is
    fine; the engine's `decode_snapshot` uses it.

28. **`import_missing_name`** (the test PASSES, and it must not): `import m.{Name}` of a name that `m` does not export is accepted. After a rename the old name
    stays in the import lists and the build is green; a USE of the old name is what turns it red. A red probe of a rename puts the old name at a use.

The clash of item 22 is gone from the engine's side: its type `Event` is `Incoming` since task 102 (the driver's `ListenerMsg.Event` stays).

Also met in task 098, without a reproduction: `nova test` stops a unit that runs longer than 60 seconds (`--timeout`, the
default) and prints only `TIMEOUT`, with no sign of which test is slow; a SCRAM login on the unoptimized build costs about a
quarter of a second (4096 rounds of HMAC in Nova), so a test suite that connects hundreds of times must use md5 logins in its
temporary server or `--mode release`. `NOVA_DEBUG_RUN_DUMP=1` did not expand the 600-character error text of `nova test` here;
`nova check <dir>` prints the whole text of a type error.

Found by task 099 (the session server, `src/server/`); the reproductions are in `repro_server/` (items 29 and 30, `nova update` first, then `nova test src/<name>`),
`repro_stdin_read/` (31) and `repro_text_import/` (32):

29. **`user_request_vs_http`, `user_session_vs_postgres`**: the table of type names is one for the whole program, **dependencies included**. A user generic record `Request[T]`
    (the engine had one) next to `http` (every program with Polaris has it) is taken for the `consume` record `Request` of `http`: `E_CONSUME_KEYWORD_MISSING` on a plain binding,
    `E7310` "type `Request` is not generic" where the user's type is spelled `Request[str]`; `Response[R]` the same way. A user record `Session` next to the driver nova-postgres,
    which has its own `Session`, stops the driver's own file (`E_MISSING_FIELD_IN_LITERAL`). The engine types are now `PartyRequest` and `PartyResponse`, the record of the hub is
    `Dialog`. Same family as items 9, 14, 21 and 22 (and 28 of task 102); the checker does not say that two types of one name exist.
30. **`pg_polaris_message`**: the driver nova-postgres and Polaris cannot be in one program. The driver has a variant `DecodeOutcome.Message { msg, consumed }`, Polaris has the type
    `Message` (`polaris.ws`); a variant name and a type name share one table, and the driver's file `decode.nv:107` fails (`E7301`). Each package builds alone. The session server is
    therefore two programs, the front (Polaris) and the hub (the driver), that talk by lines over pipes.
31. **`repro_stdin_read`** (a program): (a) `Stdin.read(buf)` is `fread` and returns only when `buf` is FULL or at the end of the stream, so a buffer of one byte is the only way to read a line
    that arrives now; (b) the call waits in C on the worker thread of the fiber that made it, and the fibers queued on that worker do not run until a byte (or the end) comes: with 16
    workers about one new fiber of sixteen starts late, in the hub "the fourth agent process starts after seconds" (here 282 of 300 short fibers finished in 2 s). The cure: the read
    in a `#blocking fn` (the form `blocking { }` is removed, D172); 300 of 300.
32. **`repro_text_import`** (a program): `import std.text` in one module makes a variable named `text`, bound by a record pattern (`Garbage { text } => text.byte_len()`) in another module,
    mean the module: `E7401` no function `byte_len` in module `text`. The import is needed in `nova build` for `[]str.join` (a `nova test` build has it already, so tests do not show it);
    without it `join` is "no field or method `join` on type `Vec`", or, with `std.fs.Path` imported, `E_RECV_METHOD_MISMATCH` (it resolves to `Path.join`).

Also met in task 099, without a reproduction: the variables of the test files of an imported module reach the standard library. `EmbeddedDir.merge` (prelude) has `ro b = other.entries()`;
with a test peer of the module `pgstore` that had `fn same_entries(a []JournalEntry, b []JournalEntry)` in the program, the C of `merge` indexed `b[j]` as a `JournalEntry` (`no member named
'path' in 'struct Nova_JournalEntry'`) and every program that imported `pgstore` stopped; the parameters and variables named `a` and `b` of the test files of the imported modules are now
`first` and `second`, and the method `MemoryWorld.entries` is `journal_entries` (the same name as `EmbeddedDir.entries`). A minimal copy of the shape (`fn same(a []Item, b []Item)`
and `EmbeddedDir.merge` in one test) compiled. Also: `detach` and `blocking` are keywords (a method or a parameter of that name is a syntax error); an unconsumed `Result` value cannot be rebound
as `mut` (`E_READONLY_COERCE`: a record that holds it works); assigning to a `mut` parameter of a heap type changes only the local name (a warning, by design); a module two folders
under the source root (item 25) compiles when declared WITHOUT the package prefix (`module server.front` in `src/server/front/`) and is imported with it (`crew_harness.server.front`);
Polaris 0.2.4: the stream that `ServerResponse.upgrade` gives its hook is shared with the connection loop, so `TcpStream.into_split()` panics ("live share()-copies"), and a WebSocket that is
read and written by two fibers must use `share()`; `println` was "undefined identifier" in one module of a program that also imported `std.text`, not reduced (the hub writes to `stdout()` itself).

Found by task 106 (the expression evaluator, `src/machine/`); the reproductions are in `repro_engine/src/`, run the same way:

33. **`for_in_enum_literal`**: `for c in [Pure, Writing]`, an array literal whose items are variants of a user enum without payload, does not compile:
    CODEGEN-FAIL "for-in: cannot resolve iterator type for expression of C-type 'nova_unit'". A function that returns the list (`-> []Class`) and is
    iterated is fine, so is a literal list of texts or of ints.
34. **`option_enum_named_variants`**: an enum with a variant with named fields (`FieldOf { target, name }`) and another variant that holds a list of records with
    an `Option[ThatEnum]` field, the record declared BEFORE the enum, breaks the C: the generated equality reads the payload as `payload.FieldOf._0` while the
    struct has the members `target`, `name` (CC-FAIL "no member named '_0'"). The record declared after the enum compiles; so does `[]ThatEnum` instead of the option.
35. **`result_display`**: a `Result` in an interpolation (`"${r}"`, `r = "5".to_int()`) passes the checker and fails at link time with
    `undefined symbol: Nova_Result_method_display`. Match on it.

Also met in task 106, without a reproduction (rules of the language that cost a compile each): `ref` is a keyword (a function named `ref` is a syntax error); a string has no `+`
(`E_STR_CONCAT_PLUS`, use `"${a}${b}"`); `str.len()` is gone (`byte_len()`, `chars().count()`); `mut x = ro_value` of a parameter or of a `ro` binding is `E_READONLY_COERCE`
(declare the first one `mut`, or build the value in place); returning a `ro` parameter needs a copy (`E_READONLY_COERCE`); a record literal after `->` of the same record type
is `redundant type prefix` (write `=> { ... }`); a match arm that is an assignment (`Ok(v) => x = v`) followed by another arm on the next line is read as one arm
(`E_MATCH_ARM_SEP_MISSING`: put the assignment in braces); a `consume` `StringBuilder` must end with `into_str()`; a struct-style variant in a pattern is `Name { a, b }`;
`nova test src/<dir>` makes ONE unit per folder (the module of the folder), so a module of 160 tests prints one `  PASS: <name>` line each and the whole output must stay
under 4 KB (item 20): the tests of `src/machine/` have names of 10-20 letters for that reason.

Found by task 107 (the interpreter of a machine that is data, `src/machine_table/`, `src/machine_run/`, `src/machine_chat/`); the reproductions are in `repro_engine/src/`, run the same way:

36. **`for_in_record_list_literal`**: `for s in [make(1), make(2)]`, an array literal whose items are records made by calls, does not compile: CODEGEN-FAIL "for-in: cannot resolve iterator type for expression of
    C-type 'nova_unit'" (the family of item 29). Bind the list first (`ro all = [make(1), make(2)]`, `for s in all`).
37. **`type_named_like_variant`** (with the helper module `type_named_like_variant_def`): a user type named like a CASE of an enum of another module (`type Reading enum | ...` here, `Class.Reading` there) makes
    every use of that case in the other module "E7330 `Reading` is a sum type, not a value" - the error is reported in a file the user did not touch (type names and case names share one table of the program).
38. **`user_type_next`**: a user record named `Next` breaks the compile of the STANDARD library (`E_BOUND_NOT_PROTOCOL` at `std/src/collections/vec_iter/core.nv`: its protocol `Next` is hidden by the record); the
    clash is not reported at the declaration. The same family: a user record `Slot` clashes with the one of `std/src/collections/hash_map` (`E7310 type Slot is not generic`), `Output` (items 14, 21).
39. **`same_type_name_two_modules`** (with the helper module `same_type_name_def`): two modules of one program that declare a record of the same name (`Pair`) are not isolated: a literal of the imported
    module's `Pair { name, value }` is checked against the fields of the importer's `Pair` - `E_MISSING_FIELD_IN_LITERAL` in the file of the imported module. Type names are global to the program (the units of
    task 107 keep the names of their types unique: `ReqField`, `Goto`, `EventRead`).

Also met in task 107, without a reproduction: (a) `embed_dir("dir")` and `embed_str("file")` read relative to the source file (a missing directory is `E_EMBED_DIR_NOT_FOUND`) and bytes come back through
`data.to_str_lossy()`; a directory of files cannot be listed by a name that is not embedded, so `src/machine/data.nv` lists its files; (b) once a program embeds a file, the prelude method
`EmbeddedDir.merge` is compiled into it and its local `b` took the type of a PARAMETER named `b` of another function (`compare_fields(a, b []RecordField)`; later a local `b []Binding`): CC-FAIL "no member
named 'path' in 'struct Nova_RecordField'". It did not reproduce in a small program; renaming every `a`, `b` of a list type fixed it; (c) a folder one level under `src/` next to another (`src/machine_run`
beside `src/machine`) is a separate module and unit, and a module that imports another does NOT compile the tests of the imported one into its unit; a module in a folder under a module's folder is still
refused (item 25; `module lib.sub` is accepted by `nova test` but cannot be imported); (d) `mut x = p.field` of a `ro` parameter that holds text or lists is `E_READONLY_COERCE` (restructure with `ro` and
`match`, or recursion instead of a loop that reassigns a copy of a parameter); a record literal in the argument of `match f(R { ... })` is a syntax error; a match arm that is an assignment needs braces; a test
that fails inside a loop prints one line, and the text of a failure is cut to 600 characters (read the full list from the test binary with `--keep-artifacts`); (e) `std.text` must be imported for `[]str.join`.

Found by task 108 (the translator of tables in Russian, `src/machine_text/`, and its command `src/machine_translate.nv`); the reproductions are in `repro_engine/src/`, run the same way:

40. **`user_type_child`**: a user record named `Child` (the core of the machines had one, the node of a tree of an expression) next to any import of `std.os`, which has the consume record `Child` of a child
    process, breaks the compile of the program: `E_CONSUME_KEYWORD_MISSING` ("binding `c` holds a consume-required instance of type `Child`") in the reproduction, `E_MISSING_FIELD_IN_LITERAL` and
    `E_FIELD_MODULE_PRIVATE` in `std/src/os/proc.nv` when the program is built. The checker does not report the clash at the declaration (the family of items 9, 14, 21, 22, 29, 37-39). The tests of the core
    did not import `std.os`, so they passed; `nova build src/machine_translate.nv` (it needs `std.os.args`) failed. The record is `ExprChild` now.
41. **`same_name_other_type`**: a parameter named `list` of the type `[]Pair` in one function and a name `list` bound by a pattern (`Err(list)`) to a `[]Problem` in a test of the same module: the generated C reads the
    field of the second as a field of the first (`no member named 'code' in 'struct Nova_Pair'`). The two names are in different functions, the types are different and not generic. A different name
    (`problems`) compiles. The translator and its tests give every list a name of its own by its type (`problems`, `pairs_in`, `errors_in`, `tokens`, `found`).

Also met in task 108, without a reproduction: (a) in the file of a program `import std.fs.{...}` has to come BEFORE the imports of the modules of the product, or `nova build` stops with `E_RECV_METHOD_MISMATCH` (`.join` on a `Vec` resolves to
`Path.join` although every module imports `std.text`; item 32 is the same family: which `join` a module sees depends on the imports of the program, and on their order); (b) a string has no `+` (`E_STR_CONCAT_PLUS`), a raw newline in `"..."` is refused (`E_STR_RAW_NEWLINE`, D467: end
the line with `\` or use a backtick string, which does not process escapes and keeps `${...}`), `str.trim` is `trim_ascii`, `str.find` takes the needle only, a type name cannot be written with its module
(`crew_harness.machine.Value` as a parameter type is a CC-FAIL: import the name); (c) `mut x = p` with `p` a parameter or a pattern binding of a record/enum that holds text or lists is `E_READONLY_COERCE`, so a copy is built in place
(`sc_clone`, `p_copy` of the translator), and a `mut` local of an enum is built by recursion instead of a loop (`ex_postfix`); (d) `Sha256.hash_str(bytes)` gives the hex text, `Uuid.v7()` under `with Time = th.fixed_ms(n), Random = th.seeded(k) { ... }`
(`std.testing.handlers`) is deterministic and works in product code, not only in tests; (e) the failures of a unit are shown by `nova test` cut to 600 characters (the last four of them): the whole list is the output of the test
binary (`--keep-artifacts`, the directory `nova_tests-<n>` in the temporary folder).

Found by task 109 (the agent step as a machine that is data, `src/machine_run/`, `src/machine_text/`, `src/machine_text_eq/`); the reproduction is in `repro_engine/src/`, run the same way:

42. **`split_index`**: indexing the result of `str.split(sep)` (`parts[0]`, the result is an iterator) passes the checker and the code generator stops with `[INTERNAL-PANIC] [E_CODEGEN_TYPE_UNKNOWN] Index element type unknown for
    obj_ty="NovaValue_SplitIter"` with the place of the generated expression, not of the source line. Read it with `for part in text.split(sep)` and push to a list.

Also met in task 109, without a reproduction: (a) `import std.fs.{...}` anywhere in a test unit (a debug test that wrote a file) makes every `.join(...)` on a `[]str` of the whole unit `E_RECV_METHOD_MISMATCH` (it resolves to `Path.join`;
the family of item 32): keep `std.fs` out of units that join lists, or write the file from a program; (b) a unit whose tests run 75 scenarios several times each (the interpreter and a 46 KB machine built for each run) is killed by `nova test` after
about 100 seconds (`TIMEOUT`): build the machine once per test, run the scenarios once per test; (c) `NOVA_DEBUG_RUN_DUMP=1` does not lengthen the failure text of `nova test` (cut to 600 characters) in this build either: print the tail
of a long text with a slice.

Found by task 110 (format 2.7 of the tables, `src/machine_text*`, `src/machine_run`, `src/machine_agent`); the reproduction is in `repro_engine/src/`, run the same way:

43. **`user_fn_fence`**: a user function named `fence` is generated as the C function `nova_fn_fence`, which the runtime header already declares (an atomic fence with the argument `ord`); the checker does not
    report the clash at the declaration, the C compiler stops: "conflicting types for `nova_fn_fence`", "too few arguments to function call, single argument `ord` was not specified" (CC-FAIL; the family of items 9, 14, 21, 29,
    37-40: a name of the program against a name of the runtime). The helper of the tests that returned three backticks is `ticks` now.

Also met in task 110, without a reproduction: (a) `NOVA_DEBUG_RUN_DUMP=1` DOES help (the note (c) of task 109 above is wrong in this: it prints the end of the whole output of the test binary - every `FAIL: <name> - <text>` line of the tail and the line `N/M passed` - 
while the summary of `nova test` keeps the last four failures cut to 600 characters); only the tail comes (about 50 lines), so the red tests of the first files of a unit are seen as `N/M passed` only; (b) `nova test <dir> --filter <text>` filters UNITS by their display name 
(`src/machine_text_fmt/expand_test`), not the tests of a unit: `--filter "ex tail"` runs nothing (`PASS: 0  FAIL: 0`); (c) a raw string in backticks cannot hold a backtick (it ends the string), so a test that needs a block of code (three backticks) builds it by a helper 
and `${...}` inside the raw string; (d) a translation of a machine with the checks of the table costs about 0.15 s for a machine of 3 KB and about 1 s for the sample of 46 KB (the table of names is read each time), so the proofs of the translator are split by folders (`src/machine_text_fmt` beside `src/machine_text`: 64 tests, about 45 s with the build) and a test translates a text once; the output of a unit must stay under 4 KB anyway (item 20); 
(e) in a test of the interpreter a record literal as an argument of `match f(R { ... })` is a syntax error (bind it with `ro` first), and a record literal after `=>` of its own type is a "redundant type prefix" (items of task 106 again).

Found by task 113 (two languages of Alula and the reverse generator, `src/machine_text*`); the reproduction is in `repro_engine/src/`, run the same way:

44. **`record_after_enum_list`**: a sum type with a variant that holds a list of a record, the record declared AFTER the sum type and holding the sum type (`type Js enum | JsObj([]Pair)`, then `type Pair { key str, value Js }`), breaks the C of a `match`
    on it: the payload bound by the pattern (`JsObj(pairs)`) is a `Vec<nova_int>`, and `for q in pairs { q.key }` is CC-FAIL "member reference base type 'nova_int' is not a structure or union". The record declared BEFORE the sum type compiles (the `TxJ` and `TxKV` of the
    translator are written so); item 34 is the same family from the other side.

45. **`mut_of_ro_param`**: `mut out = items` with `items` a parameter without `mut` (or a `ro` binding) that holds a list or a text is `E_READONLY_COERCE`; a copy has to be built by hand in a loop. The translator does it in `sc_clone`, `p_copy` (task 108),
    `rn_copy`, `rn_with` (task 113). A plain copy of a value would do.
46. **`assign_mut_param`**: assigning a new list to a `mut` PARAMETER of a heap type (`items = []str.new()`) changes only the local name; the caller's list stays as it was (the compiler warns). The state of the classification of the lines
    keeps its lists in the fields of a `mut` record and assigns a field (`TxClsState` in `cls_flush`).
47. **`leak_ab`** (a working sample, PASS; the defect is not reduced): a unit that imports a module whose test files have a function with the parameters `a`, `b` of a record type gets the C of the prelude method `EmbeddedDir.merge` wrong (`no member named 'path' in 'struct Nova_StepTrace'`),
    when the program embeds a file; seen in the unit `src/machine_text_render`, which imports `machine_text_eq` (its `eq_test.nv` had `trace_diff(a StepTrace, b StepTrace)`; the parameters are `ta`, `tb` now). The family of item (b) of task 107 and of item 32/35 notes of task 099. Rename the parameters.

Also met in task 113, without a reproduction: (a) `nova test` kills a unit after 96-151 s on a loaded machine (`TIMEOUT ... killed after ...ms`) although the tests are right: `--timeout 600` lets the unit finish (the unit `machine_text_eq` takes 59 s on an empty machine and 150 s on a busy one);
(b) on Windows `Output.write` of a program turns every `\n` into `\r\n` when the output goes into a pipe or a file, so the function `render` returns LF and the tests compare LF, and the command writes what it gets; (c) `str.find` and slicing work in bytes, so `"| — |"` is seven bytes, not five; (d) a string has no `+` (`"${a}${b}"`).

Found by task 116 (the program `alula`, `src/alula.nv`, `src/alula_cli/`); the reproductions are in `repro_engine/src/`, run the same way:

52. **`for_in_list_of_lists`**: `for item in [["a"], ["b", "c"]]`, an array literal whose items are arrays, does not compile: CODEGEN-FAIL "for-in: cannot resolve iterator type for expression of C-type nova_unit" (the family of items 29 and 36); in a unit that
    imports `std.encoding.json` the loop is read as an iteration over a JSON object and the C stops with "passing _NovaTuple_2_..._Nova_JsonValue_p to parameter of incompatible type Nova_Vec____nova_str *". Bind the list first (`ro all = [["a"], ["b", "c"]]`, `for item in all`).
53. **`same_fn_name_two_modules`** (with the helper module `same_fn_name_def`): two modules of one program that each declare a PRIVATE function of the same name are not isolated under `--strict-effects`: the call inside one module is checked against the OTHER module's function, 
    "E_UNDECLARED_TRANSITIVE_EFFECT: call to `scan` requires effect `Fs`" at a line of a file that did not change (without the flag the program builds and runs). Run `nova test src/same_fn_name_two_modules --strict-effects`. The family of items 37-39 for functions; rename one of them.

Also met in task 116, without a reproduction: (a) a program file and a folder of the same name make one module name twice: `src/alula.nv` (`module crew_harness.alula`) beside the folder `src/alula/` stops with "ambiguous module: both single-file and folder-module exist" (D29 rev-3); the commands live in `src/alula_cli/`; (b) `exists` is a reserved word: a local or a field named `exists` is "expected identifier, got ="; (c) the user type `Outcome` of a module (item 9) passed the tests of the unit and broke only `nova build` of the program, so build the program once after a new type is named; (d) the memory file system of `std.fs` (`mock_fs`) makes only the LAST folder of `create_dir_all` and `try_exists` of an upper folder that holds a folder only is false, `read_dir` of it works: the tests make every folder above a file; a write into a missing folder succeeds in it (`MemFs.fail_writes()` makes the write fail), the real file system refuses it; (e) in a unit the FIRST file (by name) has to import `std.fs` before every other import, or `.join` on a `[]str` is `E_RECV_METHOD_MISMATCH` (the note (a) of task 109 and item 32: the order of the imports of the unit, not only of the program); (f) `Path.from_bytes` takes the style of the host (Windows), `Path.posix(...)` the style of the memory file system: both name the same file there when the separator is `/`; (g) a program is tested without a process: `execute()` with `Os Fs Io` runs under `with Os = mock_os(os), Fs = mock_fs(fs), Io = mock_io(cap)` and `exit_process` of the entry point stays out of it.

The places in the code that go round an item carry the mark `// ORACLE-WORKAROUND(N): what is gone round; how to simplify when item N is fixed`; `git grep ORACLE-WORKAROUND` finds them.

Found by task 114 (the session server runs on Alula, `src/server/`, `src/machine_dialog*`); the reproductions are in `repro_server/src/` (item 48, `nova update` first) and `repro_engine/src/` (items 49 and 51), run the same way.
Every place of the product that goes round one of these items carries the comment `// ORACLE-WORKAROUND(N): ...` (`git grep ORACLE-WORKAROUND` lists them; the comment says how to simplify the code when the item is fixed):

48. **`user_type_vs_driver_variant`**: a user record `Row` (the row of a table of states of the machines that are data, `src/machine_table`) in the same program as the driver nova-postgres, whose protocol enum has the variant
    `Message.Row { values }`, stops the driver's own file `session.nv` (`E_MISSING_FIELD_IN_LITERAL`: the literal `Row { values }` is read as the user's record). A variant name and a type name share one table (the family of items 29, 30, 37).
    The record is `TableRow` now; the hub is the first program that links the driver and the machines that are data.
49. **`fn_name_two_modules`**: a PRIVATE generic function `begin[T]` of one module and a function `begin(n int)` of another module of the same program: the call of the second is resolved to the first - "cannot infer
    type argument `T` ... (returned only - turbofish required)". Names of functions are global to the program even when private (the family of items 9, 14, 21, 39, 43). The hub's `begin_engine` is `begin_session_engine` now
    (the interpreter of scenarios `src/machine_run` has a private generic `begin_engine`).
50. **test helper `ev` next to the function `ev`** (no small reproduction; the reproduction is the unit): the test file `src/machine/eval_test.nv` had a helper `ev(e)` and the module has a private `ev(e, env, host, depth)` in
    `eval.nv`. The unit of the module itself passes; the unit `src/server`, which imports `crew_harness.machine` (through `alula.nv`), stopped in C: "conflicting types for `nova_fn_12crew_harness7machine2ev`" (the mangled
    name has no parameters, and the test file of the imported module was compiled into the importer's unit). A small program with the same two functions and an importer PASSES (tried), so the trigger is something more in the graph.
    The helper is `ev_plain` now; to see the defect, rename it back and run `nova test src/server`.
51. **`match_record_literal_arg`**: a record literal inside a list literal (or directly) in the argument of the call that is the scrutinee of a `match` is a syntax error ("expected `,` or `]` in array literal, got `{`"): the parser takes
    the `{` for the block of the `match` (the note (e) of task 110 had the direct form). Bind the value with `ro` (or a function) before the `match`.

Also met in task 114, without a reproduction: (a) a unit that makes a machine that is data for every test (`load_alula_machine_with`: a 4 KB machine and the translation of a table of names) and runs 36 scenarios on two machines is about 42 s; a unit with the
translation of the table (`translate_checked`) and the 37 scenarios is about 45 s: both under the limit of about 100 s, in two units (`src/machine_dialog`, `src/machine_dialog_eq`); (b) the failures of a unit are listed up to 4096 bytes: of 21 tests that went red by one
change of the JSON only 4 were named (see the log of the task).

Also met in task 117 (the reader of Alula on byte offsets and `std.unicode`, `src/machine_text`), without a reproduction because none of it is a defect: (a) `s[a..b]` is a byte slice, a zero-copy view, and a cut inside a char panics ("slice splits a UTF-8 codepoint"), so a reader walks a text by `tx_at(s, offset)` and `char.len_utf8()` and counts a column in letters by `s[from..to].chars().count()`;
(b) `std.unicode` works by the module: `import std.unicode.{GeneralCategory}` (or any name) gives `char.is_alphabetic()`, `is_uppercase()`, `is_lowercase()`, `is_whitespace()`, `general_category()`, `to_lowercase()`; the form `std.unicode.category.{…}` does not build (`decode_at` is a function of a neighbour file of the module), it is a wrong form of the import;
(c) `int as char` is refused (D54), a literal (`0 as char`) is not; `char.to_ascii_lowercase()` does the ASCII case; (d) the text of a failed `nova test` unit keeps only the LAST failures (the unit prints more), the whole list is in the test program: `nova test <unit> --keep-artifacts` leaves it in the temporary folder of the run (a folder `t-…` with `<first test file>.exe` in it), run it there.
The tables of `std.unicode` are built on first touch; the translation of the 30 KB sample is 2.5 times faster all the same (the one-letter strings were the cost).

Found by task 118 (the marks of the workarounds over the whole tree); the reproductions are in `repro_engine/src/`, run the same way. Every place that goes round one of these items is worked round in the code and carries the mark (`git grep ORACLE-WORKAROUND`):

54. **`generic_literal_args`**: a record literal of a generic record with its type arguments written, `Holder[str] { id: "a", input: "b" }`, is a syntax error (E_STMT_SEP_MISSING at the `{`: `Holder[str]` is read as a complete expression). The literal has to be anonymous and typed by its context
    (`ro h Holder[str] = { id: "a", input: "b" }`) or made by a function that returns it. Met in task 091; the engine makes its `PartyRequest[str]` and `Reply[str]` by `request_of` and `reply_of`.
55. **`mock_fs_create_dir_all`**: `create_dir_all("/a/b/c")` on the memory file system (`mock_fs`) makes only the LAST folder: `try_exists("/a/b")` is false afterwards (`read_dir` of it works), the real file system makes every folder above. Met in task 116 (the note (d) of "Also met in task 116");
    the tests of the program `alula` make the folders above a file one by one (`make_parents`).
56. **The stream of the upgrade hook of Polaris 0.2.4** (no reproduction: it needs a connection): the stream that `ServerResponse.upgrade` gives its hook is shared with the connection loop, so `TcpStream.into_split()` panics ("live share()-copies"); a WebSocket that is read and written by two fibers uses `share()`
    (the note of "Also met in task 099"). The front of the session server does it in `src/server/front/front.nv`; to see the panic, replace `share()` there by `into_split()`.
57. **The cost of SCRAM on the unoptimized build** (no reproduction: it needs a PostgreSQL server; the note of "Also met in task 098"): a SCRAM login costs about a quarter of a second (4096 rounds of HMAC in Nova), so the temporary server of the tests (`src/pg/testdb.ps1`) uses md5 logins; the release mode of the build would not need it.

Found by task 119 (the nested machines in the interpreter of Alula, `src/machine_run/nested*.nv`, `src/engine`); the reproduction of item 61 is in `repro_engine/src/`, run the same way:

60. **A protocol method that nothing calls is cut from the program, and the C of the program does not build** (no small reproduction: three attempts at one did not fail; the reproduction is the product: in `src/engine/engine.nv` build the environment with `StepEnvironment.new()` instead of `StepEnvironment.carrying(...)` and run `nova test src/crew_harness.nv`, or `nova build src/alula.nv -o target/alula.exe`). The protocol `Environment` got the method `mut @order_signal(order SignalOrder)`; the only call of it is in the interpreter of Alula, and a program that links the engine but not that call (the hub `src/crew_harness.nv`) stopped in C: "returning 'int' from a function with incompatible result type 'nova_unit'" in the thunk of the vtable (the method itself is not emitted), while `nova test` of the unit that has the call stayed green. Worked round: the engine makes its environment by `StepEnvironment.carrying`, which calls the method, so every program that links the engine has a call site.
61. **`none_arg_generic_option`**: a literal `None` as the argument of a parameter of the type `Option[Wrap[str]]`, where `Wrap` is a generic sum type, is typed `Option[int]` by the code generator, and `Some(Two)` as an `Option` of the sum type without its argument: CC-FAIL "passing 'NovaOpt_nova_int' to parameter of incompatible type 'NovaOpt_Nova_Wrap____nova_str_p'". `None` for `Option[str]` is fine. Bind the value with its type first (`ro nothing Option[Wrap[str]] = None`) and pass the variable. Run `nova test spikes/env/repro_engine/src/none_arg_generic_option`.
62. **`with` is a reserved word**: a variable, a parameter or a field named `with` (the natural name of "the machine with the answers of the host") is "expected identifier, got `with`" (the family of the note (b) of task 116, `exists`). A rule of the language, no workaround in the code: the function is `with_replies`.
126. **`if_none_option_str`**: an `if` whose one branch is `None` and the other `Some` of a text, bound by `ro` without a type (`ro request = if flag { None } else { Some("agent-1") }`), is typed `Option[int]` in the `None` branch and `Option[str]` in the other by the code generator: CC-FAIL "assigning to 'NovaOpt_nova_int' from incompatible type 'NovaOpt_nova_str'". Bind the variable with its type first (`mut request Option[str] = None`) and assign the `Some` in an `if`; worked round in the code (`src/server/words_test.nv`). Run `nova test spikes/env/repro_engine/src/if_none_option_str`.

## Marks of the workarounds

Every place of the product that goes round an item above is marked with a comment (`//` in Nova and Node, `#` in scripts, `<!-- -->` in Markdown):

```
// ORACLE-WORKAROUND(N[, M]): what is gone round; how to simplify when item N is fixed
```

`N` is the number of an item of "Known problems" (the first number is the main one); the text after the colon says what the code does instead of the plain form and what the plain form is, so that the mark alone is the instruction for the cleaning. A workaround that no item names gets an item first (with a reproduction in `repro_*/` when it can be reduced).
A text in prose ("item 29", "the driver has a Session") is not a mark: replace it by the mark.

- Since task 144 the code of the engine, of the machines as data and of the program `alula` (137 marks of 35 items) lives in the package `alula`, which keeps those marks, the notes it needs and the reproductions of its items in its own `spikes/env/` (the numbers are the same). The items stay in this README as the survey; the index says "no workaround in the code" for the items whose places moved there.
- Where to look: `git grep ORACLE-WORKAROUND`; by item and with the line: `python scripts/oracle-workarounds.py --list`; a summary: `python scripts/oracle-workarounds.py`.
- The index: [workarounds.md](workarounds.md) (item, what, the files that go round it, the number of marks); it has no line numbers and is written by `python scripts/oracle-workarounds.py --index`. Items with no mark are listed as "no workaround in the code": a rule of the language, a limit of the tooling, or a defect the code does not meet.
- How to clean: when Nova fixes an item, take its row of the index, open the files, simplify the code as the mark says, remove the mark, run `nova test` (and `--strict-effects`) and rerun `--index`.
- The guard `scripts/guards/check-oracle-workarounds.py` (it runs with the others, `sh scripts/guards/run-all.sh`) fails when a mark has no `(N[, M]...)` or no text after the colon, when an `N` is not an item of this README, when a mark is not in a comment, or when the index differs from what `--index` writes.
  It warns when an item says "worked round in the code" and has no mark. The marks are searched in the tracked files of `src/`, `scripts/` and `spikes/` (not in the plugin `opencode-plugin/`, which is JavaScript).
