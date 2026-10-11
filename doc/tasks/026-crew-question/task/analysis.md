# Task 026: analysis, step 1 (fast path, owner-approved 2026-10-11)

## Live probe result (2026-10-11, service 2.0.26)

- The plugin receives bus events both through `event.subscribe` and through `session.hook("event")`.
- The built-in questionnaire emits `form.created` with `{form: {id, sessionID, title: "Questions", metadata: {kind: "question", tool: {messageID, id}}, ...fields with question and option texts}}`.
- On an answer it emits `form.replied` with `{id, sessionID, answer: {q0: "..."}}`.
- `form.cancelled` (`{id, ...}`, on Esc) is expected but was not seen live; it is handled like `form.replied`.
- Every event arrives in copies (four identical lines: four windows, two subscriptions per window), so handling is idempotent by form id.

## Done in step 1

- `opencode-plugin/form-wait.ts`: pending forms in `forms/<session>.json` (atomic write, idempotent add/remove, 12 hour cutoff), `handleFormEvent`, `startFormWait` (always on; `event.subscribe`, falling back to `session.hook("event")`), cleanup of stale files at setup.
- `status.ts`: a pending form gives state `owner` with detail "waiting for you since HH:MM: <question>" and `question`; it wins over the phrase signal and over `working`; task sessions get `owner` too. The existing notification and reminder logic is reused (`since` is the form time, so a repeated status write does not re-notify).
- Test `test/crew-form-wait.test.mjs`, README section. The event probe is unchanged.

## Not done, and why

- `crew_question` with a recommendation and an auto-answer: needs the owner's decision on the tool shape and the safety rules for auto-answering (gate questions never); the signal alone already closes the incident.
- `answer_mode` triggered by the event: depends on the structured question above.
- Closing a form record when its session dies: the record expires in 12 hours and is dropped at setup; exact closing needs a reliable session-death signal that was not verified.
