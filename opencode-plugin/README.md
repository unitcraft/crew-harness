# CrewHarness — the OpenCode plugin

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
background); a task session may run with no window at all. Formerly `opencode-peers` (renamed 2026-10-07, plan 005).

- tools `crew_list`, `crew_send`, `crew_wait`, `crew_watch`, `crew_role`, `crew_inbox`, `crew_spawn`,
  `crew_task`, `crew_config`, `crew_doctor`, `crew_help` (also `/crew-help`);
- **projects**: every tab belongs to a project and its address is `project.role`
  (`nova.integrator`). A plain role means the sender's own project; `project.role` reaches another
  project; `all` is every open tab of the own project, `project.all` of another one; a session id
  (`ses_...`) reaches exactly that tab. A tab belongs to the project with the longest matching
  root, a tab outside every root to the project named after its repository. **The project of a tab
  and its settings folder are found by the project, not by the folder the tab stands in** (task 067):
  the card of the tab names its project (`cards/<session>.json`, field `project`), and a tab that
  moved into the working tree of a task — a tree lies outside the project root — keeps it. Without
  the name the plugin asks git which repository the folder belongs to (`git rev-parse
  --git-common-dir` points at the `.git` of the main working folder; the folder name is never
  guessed) and takes the project whose root holds that main folder. Reading and writing
  (`/crew-sets use`, `/crew-profiles`, `crew_config show|set|apply_template`, the window files) go to
  the settings folder of the main working folder of the project; the committed copy of the file in
  a task branch does not stand in for it. A tab in a folder that belongs to no project is refused
  with «папка вкладки … не относится к проекту», not with the old-form text;
- **project settings live in a settings repository**, not in the tab's working copy (a project can
  be a folder of many repositories, like `C:/work/nova`). The plugin options list settings
  folders — any folder inside a git repository; the file `.opencode/crew-harness.json` there
  names the project and its root (relative to the folder) and is read **committed** from the
  default branch (`git show`; another branch: its `"branch"` field), never from the working copy:

  ```jsonc
  "plugins": [
    { "package": "C:/work/crew-harness/opencode-plugin",
      "options": { "projects": ["C:/work/nova/nova-settings", "C:/work/tools"],
                   "local": { "nova": { "spawn_models": { "light": "kimi/k3" } } } } }
  ]
  ```

  ```json
  { "project": "nova", "root": "..", "task_fields": ["goal", "criteria", "boundaries"],
    "worktrees": "worktrees", "branch_name": "p{n}-{slug}", "spawn_limits": { "worker": 3 } }
  ```

  The plugin option `retention_days` (default 7, `0` is off; formerly `keep_days`) makes a once-a-day pass remove delivered letters, empty mailbox folders and the cards and statuses of closed tabs older than that; open questions, undelivered letters, open tabs and task records are never touched.

  `local` holds machine-specific values on top of the file. The old options form
  `{ "nova": "C:/work/nova" }` still works (settings are then walked up from the tab folder, or from the project root when the tab stands in a working tree outside it);
  `crew_doctor` suggests the new form. **`crew_config`**: `guide` — a questionnaire for the owner on
  every key (current value, options, recommendation, why; asked in text); `show` — what applies and
  where from (default, the committed file, `local`), plus uncommitted edits; `set {values}` — the
  integrator writes the working copy (every value checked, a wrong one writes nothing); it applies
  once committed; `apply_template` — the integrator appends the standard model template (`config-template.ts`: families
  `claude` / `codex` / `kimi`, sets, `profile_set: codex`, `tier_max: light`, branch and worktree name templates) to the
  file, the project's own keys win, nothing is overwritten, and the file still has to be committed to the target branch.
  **A project without model settings** (no enabled `profile_set`, no `spawn_models`, no `allow_default_models: true`)
  refuses `crew_spawn` without an explicit `model`: the refusal tells the integrator to ask the owner (`question`) —
  apply the template, use the model of the calling session, or choose otherwise. `crew_doctor` shows
  «проект X не настроен: модели» for such projects (`/crew` shows the counter `⚠ no models`). `allow_default_models: true` keeps the built-in defaults on purpose.
  The keys: `config-schema.ts`;
- **roles**: a new tab is `worker` (shared: tabs within it differ by session id; `assistant` is an
  alias). `integrator` is exclusive, one holder per project, plus the project's `exclusive_roles`
  (and an optional `project_rules` text: English, appended to the end of the tab's system block). The
  `owner_language` setting (an English language name, default `Russian`) is the language of everything the owner
  reads — replies, questions, options, reasons, and letters to other tabs and task reports, which the owner sees in
  popups and in the recipient's tab; the system block takes it from the setting. An exclusive role
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
✉ 01:17 · 008 приёмщик nova.worker → nova.integrator
<text>
↩ ответ — crew_send {to: "ses_…", text: "..."} · письмо соседа, не слово владельца
```

A service letter of the plugin starts with `⚙ 01:17 · crew → … (служебное, не отвечай)`. Window notices are short (the gist in the
title, one line of text) and stay longer when they matter: "waiting for you" 30 s, "stuck" 15 s, others 8–10 s
([plan 003.1](../doc/archive/plans/003.1-clear-letters.md)).

## Glued words in letters

Models gpt-6.1-sol and gpt-6-astra (openai) sometimes drop spaces in long mixed Russian/English string literals inside `execute` code (`crew_send({text:'...'})`); the plugin is not at fault.
`crew_send` rejects a letter with two or more glued mixed-alphabet runs of 20+ characters (code, links, paths and hashes excluded), or one such run in a long text with under 6% spaces.
Workaround: a short letter, details in a file and a link to it.

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

## The summary at context compaction (`compaction_summary`)

When a tab's context reaches the threshold, OpenCode 2.0.26 writes a summary itself, by a template that is fixed in its build
(Objective, Requirements, Decisions, Work State, Next Move, Relevant Files, Important Context) and added as the last message of the
compaction request. Left alone it lists commit and file hashes, card and session numbers, reviewers' process remarks and state the owner has
already changed. The plugin uses the session hook `compaction` (same payload as `context`: `system`, `messages`, `tools`, `model`, `agent`) and
adds one rule to the system part of that request (`compaction-summary.ts`): the five sections of the pattern — what the owner decided
(verbatim, with date and source), open questions to the owner, what runs and what waits, where the documents are (paths), what must not be done — go
under the headings of the template (the build accepts a summary only with one of them), 1–1.5 thousand characters a section, up to 6 thousand
in all, hashes and numbers only when the work cannot go on without them. The pattern itself lives in one place, the Canon: [Сводка при
сжатии контекста](../doc/canon/process.md#сводка-при-сжатии-контекста). The setting **`compaction_summary`** (default `true`) turns the rule off
(`false` leaves the summary to OpenCode). Not for tabs of the `claude-code` provider (Claude Code compacts those itself) and not for
provider-native compaction. The rule is a request, not a barrier: the plugin cannot see the summary text.

## Waiting for something long: `crew_watch`

`crew_watch {command, note?, minutes?}` -- the plugin runs a waiting command (Git Bash, the tab's directory) in the
OpenCode server, detached, and when it exits wakes the tab with a letter: exit code, duration, output tail. The tab
ends its turn meanwhile. It survives the end of the turn and a service restart; a command gone without an exit code
is reported as cut off; the time limit (default 120 min, up to 720) stops it with code 124. In a claude-code tab this
is the only way: Claude Code's own background tasks (`run_in_background`, Monitor) die with the turn
([plan 002.1](../doc/archive/plans/002.1-watch.md)).

**The machine queue.** `machine: true` marks a command that loads the machine (a gate, a build, a full test run):
it waits for a slot in the project's machine queue — `machine_slots` at a time (1; 0 — no limit), in the order they
were set; the time limit counts from the start. `crew_watch` says how many are ahead, `/crew` shows it as `queued`, the
letter says how long it waited. Use it only for heavy commands: waiting for a remote CI (a `gh` or `check-push-proven-by-ci` polling loop with a pause)
and anything else that does not load the machine goes with `machine: false`, or it holds the slot while other windows'
heavy runs stand idle. Ordinary watches and other projects do not wait ([plan 002.2](../doc/archive/plans/002.2-machine-queue.md)).

**The project's deny rules.** The command runs outside the window's permissions, so `crew_watch` checks it against
`permissions.deny` of the project's `.claude/settings.json` (from the tab's directory up to the git root; no file — no
check, an unreadable one — refusal): a command matching `Bash(…)` / `PowerShell(…)` (`prefix:*`, `*` as a wildcard),
whole or in any subcommand (`&&`, `||`, `;`, `|`, a newline, the body of `bash -c '…'`, `$(…)`; `git -C <dir>` and
`VAR=1 timeout N` prefixes do not hide it), or naming a file under a `Read(…)` glob is refused, naming the rule.
**Who started it:** the command's environment carries `CREW_SESSION_ID`, `CREW_ROLE`, `CREW_PROJECT`, and
`CREW_REVIEW_N` for the reviewer of an open task, `CREW_TASK_N` for its executor — fixed when the watch is put and
kept in its record, so a restart or a later role change does not alter them ([plan 002.7](../doc/archive/plans/002.7-acceptor-role.md)).

## Who waits for what: `/crew` and "waiting for you"

The window's right panel shows a "Crew" block under "Context": the sessions of the project of the tab on screen —
the ones waiting for you first, who is working and how long, who waits for what — refreshed every 2 s
([plan 003.2](../doc/archive/plans/003.2-sidebar.md)). A task is shown once (task 064): its number and title lead, as a heading
wrapped by words onto two rows at most and cut with `…` (`‖ 085 Accept Oracle evaluation`), the mark on the left being its most
important tab's; under it a row per tab with the role and the state (`↳ исп  вопрос — ждёт ответа`, `↳ прм  ↻ ждёт доработки`), and under
that, as before, the question or the waiting phrase and the steps. A reviewer's step in progress names its id and a short name taken
from the step's text (`проверка 3/12: sabotage — подсунь негодное`, wrapped the same way). The steps line stands once per task, under the
reviewer (the executor and the other sessions have none; with no reviewer among the shown tabs it is one row under the title; `/crew` follows
the same rule). A task with a folder heads its sessions
the same way (`061 Канон и актуальная методика`, no mark: the sessions carry theirs); a session of the methodology shows its code and
the name of its kind (`↳ С2-5 проверка спецификации`, the state on the row under it; the names come from one list, the same as in the
"Ход работ" block; a code outside it takes the short name of the session's goal), and the finished sessions fold into one row
`✓ сдано N сессий`, so the rows they freed go to live tabs. `/crew` is a different, minimal screen: see «The `/crew` screen» below.

**How the panel is drawn (task 068).** The hierarchy is a sign and a colour, never an indent: no row of the panel starts with a space
(the window keeps leading spaces, but a wrapped row restarts at the first column and two rows that start with the same two spaces
read as one column, so an indent is no sign). The title of a task is **white** (the theme's base text colour) and starts with the
tab's mark (`• 098 Разобрать provenance`) or, with no mark, with the number; the second row of a long title starts with `·` and is
white too. Everything under the title is **grey** (the theme's muted colour) and starts with `↳`: the row of a tab or a session
(`↳ исп  работает 12 мин`, `↳ ? С2-5 проверка спецификации`), a wrapped rest of a row (`↳ plan 091 597м`), the steps, the question or the
waiting phrase, `↳ ✓ сдано N сессий`. The accent colour stays for what needs you: a tab that waits for you (or stands idle, or asked
a question) with its rows, the heading of its task, and the `⚠` rows (`⚠ застряла с ЧЧ:ММ`, `⚠ не на ветке: …`). A tab of an
integrator with no task is a row of its own with its mark and the role (`? интегр.   ждёт вас 01:42`). A wait for a watch or a
queue puts the essence first and the time at the end of the last row (`↳ прм  ⧗ ждать отдельный cleanup` / `↳ plan 091 597м`); when
the essence does not fit in two rows it is cut with `…` and the time stays.

**The colour of what waits for you (task 082).** The rows that need you (`Ждут вас: N`, a tab that waits, asked or paused, `⚠ …`) are
drawn in the theme's **warning** colour, not in the plain white: the owner saw «ждёт указаний» merge with the titles, because the theme
of OpenCode 2.x has no `text.accent` or `text.primary` (its colours are `text.base`, `text.muted` and `text.feedback.*.base`; the accent
is the hue `hue.accent`), so the old expression fell to the plain colour. One function, `toneStyle()` in `attention-color.ts`, serves both
blocks ("Crew" and "Ход работ"): the warning colour, then the accent, then the primary, the first one that differs from both the plain text
and the grey (compared by value). When none does, or the theme has no such fields at all, the row keeps the plain colour but is drawn
**bold**, a sign visible without colour. The tones `base` and `muted` are not touched.
Marks of a tab (the same in `/crew` and `/ask`): `?` — waits for you;
`▶` — asked a question in text and waits for the integrator (or you), labelled `вопрос — ждёт ответа` (the word `question` in `/crew`) with the question
under it; `‖` — its turn ended with a waiting phrase and no question mark («жду дальнейших указаний», «ожидаю вашего
решения»), labelled `ждёт указаний` (the word `paused` in `/crew`) with the
phrase under it — such a tab gets no "continue" either, the same as a question (task 056); a tab of yours waiting with such a
phrase is counted in "Ждут вас" with `‖`, not `?`, and once the plugin sees no question form open it turns into `⚠` (task 064, below); `⚠` — the tab recorded a gate (`log_line` kind `ворота`), its turn ended, and no question to you is open: labelled `ждёт вашего решения, вопроса нет` (task 062, see `log_line` below); `◷` — the tab stands idle with an open task and no question to you, labelled `простаивает …` (task 063, see below); `•` — its turn is going. The window closes the tab of a task or review session two minutes after its task was merged (accepted — before the cleanup: an open tab keeps the server watching the task's folder, and Windows will not remove it) or cancelled, unless its turn is going or
the tab is on screen (the owner's own tabs are left alone; the session stays in the history). `/crew-config` shows the project's settings in effect, each with where it comes from (default, the committed file,
`local`), like `crew_config show`. `/crew-doctor` shows the service's last self-check (made at start and every 10 minutes), like `crew_doctor`. `/crew` in any window (also in the Ctrl+P palette) shows, without a model turn, the sessions of the projects in the
minimal form of «The `/crew` screen» below: working, **waiting for you** (its last answer ends with a question and you have not
written since), waiting for a watch, for an answer to its question, for its task's review or rework, for its own tasks, or
idle — your project first, the ones waiting for you on top. A session that starts waiting for you puts a notice into every live window
(with Open; a system notification when the window is not focused, if OpenCode's `attention.notifications` is on)
and repeats it every `owner_reminder_min` minutes (15; 0 — once) until you answer ([plan 003](../doc/archive/plans/003-status.md)).

### The `/crew` screen (task 077)

The owner (2026-10-17): «в /crew нужно уменьшить количество текста до минимума, оставшийся сделай на анг., общается crew должен на моем
языке». `/crew` (`formatStatuses` in `status.ts`) shows the minimum and its labels are **English and short**; what tabs and the owner
write (titles of tasks, questions, options, goals of sessions, the note of a watch) is shown **as it is** and is never translated. The
language the tabs write in is `owner_language` of the project (above): `/crew` only shows their words and substitutes nothing — the
question of a tab is printed whole (spaces folded to one line), the title of a task is printed whole. The side panel keeps its own
Russian words and drawing (task 068); `/crew-sets`, `/crew-profiles`, `/crew-progress` are not touched.

```
Waiting for you: 4 · since 15:22 · nova 094 rev
crew-harness
  ? integrator  waiting you 39m
      ↳ <the question of the tab, as it is>
  061 Канон и актуальная методика · 26 done
    ‖ С2-5 spec review  paused 22h
  022 <title> — exec submitted · rev in review 12/12 ⚠ stuck 34h
nova · uncleaned 091 29h · reports 091 098 099 · ⚠ off-branch · /crew-doctor
  ? 094 <title>
    ? exec  waiting you 46m
        ↳ <the question of the tab, as it is>
    rev  working 5m 2/3
  ◇ plan 8 <title> — approval · /plans
idle: ai-dev-methodology
```

- **One line per tab**, plus its own `↳` line for the question to the owner. The mark is that of the panel (`?`, `▶`, `‖`, `⚠`, `◷`), the
  number is the number of the task as it is shown everywhere (`094`, `061`, `022`), the role is `exec` / `rev`, a session of a task with a folder
  is its code and kind (`С2-5 spec review`), then one state word and how long (`35m`, `10h`, `2d`). A task without a folder whose tabs
  ask the owner nothing is one line: the heading and its tabs after `—`. Finished sessions of a task with a folder are not listed:
  `· 26 done` (the same rule as the panel's «✓ сдано N сессий»).
- **The first line** is the one «Waiting for you» for all projects: how many, since when (the oldest), and the project and the tab to open.
  The project line is its name and the counters; a project with only free tabs and nothing to count is on the last line `idle: …`.
- **The words** are one list next to the words of the panel, in `progress.ts`: `CREW_STATE_WORDS` (`waiting you`, `question`, `paused`,
  `working`, `watch`, `queued`, `reply`, `tasks`, `stalled`, `idle`, `gate`, `hung · Esc`, `no turn · Esc`, `done`), `TASK_WORDS` (`submitted`,
  `in review`, `rework`, `accepted`, …), `ROLE_WORDS` (`exec`, `rev`), `SESSION_KIND` (the kinds of the methodology: `spec`, `spec fix`,
  `spec review`, `plan`, `plan fix`, `plan review`, `work`, `work resume`, `work fix`, `work review`, `delivery`, `delivery fix`,
  `delivery review`, `feedback`; a code outside the list shows the goal of the session). `SESSION_WORDS` and the words of the panel stay
  Russian. `hung · Esc` and `no turn · Esc` name the two states of the plugin itself (a hung turn; a message that did not reach the
  server), recorded in the field `sys` of the status file.
- **Counters** (on the line of the project, only those that are not zero): `plans N` (plans being written or rechecked; a plan that waits
  for you is its own row `◇ plan N … approval · /plans`), `uncleaned NNN Ч` (accepted and not cleaned after all reminders), `reports NNN …` (accepted or
  merged tasks with a report of the last day, up to three), `stale asks N`, `answers N (M owner)` (automatic answers of the last
  24 hours and how many the owner took over), `for you K` (questions the answers left to the owner), `lock NNN Ч` (waiting for the merge lock),
  `⚠ off-branch` (settings in the working copy differ from the branch) and `⚠ no models` (the project has no model settings), with
  `/crew-doctor`.
- **Where the rest is now.** The model of a tab: `crew_list`, `/crew-profiles`, the field `model` of `status/<session>.json`. The sentence of
  the state (`detail`) and the reason of «stuck» (`stuck[].what`), the stale questions (`askedStale`): the same file. The text and the
  short name of the step being checked: the side panel («проверка 3/13: id — название»), `crew_task show N` (the steps and the report).
  The finished sessions of a task: the journal of the task folder (`log.md`) and the record of the task. The plans, their rounds and steps:
  `/plans`, `crew_task list` and `show` of the plan's task. The questions and answers of automatic answers: the history of the task
  (`crew_task show`), the line «авто 24ч» of the panel. The lock and the settings: the panel (`ждут замок`, `⚠ не на ветке`), `crew_doctor`
  (`/crew-doctor`) and `crew_config show`. The screen no longer ends with a line of time: it does not refresh by itself.

### An idle tab between sessions is marked and woken (task 063)

A tab that set tasks (the integrator, as a rule) may stop with nothing going: the next session of a task is not launched, a
session waits for its word, and no question to you is open (owner, 2026-10-16: «что-то застряло?»). The tab **stands idle** when
its state is "waiting for its own tasks" (no turn going, no question to you — a form, a question mark or a waiting phrase at the
end of the turn, a gate of task 062 —, no `crew_watch`, no own question with `expect_reply` waiting, no own task), the tab is open in a
window, and among its open tasks one stands — between sessions (status `idle`), or its executor or reviewer waits for the tab
(marked stuck towards it, or its turn ended with a question) — while no other task goes, or some session waits for the tab. A
task goes in `starting`, `running`, `rework` (the executor works), `submitted` (the plugin assigns a reviewer; the flow watch raises a
long wait), `reviewing`, `accepted` (the reviewer) and `approval` (the plan waits for you in `/plans`). The stand starts at the end of
the tab's last turn or at the last change of the standing tasks, whichever is later. Past `idle_tab_minutes` (20; 0 — off) the tab
gets ONE letter «Ты простаиваешь N мин: у задачи <…> нет идущей сессии … и нет вопроса владельцу. Сделай следующий шаг цикла или
задай вопрос владельцу инструментом question», and the side panel shows `◷ простаивает с ЧЧ:ММ (N мин), вопроса владельцу
нет: 061 между сессиями` and `/crew` the row `◷ integrator  stalled 35m` (the tab does not count in "Ждут вас": it waits for nobody). An empty turn in answer to the letter keeps the
episode (no second letter, the mark comes back); the episode ends with a working turn of the tab (a tool call), your word in the tab,
an open question to you, a watch, a launched session, or a change of the standing tasks; a new stand past the threshold is a new
episode with its own letter. The episode with a sent letter is kept in `idle-tabs/<session>.json`, so a restart of the service
does not repeat the letter.

**The same rule by the status of the task (task 070).** The status "going" does not yet mean that somebody works (owner, 2026-10-17:
«никто не работает?»). A task in `starting`, `running` or `rework` **stands** when it has no executor (`096 без исполнителя`), when the
plugin knows no live session of its executor (`сессии исполнителя нет`: no summary of the session and the card does not wake), or when the
executor is **silent** — its turn ended, and it waits for nothing: no `crew_watch`, no question to you, no own question, no letter in
delivery, no going turn (`092 исполнитель молчит с 10:24`). The silence is counted from the end of the executor's last turn, the newest
unread letter to it, or the last change of the task, whichever is later, and must last `idle_tab_minutes` too (one setting for both
rules). Unlike "between sessions", such a task is not excused by another task that goes: another task does not revive a dead one. An
**order** into another project (`kind: order`) has no executor by construction, so it is not "a task without an executor": it goes while
the integrator of the addressee took it (`child`) or works a turn now, and stands when nobody took it for `idle_tab_minutes` — named apart
(`096 заказ не взят: nova-bignum.integrator вне окна`, or `в окне, но не взял`). A silent executor that asks the tab (the state
"question") or is stuck towards it still reads as "waits for the tab" of task 063. `submitted`, `reviewing` and `approval`
stay as before (`accepted` — task 076, below). The letter adds the steps: reassign (`crew_task reassign`), write to the executor
(`crew_send`), cancel (`crew_task cancel`); for an order — ask the owner whether he opens the window of the addressee, or cancel the
order.

**An accepted task nobody cleans up (task 076).** The reminders of an accepted task that is not cleaned up stop after the fifth
one (task 043), and the status `accepted` used to read as "goes" for ever: on Nova a task waited nine hours for a cleanup plan while
all five letters were read (owner, 2026-10-17: «6 — по рекомендации»). Now an `accepted` task **stands** when all five reminders
have gone to its author, its reviewer does not lead the cleanup, and `idle_tab_minutes` (no new key) have passed since the latest of
the last reminder, the reviewer's silence and the last change of the task. The reviewer **leads** the cleanup while its turn goes, a
question to you or its own question with `expect_reply` is open, or it asks the author; a `crew_watch` of the reviewer leads it only
when it was started within the threshold — an older watch with no turn and no change of the task is waiting without progress. A
reviewer without a live session (or a task without a reviewer) does not lead. Fewer than five reminders, a younger stand, and a
cleaned task (`done`) are out of the rule; as with the other stands, another task that goes does not excuse it. The author gets ONE
letter «задача NNN … принята в ЧЧ:ММ, все 5 напоминаний об уборке ушли, а приёмщик её не ведёт» (write to the reviewer with
`crew_send`, or clean up and call `crew_task cleanup` yourself) and the mark `◷`: `NNN принята, уборка ждёт приёмщика с ЧЧ:ММ`
(the time of the acceptance). The episode ends as the others do: a working turn of the tab, your word, a cleaned task, a turn of the
reviewer.

### A question to the owner is not lost (task 040)

A question of the built-in questionnaire (`question`) is kept as a record in `forms/` until it is answered. `form.replied`
closes the record; a new model request of the tab, a succeeded end of its turn after the question, or your own word in the
tab close it too (so a false "waiting for you" goes away at once; the 12-hour TTL stays as the last resort). `form.cancelled`
(you pressed Esc) and a question that vanished without any event (the window or the service was restarted) do not close it:
if the tab has no running turn, the plugin wakes it with a service message that holds the question text and the options and asks
to call `question` again. At most 3 repeats, at least 2 minutes apart, and not in the first 3 minutes after a start of the
service (the windows get time to show their questions again); then the record says "без ответа, нужен владелец" and nothing wakes
the tab any more. The plugin never answers for you and never picks the recommended option.
A question you cancelled with Esc (`form.cancelled`) is returned faster: once its turn has ended the tab is asked again after 3 seconds
(`CREW_HARNESS_FORM_CANCEL_GONE_MS`), the service looks every second until that is done, a busy tab and your own word in the tab still hold it back.
**A window of the plugin over a question (task 069).** In OpenCode the keys go to ONE handler, the one of the keyboard mode pushed last: a dialog
pushes `modal`, the questionnaire pushes `form`. A question that is open before a window of the plugin is safe (Esc closes only the window). A
question that arrives while the window is open takes the keys at once: Esc would cancel it, Enter would answer it with the first option, and the window
cannot be closed by its own keys. So every window the plugin opens (`/crew`, `/crew-sets`, `/plans`, menus and inputs) is guarded: when another mode
holds the keys longer than 0.3 s the plugin closes the window itself, tells you in a notice, and the question stays open and on the screen; open the
command again if you still need it (now the window lies over the question, which is safe). Windows of OpenCode itself (palette, model picker) are not
guarded. Code: `dialog-guard.ts`, self-test `crew-esc-question`.
Every window shows who waits for you, over all projects. `/crew` starts with one line `Waiting for you: N · since ЧЧ:ММ · <project> <NNN role>`
(the time and the source of the oldest wait, so a window of another project sees the question is not its own). The side panel
shows it on three lines, so the narrow panel cuts nothing you need: `Ждут вас: N · с ЧЧ:ММ`; `? <project> <NNN role>` — the tab
that waits longest, whole (`‖` when its turn ended with a waiting phrase); `↳ <question>` — the start of its question, cut to the panel (no question text, no third line).
`/ask` lists every tab that waits (project, tab, how long it waits, text and options): the questionnaire questions and the
tabs whose turn ended with a question. A question gives a notice at once and again every 30 minutes while it is
open. With `owner_system_notify: true` the project also gets a Windows system notification (built-in PowerShell, no installs and no rights;
off by default).

### The same question asked again closes the old form (task 071)

A tab that asks the same question again (the text and the options are the same, both, in the same order; case and spacing do not
count, nothing is guessed by closeness) gets a new form, and the old form of that tab becomes «replaced»: its record stays in
`forms/` as history (`replacedBy`, `replacedAt`), but it is no longer an open question - it is not in `/ask`, in «Ждут вас», in the
panel, in `crew-answer` or in the reminders, and the plugin never wakes the tab for it. An answer to it is refused with
«вопрос задан заново формой <id>, ответьте на неё». A form of another text or other options, a form of another tab, and a form
of a tab whose turn is long over and that was not asked again all stay open: the question is still the owner's. Duplicates that
piled up before the rule are closed by the same rule at the first pass of the plugin (the tick of the lost questions and the
pass over the answer files).

#### The same options in the repeat (task 073)

One more case closes the old form, only inside the repeat: the plugin itself asked the tab to ask again (the form was woken at least once, or
the repeats are used up: «без ответа, нужен владелец»), and the tab then made a new form of the same tab with **the same options** - all
labels, in the same order, case and spacing do not count - but in other words. The old form becomes «replaced» as in 071 (`replacedBy`,
`replacedAt`, and `replacedReason`: «повтор тем же набором вариантов»), an answer to it is refused with the new id, and the plugin never
wakes the tab for it. The new form must be made after the first wake. Not covered: a form that is not in the repeat (even with the same
options - «Да» / «Нет» of two different questions stay two), a form that was cancelled but not yet woken, other options (a subset, a
superset, another order), a form without options, another tab, and a tab that went on without asking again (that form goes by the
12 hours term). Duplicates that piled up are closed by the same pass as in 071.

### Your answer to a question from outside the window (task 059)

On your word in the orchestrator chat, the orchestrator can pass your answer to an open questionnaire of any tab:

```
node scripts/crew-answer.mjs                    # open questions: project, tab, form id, question, options
node scripts/crew-answer.mjs <form id | session | project.role> --option 2 --quote "your word"
node scripts/crew-answer.mjs frm_123 --text "your own answer" --quote "your word"
```

The script puts an answer file into `<mailbox>/answers/` and waits up to 30 s for the result. OpenCode 2.0.26 gives the plugin no
way to reply to a form (no `form.reply` in the plugin context), so the plugin closes the question by an interrupt of the turn
(`session.interrupt`, as on Esc) and sends the tab a letter «Ответ владельца на ваш вопрос «…»: <answer> (передан через
оркестратора по слову владельца: «…»)». The record in `forms/` goes as answered (no repeat of task 040), the task of the tab gets
the event «ответ владельца через оркестратора», the plugin log a line `owner answer <id> applied`. Not applied — no open question
(or it is already answered), no such option, no quote, the interrupt failed (the question stays open): the reason is in the file
(`status: refused`, `why`) and in the log. Only files in the local data folder of the service are read; whoever can write there
can forge an answer, the same border as the mailbox — the log line and the task event are the signal.

#### A tab that asks again after your answer (task 078)

A tab may keep asking the same question although you answered it from outside the window: the queue of the OpenCode server holds old
service messages ahead of the letters with your answers, so the model sees «ask again» or «continue» and calls `question` each time (live
case: task 094, four answers, nine questions in five hours). The plugin cannot see that queue, so it counts what it sees: a form of the
tab made **after the letter with your answer was handed to the tab**, with **no working turn in between** (a tool call other than
`question`), and **the same ask** as the answered form (the same number of options with the same labels in the same order - a label may be
a whole-word prefix of the other, «Разрешить» and «Разрешить Phase 1»; with no options, the same text). **The third such form in a row
opens the loop** (`forms/loops/`, `LOOP_AFTER`). An answer that was not delivered (the tab is busy, the letter waits), a working turn
between the questions, other questions and two forms only are not a loop. While the loop is open: the reminder «Не завершено» and the repeats
of a lost question stop (your answers still reach the tab); you get **one row** - state «waiting for you», the mark `↻`, «вкладка зациклилась
на вопросе: <вопрос> (ответ дан N раз); переназначьте задачу (crew_task reassign) или напишите вкладке прямо» in the panel, `/crew` (the
counter `loop: N` in the project line) and `/ask`; the author of the task gets **one letter** with the way out (`crew_task reassign` with
your answer in the goal) and a line in the task history. The loop is cleared by a working turn of the tab, your word in the tab, a
reassigned or closed task, a closed tab.

#### An exhausted question is not a wait once the tab went on (task 084)

A question whose repeats are used up («без ответа, нужен владелец») stays the state `owner` only while nothing else happened to the tab.
Once the tab **worked after it** (a turn runs, or a turn ended after the form was exhausted - a letter was handed over and taken) or **made a
newer form**, the exhausted form is spent: it gives the tab no `owner` state, and it is not in «Ждут вас», in `/ask` or in the reminders. The
record stays in `forms/` (`resumed` is the time the service saw the tab go on; `crew-answer` still sees the form and takes an answer to it).
A form with repeats left, a plain open question and the loop of task 078 wait as before. Likewise the mark `⚠ застряла` / `⚠ stuck` is not shown
when the task is already past the tab: the review of a task that is accepted, done, cancelled, back with the executor on rework, or has another
reviewer; the work of a task that is already submitted (or accepted, done, cancelled) or has another executor; a task whose record is gone. A task
that still waits for that very tab (a review of a submitted task, the work of a running task or one on rework) and a stuck question keep the mark;
the obligation itself is not rewritten. The foot of the side panel counts «ждут» by the same list as «Ждут вас» (the number of tabs that wait for
you); the watches (gates, a commit to main) are counted next to it with the mark `⧗`, e.g. `ход 1 · ждут 2 · ⧗ 1 (очередь 1)`.

#### Service messages do not pile up behind a waiting question (task 080)

A turn with the `question` tool is held by the OpenCode server for up to an hour, and the server hands the model **one** queued message per
turn, the oldest. If the plugin queued a reminder or a repeat behind it, the queue grew by one per turn and the letters with your answers
stood at its tail (task 094: four messages for five hours, none of the four answers reached the model). So the plugin splits its letters
(`queue-gate.ts`). **Service** ones (the reminder «Не завершено», the repeat of a lost question, the reminders about idle time, a hung turn,
a stop at a gate, a leftover or a task not cleaned up) vanish when their reason is gone; **needed** ones (letters of people and tabs, your
answer, tasks, results of watches) are never held, except until the end of the current turn, as before. The rules: (1) while the tab has an
open form of a question to you, no service letter goes into the queue - it waits in the mailbox and goes after the wait; the one exception
is the repeat of a **lost** question, and then only one, only when the turn is not alive (a `question` tool still pending in the database
counts as alive) and nothing stands in the queue; (2) after your answer from outside the window the letter with the answer goes first and
alone - no «Не завершено» in the same pass, and none until a working turn of the tab or until `stall_minutes` after the letter was handed
to the tab; (3) a service letter of a kind that already stands in the queue (`session_inbox`, read only) is not queued again. The reminders
about cleanup and idle time are not lost - they are postponed. The plugin log says `nudge skipped …: <reason>` and `N service letter(s) of
<session> wait`.

### A hung turn is interrupted and resumed by the plugin (tasks 036, 048)

A tab whose window says the turn runs, while the model has been silent for 15 minutes (`CREW_HARNESS_HUNG_MS`) with no
`idle` row after its last answer, is hung. A running tool, a running `crew_watch` and an open question to the owner are not a hang.
The plugin interrupts such a turn itself — `session.interrupt` of the plugin context with `resume: true`, the same call the window
makes on Esc — and wakes the tab with a service letter «Ход завис и прерван плагином в ЧЧ:ММ; продолжай с того места, где
остановился»; the task of the tab gets a line in its history, the plugin log a `hung turn resumed` line, and you have nothing to do.
One try per hang, at most 2 tries per session in an hour. When the plugin cannot (OpenCode has no `session.interrupt` — the log line
`hung turn self-recovery: off` at start and `crew_doctor` say so; the interrupt found nothing to stop; the turn is still hung
5 minutes after the try; the limit), the tab is shown as waiting for you with «ход завис с ЧЧ:ММ: нажмите Esc в окне и напишите
«продолжай»» and the log says why (`hung turn not resumed`).

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
  "stuck": [{ "at", "what" }],                                   // stuck obligations (only when there are any)
  "updated": 1791200000000 }
```

## Progress of background sessions (progress.log)

The sessions of the development method (analysis, plan, implementation, review — see
[`doc/canon/process.md`](../doc/canon/process.md)) work in the background, not in tabs. Each of them writes its progress
into `doc/tasks/<NNN-name>/progress.log`, one line per finished unit: `<code> <k>/<N> [HH:MM] <what was done>` (the format
and the guard that checks it are in the Canon item "Журнал хода `progress.log`"). The window reads these journals itself —
no service, no setting, no process — and shows them. The texts of the window are Russian, like the rest of the window.

### 1. The "Ход работ" block and `/crew-progress`

Under the "Crew" block of the right panel the window draws a "Ход работ" block (nothing is drawn while no task is running):
at most 3 tasks, 4 rows each — the mark and "NNN title", the session in words and "k/N", `↳` the last line, the state — and a bottom
row: `ещё N · все: /crew-progress` when N tasks did not fit, `все: /crew-progress` when all fit. Marks: `!` needs attention (silent for
too long, stopped, a launch with no news past the threshold), `•` runs, launched, "no units" or "all steps done, no result", `✓` done. The states, as the panel prints them: "идёт HH:MM · Nм назад", "⚠ нет вестей Nм" (with
"· ветка Mм" when the task's branch moved after the last line), "остановилась: <kind>", "готово HH:MM", "запущена HH:MM" (the row
before says "шагов нет"), "без единиц HH:MM", "все шаги сделаны, итога нет". `HH:MM` is the time of the last line; a leading `≈` marks a
time taken from the file (the line has no time field); `≠` after "k/N" marks a session whose lines differ between two copies
of the journal; `+N` — other running sessions of the task. The block refreshes every 2 s from a cache; the files are walked
at most every 5 s, so a new line is on the panel within 10 s. The command `/crew-progress` (also in the Ctrl+P palette, "Crew: что сейчас идёт")
shows the same in a dialog, without a model turn: every running task of the repository of the tab on screen, every running session of it with the
last three lines of its journal, "вытеснено N" for the past sessions, and a stopped, launched or silent session with no news for
24 hours marked "давно брошена" ("all steps done, no result" is never marked so). The repository is
the one of the tab: found without any process by climbing from the tab's folder to `.git` (a folder — the main copy; a file
`gitdir: …` — a linked working tree, the common `.git` by `commondir`; relative paths are resolved from the folder of the file),
and every working tree of it is read from git's own registry `.git/worktrees/*/gitdir`, wherever the tree lies. For each session the copy of the
journal with more lines of that session is taken (the main copy when they are equal).

### 2. Thresholds and environment variables

Constants of the module, the same for all projects: silence is "давно нет вестей" after 10 minutes, "done" and "no units" stay in the panel
for 15 minutes, a stopped, launched or silent unfinished session leaves the panel after 24 hours and the command marks it "давно брошена";
a session in "все шаги сделаны, итога нет" leaves the panel and the command after 24 hours with no mark. They are counted
from the clock at every show, not from a change of the file. The window process can override them, in milliseconds (a value that is not
a positive number is ignored): `CREW_HARNESS_PROGRESS_STALE_MS` (10 minutes), `CREW_HARNESS_PROGRESS_DONE_MS` (15 minutes),
`CREW_HARNESS_PROGRESS_ABANDON_MS` (24 hours). No project setting, no schema and no `crew_help` text is involved.

### 3. Open contract: `ProgressTask`

`progress.ts` is pure (no file, no window, no OpenCode, no `status.ts`): `parseJournal(bytes)` gives the lines of a journal and
`summarizeTasks(scan, now, thresholds)` gives the state of every task; `progress-scan.ts` walks the trees and caches the parsed journals
(`createScanner().scan(dir)` and `.scanAll(dir)`), a future service can use both. The input is
`{ tasks: [{ folder, title, copies: [{ kind: "main" | "tree", tree?, lines, mtimeMs, branchMs? }] }] }`; the output is an array of

```jsonc
{ "number": "002", "folder": "002-guards", "title": "…",            // ProgressTask = ProgressSession + the fields of the task
  "others": 0, "displaced": 69,                                     // other running sessions ("+N"); past sessions displaced
  "candidates": [ /* ProgressSession of every running session, the shown one first */ ],
  // ProgressSession:
  "session": "С5", "sessionName": "С5 реализация", "k": 13, "n": 14, "signature": "…",
  "at": 1791200000000, "byFile": false,                              // the time of the last news; true — taken from the file time
  "state": 5, "stateWord": "идёт", "kind": "ворота",                 // state 1…7 of the table; kind — only for state 1 (empty: no kind named)
  "stale": false, "divergent": false, "source": "main" | "tree",     // silent past the threshold; the copies differ (≠); the copy it was taken from
  "branchAt": 1791200000000,                                         // the last move of the branch of that copy (logs/HEAD), if known
  "visible": true, "abandoned": false,                               // shown in the panel; state 1, 3 or 6 with no news for 24 hours
  "tail": ["12/14 …", "13/14 …"] }                                   // up to three last lines of the session
```

States: 1 stopped, 2 done, 3 launched (no steps yet), 4 no units, 5 running, 6 silent, 7 all steps done with no "готово". The field names are
the contract; they change only by changing this section.

### 4. A session with no lines is invisible

A session that wrote no line at all and has no launch line `<code> 0/0 [HH:MM] запуск` in a journal cannot be seen: nothing in the files says it began.
Sessions are told apart by a start line (`k = 0`), by a change of the code or by a fall of `k`; a session is shown only after its first line.

### 5. Caveats of the launch line and of the copies

A session that wrote only a launch line and ended silently stays in the panel as "запущена" (and then "⚠ нет вестей") until it is abandoned
after 24 hours. The launch line of the first implementation session goes into the task's worktree, not into the main copy:
otherwise `progress.log` of the main copy and of the branch diverge, a `--ff-only` merge refuses and a rebase conflicts (the panel itself loses
nothing: the same session is recognized in both copies). A repeated launch of the same code is written into the copy where the lines of the
previous session of that code are; a launch in one copy while a finished session of the same code is in another copy does not start a new session.
An interrupted session of the common beginning of both copies, written with time fields, may leave a "+1" next to a running session of the task
(the state of the task itself stays right); without time fields the stale one is dropped. When the shown record of a task is hidden
("итога нет" after 24 hours, "готово" or "без единиц" after 15 minutes), the command still names an older session of another copy that
is stopped, launched or silent and has had no news for 24 hours, marked "давно брошена", and counts the task among the abandoned ones;
such a session younger than 24 hours is not listed until that time has passed.

### 6. The file time is only a hint

A line with no time field is dated by the change time of the file (marked `≈`), and for equal copies the earlier one. A merge, a switch of branches
and a clone refresh that time, so a journal brought by a merge may look newer than its last line; lines written with `[HH:MM]` do not have this
limit. The date of such a line is the day of the file (the previous day when the time is later than the file by more than 5 minutes). The field may also be `[YYYY-MM-DD HH:MM]` (new lines since 2026-10-09; the owner's word): then the named day is used (a moment later than now by more than 5 minutes falls back to the file time, marked `≈`); both forms are accepted, earlier lines are not rewritten.

### 7. The transitional period

Until the Canon item about the journal is in `main`, sessions write the earlier form with no "готово" line, so a finished session shows as
"все шаги сделаны, итога нет" until it leaves the panel after 24 hours; a line written after "готово" in the same session brings the same
state back. Later the sessions write `<code> N/N [HH:MM] готово …` last and the panel shows "готово" for 15 minutes.

## Task journals: `progress_line`, `log_line` and `usage_line`

Three tools of the plugin write the journals of a task folder (Canon item "Три журнала сессии"); they are the way to write these
journals in an OpenCode window, the tool descriptions say so (the system hint of the tabs stays under its size cap). They are registered by a separate `ctx.tool.transform` call
(`journal.ts`), are not in the MCP server and not among the `crew_*` tools; a failure to register them does not break the plugin. All
are narrow: no shell, append only, a fixed file name, the path must stay inside the project folder of the window, the refusal of the
file system comes back as a refusal, earlier lines are never rewritten. A refusal is the answer `Не записано: <reason>`, nothing is
written; the reason names the rule, the expected form and an example call.

`progress_line` `{file, code, kind, k, n, pass, stop, text, to}` (tasks 049, 050, 053): the agent names the kind of the line and the
numbers, the tool builds the line `<code> k/N [YYYY-MM-DD HH:MM] <signature>` itself and checks it against the earlier lines of the same
session in the file (rules: methodology `ab2a4ef`, `task-runner.md`, "Строки `progress.log`"; the journal is a signal, not a proof - the finish
is judged by the artifact). A session is the lines of its code from a launch line (or its first line) to its final line; after the final line only its repeat with the same k and keyword and `стоп:` after
`готово` with the same k belong to it, any other line of the code opens a new session (the panel reads it the same way):

| kind | input | line | refused when |
|---|---|---|---|
| `start` | `n`, `pass` (required for a review code С2, С4, С6), `text` optional | `С2 0/34 [..] старт заход 1 — опись 34 источника` | no `n`; review code without `pass`; `text` begins with a keyword; the session already has a start line and no final line (one start per session; a session without a start writes it now and goes on) |
| `step` (default) | `k`, `n`, `text` (or the old `unit: "k/N"`) | `С2 1/34 [..] spec.md прочитан целиком` | no start line of the session; after the final line (`готово` or `стоп:`: the work after an answer goes on in a new session that begins with `start`); `k` not previous + 1 (a jump names the missing units, a repeat names the next one); `k > n`; `text` begins with a keyword |
| `done` | `text` optional | `С2 34/34 [..] готово — отчёт сохранён` (`9/8 готово` after `0/8 старт`: k is compared with N of the start line, k above N is fine) | units before N not written; k below N of the start line (fix it by what happened: next units, `stop`, or `text: "N завышено: <reason>"` - then a final line with the same k); no start line or a second one; after `стоп:`; a repeat with another k |
| `stop` | `stop` (вопрос, план, ревизия, требования, ворота), `text` = reason | `С2 5/34 [..] стоп: вопрос — нужен ответ` | kind missing or outside the list; no reason; after a `готово` that is a finish (a `готово` with k below N of the start is no final line, the stop after it takes the same k); a repeat that changes a kind of the list |
| `correction` | `to` = the start of the signature after the time of the wrong line, `text` = what is wrong | `С2 2/5 [..] поправка: к строке «опись source inventory» — подпись 93 знака` (current k, not a unit; 10 to 30 characters of the signature, the whole one if shorter) | no line of the session; after the final line (fix it by its repeat); `to` is not the start of a signature of the session (the whole line with code and time is refused) |
| `launch` | `launch` optional (the number) | `С5 0/0 [..] запуск №3` and in `log.md` of the folder `<time> пуск: запуск №3 С5 [..]` | the caller is not the launcher - the tab that holds the `integrator` role of its project and has no task or review of its own (the card and the role lock; the agent of a session never writes a launch); the number was already used in `progress.log` or `log.md`. `log_line` takes the record `запуск №<n> ...` from the launcher only (task 053) |

The whole signature (everything after the time field) is at most 80 characters, as in the methodology; a longer one is refused with
the number of characters to cut. `start` and the launcher's `launch` create a missing `progress.log` in an existing folder; other kinds need the file.
`?/?` is no longer written: neither the guard nor the panel reads it as a line. After `стоп:` the session writes no units; a new
`start` of the same code after a final line opens a new session. The answer `Записано: <line>` is followed by the next step (for example
`следующая — k: 5`). Commands that only ask the clock (`date +%H:%M`, `Get-Date -Format HH:mm`) are refused by the `opencode-windows-env`
plugin; these tools are the allowed way to put the time into the journals.

`log_line` `{file, kind, text}` (task 049): appends ONE entry `YYYY-MM-DD HH:MM <kind>: <text>` with the machine date and time to a file
named `log.md`; `kind` is one of решение владельца, заседание, ворота, документ, пуск, слияние, находка (the guard rule `log-line`); one
entry per call, one line, up to 2000 characters; a file without a final newline gets one first; the file may be created only in an
existing folder. Example: `log_line {file: "doc/tasks/007-x/log.md", kind: "решение владельца", text: "владелец, 2026-10-15, чат: «да»"}`.

A stop at a gate ends with a question to the owner (task 062; owner, 2026-10-16). An entry of kind `ворота` is always written, never refused.
If the calling tab has no open question to the owner (no record in `forms/`), the answer adds «Ворота записаны, но вопроса владельцу нет:
задай его сейчас инструментом question — вопрос, рекомендация, довод», and the plugin notes the stop (`gates/<session>.json`). When the turn of
that tab ends and still no question is open, the tab gets ONE letter «ты остановился на воротах без вопроса владельцу — задай его через
question» (not again for the same stop), and `/crew` (the word `gate` after `⚠`), `/ask`, the side panel and the notice show `⚠ ждёт вашего решения, вопроса нет`; the
tab counts in «Ждут вас». The stop is cleared by an open question (a questionnaire record, or a question mark at the end of the turn) or by
the owner's word in the tab. A waiting phrase («остановлено до вашего решения») is no question: the mark `⚠` replaces `‖`. The system hint of
the tabs carries the rule in one sentence. The phrases «до вашего решения», «остановлено … решение» are recognised as waiting phrases too, but
only as a supplement to the record.

The same holds with no record at all (task 064; owner, 2026-10-17): when a turn of a tab of yours (not a task session — its wait goes to
the integrator) ends with a phrase of waiting for your decision («ждёт отдельного решения владельца…») and no question form is open, the
plugin notes the stop of kind `wait`, the tab gets ONE letter «Ты ждёшь решения владельца, но вопроса нет: задай его сейчас инструментом
question — вопрос, рекомендация, довод», and the summaries show `⚠ ждёт вашего решения, вопроса нет` with the phrase instead of «ждёт вас».
The border: a turn ending with a question mark is a question in text — you see it and answer with a word, so no letter; a phrase is no
question — there is nothing to answer. A phrase naming another tab (the integrator, an executor, a reviewer, a session) is not a wait for you.
An open question, a question mark at the end of a later turn, your word, or a later turn with work clears it; an empty turn («понял») keeps
the mark without a new letter.

A tab bound to a closed task (task 064): a tab whose task is merged or cancelled, and an integrator tab always, is shown by its role, not
as the task's executor (in the rows and in «Ждут вас»); the plugin drops the binding of a tab of yours (not of a task session) once its task
is closed.

`usage_line` `{file, code, result}`: appends ONE JSON line (format version `"v":1`) to a file named `usage.log`; the file may
be created only when a `progress.log` lies in the same folder. The agent passes the file, the session code and the result
(one line, up to 200 characters); the plugin fills the rest: `at` (ISO time with the local offset, e.g. `2026-10-09T04:12:00+03:00`), `session`, `model` (`provider/id`), `variant`,
`tokens` `{input, output, reasoning, cache_read, cache_write}`, `cost`, `started` (the same ISO form) and `seconds` (from the session card of
`ctx.session.get`), `max_loop_lag_ms` (the largest delay of the plugin's own loop timer, the one that writes the "loop lag"
lines, since the session was created or the plugin started, whichever is later), `commit` (`git rev-parse HEAD` of the file
folder, empty outside a repository). A value the plugin cannot read is `null`, never guessed; `limits`, `tool_calls` and
`test_runs` are `null` for now. Call it once, when the session is finished:
`usage_line {file: "doc/tasks/007-x/usage.log", code: "С5д", result: "готово: 13 из 13"}`.

## Answering session questions (`answer_mode`)

By default every question of a session waits for the owner. A project can hand some of them to the session's own
recommendation with two keys of `.opencode/crew-harness.json`, which only a person sets (edit the file and commit; `crew_config set`
refuses them) — [ADR-0010](../doc/canon/decisions/ADR-0010-question-answering-modes.md):

- `answer_mode` — a map "type of the question → mode". Types: `requirements`, `plan`, `implementation` and `default` (for a type
  without its own entry); modes: `owner` (the owner answers, the default) and `recommendations` (the recommendation of the
  question closes it). The type `gate` is not accepted in the map, and the mode `agent` (another agent answers) is moved to a
  separate future task. The value that fits most projects: `{"implementation": "recommendations"}` — for `requirements` and `plan` the owner stays
  (для `requirements` и `plan` — `owner`: there the method leaves the decision to a person).
- `allow_self_assign` (default `false`, set by a human) — the integrator is never the executor of its own task: `assign` to its own session is refused (`crew_spawn` makes a separate executor); `true` only by the owner's word.
- `answer_max` — how many answers in a row one session may get (3); the owner's word in the tab resets the count.

**The form of a question.** A session asks in text: a block `В-01 …?` with the lines `Тип: requirements|plan|implementation|gate`,
`Рекомендация: …` and `Автоответ: допустим`, and «?» в конце строки with the question: the recommendation is one paragraph without blank lines (a blank line ends the value), the question ends the line and the fields stand on separate lines below it. In the words of the Canon: вопрос заканчивай знаком «?» в конце строки, поля — отдельными строками ниже. A question is closed only when all of this
holds at once: the type is declared and is not `gate`, the mode of the type is `recommendations`, the recommendation is not empty, the
permission `Автоответ: допустим` stands, no word of the gates is in its text, the session is not a review session, the limit is not
spent, and the parse went through. Anything else — and any doubt — stays with the owner, who gets one notice with what is left.
A question about the gates is declared `gate`: approval of `spec.md` and `plan.md` and of a plan, push, merge, deletion, restart or
switch of the service, publication, money, shared environments, giving up a requirement, the ceiling of rounds and handing over.
The list of the words of the gates is open and errs towards the owner (`answer-parse.ts`); on the blocks of the question packs of
earlier specifications it lets pass about a fifth of the questions that are fit by meaning.

**What the session gets.** A service letter "Ответ по настройке проекта (answer_mode: recommendations, тип <тип>), не слово владельца"
with the recommendation, the list of the gates "только слово владельца", the rule "вышел за рекомендацию — вопрос владельцу" and the
numbers of the questions that are left. It is not the owner's word: слово владельца старше автоответа.

**Where to look and how to take it back.** Every answer is a file in `answers/` of the mailbox (kept 30 days from the answer, then removed) and a note in the
history of the task (`crew_task show`); the counters `answers N (M owner)` and `for you K` of `/crew` and the line "авто 24ч: N · вмеш. M" of the side panel
count the answers of the last 24 hours and the questions that wait for the owner's word (their text is in the history of the task). There is no command to take an answer back: write
in the tab — the record becomes "владелец вмешался" and the count of answers in a row starts over. Without the keys nothing changes.

## Obligations instead of a push controller

A question or a task is the recipient's obligation until it answers (`reply_to: qid`). Windows on
Claude often stop mid-task after writing a status; the plugin keeps them going — by the end of a
turn, not by a timer. The turn's facts come from OpenCode's database (messages between the turn's
start — its first model request, not the last step — and its `idle` row): a turn with a tool call in any step is a working
one, a turn without one is empty.

- a turn ended without the answer → a reminder right away; a working turn resets the empty counter and the
  reminder counter (task 043: a long task done in working turns is not "stuck"; a turn the database does not show
  counts as working but does not reset the reminders);
- `push_empty_turns` (3) empty turns in a row or `push_max` (20) reminders without a working turn → the tab is stuck: no
  more reminders, the asker gets a call (a letter and a notice in its window; when the asker's tab is closed, the notice goes
  to the live windows of the project, or to all live windows when the project has none), the task's history
  records it, and `/crew` (`⚠ stuck 9h` on the row of the tab) and the side panel (`⚠ застряла с ЧЧ:ММ`) show it until the mark is cleared; the reason is in the letter and in `stuck[].what` of `status/<session>.json`;
  `crew_task {action: "push", n, to?}` wakes it again (the executor, or the reviewer with `to: "reviewer"`; the call about a
  stuck review names `to: "reviewer"`) and clears "stuck"; the answer or the submit settles the obligation;
- "stuck" also goes by itself (task 052), for all obligations of the tab and with a log line `unstuck <session> for <qid>:
  <reason>`: a working turn of the tab (before any early exit of the reminder: answer modes, an open question, a watch), a
  turn where the owner wrote, the owner's word in the tab (on the nearest pass, not at the end of the turn) and the owner's
  reply to the tab's question form (at once); old marks without a time follow the same rules. While the tab waits for the
  owner (a question form, a question to the owner) `/crew` and the side panel do not show it as stuck;
- a task session deleted in OpenCode (three deliveries in a row fail with `NotFoundError`) or a task session without a card
  (three passes in a row) → one letter to the task's author with what to do (`crew_task reassign` for an executor) and a
  note in the task's history, no repeats;
- a turn with the owner's own message gets no reminder (the owner leads the tab) and resets the count;
- a turn cut off by an OpenCode restart (the session keeps `time_suspended`, no `idle` row, OpenCode
  does not resume it) is picked up by one letter that lists what is open and how to report;
- a task session whose turn ends with a question is not told "continue": the question goes to whoever set the
  task (a letter that wakes it), who answers or asks the owner; a merge lock held longer than `stall_minutes` (30)
  and a submitted task waiting for a reviewer that long are raised to the task's author (with a notice to the live windows
  when the author's tab is closed), and so are the leftovers of a
  closed task (branches here and on origin, worktrees by the project's name templates) ([plan 002.4](../doc/archive/plans/002.4-flow-watch.md));
- service letters of the plugin say "do not answer"; a letter to `crew-harness` itself is refused.

## Tasks

Task statuses: `starting` → `running` → `submitted` → `reviewing` ⇄ `rework`; `approval` (a plan task waits for approval);
`accepted` (landed, cleanup ahead) → `done` (accepted and cleaned up); `cancelled`; `idle` (a task led by method sessions
between two sessions: the last one submitted to the integrator, no review yet). Task files written before 2026-10-14 may say
`cleaned` instead of `done`: it is read as `done` (no migration of the files). The action that finishes a task is `crew_task cleanup`
(`cleaned` still works as its old name). `crew_task show` and `crew_config show` are the only names for «show»: the old word `view` is refused with the hint «Команды view больше нет, используй show».

**One task, one number (task 058).** In a project with task folders (the key `tasks_dir`, default `doc/tasks`; on when that
folder is in the target branch, `""` turns it off) the task number is the number of its folder `NNN-<slug>/`, shown as `045`
(three digits, no `#`); the plugin's record has the same number. In a project without folders (Nova) a task has a number of the plugin
(per project, only grows, kept through rework and reassignment), shown the same way, `094`. Every task of every project is shown
with its number with zeros on the left up to three digits and no `#` (`022`, `061`, `094`; above 999 as it is, `1000`), with a folder or
without (task 086, replacing the `#N` of its first edition and the rule of task 083 that held for crew-harness only: one function,
`taskNo`, writes the number everywhere). *Why no `#`:* GitHub turns every `#N` in a commit message, a description or a comment into a link
to an issue or a pull request of the repository and notifies its people, so the pair "hash and a number" is kept for real issues and
pull requests, and the commit message guard (`scripts/guards/guard-commit-message.py`, rule R8) refuses it for anything else. A tab still
titled `#33 исп …` or `61 …` is read as `033 исп` / `061` and renamed by the title pass. The owner, the integrator and `crew_list` call a
task by its number; a session's title is `045 исп title`. The journal is
`tasks/<project>/<N>.json` in the mailbox.

- **A new task with a folder.** The number is 1 + the largest of the project's records and of the folder numbers in every
  working tree of the repository (`git worktree list`, uncommitted folders too) and in every local and `origin` branch
  (`git ls-tree`); the record file is created atomically (flag `wx`), so two windows never get one number. The plugin writes
  the folder on the task branch (`task/message.md` = the field `message` word for word, without it the text built from the
  fields by the template below; `log.md` with its first line `ГГГГ-ММ-ДД ЧЧ:ММ документ: задание заведено …`) and commits it there (signed off,
  `Add task NNN: <slug>`) without a working copy; the main copy of the target branch is never written. `{n}` of
  `branch_name` and `worktree_name` is three digits (`task/045-…`). A folder made outside the plugin: `crew_spawn {task: N,
  goal}` makes the record N without a folder commit; no folder with that number — refused. An agent outside OpenCode takes
  a number the same way: `node scripts/task-number.mjs --dir <tree> --title "<title>"` (answers JSON `{n, number, folder,
  path}` and writes the folder into that tree; the agent commits it).
- **A task session** is one launch of an agent inside the task — the executor (`исп`), the reviewer (`прм`), a method session
  (`С1`, `С2`, `С3п`, `С4`…) — with no task number of its own: `crew_spawn {task: N, session: "С4", goal, place?}` adds a
  session to the record of task N. Its ident is `045 С4-3` (the code and its ordinal in the task) plus the launch number
  `№n` (through the task, the same as `запуск №n` of the progress journal); before the session starts the plugin writes
  `С4 0/0 [ГГГГ-ММ-ДД ЧЧ:ММ] запуск №3` into `progress.log` of the copy where it works and `пуск: запуск №3 С4 [время] — 045
  С4-3 …` into `log.md` of the task (the forms of `progress_line` / `log_line`). Review sessions `С2`, `С4`, `С6` work by
  default in their own tree and branch `task/045-s4-3` from the task branch (`place: "own"`, recorded as a side branch for
  cleanup), the others in the task tree (`place: "task"`). A method session submits to the integrator (`crew_task submit`
  wakes it, `log.md` gets `документ: С4-3 сдала: …`); the task waits for the next session (status `idle`). The plugin's
  review is one per task: after the submit of a task with a single `исп` session, as before, and for a task with method
  sessions after `crew_task {action: "deliver", n, text}`. `reassign` of a task with sessions gives the same code the next
  ordinal and a new launch number; the old session is marked handed.
- **The tree of a session is the tree that already stands on its branch** (task 079). Before it makes a tree for the task or for
  an own-tree session, the plugin asks `git worktree list`: a tree made by hand on that branch (for example recorded by
  `crew_task track`) is used as it is, the record of the task (`worktree`) or of the session is aligned to its path in the same
  step, and no second `git worktree add` runs on a busy branch; the launch lines go into that tree. A branch held by the main copy
  of the project or by the tree of another open task is a refusal naming that path (the author gets a letter, the start repeats
  by itself once the cause is gone); files and branches are never moved or deleted. A recorded path whose folder is gone (git still
  remembers the registration) is made again at the same path from the branch, with the commits intact. A tree the plugin makes
  itself, from the settings, is made as before.
- **A sub-task** is a task of its own: `crew_spawn {part_of: N, …}` — own number and folder, the first line of its
  `task/message.md` is `Часть задачи NNN «…».`, the parent's `log.md` gets `документ: заведена подзадача MMM «…»` (no tree of
  the parent — a letter to the integrator with that line); the records link `part_of` / `parts`. The rule: an own acceptance
  or an own landing in `main` — a sub-task; the next step of the same work — a session.
- **One template of the task text (task 065).** `task/message.md` of every new task follows the template of the Canon
  (`doc/canon/process.md`, «Задание task/message.md»): `# Задание: <title>`, a header (customer, repository and branch,
  date, source), then the second-level sections «Чего хочет владелец», «Что нужно», «Критерии приёмки», «Результат и куда
  он попадает», «Связи», «Границы» in this order; an empty section is written `нет: <why>`, not dropped. Without `message`,
  `crew_spawn` (a new task or a sub-task) and `crew_task assign` in a project with folders build the text from the fields:
  `owner_words` — the owner's words word for word with date and source (`- «сделай X» (владелец, 2026-10-17, чат
  оркестратора)`), required and must carry a date `ГГГГ-ММ-ДД`; `goal` — its paragraphs and `- ` lines become the numbered
  points of «Что нужно» (an already numbered goal stays as it is); `criteria`; `result` — where the result lands, or `нет:
  результат — код: <what is delivered>`, required; `links` — lines «Зависит от», «Блокирует», «Пересекается (файлы)»,
  «Начинается после» (task-sessions.md of the methodology); `boundaries`; `open_questions` go after «Границы». Absent `links`
  or `boundaries` become `нет: интегратор … не назвал (поле … не передано)`. Without `owner_words` with a date or without
  `result` the call is refused before any number or folder is taken, and the answer names the field with an example; a
  `message` without the template's title and sections (in order, not empty, `нет:` with a reason, a date in the owner's
  section) is refused the same way. Old calls stay valid where no task text is written: a project without task folders
  (`NNN`) and a session of an existing task (`crew_spawn {task: N, session, goal}`) need none of the new fields. The guard
  `scripts/guards/check-task-docs.py` (`message-title`, `message-section`, `message-owner`) checks the same rules for tasks
  started from 2026-10-17 01:00.
- **Transition.** Old records keep their numbers and their show (`057 исп`). A closed old record with the number of a folder
  moves unchanged to `tasks/<project>/legacy/<N>.json` when that task gets its record (shown by `crew_task list all`); an
  open one refuses with its title. An order (`crew_task order`) takes its number from the same count and makes no folder.
- **The show.** The "Crew" panel puts the task line `045 <title>` over its sessions `↳ прм`, `↳ С4-3 проверка плана`, finished
  sessions folded into `✓ сдано N сессий` (task 064); `/crew` lists the live ones under `045 <title>` and counts the finished (`· N done`); its first line "Waiting for you" names `045 rev`, the panel's "Ждут вас" `045 прм`; notices, letters and answers name the task `045` and the
  session `045 С4-3`.

- `crew_spawn {title?, goal, criteria, owner_words?, result?, links?, boundaries?, open_questions?, message?, extra?, tier?, priority?, role?, parent?}` (the
  integrator only) starts task `NNN` in a new session, with or without a window. No task without a
  goal and acceptance criteria (the project may require more: `task_fields`); model by tier
  (by default `claude-code/opus` / `sonnet` / `haiku`, `spawn_models` overrides; an enabled set of model profiles overrides both for the stages it describes — see [Model profiles](#model-profiles-sets-of-models-and-windows-by-stage)); a limit of running tasks per
  role (`spawn_limits`, 3); priority `P0` (emergency) … `P3`, default `P2`. With `worktrees` set the
  plugin creates the task's worktree and branch (from the target branch) and starts the session in it, so the
  project's hooks see the task's branch, not the main copy ([plan 002.3](../doc/archive/plans/002.3-task-worktree.md)).
- The start is repeatable: the session id is chosen and written to the journal **before**
  `session.create` (OpenCode accepts an own id starting with `ses` and returns the existing session
  on a repeat), the task letter's id comes from the number — a start cut off at any step is
  finished by the next pass without a second session or letter.
- `crew_task {action}`: `list`, `show {n}`; for the integrator `assign {session, goal, criteria…}`
  (an owner's tab takes the task; it is woken while the task is open, even when closed), `push
  {n, text?}` (wake a stalled executor now), `reassign {n, text?}` (a new session, the same number, a
  summary of what was done; `text` refines the goal: it goes into the new session's first letter as a
  block «УТОЧНЕНИЕ ПРИ ПЕРЕДАЧЕ» before the old goal, wins where they differ and stays in the task
  history and `show`; refine with this call, not with a second letter), `cancel {n}`, `priority {n, priority}`, `deliver {n,
  text}` (a task with method sessions goes to the plugin's review once).
- The executor submits with `crew_task {action: "submit", n, text}` (`submit - executor - n, text`):
  no qid needed; `text` is the report (what was done, how it was checked, what is left). It covers
  the first submission, the one after rework or after a sync, and a plan task with the form check. The task is
  submitted (title `NNN ✓`) — the report does **not** wake the integrator (after rework it wakes the
  reviewer); a second report is refused. An ordinary letter of the executor to the author, the
  integrator or the reviewer is not a report: it is sent as before, and the answer reminds the
  executor of `submit`. `review` of a task still in rework names the same command for the
  executor. The executor's session stays open for rework until the task is done.

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
  branch; then the cleanup steps by the project setting `cleanup` (`git worktree remove`, `git branch -D`, `git push
  origin --delete`), and `crew_task cleanup` — the plugin checks the worktree and the branch are gone;
  to keep a worktree as evidence call `cleanup {n, keep: [path, ...]}` (up to 8 paths, absolute, or relative to the repository root as `git rev-parse --show-toplevel` gives it from the task directory;
  each must be a worktree of the repository or an existing folder inside the project's worktree folder, never the main tree
  or a branch): the check skips those trees, the answer says `Сохранено: <path> (не проверялось уборкой)`, the task record
  keeps them in `kept` and the history says `улики сохранены: <path>`; the task branch must still be deleted (if it is checked out in a kept tree, run `git checkout --detach` there first, then `git branch -D`; the answer of `cleanup` says so); a repeated
  `cleanup` without `keep` keeps skipping them while they exist;
  Side branches and worktrees of a task (task 023): `crew_task {action: "track", n, branch?, worktree?}` (executor, reviewer, integrator; no duplicates) records them in the task's `side` list (`show` shows it; the field is `side` because `extra` holds the project's extra task fields). The plugin records `integrate/t<N>` and `integrate/t<N>-*` and the trees on them itself at precheck, accept and cleaned. `cleanup` removes everything recorded except the trees in `keep` (no force: a dirty tree is reported, not deleted); an unrecorded branch or tree that only matches the name template is still refused, and the refusal offers `track`. Records without `side` read as empty.
- `done` (after `cleanup`) → the sessions of the task close with a line in their history, titles `NNN ✓✓ готово`, the
  integrator gets a quiet summary. Titles on the way (a mark and a word): `NNN ✓ сдана`, `NNN ✓◐ приёмка`, `NNN ↻ доработка`, `NNN ✓✓◐ влита`
  accepted;
- a task on rework does not hold a review session's place (`spawn_limits.reviewer`): the next submitted task gets
  it; the resubmission goes back to the same reviewer at once;
- `reviewer: "acceptor"` — a separate acceptor role with its own rights ([plan 002.7](../doc/archive/plans/002.7-acceptor-role.md)):
  only a free open tab of role `acceptor` becomes a reviewer (never a `worker` tab), a new review session is born
  with role `acceptor`, review sessions are bounded by `spawn_limits.acceptor` (without it `spawn_limits.reviewer`,
  then 2) and take no `worker` place; `merge`, `accept` and `cleanup` need the task's reviewer AND the `acceptor`
  (or `integrator`) role — a reviewer who changed role loses them; the executor of a task is refused by name. The
  role is shared. The default stays `worker`;
- `inflight_limit` (6) bounds the tasks running and in review; `P0` passes every limit;
- `accepted_slot: "free"` (the default since the owner's decision of 2026-10-09; the explicit `hold` returns the previous
  behaviour: the accepted task holds its place until `cleanup`): an accepted task that is not cleaned up yet waits for cleanup and
  no longer counts in `inflight_limit` (`crew_spawn` and the steps of an auto plan count it separately); `cleanup_limit`
  (10, `0` — no limit) stops new work (not `P0`) when that many accepted tasks wait for cleanup, naming them. The tab of an
  accepted task is still woken and reminded (`accepted_reminder_min`; the reminder repeats every `accepted_reminder_min`, at most
  5 times per acceptance, then `/crew` counts it: `uncleaned NNN Ч`, and the author's tab gets the idle mark `◷` when the reviewer
  does not lead the cleanup, task 076), `crew_task list` and `show` mark it "ждёт уборки";
  `OPEN_STATUSES` and `isOpen` are not changed;
- `merge_precheck: "required"` (the default since the owner's decision of 2026-10-09; the explicit `off` returns the previous
  behaviour: `merge` takes the lock at once): `merge` without a green precheck is refused with text that names the next step
  (`precheck {n}` without a lock, then `merge` on the checked tip, and the key that restores the old order), so reviewers
  move to the new order by themselves. **Do not take or hold the merge lock while building the candidate or waiting for CI.**
  Build the integrated candidate from the reported target tip, include the task changes, and run the full project CI before
  recording the green precheck. Save the exact candidate commit that CI checked. Only then call `merge`; it acquires the lock
  for the short landing step. Fast-forward the target branch from that exact checked candidate, not from a rebuilt candidate
  or the task branch alone, then push and call `accept`. If the target tip moved, do not land the old candidate: build and
  check a new one, record a new precheck, and retry. `accept` releases the task's inflight/worker slot when
  `accepted_slot: "free"`; perform its returned cleanup steps separately and call `cleanup` when done. The cleanup queue is
  bounded by `cleanup_limit` (10 by default). The merge lock is released by `accept` (and by `rework` and `cancel`): after the
  merge and the push call `accept` at once, the cleanup runs without the lock; if the merge is abandoned before `accept`,
  call `unlock {n}`; `cleanup` does not release the lock (there is none by then). The answers say it at the moment of the action: `accept`, `rework` and `cancel` report that they released the lock (only when it was held), and `cleanup` warns when the session still holds it. While it is held, only the merge and the
  push happen under it. The service pass releases the lock by itself when the held task's checked candidate (the green
  record) is already an ancestor of the target tip on `origin` (`git ls-remote` with the 20 s term and `merge-base`
  on local objects, no fetch, nothing written but the history note "замок отпущен: слияние на вершине" and a log line);
  it does nothing when the tip cannot be read, the record is not green, or the lock is held for another task; `accept`
  The lock knows its task: `accept`, `rework`, `cancel`, `unlock` release it only for the task they act on. With
  `merge_lock_per_task: on` (default `off`, the previous behaviour) a `merge` of another task by the holder is refused until `accept`, `rework`
  or `unlock` of the first one (with `merge_precheck: required` the gate always does this). A reviewer refused with "lock busy" is
  recorded in its own card (`lock_wait`, gone with the tab); when the lock is released (or found abandoned) every such live reviewer of the
  project gets a letter "lock is free" (no queue, no reservation; the lock is still taken atomically by whoever calls `merge` first), and
  the panel shows one line "ждут замок: NNN (мин)" and `/crew` the counter `lock NNN Ч`. A broken settings file of the old (no settings repository) form keeps the last good
  settings and is named by `crew_doctor`.
  then does not ask for the lock (only while the record is still green and of this round: a record marked stale by `rework`, `unlock`,
  a new review or `reassign` loses the mark). The release does not depend on `stall_minutes`. It counts the merge as done once the
  candidate is in the target tip: a mark that the plan step needs in the same merge must be inside the candidate, not pushed after it. The plugin still merges and pushes nothing. The lock is issued only on the
  tip of the target branch where the candidate was already built and checked. The reviewer calls `precheck {n}` (the plugin
  reads the tip of `origin/<target_branch>` with `git ls-remote`, nothing is fetched or written, and names it), merges that tip
  into a candidate (for example `integrate/tN`), runs the project's CI on it, then `precheck {n, candidate, result}` — the
  record becomes green (the candidate must exist locally and contain the tip; the task branch not being in it is only a
  warning). `merge` then reads the tip again **under the lock**: moved — the lock is released and `merge` is refused naming both
  tips (a new precheck is needed); the same — the lock is issued on that tip. `unlock {n}` releases a lock you hold for the
  task. The record becomes stale on `rework`, `reassign`, `cancel`, `unlock` and a new review after a re-submit. The plugin never
  merges, pushes or runs CI: the plugin only reads. A reviewer who already holds the lock for one task cannot take it for
  another. If the tip cannot be read (network, 20 s term, no such branch on `origin`) `merge` is refused with the cause and
  the lock is not issued; a repeat of `merge` by the holder keeps the lock in that case. Without `origin` the tip of the
  local branch is used;
- `task_extra_fields` (default empty): up to 8 project fields `{id, label, hint?}`; `crew_spawn` and `crew_task assign`
  take `extra {id: one line up to 300 characters}`, the values go into the executor letter, the reviewer letter (with the path
  of the task record, field `extra`) and `show` under "ДОПОЛНИТЕЛЬНО (поля проекта)". An unknown id is refused naming the
  declared ones; `order` takes no `extra`.

**After the landing.** The reply "already merged, call `accept`" to a repeated `merge` relies on the same local check as
`accept` (the task branch is an ancestor of the target branch, no `fetch`): it works when the landing was made from the
task's repository. A landing from another clone before `fetch`, or a squash, shows as a shifted tip: start a new precheck.
After the lock is lost the landing is confirmed by a new precheck as well. Between the last check of the lock and the reply
a few milliseconds remain in which another process may take it; the consequence is that `accept` refuses ("lock first"), the
reply issues nothing.

**If something goes wrong.** The lock may be lost at any time (`cancel` or `rework` of another task by the same reviewer,
a takeover of a stale lock, a restart); `accept` always checks it again. A stuck or unwanted lock: `unlock {n}`; a moved tip:
a new `precheck`; the work is returned: `rework`. The state lives in the task record and the lock file only (no timers): a
restart letter gives the state of the precheck and of the lock. The lock is not the last line of defence: `git` refuses a
non-fast-forward push and the project's own landing script checks again.

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

The report (`submit`) is refused while the file is missing or its form is wrong. The form check covers the
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

**Approval by the integrator.** With `plan_approver: "integrator"` the task author decides instead, from the tab:
`crew_task {action: "plan_decide", n, decision: "ok" | "ok-shortcuts" | "no", text?}` (`text` is required with `no`: what to
change). The decision is written the same way as the window's, the owner still sees the plan in `/crew` and can decide with
`/plans` first. The task status while the plan waits is `approval`. Verdicts of the recheck rounds are given by the round's
reviewer with `crew_task {action: "round", n, blocking, significant, cosmetic, text}` (or `grades {id: count}` for custom
`plan_grades`) after `review` and `check` of every step: `plan_clean_rounds` clean rounds in a row end the recheck, `plan_rounds_max`
rounds end it anyway and the plan goes to approval with the last remarks.

**Steps become tasks.** Once the plan is merged, each step becomes a task. The task gets the step's
«Что» as its goal, the step's «Приёмка» as its criteria, and the plan's «Не делаем» and mode as its
boundaries. A step starts when:
- everything in its own `после:` and its phase's `после:` is closed;
- no running step shares its `где:`;
- the project's limits allow it.

Order is by priority (the step's, else the phase's), then by plan order. A `[подплан]` step becomes a
plan task. A step task is accepted only with «✅ СДЕЛАНО <date>, commit» in its heading in the target
branch. When every step is closed, the author is asked to close the plan. `/crew` shows a plan that waits for approval as a row (`◇ plan N … approval · /plans`) and counts the others (`plans N`);
the rounds and the steps are in `crew_task show` of the plan's task.

Marks: plan `🔴 ОТКРЫТ / 🟡 В РАБОТЕ / ✅ ЗАКРЫТ / ❌ ОТМЕНЁН`, step `⏳ В РАБОТЕ / ✅ СДЕЛАНО`, criterion
`✅ ВЫПОЛНЕНО / ⬜`, question `❔ / ✅`.

**Acceptance steps from the project canon.** `acceptance_file` is a path inside the project repository; the plugin reads it from the target branch (`origin/<target>`, then the local branch; cached for a few seconds) and takes the steps from a markdown table with the columns `id | text | required`:

```
| id    | text                       | required |
|-------|----------------------------|----------|
| ci    | Run the project's full CI  | yes      |
| notes | Update the changelog       | no       |
```

`id` is lowercase Latin letters, digits, `_`, `-`, unique; `required` is `yes` unless the cell says `no` / `нет` / `false` / `0` / `-` (an empty cell means required). Rows without an id (or with a bad or repeated one, or without text) are skipped with a warning in the log. If both `acceptance_file` and a non-empty `acceptance` are set, `crew_doctor` reports an error and the file wins; if the file cannot be read (not in the branch, no table), the plugin falls back to `acceptance` and logs a warning. Without `acceptance_file` nothing changes. The order of acceptance is not written in the table: the plugin sets it (`crew_help`, ACCEPTANCE). `plan_acceptance` and `plan_merge_acceptance` are separate and unchanged.

**Everything is a setting.** The plan's form and process are project settings with nova's form as the default: `plan_sections`, `plan_header`, `plan_prefix`, `plan_labels`, `plan_marks`, `plan_mode_question`, `plan_acceptance`, `plan_merge_acceptance`, `plan_grades` (`{id, name, text, clean}`), `plan_approver` (owner / integrator — `crew_task plan_decide`), `plan_steps` (auto / manual), `plan_template` (a template file in the repository). `crew_config guide` asks about each.

**Heavy runs.** `heavy_commands` lists substrings of commands that load the machine (full gate,
full build, full test run, benchmarks). `crew_watch` with such a command goes to the machine queue
by itself. Full design: [plan 004](../doc/archive/plans/004-plans.md).

## Model profiles: sets of models and windows by stage

Which model runs a stage of work and how big its context window is are two settings of the project, kept as plain
JSON in `.opencode/crew-harness.json` (any reader sees them without this plugin; the decision is
[ADR-0008](../doc/canon/decisions/ADR-0008-model-profiles-layer-and-window-files.md)). Without these keys nothing changes:
`spawn_models`, `tiers`, `reviewer` and the texts of the tools work as before.

- **The table of profiles** — `model_profiles`: a family (`claude`, `kimi`, `codex` — any short name from lowercase Latin
  letters, digits and dashes, not `all`, `context`, `output`, `input`) and a tier (`heavy`, `medium`, `light`) give a
  model `provider/model` and its **window whole**: `context`, `output` (both required: OpenCode drops a `limit` without
  `output` together with the provider record) and, for models whose compaction is driven by `input`, `input`. An empty
  record `{"model": ""}` means «fill in»; a set that refers to it is not enabled.
- **Sets** — `profile_sets`: a named layout «stage → family and tier». A phase of the cycle includes stages (the table
  «Этапы и модели» of the Canon, [process.md](../doc/canon/process.md)). The four you set yourself are `develop` (the
  executor of a task), `develop_accept` (the reviewer; the old name `accept` is read as an alias and replaced when you
  set the stage), `plan` (a plan task) and `plan_accept` (the rounds of a plan review and the
  merge of an approved plan). Four more stages inherit when you do not set them: `spec` as `plan`, `spec_accept` as
  `plan_accept`, `delivery` as `develop` and `delivery_accept` as `develop_accept`, the last two one tier lower (a `task` cell:
  the tier of the task, then one lower); the plugin stores and shows them, the sessions of the specification and delivery are
  still run by the orchestrator. A cell is `{"family": "claude", "tier": "heavy"}`; the tier `task` means «the tier of the
  task» (the default behaviour). A stage without a cell (and nothing to inherit) keeps the model of `spawn_models`.
  A check stage without a cell goes by `spawn_models` (the owner's decision of task 003). The old name `accept` stays a readable alias of `develop_accept` (the settings file of this repository still uses it; nothing rewrites it). A check on the same family as its author while another family exists is only warned about by `/crew-sets show` with one ⚠ line (the rule «the
  reviewer is on another model family», ADR-0013). Names of sets: lowercase Latin
  letters, digits, dashes, up to 40 characters, not a word of the commands or a word kept from the removed ones (`use`, `reset`, `all`, `list`, `show`, `set`,
  `unset`, `new`, `rename`, `delete`, `check`, `save`, `from`).
- **The enabled set** — `profile_set`: the name, set by a person (`/crew-sets use`, or editing the file);
  `crew_config set` refuses this key whatever the value. `use` writes the name into the file of the project, takes effect
  at once and needs no commit and no restart of the service.
- **Tier bounds** — `tier_min` and `tier_max` (`light`, `medium`, `heavy`; no key — no bound), project settings in the same
  file. Any tier of any stage (explicit, inherited, `task`, the `tier` of `crew_spawn`) is clamped into them, so there is no
  need for a separate set with explicit tiers to cap the cost. The clamp holds on every path that picks a model, with a set
  and without one: `crew_spawn`, the steps of an auto-plan, the review session started without a cell of the set (the tier of
  the task record is clamped when the session starts) and `reassign` (without a set the model of the record stays while its
  tier is inside the bounds). The `tier` of `crew_send` picks a tab, not a model, and is not clamped. A clamp is written to the
  log of the plugin and to the task event, and into the task record (`profiles`: `clamped_from`; without a set the set is
  «(без набора)»), and `/crew-sets show` prints the tier of the set and the tier after the clamp. If the clamp lands on a family
  that has no profile of that tier, the session is refused and the text names the clamp as the cause (the nearest tier is not
  searched). `tier_min` above `tier_max` is a settings error: `crew_config set` refuses such a write (also against the other key
  already in the file), and if it comes into the file by hand `crew_doctor` says so and the bounds are not applied.

The window is a property of the model **in a folder**, not of a stage or a session. The plugin writes the windows of the
models of the enabled set (all three tiers of every family named in the set, because `tier` on the input of `crew_spawn`
moves a session along the tiers of its family) as `.opencode/opencode.json` **into the worktree of each task**, before
the first turn of the session; OpenCode and the `claude-code` provider read it within seconds, without a restart. The
file holds only `limit` of the models (`context` and `output` together, `input` when the profile has it) and the key
`_crew_harness` (the mark: a file without it is never overwritten or removed); it never holds `compaction` — the
thresholds stay the owner's. It is excluded from git through `info/exclude` of the common git directory and removed when
the set is switched off, the task is accepted or cancelled, or its folder is gone.

**The window of a profile applies only to sessions in the worktree of a task (development, planning).** The review
sessions (`develop_accept`, `plan_accept`) run in the main folder: their model comes from the set, but their window comes from the
owner's general hand-written settings for that model; `check` and the detailed `/crew-sets show <stage>` say so and print the number
and the file; `use` has one short line about it. The root of the project and the main folders get no file, and a task without a worktree gets none. A
hand-written `.opencode/opencode.jsonc` in the same folder is stronger than the file of the plugin there (the plugin
names such a case, with the file and the value, in `use`, `check` and `crew_doctor`); an explicit `autoCompactWindow` of
the `claude-code` provider is stronger than the window for Claude Code and is never rewritten — only named. For a model
with `input` the compaction is driven by `input` (the threshold is `input` minus `compaction.reserved`), otherwise by
`context`; a **smaller window compacts** the tabs whose context is above the new threshold on their next turn.

Reviewers on another family. With a cell that has an explicit tier (`develop_accept: kimi/heavy`) an open tab of the reviewer role
is taken only if its model is a model of that family (any of its three tiers; `openai/gpt-5.5#high` fits the profile
`openai/gpt-5.5`, `openai/gpt-5.5-fast` does not); otherwise a new review session starts in the main folder on the model
of the cell — when there is no free open tab of the role. With a `task` cell the model of an open tab is not checked, as
without a set. With `reviewer: integrator` the reviewer is the integrator's tab on its own model and the set does not
change that (the plugin never switches the model of an open tab). A reviewer on Kimi or Codex works with the same
`crew_*` tools; the rules of the repository's `.claude` act in a tab of another family only in part (the PreToolUse
hooks of the shell, `permissions.deny` and `.claude/commands` through the guards plugin; `Write`, `Stop`,
`SessionStart` and `PostToolUse` hooks do not).

Commands of the window (answers are shown in a dialog at once, no turn of the model; a window opens the commands after its restart). In the window `/crew-sets` (also `ls` and `list`) opens a pick (`dialog.select`): a row per set, `●` at the enabled one, the models in the description; arrows and Enter enable the set and show a short result; the last row, «other actions», opens the menu of the other verbs. `/crew-profiles` opens the same pick of the families (Enter shows the family). A verb that takes a name of a set (a family) — `use`, `show`, `rename`, `delete`, `set`, `unset` (`show`, `set`, `rename`, `delete`) — opens the same list first; a text is typed only for a new name (`new`, the second name of `rename`) or a cell (`set`); `unset` and the tier of `delete` are picked too. What the dialog gives: the fields `title`, `value`, `description`, `footer`, `category`, `current` and the per-row `onSelect`, the filter by typing inside the dialog; what it does not give: a completion of the typed word in the line of `/` itself (the plugin has no hook for it), a text in `showText` is not interactive — that is why `ls` is a pick, not a table. The catalog of models for `check` and `use` comes from the window, otherwise from a snapshot that the plugin of the service writes (`model-catalog.json` in the mailbox, every 10 minutes); an old or absent snapshot is named in the answer. Sizes in the answers are written as «контекст 720K · вывод до 64K» (with a separate input limit: «контекст 525K · ввод 461K · вывод до 128K»); «контекст» is the OpenCode `limit.context`, the word «окно» is kept for the terminal window:

| Command | What it does |
|---|---|
| `/crew-sets ls` (also `list`, and the command without words) | the sets with `●` at the enabled one and the models in the cells (short names with a legend; stages with one model are grouped; a `task` cell shows the models of the three tiers `opus/sonnet/haiku`); in the window it is the pick described above |
| `/crew-sets show [name]` | a set in short: a table stage x tier (heavy, medium, light) with short model names (`luna`, `opus`), `как «stage»` for an inherited stage that does not differ, one line `all stages: …` when all are alike, a legend (full name, context, output; once per model), one ⚠ line per warning (the check on the same family as its author, a model out of the catalog, a missing profile), a hint; the enabled one if no name. Width of the window `/crew`, no line is wrapped |
| `/crew-sets show [name] <stage>` / `show [name] all` | the detailed answer: everything the table hides — inheritance and its tier, the clamp by the tier bounds, the tiers of the task, the window of the profile in the worktree, the window of the review sessions with the number and the file, the errors and the full notes; `all` is the whole former text. A set named like a stage wins as the first word; `show <name> <stage>` is unambiguous |
| `/crew-sets use <name>` | enable a set (writes `profile_set` into the file of the project; Enter on a set in the pick does the same). The screen: the first line `Набор «kimi» включён (был «codex»)`; a line per group of stages — `Работа` (development and planning) and `Приёмка` (their checks), or each stage under its own word when they differ — with the model and `(было …)` (alike are collapsed: `(было те же)`, `(без изменений)`); the three tiers of a task are shown as «by the size of the task» (`luna / sol / astra по размеру задачи`), never as heavy/medium/light; a line when the tier bounds of the project cut something, and a line about the stages described apart; **the running sessions** that stay on the old models (`сейчас 2: 094, 098`, then a task, its title and the old model per line; counted from the status files of the plugin: the sessions of the open tasks of this project that work now — an executor in `starting`, `running` or `rework`, a reviewer in `submitted`, `reviewing` or `approval` — whose model is not in the new set; no status folder — no such line; the tabs of the owner and of the integrators are not counted) and where new sessions go (no restart); the window of the model (`Контекст модели: 220K, вывод до 131072 (у «codex» было 525K, ввод 461K, вывод до 128K)`); ⚠ lines (a smaller window is compacted on the next turn of a tab: the threshold is the context minus `compaction.reserved`, for a model with an input limit the input minus `reserved`; the check on the same family as its author; hand-written windows that win); `Не закоммичено — это локальная настройка проекта.`; a line about the window files of the task worktrees only when something was written, removed or failed. The short names with provider and legend, the review windows from the hand-written settings and the details of the stages are in `show` |
| `/crew-sets set <name> <stage> <family>/<tier>` | change a cell (stages: `develop`, `develop_accept` (also `accept`), `plan`, `plan_accept`, `spec`, `spec_accept`, `delivery`, `delivery_accept` or Russian words) |
| `/crew-sets unset <name> <stage>` | remove a cell: the stage goes back to `spawn_models` |
| `/crew-sets new <name> [from <other>]`, `rename <a> <b>`, `delete <name>` | create (empty or a copy), rename (the enabled name follows), delete (not the enabled one) |
| `/crew-profiles ls` (also `list`, and the command without words) | a table «family, tier → model, window»; in the window a pick of the families |
| `/crew-profiles show [<family>]` | without a name — the table in detail. With a family (also Enter on a family in the pick): the three tiers (the model without the provider, `контекст 525K, ввод 461K, вывод 128K`, `то же` when the window equals the one above), `Используют наборы:` — the sets that use the family with their stages by words (`codex (разработка, приёмка, …)`), and the last line — whether the enabled set uses the family now (`эта семья сейчас не используется`, or the stages that use it, the inherited ones apart). The provider is in `/crew-profiles ls`; the cell `family/tier` of a stage — in `/crew-sets show <set> <stage>` |
| `/crew-profiles set <family> <tier\|all> <model> <context> output=<n> [input=<n>]` | create or change a record; `all` changes the three tiers in one check |
| `/crew-profiles new <family> [from <other>]`, `rename <a> <b>`, `delete <family> [<tier>]` | three empty records or a copy; rename updates every set; delete is refused while a set refers to the record |
| `check` (both commands) | the first line is the summary (`no remarks` or their count), then ⚠ lines and the facts about the environment: the whole table and the sets against the catalog of OpenCode («not checked» when the catalog is unavailable), hand-written windows, the explicit threshold, empty records, links; changes nothing |

The answers follow one pattern: the first line is the result in one sentence (`Готово: …` for an edit, with «was» for `set`; the set is on for `use`; the summary for `check`), below only what changed or what needs attention. `/crew-sets show` is the place for the rest.

Edits act at once, without a commit and without any layer between: every command rewrites the three keys (`model_profiles`,
`profile_sets`, `profile_set`) of the file `.opencode/crew-harness.json` in the working copy of the settings folder, in one
atomic write; the data in force are those keys of the working copy (the plugin does not commit — commit the file when you
want the change to travel). An edit that would make the enabled set invalid or leave a dangling reference is refused whole
and the file stays as it was. There is no `save` and no `reset`: the earlier local layer
(`profiles/<project>.layer.json` in the mailbox of the plugin) is switched off — see [ADR-0014](../doc/canon/decisions/ADR-0008-model-profiles-layer-and-window-files.md);
an old layer file is not read, the service and `check` name it once, and it can be deleted by hand. An invalid state that came not through the commands (a commit removed a profile) does not stop the running tabs:
sessions go by the last valid state (the snapshot) with a warning in `/crew-sets`, `crew_doctor` and a notice in the
window; a set that is gone and has no snapshot gives a refusal that names the set. Every edit leaves one line
`profile edit: …` in the log of the plugin; a task keeps, per launched session, the stage, the set, the family, the tier
and the model.

An example of the two keys (invented numbers; `crew_config set` takes it in one call, or copy it into the file; the default
name is not part of it):

```json
{
  "model_profiles": {
    "claude": {
      "heavy": { "model": "claude-code/opus", "context": 720000, "output": 64000 },
      "medium": { "model": "claude-code/sonnet", "context": 720000, "output": 64000 },
      "light": { "model": "claude-code/haiku", "context": 220000, "output": 32000 }
    },
    "kimi": {
      "heavy": { "model": "kimi-code-plan-global/k3-256k", "context": 220000, "output": 131072 },
      "medium": { "model": "kimi-code-plan-global/k3-256k", "context": 220000, "output": 131072 },
      "light": { "model": "kimi-code-plan-global/k3-256k", "context": 220000, "output": 131072 }
    },
    "codex": {
      "heavy": { "model": "openai/gpt-5.5", "context": 525000, "input": 461000, "output": 128000 },
      "medium": { "model": "openai/gpt-5.6-terra", "context": 525000, "input": 461000, "output": 128000 },
      "light": { "model": "openai/gpt-6-luna", "context": 525000, "input": 461000, "output": 128000 }
    }
  },
  "profile_sets": {
    "default": {
      "develop": { "family": "claude", "tier": "task" },
      "plan": { "family": "claude", "tier": "task" },
      "develop_accept": { "family": "claude", "tier": "task" },
      "plan_accept": { "family": "claude", "tier": "task" }
    },
    "cross-kimi": {
      "develop": { "family": "claude", "tier": "task" },
      "plan": { "family": "claude", "tier": "task" },
      "develop_accept": { "family": "kimi", "tier": "heavy" },
      "plan_accept": { "family": "kimi", "tier": "heavy" }
    },
    "cross-codex": {
      "develop": { "family": "claude", "tier": "medium" },
      "plan": { "family": "claude", "tier": "heavy" },
      "develop_accept": { "family": "codex", "tier": "heavy" },
      "plan_accept": { "family": "codex", "tier": "heavy" }
    },
    "kimi-only": {
      "develop": { "family": "kimi", "tier": "heavy" },
      "plan": { "family": "kimi", "tier": "heavy" },
      "develop_accept": { "family": "kimi", "tier": "heavy" },
      "plan_accept": { "family": "kimi", "tier": "heavy" }
    }
  }
}
```

`default` keeps the choice of models and of open reviewer tabs as it was **while the models of the `claude` profiles equal
`spawn_models`** of the project (`check` warns when they differ); the file of windows in the worktree is still written with
the values of the table. A set with an explicit tier of `develop_accept` narrows the open reviewer tabs to its family. The other
sets show what is possible. The windows of the models of one family may repeat a model on several tiers (Kimi has one model
on all three) only with equal fields; two profiles of a set with different windows for the same model make `use` refuse,
because the window in OpenCode is one per model and folder. The window of a hand-written
`.opencode/opencode.jsonc` of the repository (for example 520000 for a model that the owner's global settings give 720000)
is what the tabs in the main folder use — the plugin only names it.

## Other projects

- **inbound** of the receiving project limits letters from other projects: `integrator` (default:
  only to its integrator), `any`, `none`; a refused letter names the address to use;
- **an order**: `crew_task {action: "order", to: "beta.integrator", goal, criteria, …}` records task
  `NNN` of kind order in the orderer's journal (no session, no title marks) and sends it to beta's
  integrator, who does it with its own tasks: `crew_spawn {…, parent: "alpha#N"}`. The order follows
  that task: done → the order is done (a quiet summary to the orderer), cancelled → a call.

## Other machines (research, not in the plugin)

The plugin carries letters between tabs of one machine only. A prototype of letters to projects on other
machines (a bridge over Tailscale, ntfy or GitHub issues, configured by `remote.json`) was tried on 2026-10-06
and left unfinished; it is not part of the plugin and the plugin does not read `remote.json`. Its code, tests,
measurements and open questions are in
[doc/research/remote-transport/](../doc/research/remote-transport/README.md) (task 046).

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
"plugins": ["C:/work/crew-harness/opencode-plugin"]
```

`~/.config/opencode/cli.json` (the window plugin; the plugin folder, not a file — OpenCode loads `tui.ts`
from it):

```json
{ "plugins": ["C:/work/crew-harness/opencode-plugin"] }
```

Windows opened before the window plugin was added do not report their tabs: reopen them.

## Related

Other OpenCode plugins of the same set (they work independently; together they are tested on one machine):

- [opencode-windows-env](https://github.com/unitcraft/opencode-windows-env) — a sane command environment on Windows and a time stamp on agent messages
- [opencode-claude-guards](https://github.com/unitcraft/opencode-claude-guards) — the repository's Claude Code rules (hooks, permissions) in OpenCode windows
- [opencode-claude-code-provider](https://github.com/unitcraft/opencode-claude-code-provider) — OpenCode provider `claude-code` on top of the official Claude Code

## Waiting for you by the built-in questionnaire

When a model asks through the built-in OpenCode questionnaire, the bus emits `form.created` (metadata kind `question`);
the plugin records the open form in `forms/<session>.json` and the session shows as "waiting for you" with the text of
the first question, in `/crew`, the sidebar and the notice. `form.replied` and `form.cancelled` remove the record and
the status returns by itself. No model is involved, and the same applies to task sessions (the questionnaire is always
addressed to a human). Events arrive in copies (several windows), so records are idempotent by form id; a form older
than 12 hours does not count. The wait phrases stay as a safety net for plain prose.
Details: [doc/tasks/026-crew-question/task/analysis.md](../doc/tasks/026-crew-question/task/analysis.md).

## Event probe

A diagnostic, off by default (task 026): `CREW_HARNESS_EVENT_PROBE=1` in the service environment, then restart.
It subscribes to OpenCode bus events and logs `form.*`, `permission.*`, `question.*`, `session.idle|status`, `tool.*`
lines to `%TEMP%/opencode-plugins.log` (lines start with `event probe:`). It changes no plugin behaviour.
Details: [doc/tasks/026-crew-question/task/probe.md](../doc/tasks/026-crew-question/task/probe.md).

## Test

```sh
npm test                  # node >= 24, one file after another
npm run test:parallel     # the same files, 8 at a time, the red ones counted by file
npm run test:stable       # the files that were flaky under load, 10 times each, 8 at a time
```

What each test checks, the manual latency checks and what the tests do not cover — [test/README.md](test/README.md).

History: moved with its commits from a private plugins repository of the nova project (`plugins/nova-peers`).
Renamed 2026-10-07 (plan 005): `nova-peers` → `opencode-peers` → CrewHarness (`crew-harness`); the plugin id is
`crew-harness`; the mailbox `crew-harness` is a junction to the folder of the earliest one (nothing moves, nothing is
lost); the settings file is `.opencode/crew-harness.json` (`.opencode/opencode-peers.json` is still read, with a
`crew_doctor` note to rename it).

License: MIT OR Apache-2.0 (see [LICENSE](../LICENSE)).
