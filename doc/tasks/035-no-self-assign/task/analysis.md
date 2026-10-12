# Task 035: analysis

Places where a task gets an executor (core.ts) and the decision for each:

| Place | Executor | Can equal the author? | Decision |
|---|---|---|---|
| `crew_task assign` | `target.session`, an existing tab chosen by the caller | Yes: `session` may be the caller's own session | Refused unless project key `allow_self_assign: true`; the legal case (another tab, including the owner's) stays |
| `crew_spawn` | `plannedSessionId()`, a fresh session made by the plugin | No: a new id | No change |
| `crew_task reassign` | `plannedSessionId()`, a fresh session | No: a new id | No change; the test checks it |
| `crew_task order` | none (`order_to` is another project's integrator; the task has no executor) | No | No change |
| plan steps made by the plugin (auto-plan) | go through the spawn path | No | No change |

The key `allow_self_assign` is a bool (default off), human-only: `crew_config set` does not write it, the owner edits the settings file.
