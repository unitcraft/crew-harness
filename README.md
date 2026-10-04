# opencode-peers

OpenCode V2 plugin: **letters between OpenCode windows** (sessions) on one machine, in any
repository, addressed by role.

- tools `peer_list`, `peer_send`, `peer_inbox`, `peer_role`, `peer_help` (also `/peer_help`);
- every window has a card on disk (role, repository, model, liveness); a letter to an idle
  window wakes it (delivered into the session as a message);
- **projects**: every window belongs to a project and its address is `project.role`
  (`nova.integrator`). A plain role means the sender's own project; `project.role` reaches another
  project; `all` is every window of the own project, `project.all` of another one; `peer_list`
  shows the own project (`all: true` — every project). Exclusive roles are exclusive per project.
  Projects are one list in the plugin options; a window belongs to the project with the longest
  matching root, a window outside the list to the project named after its repository:

  ```jsonc
  "plugins": [
    { "package": "C:/work/opencode-peers",
      "options": { "projects": { "nova": "C:/work/nova",
                                 "claude-limits": "C:/work/nova/claude-limits" } } }
  ]
  ```
- roles are shared by default; a project can make roles exclusive in
  `.opencode/opencode-peers.json` (`exclusive_roles`), with an optional `help_extra` paragraph
  (the old name `.opencode/nova-peers.json` is still read when the new one is absent);
- executor choice by task weight (`tier`) across free windows, with a queue.

The system hint the plugin adds to each request is **constant** within a session (it sits
before the whole history, and anything changing there re-bills the history on every request
with Claude's prefix prompt cache); live neighbours and their models come from `peer_list`.

## Windows on the `claude-code` provider (MCP)

The [`claude-code` provider](https://github.com/unitcraft/opencode-claude-code-provider) hands
every turn to the official Claude Code and drops OpenCode's tool list, so the plugin's `peer_*`
tools do not reach those windows. `mcp.ts` is a stdio MCP server with the same five tools
(`mcp__peers__peer_list`, ... in Claude Code), built on the same core (`core.ts`) as the plugin:

```sh
OPENCODE_PEERS_SESSION=<opencode session id> node mcp.ts   # node >= 24
```

- it acts for the one OpenCode session in `OPENCODE_PEERS_SESSION` (the provider sets it per
  request) and writes to the same mailbox (`XDG_DATA_HOME` as for OpenCode);
- the project list is not repeated: the plugin writes its `projects` option to
  `<mailbox>/projects.json` at load, the server reads it (`OPENCODE_PEERS_PROJECTS`, a JSON object
  of the same shape, overrides), so `project.role` addresses match;
- it never takes over a window's card (`pid` stays the OpenCode process'): the plugin's timer
  delivers letters, including those sent through MCP; receiving already works for these windows
  because delivery goes through the OpenCode session.

## Install

```sh
git clone https://github.com/unitcraft/opencode-peers C:/work/opencode-peers
```

`~/.config/opencode/opencode.jsonc`:

```jsonc
"plugins": ["C:/work/opencode-peers"]
```

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
