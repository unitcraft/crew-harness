# CrewHarness

*ИИ-команда в упряжке — обвязка для команды ИИ-агентов.*

**Your AI dev team, harnessed.** An OpenCode V2 plugin that turns Claude Code tabs into a crew that carries work
from a plan to a merge, while the owner only approves and watches:

- **plans** — a plan task writes a plan document; it is rechecked in rounds by fresh sessions with graded remarks,
  approved by the owner in the window (`/plans`), and its steps become tasks by dependencies and priorities;
- **tasks** — each in its own session, worktree and branch; priorities, limits, a queue;
- **acceptance** — a separate reviewer goes through the project's steps, merges under a lock (one at a time) and
  confirms the cleanup;
- **letters** — between tabs and projects, addressed by `project.role`; questions with an awaited answer;
- **flow control** — reminders, a stall watchdog, recovery after a service restart, a stale-window check;
- **the machine** — long waits that outlive a turn (`crew_watch`) and a queue for heavy runs;
- **for the owner** — a side panel in the window, `/crew`, "waiting for you" notices, acceptance reports;
- **everything is a setting** — plan form, acceptance steps, grades, limits, who approves.

A *window* is the OpenCode program in a terminal; a *tab* is a session inside it (one on screen, the rest in the
background); a task session may run with no window at all. Formerly `opencode-peers` (renamed 2026-10-07, plan 014).

- tools `crew_list`, `crew_send`, `crew_wait`, `crew_watch`, `crew_role`, `crew_inbox`, `crew_spawn`,
  `crew_task`, `crew_config`, `crew_doctor`, `crew_help` (also `/crew-help`);
- **projects**: every tab belongs to a project and its address is `project.role`
  (`nova.integrator`). A plain role means the sender's own project; `project.role` reaches another
  project; `all` is every open tab of the own project, `project.all` of another one; a session id
  (`ses_...`) reaches exactly that tab. A tab belongs to the project with the longest matching
  root, a tab outside every root to the project named after its repository;
- **project settings live in a settings repository**, not in the tab's working copy (a project can
  be a folder of many repositories, like `C:/work/nova`). The plugin options list settings
  folders — any folder inside a git repository; the file `.opencode/crew-harness.json` there
  names the project and its root (relative to the folder) and is read **committed** from the
  default branch (`git show`; another branch: its `"branch"` field), never from the working copy:

  ```jsonc
  "plugins": [
    { "package": "C:/work/crew-harness",
      "options": { "projects": ["C:/work/nova/nova-settings", "C:/work/tools"],
                   "local": { "nova": { "spawn_models": { "light": "kimi/k3" } } } } }
  ]
  ```

  ```json
  { "project": "nova", "root": "..", "task_fields": ["goal", "criteria", "boundaries"],
    "worktrees": "worktrees", "branch_name": "p{n}-{slug}", "spawn_limits": { "worker": 3 } }
  ```

  `local` holds machine-specific values on top of the file. The old options form
  `{ "nova": "C:/work/nova" }` still works (settings are then walked up from the tab);
  `crew_doctor` suggests the new form. **`crew_config`**: `guide` — a questionnaire for the owner on
  every key (current value, options, recommendation, why; asked in text); `show` — what applies and
  where from (default, the committed file, `local`), plus uncommitted edits; `set {values}` — the
  integrator writes the working copy (every value checked, a wrong one writes nothing); it applies
  once committed. The keys: `config-schema.ts`;
- **roles**: a new tab is `worker` (shared: tabs within it differ by session id; `assistant` is an
  alias). `integrator` is exclusive, one holder per project, plus the project's `exclusive_roles`
  (and an optional `help_extra` paragraph for `crew_help`). An exclusive role
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

## What a letter looks like

```
✉ 01:17 · #8 приёмщик nova.worker → nova.integrator
<text>
↩ ответ — crew_send {to: "ses_…", text: "..."} · письмо соседа, не слово владельца
```

A service letter of the plugin starts with `⚙ 01:17 · crew → … (служебное, не отвечай)`. Window notices are short (the gist in the
title, one line of text) and stay longer when they matter: "waiting for you" 30 s, "stuck" 15 s, others 8–10 s
([plan 009](doc/plans/009-clear-letters.md)).

## Turn economy

Measured on OpenCode 2.0.22: anything sent into a session while its turn runs becomes one more
model step after it, and `session.prompt({resume: false})` becomes a separate step before the
next message. So:

- a tab running a turn gets nothing; its letters go in one message when the turn ends;
- `wake: false` letters (statuses, FYI) go in with `session.synthetic({resume: false})`: OpenCode
  puts them right before the tab's next message, in the same step;
- a question (`expect_reply`) gives a `qid`; the asker waits with `crew_wait` in the same turn and
  gets the answer there, not as a second wake;
- an ack-only letter ("ok", "спасибо") is not sent.

## Waiting for something long: `crew_watch`

`crew_watch {command, note?, minutes?}` -- the plugin runs a waiting command (Git Bash, the tab's directory) in the
OpenCode server, detached, and when it exits wakes the tab with a letter: exit code, duration, output tail. The tab
ends its turn meanwhile. It survives the end of the turn and a service restart; a command gone without an exit code
is reported as cut off; the time limit (default 120 min, up to 720) stops it with code 124. In a claude-code tab this
is the only way: Claude Code's own background tasks (`run_in_background`, Monitor) die with the turn
([plan 003](doc/plans/003-watch.md)).

**The machine queue.** `machine: true` marks a command that loads the machine (a gate, a build, a full test run):
it waits for a slot in the project's machine queue — `machine_slots` at a time (1; 0 — no limit), in the order they
were set; the time limit counts from the start. `crew_watch` says how many are ahead, `/crew` shows it queued, the
letter says how long it waited. Ordinary watches and other projects do not wait ([plan 005](doc/plans/005-machine-queue.md)).

**The project's deny rules.** The command runs outside the window's permissions, so `crew_watch` checks it against
`permissions.deny` of the project's `.claude/settings.json` (from the tab's directory up to the git root; no file — no
check, an unreadable one — refusal): a command matching `Bash(…)` / `PowerShell(…)` (`prefix:*`, `*` as a wildcard),
whole or in any subcommand (`&&`, `||`, `;`, `|`, a newline, the body of `bash -c '…'`, `$(…)`; `git -C <dir>` and
`VAR=1 timeout N` prefixes do not hide it), or naming a file under a `Read(…)` glob is refused, naming the rule.
**Who started it:** the command's environment carries `CREW_SESSION_ID`, `CREW_ROLE`, `CREW_PROJECT`, and
`CREW_REVIEW_N` for the reviewer of an open task, `CREW_TASK_N` for its executor — fixed when the watch is put and
kept in its record, so a restart or a later role change does not alter them ([plan 013](doc/plans/013-acceptor-role.md)).

## Who waits for what: `/crew` and "waiting for you"

The window's right panel shows a "Crew" block under "Context": the sessions of the project of the tab on screen —
the ones waiting for you first, who is working and how long, who waits for what — refreshed every 2 s
([plan 010](doc/plans/010-sidebar.md)). The window closes the tab of a task or review session two minutes after its task was accepted or cancelled, unless
the tab is on screen (the owner's own tabs are left alone; the session stays in the history). `/crew-config` shows the project's settings in effect, each with where it comes from (default, the committed file,
`local`), like `crew_config show`. `/crew-doctor` shows the service's last self-check (made at start and every 10 minutes), like `crew_doctor`. `/crew` in any window (also in the Ctrl+P palette) shows, without a model turn, every session of the projects:
working, **waiting for you** (its last answer ends with a question and you have not written since), waiting for a
watch, for an answer to its question, for its task's review or rework, for its own tasks, or idle — your project
first, the ones waiting for you on top. A session that starts waiting for you puts a notice into every live window
(with Open; a system notification when the window is not focused, if OpenCode's `attention.notifications` is on)
and repeats it every `owner_reminder_min` minutes (15; 0 — once) until you answer ([plan 004](doc/plans/004-status.md)).

### Session status

The service plugin keeps `<mailbox>/status/<session id>.json` for open tabs, task sessions and sessions with watches
or open tasks of their own — an open contract for outside checks (e.g. a project's Stop hook; the claude-code
provider puts `OPENCODE_SESSION_ID` into Claude Code's environment). `<mailbox>` is
`$XDG_DATA_HOME/opencode/crew-harness` (OpenCode's data directory; an earlier mailbox — `opencode-peers`, `nova-peers` — stays in place and the new name links to it on the first
so old paths keep working):

```jsonc
{ "session": "ses_…", "project": "nova", "role": "integrator", "title": "…", "model": "claude-code/opus",
  "state": "working" | "owner" | "question" | "watch" | "reply" | "task" | "tasks" | "idle",
  "since": 1791200000000, "detail": "a line for people", "question": "… (state owner)",
  "watches": [{ "id", "note", "started", "minutes" }],          // running crew_watch
  "asked": [{ "qid", "to", "at" }],                              // its questions without an answer
  "task": { "n", "status", "as": "executor" | "reviewer", "title" },
  "tasks": [{ "n", "status", "priority", "title" }],             // open tasks it set
  "updated": 1791200000000 }
```

## Obligations instead of a push controller

A question or a task is the recipient's obligation until it answers (`reply_to: qid`). Windows on
Claude often stop mid-task after writing a status; the plugin keeps them going — by the end of a
turn, not by a timer. The turn's facts come from OpenCode's database (messages between the turn's
start and its `idle` row): a turn with a tool call is a working one, a turn without one is empty.

- a turn ended without the answer → a reminder right away; a working turn resets the empty counter;
- `push_empty_turns` (3) empty turns in a row or `push_max` (20) reminders → the tab is stuck: no
  more reminders, the asker gets a call (a letter and a notice in its window), the task's history
  records it; `crew_task {action: "push"}` wakes it again and clears "stuck";
- a turn with the owner's own message gets no reminder (the owner leads the tab) and resets the count;
- a turn cut off by an OpenCode restart (the session keeps `time_suspended`, no `idle` row, OpenCode
  does not resume it) is picked up by one letter that lists what is open and how to report;
- a task session whose turn ends with a question is not told "continue": the question goes to whoever set the
  task (a letter that wakes it), who answers or asks the owner; a merge lock held longer than `stall_minutes` (30)
  and a submitted task waiting for a reviewer that long are raised to the task's author, and so are the leftovers of a
  closed task (branches here and on origin, worktrees by the project's name templates) ([plan 007](doc/plans/007-flow-watch.md));
- service letters of the plugin say "do not answer"; a letter to `crew-harness` itself is refused.

## Tasks

A task has a number `#N` (per project, only grows, kept through rework and reassignment) — the
owner, the integrator and `crew_list` call it by that; a task session's title is `#N title`. The
journal is `tasks/<project>/<N>.json` in the mailbox.

- `crew_spawn {title?, goal, criteria, boundaries?, open_questions?, tier?, priority?, role?, parent?}` (the
  integrator only) starts task `#N` in a new session, with or without a window. No task without a
  goal and acceptance criteria (the project may require more: `task_fields`); model by tier
  (`claude-code/opus` / `sonnet` / `haiku`, `spawn_models` overrides); a limit of running tasks per
  role (`spawn_limits`, 3); priority `P0` (emergency) … `P3`, default `P2`. With `worktrees` set the
  plugin creates the task's worktree and branch (from the target branch) and starts the session in it, so the
  project's hooks see the task's branch, not the main copy ([plan 006](doc/plans/006-task-worktree.md)).
- The start is repeatable: the session id is chosen and written to the journal **before**
  `session.create` (OpenCode accepts an own id starting with `ses` and returns the existing session
  on a repeat), the task letter's id comes from the number — a start cut off at any step is
  finished by the next pass without a second session or letter.
- `crew_task {action}`: `list`, `show {n}`; for the integrator `assign {session, goal, criteria…}`
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
- the reviewer: `crew_task {action: "review"}` (started; the executor learns it quietly), `rework
  {text}` (back to the executor with the remarks; the resubmission wakes the same reviewer;
  over `rework_max` the integrator gets a call), `merge` (the project's merge lock: one merging
  reviewer at a time), `accept {checks, commit?}` — the plugin requires a report for every
  required acceptance step and checks that the task branch (or a squash commit) is in the target
  branch; then the cleanup steps by `cleanup` (`git worktree remove`, `git branch -D`, `git push
  origin --delete`), and `cleaned` — the plugin checks the worktree and the branch are gone;
- cleaned → the sessions of the task close with a line in their history, titles `#N ✓✓ готово`, the
  integrator gets a quiet summary. Titles on the way (a mark and a word): `#N ✓ сдана`, `#N ✓◐ приёмка`, `#N ↻ доработка`, `#N ✓✓◐ влита`
  accepted;
- a task on rework does not hold a review session's place (`spawn_limits.reviewer`): the next submitted task gets
  it; the resubmission goes back to the same reviewer at once;
- `reviewer: "acceptor"` — a separate acceptor role with its own rights ([plan 013](doc/plans/013-acceptor-role.md)):
  only a free open tab of role `acceptor` becomes a reviewer (never a `worker` tab), a new review session is born
  with role `acceptor`, review sessions are bounded by `spawn_limits.acceptor` (without it `spawn_limits.reviewer`,
  then 2) and take no `worker` place; `merge`, `accept` and `cleaned` need the task's reviewer AND the `acceptor`
  (or `integrator`) role — a reviewer who changed role loses them; the executor of a task is refused by name. The
  role is shared. The default stays `worker`;
- `inflight_limit` (6) bounds the tasks running and in review; `P0` passes every limit.

## Plans

New work starts with a plan: a document in the project's repository (`plans_dir`, default `docs/plans`,
named `{n}-{slug}.md`). The integrator sets a plan task: `crew_spawn {kind: "plan", title, goal}`.
`goal` is the original task the plan must solve. The plugin picks the plan number: the next one after
the files in the plans folder and the open plan tasks. A sub-plan gets `N.k`.

**Writing the plan.** The executor writes the plan from the template in its letter:
- header: `Статус`, `Источник`, `Зависимости`;
- sections: «Зачем», «Что уже есть», «Режим выполнения», «Фазы», «Не делаем», «Открытые вопросы»,
  «Решения владельца»;
- phases `### Ф.N`, and in them steps `#### Ф.N.M` with `[P1] [после: …] [где: …]`;
- each step has a «Что:» line and an «**Приёмка:**» block.

The report is refused while the file is missing or its form is wrong. The form check covers the
header, the sections, «Что» and «Приёмка» of every step, open questions as a quadruple with
«Блокирует», and `после:` pointing at real steps with no cycles.

**Recheck in rounds.** Each round is run by a new session: not the plan's author and not a previous
reviewer. The reviewer goes through two groups of steps:
- **A — against the original task:** goal, coverage table "requirement → step → criterion",
  assumptions, scope, what already exists, the mode question;
- **B — how the plan is composed:** machine-checkable criteria with a red probe, criterion tools
  tried before and after, one step = one task, explicit dependencies, existing paths, form.

The round ends with `crew_task {action: "round", n, blocking, significant, cosmetic, text}`. The grade
of a remark is set by what fixing it changes:

| Grade | What fixing it changes |
|---|---|
| blocking | the plan does not solve the task |
| significant | the content: a step, a criterion, the order, a dependency, the boundaries |
| cosmetic | only the text |

When in doubt, the higher grade applies. A blocking or significant remark sends the plan back to its
author. The plan is ready when `plan_clean_rounds` (2) rounds in a row find only cosmetic remarks.
After `plan_rounds_max` (4) rounds the owner decides.

**Approval by the owner.** A ready plan notifies every window. The owner types `/plans` in a window
and chooses one of:
- approve without shortcuts;
- approve with the shortcuts named in the plan;
- return it with remarks.

The decision is written by the window, so an agent cannot fake it. A new session writes the decision
into the plan («Режим выполнения», «Решения владельца») and merges it. `accept` reads the plan in the
target branch and requires its form and the owner's answer.

**Steps become tasks.** Once the plan is merged, each step becomes a task. The task gets the step's
«Что» as its goal, the step's «Приёмка» as its criteria, and the plan's «Не делаем» and mode as its
boundaries. A step starts when:
- everything in its own `после:` and its phase's `после:` is closed;
- no running step shares its `где:`;
- the project's limits allow it.

Order is by priority (the step's, else the phase's), then by plan order. A `[подплан]` step becomes a
plan task. A step task is accepted only with «✅ СДЕЛАНО <date>, commit» in its heading in the target
branch. When every step is closed, the author is asked to close the plan. `/crew` shows each plan:
written, rechecked (round, clean rounds), waiting for approval, or in progress (steps closed/total,
which are running).

Marks: plan `🔴 ОТКРЫТ / 🟡 В РАБОТЕ / ✅ ЗАКРЫТ / ❌ ОТМЕНЁН`, step `⏳ В РАБОТЕ / ✅ СДЕЛАНО`, criterion
`✅ ВЫПОЛНЕНО / ⬜`, question `❔ / ✅`.

**Everything is a setting.** The plan's form and process are project settings with nova's form as the default: `plan_sections`, `plan_header`, `plan_prefix`, `plan_labels`, `plan_marks`, `plan_mode_question`, `plan_acceptance`, `plan_merge_acceptance`, `plan_grades` (`{id, name, text, clean}`), `plan_approver` (owner / integrator — `crew_task plan_decide`), `plan_steps` (auto / manual), `plan_template` (a template file in the repository). `crew_config guide` asks about each.

**Heavy runs.** `heavy_commands` lists substrings of commands that load the machine (full gate,
full build, full test run, benchmarks). `crew_watch` with such a command goes to the machine queue
by itself. Full design: [plan 012](doc/plans/012-plans.md).

## Other projects

- **inbound** of the receiving project limits letters from other projects: `integrator` (default:
  only to its integrator), `any`, `none`; a refused letter names the address to use;
- **an order**: `crew_task {action: "order", to: "beta.integrator", goal, criteria, …}` records task
  `#N` of kind order in the orderer's journal (no session, no title marks) and sends it to beta's
  integrator, who does it with its own tasks: `crew_spawn {…, parent: "alpha#N"}`. The order follows
  that task: cleaned → the order is done (a quiet summary to the orderer), cancelled → a call.

## Other machines (prototype)

Letters to projects on other machines (`remote.ts`). Each machine has
`<data>/crew-harness/remote.json` — not in a repository. Two transports:

**Tailscale** (`tailnet.ts`, recommended): bridges talk HTTP directly inside your Tailscale network.
The network names the sender (`tailscale whois`), so there is no shared secret, and each machine has
its own rights:

```json
{ "node": "home", "transport": "tailnet",
  "nodes": { "vps-1": { "projects": ["site"], "may_write": ["nova.integrator"] } } }
```

- `nodes` — the machines this one talks to, by their Tailscale name (`host`/`port` if not the
  MagicDNS name and port 7647); a machine not listed gets 403;
- `projects` — that machine's projects: `crew_send {to: "site.lead"}` goes to `vps-1`;
- `may_write` — where that machine may write here: `project.role`, `project.*` or `*`;
- the bridge listens only on the Tailscale address (`tailscale ip -4`), so on a VPS with a public
  address the port is not open to the internet. Let only the bridge port through in the tailnet ACL;
- a refusal there comes back to the sender as a note; an unreachable machine keeps the letter and
  retries (1, 2, 4… up to 60 s) for 24 h.

**ntfy** (`ntfy.ts`): a shared encrypted channel on [ntfy](https://ntfy.sh) for machines outside a
tailnet. All machines of the channel are equal — the secret is its only protection:

```json
{ "node": "home", "secret": "<the same on every machine>", "projects": ["site"] }
```

The topic and the AES-256-GCM key come from `secret` (a new one: `ntfySecret()` from `ntfy.ts`);
optional `server` and `token` for your own ntfy server. The channel is shared, so a refusal stays in the
receiver's log. A letter takes about 1–3 s on ntfy.sh (`node test/ntfy-latency.mjs`); anonymous
ntfy.sh limits requests and messages per day, so pending letters leave together.

Both:

- a session of another machine you got a letter from is remembered with its machine, so a reply to
  its `from_session` goes back there. `tier` and `project.all` do not work across machines;
- one process per machine holds the bridge (`remote/bridge.lock`); it takes only letters for its own
  projects, by the project's `inbound`; a session gets letters only from a machine it wrote to itself.
  A letter that cannot be sent goes to `remote/failed/`, and its sender gets a note.

### Status (2026-10-07)

A prototype. Checked by self-tests only: fake ntfy and GitHub servers, two real HTTP bridges on
`127.0.0.1` with a faked `whois`, the bridge with a fake transport. One live run: 5 pings over ntfy.sh,
median about 2 s, most of it the publish request. Not yet run inside a live OpenCode, not across real
machines, and not against a real Tailscale: the parsing of `tailscale whois --json` (`Node.Name`) is
written from memory. No type check (no TypeScript in the project). `github.ts` is a transport kept for
comparison; nothing uses it.

Known gaps:

- **the ntfy cursor lives in memory**: after a restart the bridge reads the channel from its start, so
  letters sent while no OpenCode process ran on the machine are lost, though ntfy.sh keeps them ~12 h;
- **ntfy has no sender identity**: one shared secret, every machine of the channel is equal, a refusal
  stays in the receiver's log, and the sender is told "sent" even if no machine took the letter;
- **Tailscale keeps the outgoing queue in memory**: retries survive a pause, not a restart of the bridge
  process (the letter stays in `remote/outbox/` and is sent again — the receiver drops the repeat by id);
- **only letters cross machines**: no `tier`, no `project.all`, no tasks or orders (`crew_task`,
  `crew_spawn`), no `crew_watch` or status; `crew_list` does not show tabs of other machines;
- **remote.json is edited by hand**: `crew_config` does not touch it, and a broken file is only logged;
- **the queue and back-off code is repeated** in `github.ts`, `ntfy.ts` and `tailnet.ts`.

Next:

1. Check on a real tailnet: `tailscale ip -4` and `whois` output on Windows and Linux, a letter between
   this machine and a VPS, the ACL that leaves a worker only the bridge port.
2. Orders across machines: `crew_task order` to the integrator of a project on another machine, which
   runs it with its own tasks; the order's status comes back. Code moves through git: the worker pulls a
   branch from a shared remote and pushes its result to its own branch; review and merge stay at home.
3. OpenCode without windows on a VPS (`opencode serve`): today a wake needs an open tab or a
   `crew_spawn` task — check what a headless worker needs.
4. Smaller: keep the ntfy cursor in a file; `crew_list` with remote machines (reachable or not); edit
   `remote.json` through `crew_config`; one shared queue module for the transports; drop `github.ts` if
   nothing needs it.

## Self-check

`crew_doctor` (and once at load, as a notice): the OpenCode features the plugin relies on, the
mailbox, whether any window plugin is beating, whether the caller's tab is visible to a window.

The system hint the plugin adds to each request is **constant** within a session (it sits before
the whole history, and anything changing there re-bills the history with Claude's prefix prompt
cache); neighbours and their models come from `crew_list`.

## Windows on the `claude-code` provider (MCP)

The [`claude-code` provider](https://github.com/unitcraft/opencode-claude-code-provider) hands
every turn to the official Claude Code and drops OpenCode's tool list, so the plugin's `crew_*`
tools do not reach those tabs. `mcp.ts` is a stdio MCP server with the same tools
(`mcp__crew__crew_list`, ... in Claude Code), built on the same core (`core.ts`) as the plugin:

```sh
OPENCODE_CREW_SESSION=<opencode session id> node mcp.ts   # node >= 24
```

- it acts for the one OpenCode session in `OPENCODE_CREW_SESSION` (the provider sets it per
  request) and writes to the same mailbox (`XDG_DATA_HOME` as for OpenCode);
- the project list is not repeated: the plugin writes its `projects` and `local` options to
  `<mailbox>/projects.json` at load (`OPENCODE_CREW_PROJECTS`, JSON of the `projects` value,
  overrides);
- delivery stays with the plugin (the letter goes into the OpenCode session); a task started from
  MCP is written to the journal and the plugin starts it on its next pass; a `crew_watch` from MCP is
  a request file the plugin runs (the MCP server lives only as long as Claude Code's turn).

## Install

```sh
git clone https://github.com/unitcraft/crew-harness C:/work/crew-harness
```

`~/.config/opencode/opencode.jsonc` (the server plugin):

```jsonc
"plugins": ["C:/work/crew-harness"]
```

`~/.config/opencode/cli.json` (the window plugin; a folder, not a file — OpenCode loads `tui.ts`
from it):

```json
{ "plugins": ["C:/work/crew-harness"] }
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

What each test checks, the manual latency checks and what the tests do not cover — [test/README.md](test/README.md).

History: moved with its commits from `a private plugins repository of the nova project` (`plugins/nova-peers`).
Renamed 2026-10-07 (plan 014): `nova-peers` → `opencode-peers` → CrewHarness (`crew-harness`); the plugin id is
`crew-harness`; the mailbox `crew-harness` is a junction to the folder of the earliest one (nothing moves, nothing is
lost); the settings file is `.opencode/crew-harness.json` (`.opencode/opencode-peers.json` is still read, with a
`crew_doctor` note to rename it).

License: MIT OR Apache-2.0 (see [LICENSE](LICENSE)).
