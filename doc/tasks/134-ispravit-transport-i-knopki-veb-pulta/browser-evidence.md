# Browser regression evidence

`src/web/test/app-browser.mjs` starts a loopback-only static preview, serves a controlled agent registry, intercepts `/ws` with Playwright's WebSocket route, and executes the real page and `app.js`. It uses no live service, real agent, model prompt, or database. Playwright and Chrome paths are command-line arguments, not machine-specific constants in the test.

## Reproduce

From `src/web/`:

```sh
node test/app-browser.mjs <playwright-module> <chrome-executable>
node test/app-browser.mjs <playwright-module> <chrome-executable> --offline
node test/app-browser.mjs <playwright-module> <chrome-executable> --no-registry
node test/app-browser.mjs <playwright-module> <chrome-executable> --red <pre-fix-app.js>
```

For RED, obtain the original page module with `git show origin/main:src/web/app.js > <pre-fix-app.js>` while `origin/main` is the affected baseline `a34528b1fea25548a7badb321c242f3932831b3e`.

## Observed results

- **RED, original `origin/main` app.js:** `errors=["transport is not defined"]`, `websocketFramesSent=0`, `formStillVisible=true`.
- **GREEN, changed app.js:** no browser errors. Create sent `session_created` with `agent="opencode"`; the echoed server event opened the chat and closed the form. Send emitted `user_message` with the entered text; a controlled permission request led to `permission_decision` with `{request:"approval-1",decision:"allow"}`; a controlled streaming chunk enabled Cancel, which emitted `cancel` for the expected trace and turn. A second create sent `session_created` with `agent="kimi"`. URL had no `?mock=1`; the page used the controlled `/api/agents` registry and WebSocket route.
- **Disconnected socket:** no browser errors or frames; the form stayed open and status reported that the connection was lost and the event was not sent.
- **Unavailable agent registry:** zero agents, Create disabled, and the unavailable-registry message was visible.

The probe output and assertions are the evidence; the full web test suite is recorded separately in the task submission.

## Machine queue and guards

Fresh full suite: `node --test test/*.test.mjs` — 103 passed, 0 failed, exit 0, run through the project machine queue. Browser gate command in that same queued run completed GREEN, OFFLINE refusal, REGISTRY unavailable safely, and RED confirmed; queue watch `1792531627748-u0o24z` exited 0. `sh scripts/guards/run-all.sh` — 9 guards passed, 0 failures; `git diff --check` — clean.
