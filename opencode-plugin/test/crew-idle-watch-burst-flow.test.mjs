// Self-test of task 161 in the plugin, the remarks of the acceptance (node >= 24):  node test/crew-idle-watch-burst-flow.test.mjs
// BF-1 no double letters to the author: when the author holds the step (a task between sessions, a running task without an executor) the
//      plugin sends the letter of the watch («Шаг стоит …», it asks for an answer) and NOT the old «Ты простаиваешь» about the same task.
//      The old letter stays for what the watch does not cover (an executor whose window is dead).
// BF-2 a window that works on ANOTHER task is no excuse: the reviewer of tasks 30 and 31 works a turn on 31 (its card says so) - the
//      letter goes to it about 30 and none about 31.
// BF-3 a holder with no live window gets no letter: the task goes into ONE summary question of the project at once.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idle-watch-burst-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_STATUS_MS = "100"
process.env.CREW_HARNESS_FORM_MS = "100"
process.env.CREW_HARNESS_STEP_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ project: "proj", allow_default_models: true, step_term_minutes: 0.05, step_answer_minutes: 0.05, step_extend_minutes: 0.1, idle_tab_minutes: 0.05 }))

let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 20_000) => {
  for (const end = Date.now() + ms; !(await cond()) && Date.now() < end; ) await wait(100)
}
const tryImport = (p) => import(p).catch((e) => (console.log(`import ${p}: ${String(e).split("\n")[0]}`), null))

const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
const iw = await tryImport("../idle-watch.ts")
const mod = await import("../index.ts")

const T0 = Date.now() - 2 * 3_600_000
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (r) => ({ id: r.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (f) => f({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async (f) => f({ add: () => {} }) },
  events: { on: async () => {} },
}
const stop = await mod.default.setup(ctx)
const SES = { sesAUTH: "integrator", sesAUTH2: "worker", sesREV: "worker" }
for (const [s, role] of Object.entries(SES)) await tools.crew_role.execute({ role }, { sessionID: s })
const P = core.readJson(core.cardFile("sesAUTH"))?.project ?? "proj"
const mkTask = (n, st, extra = {}) => ({
  project: P, n, title: `задача ${n}`, slug: `t${n}`, goal: "цель", priority: "P2", tier: "medium", role: "worker", author: "sesAUTH", author_role: "integrator",
  qid: `q${n}`, status: st, kind: "assign", executors: [], attempt: 1, directory: proj, history: [{ at: T0, by: "sesAUTH", status: st, note: "поставлена" }], created: T0, updated: T0, ...extra,
})
const putTask = (t) => {
  mkdirSync(path.dirname(tasks.taskFile(P, t.n)), { recursive: true })
  writeFileSync(tasks.taskFile(P, t.n), JSON.stringify(t, null, 1))
}
const lettersTo = (s) => {
  const out = []
  for (const base of [core.INBOX, core.READ]) {
    const d = path.join(base, core.safeKey(s))
    try {
      for (const f of readdirSync(d)) if (f.endsWith(".json")) out.push(core.readJson(path.join(d, f)))
    } catch {}
  }
  return out.filter(Boolean)
}
const watchLetters = (s, n) => lettersTo(s).filter((l) => /^idle-step-/.test(l.id) && new RegExp(`${String(n).padStart(3, "0")} «`).test(l.text))
const oldLetters = (s) => lettersTo(s).filter((l) => /^Ты простаиваешь/.test(l.text))

// 20: between sessions, held by the author (the author's tab is free); 22: a running task whose executor has no window at all
putTask(mkTask(20, "idle", { title: "Между сессиями" }))
putTask(mkTask(22, "running", { title: "Исполнитель пропал", executor: "sesGONE", updated: T0 }))
// 30 and 31: the reviewer sesREV holds both, works a turn on 31 (its card says so), the author is sesAUTH2
core.saveCard({ ...core.readJson(core.cardFile("sesREV")), review: { project: P, n: 31 }, busy: true, busySince: Date.now() })
putTask(mkTask(30, "reviewing", { author: "sesAUTH2", reviewer: "sesREV", title: "Приёмка на другой задаче окна" }))
putTask(mkTask(31, "reviewing", { author: "sesAUTH2", reviewer: "sesREV", title: "Приёмка идёт" }))

await until(() => watchLetters("sesAUTH", 20).length >= 1 && watchLetters("sesREV", 30).length >= 1 && oldLetters("sesAUTH").length >= 1)
await wait(1500)
cell("BF-1a the author holds task 20 (between sessions): the letter of the watch asks for an answer", watchLetters("sesAUTH", 20).some((l) => /^Шаг стоит/.test(l.text) && /crew_step_note/.test(l.text)), J(lettersTo("sesAUTH").map((l) => l.text.slice(0, 70))))
cell("BF-1b and the old «Ты простаиваешь» does not name task 20: one letter about that step, not two", !oldLetters("sesAUTH").some((l) => /020 «/.test(l.text)), J(oldLetters("sesAUTH").map((l) => l.text.slice(0, 120))))
cell("BF-1c control: what the watch does not cover (an executor with no live session, task 22) is still named by the old letter", oldLetters("sesAUTH").some((l) => /022 «/.test(l.text)), J(oldLetters("sesAUTH").map((l) => l.text.slice(0, 160))))
cell("BF-3a task 22: the holder has no live window: NO letter of the watch to it, none to the author about 22 either", watchLetters("sesGONE", 22).length === 0 && lettersTo("sesGONE").length === 0 && !watchLetters("sesAUTH", 22).some((l) => !/стоят давно/.test(l.text)), J([lettersTo("sesGONE").length, watchLetters("sesAUTH", 22).map((l) => l.text.slice(0, 80))]))
await until(() => iw?.readSummary?.(P)?.ns?.includes(22))
const sum = iw?.readSummary?.(P)
cell("BF-3b it goes into ONE summary question of the project at once (the task is two hours old only)", J(sum?.ns) === J([22]) && !!sum?.question && !sum.question.decision, J(sum))
cell("BF-3c the author gets the summary letter once", lettersTo("sesAUTH").filter((l) => /^Шаг стоит давно/.test(l.text) && /022 «/.test(l.text)).length === 1, J(lettersTo("sesAUTH").map((l) => l.text.slice(0, 60))))
cell("BF-2a a reviewer that works a turn on task 31 is no excuse for task 30: the letter of the watch goes to it about 30", watchLetters("sesREV", 30).length >= 1 && /crew_step_note/.test(watchLetters("sesREV", 30)[0].text), J(lettersTo("sesREV").map((l) => l.text.slice(0, 80))))
cell("BF-2b and no letter about task 31, where the turn of its window goes", watchLetters("sesREV", 31).length === 0 && !iw?.readRecord?.(P, 31)?.ep, J([watchLetters("sesREV", 31).length, iw?.readRecord?.(P, 31)?.ep]))

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)
