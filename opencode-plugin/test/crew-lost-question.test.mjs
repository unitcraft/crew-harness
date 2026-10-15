// Self-test of the lost owner question (task 040; node >= 24):  node test/crew-lost-question.test.mjs
// An open record in forms/ with no question left in the window wakes the tab (at most 3 repeats, >= 2 min apart), then "no
// answer, the owner is needed"; form.replied closes, form.cancelled starts a repeat; a new turn of the tab closes the record;
// /ask lists the open questions; the notice repeats every 30 minutes and never answers for the owner.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-lostq-"))
process.env.XDG_DATA_HOME = tmp
const fw = await import("../form-wait.ts")
const core = await import("../core.ts")
const { statusOf, formatStatuses, sidebarLines, waitingLine, stuckText } = await import("../status.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const MIN = 60_000
const T0 = Date.UTC(2026, 9, 14, 9, 0, 0)
const created = (id, session, question = "Какой цвет?", options = ["Синий (Recommended)", "Красный"]) => ({ type: "form.created", data: { form: { id, sessionID: session, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", title: "Цвет", description: question, type: "string", options: options.map((label) => ({ label })) }] } } })

// the world seen by the tick: per session - tab open / busy, last idle row, owner word
const world = { tabs: {}, idle: {}, owner: {} }
const woken = []
const deps = (processStart) => ({
  processStart,
  tab: async (s) => world.tabs[s] ?? { open: true, busy: false },
  idle: async (s, since) => (world.idle[s] && world.idle[s].at > since ? world.idle[s] : undefined),
  ownerWrote: async (s, since) => (world.owner[s] ?? 0) > since,
  wake: (s, text, id) => woken.push({ s, text, id }),
  say: () => {},
})
const tick = async (now, processStart = T0 - 60 * MIN) => {
  if (!fw.formTick) throw new Error("formTick is not there yet")
  return fw.formTick(deps(processStart), now)
}
const left = (s) => fw.pendingForms(s, T0 + 5 * MIN)
const safe = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    cell(name, false, String(e.message ?? e))
  }
}

// (a) an open record, the question is gone from the window after a restart: a wake with the text and the options
await safe("a", async () => {
  fw.handleFormEvent(created("frm_a", "sesA"), T0)
  world.tabs.sesA = { open: true, busy: false }
  await tick(T0 + 10 * 1000) // the first look: not gone for long enough yet
  await tick(T0 + 1 * MIN) // 1 min: too early (the first repeat is not before 2 min)
  cell("a: too early, no wake", woken.length === 0, JSON.stringify(woken))
  await tick(T0 + 3 * MIN)
  const w = woken[0]
  cell("a: a wake with the question text and options", woken.length === 1 && w.s === "sesA" && w.text.includes("Какой цвет?") && w.text.includes("Синий (Recommended)") && w.text.includes("Красный") && /question/.test(w.text) && /заново/.test(w.text), JSON.stringify(woken))
  cell("a: the wake text is Russian and asks nobody to answer for the owner", /не отвечайте за владельца/i.test(w?.text ?? ""), w?.text)
  await tick(T0 + 3 * MIN + 5000)
  cell("a: idempotent, one wake per interval", woken.length === 1, String(woken.length))
  cell("a: still pending, counted", left("sesA")[0]?.repeats === 1, JSON.stringify(left("sesA")))
})

// the restart: a record older than the process, the windows get time to recover
await safe("a2", async () => {
  fw.handleFormEvent(created("frm_r", "sesR"), T0 - 30 * MIN)
  const of = (s) => woken.filter((x) => x.s === s)
  await tick(T0 + 20_000, T0 - 10_000) // the process started 30 s ago
  await tick(T0 + 20_000 + 30_000, T0 - 10_000)
  cell("a2: right after a restart nothing is woken", of("sesR").length === 0, JSON.stringify(of("sesR")))
  await tick(T0 + 5 * MIN, T0 - 10_000)
  cell("a2: after the grace period it is woken", of("sesR").length === 1, JSON.stringify(of("sesR")))
})

// a busy tab (the question may still be on the screen) is left alone
await safe("a3", async () => {
  fw.handleFormEvent(created("frm_b", "sesBusy"), T0)
  world.tabs.sesBusy = { open: true, busy: true }
  const of = () => woken.filter((x) => x.s === "sesBusy")
  for (let i = 1; i <= 6; i++) await tick(T0 + i * 3 * MIN)
  cell("a3: a busy tab is not woken", of().length === 0 && left("sesBusy").length === 1, JSON.stringify(of()))
  world.tabs.sesBusy = { open: false, busy: false }
  await tick(T0 + 30 * MIN)
  cell("a3: a closed tab is not woken either", of().length === 0, JSON.stringify(of()))
})

// (b) after 3 wakes: "no answer", no new ones
await safe("b", async () => {
  fw.handleFormEvent(created("frm_c", "sesC"), T0)
  const n = woken.filter((x) => x.s === "sesC").length
  let at = T0
  for (let i = 0; i < 12; i++) {
    at += 2 * MIN + 1000
    await tick(at)
  }
  const mine = woken.filter((x) => x.s === "sesC")
  const rec = fw.pendingForms("sesC", at)[0]
  cell("b: exactly 3 wakes", mine.length === n + 3 && rec?.repeats === 3, `${mine.length} ${JSON.stringify(rec)}`)
  cell("b: marked without answer", !!rec?.exhausted, JSON.stringify(rec))
  const s = statusOf({ card: { session: "sesC", project: "p", role: "integrator", title: "t" }, busy: false, asked: [], now: at, watches: [] })
  cell("b: the status says the owner is needed", s.state === "owner" && /без ответа, нужен владелец/.test(s.detail) && s.detail.includes("Какой цвет?"), JSON.stringify(s))
  const ids = mine.map((x) => x.id)
  cell("b: the three wakes have distinct ids", new Set(ids).size === ids.length, ids.join(","))
})

// (c) form.replied closes; form.cancelled starts a repeat
await safe("c", async () => {
  fw.handleFormEvent(created("frm_d", "sesD"), T0)
  fw.handleFormEvent({ type: "form.replied", data: { id: "frm_d", sessionID: "sesD" } })
  cell("c: replied closes the record", fw.pendingForms("sesD", T0).length === 0, JSON.stringify(fw.pendingForms("sesD", T0)))
  fw.handleFormEvent(created("frm_e", "sesE"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_e", sessionID: "sesE" } }, T0 + 1000)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_e", sessionID: "sesE" } }, T0 + 2000)
  const rec = fw.pendingForms("sesE", T0 + 5000)[0]
  cell("c: cancelled does not close, and is remembered once", !!rec && rec.cancelled === T0 + 1000, JSON.stringify(rec))
  const n = woken.filter((x) => x.s === "sesE").length
  await tick(T0 + 3 * MIN)
  await tick(T0 + 3 * MIN + 30_000)
  cell("c: cancelled starts a repeat", woken.filter((x) => x.s === "sesE").length === n + 1, JSON.stringify(woken.filter((x) => x.s === "sesE")))
  // the model asks again: a new form with the same text takes the record over, the count goes on (no endless loop)
  fw.handleFormEvent(created("frm_e2", "sesE"), T0 + 4 * MIN)
  const again = fw.pendingForms("sesE", T0 + 4 * MIN)
  cell("c: the repeated question replaces the record and keeps the count", again.length === 1 && again[0].id === "frm_e2" && again[0].repeats === 1 && !again[0].cancelled, JSON.stringify(again))
  // a question with another text is a separate record
  fw.handleFormEvent(created("frm_e3", "sesE", "Совсем другой вопрос?"), T0 + 5 * MIN)
  cell("c: another text is another record", fw.pendingForms("sesE", T0 + 5 * MIN).length === 2, JSON.stringify(fw.pendingForms("sesE", T0 + 5 * MIN)))
})

// (c2) the answer was given, the event was lost: the tab went idle with a successful turn
await safe("c2", async () => {
  fw.handleFormEvent(created("frm_f", "sesF"), T0)
  world.idle.sesF = { at: T0 + 5000, outcome: "succeeded" }
  await tick(T0 + 1 * MIN)
  await tick(T0 + 3 * MIN)
  cell("c2: idle after a succeeded turn closes the record without a wake", left("sesF").length === 0 && !woken.some((x) => x.s === "sesF"), JSON.stringify([left("sesF"), woken.filter((x) => x.s === "sesF")]))
  fw.handleFormEvent(created("frm_g", "sesG"), T0)
  world.idle.sesG = { at: T0 + 5000, outcome: "interrupted" }
  await tick(T0 + 1 * MIN)
  await tick(T0 + 3 * MIN)
  cell("c2: an interrupted turn is a lost question, woken", woken.some((x) => x.s === "sesG") && left("sesG").length === 1, JSON.stringify(woken))
})

// (d) a new turn of the tab closes the record
await safe("d", async () => {
  fw.handleFormEvent(created("frm_h", "sesH"), T0)
  if (!fw.settleOnRequest) throw new Error("settleOnRequest is not there yet")
  await fw.settleOnRequest("sesH", T0 + 1000, async () => false) // a model request one second later: too close, the question itself
  cell("d: a request right after the question does not close it", left("sesH").length === 1, JSON.stringify(left("sesH")))
  await fw.settleOnRequest("sesH", T0 + 2 * MIN, async () => false)
  cell("d: a new model request closes the record", left("sesH").length === 0, JSON.stringify(left("sesH")))
  const s = statusOf({ card: { session: "sesH", project: "p", role: "integrator", title: "t" }, busy: true, busySince: T0, asked: [], now: T0 + 3 * MIN, watches: [] })
  cell("d: no false waiting for the owner", s.state === "working", JSON.stringify(s))
  // a cancelled record: the request caused by the model's own next step does not close it, the owner's word does
  fw.handleFormEvent(created("frm_i", "sesI"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_i", sessionID: "sesI" } }, T0 + 1000)
  await fw.settleOnRequest("sesI", T0 + 2 * MIN, async () => false)
  cell("d: a cancelled record survives the model's own next step", left("sesI").length === 1, JSON.stringify(left("sesI")))
  await fw.settleOnRequest("sesI", T0 + 3 * MIN, async () => true)
  cell("d: a cancelled record is closed by the owner's word", left("sesI").length === 0, JSON.stringify(left("sesI")))
})

// (d2) the owner writes in the chat to a lost question: closed at a tick too
await safe("d2", async () => {
  fw.handleFormEvent(created("frm_j", "sesJ"), T0)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_j", sessionID: "sesJ" } }, T0 + 1000)
  world.owner.sesJ = T0 + 2000
  await tick(T0 + 3 * MIN)
  await tick(T0 + 4 * MIN)
  cell("d2: the owner wrote, the record is closed, no wake", left("sesJ").length === 0 && !woken.some((x) => x.s === "sesJ"), JSON.stringify([left("sesJ"), woken.filter((x) => x.s === "sesJ")]))
})

// (e0) never an automatic answer
await safe("e0", async () => {
  const src = readFileSync(new URL("../form-wait.ts", import.meta.url), "utf8")
  cell("e0: no code answers for the owner", !/session\.(prompt|synthetic)|form\.reply|\.reply\(/.test(src) && woken.length > 0 && woken.every((x) => /не отвечайте за владельца/i.test(x.text)), "found a reply call")
})

// (f) /ask: the open questions with project, tab, waiting time, text and options
await safe("f", async () => {
  mkdirSync(core.CARDS, { recursive: true })
  const card = (session, project, role, title) => writeFileSync(core.cardFile(session), JSON.stringify({ session, project, role, title, directory: tmp, repo: "r", auto: false, pid: process.pid, updated: Date.now() }))
  card("sesA", "nova", "integrator", "Интегратор")
  card("sesC", "crew-harness", "worker", "#40 вопрос")
  if (!fw.askText) throw new Error("askText is not there yet")
  const text = fw.askText(T0 + 70 * MIN)
  cell("f: the summary line", /^Ждут вас: \d+ · с \d\d:\d\d/.test(text), text.split("\n")[0])
  cell("f: project, tab, text and options of a question", text.includes("nova") && text.includes("Интегратор") && text.includes("Какой цвет?") && text.includes("Синий (Recommended)") && text.includes("Красный"), text)
  cell("f: how long it waits", /ждёт 7\d мин|ждёт 1 ч/.test(text), text)
  cell("f: the question without an answer is told apart", /без ответа, нужен владелец/.test(text), text)
  // task 055: a tab whose turn ended with a question waits for the owner too - /ask names it in full
  const ended = { session: "sesEnd", project: "claude-limits", role: "worker", title: "#33 исп лимиты", state: "owner", since: T0 + 60 * MIN, question: "Продолжать #31 или переключиться на #33?" }
  const both = fw.askText(T0 + 70 * MIN, undefined, [ended])
  cell("f: /ask lists a question at the end of a turn with its project, tab and text", both.includes("claude-limits · worker «#33 исп лимиты»") && both.includes("Продолжать #31 или переключиться на #33?") && /ждёт 10 мин/.test(both), both)
  cell("f: every waiting tab in /ask is marked ? (task 055)", both.split("\n").filter((l) => /^\S/.test(l) && !/^Ждут вас/.test(l)).every((l) => l.startsWith("? ")) && !/^▶/m.test(both), both)
  // task 056: a turn that ended with a waiting phrase is not called a question in /ask and is marked as a wait
  const waits = { ...ended, session: "sesWait", title: "#34 исп", wait: true, question: "Жду вашего решения по плану." }
  const ww = fw.askText(T0 + 70 * MIN, undefined, [waits])
  const head = ww.split("\n").find((l) => l.includes("«#34 исп»")) ?? ""
  cell("f: /ask marks a waiting phrase as a wait, not ? (task 056)", !!head && !head.startsWith("? ") && !head.startsWith("▶") && ww.includes("Жду вашего решения по плану.") && /указаний/.test(ww) && !/кончился вопросом/.test(ww), ww)
  cell("f: /ask counts it in the summary line", Number(/^Ждут вас: (\d+)/.exec(both)?.[1]) === Number(/^Ждут вас: (\d+)/.exec(text)?.[1]) + 1, both.split("\n")[0])
  cell("f: nothing open says so", fw.askText(T0 + 70 * MIN, path.join(tmp, "empty-forms")).includes("нет"), "")
})

// the summary line in every window
await safe("g", async () => {
  const st = (session, state, since, project = "nova") => ({ session, project, role: "integrator", title: session, state, since, detail: "x", question: "q", watches: [], asked: [], tasks: [], updated: 0 })
  const list = [st("s1", "owner", T0 + 10 * MIN), st("s2", "owner", T0 + 5 * MIN, "crew-harness"), st("s3", "working", T0)]
  const line = waitingLine(list, T0 + 20 * MIN)
  const hmOf = (t) => new Date(t).toTimeString().slice(0, 5)
  cell("g: waitingLine names the time and the project of the oldest wait", line === `Ждут вас: 2 · с ${hmOf(T0 + 5 * MIN)} · crew-harness`, String(line))
  cell("g: a task tab is named by its number and role", waitingLine([{ ...st("s9", "owner", T0), title: "#85 исп ✓◐ приёмка Accept" }], T0) === `Ждут вас: 1 · с ${hmOf(T0)} · nova #85 исп`, String(waitingLine([{ ...st("s9", "owner", T0), title: "#85 исп ✓◐ приёмка Accept" }], T0)))
  cell("g: a stuck mark without a time has no question mark", stuckText({ what: "приёмка #85" }) === "застряла: приёмка #85" && !sidebarLines([{ ...st("s4", "working", T0), stuck: [{ what: "приёмка #85" }] }], T0, "nova").rows.some((r) => /\?/.test(r.what)), JSON.stringify(sidebarLines([{ ...st("s4", "working", T0), stuck: [{ what: "приёмка #85" }] }], T0, "nova").rows))
  cell("g: nothing waits, no line", waitingLine([st("s3", "working", T0)], T0) === undefined, "")
  cell("g: /crew starts with the line", formatStatuses(list, T0 + 20 * MIN).split("\n")[0] === line, formatStatuses(list, T0 + 20 * MIN).split("\n")[0])
  const side = sidebarLines(list, T0 + 20 * MIN, "nova")
  cell("g: the side panel has the count and the time, for all projects", side.rows[0]?.what === `Ждут вас: 2 · с ${hmOf(T0 + 5 * MIN)}` && side.rows[1]?.what === "? crew-harness интегр." && side.rows[2]?.what === "  ↳ q", JSON.stringify(side.rows.slice(0, 3)))
})

// (h) the notice: at the first sight, then every 30 minutes, not more often
await safe("h", async () => {
  if (!fw.formReminders) throw new Error("formReminders is not there yet")
  fw.handleFormEvent(created("frm_k", "sesK"), T0)
  const sent = []
  let now = T0 + 1000
  const notify = (session, f, text) => (sent.push({ session, at: now, text }), true)
  const run = () => fw.formReminders(now, notify)
  const only = () => sent.filter((x) => x.session === "sesK")
  run()
  cell("h: a notice at the first sight", only().length === 1 && only()[0].text.includes("Какой цвет?"), JSON.stringify(sent))
  for (const m of [5, 10, 20, 29]) {
    now = T0 + m * MIN
    run()
  }
  cell("h: nothing within 30 minutes", only().length === 1, String(only().length))
  now = T0 + 31 * MIN + 1000
  run()
  cell("h: a repeat after 30 minutes", only().length === 2, String(only().length))
  now = T0 + 45 * MIN
  run()
  cell("h: not more often", only().length === 2, String(only().length))
  now = T0 + 62 * MIN
  run()
  cell("h: and again after 30 more", only().length === 3, String(only().length))
  // no window to show it in: not counted as shown
  fw.handleFormEvent(created("frm_l", "sesL"), T0)
  const none = []
  fw.formReminders(T0 + 1000, (s) => (none.push(s), false))
  fw.formReminders(T0 + 2000, (s) => (none.push(s), true))
  cell("h: a notice that reached nobody is tried again", none.filter((s) => s === "sesL").length === 2, JSON.stringify(none))
})

// (i) the system notification of Windows: no dependencies, the text goes through the environment, never into the command line
await safe("i", async () => {
  const { systemToast } = await import("../toast-win.ts")
  const calls = []
  const fake = (cmd, args, opts) => (calls.push({ cmd, args, opts }), { stderr: { on() {} }, on() {}, unref() {} })
  const ok = systemToast("Заголовок \"x\"", "Текст <b>вопроса</b> & 'ещё'", () => {}, fake)
  if (process.platform !== "win32") return cell("i: not Windows, nothing started", ok === false && calls.length === 0, String(ok))
  const c = calls[0]
  cell("i: built-in powershell, hidden, detached", ok && c.cmd === "powershell.exe" && c.opts.windowsHide && c.opts.detached && c.args.includes("-NoProfile"), JSON.stringify(c))
  cell("i: the owner's text is in the environment, not in the command line", c.opts.env.CREW_TOAST_MESSAGE.includes("вопроса") && !c.args.join(" ").includes("вопроса") && /Escape/.test(c.args.join(" ")), c.args.join(" ").slice(0, 200))
})

process.exit(fail ? 1 : 0)
