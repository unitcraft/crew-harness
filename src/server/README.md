# server: the session server of the product

The first slice of the MVP: **open the page in a browser, create a session, talk to an agent.** The server serves the page of
[`src/web/`](../web/README.md), keeps a WebSocket `/ws` for it, and runs one state machine engine
(`alula.engine` of the package `alula`) per session: the machine of a many-turn dialog, **written as data in Alula and run by `AlulaMachine`**
(task 114, "The chat runs on Alula" below), the store and the journal in files ([`src/storage`](../storage/files.nv)) or in PostgreSQL
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

## Connections of the front (task 192)

Polaris counts every open connection against `max_inflight` (16 by default): an idle keep-alive socket of a browser for 60 s, a WebSocket of a page for good. A few tabs used it up, and the 17th request got a `503` or a reset, so a module of the page did not load and the page stayed blank (`node repro-conns.mjs`: 16 idle sockets and `GET /` was reset). The front sets `max_inflight` to 1024, serves ONE request per connection (`max_requests_per_conn(1)`: the response carries `Connection: close` and the server closes the socket cleanly; there is no `Keep-Alive` header; the idle deadline is 10 min), and pings every page twice a minute (about every 25 s): a page that is gone without a word (a sleeping computer) fails at the write and gives its permit back. `index.html` asks for all modules at once (`modulepreload`, the list is checked against the import graph by `src/web/test/graph.test.mjs`), and `boot-guard.js` reloads a start that hung (no `data-booted` in 15 s) once with a new address. Why one request per connection: a keep-alive socket idle over the old deadline (60 s) was dropped by the server with a reset, and the browser (Chromium ignores `Keep-Alive: timeout`) sent the next request into the dead socket - `/api/fs/list` failed the first time after a pause, and the page hung after a long idle. A WebSocket is an upgrade and is not touched. `node src/server/test/idle-conn.mjs [port] [pause_seconds]` checks it against a running front (66 s pause by default).

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
| `data_dir` | `CREW_SERVER_DATA_DIR` | `crew-data` | the files of the file store, **and in both modes** the inbox files of the ACP client: a folder per session, see "Where the files of a session lie"; `projects.json` (the projects, task 192m) lies in it |
| `store` | `CREW_SERVER_STORE` | `files` | `files` (task 095) or `pg` (task 098) |
| `pg` {`host`,`port`,`database`,`user`,`password`} | `CREW_PG_HOST`, `_PORT`, `_DATABASE`, `_USER`, `_PASSWORD` | `127.0.0.1`, 5432, `crew`, `crew_app`, - | the PostgreSQL connection (local host only); the same keys as `src/pgconf` |
| `agents` [{`id`,`label`,`program`,`args`}] | `CREW_SERVER_AGENT` (one agent `opencode`, words separated by spaces) | `opencode.cmd acp` on Windows, `opencode acp` elsewhere | the agents the page can ask for by `id`; only `id` and `label` are exposed by the front at `/api/agents` |
| `idle_term_seconds` | `CREW_SERVER_IDLE_SECONDS` | 900 | the idle term of a turn: an agent silent that long ends the turn with `Timeout`. A request for permission waits for a human, so keep it long |
| `workdir` | `CREW_SERVER_WORKDIR` | the folder of the server | the folder the agents work in (`session/new` needs it) |
| `web_dir` | `CREW_SERVER_WEB_DIR` | `src/web` | the folder of the page |
| `machines_dir` | `CREW_SERVER_MACHINES_DIR` | `machines/product` beside the hub, else beside its folder | the folder of the machines of the product that the hub reads at its start (task 248, "Where the machine comes from" below) |
| `acp_trace` | `CREW_SERVER_ACP_TRACE` (`true`/`false`) | `true` | write the raw JSON-RPC exchange with the agent, both ways, to `<data_dir>/<session>/acp.jsonl` (`{"t": unix ms, "dir": "out"|"in", "line": "<the line as it is>"}`); over 50 MB the file becomes `acp.1.jsonl` in the same folder. **The file holds the full text of the talk and the output of the tools, nothing is cut out.** |
| `ask_form` | `CREW_SERVER_ASK_FORM` (`true`/`false`) | `true` | the agents may ask the owner a question with a choice (task 192i): the hub says at `initialize` that it shows forms and gives the agents that need it the MCP tool `ask_user_question`; `false` - nothing of it (an agent then cannot ask by a tool; Claude Code has no `AskUserQuestion` at all). See "Questions of the agent" |
| `ask_timeout_seconds` | `CREW_SERVER_ASK_TIMEOUT_SECONDS` | 1800 | how long a call of the MCP tool `ask_user_question` waits for the owner; then the agent gets "таймаут ожидания ответа" |
| `agents[].ask` | - | `native` | how the agent asks: `native` (its own tool, over `elicitation/create`), `mcp` (the hub gives it the MCP tool and a note), `off` (nothing) |
| `routes_dir` | `CREW_SERVER_ROUTES_DIR` | `doc/routes` | the folder of the files of the modes of work (relative to the working folder of the hub); read from the disk each time a step starts (task 192q, "The modes of work" below) |
| `route_reviewer_order` | - | `["codex","claude","kimi","opencode"]` | the families (ids of `agents`) tried for the independent reviewer: the first that is not the agent of the session; else any other agent |
| `route_task_limit`, `route_task_messages` | - | 12, 40 | over this many subtasks or messages in a task `route_state` says `suggest_new_task` (0 - off) |
| `route_fix_attempts` | - | 2 | the tries of the agent to resolve a conflict (of a merge of a subtask, of the rebase before publishing) |
| `route_keep_days` | - | 30 | days without activity after which a session with a tree is marked stale (`task.stale`) and the page asks whether to delete the tree and the branch; 0 - no term; the hub deletes nothing by itself |
| `route_worktree_ask`, `route_overlap_seconds` | - | `true`, 30 | a subtask marked parallel whose `Затрагивает:` files overlap with another running subtask asks the owner (`route_state.task.overlap`); after the seconds it takes a tree of its own |
| `route_confirm_word`, `route_over_limit_word` | - | `задача`, `сверх` | task 192.2: the code words. An ordinary message that is just the word answers the last card of a single proposal of a task (and is not sent to the agent): "start" / "extend", at an overlap "wait", at the limit "queue"; the over-limit word starts the work over the limit |
| `route_max_active` | - | 3 | the limit of the subtasks in work at once in a session (0 - none); over it the card asks for the over-limit word or puts the work in the queue; the queue starts by itself |
| `route_tool` | - | `true` | the hub gives every agent that takes an HTTP MCP server the tools of the recognition of the tasks (`crew_task_list`; `crew_task` too with `route_auto_propose`) |
| `route_auto_propose` | - | `false` | `true` - the agent proposes a task by itself, one `crew_task` and a card with the code word; `false` - in the mode interactive tasks appear only by the button "Распознать задачи" |
| `stt` {`url`,`language`,`managed`,`dir`,`model`} | `CREW_SERVER_STT_URL`, `CREW_SERVER_STT_LANGUAGE`, `CREW_SERVER_STT_MANAGED`, `CREW_SERVER_STT_DIR`, `CREW_SERVER_STT_MODEL` | `http://127.0.0.1:8178/inference`, `auto`, `true`, `CREW_STT_DIR` or `%LOCALAPPDATA%/crew-harness/stt`, `small` | the local speech recognizer (whisper.cpp `whisper-server`) that the front sends the voice to and, with `managed`, starts and ends itself (below); the address must be a plain `http://127.0.0.1:<port>/...` or `http://localhost:<port>/...` (the audio never leaves the machine); `language` is the default of `POST /api/stt`; `dir` holds `bin/whisper-server.exe` and `models/ggml-<model>.bin` |
| `max_image_bytes` | `CREW_SERVER_MAX_IMAGE_BYTES` | 10485760 (10 MB) | the largest picture of a message (1024 to 104857600); the front and the hub both refuse a larger one |
| `hub` {`program`,`args`} | `CREW_SERVER_HUB` (words separated by spaces) | `target/crew-hub.exe` | how the front starts the hub |
| - | `CREW_SERVER_CONFIG` | - | the settings file, when no argument names it |

The file store needs no database. For `store: pg` the easy way is the permanent database in Docker (`run-pg.ps1` above, [`src/pg/README.md`](../pg/README.md),
"The permanent database in Docker"); by hand: start a database and migrate it (`psql -f src/pg/schema.sql` as the owner, a login that
is a member of `crew_app`). A server that restarts finds its sessions with `crew.list_sessions()`. An example with `store: pg` and no password:
`src/server/server-pg.example.json` (the password comes from `CREW_PG_PASSWORD`).

### The catalog of the families: `agents.json`, `/api/agent-catalog` (task 192o)

The hub keeps, for every agent (family), the last lists of models, efforts and modes that the agent gave and its current values, in `<data_dir>/agents.json`
(`{"agents":{"<id>":{"updated":<ms>,"model","model_id","models":[{id,name}],"effort","effort_name","efforts":[{id,name}],"mode","modes":[{id,name,description}]}}}`).
Every `agent_model` of a session (the answer to `session/new`, `config_option_update`, `current_mode_update`) is merged into the record of the agent of that session
(`catalog.nv`: a list the summary lacks stays the last one given; nothing changed - nothing is told or written). A changed record is told to every page at once as the event
`agent_catalog` `{ agent, ...record }` (id `catalog/<agent>/<updated>`, trace `agents`), and every page that attaches gets all the records before the sessions. The file is written
whole (a temporary file, then a rename), not oftener than every 2 s; at the start the hub reads it, a damaged one is ignored with a line in the log. `GET /api/agent-catalog` gives the file
as it is (`{"agents":{}}` when there is none; a foreign `Origin` is 403). The values are ids and names the agent offers, no secrets.

### The voice: `/api/stt`

The front turns a recording into text with a local recognizer (task 192f); nothing is sent to a cloud service.

- `POST /api/stt?lang=<ru|en|auto|...>`: the body is a WAV (`Content-Type: audio/wav`, 16 kHz, mono, 16 bit; up to 25 MiB). The front passes it to `stt.url` as `multipart/form-data` (`file`, `language`, `response_format=json`) and answers `200 {"text":"..."}`. Without `lang` the `language` of the settings is used. Errors are `{"error":"<reason>"}`: 400 (not a WAV, empty, a bad language), 403 (a foreign `Origin`), 502 (the recognizer answered something else), 503 (it cannot be reached). A body over 25 MiB is refused by the server itself with 413 and a plain-text body.
- `GET /api/stt/status`: `{"available":true|false,"provider":"local","model":"small"}`; when `available` is false the answer also has `reason`: `starting` (the model is loading, up to 30 s), `not_installed` (also `"hint":"scripts/install-stt.ps1"`), `failed` (it did not start or ended), `not_running` (a foreign or an unmanaged recognizer does not answer).

### Speech recognition (Whisper)

Whisper is a part of the control panel: the front starts it and ends it with itself. The files (whisper.cpp with CUDA, 685 MB, and the model `small`, 488 MB) are not in the repository (the public repository takes no file over 100 MB); `tools/stt/manifest.json` lists the addresses, sizes and SHA256.

- **Install, one command:** `powershell -File scripts/install-stt.ps1` downloads the files of the manifest, checks the size and SHA256 (a mismatch stops it and the file is deleted), and unpacks them into the tool folder: `CREW_STT_DIR`, else `%LOCALAPPDATA%/crew-harness/stt`. A second run downloads nothing when everything is in place. `-Model medium` installs the larger model (then set `stt.model` to `medium`); `-Check` only says whether everything is there.
- **Autostart:** with `stt.managed` (the default `true`) the front, at its start, (1) ends an orphan of ours left by a front that died (`<data_dir>/stt.pid` names a live `whisper-server`); (2) if something already answers at `stt.url`, uses it and never touches or ends it; (3) else, if `stt.dir` holds `bin/whisper-server.exe` and `models/ggml-<model>.bin`, starts `whisper-server` hidden on `127.0.0.1` at the port of `stt.url` and waits up to 30 s for `GET /` to answer 200 (the status is `starting` meanwhile); (4) else the status says `not_installed` and the log names `scripts/install-stt.ps1`. The front never fails because of the recognizer.
- **Autostop:** the recognizer is a child of the front in a Job Object (`Tree.Group`), so it ends with the front however the front ends (Ctrl+C, a kill, a crash). The pid file is the second line of defence: if a recognizer of ours is somehow left, the next start ends it and starts a new one.
- **Variables:** `CREW_STT_DIR` (the folder of the installer and the default of `stt.dir`), `CREW_SERVER_STT_DIR`, `CREW_SERVER_STT_MODEL`, `CREW_SERVER_STT_URL`, `CREW_SERVER_STT_MANAGED=false` (the recognizer is yours: nothing is started or ended), `CREW_SERVER_STT_LANGUAGE`.
- **Check:** `curl http://127.0.0.1:<port>/api/stt/status` gives `"available":true`; `curl -X POST --data-binary @voice.wav -H "Content-Type: audio/wav" "http://127.0.0.1:<port>/api/stt?lang=en"` gives `{"text":"..."}`.
- **By hand (emergency):** `scripts/start-stt.ps1` and `scripts/stop-stt.ps1` start and stop a recognizer on `127.0.0.1:8178` outside the front (the front then uses it as a foreign one).
- Tests: `powershell -File scripts/tests/test-install-stt.ps1` (the installer), `nova test src/server/front/sttproc_test.nv` (the plan, the pid file, the orphan, the status).

### The pictures of a message: `/api/session-image` (task 192)

The owner pastes a screenshot from the clipboard (or drops an image file) into the card of the control panel and sends it with the message.

- `POST /api/session-image/<session>`: the body is the raw bytes of a picture (`Content-Type`: `image/png`, `image/jpeg`, `image/webp` or `image/gif`; up to `max_image_bytes`; the first bytes must say the same as the type). The front keeps it as
  `<data_dir>/<session>/images/<n>.<ext>` (`n` grows through the whole session: 1, 2, ...) and answers `200 {"n": 3, "bytes": 1234}`; `400` the bytes are not that type or the id is not a safe name, `413` too big, `415` another type.
- `GET /api/session-image/<session>/<n>`: the file with its `Content-Type` (`404` none). The session id and the number are checked by a mask (a safe name, digits without a leading zero): no address leaves the images folder.
  Only `127.0.0.1` listens, and an upload from a page of another origin is refused (as the WebSocket).
- The message names the pictures by number: `{"kind":"user_message", "input":{"turn":..., "text":..., "images":[{"name":"image.png","n":3}]}}` (the hub also takes `{"name","mime","data"}` with base64 and keeps the file itself; at most 6 pictures, each up to `max_image_bytes`).
  **Why not base64 in the message:** the hub reads its stdin one byte at a time (about 40 microseconds a byte, workaround 31), so a screenshot of a megabyte in a line would stop the hub for 40 seconds.
- The journal keeps a record before the message: the signal `message_images` `{"images":[{"n","name","mime","bytes"}]}` (never the bytes); the page gets the same line and puts the thumbnails into the bubble of the message that follows; after a reload the page loads them from `GET /api/session-image/...`.
- To the agent: `session/prompt` gets `[{"type":"text","text":...},{"type":"image","mimeType":...,"data":<base64>}]` ONLY if the agent said `agentCapabilities.promptCapabilities.image = true` at `initialize`. Otherwise no picture is sent: the text goes with the note
  `[приложено изображений: N, агент их не принимает]` and the feed shows the line "the agent does not take pictures; only the text was sent" (the signal `images_skipped`). When the family changes in the window, a picture in the protocol is the line `[изображение: имя]`.
- The raw trace (`<session>.acp.jsonl`) holds `"data":"<image N bytes>"` instead of the base64.

## Questions of the agent (Вопросы агента)

Task 192i. The owner asked for the form of questions with a choice that the assistant itself has (`AskUserQuestion`), and for the agents to use it. The page shows a form;
the hub gives the agent the answer in the shape that agent wants.

### How each agent asks (read from the sources of the adapters installed on this machine, and from the raw exchange `<session>.acp.jsonl`)

All four ask with the same call of ACP: **`elicitation/create` in the mode `form`** (a call of the agent to the client: `{mode:"form", sessionId, toolCallId?, message, requestedSchema}`), and only if the client
said so at `initialize` with `clientCapabilities.elicitation.form`. **Not by `session/request_permission` with `rawInput.questions`**: no adapter of the four does that for the questions (Kimi uses
`session/request_permission` as a fallback, see below). There is no method `session/elicit`; `elicitation/create` and the notification `elicitation/complete` (the mode `url`) are in the SDKs of all four.
The hub did not declare the capability before this task; it does now (`ask_form`), and **Claude Code has no tool `AskUserQuestion` at all without it** (the adapter lists the tool as disallowed).

| Agent (version) | Its tool | Without `elicitation.form` | The form it sends | How to answer (`result` of `elicitation/create`) |
|---|---|---|---|---|
| **Claude Code** (`claude-agent-acp` 0.94.0) | `AskUserQuestion` | the tool is switched off | `message` = the question (one) or "Please answer the following questions."; a field `question_<n>`: a string with `oneOf` (`const` = `title` = the label, `description`), or, for `multiSelect`, an array with `items.anyOf`; the `title` of the field is the header, with many questions its `description` is the question; a field `question_<n>_custom` (string) for an own answer | `{action:"accept", content:{"question_0":"<label>", "question_0_custom":"<own text>"}}` (an array of labels for a multi-select; the own text joins the choice of a multi-select, is the answer of a single when nothing is chosen, or a note to it). `{action:"decline"}`: the model is told the user skipped. `{action:"cancel"}`: the tool use is aborted |
| **Codex** (`codex-acp` 2.2.2) | `request_user_input` | answers come empty | `message` = "Codex needs your input to continue."; a field named by the id of the question: `title` = the question, `description` = the header, a string with `oneOf` (label, description) and an option "None of the above" when `isOther`; a field for a note that names its question in `_meta.codex.questionId`; all `required` | `accept` with `content:{"<id>":"<label>", "<id>_note":"<text>"}`; `decline` and `cancel`: empty answers |
| **Kimi Code** (2.1.1) | `AskUserQuestion` | `session/request_permission`: a tool call titled `AskUserQuestion` with the text of the FIRST question, options `q0_opt_<i>` (`allow_once`, the label) and `q0_skip` (`reject_once`); multi-select is asked as single. Answer `{outcome:{outcome:"selected", optionId:"q0_opt_1"}}`, `cancelled` or the skip is "dismissed" | fields `q<n>`: a string with `oneOf` or an array with `anyOf` (`minItems` 1), `title` = the header, `message` = the questions joined by a line break, all `required`; no field for an own answer | `accept` with `content:{"q0":"<label>", "q1":["<a>","<b>"]}`; `decline`/`cancel`: dismissed |
| **OpenCode** (2.0.26) | `question` | the tool fails; the model reads "The question couldn't be shown to the user in this client. Continue without an answer" | fields `<key>` (string with `oneOf`, `const` = the value, `title` = the label; or an array with `anyOf`) and `<key>_custom` for an own answer; a form with a field that looks like a secret (password, token, key...) is not sent | `accept` with `content:{"<key>":"<value>", "<key>_custom":"<text>"}`; `decline`/`cancel`: the form is cancelled |

`initialize` of the four (checked live): `mcpCapabilities.http` is true for all four (`sse` too for Claude Code and Kimi Code; Codex adds `acp:false`); `promptCapabilities`: `image` and `embeddedContext` for all, `audio:false` for Kimi.
An agent says nothing about elicitation: it is a capability of the client. A request of an agent is withdrawn with `$/cancel_request` (Claude Code does it when the tool use is aborted): the hub answers `cancel` and takes the form away.

So **every one of the four has its own tool of questions, and the native way (this section's table) is the one the hub uses**: `ask: native` is the default of an agent; no MCP server is started for them.
For an agent without its own tool the hub has the universal way below (`ask: mcp` in the settings of that agent).

### What the hub does (native questions)

`Hub` -> `AcpClient.on_elicitation` (`src/acp/client.nv`) -> `project_question` (`src/acp/ask.nv`). A form is read by its fields, not by the name of the agent: a field with options is a question, a text field named
`<key>_custom` or marked as the note of a question (`_meta.codex.questionId`) is the place for an own answer of that question, a plain text field is a question with no options. The text of the question, the header and the label of an option
are taken as the agents write them (the four shapes above are the tests of `ask_test.nv`). A call that is not a set of questions (the mode `url`, a number field...) is declined.

The page protocol (the contract with the page of the control panel):

| Direction | `kind` | `input` |
|---|---|---|
| server to page | `question_request` | `{ turn, request, tool_call, questions:[{ question, header, multiSelect, options:[{ label, description }] }] }`; `request` is the key of the call (the JSON-RPC id, or `mcp-<n>` for the MCP tool) |
| page to server | `question_answer` | `{ request, skipped:false, answers:[{ index, selected:[label...], other }] }` or `{ request, skipped:true }`; `other` is the own text of the owner or an empty string |
| server to page | `question_resolved` | `{ request }`: the question is settled (answered, skipped, withdrawn by the agent, its term passed, the turn was cancelled); the page takes the form away |

A skip is `decline` (the agent goes on, told that the user skipped); a cancel of the turn answers `cancel` to the agent and tells the page `question_resolved` before the `cancel`; the request is in the journal (`question_request`
as a progress of the turn, `question_answer` as the owner's event), so a reloaded page sees the form again if the question is still open and a settled one as settled. An answer nobody asked for changes nothing.

### The universal way: the MCP tool `ask_user_question`

For an agent with no tool of its own (`ask: mcp` in its settings). The hub starts a small MCP server (`ask_mcp.nv`, `ask_mcp_server.nv`) when some agent needs it:

- `127.0.0.1` and a port the system chooses (one for the hub; the log says which); `POST /mcp/<session>` with the header `Authorization: Bearer <token>` (a random token for the hub); a request with an `Origin` header is refused, a `GET` is `405`.
  Streamable HTTP of MCP as far as needed: `initialize`, `ping`, `tools/list`, `tools/call`, a notification is `202`. One JSON-RPC message per `POST`, one JSON answer, the connection closed.
- The tool `ask_user_question`: `questions:[{ question, header, multiSelect, options:[{ label, description }] }]` (options may also be plain strings); the result is a text, `Вопрос: ... Ответ: ...` for each question, or
  "Пользователь пропустил вопрос."; a call that is not answered in `ask_timeout_seconds` (30 minutes) gives "таймаут ожидания ответа" and the form is taken away.
- It is handed to the agent in `session/new` (`mcpServers`: an `http` server `crew` with the address of the session and the token in `headers`) **only when the agent said `mcpCapabilities.http`**; otherwise nothing is given
  and the log of the session gets a note (`acp_note`). The first prompt of the session (and of an agent after a change of the family) gets a short note before the text of the owner: "Если нужно что-то уточнить у пользователя или
  выбрать между вариантами - вызывай инструмент ask_user_question (сервер crew), не пиши вопрос текстом"; the note is not in the journal and not in the feed.
- The call blocks until the page answers (`question_answer` with the key `mcp-<n>`), a cancel of the turn answers it "skipped".

The trace `<session>.acp.jsonl` holds the line of `session/new` with this token and the address; the token lives as long as the hub run and works on the loopback only.

Checked live (2026-10-26, a hub of its own on port 8105, the real agents): Claude Code asked by `AskUserQuestion` and got the choice, Kimi Code the same; Claude Code with `ask: mcp` was handed the server, called
`mcp__crew__ask_user_question` after the note and got the choice; Codex did not ask in 140 s (its tool `request_user_input` is for the plan mode of Codex, so it may never ask in a plain chat); OpenCode could not be
checked: its model answered "Free usage limit reached" (the quota of the account, not the hub).

Tests: `src/acp/ask_test.nv` (the forms and the answers, pure), `src/acp_live/client_test.nv` (the fake agent asks, is answered, is skipped, is cancelled; the server goes to `session/new` only to an agent that takes HTTP),
`src/server/ask_mcp_test.nv` (the messages), `src/server_live/mcp_test.nv` (the sockets: the token, the origin, a call that waits, a term), `src/server_live/hub_test.nv` (the scenarios `scenario_question`,
`scenario_question_off`, `scenario_question_mcp`, `scenario_question_mcp_timeout`; the fake agent `src/acp/testdata/fake_agent.mjs` asks with `ask`, `ask2`, calls the tool with `askmcp`).

### The projects of the control panel (task 192m)

A project is a name, folders and environment variables for the agents; the sessions are made inside a project (the folder is chosen from the project's folders).

- **The file.** `<data_dir>/projects.json`: `{"version":1,"projects":[{"id","name","folders":[{"path","branch"?,"worktree"}],"env"}]}`. It is replaced as a whole (a temporary file in the same folder, then a rename), so a reader never sees half of it. The front writes it (it has the routes), the hub only reads it. **The values of `env` are kept in this file as plain text** (the machine of the owner is its only reader): keep the data folder as private as the other files of the owner. The id is 12 random hex digits (a mask is checked on every request).
- **The routes** (`127.0.0.1` only, a foreign `Origin` is 403, as for `/api/stt`; an error is `{"error":"<reason>"}`): `GET /api/projects` (the list: `id`, `name`, `folders`, `env_keys` - **the names of the variables, never the values**), `GET /api/projects/<id>` (the whole project with the text of `env`), `POST /api/projects` (body `{name, folders, env}` -> 201 `{"id"}`), `PUT /api/projects/<id>` (all the fields are replaced -> 200), `DELETE /api/projects/<id>` (200; the sessions made in the project stay with their `project_id`). A text of `env` that does not parse is 400 `{"error":"строка N: ..."}`, the line where the entry begins.
- **The format of `env`** is the `.env` format: `KEY=VALUE` lines; empty lines and `# comments` are skipped; `export KEY=VALUE` is allowed; blanks around `=` are allowed; a value in double quotes may span lines and has the escapes `\n`, `\r`, `\t`, `\"` and `\\` (any other backslash stays as it is); a value in single quotes is taken as it is (it may span lines too); without quotes the value ends at the end of the line and ` #...` starts a comment; a name that comes twice keeps the last value; at most 64 KiB and 256 variables (`src/projects/dotenv.nv`).
- **The folders.** `GET /api/fs/list?path=<absolute path>` -> `{"path","parent":"D:/"|null,"entries":[{"name","dir":true}],"truncated","recent"}`: the folders only (never a file), sorted by name without the case, the hidden ones (a name that begins with `.` or `$`) at the end, at most 500 (`truncated` says more were cut); no `path` -> the roots (the drives `C:/`, `D:/`...) as the entries and `recent` (the folders of the projects, the newest first). There is no limit by roots (the owner chooses his own folders); the path is checked (absolute, no `..`). `GET /api/fs/git?path=` -> `{"is_repo","branch"}`: the branch is read from `.git/HEAD` (also from a work tree, whose `.git` is a file), so no `git` process is started and there is nothing to wait for; `HEAD` is a detached head, as in `git rev-parse --abbrev-ref HEAD`.
- **A session of a project.** The page adds `project_id` and `folder` to `session_created`. The hub checks that the project exists and that `folder` is one of its folders (without `folder`, the first one); the folder is the working folder of the agent (`session/new` `cwd` and the folder of the process), and `session_created` keeps `folder` and `project_id` (**only the id**: no variable is in the journal, the snapshot, the trace of ACP, the inbox, a log line or an error). A project that is not there, or a folder that is not in it, is an `error` event and no session. A session without `project_id` is as it was (the working folder of the hub, no variables).
- **How the variables reach the agent.** In the environment block of the process of the agent, at its start (`Command.env` of `std.os`), and nowhere else: not the command line, not a file, not the protocol. The block is the environment of the hub **plus** the variables of the project, the project wins (on Windows the names are the same in any case). *Why the hub builds the whole block:* the runtime of Nova Oracle 0.1.0 starts a process with an explicit environment with exactly the variables it was given (the rest of the environment is not added), so a block of the project alone would leave the agent without `PATH`. The variables are read from `projects.json` at **every** start of an agent (a session that starts again after a restart of the hub, a change of the family `session_agent`), so a change of the project reaches the next start; a project that was deleted gives no variables, the session goes on in its folder and the log says that the session starts without them (no value). The running agent keeps the environment it started with.
- **The agent for the tests.** `src/acp/testdata/fake_agent.mjs`: the prompt `env NAME...` answers `env NAME=[value]; OTHER=<unset>`, the prompt `cwd` answers `cwd: <folder>`. The scenario is `scenario_project` (`src/server/testkit_project.nv`, `src/server_live/project_test.nv`).

## The modes of work (task 192q)

The four modes are in the control panel under the input field: **Interactive** (the small route: the owner writes, the agent does; the default of a new session), **Fast task** (the fast route, six steps), **Full path** (the full route, eight steps) and **Planning** (the agent does not do the task and does not change the code: it brings the assignment to readiness, four steps).
The texts - the instruction for the agent and the steps with their prompts - are files, `doc/routes/{interactive,fast,full,planning}.md` ([format](../../doc/routes/README.md)), parsed by `routes.nv`.

- **The mode of a session** is the signal `route_set` of its journal (`session_route` of the page); it comes back on resume; the default is interactive. A page that attaches gets `route_state` of every session.
- **The instruction** of the mode (fast, full) is put as a hidden note before the message of the owner once per change of the mode and per start of the agent, and the files of the subtask each time (`AcpClient.set_prelude`; it is in neither the feed nor the journal).
- **The debug state of the machine** (task 192.1, `machine_hub.nv`). The page event `machine_state` `{machine, table:"dialog", state, since, started, last_input, data, journal:[{code,at,note}]}` goes to every page when the state of the machine of a session changes (the data alone - at most every 400 ms), when a page attaches (after the lines of the sessions) and on the signal `machine_state_get` of the page. `since` is the time the machine came into the state; `journal` is the last 20 lines of the journal of the machine; a part (`data`, `last_input`) above 64 KiB is replaced by `{truncated:true, size, head}`. It is state to look at, not history: it is not written to the journal of the session and not kept in the lines a page gets on attach. The data of the table of the dialog are the texts of the turn and counters, no secrets.
- **Recognition of the tasks (task 192.2).** The messages of the owner are **not a journal**: in the mode interactive the hub makes no task, no `message.N.md` and no tree by itself. The way to a task is the button **"Распознать задачи"** (signal `route_recognize`): the hub sends the agent a hidden note ("[crew] Распознай задачи ...") with the list of the tasks of the session and the candidates already kept, the agent calls the MCP tool **`crew_task_list`** `{tasks:[{id, kind:"new"|"extend", title, summary, extends, touches:[files], note}]}` (a fallback for an agent without tools: a line `[[crew_task_list]] {json}` at the end of its answer, read when the turn is over), and the hub shows **one card** `route_state.proposals` (`listed:true`): a row for each work with the buttons "В работу" / "Дополнить K" (for `extend`), "Обсудить дальше", "Забыть" (`route_prop {id, action}`: `start`, `extend`, `discuss`, `forget`, and at a problem `wait`, `parallel`, `over`, `queue`) and a field for the quick answer (`route_quick {text}`: `1, 2, 4 — в работу; 3 — обсудить; 5 — забыть`, also ranges `1-3` and `work`/`discuss`/`forget`; what is not understood applies nothing and the feed says the format). "Обсудить дальше" keeps the item as a **candidate** (`route_state.candidates`; the next recognition does not repeat it); "Забыть" drops it and remembers the title (the agent is told not to propose it again). "В работу" makes the task (the first work of the session: the folder, the tree by the switch "Worktree") or the subtask (`message.N.md` = the summary of the agent + the last message of the owner, `images/`); "Дополнить K" appends the summary with the date to `message.K.md`. After a decision the agent gets a service turn with the note (it does not touch the files before). **The rules of the parallel work are automatic:** the `touches` of the new work are compared with the ones of the subtasks in work (`taskwt` `overlap`): no overlap - a tree of its own and a parallel turn at once; an overlap (or unknown files while something runs) - the card says "пересекается с задачей K по: files" with "Подождать" (the subtask waits for K and starts by itself when K is done) and "Всё равно параллельно в своём дереве". **The limit** `route_max_active`: reached - "в работе уже N задач (лимит N)", the over-limit word or "Запустить сверх лимита" / "Поставить в очередь" (the queue starts when a place is free). The panel shows "в работе N из лимита M". With `route_auto_propose` the agent may also propose a single work by `crew_task` (the same fields, one card, the code word `route_confirm_word`). The modes with steps keep their rule: the first message makes the task, the next ones extend the last subtask or open a new one. Old tasks with a subtask for each message are read as they are.
- **The task and the subtasks.** A message in a mode with tasks opens a task `NNN-<slug>` (NNN is the greatest number in `doc/tasks/` and in the branches `task/*` plus one; outside a repository - in `<data_dir>/<session>/tasks/`): the folder `.../task/` with `message.N.md` (the message and its date) and `progress.N.md` (an empty checklist of the steps). In a git repository with `doc/tasks/` the folder is in the **tree of the task** (branch `task/NNN-<slug>`, next to the repository in `worktrees/`, from `origin/main` or the current branch); the agent works in that tree. The mode interactive makes a task and a tree too (in a repository), with no steps. The next message **extends** the last subtask (a supplement in `message.N.md`, `merged_into` in `route_state`) while its checklist is not complete, else opens subtask N+1; the owner can force it for the next message (`route_subtask_new`, `route_subtask_same`).
- **The observer** reads the progress files every 2 s (`- [x]` and `- [ ]`) and sends `route_state` when something changed (`{route, steps:[{n,title,state}], running, task:{id, number, title, branch, worktree, state, unmerged_commits, subtasks:[{n,title,state,done,total,items,...}], ...}}`).
- **The run of the steps** (`route_run`): a step of kind `self` is a service turn of the same agent (the feed shows "Шаг режима: <title>", the prompt of the step is the hidden note); a step of kind `independent` is done by a hidden agent of **another family** (`route_reviewer_order`), who gets the prompt, the message of the task, `git status`, `git diff HEAD` and the last answer, and whose answer comes into the feed as the block "Независимая проверка (<family>)"; `route_skip` skips a step that is not required, `route_stop` ends the run. The state of the steps is `route_step` in the journal.
- **Finishing and merging.** A task lives as long as its session is in the list: its tree and its branch stay. There is no "keep" and no list of parked tasks; closing a task whose tree holds work (`route_new_task`) is refused with a word to finish it. A task whose tree holds work is offered **three ways** (`task.finish`, `finish_options`): **"Слить в main"** (`route_merge`; `route_publish` is the same signal), **the steps of the finishing as a fast task** or **as a full path** (the mode is switched and the run goes on; the run makes the state `ready`, and the card "ready" has the same merge button).
  - **"Слить в main" is the word of the owner to push** (the card says "push в origin/main"): the hub commits what the agent changed and did not commit in **one** commit (`git commit -s`; the subject is the number of the task and the words of its slug in English; the files are named in a list for `git add --pathspec-from-file`, never `add -A`: the changed and deleted tracked files and the new files that are not ignored, except the temporary ones - `*.tmp`, `*.log`, `~`, `Thumbs.db`, the record of the tests; nothing changed - nothing is committed), commits the files of the task (`doc/tasks/<task>/`), and goes through `publish` of the git module of the tasks (task 192r, `taskwt.nv`, seen through `taskwt_adapter.nv`): fetch, `rebase --rebase-merges origin/main` (a conflict is resolved by the agent in a service turn, `route_fix_attempts` tries, then `needs_owner` and the owner), **no tests** (they may run for hours and do not block the merge), `git push origin HEAD:main` (never forced), the main copy by `merge --ff-only` only when it is clean and on `main` (else the note says why it was not updated), the tree and the branch removed. The only way to the remote is `tw_push`, called by the end of `publish`.
  - **The tests are shown, not required.** The record of the last run of the tests of a branch is the file `tests-run.json` in the folder of the task (`{commit, at, result, command}`; written by the step of the tests of the mode - the step whose prompt asks for the last line `ТЕСТЫ: ЗЕЛЁНЫЕ` / `ТЕСТЫ: КРАСНЫЕ` - and by the button "Прогнать тесты"; it is never committed). `route_state.task.tests` says `{branch: {state, result, commit, head, at, command}, main: {state, source, ...}}`: `state` is `green`, `red`, `never` (no run) or `outdated` (the run was not on the head of the branch now, with the last result in `result`). The state of main is the last run of CI on GitHub (`gh run list`, asked at most every two minutes, 15 s at most; no `gh`, no network, no run: `never`, the page says "CI: нет данных"). `route_tests_run` (the button) starts, in the background and without blocking the chat, a hidden agent of the family of the session in the tree: it runs the tests of the affected part and ends with the mark of the verdict, the hub writes the record and a line in the feed (`task.tests_running` while it goes; the requests of this agent for permission are allowed, as the button is the owner's word; the independent review is never allowed anything).
  - **A stale session.** `route_keep_days` (30, 0 - none): a session with a tree that nobody touched that many days (the last event of its journal, the last page signal, the last commit of the tree) is `task.stale` with `idle_days`; the page asks "delete the tree and the branch?". The hub deletes nothing by itself. `route_tree_drop {force}` (the button) takes the tree and the branch away (the folder of the task is first copied to the data folder and the task goes on without a tree); work that is not merged only with `force`. Deleting a session (`session_delete {branch?}`) takes its tree and branch with it only when there is nothing to lose (no commits not in `origin/main`, no changed files); else they stay unless the owner said `branch: "drop"` (the page asks).
- **The place of work (the switch "Worktree").** `session_created` takes `route` (default interactive) and `worktree` (default true). With the switch **on** a task gets a tree and a branch (as above); **off** - the agent works in the folder of the project on its current branch, no tree is made (the mode interactive keeps no task then; the fast and the full keep one in the data folder), and `task.finish`/merge do not apply. `session_worktree {on}` turns it on later (a task that has none gets a tree at once) or off (only while there is no tree). `route_state.use_tree` tells the state.
- **The mode Planning** (`doc/routes/planning.md`, steps: the interview by the form of questions, the formulation of the assignment, the independent check of it, the end). The task is **numbered at once** (the numbers of `doc/tasks/` and of the branches), but **no tree is made** while the mode is planning: the folder of the task is in `<data_dir>/<session>/tasks/NNN-slug/task/` (outside a repository too). The agent writes the section «Задание» (what and why; the criteria of acceptance; the limits and risks; the estimate T) at the end of `message.N.md`; **no `spec.md` and no `plan.md`** (they come later, in the steps of the fast and the full mode). The pictures of a message of the owner (in any mode with a task) are copied to `images/` of the folder of the task and a line `![name](images/image-K.ext)` is added to `message.N.md`. The finished run of the planning leaves the task open. When the owner chooses another mode (`session_route`) the task, its number and its files go on: with the switch on, the tree is made and the whole folder of the task (with `images/`) moves into it (`route_task` `attach_tree`; the files are committed with the work), the checklist of the subtask is made again for the steps of the new mode, and the hidden note says that the section «Задание» is the statement and where the pictures are. The same happens when the owner turns the switch on during the planning.
- **Signals of the page:** `session_route`, `route_run`, `route_skip {step}`, `route_stop`, `route_new_task`, `route_subtask_new`, `route_subtask_same`, `route_subtask_worktree {n}`, `route_subtask_done {n}`, `route_subtask_parallel {n,on}`, `route_subtask_choose {n,tree}`, `route_merge`, `route_tests_run`, `route_tree_drop {force}`, `route_diff`, `session_worktree {on}`. Signals of the journal: `route_set`, `route_task`, `route_step`, `route_note`, `route_review`.
- Tests: `nova test src/server/routes_test.nv` (the parser, the numbers, the progress files, the rules, the state), `src/server/taskwt_test.nv` (the git module), `src/server_route_live/routes_live_test.nv` (the scenarios `scenario_route_*` of `routes_kit.nv` on the fake agent, on a temporary repository and on a temporary repository with a remote: tasks, trees, the run, the review, the merge with a conflict, publishing only by `route_publish`).

## The chat runs on Alula

Since task 114 the hub runs every session on the machine of the many-turn chat written as a table of Alula (2.11 at the start, 2.22 since task 152: blocks, `=>`, `тип Имя перечисление`, a free input of the user),
`src/machine/machines/dialog.alula.md` of the package `alula`, and not on the machine written in Nova.

- **Where the machine comes from.** `dialog.alula.json` is the translation of the table `dialog.alula.md` (`alula compile`, no hand edit; a test compares the translation with the committed file).
  Since task 248 nothing of `machines/` is compiled into the programs: the hub reads the folder of the machines when it starts (`start_hub`, `crew_harness.product_machines.load_product_machines`):
  the setting `machines_dir` (`CREW_SERVER_MACHINES_DIR`), else `machines/product` beside the program (the release kit), else `machines/product` beside the folder of the program (the build of the tree:
  `target/` beside `machines/`). It reads `dialog.alula.json`, `dialog.alula.md`, `journal.md` and the libraries they connect (`libs/call_cancel.alula.md`) and checks them: every file is there,
  the `alula_version` of the tree, the table and every library is the version of the engine (0.27), the hash of every connection is the `definitions_hash` of the file of the library. A failure stops the start
  with the path (`the hub cannot start: the machines of the product cannot be read: <path>: ...`); there is no copy to fall back on. The hub writes the folder to its log
  (`the machines of the product: <folder> (DialogSession)`). `src/server/alula.nv` makes `AlulaMachine` once from the tree read; a machine that cannot be made stops the start with the message
  `the dialog machine cannot be made: ...`. The release kit is `sh scripts/package-release.sh <folder> [--build]`: `crew-harness.exe`, `crew-hub.exe` and `machines/product` (the dialog, the journal, `libs/`;
  no `tests/`, no chat), checked by `scripts/guards/check-release-kit.py --kit <folder>`.
- **The states.** `Idle` (waits for a message), `Awaiting` (a request to the agent is open) and the end `Closed`. After an answer, a refusal, an idle term and a cancel the session
  goes back to `Idle` and forgets the turn (the data of the turn are cleared, as the state `Idle` of the machine in Nova holds nothing). The journal codes and their parameters, the numbers of requests
  (`agent-1`, `agent-2`...) and the notes of an event the state does not expect (`event_ignored`) are the same as before. The end `Closed` is reached by the signal `close_session`, which only the table has: the
  hub never sends it (a table needs one reachable end), the machine in Nova takes it for an event of an unknown name.
- **The idle term.** It is the parameter `СРОК_БЕЗДЕЙСТВИЯ` (the name as written in the table, AL-46) of the table with the key of the project `проект.срок_бездействия` (format 2.7, P-9, default 900000 ms). The hub gives it
  `idle_term_seconds * 1000` of the settings through the table of the parameters of the project (`alula_machine_with`); nothing else of the settings reaches the machine.
- **What the page sees.** Nothing changed: `page_event` takes the events of the engine (the journal codes and the names of the events), the states for the page (`Idle`, `Awaiting`)
  are the names of the states of the table (for people: the code does not compare them, see the next section), `/ws` and `src/web/` are as they were.
- **Snapshots.** The state of a session in the store is now the state of the Alula machine: `{"state":"Awaiting","started":true,"input":null,"data":{...}}`. A snapshot of the old form
  (`{"state":"Awaiting","user":...,"reply":...}`) is **not migrated**: there are no such sessions in a product base; the hub does not resume it and writes `the session <id> cannot be resumed: no usable snapshot` to its log.
  A session of the new form is found by the store after a restart and goes on through `resume_engine`.
- **Primitives.** The chat has none (`## Примитивы` is empty); the step reads the world through its event only (the clock is the stamp of the event). The default host of the engine is enough,
  so the server has no host of its own with a real clock: a step stays a function of the state and the event.
- **How it was checked.** `src/machine_dialog` of `alula` takes every row of the table by a scenario (the mark `taken`, 8 rows of 8) and checks the parameter of the idle term. The ten scenarios of the hub
  (`testkit.nv`) run over files and over PostgreSQL on the Alula machine. The machine in Nova (`dialog_session`) and its comparison with the table (`src/machine_dialog_eq`) were removed on the word of the owner (2026-10-26).
- **No switch.** The hub runs on Alula only; there is no setting "nova/alula".

## The border of the table and the code (Граница таблицы и кода)

Task 126. Where the behaviour of a session is written in the table `dialog.alula.md` (`src/machine/machines/` of the package `alula`), and where it is written in code. The hub does not know the name of any
state of the table: it asks the table.

**The table decides** (change it in the table, the code stays): the states and what leads from one to the other; which signal a state takes (`сигнал(...)` for a signal of a party and for a signal of the machine, `часть(...)`, `ответ`, `сбой`, `срок`; since the language 2.14 the signals of a party stand in the column `сигналы` of its row, AL-38);
the codes of the journal and their parameters; the data of the turn (the two texts) and when they are cleared; the numbers of the requests of the agent (`agent-1`, `agent-2`...: the counter of the party, the mechanics);
what the request to the agent holds (`подсказка`, `реплика`); the cancel of the open requests (`отменить_открытые`); the idle term (the parameter `СРОК_БЕЗДЕЙСТВИЯ` as it is written in the table, the key of the project `проект.срок_бездействия`);
the end `ЗАКРЫТО` (the signal `закрыть_сессию`, which the hub never gives).

**The code decides** (change it in the code, the table stays): which event of the page becomes which signal (the table below); whether a signal may be given now (`Hub.takes_message`, one question to the machine, see below);
the process of the agent (start, stop, the pump of its events); how an update of ACP becomes a signal (`project_update`) and how a stop reason becomes an outcome (`stop_event`); the term as a timer of the engine (the event
`срок`); the store (files or PostgreSQL), the journal, the snapshot; the lines of the page (`page_event`), the `turn` of the page, the synthetic `error` events of the page (they are not kept).

### The signals the code gives to the table

The list as data is `signals.nv` (`signals_given_by_code`, `signals_from_agent`); `signals_test.nv` keeps it equal to the table and to the sources.

| signal | who gives it | fields | the table |
|---|---|---|---|
| `user_message` | the hub, `Hub.say`, from the page | `content` (text) | declared: a signal of the party `пользователь`; the row of `ПОКОЙ` |
| `cancel` | the hub, `Hub.cancel`, from the page | none | declared once, as a signal `отмена`; the row `сигнал(отмена)` of `ОЖИДАНИЕ` (in `ПОКОЙ` it is a note `event_ignored`) |
| `permission_decision` | the hub, `Hub.decide`, from the page | `request`, `decision` (JSON text) | **not known** on purpose: it goes to the client of the agent, and the engine journals it; the machine writes `event_unknown` |
| `question_answer` | the hub, `Hub.answer`, from the page (and `Hub.cancel` for the questions it withdraws) | `request`, `skipped`, `answers` (JSON text) | **not known** on purpose, like `permission_decision`: the client of the agent or the MCP tool gets the answer, the engine journals it |
| `setting_chosen` (task 192t) | the hub, `Hub.watch_agent`, when the agent took a choice of the owner | `agent`, `setting`, `value`, `at` (JSON text) | **not known** on purpose, no page event. The last word per `(agent, setting)` is read back at the resume of the hub; every agent that is started for the session (first start, after a death or a restart of the hub, after a change of the family to that family) is asked for these choices after `session/new` (`AcpClient.set_presets`), and the first summary of the page waits (at most 5 s) until they are settled |
| `setting_dropped` (task 192t) | the hub, `Hub.watch_agent`, when the new agent does not offer a saved value | `agent`, `setting`, `value`, `used` (JSON text) | **not known** on purpose; the page gets the event `setting_dropped` (a grey line in the feed); the saved choice is dropped (a later start does not ask for it) |
| `session_created` | the hub, `Hub.create`, from the page | `name`, `agent`, `folder`, `project`, `project_id` (JSON text) | **not known** on purpose (below) |
| `agent_chunk` | the client of ACP, `project_update` | `content` (text) | declared: a part of the answer of the party `агент`; the row of `ОЖИДАНИЕ` |
| `agent_done` | the client of ACP, `stop_event` (`end_turn`) | none | the answer: the row `ответ` of `ОЖИДАНИЕ` |
| `agent_refused` | the client of ACP, `refused_event` | the code of `FailCode` | the failure: the row `сбой(код)` of `ОЖИДАНИЕ` |
| `timeout` | the engine, when the term of a request ends | none | the term: the row `срок` of `ОЖИДАНИЕ` |
| `agent_thought`, `tool_call`, `tool_call_update`, `usage_update`, `plan`, `permission_request`, `question_request`, `question_resolved`, `acp_skipped`, `acp_note`, `agent_model` | the client of ACP (`question_request` is also the hub's own event for the MCP tool) | JSON text or text | **not known** on purpose: the page sees them (`page_event`), the machine writes `event_unknown` and nothing changes |

- **`session_created` is a signal the table does not know, on purpose.** The first event of a session is made by the server and kept in the journal like any other (`Engine.history` tells the whole story after a restart),
  so it is given to the machine; the machine has no row for it and writes `event_unknown` (the state does not change, nothing is saved). The page needs the event and the machine does not.
- **The stop reason of the agent** is turned into an outcome by `stop_event` of the client of ACP (`src/acp/project.nv`): `end_turn` is the answer (`agent_done`); `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`
  and any other reason are the refusal `agent_refused` with a code of `FailCode`: `MaxTokens`, `MaxTurnRequests`, `ModelRefused`, `StoppedByHuman`, and for the rest `NoResult`. The table sees only the outcome, never the reason.
- **The question to the table.** `Hub.takes_message` asks `AlulaMachine.accepts_signal(state, "user_message")` (`src/machine_run/accepts.nv` of `alula`): the signal is declared and the common events or the rows of the state have a row for it.
  The condition of a row is evaluated with the data of the state and without the bindings of the signal; a condition that cannot be evaluated that way counts as taking the signal. When the state does not take it, the hub
  writes `a message to <session> while a turn is open: ignored` to its log and does not give the signal. Rename a state in the table, and nothing in the code changes: the scenario `scenario_renamed_table`
  (`testkit.nv`, `src/server_live`, `src/server_pg`) runs the hub on the table with `Idle` and `Awaiting` named `Resting` and `Waiting`.
- **How it is kept.** `signals_test.nv`: every signal the code gives is declared in the table or named "the table does not know"; the sources (`hub.nv`, `src/acp/project.nv`, `client.nv`) give only the signals of the list and every signal
  of the list is in a source; the hub and the scenarios name no state of the table. `accepts_test.nv` (`src/machine_run` of `alula`): the question on the dialog, the chat and a common event. `src/machine_dialog/border_test.nv`: the field
  `содержание` and the cancel declared once.

## The protocol of `/ws`

One WebSocket text frame is one JSON event (the server may also send an array of events in one frame). The event is the one of
[`src/web/README.md`](../web/README.md), "The format of the event": `{ id, trace, step, kind, input, time }`; **`trace` is the id of the session.**

### Page to server

The page says what the owner did. It does not apply its own words: they appear on the screen when the server returns them.

| `kind` | `input` | What the server does |
|---|---|---|
| `session_created` | `{ name, agent, project?, project_id?, folder? }`; `trace` is the id the page chose; `project_id` and `folder` are those of [the projects](#the-projects-of-the-control-panel-task-192m) | makes the session (the id must be a safe file name: letters, digits, dot, dash, underscore), starts the agent. An unknown agent or a bad id is answered by `session_created` and `error` for that page only, nothing is kept |
| `user_message` | `{ turn, text }` | gives the text to the agent as the next turn. `turn` is not used (see below). Ignored while a turn is open (the page does not offer sending then) |
| `cancel` | `{ turn? }` | cancels the open turn (`session/cancel`); **the session stays open** |
| `session_agent` (task 192) | `{ agent }` | the owner changed the family in the window: `Hub.switch_agent` starts the new agent (a failure keeps the old one), closes the old one, writes `agent_switched` `{ from, to, shown, total, cut }` into the journal of the SAME session (a restart reads it back) and hands the new agent the whole protocol of the conversation (`transfer.nv`: messages word for word, tools as one line; over 400000 bytes whole messages from the end, the earlier ones as headers) as a turn that is not a turn of the engine, so the feed does not show it and the answer to it is discarded |
| `session_setting` (task 192) | `{ setting, value }`; `setting` is `mode`, `model` or `effort` | the owner chose; the hub asks the agent (`Hub.choose`, `AcpClient.select_option`), the engine does not see it; the answer is a new `session_model` |
| `permission_decision` | `{ request, decision }`; `decision` is `allow` or `deny` | answers the request for permission of the agent; a decision nobody asked for changes nothing |
| `question_answer` (task 192i) | `{ request, skipped, answers:[{ index, selected:[label], other }] }` | answers a question of the agent (see "Questions of the agent"); an answer nobody asked for changes nothing |

### Server to page

| `kind` | `input` | When |
|---|---|---|
| `session_created` | `{ name, agent, folder, project?, project_id? }` | a session exists (`folder` is where its agent works; `project_id` names the project it was made in) |
| `session_model` | `{ model, model_id?, models?, effort?, effort_name?, efforts?, mode?, modes? }` | current model explicitly reported by ACP (empty `model` - not reported) and, task 192, what the agent offers to choose: models, effort, modes (see `src/acp/README.md`) |
| `user_message` | `{ turn, text }` | the owner's message was accepted |
| `agent_chunk` | `{ turn, text }` | a piece of the answer; the page glues pieces in the order of `step` |
| `agent_done` | `{ turn }` | the turn ended well |
| `agent_refused` | `{ turn, reason }` | the turn ended badly: `reason` is a code of the closed list (`Timeout`, `ConnectionLost`, `ModelRefused`, `MaxTokens`...) |
| `permission_request` | `{ turn, request, action, detail }` | the agent asks; the answer is `permission_decision` |
| `permission_decision`, `cancel` | as above | the page's decision, accepted |
| `question_request` (task 192i) | `{ turn, request, tool_call, questions }` | the agent asks the owner a question with a choice; the answer is `question_answer` |
| `question_resolved` (task 192i) | `{ request }` | the question is settled; the page takes the form away |
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

## Where the files of a session lie (Где лежат файлы сессии)

Every session has a folder of its own in the data folder (task 192k, owner 2026-10-26: "каждую сессию храни в отдельной папке"). The name of the folder is the session id
(letters, digits, dot, dash, underscore; not starting or ending with a dot; at most 128 characters), the names of the files do not carry the id:

```text
<data_dir>/
  041ef79a-4010-4b90-9fa3-8f08085cd9d4/
    journal        the journal of the engine, one JSON line per entry, appended   (store: files)
    snapshot       the snapshot of the engine, replaced as a whole                  (store: files; the folder is a session if it holds this file)
    inbox          the events of the ACP client not acknowledged yet                (both stores)
    acp.jsonl      the raw exchange with the agent (acp_trace); acp.1.jsonl - the rotated one
    images/        the images of the session (the page reads them through the server, `/api/session-image/<id>/<n>`, never by a path)
  2a8be5e7-e8c8-45b9-8261-7caad7a93826/
    ...
```

All the paths are built in one place, `src/storage/paths.nv` (`session_dir`, `session_file`, `session_file_made`, `ensure_session_dir`, `remove_session_dir`); an id or a name that is not
safe has no path, so nothing leaves the folder. The folder is made at the first write. The page and the front know no paths. Deleting a session is deleting its folder (`remove_session_dir`).

**Migration.** The older versions kept the files side by side (`<id>.inbox`, `<id>.journal`, `<id>.snapshot`, `<id>.acp.jsonl`, `<id>.acp.1.jsonl`, the folder `<id>.images`).
At its start, before the sessions are listed, the hub moves them into the folders (`src/storage/migrate.nv`): the folder first, then the files, by RENAME (nothing is copied), the snapshot last.
A file that has a namesake in the folder is not overwritten: it stays and the log says so (`<file> stays in place: ...`). The log line `migrated N sessions to per-session folders`
is written only when something was moved; a second start moves nothing.

## How a session lives

1. **Create.** The hub starts an engine (`start_engine`), feeds it the signal `session_created` (name, agent, folder; the machine ignores it, the journal keeps
   it with its input), starts the agent process. The session is on disk (or in the database) before the page sees it.
2. **Talk.** `user_message` is `feed`ed: the machine opens a request, the engine sends it to the ACP client, which queues it (one turn at a time). A timer
   (every few milliseconds) pumps every session: the events of the agent are accepted (journal, snapshot, then the acknowledgement to the client) and shown.
3. **Many turns.** The machine `DialogSession` (Alula) goes back to `Idle` after an answer, a refusal, a timeout or a cancel; the request ids are `agent-1`, `agent-2`...
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
| `alula.nv` | `hub_machine`, `hub_machine_from`: the embedded `dialog.alula.json` as `AlulaMachine` with the idle term of the settings |
| `../storage/paths.nv`, `../storage/migrate.nv` | the paths of the folder of a session (one place), the move of the flat files of the older form into the folders |
| `hub.nv` | `Hub`: `start_hub`, `attach`, `release`, `handle`, `pump`, `take_output`, `take_log`, `close`; the sessions, the store by the settings, the lines of the page |
| `stdio.nv` | `run_hub_stdio`: the hub over stdin and stdout |
| `routes.nv`, `routes_io.nv`, `routes_hub.nv` | the modes of work (task 192q): the pure logic of the modes and their files, the reading of the files from the disk, the part of the hub (tasks, subtasks, the run of the steps, the review by another family) |
| `taskwt.nv`, `taskwt_adapter.nv` | task and subtask trees (git worktrees), the merge of a subtask with a conflict left in progress, the state of a tree; the adapter that gives the hub these operations (publishing only by `route_publish`) |
| `catalog.nv`, `front/agent_catalog.nv` | the catalog of the families (task 192o): the last lists and values of every agent kept in `agents.json`, told to the page; the route `/api/agents` of the front |
| `ask_mcp.nv`, `ask_mcp_server.nv` | the MCP tool `ask_user_question` for agents with no tool of their own (task 192i) |
| `transfer.nv` | the protocol of a conversation handed to another agent (task 192) |
| `front/projects_api.nv`, `front/images.nv` | `/api/projects`, `/api/fs/*` (task 192m) and `/api/session-image` (task 192) |
| `routes_kit.nv`, `testkit_project.nv` | settings and repositories of the tests of the modes and of the projects |
| `routes_test.nv`, `taskwt_test.nv`, `../server_route_live/routes_live_test.nv`, `ask_mcp_test.nv`, `catalog_test.nv`, `transfer_test.nv`, `signals_given_test.nv` | tests of the above |
| `front/front.nv`, `front/front_settings.nv`, `front/stt.nv`, `front/sttproc.nv`, `front/images.nv` | the front: HTTP, `/ws` (frames over two owners of the socket), the router fiber, the hub as a child process; the voice to text (`/api/stt`); the recognizer as a child of the front; the pictures of the messages (`/api/session-image`) |
| `testkit.nv` | the settings of a test hub with the fake agent, the rig that drives a hub as a page does, the scenarios (shared by the units below) |
| `alula_test.nv` | the machine of the hub: made from the embedded table, the idle term, a broken text, an engine in memory, the snapshot |
| `settings_test.nv`, `front/front_settings_test.nv`, `front/stt_test.nv`, `front/sttproc_test.nv` | tests of the unit `src/server` and `src/server/front` |
| `../server_live/hub_test.nv`, `../server_pg/hub_pg_test.nv` | the same ten scenarios over files and over PostgreSQL |
| `test/e2e.mjs`, `test/real-agent.mjs` | Node: the whole server through its door (files, `--pg` on the temporary database, `--pg-docker` on the permanent one); the real `opencode acp` (handshake only) |
| `server.example.json`, `server-pg.example.json` | the examples of the settings: the file store, and the store pg on the database of `db.ps1` (no password) |
| `run-pg.ps1` | the server on the permanent PostgreSQL in Docker with one command (task 115) |

The module of the front is declared `module server.front` (without the package prefix) and imported as `crew_harness.server.front`: a module two folders under the
source root cannot be declared with the full path on Oracle 0.1.0 (item 25 of `spikes/env/README.md`; this form compiles and resolves).

### Adding Kimi Code as an agent

Add a second entry to the local server settings file; do not replace the OpenCode entry. For the Windows npm shim:

```json
{"id":"kimi","label":"Kimi Code","program":"kimi.cmd","args":["acp"]}
```

On other platforms use the installed `kimi` executable for `program`. The page reads the configured `id`/`label` from `/agents`; executable paths and arguments remain server-side. The existing ACP client starts the command directly (no `auto`/`yolo` flags). Kimi Code CLI 2.1.1's initialize handshake was confirmed separately; it reported `authMethods: login`. This is not proof of an authorized conversation: login and model prompts are not started automatically, and no token is collected or stored by CrewHarness.

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
sessions, an agent that refuses to start.

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

Task 114 added items 48-51 (`spikes/env/README.md`): the record `Row` of the tables of states clashed with the variant `Row` of the driver (it is `TableRow`), a private generic `begin_engine` of the interpreter captured the name
of the hub's function (it is `begin_session_engine`), a helper of a test file clashed with a private function of its module in the unit of an importer, a record literal in the scrutinee of a `match` is a syntax error.
Each place that goes round a defect carries `// ORACLE-WORKAROUND(N): ...` (`git grep ORACLE-WORKAROUND`).
