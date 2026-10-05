# opencode-peers

OpenCode V2 plugin: **letters between OpenCode tabs** (sessions) on one machine, in any
repository, addressed by role. A *window* is the OpenCode program in a terminal; a *tab* is a
session inside it (one on screen, the rest in the background). Letters are addressed to tabs.

- tools `peer_list`, `peer_send`, `peer_wait`, `peer_role`, `peer_inbox`, `peer_spawn`,
  `peer_task`, `peer_doctor`, `peer_help` (also `/peer_help`);
- **projects**: every tab belongs to a project and its address is `project.role`
  (`nova.integrator`). A plain role means the sender's own project; `project.role` reaches another
  project; `all` is every open tab of the own project, `project.all` of another one; a session id
  (`ses_...`) reaches exactly that tab. A tab belongs to the project with the longest matching
  root, a tab outside every root to the project named after its repository;
- **project settings live in a settings repository**, not in the tab's working copy (a project can
  be a folder of many repositories, like `C:/work/nova`). The plugin options list settings
  folders — any folder inside a git repository; the file `.opencode/opencode-peers.json` there
  names the project and its root (relative to the folder) and is read **committed** from the
  default branch (`git show`; another branch: its `"branch"` field), never from the working copy:

  ```jsonc
  "plugins": [
    { "package": "C:/work/opencode-peers",
      "options": { "projects": ["C:/work/nova/nova-settings", "C:/work/tools"],
                   "local": { "nova": { "spawn_models": { "light": "kimi/k3" } } } } }
  ]
  ```

  ```json
  { "project": "nova", "root": "..", "task_fields": ["goal", "criteria", "boundaries"],
    "worktrees": "worktrees", "branch_name": "p{n}-{slug}", "spawn_limits": { "worker": 3 } }
  ```

  `local` holds machine-specific values on top of the file. The old options form
  `{ "nova": "C:/work/nova" }` still works (settings are then walked up from the tab, the old
  file name `nova-peers.json` included); `peer_doctor` suggests the new form. All keys:
  [plan 002](doc/plans/002-tasks.md), «Настройки проекта»;
- **roles**: a new tab is `worker` (shared: tabs within it differ by session id; `assistant` is an
  alias). `integrator` is exclusive, one holder per project, plus the project's `exclusive_roles`
  (and an optional `help_extra` paragraph for `peer_help`). An exclusive role
  is held by an atomic lock: refused while the holder's tab is open (unless `force`), free the
  moment it closes. A letter to a shared role with several open holders is refused with the list
  (address a session id);
- executor choice by task weight (`tier`: heavy / medium / light) across free open tabs, with a
  queue.

## Presence: only open tabs are woken

OpenCode's server runs without any window, and a letter that wakes a tab starts a model turn
(and spends limits). The server has no "a window shows this session" signal, so the **window
plugin** (`tui.ts`, loaded by every OpenCode window) writes `windows/<pid>.json` once a second:
the open tabs, which one is on screen, which is running a turn. A letter wakes a tab only if it is
open in a live window (on screen or in the background) or it is a task session started by the
integrator. A closed tab, a window closed with X or crashed (its heartbeat freezes, after 3 s its
tabs count as closed): the letter waits and goes out within a second of the tab being opened.
A letter to a background tab shows a notice in its window with an Open button. No heuristics, no
time-outs: no window plugin, no wake.

## Turn economy

Measured on OpenCode 2.0.22: anything sent into a session while its turn runs becomes one more
model step after it, and `session.prompt({resume: false})` becomes a separate step before the
next message. So:

- a tab running a turn gets nothing; its letters go in one message when the turn ends;
- `wake: false` letters (statuses, FYI) go in with `session.synthetic({resume: false})`: OpenCode
  puts them right before the tab's next message, in the same step;
- a question (`expect_reply`) gives a `qid`; the asker waits with `peer_wait` in the same turn and
  gets the answer there, not as a second wake;
- an ack-only letter ("ok", "спасибо") is not sent.

## Obligations instead of a push controller

A question or a task is the recipient's obligation until it answers (`reply_to: qid`). Windows on
Claude often stop mid-task after writing a status; the plugin keeps them going — by the end of a
turn, not by a timer. The turn's facts come from OpenCode's database (messages between the turn's
start and its `idle` row): a turn with a tool call is a working one, a turn without one is empty.

- a turn ended without the answer → a reminder right away; a working turn resets the empty counter;
- `push_empty_turns` (3) empty turns in a row or `push_max` (20) reminders → the tab is stuck: no
  more reminders, the asker gets a call (a letter and a notice in its window), the task's history
  records it; `peer_task {action: "push"}` wakes it again and clears "stuck";
- a turn with the owner's own message gets no reminder (the owner leads the tab) and resets the count;
- a turn cut off by an OpenCode restart (the session keeps `time_suspended`, no `idle` row, OpenCode
  does not resume it) is picked up by one letter that lists what is open and how to report;
- service letters of the plugin say "do not answer"; a letter to `opencode-peers` itself is refused.

## Tasks

A task has a number `#N` (per project, only grows, kept through rework and reassignment) — the
owner, the integrator and `peer_list` call it by that; a task session's title is `#N title`. The
journal is `tasks/<project>/<N>.json` in the mailbox.

- `peer_spawn {title?, goal, criteria, boundaries?, open_questions?, tier?, priority?, role?}` (the
  integrator only) starts task `#N` in a new session, with or without a window. No task without a
  goal and acceptance criteria (the project may require more: `task_fields`); model by tier
  (`claude-code/opus` / `sonnet` / `haiku`, `spawn_models` overrides); a limit of running tasks per
  role (`spawn_limits`, 3); priority `P0` (emergency) … `P3`, default `P2`. With `worktrees` set the
  task letter names the worktree folder and the branch.
- The start is repeatable: the session id is chosen and written to the journal **before**
  `session.create` (OpenCode accepts an own id starting with `ses` and returns the existing session
  on a repeat), the task letter's id comes from the number — a start cut off at any step is
  finished by the next pass without a second session or letter.
- `peer_task {action}`: `list`, `show {n}`; for the integrator `assign {session, goal, criteria…}`
  (an owner's tab takes the task; it is woken while the task is open, even when closed), `push
  {n, text?}` (wake a stalled executor now), `reassign {n}` (a new session, the same number, a
  summary of what was done), `cancel {n}`, `priority {n, priority}`.
- The executor reports as the answer to the task's qid; the task is submitted (title `#N ✓`) — the
  report does **not** wake the integrator; a second report is refused. The executor's session
  stays open for rework until the task is cleaned.

## Review and merge

The integrator stays free for the owner and does not re-check accepted work:

- a submitted task gets a reviewer by priority (`P0` first): with `reviewer: "integrator"` the
  integrator itself, otherwise a free open `worker` tab (never the author or the executor), or a
  new review session (`spawn_limits.reviewer`, 2); the reviewer gets the task, the report and the
  project's `acceptance` steps;
- the reviewer: `peer_task {action: "review"}` (started; the executor learns it quietly), `rework
  {text}` (back to the executor with the remarks; the resubmission wakes the same reviewer;
  over `rework_max` the integrator gets a call), `merge` (the project's merge lock: one merging
  reviewer at a time), `accept {checks, commit?}` — the plugin requires a report for every
  required acceptance step and checks that the task branch (or a squash commit) is in the target
  branch; then the cleanup steps by `cleanup` (`git worktree remove`, `git branch -D`, `git push
  origin --delete`), and `cleaned` — the plugin checks the worktree and the branch are gone;
- cleaned → the sessions of the task close with a line in their history, titles `#N ✓✓`, the
  integrator gets a quiet summary. Titles on the way: `#N ✓◐` on review, `#N ↻` rework, `#N ✓✓◐`
  accepted;
- `inflight_limit` (6) bounds the tasks running and in review; `P0` passes every limit.

## Other projects

- **inbound** of the receiving project limits letters from other projects: `integrator` (default:
  only to its integrator), `any`, `none`; a refused letter names the address to use;
- **an order**: `peer_task {action: "order", to: "beta.integrator", goal, criteria, …}` records task
  `#N` of kind order in the orderer's journal (no session, no title marks) and sends it to beta's
  integrator, who does it with its own tasks: `peer_spawn {…, parent: "alpha#N"}`. The order follows
  that task: cleaned → the order is done (a quiet summary to the orderer), cancelled → a call.

## Self-check

`peer_doctor` (and once at load, as a notice): the OpenCode features the plugin relies on, the
mailbox, whether any window plugin is beating, whether the caller's tab is visible to a window.

The system hint the plugin adds to each request is **constant** within a session (it sits before
the whole history, and anything changing there re-bills the history with Claude's prefix prompt
cache); neighbours and their models come from `peer_list`.

## Windows on the `claude-code` provider (MCP)

The [`claude-code` provider](https://github.com/unitcraft/opencode-claude-code-provider) hands
every turn to the official Claude Code and drops OpenCode's tool list, so the plugin's `peer_*`
tools do not reach those tabs. `mcp.ts` is a stdio MCP server with the same tools
(`mcp__peers__peer_list`, ... in Claude Code), built on the same core (`core.ts`) as the plugin:

```sh
OPENCODE_PEERS_SESSION=<opencode session id> node mcp.ts   # node >= 24
```

- it acts for the one OpenCode session in `OPENCODE_PEERS_SESSION` (the provider sets it per
  request) and writes to the same mailbox (`XDG_DATA_HOME` as for OpenCode);
- the project list is not repeated: the plugin writes its `projects` and `local` options to
  `<mailbox>/projects.json` at load (`OPENCODE_PEERS_PROJECTS`, JSON of the `projects` value,
  overrides);
- delivery stays with the plugin (the letter goes into the OpenCode session); a task started from
  MCP is written to the journal and the plugin starts it on its next pass.

## Install

```sh
git clone https://github.com/unitcraft/opencode-peers C:/work/opencode-peers
```

`~/.config/opencode/opencode.jsonc` (the server plugin):

```jsonc
"plugins": ["C:/work/opencode-peers"]
```

`~/.config/opencode/cli.json` (the window plugin; a folder, not a file — OpenCode loads `tui.ts`
from it):

```json
{ "plugins": ["C:/work/opencode-peers"] }
```

Windows opened before the window plugin was added do not report their tabs: reopen them.

## Related

Other OpenCode plugins of the same set (they work independently; together they are tested on one machine):

- [opencode-windows-env](https://github.com/unitcraft/opencode-windows-env) — a sane command environment on Windows and a time stamp on agent messages
- [opencode-claude-guards](https://github.com/unitcraft/opencode-claude-guards) — the repository's Claude Code rules (hooks, permissions) in OpenCode windows
- [opencode-claude-code-provider](https://github.com/unitcraft/opencode-claude-code-provider) — OpenCode provider `claude-code` on top of the official Claude Code

## Test

```sh
npm test   # node >= 24
```

History: moved with its commits from `a private plugins repository of the nova project` (`plugins/nova-peers`).
Internal names (`nova.peers` id, `nova-peers` data directory) are kept so existing mailboxes keep
working; the settings file is `.opencode/opencode-peers.json` (named after the package).

License: MIT OR Apache-2.0 (see [LICENSE](LICENSE)).
