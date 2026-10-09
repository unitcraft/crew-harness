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
| | `crew-profiles-layer` | the data in force (the three keys of the working copy), one atomic write of a draft, an old `*.layer.json` ignored and named once, the snapshot of the last valid state, projects apart |
| | `crew-profiles-config` | `crew_config` and `crew_doctor` for the profile keys: forms, links on the working copy plus the new values, profile_set refused always, guide, show, the problems named |
| | `crew-profiles-select` | the model of a session by the enabled set: crew_spawn, plan task, reassign, the reviewer and the open tabs, auto-plan steps; refusals create nothing; without keys everything as before |
| | `crew-profiles-windows` | the window file in the task worktree: written before the first turn, updated with the set and the data, removed with the set / task / folder, hand-written files untouched, the root and the main folders get nothing, git ignores it; hand-written windows and the explicit threshold of Claude Code are read and named |
| | `crew-profiles-cmd` | the window commands `/crew-sets` and `/crew-profiles`: tables, show, use with its report, the edit verbs and their refusals, check, the removed save / reset, an old layer file, a broken file refused, one log line per edit, answers without a turn of the model |
| | `crew-profiles-docs` | the README example is valid JSON of the two keys and passes the key and link checks, holds the starting content; the README and the help describe keys, commands, the window file and what applies where; only the two command names, in the plural |
| Progress of background sessions | `crew-progress` | the `progress.log` journal: line and time forms, sessions, states, the copy per session over real working trees, the cache and its budget, the texts of the "Ход работ" block and of `/crew-progress`; shares `progress-vectors.json` with the guard |
| Task journals | `crew-journal` | tools `progress_line` (one line with the machine time into `progress.log`) and `usage_line` (one JSON line, `v`:1, session accounting into `usage.log` next to `progress.log`): refusals, append only, nulls instead of invented fields, the session card, the loop-lag counter, registration by setup |
| Faster landing (task 005) | `crew-landing-golden` | the texts of the base (refusals, letters, show, list) are the same with the old behaviour set explicitly (`accepted_slot: hold`, `merge_precheck: off`); with no keys the texts equal those with `free` and `required` set explicitly (the defaults since 2026-10-09); shared snapshot `landing-golden.json` |
| | `crew-landing-config` | the four keys `accepted_slot`, `cleanup_limit`, `merge_precheck`, `task_extra_fields`: refusals, reading back (defaults `free` and `required`, the explicit `hold` and `off`), guide, reserved ids |
| | `crew-landing-slot` | an accepted task waits for cleanup without a place in `inflight_limit`; `cleanup_limit`; auto-plan steps; the tab is still woken; the default is `free`, the old words at the explicit `hold` |
| | `crew-landing-extra` | extra task fields: input and refusals, the executor and reviewer letters, the plan task letter, show, reassign, the path of the record |
| | `crew-landing-precheck` | the precheck record: begin, finish and its refusals, the default `required` (merge without a precheck refused with the next step and the key of the old order; the explicit `off` takes the lock at once), unlock, rights, staleness on rework / reassign / cancel / new review, the candidate checks |
| | `crew-landing-gate` | the gate of `merge` under `merge_precheck: required` on real git with a local origin: lock only on the checked tip, the tip read under the lock, repeats of the holder, changes inside the read |
| | `crew-landing-hints` | the accept warning and the neighbour hints (read from the task journal only) |
| | `crew-landing-letters` | the letter about interrupted work with the state of the precheck and the lock; the reviewer letters, show and help for the flags |
| | `crew-landing-release` | the service releases the merge lock once the checked candidate is in the origin tip (not on a failed or local read, a not green record, another task or session); the line of the `merge` reply; accept after the release needs no lock |
| | `crew-landing-tip` | heavy: reading the tip of the target branch, the term and the process tree of `git ls-remote` on silent, closed and unreachable addresses |
| | `crew-landing-race` | heavy: child processes — 8 reviewers at one lock, a stale lock taken by 7, a restart in the middle of a landing |
| Question answering (task 007) | `crew-answer-golden` | the texts of the base (notices, the forwarded question, `/crew`, the side panel, `crew_config`, `crew_help`, letters) are the same without the new keys and with `answer_mode` owner; the old pass on a pack of blocks and on five texts; the status files; shared snapshot `answer-golden.json` and the base snapshot `answer-golden-base.json` |
| | `crew-answer-config` | the keys `answer_mode` and `answer_max`: refusals of `crew_config set`, the questionnaire, reading back, the doctor, values of a wrong form |
| | `crew-answer-parse` | the parse of the answer of a session: blocks, fields, the block-question, the reasons of the rest |
| | `crew-answer-gate` | the 190 stems of the gate words one by one, the fixed tables T-7, T-8, T-9 of the specification, the rules of the text |
| | `crew-answer-journal` | the journal of answers: the limit in a row, one answer and one letter for a question (repeats, the second instance and process, breaks between the steps), the letter, the check of the owner word, a broken journal |
| | `crew-answer-view` | the section of `/crew`, the line of the side panel, the event of the task, the status files, the word of the owner |
| | `crew-answer-docs` | the help, the README and the questionnaire: the letter, the form of a question, the recommended value, the rule of the owner word |
| | `crew-answer-flow` | heavy: the whole flow in the running plugin: the tab of the owner, task and review sessions, packs with a rest, the limit, plans |
| | `answer-harness.mjs`, `answer-golden.mjs`, `answer-fixtures.mjs`, `answer-t10.json`, `answer-measure.mjs`, `answer-scope.mjs`, `answer-child.mjs` | helpers, not tests: the shared set-up, the snapshot of the base texts, the tables of the specification, the blocks and the script of the measure of the gate words (`node test/answer-measure.mjs`), the check of the borders of the modes, a child process of the race test |

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
