# opencode-peers

OpenCode V2 plugin: **letters between OpenCode tabs** (sessions) on one machine, in any
repository, addressed by role. A *window* is the OpenCode program in a terminal; a *tab* is a
session inside it (one on screen, the rest in the background). Letters are addressed to tabs.

- tools `peer_list`, `peer_send`, `peer_wait`, `peer_role`, `peer_inbox`, `peer_spawn`,
  `peer_close`, `peer_doctor`, `peer_help` (also `/peer_help`);
- **projects**: every tab belongs to a project and its address is `project.role`
  (`nova.integrator`). A plain role means the sender's own project; `project.role` reaches another
  project; `all` is every open tab of the own project, `project.all` of another one; a session id
  (`ses_...`) reaches exactly that tab. Projects are one list in the plugin options; a tab belongs
  to the project with the longest matching root, a tab outside the list to the project named
  after its repository:

  ```jsonc
  "plugins": [
    { "package": "C:/work/opencode-peers",
      "options": { "projects": { "nova": "C:/work/nova",
                                 "claude-limits": "C:/work/nova/claude-limits" } } }
  ]
  ```
- **roles**: a new tab is `worker` (shared: tabs within it differ by session id; `assistant` is an
  alias). `integrator` is exclusive, one holder per project, plus the project's `exclusive_roles`
  in `.opencode/opencode-peers.json` (with an optional `help_extra` paragraph). An exclusive role
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

A question or a task is the recipient's obligation until it answers (`reply_to: qid`). A tab
whose turn ended without the answer is woken with a reminder (up to 3); then the asker is told the
tab is stuck. Windows on Claude often stop mid-task after writing a status; this keeps them going.

## Tasks of the integrator

`peer_spawn {task, tier}` (the integrator only) starts a new session of role `worker` in the
server, with or without a window: model by tier (`claude-code/opus` / `sonnet` / `haiku`, the
project's `spawn_models` overrides), a limit of running tasks per role (`spawn_limits`, 3). The
session must report as the answer to the task's qid; then the task closes: no more letters, the
session's title gets "✓", a notice goes to the integrator's window. `peer_close` closes one by
hand.

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
- the project list is not repeated: the plugin writes its `projects` option to
  `<mailbox>/projects.json` at load (`OPENCODE_PEERS_PROJECTS`, a JSON object of the same shape,
  overrides);
- delivery stays with the plugin (the letter goes into the OpenCode session); `peer_spawn` from MCP
  is a request file the plugin carries out.

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
working; the project config is now `.opencode/opencode-peers.json` (named after the package), the
old `.opencode/nova-peers.json` is still read.

License: MIT OR Apache-2.0 (see [LICENSE](LICENSE)).
