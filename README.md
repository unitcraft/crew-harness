# CrewHarness

*ИИ-команда в упряжке — обвязка для команды ИИ-агентов.*

**Your AI dev team, harnessed.** Many coding agents (Claude Code, Codex, Kimi Code and others, each on its own
subscription) work in parallel, each in its own worktree, and carry work from a plan to a merge, while the owner only
approves and watches: plans rechecked in rounds, tasks with priorities and a queue, an independent reviewer per task,
one merge at a time, letters between agents, a queue for heavy runs on the machine.

## What is here

| Folder | What it is | State |
|---|---|---|
| [`opencode-plugin/`](opencode-plugin/README.md) | the crew as an OpenCode V2 plugin: Claude Code tabs of OpenCode are the agents | in use |
| `service/` | the coordination service: tasks, letters, reviews, the merge lock, the machine queue, plans — outside any one agent program; agents reach it over MCP | planned ([task 001](doc/tasks/001-crew-service/)) |
| `web/` | the owner's console in the browser: the board, live agent terminals, chat with pictures | planned (task 001) |
| `scripts/` | the repository's guards: git hooks, checks run by the hooks and CI, the agent shell-command hook, their self-tests, the installer and the GitHub setup script ([rules](AGENTS.md)) | in use |
| `.github/` | the CI workflow that runs the same guards after a push | in use |
| `.claude/` | repository-level agent settings: registers the shell-command hook | in use |
| `doc/` | [`canon/`](doc/canon/README.md) — the Canon, the project's development rules: differences from the [methodology](https://github.com/unitcraft/ai-dev-methodology), decisions (ADRs); [`tasks/`](doc/tasks/README.md) — one task, one folder (spec, plan, reviews), large work is an epic of tasks; [`research/`](doc/research/); [`archive/`](doc/archive/plans/README.md) — the plugin's plans before the methodology | |

Why a service: one OpenCode server holds every session in one process and stalls at about eight parallel tasks
([research](doc/research/2026-10-06-many-agents.md)). The service starts each agent as its own process and keeps the
rules itself, so an agent program is a driver, not the host.

## License

MIT or Apache-2.0, at your choice ([LICENSE](LICENSE)).

Rules for anyone (people or AI agents) changing this repository: [AGENTS.md](AGENTS.md).
