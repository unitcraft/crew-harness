# acp: the ACP client of the product and the handler of the agent

CrewHarness talks to a coding agent (by default `opencode acp`) through the Agent Client Protocol: JSON-RPC 2.0, one
message per line, over the stdin and stdout of a child process. This directory is the client of that protocol on Nova
(Oracle 0.1.0, Windows, Clang), the real handler of the effect `Link` of the engine (`src/engine/`), the projection
"ACP -> engine event -> page event", and a fake ACP agent for the tests. The file handlers of the effects `Journal` and
`Store` are in `src/storage/`. Task 095 (`doc/tasks/095-acp-client/`); the session server (`src/server/`, task 099) is its user: one client per session, the decisions of the owner through `decide_event`.

The client is part of the product, not of a plugin. It decides nothing: the owner answers a request for permission, the
machine decides what a turn is, the engine writes the journal.

## Build and run the tests

Setup of Oracle 0.1.0 is in [`spikes/env/README.md`](../../spikes/env/README.md), section 1. In PowerShell, from the root of
the repository:

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova test src                        # all units: engine, chat, storage, acp, acp_live (about 40 s)
nova test --strict-effects src       # the same; an effect used without being declared in a signature is an error
nova test src/acp                    # the pure part: JSON-RPC, projection (a few seconds)
nova test src/acp_live               # the handler over the fake agent, the acknowledgement, the engine over files (about 30 s: 40 Node processes)
```

The tests of `src/acp_live` start `node` (a fake agent, `testdata/fake_agent.mjs`; Node 22 or newer) and look for the root
of the repository upward from the working directory (the nearest folder with `nova.toml`). The real `opencode acp` is
tried only when asked: `$env:CREW_REAL_ACP = "1"; nova test src/acp_live` (initialize and session/new, no prompt, so no model is
called and no key or login is needed).

**Two units, short test names: on purpose.** A test binary prints one line per test (`  PASS: <name>`). On Windows a binary whose
lines come to more than 4096 bytes (the pipe buffer) blocks until someone reads its stdout; `nova test` on one unit reads it in time,
but `nova test src` (several units at once) did not, and killed the idle binary after about 70 s (`TIMEOUT`). So the tests are split
in two units (`src/acp` and `src/acp_live`, the live ones cannot be peers of the pure ones) and every unit keeps its lines under
4096 bytes (now: acp 2.2 KB, acp_live 2.0 KB, chat 3.7 KB, storage 1.5 KB, engine 1.1 KB). A new test in `src/chat` has to
have a short name; to measure: start the test binary kept by `--keep-artifacts` with its stdout piped and unread
(see `spikes/env/repro_acp/src/output_over_4k`).

## Layout

| File | What it is |
|---|---|
| `jsonrpc.nv` | `RpcMessage` (call, notification, result, failure, garbage), `parse_rpc`, `rpc_request_line`, `rpc_notification_line`, `rpc_result_line`, `rpc_error_line`, `LineSplitter` (bytes -> lines) |
| `project.nv` | the projection: `project_update`, `project_permission`, `progress_event`, `stop_event`, `refused_event`, `tool_kind`, `rpc_key` (ACP -> engine) and `page_event` (engine -> page) |
| `link.nv` | `connect`: the keeper fiber, the child process and the fibers around it (stdout reader, stderr reader, stdin writer, watcher of the process), `AgentLink` (three channels) |
| `client.nv` | `AcpConfig`, `AcpClient` (the handshake, the queue of prompts, permissions, the inbox with acknowledgement), `open_client`, `acp_link` (the handler of `Link`), `decide`, `decide_event`, `close` |
| `testdata/fake_agent.mjs` | the fake ACP agent (Node): the scenarios are chosen by the first word of the prompt |
| `*_test.nv` | 45 checks: `jsonrpc_test` (18), `project_test` (27) |
| `../acp_live/*_test.nv` | 37 checks, the unit `crew_harness.acp_live` (it imports `crew_harness.acp`): `client_test` (26, the handler over the fake agent), `ack_test` (4), `e2e_test` (6, engine + chat + files + ACP), `real_agent_test` (1, runs for real only with `CREW_REAL_ACP=1`) |

The `.nv` files of this folder are one module `crew_harness.acp` (a folder is a module, the tests are its peers). The engine and the
storage are imported (`crew_harness.engine`, `crew_harness.storage`); the engine does not know this module.

## How the client lives

```
engine.pump ──> Link.receive() ──> client.poll() ──try_recv──> [inbound channel] <── reader fiber  <── stdout of the agent
engine.dispatch ──> Link.send() ──> client.queue ──try_send──> [outgoing channel] ──> writer fiber ──> stdin of the agent
                                                                [inbound channel] <── stderr fiber, watcher fiber (exit)
```

A read of a process pipe parks the fiber that does it, and `Link.receive` must not wait; so fibers own the pipes and the `Child`
and the program side calls only `try_send` and `try_recv` of channels. Reading and writing never wait for each other. All the
fibers of one client (stdout reader, stderr reader, stdin writer, watcher of the process) live in ONE `supervised` scope of a
detached "keeper" fiber that also starts the process (`link.nv`). The writer has a scope of its own that the watcher cancels when
a write lasts more than 10 s or when the process is gone. Nothing runs by itself: `send`, `receive`, `cancel`, `ack` and `poll`
do the work, driven by the pump of the engine. The phases of a client: `initializing` (initialize sent at `open_client`),
`opening` (session/new sent), `ready`, `dead` (the process ended), `failed` (the agent refused the handshake), `closed` (we
closed it).

- **`send(request)`**: the request waits in a queue; one turn goes at a time, in the order of sending. When the session is open
  the first waiting request goes out as `session/prompt` (the text of the request is the prompt). The ACP request id is
  a counter of the client; the engine request id (`agent-1`) is kept with the turn and put on every event of it.
- **`receive()`**: takes what has come (`poll`), then returns one event or None. It never waits.
- **`cancel(request_id)`**: a request still in the queue is taken out; the turn in flight gets `session/cancel` and every
  open request for permission of it is answered with the outcome `cancelled` (the protocol demands it). The agent answers the
  cancelled turn with the stop reason `cancelled` and may send chunks before; they all come with the old request id, and the
  engine, which closed that request when it cancelled it, discards them and journals the discard (rule 17).
- **`ack(source)`**: see below.
- **The process ends** (`eof` of its stdout): every turn in flight and every waiting request gets a refusal
  `agent_refused` with `ConnectionLost`; a request sent later gets it at once. **Silence** is not decided by the client: the
  idle term of the request belongs to the engine (`Expired` -> `Timeout`, after which the engine sends `cancel`); every event of
  the agent (a chunk, a tool, a plan, a skipped update) renews that term. A request for permission waits for a human, and a
  human is slow: until the gates of rules 19-21 are made, the idle term of the machine has to be longer than the longest
  expected wait of the owner. **A refused handshake** (an error answer to `initialize` or `session/new`) ends the client
  in the phase `failed`: the waiting requests get `NoResult`.
- **What the agent asks of the client**: `fs/*`, `terminal/*` and every method we do not know get the error -32601 "method not
  supported" and a note event `acp_note` for the journal. The client declares no files and no terminal at `initialize`.
- **Permission**: `session/request_permission` becomes the event `permission_request` with the key of the request in its input
  (`request`). The client does not answer it. The owner's decision comes as an event `permission_decision`
  (`{"request": key, "decision": "allow" | "deny"}`) and the server hands it to `client.decide_event(event)` (or
  `client.decide(key, decision)`), which picks the option of the kind `allow_once` (`allow_always`) or `reject_once`
  (`reject_always`) and answers the agent. A key nobody asked, a request already answered and a decision that no option
  fits give false and send nothing.
- **Stderr** of the agent is read all the time (an agent that writes much to a pipe nobody reads stops) and the last 4000
  characters are kept (`client.stderr_tail()`).
- **Closing**: `client.close()` kills the whole process tree (a Job Object on Windows), waits (two seconds at most) until the fibers
  around the process are over, and nothing comes out of a closed client any more. The wait matters: a program that goes on, or
  ends, while the fibers are still finishing meets the hangs of Oracle 0.1.0 described below.

## The projection ACP -> engine event -> page event

`name` is the name of the engine `Incoming`, `kind` its class (`Progress` renews the idle term of the request, `Answered` and
`Refused` close it). The page columns are the kinds of the page of task 093/094 (`src/web/README.md`, "The format of the
event"); "-" means that the page has no kind for it and `page_event` gives None.

| ACP | Engine event: kind / name / input | Page: kind and input |
|---|---|---|
| `session/update` `agent_message_chunk`, a text block | Progress / `agent_chunk` / the text | `agent_chunk` `{turn, text}` |
| `agent_message_chunk` with a block that is not text | Progress / `acp_skipped` / `agent_message_chunk: image` | - |
| `agent_thought_chunk`, a text block | Progress / `agent_thought` / the text | - |
| `tool_call` | Progress / `tool_call` / `{id, title, kind, status, detail?}` (`kind` unknown to the page and `switch_mode` -> `other`; `status` unknown -> `pending`; `detail` - texts of the content, a line `diff: <path>` for a diff, `terminal: <id>`) | `tool_call` the same object + `turn` |
| `tool_call` without `toolCallId` | Progress / `acp_skipped` | - |
| `tool_call_update` | Progress / `tool_call_update` / `{id, status?, detail?}` (only the fields that came) | `tool_call_update` the same object |
| `plan` | Progress / `plan` / `{entries}` | - |
| `usage_update` | Progress / `usage_update` / `{used, size, cost?}` (`cost` as it came) | `usage_update` the same object |
| any other `sessionUpdate` (`user_message_chunk`, `available_commands_update`, `current_mode_update`, `config_option_update`, `session_info_update`, ...) and a missing one | Progress / `acp_skipped` / the name of the update | - |
| `session/request_permission` (a call of the agent) | Progress / `permission_request` / `{request, tool_call, action, detail, options:[{id,name,kind}]}`; `request` is the key of the JSON-RPC id | `permission_request` `{turn, request, action, detail}` |
| any of the above when no turn is open | Input / `acp_note` / `<name>: <input>` (a progress event of no request would be discarded) | - |
| the answer to `session/prompt`, `stopReason` `end_turn` | Answered / `agent_done` | `agent_done` `{turn}` |
| `max_tokens`, `max_turn_requests`, `refusal`, `cancelled` | Refused / `agent_refused` / `MaxTokens`, `MaxTurnRequests`, `ModelRefused`, `StoppedByHuman` | `agent_refused` `{turn, reason}` |
| a `stopReason` the table does not know; a JSON-RPC error answer to `session/prompt` | Refused / `agent_refused` / `NoResult` | `agent_refused` |
| the process ended, the connection is lost | Refused / `agent_refused` / `ConnectionLost` | `agent_refused` |
| (the engine) the idle term passed | Expired / `timeout` | `agent_refused` `{turn, reason: "Timeout"}` |
| a notification, a response nobody waits for, a line that is not JSON-RPC | Input / `acp_note` | - |
| (the user) the word | Input / `user_message` | `user_message` `{turn, text}` |
| (the user) cancel | Input / `cancel` | `cancel` `{turn}` |
| (the owner) the decision | Input / `permission_decision` / `{request, decision}` | `permission_decision` the same object |
| (the server) the first word of a session | Input / `session_created` / `{name, agent, folder, project?}` | `session_created` the same object (task 099) |

What is not in the table is never dropped without a trace: it becomes the event `acp_skipped` (or the note `acp_note`), the
engine journals every event, and the page gets nothing. The page line is `{id, trace, step, kind, input, time}`: `name` -> `kind`,
`at` -> `time`, the text `input` -> an object; `turn` is given by the caller (the page names a turn by the code of its
`user_message`). The chat machine takes only `agent_chunk` for the text of the answer; the other progress events only renew the
idle term and leave a note (changed in task 095: the machine used to take every progress event for text).

## How an event is acknowledged

The claim of task 091 ("an event taken by `Link.receive` and not yet committed is lost with the process") is solved by an
acknowledgement, in three parts:

1. **A key and a file.** Every event the client makes gets a source key `acp-<n>` in `Incoming.id`; the numbers never go back. With
   an inbox file (`AcpConfig.inbox_path`, `<data folder>/<session>.inbox`) the event is appended to the file BEFORE it is handed out.
2. **`receive` hands out, `ack` forgets.** A handed-out event is "taken", not confirmed. The engine accepts the event (journal
   lines, then the snapshot - the commit) and only then calls `Link.ack(key)` (the fourth operation of the effect `Link`).
   The key is also written to the journal event of the step (`event_accepted`, the parameter `source`). The client writes
   `ack` to the inbox file.
3. **A restart.** `open_client` reads the inbox file and puts the events without an `ack` back first, in the order of their
   numbers, before anything new (and compacts the file; the next number is kept in its first line). If the process died
   after the commit and before the `ack`, `resume_engine` reads the journal and tells the handler again, on the first `pump`, the
   keys of every committed event (`ack` is idempotent, and it also takes the event out of the restored queue). So an event
   is taken by the engine exactly once: not committed - it comes again; committed - it does not.

Tests: `ack_test` in `src/acp_live` (the handler: taken, acknowledged, the same keys and order after a restart, no key twice, a torn last
line of the file), `src/chat/chat_engine_test` (`ack:` - the engine: the ack comes after the snapshot of the step is saved, an event
without a key is not acknowledged, a discarded event is, the restart acknowledges the committed key), `e2e_test` in `src/acp_live` (the
whole thing over files: the process dies after an event was taken and before its step was committed - the restart takes it once).

Limits. The agent process dies with the service: the requests open at the restart stay open (rule 22 as 091 fixed it), but the
agent no longer knows the turn, so the answer never comes and the idle term ends it with `Timeout`. Continuing a turn needs
`session/load` (the capability `loadSession` of the agent) - a later task. The inbox file grows by one line per event and one
per ack until the next start compacts it.

## Oracle 0.1.0: what shaped the code

<!-- ORACLE-WORKAROUND(20, 25): the tests are two units (`src/acp` and `src/acp_live`) with short test names: a test binary blocks on a stdout that nobody reads when its lines come to more than 4096 bytes (20), and a unit is a folder (25); one unit would do when item 20 is fixed -->

Reproductions of the new defects: `spikes/env/repro_acp/` (run one: `cd spikes/env/repro_acp; nova test src/<name>`; `repro_child_pipes` is a program).

- a user type named `Output` breaks the C once `std.os` is imported (its `Output` is the result of `Command.output()`):
  the engine type was renamed to `StepOutput` (`user_output_vs_std_os`); task 102 removed that type: a machine gives its orders to the `Environment`;
- a one-character string literal where a `char` is expected (`trim_end_matches("\r")`) passes the checker and breaks the C
  (`char_param_str_literal`); `strip_suffix` is used;
- the result of a fluent setter of a value type cannot be assigned back (`command = command.arg(a)` -> a pointer to a value in the
  C); the result is dropped, the setter changes the command in place (`fluent_assign_back`);
- an `AtomicInt` put into a record is a copy of the variable (`atomic_in_record_copy`): a value shared by a fiber and the record's holder
  is a channel;
- `spawn` is allowed only lexically inside `supervised`, which cannot span the life of a handler: a detached keeper fiber holds the
  `supervised` scope of the client (`detach` needs the effect `Detach`, which is in the signatures of `connect` and `open_client`);
  a `consume` type (`Child`, a pipe) cannot be a field of a record, so each is owned by one fiber;
- the name of a captured `consume` binding is a C macro: a field with the same name used in the body is rewritten by the
  preprocessor (`done.tx` inside `spawn consume tx { ... }` does not compile); the pipes are called `stdin_pipe`, ... (`consume_capture_vs_field`);
- **child process pipes hang now and then** (`spikes/env/repro_child_pipes/`, a program; the dumps of the runtime say
  `pre-exit-drain-10s-remote-1`): a write to the stdin of a child is parked and does not come back (neither when the child dies
  nor by `supervised(timeout:)` around it; a cancel of a `spawn`ed scope does end it when the pipe is merely full), a fiber of a
  detached group is started and never seen, a binary that has finished its tests does not end. About one run of the test binary
  of this unit in twenty hung while the fibers were `detach`ed one by one and `close()` did not wait; with the keeper scope, the
  cancel of the writer scope and the waiting `close()` a hundred runs in a row did not hang (see analysis.md of the task).
  The product treats a client that does not answer as a client that is silent (the idle term of the engine ends the turn with
  `Timeout`); a write that lasts more than 10 s is cut together with the process;
- an anonymous record literal outside a return position is rejected by the code generator, and in a return position the
  type prefix is rejected as redundant: small constructor functions (`proj`, `item_of`, `snapshot_of`, `inbound_of`);
- `exists` cannot be the name of a function (reserved word); names of functions are unique across the peer files of a folder
  (the tests of one module share a namespace);
- a test binary whose lines (`  PASS: <name>`) come to more than 4096 bytes blocks on its stdout when nobody reads the pipe, and
  `nova test src` did not read it (`TIMEOUT` after about 70 s): see "Two units, short test names" above (`output_over_4k`);
- a test that fails before it closes its client leaves the agent process alive, and the test binary waits for its pipes
  (`nova test` hangs): the fake agent ends by itself after 25 seconds. A real service closes the client in its shutdown.
