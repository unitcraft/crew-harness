# CrewHarness

*ИИ-команда в упряжке — обвязка для команды ИИ-агентов.*

**Your AI dev team, harnessed.** Many coding agents (Claude Code, Codex, Kimi Code and others, each on its own
subscription) work in parallel, each in its own worktree, and carry work from a plan to a merge, while the owner only
approves and watches: plans rechecked in rounds, tasks with priorities and a queue, an independent reviewer per task,
one merge at a time, letters between agents, a queue for heavy runs on the machine.

## What is here

| Folder | What it is | State |
|---|---|---|
| [`opencode-plugin/`](../../../../publication/originals.zip) (историческая цель: `opencode-plugin/README.md`; точный оригинал — в архиве) | the crew as an OpenCode V2 plugin: Claude Code tabs of OpenCode are the agents | in use |
| `service/` | the coordination service: tasks, letters, reviews, the merge lock, the machine queue, plans — outside any one agent program; agents reach it over MCP | planned ([task 001](../../../../publication/originals.zip) (историческая цель: `doc/tasks/001-crew-service/`; точный оригинал — в архиве)) |
| `web/` | the owner's console in the browser: the board, live agent terminals, chat with pictures | planned (task 001) |
| `scripts/` | the repository's guards: git hooks, checks run by the hooks and CI, the agent shell-command hook, their self-tests, the installer and the GitHub setup script ([rules](AGENTS.md)) | in use |
| `.github/` | the CI workflow that runs the same guards after a push | in use |
| `.claude/` | repository-level agent settings: registers the shell-command hook | in use |
| `doc/` | [`canon/`](doc/canon/README.md) — the Canon, the project's development rules: differences from the [methodology](https://github.com/unitcraft/ai-dev-methodology), decisions (ADRs); [`tasks/`](../../../../publication/originals.zip) (историческая цель: `doc/tasks/README.md`; точный оригинал — в архиве) — one task, one folder (spec, plan, reviews), large work is an epic of tasks; [`research/`](../../../../publication/originals.zip) (историческая цель: `doc/research/`; точный оригинал — в архиве); [`archive/`](../../../../publication/originals.zip) (историческая цель: `doc/archive/plans/README.md`; точный оригинал — в архиве) — the plugin's plans before the methodology | |

## Landing a task

With the default `merge_precheck: required`, a reviewer checks without a merge lock:
read the target tip with `precheck`, integrate that tip and the task changes into a candidate,
then run the full project CI. Record the exact candidate commit and green CI result with
`precheck {candidate, result}`. Do not hold the lock while CI runs. Only after the green
precheck, call `merge` to take the lock and fast-forward the target from that exact checked
candidate. If the target tip moved, discard that candidate for landing and repeat integration
and CI against the new tip. Then push and call `accept`; with `accepted_slot: free` (the default),
accept releases the inflight slot. Perform the returned cleanup separately and call `cleanup`;
up to `cleanup_limit` (10) accepted tasks may wait for cleanup. See the
[plugin's merge instructions](../../../../publication/originals.zip) (историческая цель: `opencode-plugin/README.md#review-and-merge`; точный оригинал — в архиве) for the full command flow.

Why a service: one OpenCode server holds every session in one process and stalls at about eight parallel tasks
([research](../../../../publication/originals.zip) (историческая цель: `doc/research/2026-10-06-many-agents.md`; точный оригинал — в архиве)). The service starts each agent as its own process and keeps the
rules itself, so an agent program is a driver, not the host.

## License

MIT or Apache-2.0, at your choice ([LICENSE](../../../../publication/originals.zip) (историческая цель: `LICENSE`; точный оригинал — в архиве)).

Rules for anyone (people or AI agents) changing this repository: [AGENTS.md](AGENTS.md).

> Публикационная копия: изменены только ссылки, кодировка или служебная разметка.
> Точные исходные байты и SHA — в [описании происхождения](../../../../publication/provenance.json) и архиве оригиналов.
