# Fingerprints / external status — С3

Read-only observations, not endorsements of external work and not proof of semantic completeness.

| Subject | Observed state | Interpretation / limit |
|---|---|---|
| Methodology clone | local `HEAD` and `origin/main` `78ed75838ef58073153e5343c9483bc462721a31`; `ls-remote origin refs/heads/main` returned same. Working tree status `## main...origin/main`, clean | Published main at this observation only; check again at later gates/transfers |
| Baseline a449 | Commit object available; diff a449..78ed has 5 paths; exact diff saved in session tool output and key normative anchors summarized in plan §2 | Does not cover changes after 78ed or imply pin transition |
| 045 | HEAD `b18cc5052b6183d9c15fc1833006f1cb86481a3c`; status `task/22-... ...origin/main [behind 111]`, untracked `doc/tasks/045-runner-registry-jsonc/`; selected plan/spec expected SHA values from assignment and task materials | Existing author work; never alter. Plan read only through line 175. Status is not a clean baseline and these changes are not mine |
| 013 | HEAD `7f2b0f6ea2f9ad55258a17eb614ed03b627ce596`; existing modified/untracked files under `doc/tasks/013-runner-core/`; `git ls-files src/runner_core` empty; `Test-Path src` and `src/runner_core` both False | No such paths in observed checkout. Does not prove absent in another ref/checkout and does not establish compatibility |
| Own protected files | Selected hashes in `baseline.md` | Must rehash after drafting; selected files only |

No fetch, checkout, worktree modification, or write to external repositories was performed.
