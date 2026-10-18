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
| `repro_engine/` | minimal reproductions of six Oracle 0.1.0 defects found while writing the state machine engine (task 091) | see "Known problems", items 8-13 |

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

Two more observed while writing the engine and not reduced to a reproduction: `Some(Answer(...))` returned from a method of a
generic record as `Option[Response[str]]` once produced C with the inner enum without its type argument (`returning
'NovaOpt_Nova_Response_p' from a function with incompatible result type`; binding the enum with an explicit type first,
`ro response Response[str] = Answer(...)`, fixed it), and an anonymous record literal of a generic record as the argument of
`push` (`v.push({ id, input })` with `Request[str]`) was rejected by the code generator with `anonymous record literal without
spread not supported in codegen` (a function returning the record fixed it).
