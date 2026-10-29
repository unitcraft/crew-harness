// Self-test of task 256 (node >= 24):  node test/crew-user-tab-guard.test.mjs
// A user tab (no spawned provenance, regardless of auto or crew_role) is not assigned a task by
// crew_task assign, even with a forged owner's word; the automatic reviewer pick skips such
// tabs the same way; a card with a task but no spawned session is never renamed by syncTitles. The legitimate paths
// stay: a program-created reviewer pool, a new spawned reviewer, reassignment of legacy records.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-utab-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const dirA = path.join(tmp, "alpha")
mkdirSync(path.join(dirA, ".opencode"), { recursive: true })
writeFileSync(path.join(dirA, ".opencode", "crew-harness.json"), JSON.stringify({}))

const mod = await import("../index.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const updates = []
const dirOf = { sesINT: dirA, sesUSER: dirA, sesCREW: dirA, sesREV1: dirA, sesREV2: dirA }
const ctx = {
  location: { directory: tmp },
  options: { projects: { alpha: dirA } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] ?? dirA }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => ({ id: req.id }),
    update: async (req) => updates.push(req),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 30_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
}
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content

const WPID = 737373
const tabIds = Object.keys(dirOf)
const tabs = tabIds.map((sessionID) => ({ sessionID, active: false, busy: false }))
const setBusy = (sid, busy) => {
  const t = tabs.find((x) => x.sessionID === sid)
  if (t) t.busy = busy
  beat()
}
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now() + 30_000, tabs }))
beat()
const heart = setInterval(beat, 300)
for (const s of tabIds) {
  await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: s } })
}
await call("crew_role", "sesINT", { role: "integrator" })
// sesCREW is a standing worker: its model took the role itself (auto becomes false); sesUSER and sesREV1 stay auto (user tabs)
await call("crew_role", "sesCREW", { role: "worker" })

const GOAL = { goal: "сделать X", criteria: "тест зелёный" }
const userBefore = JSON.stringify(core.readJson(core.cardFile("sesUSER")))
const crewBefore = JSON.stringify(core.readJson(core.cardFile("sesCREW")))
// 1. the incident of 2026-10-29: a user tab is captured by assign on the sole ground of a free worker tab
const r1 = await call("crew_task", "sesINT", { action: "assign", session: "sesUSER", title: "чужая", ...GOAL })
cell("assign to a user tab without the owner's word is refused", /пользовательская вкладка/.test(r1) && /owner_words/.test(r1) && /sesUSER/.test(r1), r1)
cell("... and no task is created, the card is untouched", tasks.listTasks("alpha").length === 0 && !core.readJson(core.cardFile("sesUSER"))?.task, JSON.stringify(tasks.listTasks("alpha")))
// 2. a word that does not name THIS session is not a permission for it
const r2 = await call("crew_task", "sesINT", { action: "assign", session: "sesUSER", title: "чужая", ...GOAL, owner_words: "«сделай» (владелец, 2026-10-29, чат)" })
cell("the owner's word without the session id is refused", /пользовательская вкладка/.test(r2), r2)
const similar = await call("crew_task", "sesINT", { action: "assign", session: "sesUSER", title: "чужая", ...GOAL, owner_words: "«вкладку sesUSER2 бери под задачу» (владелец, 2026-10-29, чат)" })
cell("a session id prefix is not permission for this session", /пользовательская вкладка/.test(similar) && tasks.listTasks("alpha").length === 0, similar)
// 3. a word with the id but without a date is not the owner's word
const r3 = await call("crew_task", "sesINT", { action: "assign", session: "sesUSER", title: "чужая", ...GOAL, owner_words: "«вкладку sesUSER бери» (владелец, чат)" })
cell("the word without a date is refused", /пользовательская вкладка/.test(r3), r3)
// 4. An agent can forge owner_words, including an exact id and a date. This is not a trusted receipt.
const r4 = await call("crew_task", "sesINT", { action: "assign", session: "sesUSER", title: "слово владельца", ...GOAL, owner_words: "«вкладку sesUSER бери под задачу» (владелец, 2026-10-29, чат)" })
cell("forged owner_words naming the exact session is refused", /пользовательская вкладка/.test(r4) && tasks.listTasks("alpha").length === 0, r4)
// 5. Role change combined with forged owner words still grants no authority.
const r5 = await call("crew_task", "sesINT", { action: "assign", session: "sesCREW", title: "штатная", ...GOAL, owner_words: "«вкладку sesCREW бери под задачу» (владелец, 2026-10-29, чат)" })
cell("crew_role plus forged owner_words cannot authorize assignment", /пользовательская вкладка/.test(r5) && tasks.listTasks("alpha").length === 0, r5)
cell("refusals leave both user cards byte-equivalent", JSON.stringify(core.readJson(core.cardFile("sesUSER"))) === userBefore && JSON.stringify(core.readJson(core.cardFile("sesCREW"))) === crewBefore, "user cards changed")
cell("refusals create no letters or obligations for the target", core.peekLetters(["sesUSER", "sesCREW"]).length === 0 && core.obligationsOf("sesUSER").length === 0 && core.obligationsOf("sesCREW").length === 0, "assignment side effects")
// A pre-fix assignment fixture: existing records must still work and must not rename the user conversation.
const assigned = tasks.createTask({ project: "alpha", title: "legacy", ...GOAL, priority: "P2", tier: "medium", role: "worker", author: "sesINT", author_role: "alpha.integrator", qid: "legacy-q", status: "running", kind: "assign", executor: "sesUSER", directory: dirA })
core.saveCard({ ...core.readJson(core.cardFile("sesUSER")), task: { project: "alpha", n: assigned.n } })
// 6. the syncTitles pass never renames a card with a task but without a spawned session (regression lock)
updates.length = 0
await wait(1200)
cell("syncTitles never renames the assigned user tab", !updates.some((u) => u.sessionID === "sesUSER"), JSON.stringify(updates.map((u) => u.sessionID)))

// 7. the automatic reviewer pick skips user tabs the same way (the equivalent path): the only free worker tab is sesREV1 (auto)
const submitted = (title) =>
  tasks.createTask({ project: "alpha", title, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", author: "sesINT", author_role: "alpha.integrator", qid: `q-${title}`, status: "submitted", kind: "spawn", executor: "sesEXEC1", directory: dirA, report: "сделано" })
// the executor has a spawned card of this process so the watch loop does not mourn it
core.saveCard({ session: "sesEXEC1", role: "worker", auto: false, title: "sesEXEC1", directory: dirA, repo: "alpha", project: "alpha", pid: process.pid, updated: Date.now(), spawned: { by: "sesINT", task: "x", tier: "light", status: "running", at: Date.now(), qid: "qe" }, task: { project: "alpha", n: 99 } })
setBusy("sesCREW", true)
const t7 = submitted("приёмка-автовыбор")
await until(() => !!tasks.loadTask("alpha", t7.n)?.reviewer)
const t7r = tasks.loadTask("alpha", t7.n)
cell("a submitted task never lands on a user tab (auto) as its reviewer", t7r?.reviewer !== "sesREV1" && t7r?.review_kind !== "tab", JSON.stringify({ reviewer: t7r?.reviewer, kind: t7r?.review_kind }))
cell("... a new review session is spawned instead", t7r?.review_kind === "spawn" && /^ses_/.test(t7r?.reviewer ?? ""), JSON.stringify({ reviewer: t7r?.reviewer, kind: t7r?.review_kind }))
// 8. even a standing worker tab is a user conversation without program-created provenance
setBusy("sesCREW", false)
await call("crew_task", "sesINT", { action: "cancel", n: t7.n })
const t8 = submitted("приёмка-вкладка")
await until(() => tasks.loadTask("alpha", t8.n)?.review_kind === "tab" || (tasks.loadTask("alpha", t8.n)?.review_kind === "spawn" && !!core.readJson(core.cardFile(tasks.loadTask("alpha", t8.n)?.reviewer ?? ""))))
const t8r = tasks.loadTask("alpha", t8.n)
cell("crew_role does not authorize automatic review assignment", t8r?.reviewer !== "sesCREW" && t8r?.review_kind === "spawn", JSON.stringify({ reviewer: t8r?.reviewer, kind: t8r?.review_kind }))

// 9. A program-created session in an open pool remains eligible; provenance, not the role, authorizes the pick.
await call("crew_task", "sesINT", { action: "cancel", n: t8.n })
tabs.push({ sessionID: "sesPOOL", active: false, busy: false })
core.saveCard({ session: "sesPOOL", role: "worker", auto: false, title: "pool", directory: dirA, repo: "alpha", project: "alpha", pid: process.pid, updated: Date.now(), spawned: { by: "sesINT", task: "review pool", tier: "medium", status: "running", at: Date.now(), qid: "pool" } })
beat()
const t9 = submitted("приёмка-выделенная")
await until(() => !!tasks.loadTask("alpha", t9.n)?.reviewer)
cell("a program-created pool session can review", tasks.loadTask("alpha", t9.n)?.reviewer === "sesPOOL", JSON.stringify(tasks.loadTask("alpha", t9.n)))
tasks.taskEvent(tasks.loadTask("alpha", t9.n), "sesPOOL", "done", "fixture: previous review finished")
await wait(500)
const t10 = submitted("приёмка-повторная")
await until(() => tasks.loadTask("alpha", t10.n)?.reviewer === "sesPOOL")
await wait(500)
cell("an old completed review cannot close the reused program session", tasks.loadTask("alpha", t10.n)?.reviewer === "sesPOOL" && core.readJson(core.cardFile("sesPOOL"))?.spawned?.status === "running", JSON.stringify(core.readJson(core.cardFile("sesPOOL"))))

// 10. Reassignment always creates a new executor; it never converts the owner's conversation into a spawned one.
const reassigned = await call("crew_task", "sesINT", { action: "reassign", n: assigned.n })
const next = tasks.loadTask("alpha", assigned.n)
cell("reassign creates a new program-owned executor", next?.executor !== "sesUSER" && !!core.readJson(core.cardFile(next?.executor ?? ""))?.spawned, reassigned)
cell("the original user card keeps its provenance and title", !core.readJson(core.cardFile("sesUSER"))?.spawned && core.readJson(core.cardFile("sesUSER"))?.title === "sesUSER", JSON.stringify(core.readJson(core.cardFile("sesUSER"))))

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? "crew-user-tab-guard.test: FAIL " + fail : "crew-user-tab-guard.test ok")
process.exit(fail ? 1 : 0)
