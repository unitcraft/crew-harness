# Tests

```sh
npm test                              # all self-tests, node >= 24
node test/crew-remote.test.mjs       # one test
```

Each self-test is a plain Node script, no framework: it prints `ok  <cell>` or `FAIL <cell> :: <detail>`
per check, then `all ok` or `<n> FAIL`, and exits 1 on a failure. `npm test` runs them one after another and
stops at the first failing file.

- **A mailbox of its own.** A test sets `XDG_DATA_HOME` to a fresh `peers-*` folder in the OS temp dir before
  importing the plugin, so it never touches the real mailbox. `cleanup-tmp.mjs` (first in `npm test`) sweeps
  folders of earlier runs older than an hour — on Windows a folder held by a watch process or an open database
  can outlive its test.
- **Red probes.** Some tests take `CREW_MODULE` / `CREW_MCP` (a mutated copy of the plugin) or a
  `CREW_HARNESS_*` switch that breaks one behaviour on purpose: the cell checking it must go red. The header of
  each such test names its probe.
- **What runs for real.** The plugin is loaded in the test process as OpenCode would load it, with a fake
  OpenCode host; git repositories, files, child processes (MCP, `crew_watch`) and HTTP on `127.0.0.1` are real.
  OpenCode itself, its windows and models are not.

## Self-tests (`npm test`)

| Area | Test | What it checks |
|---|---|---|
| Basics | `peers-project` | projects from the plugin options, the longest matching root, addresses `role` / `project.role` / `project.all` |
| | `peers-config` | the project config: exclusive roles, `help_extra`, tier lists |
| | `peers-settings` | settings read committed from a settings repository; the old options form; `local` values |
| | `peers-cfgtool` | `crew_config`: guide, show with sources, set by the integrator only, applied once committed |
| | `peers-paths` | the mailbox moves `nova-peers` → `crew-harness` with a junction left behind |
| | `crew-help` | `crew_help` and `/crew-help` name all tools |
| Roles and models | `peers-role` | handing over an exclusive role with `force` |
| | `peers-shared` | shared roles with several open holders: no delivery by guess |
| | `peers-model` | the window's model comes from its current request, the database is a fallback |
| | `peers-tier` | `crew_send {tier}`: a free holder of that tier or stronger, otherwise a queue |
| Delivery | `peers-delivery` | two-step delivery, at-least-once; a claim of a crashed process comes back |
| | `peers-idle` | a letter reaches an idle window whose card was written by an earlier plugin instance |
| | `peers-wake` | only a tab open in a live window is woken; `wake: false` letters |
| | `peers-mcp` | the MCP server for claude-code windows: same mailbox and tools |
| | `peers-stuck` | a hung OpenCode call does not stop delivery |
| | `peers-housekeeping` | old read letters removed, their ids kept; the log rotates |
| Turns and obligations | `peers-flow` | ack-only letters dropped; questions with `qid` and `crew_wait`; reminders until answered |
| | `peers-push` | empty turns, `stuck`, a turn cut off by a restart is resumed |
| | `peers-flowwatch` | a question at the end of a task turn goes to the author; stalled merge lock and review |
| | `peers-status` | session status, questions to the owner, notices and reminders |
| | `peers-sidebar` | the "Peers" block lines in the window |
| Tasks | `peers-tasks` | the task journal: unique numbers, session id before create, required fields, push / reassign |
| | `peers-place` | a task's worktree and branch, never the main copy |
| | `peers-restart` | a restart between steps: each step finished exactly once |
| | `peers-review` | submission, the review queue, the merge lock, acceptance checks on a real git repo, cleanup |
| | `peers-acceptor` | the acceptor role: who reviews, limits, who may merge / accept |
| | `peers-autoclose` | tabs of closed tasks are closed, the owner's tabs never |
| | `peers-cross` | `inbound` of another project; orders between projects |
| Plans | `peers-plans` | the plan template, parser and machine criteria |
| | `peers-plan-task` | a plan task: written, rechecked in rounds, sent for approval |
| | `peers-plan-config` | a project's own plan form, grades, approver, manual steps |
| `crew_watch` | `peers-watch` | a command run detached; one letter with the exit code and output tail |
| | `peers-deny` | the project's `permissions.deny` checked on a watch command |
| Other machines | `crew-github` | GitHub issue transport on a fake GitHub: 304, batches, own comments skipped, 429 |
| | `crew-ntfy` | ntfy transport on a fake ntfy: encryption, parts, forged / replayed messages, subscription and resume |
| | `crew-tailnet` | Tailscale transport: two real HTTP bridges on `127.0.0.1`, `whois` faked; verdicts, 403, retries, max age |
| | `crew-remote` | routing by `remote.json`, the outbox, one bridge per machine, `inbound` / `may_write`, replies only from a machine written to, refusals back to the sender |
| Model profiles | `crew-profiles-data` | the data module: stages and words, value checks of `model_profiles` / `profile_sets` / `profile_set`, family of a tab model, links, windows of a set, profile choice and the state table (task 003) |
| | `crew-profiles-layer` | the local layer over the committed file: effective data, "the file now differs", save / save force, the forms of reset, the snapshot of the last valid state, projects apart |

## Manual checks (not in `npm test`)

They talk to real services, so they run only by hand:

```sh
node test/ntfy-latency.mjs [count=5] [server=https://ntfy.sh]          # publishes to a new random topic
node test/gh-latency.mjs <owner/repo> <issue> [count=5] [pollMs=1000]  # posts comments to the issue
```

Last run (2026-10-07): `ntfy-latency` on ntfy.sh — 5/5 delivered, median about 2 s, max 2.7 s; most of it is
the publish request. `gh-latency` has not been run.

## Not covered

- a live OpenCode: windows, real sessions, models and turns are faked;
- other machines for real: no run between two machines, no real Tailscale (`tailscale ip -4` and the
  `tailscale whois --json` parsing are untested), no real GitHub;
- types: there is no TypeScript in the project, Node strips the annotations without checking them.

The status of the work on other machines and what comes next — in the main [README](../README.md#status-2026-10-07).
