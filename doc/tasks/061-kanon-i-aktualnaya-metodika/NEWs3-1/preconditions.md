# Preconditions — independent S4 input

| Assumption / dependency | Read-only check in S3 | Observed result | What it proves / does not prove | Required future action |
|---|---|---|---|---|
| The plan's method baseline reflects published method | `git rev-parse HEAD`; `git ls-remote origin refs/heads/main`; `git diff a449..78ed` | Both refs at `78ed75838ef58073153e5343c9483bc462721a31`; 5 changed paths | Exact moment's ref and available diff; not future latest | Repeat before gates/transfer; drift → stop and repeat delta/gates |
| Gate question procedure is included in target scope | Inspect new `methodology.md` hunk | New norm, session gates only; explicit exclusion of program V1–V13 | Normative requirement, not code enforcement evidence | Map to README/process/ADR and test prose against boundary, repeat, recorded source |
| S4 can read-only verify all external assumptions | Inspect new `task-sessions.md` S4 p.7 | Each assumption enumerated, read-only check, heavy/state-changing check not run, result per assumption, impossible actions/questions recorded | Reviewer norm; not yet independent S4 outcome | Preserve a check inventory and read-map in S4; exercise all preconditions and identify no-question actions |
| 045 contains authoritative full registry/signatures and finished plan | Read current tree status and `plan.md` beginning | Worktree has untracked task package; plan status draft; owner decision selects path, not full catalog | Not confirmed; uncommitted external work cannot be treated as approved or complete | Keep as blocker in 045; do not make 061 depend on nonexistent signatures; no 045 write |
| 013 provides a runtime consumer API | `ls-files src/runner_core`; `Test-Path src` and `src/runner_core`; HEAD/status | No src paths in observed tree; task files dirty/untracked | No runtime at these paths in this checkout only | No compatibility claim; use exact unknowns, do not launch 013 |
| Canon's cited baseline remains latest | Compare remote at a named moment, not local pin alone | Original `a449` is behind observed `78ed`; delta includes gate question and S4 p.7 | Old map alone is insufficient | Update plan's coverage/delta at gates; no old active-task pin rewrites |

No prerequisite is treated as completed implementation or runtime PASS. This file is a S3 observation; S4 must independently repeat the read-only commands and report output/ranges.
