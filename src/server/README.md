# server: the session server of the product

The first slice of the MVP: **open the page in a browser, create a session, talk to an agent.** The server serves the page of
[`src/web/`](../web/README.md), keeps a WebSocket `/ws` for it, and runs one state machine engine
([`src/engine`](../engine/README.md)) per session: the machine of a many-turn dialog ([`src/chat`](../chat/chat.nv),
`dialog_session`), the store and the journal in files ([`src/storage`](../storage/files.nv)) or in PostgreSQL
([`src/pg`](../pg/README.md)), the agent over ACP ([`src/acp`](../acp/README.md), by default `opencode acp`). Task 099
(`doc/tasks/099-session-server/`). Built by **Nova Oracle 0.1.0 on Windows (Clang)**.

## Two programs

```
browser <--HTTP, WebSocket /ws--> crew-harness (the front, Polaris)  <--lines over pipes-->  crew-hub (the hub)
                                                                                              |-- engines, one per session
                                                                                              |-- the store: files or PostgreSQL
                                                                                              '-- agent processes (ACP over stdio)
```

| Program | Source | What it does |
|---|---|---|
| `crew-harness` (the front) | `src/crew_harness.nv`, `src/server/front/` | HTTP on `127.0.0.1`: the files of the page (CSP `default-src 'self'`, as `src/web/serve.mjs`), `/health`, the WebSocket `/ws`; starts the hub as a child process and passes the page through |
| `crew-hub` (the hub) | `src/crew_hub.nv`, `src/server/` | the sessions: engines, agents, the store; speaks lines over its stdin and stdout; ends when its stdin is closed (so it never outlives the front) |

**Why two programs.** The PostgreSQL driver and Polaris cannot be in one program on Oracle 0.1.0: the driver has a variant
`Message`, Polaris has a type `Message`, and the compiler keeps one table of names for the whole program
(`spikes/env/repro_server/src/pg_polaris_message`). The front and the hub talk by lines, so each is built with what it needs.
The front must not import the module `crew_harness.server` (it holds the hub, hence the driver): it reads its own few settings
(`src/server/front/front_settings.nv`).

## Run

From a normal console window (**not** through `crew_watch`: child processes of a window-less launch fail on Windows, task 100):

```powershell
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
cd C:/work/crew-harness
nova build src/crew_hub.nv -o target/crew-hub.exe
nova build src/crew_harness.nv -o target/crew-harness.exe
copy src\server\server.example.json C:\work\crew-server.json      # edit: port, data_dir, agents, store
.\target\crew-harness.exe serve C:\work\crew-server.json            # prints the address; Ctrl+C stops it
# open http://127.0.0.1:8099/ , "New session", write
```

`crew-harness` without `serve` prints the version and the usage and ends. The settings file is the argument or `CREW_SERVER_CONFIG`;
with neither the defaults apply (port 8099, files in `crew-data`, the agent `opencode acp`, hub `target/crew-hub.exe`).
The hub alone (`target\crew-hub.exe settings.json`) prints `ready` and then waits for lines; it is how the tests drive it.

### Run on PostgreSQL with one command

```powershell
powershell -File src/server/run-pg.ps1          # from a console window, in the root of the repository; Ctrl+C stops the server
```

It starts (or finds) the permanent PostgreSQL in Docker (`src/pg/db.ps1 up`: the container `crew-harness-pg`, the volume with the data, the login
`crew_service`), says the two `nova build` commands above if `target/crew-hub.exe` or `target/crew-harness.exe` is missing, writes
`~/.config/crew-harness/server-pg.json` once (`store: pg`, the `pg` block **without a password**; a file that exists is kept), puts the password
from `~/.config/crew-harness/pg.json` (outside the repository) into `CREW_PG_PASSWORD` **of that process only** and runs `crew-harness serve`.
The password is in no file of the repository, no line of the output and no command line. Docker not running: a message and exit code 1.
`-ServerPort 8100` is another port of the page (`CREW_SERVER_PORT`), `-Agent "node a.mjs --live"` another agent (`CREW_SERVER_AGENT`),
`-Config`, `-ServerConfig`, `-Port`, `-Database` name other files, the port of the database and another database. By hand it is
`powershell -File src/pg/db.ps1 env -ShowPassword | Invoke-Expression`, then `.\target\crew-harness.exe serve src\server\server-pg.example.json`
(the example file has the same keys as the written one). The sessions stay in the volume: they survive a restart of the server and `db.ps1 down` / `db.ps1 up`
(`test/e2e.mjs --pg-docker` checks both).

## Settings

A JSON file; every key is optional. The environment is over the file, key by key. Only test values are in the repository
(`src/server/server.example.json`); a password lives in the environment or in a file outside the repository, and is in no log line
and no error (`describe()` leaves it out).

| Key | Environment | Default | Meaning |
|---|---|---|---|
| `port` | `CREW_SERVER_PORT` | 8099 | the port on `127.0.0.1` (the server never listens on another address: no TLS yet) |
| `data_dir` | `CREW_SERVER_DATA_DIR` | `crew-data` | the files of the file store, **and in both modes** the inbox files of the ACP client (`<session>.inbox`) |
| `store` | `CREW_SERVER_STORE` | `files` | `files` (task 095) or `pg` (task 098) |
| `pg` {`host`,`port`,`database`,`user`,`password`} | `CREW_PG_HOST`, `_PORT`, `_DATABASE`, `_USER`, `_PASSWORD` | `127.0.0.1`, 5432, `crew`, `crew_app`, - | the PostgreSQL connection (local host only); the same keys as `src/pgconf` |
| `agents` [{`id`,`label`,`program`,`args`}] | `CREW_SERVER_AGENT` (one agent `opencode`, words separated by spaces) | `opencode.cmd acp` on Windows, `opencode acp` elsewhere | the agents the page can ask for by `id` |
| `idle_term_seconds` | `CREW_SERVER_IDLE_SECONDS` | 900 | the idle term of a turn: an agent silent that long ends the turn with `Timeout`. A request for permission waits for a human, so keep it long |
| `workdir` | `CREW_SERVER_WORKDIR` | the folder of the server | the folder the agents work in (`session/new` needs it) |
| `web_dir` | `CREW_SERVER_WEB_DIR` | `src/web` | the folder of the page |
| `hub` {`program`,`args`} | `CREW_SERVER_HUB` (words separated by spaces) | `target/crew-hub.exe` | how the front starts the hub |
| - | `CREW_SERVER_CONFIG` | - | the settings file, when no argument names it |

The file store needs no database. For `store: pg` the easy way is the permanent database in Docker (`run-pg.ps1` above, [`src/pg/README.md`](../pg/README.md),
"The permanent database in Docker"); by hand: start a database and migrate it (`psql -f src/pg/schema.sql` as the owner, a login that
is a member of `crew_app`). A server that restarts finds its sessions with `crew.list_sessions()`. An example with `store: pg` and no password:
`src/server/server-pg.example.json` (the password comes from `CREW_PG_PASSWORD`).

## The protocol of `/ws`

One WebSocket text frame is one JSON event (the server may also send an array of events in one frame). The event is the one of
[`src/web/README.md`](../web/README.md), "The format of the event": `{ id, trace, step, kind, input, time }`; **`trace` is the id of the session.**

### Page to server

The page says what the owner did. It does not apply its own words: they appear on the screen when the server returns them.

| `kind` | `input` | What the server does |
|---|---|---|
| `session_created` | `{ name, agent, project? }`; `trace` is the id the page chose | makes the session (the id must be a safe file name: letters, digits, dot, dash, underscore), starts the agent. An unknown agent or a bad id is answered by `session_created` and `error` for that page only, nothing is kept |
| `user_message` | `{ turn, text }` | gives the text to the agent as the next turn. `turn` is not used (see below). Ignored while a turn is open (the page does not offer sending then) |
| `cancel` | `{ turn? }` | cancels the open turn (`session/cancel`); **the session stays open** |
| `permission_decision` | `{ request, decision }`; `decision` is `allow` or `deny` | answers the request for permission of the agent; a decision nobody asked for changes nothing |

### Server to page

| `kind` | `input` | When |
|---|---|---|
| `session_created` | `{ name, agent, folder, project? }` | a session exists |
| `user_message` | `{ turn, text }` | the owner's word was accepted |
| `agent_chunk` | `{ turn, text }` | a piece of the answer; the page glues pieces in the order of `step` |
| `agent_done` | `{ turn }` | the turn ended well |
| `agent_refused` | `{ turn, reason }` | the turn ended badly: `reason` is a code of the closed list (`Timeout`, `ConnectionLost`, `ModelRefused`, `MaxTokens`...) |
| `permission_request` | `{ turn, request, action, detail }` | the agent asks; the answer is `permission_decision` |
| `permission_decision`, `cancel` | as above | the page's decision, accepted |
| `tool_call`, `tool_call_update`, `usage_update` | as in the page README | work of the agent |
| `error` | `{ turn, message }` | **synthetic**: the agent could not be started or refused to start, a rejected `session_created`. Its id is `srv-<n>` and it is not kept: it is not in the journal and not in the history |

Things to know:

- **Ids.** `id` is `<session>/<engine id>` (`s-1/progress-4`): the page keeps the ids of all sessions in one set. `step` is the step of the engine and
  grows without gaps inside a session; `time` is the clock of the engine.
- **`turn`.** The code of a turn is the engine id of its `user_message` (`input-3`); every event after it carries it until the next `user_message`.
  The page names a turn by its own code, the server replaces it with its own: it is derived from the journal, so it is the same after a restart.
- **History.** When a page connects, the server sends, for every session, **one frame with an array**: the whole story of the session from the
  journal (`session_created`, the messages, the answers...). After that every new event goes to every connected page as it happens. A reloaded page, a
  second window and a restarted service all see the same sessions: the page is stateless.
- **What the page does not get:** thoughts and plans of the agent, skipped updates, notes (`acp_note`): the page has no kind for them; the journal has them.

Example (the lines of one short talk, as the page receives them):

```
{"id":"s-1/input-2","trace":"s-1","step":2,"kind":"session_created","input":{"name":"Probe","agent":"opencode","folder":"C:/work/project"},"time":1792374756651}
{"id":"s-1/input-3","trace":"s-1","step":3,"kind":"user_message","input":{"turn":"input-3","text":"hello world"},"time":1792374757346}
{"id":"s-1/progress-4","trace":"s-1","step":4,"kind":"agent_chunk","input":{"turn":"input-3","text":"Echo:"},"time":1792374757375}
{"id":"s-1/progress-5","trace":"s-1","step":5,"kind":"agent_chunk","input":{"turn":"input-3","text":" hello"},"time":1792374757398}
{"id":"s-1/answered-7","trace":"s-1","step":7,"kind":"agent_done","input":{"turn":"input-3"},"time":1792374757433}
```

### Between the front and the hub

Lines, fields separated by a tab (a JSON text has no raw line break or tab): to the hub `open <conn>`, `close <conn>`, `msg <conn> <page message>`, `quit`;
from the hub `ready`, then `<conn> <message for the page>` (`conn` 0: every page). The log of the hub is its stderr, which the front prints with the prefix `hub:`.
The page's connection number is the peer port of its socket.

## How a session lives

1. **Create.** The hub starts an engine (`start_engine`), feeds it the word `session_created` (name, agent, folder; the machine ignores it, the journal keeps
   it with its input), starts the agent process. The session is on disk (or in the database) before the page sees it.
2. **Talk.** `user_message` is `feed`ed: the machine opens a request, the engine sends it to the ACP client, which queues it (one turn at a time). A timer
   (every few milliseconds) pumps every session: the events of the agent are accepted (journal, snapshot, then the acknowledgement to the client) and shown.
3. **Many turns.** The machine `dialog_session` goes back to `Idle` after an answer, a refusal, a timeout or a cancel; the request ids are `agent-1`, `agent-2`...
4. **Restart.** At the start the hub lists the sessions of the store (`list_sessions` of the folder, `crew.list_sessions()` of the database) and resumes each one
   (`resume_engine`, the lines of the page from `Engine.history()`). An agent is started only for a session with an open request. An open request has no
   agent that knows it any more (continuing a turn is `session/load`, not here): it ends with `Timeout` when its idle term passes, and the session goes on.
5. **A dead agent.** A refusal `ConnectionLost` is shown; the next message starts a new agent process (it does not remember the talk: ACP `session/load` is not used yet).
6. **An agent that refuses to start** (`authMethods`, no login): the page gets an `error` event with the reason, once; every message gets a refusal.

**Why the journal has the input of the event.** The journal event `event_accepted` had the kind, the name and the source key of an accepted event; the page needs the text.
It now has the parameter `input` too (written only when it is not empty, so older journals read the same; the journal stays a code and parameters, with no text of its own),
and `Engine.history()` rebuilds the stamped events from the journal. The alternative, a second store for the transcript, would need a third handler beside `Journal` and `Store`; the journal is the transcript.
The events a live session shows come from the engine itself (`Engine.take_events()`), so a restart shows exactly the same lines (a test compares them).

## Files

| File | What it is |
|---|---|
| `settings.nv` | `ServerSettings`, `parse_server_settings`, `server_settings` (file + environment), `check`, `describe` |
| `hub.nv` | `Hub`: `start_hub`, `attach`, `release`, `handle`, `pump`, `take_output`, `take_log`, `close`; the sessions, the store by the settings, the lines of the page |
| `stdio.nv` | `run_hub_stdio`: the hub over stdin and stdout |
| `front/front.nv`, `front/front_settings.nv` | the front: HTTP, `/ws` (frames over two owners of the socket), the router fiber, the hub as a child process |
| `testkit.nv` | the settings of a test hub with the fake agent, the rig that drives a hub as a page does, the scenarios (shared by the units below) |
| `dialog_test.nv`, `settings_test.nv`, `front/front_settings_test.nv` | tests of the unit `src/server` and `src/server/front` |
| `../server_live/hub_test.nv`, `../server_pg/hub_pg_test.nv` | the same ten scenarios over files and over PostgreSQL |
| `test/e2e.mjs`, `test/real-agent.mjs` | Node: the whole server through its door (files, `--pg` on the temporary database, `--pg-docker` on the permanent one); the real `opencode acp` (handshake only) |
| `server.example.json`, `server-pg.example.json` | the examples of the settings: the file store, and the store pg on the database of `db.ps1` (no password) |
| `run-pg.ps1` | the server on the permanent PostgreSQL in Docker with one command (task 115) |

The module of the front is declared `module server.front` (without the package prefix) and imported as `crew_harness.server.front`: a module two folders under the
source root cannot be declared with the full path on Oracle 0.1.0 (item 25 of `spikes/env/README.md`; this form compiles and resolves).

## Tests

```powershell
powershell -File src/pg/testdb.ps1                     # the temporary PostgreSQL in Docker, for src/server_pg
nova test src --jobs 4                                 # all units; --strict-effects too
nova test src/server_live                              # the scenarios over files: about 25 s
nova test src/server_pg                                # the same over PostgreSQL: about 30 s
powershell -File src/pg/testdb.ps1 -Stop
nova build src/crew_hub.nv -o target/crew-hub.exe; nova build src/crew_harness.nv -o target/crew-harness.exe
node src/server/test/e2e.mjs                           # the whole server, 35 checks (fake agent)
powershell -File src/pg/testdb.ps1                     # the same on PostgreSQL: the temporary container, then
node src/server/test/e2e.mjs --pg                      #   39 checks (the sessions and the journal are looked for in the database)
powershell -File src/pg/testdb.ps1 -Stop
node src/server/test/e2e.mjs --pg-docker               # the same on the permanent container, on its own database crew_e2e (made and dropped here;
                                                       #   the database crew is not touched), then db.ps1 down, db.ps1 up and the sessions are there: 46 checks
node src/server/test/real-agent.mjs                    # the real opencode: initialize and session/new, no model, no key
```

The scenarios (`testkit.nv`), each on a fresh store: two turns of a chat (chunks, turns, ids, steps), permission asked/allowed/denied, a cancel keeps the
session open and the late words are not shown, restart between turns (the same lines, a page that comes later is told everything), restart in the middle of a
turn (`Timeout`, the session goes on), the agent dies (`ConnectionLost`, a new agent), two pages on one session, what cannot be done is an error, several
sessions, an agent that refuses to start. The machine and the engine are tested in memory with the deaths of rules 13 and 34(e) (`dialog_test.nv`): between
the commit and the send, between the journal line and the snapshot, the agent answering while the process is dead, a cancel committed and not sent.

## What is not here

- `session/load` (the agent forgets the talk after a restart or a new process), the continuation of a turn after a restart, an agent per project folder.
- Closing the agents of idle sessions: every session that has talked keeps its agent process until the hub ends.
- TLS, a login, access rules: the server listens on `127.0.0.1` only and every page sees every session. Because a browser lets ANY web page open a WebSocket to `127.0.0.1`, `/ws` refuses a request whose `Origin` is not `http://127.0.0.1:<port>` or `http://localhost:<port>` (a client without `Origin`, as a test, is accepted). PostgREST, the terminal, Markdown, the board of tasks.
- The list of agents of the page is the fixed one of `src/web/mock.js` (`opencode`); the `agents` of the settings are chosen by that id.
- A pool of connections to PostgreSQL (one call, one connection, as in task 098).

## Oracle 0.1.0: what shaped the code

New in this task (reproductions in `spikes/env/`, items 29-32 of its README): the names of types and variants are one table for the whole program, dependencies
included (`Request`/`Response` of `http`, `Session` of the driver, `Message` of the driver and of Polaris), so the engine types are `PartyRequest` and `PartyResponse`,
the record of the hub is `Dialog`, and the server is two programs; `Stdin.read` waits for a full buffer and pins the worker of its fiber (`#blocking fn` and a buffer of one
byte); `import std.text` anywhere makes a pattern variable `text` mean the module; the stream handed to the upgrade hook of Polaris is shared, so it is read and written
through `share()`, not split; a nested module path; the names `a` and `b` in a test file of an imported module and the method `entries` reaching `EmbeddedDir.merge`.
