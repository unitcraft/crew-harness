// Self-test of task 069, "Esc in a plugin window keeps the question under it" (node >= 24):  node test/crew-esc-question.test.mjs
// Source: the owner opened a window of the plugin (/crew-sets use ...), a question of the built-in questionnaire arrived while
// the window was open, the owner pressed Esc to close the window - and the question was cancelled ("The user dismissed this
// question"). Read from the OpenCode 2.0.26 build: a key goes to ONE handler, the one of the current keyboard mode (the last
// pushed one). The dialog stack pushes the mode "modal" when it gets its first dialog, the questionnaire pushes "form" when it is
// drawn; a question that arrives AFTER the window takes the keyboard (Esc cancels it, Enter answers it with the first option),
// and the window cannot be closed by its own keys until the question is gone. A question that was open BEFORE the window is fine
// (the window is later, "modal" is on top).
//   part 1: the window of the plugin never stays open when the keyboard is taken by another mode - it closes at once, and the
//           question keeps its place; a window that is not hijacked stays;
//   part 2: a question cancelled without an answer is returned to the tab in seconds, not in 20 s.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-esc-question-"))
process.env.TEMP = tmp // the plugin log lives in os.tmpdir()
process.env.TMP = tmp
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdgcfg")
process.env.CREW_HARNESS_NO_SIDEBAR = "1" // no panels, no text dialog (jsx): the window uses dialog.alert like under Node
process.env.CREW_HARNESS_NO_WORKER = "1"
process.env.CREW_HARNESS_DIALOG_GUARD_MS = "20" // the look of the guard and the time the stack of dialogs needs to push its mode
process.env.CREW_HARNESS_DIALOG_GRACE_MS = "120"
process.env.CREW_HARNESS_FORM_GONE_MS = "20000"
process.env.CREW_HARNESS_FORM_CANCEL_GONE_MS = "3000"

const Tui = await import("../tui.ts")
const core = await import("../core.ts")
const fw = await import("../form-wait.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Task 088: a pause before a check that something HAPPENED (the window opened, the guard closed it) is a condition awaited up to 60 s;
// the pauses that stand for "nothing happens" (an untouched window is not closed, a new question is left alone) stay as they were.
const until = async (cond, ms = 60_000) => {
  for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await sleep(20)
}

const session = "ses_esc_demo"
mkdirSync(path.dirname(core.cardFile(session)), { recursive: true })
writeFileSync(core.cardFile(session), JSON.stringify({ session, directory: tmp, role: "worker", project: "escproj", repo: "r", pid: process.pid, updated: Date.now() }))

// a window of OpenCode 2.0.26, cut down to what matters here. The dialog stack: show() = replace() (the old dialog gets its
// onClose, a new one takes the place; the first dialog pushes the mode "modal"); clear() = every onClose, the mode goes.
// The questionnaire pushes the mode "form" when it is drawn and takes it off when the question is answered or cancelled. The mode
// is the LAST pushed entry. A key goes to the handler of the current mode only: "form" - cancels the question, "modal" - closes
// the dialog on top, otherwise nothing. alert / confirm / prompt / select of the plugin API go through this object's own show().
const mkWindow = () => {
  const w = { stack: [], modes: [], toasts: [], cleared: 0, question: undefined, cmds: [], script: [] }
  const push = (name) => {
    const e = { name }
    w.modes.push(e)
    return () => void (w.modes = w.modes.filter((x) => x !== e))
  }
  let offModal
  const dialog = {
    show(render, onClose) {
      const was = w.stack.length
      for (const p of w.stack) p.onClose?.()
      w.stack = [{ render, onClose }]
      if (!was) offModal = push("modal")
    },
    clear() {
      w.cleared++
      for (const p of w.stack) p.onClose?.()
      w.stack = []
      offModal?.()
      offModal = undefined
    },
    set() {},
    alert(o) {
      return new Promise((resolve) => {
        w.shown = o
        dialog.show(() => null, () => resolve())
      })
    },
    select(o) {
      return new Promise((resolve) => {
        w.asked = o
        dialog.show(() => null, () => resolve(undefined))
      })
    },
    prompt(o) {
      return new Promise((resolve) => {
        w.asked = o
        dialog.show(() => null, () => resolve(undefined))
      })
    },
  }
  w.dialog = dialog
  w.api = {
    ui: {
      router: { current: () => ({ type: "session", sessionID: session }) },
      tabs: { list: () => [] },
      toast: { show: (t) => w.toasts.push(t) },
      dialog,
    },
    keymap: { layer: (f) => (w.cmds = f().commands), mode: { current: () => w.modes.at(-1)?.name ?? "base", push } },
  }
  // the questionnaire arrives: the form takes the keyboard
  w.ask = () => {
    w.question = { cancelled: false, answered: false, off: push("form") }
  }
  // a key: one handler, the one of the current mode
  w.key = (name) => {
    const mode = w.modes.at(-1)?.name ?? "base"
    if (mode === "form" && w.question) {
      if (name === "escape") (w.question.cancelled = true), w.question.off()
      if (name === "return") (w.question.answered = true), w.question.off()
    } else if (mode === "modal" && (name === "escape" || name === "return")) dialog.clear()
    return mode
  }
  return w
}
const run = (w, slash) => w.cmds.find((x) => x.slash?.name === slash).run()
const open = (w) => w.stack.length > 0

// ---- part 1: the window of the plugin and a question that arrives under it ---------------------------------------------------

{
  // the question first, the window later: the window is on top, Esc closes it, the question stays (it was never in danger)
  const w = mkWindow()
  const stop = Tui.default.setup(w.api)
  w.ask()
  void run(w, "crew-help")
  await until(() => open(w))
  const mode = w.key("escape")
  cell("question first, window later: Esc closes the window and the question stays open", mode === "modal" && !open(w) && w.question.cancelled === false && w.question.answered === false, JSON.stringify({ mode, open: open(w), q: w.question.cancelled }))
  stop()
}

{
  // the window first, the question arrives under it (the source of the task): the window closes itself, the question is not touched
  const w = mkWindow()
  const stop = Tui.default.setup(w.api)
  void run(w, "crew-help")
  await until(() => open(w) && w.modes.at(-1)?.name === "modal")
  cell("the window is open and the keyboard is the window's", open(w) && w.modes.at(-1)?.name === "modal", JSON.stringify(w.modes))
  w.ask()
  await until(() => !open(w) && w.toasts.length >= 1)
  cell("a question arrives under the window: the window is closed by the plugin, at once", !open(w), JSON.stringify({ stack: w.stack.length, modes: w.modes.map((m) => m.name) }))
  cell("the question is not cancelled and not answered by that; it holds the keyboard and is on the screen", w.question.cancelled === false && w.question.answered === false && w.modes.at(-1)?.name === "form", JSON.stringify({ q: w.question, modes: w.modes.map((m) => m.name) }))
  cell("the owner is told why the window went (a notice in the window)", w.toasts.length === 1 && /вопрос/i.test(`${w.toasts[0].title ?? ""} ${w.toasts[0].message ?? ""}`), JSON.stringify(w.toasts))
  // the owner's Esc after that is meant for the question that he now sees - not the lost one of the source
  stop()
}

{
  // a menu of the plugin (dialog.select) and a question under it: the same, and the menu's promise ends (the command does not hang)
  const w = mkWindow()
  const stop = Tui.default.setup(w.api)
  let ended = false
  const done = Promise.resolve(run(w, "crew-sets")).then(() => (ended = true))
  await until(() => open(w) && !!w.asked)
  cell("the menu /crew-sets is open (dialog.select)", open(w) && !!w.asked, JSON.stringify(w.asked))
  w.ask()
  await until(() => !open(w))
  await Promise.race([done, sleep(60_000)])
  cell("a question under the menu: the menu is closed, its command ends, the question is whole", !open(w) && ended && w.question.cancelled === false && w.question.answered === false, JSON.stringify({ open: open(w), ended, q: w.question }))
  stop()
}

{
  // the window that is not hijacked stays open as long as the owner reads, however long
  const w = mkWindow()
  const stop = Tui.default.setup(w.api)
  void run(w, "crew-help")
  await sleep(700)
  cell("an untouched window is not closed by the guard (no false alarm)", open(w) && w.cleared === 0, JSON.stringify({ open: open(w), cleared: w.cleared }))
  w.key("escape")
  await sleep(100)
  w.ask() // a question after the window was closed by the owner: not our business
  await sleep(300)
  cell("after the window is closed the guard is off: a new question is left alone", w.cleared === 1 && w.question.cancelled === false && w.modes.at(-1)?.name === "form", JSON.stringify({ cleared: w.cleared, q: w.question }))
  stop()
}

{
  // "Загрузка…" and then the answer: the second show() replaces the first; the guard follows the new window
  const w = mkWindow()
  const stop = Tui.default.setup(w.api)
  void run(w, "crew-help")
  await until(() => open(w))
  const first = w.stack[0]
  w.dialog.show(() => null, () => {}) // a second window instead of the first (as showText(title, "Загрузка…") -> showText(title, text))
  await sleep(60)
  cell("a replaced window: still one dialog and still guarded", w.stack.length === 1 && w.stack[0] !== first, JSON.stringify(w.stack.length))
  w.ask()
  await until(() => !open(w))
  cell("a question under the replaced window: it closes too", !open(w) && w.question.cancelled === false, JSON.stringify({ open: open(w), q: w.question }))
  stop()
}

{
  // a window of an older build without modes, or no API of the dialog: nothing breaks
  const w = mkWindow()
  delete w.api.keymap.mode
  const stop = Tui.default.setup(w.api)
  void run(w, "crew-help")
  await until(() => open(w))
  await sleep(300) // and it stays
  cell("no keyboard modes in the API: the window opens and stays, nothing throws", open(w), "")
  // the model of the window reproduces the source when nothing guards the window: the question arrives, the owner presses Esc to
  // close the window - the key goes to the question, the question is cancelled, the window is still there
  w.ask()
  const mode = w.key("escape")
  cell("model check, no guard: the owner's Esc cancels the question that arrived under the window, the window stays", mode === "form" && w.question.cancelled === true && open(w), JSON.stringify({ mode, q: w.question, open: open(w) }))
  stop()
  let threw = false
  try {
    Tui.default.setup({ ui: { router: { current: () => ({}) }, tabs: { list: () => [] }, toast: { show: () => {} }, dialog: { alert: () => {} } }, keymap: { layer: () => {} } })()
  } catch {
    threw = true
  }
  cell("a dialog API without show(): setup does not throw", !threw, "")
}

// ---- part 2: a cancelled question is returned to the tab in seconds ---------------------------------------------------------

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 17, 1, 12, 0)
const formsDir = path.join(tmp, "forms")
const created = (id, sid) => ({ type: "form.created", data: { form: { id, sessionID: sid, title: "Questions", metadata: { kind: "question" }, fields: [{ key: "q0", title: "Как поступить?", description: "Отдельная ветвь или откладывать?", type: "string", options: [{ label: "Ветвь (Recommended)" }, { label: "Отложить" }] }] } } })
const woken = []
const world = { tabs: {}, owner: {} }
const deps = {
  processStart: T0 - 60 * MIN,
  tab: async (s) => world.tabs[s] ?? { open: true, busy: false },
  idle: async () => undefined,
  ownerWrote: async (s, since) => (world.owner[s] ?? 0) > since,
  wake: (s, text, id) => woken.push({ s, text, id }),
  say: () => {},
}
{
  fw.handleFormEvent(created("frm_x", "sesX"), T0, formsDir)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_x", sessionID: "sesX" } }, T0 + 1000, formsDir)
  await fw.formTick(deps, T0 + 2000, formsDir) // the first look after the turn ended
  await fw.formTick(deps, T0 + 4000, formsDir)
  cell("cancelled without an answer: no wake before the short wait (3 s)", woken.length === 0, JSON.stringify(woken))
  await fw.formTick(deps, T0 + 6000, formsDir)
  cell("cancelled without an answer: the tab is asked to ask again within seconds (not 20 s)", woken.length === 1 && woken[0].s === "sesX" && /заново/.test(woken[0].text) && woken[0].text.includes("Отдельная ветвь"), JSON.stringify(woken))
  cell("the owner is not answered for: the text forbids choosing, the options are listed", /не отвечайте за владельца/i.test(woken[0]?.text ?? "") && woken[0].text.includes("Ветвь (Recommended)"), woken[0]?.text)
}
{
  // a busy tab (the turn is still finishing) is not woken, however long; the owner's word closes the record
  fw.handleFormEvent(created("frm_y", "sesY"), T0, formsDir)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_y", sessionID: "sesY" } }, T0 + 1000, formsDir)
  world.tabs.sesY = { open: true, busy: true }
  const n = woken.length
  await fw.formTick(deps, T0 + 2000, formsDir)
  await fw.formTick(deps, T0 + 9000, formsDir)
  cell("a busy tab is not woken", woken.length === n, JSON.stringify(woken.slice(n)))
  world.tabs.sesY = { open: true, busy: false }
  world.owner.sesY = T0 + 10_000
  await fw.formTick(deps, T0 + 11_000, formsDir)
  await fw.formTick(deps, T0 + 16_000, formsDir)
  cell("the owner wrote in the tab: the record is closed, no wake", woken.length === n && fw.pendingForms("sesY", T0 + 17_000, formsDir).length === 0, JSON.stringify([woken.slice(n), fw.pendingForms("sesY", T0 + 17_000, formsDir)]))
}
{
  // a question lost in another way (restart, no event) keeps the old, long wait: only an explicit Esc is hurried
  fw.handleFormEvent(created("frm_z", "sesZ"), T0, formsDir)
  const mine = () => woken.filter((x) => x.s === "sesZ")
  await fw.formTick(deps, T0 + 2000, formsDir)
  await fw.formTick(deps, T0 + 8000, formsDir)
  cell("a lost question that was not cancelled waits the long time as before", mine().length === 0, JSON.stringify(mine()))
  await fw.formTick(deps, T0 + 25_000, formsDir)
  await fw.formTick(deps, T0 + 3 * MIN, formsDir)
  cell("... and is woken after it", mine().length === 1, JSON.stringify(mine()))
}
{
  // the service looks every second while an Esc-cancelled question is waiting to be returned, otherwise every 5 s as before
  const n = 5_000
  fw.handleFormEvent(created("frm_h", "sesH"), T0, formsDir)
  const cold = fw.formLookEvery?.(T0 + 500, formsDir, n)
  fw.handleFormEvent({ type: "form.cancelled", data: { id: "frm_h", sessionID: "sesH" } }, T0 + 1000, formsDir)
  const hot = fw.formLookEvery?.(T0 + 1500, formsDir, n)
  cell("the look of the service: 5 s with an open question, 1 s once a question was cancelled and is not yet returned", cold === n && hot === 1000, JSON.stringify({ cold, hot }))
}

process.exit(fail ? 1 : 0)
