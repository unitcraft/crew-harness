# engine: the state machine engine of the product

The core of CrewHarness is a state machine engine, and its events are self-contained: an event carries everything a
machine may use, a machine step is a pure function of the state and the event, and everything that touches the world
(journal, snapshots, the agent, the clock) is done by the engine through effects. This directory is the skeleton of
the engine on Nova, built by **Nova Oracle 0.1.0 on Windows (Clang)**, with tests. Task 091
(`doc/tasks/091-product-engine/`). Task 095 (`doc/tasks/095-acp-client/`) added the real handlers of the effects: the ACP client
and the handler of `Agent` (`src/acp/`) and the file `Journal` and `Store` (`src/storage/`); the next task is the session server.

The engine is a SUBSET of the methodology (`unitcraft/ai-dev-methodology`, `state-machine-engine-automaton.md` and the
norms `state-machine-spec.md`, rules 12-25, 31, 35) for the MVP "a chat session with an agent". The dictionary
methodology term -> identifier is [GLOSSARY.md](GLOSSARY.md). The methodology describes the engine in Nova code with
Russian names and says that the code was never compiled; here it is English and compiled, and where Oracle 0.1.0
could not take the methodology as written, the difference is named below.

## Build and run the tests (Windows)

Everything for Oracle 0.1.0 (download, SHA-256, `setup-env.ps1`, Clang) is in
[`spikes/env/README.md`](../../spikes/env/README.md), section 1. In short, in PowerShell, once per session:

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1     # the leading dot matters
cd C:/work/crew-harness                                           # the root of the repository (nova.toml is there)

nova test src                       # all tests: six units (engine, chat, storage, acp, acp_live, the entry point), 159 checks
nova test src/engine                # the engine only (types, codec)
nova test src/chat                  # the chat session machine and the engine with it
nova test --strict-effects src      # the same, and an effect used without being declared in a signature is an error
nova build src/crew_harness.nv -o target/crew-harness.exe   # the entry point (a placeholder for now)
```

`nova test` prints one line per unit (`PASS src/chat/chat`), and the checks of a unit only when one fails. To see them all,
run with `--keep-artifacts` and start the test binaries from the newest `nova_tests-<pid>` directory in `%TEMP%` (`t-*/chat.exe`,
`t-*/codec.exe`): each prints one line per check and `NN/NN passed`. The first build in a new `target/` also builds libuv (about 30 s); after that a full `nova test src`
takes 12-15 s on the survey machine. Lint warnings of dependency packages are not printed here: the package has no dependencies.

## Layout

All `.nv` files are under `src/` (owner's rule 2026-09-07, as in `claude-limits`); tests are `*_test.nv` beside the sources.

| File | What it is |
|---|---|
| `src/engine/types.nv` | `FailCode`, `Request[T]`, `Reply[R]`, `Rejection`, `Response[R]`, `EventKind`, `Event`, `StepOutput` and its payloads, `StepResult`, `JournalEntry`, `Snapshot`, `EngineState` |
| `src/engine/machine.nv` | the protocol `Machine`: `name`, `initial`, `state_name`, `step` |
| `src/engine/effects.nv` | the effects `Journal` (`write`, `read_all`), `Store` (`save`, `load`), `Agent` (`send`, `receive`, `cancel`); the clock is the standard `Time` |
| `src/engine/codec.nv` | the journal line and the snapshot as JSON (`journal_line`, `parse_journal_line`, `encode_snapshot`, `decode_snapshot`) |
| `src/engine/engine.nv` | `Engine[M]`: `start_engine`, `resume_engine`, `accept`, `dispatch`, `feed`, `pump` |
| `src/engine/memory.nv` | in-memory handlers for tests: `MemoryWorld`, `memory_journal`, `memory_store`, `memory_agent`, `memory_time` |
| `src/chat/chat.nv` | the demo machine `ChatSession`: states `Idle`, `Awaiting`, `Done`, `Failed`; events `UserMessage`, `AgentChunk`, `AgentDone`, `AgentRefused`, `Cancel`, `Timeout` |
| `src/engine/types_test.nv`, `codec_test.nv` | 13 checks of the types and the text forms |
| `src/chat/chat_test.nv` | 17 checks of the machine as a pure function |
| `src/chat/chat_engine_test.nv` | 33 checks of the engine over the chat session in memory: one request - one answer, restart, cancel, idle term, journal, UTF-8, acknowledgement of incoming events |
| `src/crew_harness.nv` | the entry point; a placeholder that prints the version |

The chat machine lives in its own module `chat` and the engine does not import it: the engine knows a machine only
through the protocol. The real handlers of the effects (file journal and snapshots: [`src/storage/`](../storage/files.nv); the
ACP link: [`src/acp/`](../acp/README.md)) come in at the point of start by `with Journal = ..., Store = ..., Agent = ... { ... }`.
The engine changed for them in one place only: the effect `Agent` got the operation `ack` (see "Acknowledgement" below).

## How a step goes

`Engine.accept(event)` is one step; the order is the order of rule 13 of the specification:

1. **Stamp.** The creator of an event fills `kind`, `name`, `request` (the request the event answers), `input`;
   the engine adds `id` (`<kind>-<number by the event counter>`), `trace`, `step`, `at` (the clock). After that the event is
   self-contained: nothing is read from outside.
2. **Check.** An event that belongs to a request (`Progress`, `Answered`, `Refused`, `Expired`) must find that request open.
   If not (closed, cancelled, never opened), the event is discarded: the step is its own commit with a `discarded` line, the
   machine does not see it (rule 17; one request - one answer, rule 15).
   A `Progress` event renews the idle term of its request; `Answered`, `Refused`, `Expired` close it.
3. **Step.** `machine.step(state, event)` returns the new state (encoded text) and the outputs. `step` is pure: its signature
   has no effects, and Oracle rejects a raw effect call inside it at compile time.
4. **Apply.** `Send` opens a request (`<party>-<attempt>`, the counter of the party only grows, rule 15) and queues it;
   `Cancel` closes the open request of the party and queues the cancel; `Log` and `Save` become journal lines; `Finish` records the
   outcome and cancels what is still open (rule 22).
5. **Commit.** The journal lines of the step are written, THEN the snapshot is saved (the snapshot is the commit point).
   Step numbers go 1, 2, 3... without gaps; every line carries the trace, the step, the cause (the id of the event), the name of
   the state after the step, the request id and the time.
6. **Dispatch.** Only after the commit the queued requests and cancels are sent through `Agent`, and each send is marked in
   the journal (`sent`, `cancel_sent`). `feed` is `accept` + `dispatch`; `pump` sends the pending orders, takes the incoming
   events of the agent in the order of arrival, then makes an `Expired` event for each open request whose idle term passed.

A line of the journal (one JSON object per line, UTF-8 as it is):

```
{"trace":"t1000-chat-1","step":2,"cause":"input-2","state":"Awaiting","request":"agent-1","at":1000,"kind":"request","text":"to agent, attempt 1"}
{"trace":"t1000-chat-1","step":2,"cause":"dispatch","state":"Awaiting","request":"agent-1","at":1000,"kind":"sent","text":"attempt 1"}
```

## Restart by a repeated entry

`resume_engine(machine, id)` loads the snapshot, reads the journal, and makes one more step (`restart-<n>`, its own number and
journal line; the trace stays). It re-sends nothing that was already sent (rule 12): the open requests with a `sent` mark in the
journal are not sent again. A request that was committed but never sent (the process died between the commit and the send) has no
mark and is sent by the next `dispatch`/`pump`, once. Open requests stay open across the restart, so the answer of the agent is
accepted after it; a repeated answer to a closed request is discarded and journaled.
Journal lines of a step newer than the snapshot (the process died between the journal write and the snapshot save) are the lines of
a step that did not commit; they are ignored and counted in the `restart` line.
The restart is a step of its own and takes the number of the step that died, so the dead lines and the restart line share a number; the
restart line stands after them, and a later restart ignores every line that stands before a restart line and has its number or a
greater one (task 095: without that, an event line of a dead step counted as committed after the second restart and its
acknowledgement lost the event).

Tests: after the request was opened; after the answer; between the commit and the send; the attempt counter; no snapshot.

## Writing another machine

A machine is any type with the four methods of `Machine` (the match is structural, no `impl`):

```nova
type Machine protocol {
    @name() -> str
    @initial() -> str                              // the encoded initial state
    @state_name(state str) -> str                  // for the journal
    @step(state str, event Event) -> StepResult    // pure
}
```

It keeps its own typed state and encodes it at the border (`ChatSession.step` decodes the text, maps the engine event to a
`ChatEvent`, calls the typed core `chat_step`, encodes the new state). Outputs: `Send(SendOrder)`, `Log(LogNote)`, `Cancel(CancelOrder)`,
`Save`, `Finish(Conclusion)`. The state is text because Oracle 0.1.0 cannot compile the methodology's generic engine
(see "Oracle 0.1.0").

## What is covered of the methodology, and what is not

Covered (the numbers are the rules of `state-machine-spec.md`):

- 6, types as detailed as the machine uses them; 8, only the executor writes the journal and the snapshot, a step returns outputs;
- 11 in part: a step reads only the state and the event - by the signature of `step` (no effects) and by the tests (a different
  envelope or clock of the same content gives the same result);
- 12, a repeated entry sends nothing to a party whose request is open; 13, the commit order (journal, snapshot, then the send),
  numbers of steps without gaps; 14 in part, a reply is checked against the open requests at arrival; 15, request id
  `<party>-<attempt>`, a counter that is never reset; 16, three outcomes (answer, refusal, no answer in time) and the closed list
  of failures; 17, a foreign or late reply is discarded and journaled; 18 in part, cancel of a request (without "restart request");
- 22 in part, the snapshot keeps the open requests, the counters and the trace; the end cancels what is open;
- 31, the trace envelope: trace, step number, event counter, cause, request id, time in every journal line;
- 35 in part, the end of the machine is an `Answer` or a `Refusal` with a code of the list.

Not in the MVP (the list for the next tasks):

- 19-21 and 28: gates of a human, sets of requests to several parties, the limit of simultaneous requests;
- 23-24 and 36: "stop of a human", "continue", the PAUSE state and its fragment; the signals are not there, `StoppedByHuman` comes
  only from the user's `Cancel` word of the chat machine;
- 35 beyond the end: calling a machine from another machine, passing stop/continue/cancel down, `Cancelled` (cancelled by the
  parent) is in the list and never produced;
- 14 beyond the acceptance at arrival: the split into open and accepted requests, the fingerprint of the object a result is written
  to, finishing an accepted file after a crash; 18: "restart request" with a new id; 27: the end ERROR for a defect of a machine (a
  machine that cannot decode its state leaves a note and does not move); the preparation at resume; irreversible actions of
  the machine (archive, write permission);
- 22 as written for parties that are roles: there open requests of a dead executor are cancelled at restart; here they stay open,
  as the task fixes (the agent lives outside the process). Nested machines are resumed by repeating their request: not here;
- (done in task 095) a persisted queue of incoming events: see "Acknowledgement of incoming events" below;
- failures of the handlers: `Journal.write`, `Store.save` return plain values; a real handler that cannot write stops the process,
  the step is then not committed (rule 13);
- `FormNotFixed`, `MaxTokens`, `MaxTurnRequests`, `CeilingReached` are in the closed list and are not produced by the chat machine;
- the `Save` output is accepted and leaves a `snapshot` journal line, but every commit saves the snapshot anyway: in the MVP the
  order adds nothing (doubtful; it is kept because the task lists it among the outputs);
- the model usage accounting, the real clock cycle, the sets of parties, security.

## Oracle 0.1.0: what shaped the code

What the engine uses and Oracle compiled without a workaround: records, sum types, generic records `Request[T]`, `Reply[R]`,
`Response[R]`, `Engine[M]`, a structural protocol with a bound `M Machine`, effects with handlers captured over mutable
memory (`with Journal = ..., Store = ..., Agent = ..., Time = ... { ... }`), the standard `Time` effect with a hand-made
handler, `std.encoding.json` (writes Cyrillic as it is), `?` on `Option`, test blocks in peer files, `--strict-effects`.

What needed a workaround (reproductions: `spikes/env/repro_engine/`, items 8-13 of `spikes/env/README.md`):

- a generic sum type with a `str` variant does not compile -> the sum types of the engine are not generic;
- a generic function bounded by a protocol with type parameters (`Machine[S, B]`, even `Machine[S]`) generates broken C -> the
  protocol `Machine` has no type parameters and the machine state crosses it as encoded text;
- a protocol-typed record field cannot be called through -> `Engine[M]` is generic over the machine type;
- a user type named `Outcome` clashes with the prelude's -> the type is called `Response`, as in the methodology's own "Types on Nova";
- a user type named `Output` clashes with `std.os.Output` as soon as a module of the program imports `std.os` (the ACP client
  does) -> the type is called `StepOutput` (task 095, `spikes/env/repro_acp/`, `user_output_vs_std_os`);
- the nested pattern `Some(Answer(reply))` over a generic payload compiles to a NULL pointer -> two nested `match`es in the tests;
- `Request[str] { ... }` (a generic type with arguments in a record literal) is not parsed, and some anonymous record literals
  (`push({ ... })`) are rejected by the code generator -> small constructor functions (`request_of`, `reply_of`);
- error text is cut to 600 characters unless `NOVA_DEBUG_RUN_DUMP=1` is set; `str.len()` is gone (`byte_len()`), `"a" + "b"` is
  rejected (`"${a}${b}"`), a handler operation must be fully typed (`name(args) -> T { ... }`), a protocol method comment must be `//`;
- a file in a folder is one module with its peers, the module name is the path from the source root with the package prefix
  (`crew_harness.engine`), tests are peers and are compiled with the module they test (an importer compiles them too).

## Acknowledgement of incoming events (task 095)

An event that `Agent.receive` returns is the handler's until the engine confirms it. The creator of an incoming event may put a
source key into `Event.id` (`Event.from_source(key, event)`; the engine stamps its own id as before). `pump` accepts the event
(journal lines, snapshot: the commit) and only then calls `Agent.ack(key)`; the key is kept in the journal line of the step
(`event` line, text `<kind>/<name> src=<key>`). A restart (`resume_engine`) collects the keys of the committed `event` lines and
`dispatch` tells the handler again (`ack` is idempotent) - the process may have died between the commit and the `ack`. A handler
that keeps what it handed out (the ACP client, with its inbox file) hands out again after a restart exactly what was not
acknowledged: an event is taken once. An event without a key is never acknowledged. The memory handler remembers the keys
(`MemoryWorld.acked`) and the number of saved snapshots at each ack (`saves_at_ack`, for the test of the order). Details and
tests: [`src/acp/README.md`](../acp/README.md), "How an event is acknowledged".

## Where it goes next

1. (done in task 095) `src/acp/` and `src/storage/`.
2. The session server and the console (`src/server/`): HTTP and WebSocket on Polaris, one `Engine` per session, restart of the
   service by `resume_engine` for every session with a snapshot.
3. From the "not in the MVP" list in the order the product needs it: stop/continue of a human (rules 23-24), a set of parties,
   nested machines.
