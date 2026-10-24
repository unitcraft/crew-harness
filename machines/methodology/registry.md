# Реестр методики: примитивы шага агента, совещания, запуска сессии и раннера задачи

Данные методики (56 примитивов, роли разбора и типы их подписей), которые она регистрирует у языка. Переходно лежит в продукте (задача 158; к методике уйдёт задачей 159). Примитивы `time_now` и `new_id` — язык (раздел 7а, AL-113), здесь их нет. Наборы типов: основной (`standard`), `session` (типы запуска сессии: свои `Finding`, `Severity`, `Summary`) и `runner` (типы раннера).

Форма — раздел 7 спецификации Алулы: имена — JSON-имена реестра хозяина; типы — как пишет дерево `machine/2` (`int>=0`, `?text`, `[]Finding`, `"a" \| "b"`); `\|` внутри ячейки — знак `|`; списки «читает» и «пишет» разделены `;`; `—` — пусто. Файл читает `parse_registry_table` пакета `alula` (`alula.machine_table`), программа `alula` берёт его рядом с машинами (`registry.md`) или флагом `--registry`.

## Primitives

| name | parameters | result | class | reads | writes |
|---|---|---|---|---|---|
| party_profile | party: text | AgentProfile | reading | project setting: role profiles | — |
| role_context | context: RoleContext | text | reading | project objects | — |
| call_trace | — | text | reading | envelope of the call | — |
| call_step | — | int>=0 | reading | envelope of the call | — |
| parse_agent_reply | reply: AgentReply; role: "witness" \| "author" \| "lens" | RoleResult | reading | object: artifact file of the reply | — |
| proposal_read | — | bool | reading | object: proposal | — |
| proposal_with_fingerprint | — | text | reading | object: proposal | — |
| proposal_changed_since_attempt | — | bool | reading | object: proposal | — |
| count_in_model_tally | finding: Finding | — | writing | — | buffer: model tally |
| journal_findings | findings: []Finding | — | writing | — | — |
| journal_machine_data | — | — | writing | all_data | — |
| journal_decision | decision: text; source: text; passes: int>=0; open: []Finding | — | writing | — | — |
| remove_unsound | number: int>=0 | — | writing | lens_findings | lens_findings |
| build_summary | number: int>=0 | ?Summary | writing | lens_findings; lenses | object: summary file |
| close_for_writing | object: text | — | irreversible | — | — |
| open_for_writing | object: text | — | irreversible | — | — |
| move_to_archive | number: int>=0; suffix: int>=0 | — | irreversible | — | — |
| reply_validation | — | ReplyCheck | reading | reply_text; reply_artifact; agent_request; objects: session files | service record: form remarks (read by the turn fix) |
| close_agent_turn | — | — | irreversible | — | — |
| check_cache | dialog_kind: "main" \| "delivery" | — | writing | — | service record: request start mark |
| launch_scope | — | LaunchScope | reading | objects: measure of the dialog of the launch | — |
| launch_profile | session: text | AgentProfile | reading | service store: profile confirmed at the gate of the profile | — |
| session_context | session: text; source: text; launch_pass: ?int; delivery_mode: text; task_dir: text; repo_dir: text; route: text; source_list: ?text; delivery_short: bool | text | reading | objects: plan of the task, prompts of the sessions, dialog of the author | — |
| parse_session_artifact | session: text; reply: AgentReply | SessionParsing | reading | objects: artifact file of the session | — |
| prepare_launch | session: text; launch_pass: ?int; task_dir: text; repo_dir: text | — | writing | — | objects: group of the processes of the agent, record of the launch, marks progress.log and profile.log |
| finish_launch | session: text; launch_pass: ?int; task_dir: text; answered: bool | — | writing | objects: profile.log, progress.log, dialog of the agent | objects: hint from profile.log, check of progress.log, transcript of the dialog |
| stop_agent_group | — | — | irreversible | — | — |
| run_preparation | task_dir: text; repo_dir: text | PreparationResult | writing | objects: state of the runner, files of the cycles on the disk, lock, mark of the tree | objects: lock of the runner, state, file of a torn pass |
| specification | — | TaskDocumentState | reading | objects: spec.md | — |
| task_plan | — | TaskDocumentState | reading | objects: plan.md | — |
| implementation_report | — | TaskDocumentState | reading | objects: result.md | — |
| route_features | — | ?RouteFeatures | reading | objects: section Route features of the brief | — |
| project_settings | — | ProjectSettings | reading | project setting: thresholds and numbers of the cycle by the routes | — |
| source_list | — | ?text | reading | objects: line Source list of the brief | — |
| brief_complete | — | bool | reading | objects: brief task/message.md | — |
| copy_approval | word: text; date: text | Approval | reading | objects: brief task/message.md | — |
| approval_by_document | document: TaskDocument | Approval | reading | objects: spec.md, plan.md | — |
| source_with_specification_marks | source: text | text | reading | objects: specification, file of the review | — |
| last_implementation_review | — | ?text | reading | objects: last file of the implementation review | — |
| has_unresolved_line | — | bool | reading | objects: implementation report | — |
| customer_letter | — | ?text | reading | objects: letter to the customer | — |
| round_letters | round: int>=0 | ?text | reading | objects: letters of the rounds | — |
| secrets_report | — | ?text | reading | objects: last file of the implementation review | — |
| tree_diff | — | text | reading | objects: working tree | — |
| commit_message | — | text | reading | objects: history of the working tree | — |
| commit_text | — | text | reading | objects: commit.txt | — |
| feedback_route | — | ?text | reading | objects: file of the feedback analysis | — |
| write_answers | answers: text | — | writing | — | objects: section Answers of the specification |
| write_decisions | decisions: text | — | writing | — | objects: section Requires approval of the plan |
| write_owner_marks | decisions: text | — | writing | — | objects: implementation report |
| save_round_notes | round: int>=0; text: text | — | writing | — | objects: folder of the feedback round |
| write_draft_status | document: TaskDocument | — | irreversible | — | — |
| create_approved_copy | word: text; date: text | — | irreversible | — | — |
| rename_letter | round: int>=0 | — | irreversible | — | — |
| release_lock | — | — | irreversible | — | — |
| show_human | text: text | — | irreversible | — | — |

## Roles

| primitive | role | result | reads |
|---|---|---|---|
| parse_agent_reply | witness | []WitnessAnswer | object: proposal |
| parse_agent_reply | author | EditResult | — |
| parse_agent_reply | lens | LensResult | — |

## Types

| type | kind | members |
|---|---|---|
| Finding | record | severity: Severity; evidence: text; repeat: bool; question: bool |
| Summary | record | critical: int>=0; probes: int>=0 |
| AgentProfile | record | family: text; model: text; effort: ?text |
| AgentModel | record | id: text; provider: text; variant: ?text |
| TokenUsage | record | input: ?int; output: ?int; reasoning: ?int; cache_read: ?int; cache_write: ?int |
| Usage | record | session: text; result: text; family: text; model: AgentModel; tokens: TokenUsage; cost: ?float; created: int; updated: int; context_used: ?int; trace: text; step: int |
| AgentReply | record | text: ?text; artifact: ?text; usage: Usage; request_started: ?int |
| Claim | record | kind: text; statement: text; source: text; excerpt: ?text; check: Check |
| LensResult | record | findings: []Finding; probes: int>=0 |
| JournalEvent | record | code: text; params: [](text, text) |
| Severity | variant | Critical; Significant; Desirable |
| Check | variant | Confirmed; ChannelDistortion; NotConfirmed |
| ReplyCheck | variant | Valid; Violated; Empty |
| WitnessAnswer | variant | Answered(claim: Claim); NotMeasured(claim: text) |
| EditResult | variant | Done(proposal: text); Question(proposal: text, question: text) |
| RoleResult | variant | WitnessOutcome(answers: []WitnessAnswer); LensOutcome(result: LensResult); EditOutcome(result: EditResult) |
| RoleContext | variant | WitnessContext(author_question: ?text, findings: ?[]Finding, proposal: text); LensContext(proposal: text, witness_answers: ?[]WitnessAnswer); FixContext(proposal: text, gate3_findings: []Finding, author_guidance: ?text); QuestionContext(author_question: text, proposal: text, gate3_findings: []Finding, human_answer: text) |

## Types: session

| type | kind | members |
|---|---|---|
| AgentProfile | record | family: text; model: text; effort: ?text |
| AgentModel | record | id: text; provider: text; variant: ?text |
| TokenUsage | record | input: ?int; output: ?int; reasoning: ?int; cache_read: ?int; cache_write: ?int |
| Usage | record | session: text; result: text; family: text; model: AgentModel; tokens: TokenUsage; cost: ?float; created: int; updated: int; context_used: ?int; trace: text; step: int |
| AgentReply | record | text: ?text; artifact: ?text; usage: Usage; request_started: ?int |
| Claim | record | kind: text; statement: text; source: text; excerpt: ?text; check: Check |
| LensResult | record | findings: []Finding; probes: int>=0 |
| JournalEvent | record | code: text; params: [](text, text) |
| Finding | record | severity: Severity; level: Level; evidence: text |
| Summary | record | essential: int>=0; probes: int>=0 |
| SessionParsing | record | result: SessionResult; summary: ?Summary; findings: ?[]Finding |
| Check | variant | Confirmed; ChannelDistortion; NotConfirmed |
| ReplyCheck | variant | Valid; Violated; Empty |
| WitnessAnswer | variant | Answered(claim: Claim); NotMeasured(claim: text) |
| EditResult | variant | Done(proposal: text); Question(proposal: text, question: text) |
| RoleResult | variant | WitnessOutcome(answers: []WitnessAnswer); LensOutcome(result: LensResult); EditOutcome(result: EditResult) |
| RoleContext | variant | WitnessContext(author_question: ?text, findings: ?[]Finding, proposal: text); LensContext(proposal: text, witness_answers: ?[]WitnessAnswer); FixContext(proposal: text, gate3_findings: []Finding, author_guidance: ?text); QuestionContext(author_question: text, proposal: text, gate3_findings: []Finding, human_answer: text) |
| Severity | variant | Essential; Superficial |
| Level | variant | Implementation; Plan; Requirements; OutOfScope; Delivery |
| SessionResult | variant | Done; Revision; Plan; Requirements; Question |
| LaunchScope | variant | Fits; DoesNotFit |

## Types: runner

| type | kind | members |
|---|---|---|
| Finding | record | severity: Severity; evidence: text; repeat: bool; question: bool |
| Summary | record | critical: int>=0; probes: int>=0 |
| AgentProfile | record | family: text; model: text; effort: ?text |
| AgentModel | record | id: text; provider: text; variant: ?text |
| TokenUsage | record | input: ?int; output: ?int; reasoning: ?int; cache_read: ?int; cache_write: ?int |
| Usage | record | session: text; result: text; family: text; model: AgentModel; tokens: TokenUsage; cost: ?float; created: int; updated: int; context_used: ?int; trace: text; step: int |
| AgentReply | record | text: ?text; artifact: ?text; usage: Usage; request_started: ?int |
| Claim | record | kind: text; statement: text; source: text; excerpt: ?text; check: Check |
| LensResult | record | findings: []Finding; probes: int>=0 |
| JournalEvent | record | code: text; params: [](text, text) |
| Cycle | record | number: int>=1; origin: int>=1; streak: int>=0; no_probes: int>=0 |
| Approval | record | date: text; who: text; hash: text |
| TaskDocumentState | record | exists: bool; status: DocumentStatus; stop_word: StopWord; hash: text |
| RouteFeatures | record | goal: text; sources: ?int; parts: ?int; risk: Risk; irreversible: Rating; cause_known: Rating; touches_norm: Rating; helper_proposal: text |
| RouteThresholds | record | max_sources: int>=0; max_parts: int>=0; allowed_risk: Risk |
| RouteSettings | record | ceiling: int>=0; clean_needed: int>=0; probes_min: int>=0; delivery_short: bool; relaxations: []text |
| ProjectSettings | record | thresholds: RouteThresholds; full: RouteSettings; fast: RouteSettings |
| PreparationResult | record | outcome: PreparationStatus; cycle: full {Stage: Cycle} |
| Severity | variant | Critical; Significant; Desirable |
| Check | variant | Confirmed; ChannelDistortion; NotConfirmed |
| ReplyCheck | variant | Valid; Violated; Empty |
| WitnessAnswer | variant | Answered(claim: Claim); NotMeasured(claim: text) |
| EditResult | variant | Done(proposal: text); Question(proposal: text, question: text) |
| RoleResult | variant | WitnessOutcome(answers: []WitnessAnswer); LensOutcome(result: LensResult); EditOutcome(result: EditResult) |
| RoleContext | variant | WitnessContext(author_question: ?text, findings: ?[]Finding, proposal: text); LensContext(proposal: text, witness_answers: ?[]WitnessAnswer); FixContext(proposal: text, gate3_findings: []Finding, author_guidance: ?text); QuestionContext(author_question: text, proposal: text, gate3_findings: []Finding, human_answer: text) |
| Stage | variant | Analysis; Plan; Implementation; Delivery; Meeting |
| TaskDocument | variant | Specification; Plan; ImplementationReport |
| DocumentStatus | variant | Draft; Approved; InProgress; Done; Unparsed |
| StopWord | variant | NoWord; Revision; Plan; Requirements; Question |
| Risk | variant | Low; Medium; High; Unrated |
| Rating | variant | Confirmed; No; Unrated |
| PreparationStatus | variant | Ready; BusyByLiveProcess; TreeBusyByOtherTask; GroupNotStopped |
