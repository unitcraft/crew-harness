// Self-test of task 161: the watch of idle tasks - the term of a step, the ladder (letter -> answer -> second letter -> question to the
// owner), the exceptions, the store in files (node >= 24):  node test/crew-idle-watch.test.mjs
// W-1 settings: step_term_minutes (30), step_term_by_step, step_extend_minutes (30), step_answer_minutes (15). W-2 the step of a task and
// its start (stepAt): a change of status, a word of the holder and an answer of the owner move it; the noise of the plugin and `updated`
// do not. W-3 the term by the role of the step. W-4 the holder of the step. W-5 the ladder on fake dependencies: a letter that asks for an
// answer by the tool, the answer extends the term once by 30 minutes, the second letter, the question to the owner with options, a
// recommendation and an argument, at most two letters, no repeat after the answer. W-6 the exceptions (a turn of the holder, a question
// to the owner, HOLD/STOP by the word of the owner, an outside run with a ceiling) - none of them is an alarm. W-7 the store: the term and
// the letters live in a file, a "restart" (a fresh call on the same files) repeats nothing. W-8 the case of task 092: running, the
// window of the author busy with other work, the step did not change for two hours -> a letter that asks for an answer, then a question.
// W-9 the rows for /crew, the panel and crew_doctor.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idle-watch-"))
process.env.XDG_DATA_HOME = tmp
let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
const tryImport = (p) => import(p).catch((e) => (console.log(`import ${p}: ${String(e).split("\n")[0]}`), null))

const core = await import("../core.ts")
const schema = await import("../config-schema.ts")
const iw = await tryImport("../idle-watch.ts")
const gate = await import("../queue-gate.ts")

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const PLUGIN = core.PLUGIN_SENDER
const mkTask = (n, status, extra = {}) => ({
  project: "p", n, title: `задача ${n}`, slug: `t${n}`, goal: "цель", priority: "P2", tier: "medium", role: "worker", author: "sesAUTHOR", author_role: "integrator",
  qid: `q${n}`, status, kind: "spawn", executors: [], attempt: 1, directory: tmp, history: [{ at: NOW - 3 * 60 * MIN, by: "sesAUTHOR", status, note: "поставлена" }],
  created: NOW - 3 * 60 * MIN, updated: NOW - 3 * 60 * MIN, ...extra,
})
const cfg30 = { termMin: 30, byStep: {}, extendMin: 30, answerMin: 15 }

// ---- W-1 the settings
{
  const keys = ["step_term_minutes", "step_term_by_step", "step_extend_minutes", "step_answer_minutes"]
  const ks = keys.map((k) => schema.SCHEMA.find((x) => x.key === k))
  cell("W-1a the schema has the four keys of the watch, group Подталкивание", ks.every((k) => k && k.group === "Подталкивание"), J(ks.map((k) => k?.key)))
  cell("W-1b step_term_minutes: int, default 30; 0 switches the watch off", ks[0]?.kind?.type === "int" && ks[0].default === 30 && /0 — не/.test(ks[0].question ?? ""), J(ks[0]))
  cell("W-1c step_extend_minutes 30 and step_answer_minutes 15; step_term_by_step is a map of numbers", ks[2]?.default === 30 && ks[3]?.default === 15 && ks[1]?.kind?.type === "intMap", J(ks.slice(1)))
  const dir = path.join(tmp, "cfgproj")
  mkdirSync(path.join(dir, ".opencode"), { recursive: true })
  writeFileSync(path.join(dir, ".opencode", "crew-harness.json"), JSON.stringify({ step_term_minutes: 45, step_term_by_step: { review: 90 }, step_extend_minutes: 20, step_answer_minutes: 5 }))
  const d = core.loadConfig(path.join(tmp, "nowhere"))
  const p = core.loadConfig(dir)
  cell("W-1d loadConfig: defaults 30 / 30 / 15 and the values of the project", d.stepTermMin === 30 && d.stepExtendMin === 30 && d.stepAnswerMin === 15 && p.stepTermMin === 45 && p.stepTermByStep?.review === 90 && p.stepExtendMin === 20 && p.stepAnswerMin === 5, J([d.stepTermMin, d.stepExtendMin, d.stepAnswerMin, p.stepTermMin, p.stepTermByStep, p.stepExtendMin, p.stepAnswerMin]))
}

// ---- W-2 the step of a task and its start
{
  const st = (t) => iw?.stepOf?.(t)
  const roles = [["starting", "start"], ["running", "work"], ["rework", "work"], ["submitted", "review"], ["reviewing", "review"], ["approval", "plan"], ["accepted", "cleanup"], ["idle", "between"]]
  cell("W-2a the role of the step by the status", roles.every(([s, r]) => st(mkTask(1, s, { executor: "sesX" }))?.role === r), J(roles.map(([s]) => st(mkTask(1, s))?.role)))
  cell("W-2b done, cancelled, backlog and external tasks have no step", ["done", "cancelled", "backlog"].every((s) => st(mkTask(1, s)) === undefined) && st(mkTask(1, "running", { kind: "external" })) === undefined, "")
  const ord = st(mkTask(2, "running", { kind: "order", order_to: "other" }))
  cell("W-2c an order nobody took is the step «order»; a taken one (child) has none", ord?.role === "order" && st(mkTask(2, "running", { kind: "order", order_to: "other", child: { project: "other", n: 3 } })) === undefined, J(ord))
  const base = mkTask(3, "running", { executor: "sesX" })
  const t0 = st(base)?.at
  cell("W-2d the start of the step is the last change of the status; `updated` does not move it", t0 === NOW - 3 * 60 * MIN && st({ ...base, updated: NOW })?.at === t0, J([t0, st({ ...base, updated: NOW })?.at]))
  const noisy = { ...base, history: [...base.history, { at: NOW - 10 * MIN, by: PLUGIN, note: "приёмка застряла: 3 хода подряд" }, { at: NOW - 9 * MIN, by: "sesAUTHOR", note: "подталкивание приёмщика" }] }
  cell("W-2e the notes of the plugin («застряла») and the pushes of the author do not move the step", st(noisy)?.at === t0, J(st(noisy)))
  const word = { ...base, history: [...base.history, { at: NOW - 40 * MIN, by: "sesX", note: "сделал половину, жду сборку" }] }
  cell("W-2f a word of the holder (a note of a session) moves the step", st(word)?.at === NOW - 40 * MIN, J(st(word)))
  const owner = { ...base, history: [...base.history, { at: NOW - 20 * MIN, by: PLUGIN, note: "ответ владельца через оркестратора на вопрос «как быть»" }] }
  cell("W-2g an answer of the owner recorded by the plugin moves the step", st(owner)?.at === NOW - 20 * MIN, J(st(owner)))
  const chk = { ...base, status: "reviewing", reviewer: "sesR", checking: { step: "a", at: NOW - 12 * MIN }, history: [...base.history, { at: NOW - 50 * MIN, by: PLUGIN, status: "reviewing" }] }
  cell("W-2h the check of a step of the acceptance (checking.at) moves the step", st(chk)?.at === NOW - 12 * MIN, J(st(chk)))
  cell("W-2i the key of the step changes with the status and with the start", st(base)?.key !== st({ ...base, status: "submitted" })?.key && st(base)?.key !== st(word)?.key, J([st(base)?.key, st(word)?.key]))
}

// ---- W-3 the term
{
  const c = { termMin: 30, byStep: { review: 90 }, extendMin: 30, answerMin: 15 }
  cell("W-3a the term is 30 minutes by default, the value of the role of the step wins, 0 switches it off", iw?.termMs?.("work", c) === 30 * MIN && iw?.termMs?.("review", c) === 90 * MIN && iw?.termMs?.("work", { ...c, termMin: 0 }) === 0, J([iw?.termMs?.("work", c), iw?.termMs?.("review", c)]))
}

// ---- W-4 the holder
{
  const h = (t, a) => iw?.holderOf?.(t, a)
  cell("W-4a work: the executor; no executor: the author", h(mkTask(4, "running", { executor: "sesX" }))?.session === "sesX" && h(mkTask(4, "running"))?.session === "sesAUTHOR", J([h(mkTask(4, "running", { executor: "sesX" })), h(mkTask(4, "running"))]))
  cell("W-4b review: the reviewer; none: the author", h(mkTask(4, "reviewing", { reviewer: "sesR" }))?.session === "sesR" && h(mkTask(4, "submitted"))?.session === "sesAUTHOR", "")
  cell("W-4c between sessions and plan: the author", h(mkTask(4, "idle"))?.session === "sesAUTHOR" && h(mkTask(4, "approval"))?.session === "sesAUTHOR", "")
  cell("W-4d an order: the integrator of the addressee when it has a window, else the author", h(mkTask(4, "running", { kind: "order", order_to: "other" }), "sesOTHERINT")?.session === "sesOTHERINT" && h(mkTask(4, "running", { kind: "order", order_to: "other" }), undefined)?.session === "sesAUTHOR", "")
}

// ---- W-5 the ladder
const mkDeps = (o = {}) => {
  const out = { letters: [], notices: [], notes: [] }
  const d = {
    dir: o.dir ?? path.join(tmp, `store-${Math.random().toString(36).slice(2)}`),
    cfg: () => ({ ...cfg30, ...(o.cfg ?? {}) }),
    addressee: () => undefined,
    turnGoing: o.turnGoing ?? (() => false),
    formOpen: o.formOpen ?? (() => false),
    externalRun: o.externalRun ?? (() => false),
    ownerHolds: o.ownerHolds,
    letter: (to, id, text, kind) => out.letters.push({ to, id, text, kind }),
    notice: (title, message) => out.notices.push({ title, message }),
    taskNote: (t, text) => out.notes.push(text),
    say: () => {},
  }
  return { d, out }
}
const tick = (tasks, d, at) => iw?.watchTick?.(tasks, d, at)
const note = (input, me, d, task, at) => iw?.noteStep?.(input, me, { dir: d.dir, cfg: d.cfg, task: () => task, tasks: () => [task], taskNote: d.taskNote }, at)
{
  const t = mkTask(5, "running", { executor: "sesX", history: [{ at: NOW - 100 * MIN, by: "sesAUTHOR", status: "running", note: "поставлена" }] })
  const { d, out } = mkDeps()
  tick([t], d, NOW - 75 * MIN) // 25 minutes into the step: the term is 30
  cell("W-5a before the term nothing goes", out.letters.length === 0 && out.notices.length === 0, J(out))
  tick([t], d, NOW - 69 * MIN) // 31 minutes
  const l1 = out.letters[0]
  cell("W-5b past the term: ONE letter to the holder that asks for an answer by crew_step_note (reason and minutes, or done)", out.letters.length === 1 && l1.to === "sesX" && l1.kind === "ask" && /crew_step_note/.test(l1.text) && /reason/.test(l1.text) && /done/.test(l1.text) && /^Шаг стоит 31 мин, срок вышел:/.test(l1.text), J(out.letters))
  tick([t], d, NOW - 68 * MIN)
  tick([t], d, NOW - 66 * MIN)
  cell("W-5c the same step does not get a second letter while the answer is awaited", out.letters.length === 1 && out.notices.length === 0, J(out.letters.length))
  cell("W-5d the letter is a service letter of the kind idle (the gate of the queue knows it by the id and by the text)", gate.serviceKindOf({ id: l1?.id, from_session: PLUGIN }) === "idle" && gate.kindsOfTexts([`⚙  12:00 · crew → x (служебное, не отвечай)\n${l1.text}`]).includes("idle"), J([l1?.id]))
  const r = note({ n: 5, reason: "жду сборку на CI, она идёт", minutes: 30 }, { session: "sesX", project: "p" }, d, t, NOW - 65 * MIN)
  const rec = iw?.readRecord?.("p", 5, d.dir)
  cell("W-5e the answer extends the term by 30 minutes and is recorded (reason, who, when)", r?.ok === true && rec?.ep?.answers?.length === 1 && rec.ep.answers[0].reason === "жду сборку на CI, она идёт" && rec.ep.due === NOW - 65 * MIN + 30 * MIN, J([r, rec?.ep]))
  tick([t], d, NOW - 50 * MIN)
  cell("W-5f within the extension nothing goes: no question, no second letter", out.letters.length === 1 && out.notices.length === 0, J(out.letters.length))
  tick([t], d, NOW - 34 * MIN) // the extension is over
  cell("W-5g the extension is over: the second letter (the last one), still no question", out.letters.length === 2 && out.letters[1].kind === "ask" && out.letters[1].id !== l1.id && out.notices.length === 0, J(out.letters.map((x) => x.id)))
  tick([t], d, NOW - 17 * MIN) // 17 minutes without an answer to the second letter
  const q = out.letters.find((x) => x.kind === "question")
  const recq = iw?.readRecord?.("p", 5, d.dir)
  cell("W-5h no answer for 15 minutes: the question to the owner opens, the author gets its text, the windows get a notice", !!q && q.to === "sesAUTHOR" && out.notices.length === 1 && !!recq?.ep?.question && /question/.test(q.text), J([out.letters.map((x) => [x.to, x.kind]), out.notices]))
  const qq = recq?.ep?.question
  cell("W-5i the question has the four options (wait, narrow, reassign, cancel), a recommendation and an argument from the records", J(qq?.options?.map((o) => o.id)) === J(["wait", "narrow", "reassign", "cancel"]) && ["wait", "narrow", "reassign", "cancel"].includes(qq?.recommend) && (qq?.why ?? "").length > 20 && /sesX|исполнител/.test(qq?.why ?? ""), J(qq))
  cell("W-5j the text for the author names the task, the options, the recommendation and how to write the decision down", /задач\S* 005/.test(q?.text ?? "") && /Ждать ещё/.test(q?.text ?? "") && /Сузить/.test(q?.text ?? "") && /Сменить исполнителя/.test(q?.text ?? "") && /Отказаться/.test(q?.text ?? "") && /Recommended|рекомендац/i.test(q?.text ?? "") && /decide/.test(q?.text ?? ""), q?.text)
  tick([t], d, NOW - 5 * MIN)
  tick([t], d, NOW)
  cell("W-5k at most two letters and one question: nothing more goes while the question is open", out.letters.filter((x) => x.kind === "ask").length === 2 && out.letters.filter((x) => x.kind === "question").length === 1 && out.notices.length === 1, J(out.letters.map((x) => x.kind)))
  const bad = note({ n: 5, decide: "wait", who: "владелец, 2026-10-24" }, { session: "sesX", project: "p" }, d, t, NOW)
  const noWho = note({ n: 5, decide: "wait" }, { session: "sesAUTHOR", project: "p" }, d, t, NOW)
  cell("W-5l the decision is written only by the author and only with the word of the owner (who)", bad?.ok === false && noWho?.ok === false && /who/.test(noWho?.text ?? "") && iw?.readRecord?.("p", 5, d.dir)?.ep?.question?.decision === undefined, J([bad, noWho]))
  const ok = note({ n: 5, decide: "wait", minutes: 45, who: "владелец, 2026-10-24, «ждать ещё»" }, { session: "sesAUTHOR", project: "p" }, d, t, NOW)
  const after = iw?.readRecord?.("p", 5, d.dir)
  cell("W-5m «wait»: the question is closed with the decision, the term is new (+45 minutes)", ok?.ok === true && !after?.ep?.question && after?.ep?.due === NOW + 45 * MIN && (after?.decisions?.length ?? 0) === 1, J([ok, after]))
  const n0 = out.letters.length
  tick([t], d, NOW + 40 * MIN)
  cell("W-5n after the answer of the owner no new question and no new letter inside the new term", out.letters.length === n0 && out.notices.length === 1, J(out.letters.length - n0))
  tick([t], d, NOW + 50 * MIN)
  cell("W-5o when the new term is over the ladder starts again (a new letter to the holder)", out.letters.length === n0 + 1 && out.letters.at(-1).kind === "ask" && out.letters.at(-1).id !== out.letters[0].id && out.letters.at(-1).id !== out.letters[1].id, J(out.letters.map((x) => x.id)))
}
{
  // the same reason twice: the question at once; no answer to the first letter: the question after 15 minutes with ONE letter
  const t = mkTask(6, "running", { executor: "sesX" })
  const { d, out } = mkDeps()
  tick([t], d, NOW - 100 * MIN)
  note({ reason: "жду сборку", minutes: 30 }, { session: "sesX", project: "p" }, d, t, NOW - 99 * MIN)
  tick([t], d, NOW - 60 * MIN)
  note({ reason: "Жду сборку.", minutes: 30 }, { session: "sesX", project: "p" }, d, t, NOW - 59 * MIN)
  tick([t], d, NOW - 58 * MIN)
  const rec = iw?.readRecord?.("p", 6, d.dir)
  cell("W-5p the same reason twice (the words differ only by case and a dot): the question to the owner at once, the extension is not given", !!rec?.ep?.question && out.letters.filter((x) => x.kind === "question").length === 1 && rec.ep.due <= NOW - 60 * MIN + 30 * MIN + 1, J([rec?.ep?.question?.why, rec?.ep?.due]))
  const t2 = mkTask(7, "running", { executor: "sesX" })
  const f = mkDeps()
  tick([t2], f.d, NOW - 100 * MIN)
  tick([t2], f.d, NOW - 90 * MIN)
  tick([t2], f.d, NOW - 84 * MIN)
  cell("W-5q no answer to the first letter for 15 minutes: the question (one letter only), the argument says the holder is silent", f.out.letters.filter((x) => x.kind === "ask").length === 1 && f.out.letters.filter((x) => x.kind === "question").length === 1 && /не ответил|молч/.test(iw?.readRecord?.("p", 7, f.d.dir)?.ep?.question?.why ?? ""), J(f.out.letters.map((x) => x.kind)))
  const t3 = mkTask(8, "running", { executor: "sesX" })
  const g = mkDeps({ cfg: { termMin: 30, extendMin: 10, answerMin: 5 } })
  tick([t3], g.d, NOW - 100 * MIN)
  note({ reason: "первая", minutes: 999 }, { session: "sesX", project: "p" }, g.d, t3, NOW - 95 * MIN)
  const r3 = iw?.readRecord?.("p", 8, g.d.dir)
  cell("W-5r the answer extends by the setting (step_extend_minutes), not by the number the holder asks for", r3?.ep?.due === NOW - 95 * MIN + 10 * MIN, J(r3?.ep?.due))
  const t4 = mkTask(9, "running", { executor: "sesX" })
  const h = mkDeps()
  tick([t4], h.d, NOW - 100 * MIN)
  const r4 = note({ n: 9, done: true }, { session: "sesX", project: "p" }, h.d, t4, NOW - 99 * MIN)
  const rec4 = iw?.readRecord?.("p", 9, h.d.dir)
  cell("W-5s «done» is written down (the note in the history of the task) and gives one extension; it needs no reason", r4?.ok === true && rec4?.ep?.answers?.[0]?.done === true && h.out.notes.length >= 1 && rec4.ep.due === NOW - 99 * MIN + 30 * MIN, J([r4, rec4?.ep]))
  const r5 = note({ n: 9 }, { session: "sesX", project: "p" }, h.d, t4, NOW - 98 * MIN)
  cell("W-5t an answer without reason, done and decide is refused and names what is missing", r5?.ok === false && /reason/.test(r5.text) && /done/.test(r5.text), J(r5))
  const r6 = note({ n: 9, reason: "чужое" }, { session: "sesSTRANGER", project: "p" }, h.d, t4, NOW - 98 * MIN)
  cell("W-5u a session that has nothing to do with the task cannot answer for the holder", r6?.ok === false, J(r6))
}

// ---- W-6 the exceptions
{
  const run = (t, o) => {
    const { d, out } = mkDeps(o)
    tick([t], d, NOW)
    return { out, d }
  }
  const t = mkTask(10, "running", { executor: "sesX" })
  const base = run(t, {})
  cell("W-6a control: a step that stands 3 hours without an exception gets the letter", base.out.letters.length === 1, J(base.out))
  const turn = run(t, { turnGoing: (task, ses) => ses === "sesX" })
  cell("W-6b the turn of the window on this task goes: no letter, no question", turn.out.letters.length === 0 && turn.out.notices.length === 0, J(turn.out))
  const frm = run(t, { formOpen: () => true })
  cell("W-6c a question to the owner is open: no letter, no question", frm.out.letters.length === 0 && frm.out.notices.length === 0, J(frm.out))
  const ext = run(t, { externalRun: () => true })
  cell("W-6d an outside run with a named ceiling is going: no letter, no question", ext.out.letters.length === 0 && ext.out.notices.length === 0, J(ext.out))
  const { d, out } = mkDeps()
  const hold = note({ n: 10, hold: "HOLD", who: "владелец, 2026-10-24, «пока не трогать»" }, { session: "sesAUTHOR", project: "p" }, d, t, NOW - 5 * MIN)
  tick([t], d, NOW)
  const rec = iw?.readRecord?.("p", 10, d.dir)
  cell("W-6e HOLD by the word of the owner (a mark in the record): no letter, no question; the mark names who and when", hold?.ok === true && rec?.hold?.kind === "HOLD" && /владелец/.test(rec.hold.who ?? "") && out.letters.length === 0 && out.notices.length === 0, J([hold, rec]))
  const noWho = note({ n: 10, hold: "STOP" }, { session: "sesAUTHOR", project: "p" }, d, t, NOW)
  cell("W-6f a mark without the word of the owner is refused", noWho?.ok === false && /who/.test(noWho.text), J(noWho))
  note({ n: 10, release: true, who: "владелец, 2026-10-24, «снять»" }, { session: "sesAUTHOR", project: "p" }, d, t, NOW + MIN)
  tick([t], d, NOW + 2 * MIN)
  cell("W-6g the mark is removed by the author with the word of the owner: the watch works again", out.letters.length === 1, J(out.letters.length))
  cell("W-6h a mark outlives a change of the step (it belongs to the task)", (() => {
    const x = mkDeps()
    note({ n: 11, hold: "STOP", who: "владелец, 2026-10-24" }, { session: "sesAUTHOR", project: "p" }, x.d, mkTask(11, "running", { executor: "sesX" }), NOW)
    const moved = mkTask(11, "submitted", { reviewer: "sesR" })
    tick([moved], x.d, NOW + 2 * 60 * MIN)
    return x.out.letters.length === 0 && iw?.readRecord?.("p", 11, x.d.dir)?.hold?.kind === "STOP"
  })(), "")
  const ceil = run(t, { externalRun: (task, at) => at < NOW - 1 })
  cell("W-6i an outside run whose ceiling is over is not an exception", ceil.out.letters.length === 1, J(ceil.out))
  const off = run(t, { cfg: { termMin: 0 } })
  cell("W-6j step_term_minutes 0: the watch is off", off.out.letters.length === 0, J(off.out))
  const done = run(mkTask(12, "done"), {})
  cell("W-6k a closed task is not watched", done.out.letters.length === 0, J(done.out))
  const fresh = run(mkTask(13, "running", { executor: "sesX", history: [{ at: NOW - 10 * MIN, by: "sesAUTHOR", status: "running" }] }), {})
  cell("W-6l a step younger than the term is not an alarm", fresh.out.letters.length === 0, J(fresh.out))
  const plan = run(mkTask(16, "approval"), { ownerHolds: (task) => task.status === "approval" })
  cell("W-6m a plan on approval with plan_approver owner (the owner decides in /plans): no letter, no question", plan.out.letters.length === 0 && plan.out.notices.length === 0, J(plan.out))
  const text = run(t, { ownerHolds: (task) => task.executor === "sesX" })
  cell("W-6n a question to the owner in the text of a turn (state owner) at the holder: no letter, no question", text.out.letters.length === 0 && text.out.notices.length === 0, J(text.out))
  const plan2 = run(mkTask(17, "approval"), {})
  cell("W-6o control: a plan on approval where the owner is not the approver is watched (the letter goes to the author)", plan2.out.letters.length === 1 && plan2.out.letters[0].to === "sesAUTHOR", J(plan2.out))
}

// ---- W-7 the store: the term and the letters live in files
{
  const t = mkTask(14, "running", { executor: "sesX" })
  const dir = path.join(tmp, "store-restart")
  const a = mkDeps({ dir })
  tick([t], a.d, NOW)
  note({ n: 14, reason: "долгая сборка", minutes: 30 }, { session: "sesX", project: "p" }, a.d, t, NOW + MIN)
  const file = path.join(dir, "p", "14.json")
  const files = (() => { try { return readdirSync(path.join(dir, "p")) } catch { return [] } })()
  cell("W-7a the record is a file idle-watch/<project>/<n>.json (the term, the letters, the answers)", files.includes("14.json") && !!iw?.readRecord?.("p", 14, dir)?.ep?.letters?.length, J([file, files]))
  const b = mkDeps({ dir }) // «after a restart of the service»: a new set of dependencies, the same files
  tick([t], b.d, NOW + 5 * MIN)
  cell("W-7b after a restart the letter is not repeated and the extended term is kept", b.out.letters.length === 0 && iw?.readRecord?.("p", 14, dir)?.ep?.due === NOW + MIN + 30 * MIN, J([b.out.letters.length, iw?.readRecord?.("p", 14, dir)?.ep?.due]))
  const c = mkDeps({ dir })
  tick([t], c.d, NOW + 40 * MIN)
  cell("W-7c after a restart the ladder goes on from the file: the second letter, not the first again", c.out.letters.length === 1 && iw?.readRecord?.("p", 14, dir)?.ep?.letters?.length === 2, J([c.out.letters.length, iw?.readRecord?.("p", 14, dir)?.ep?.letters?.length]))
  const moved = mkTask(14, "submitted", { reviewer: "sesR", history: [...t.history, { at: NOW + 41 * MIN, by: "sesX", status: "submitted", note: "сдано" }] })
  tick([moved], c.d, NOW + 42 * MIN)
  cell("W-7d the step moved on (a new status): the old episode is dropped, nothing goes", !iw?.readRecord?.("p", 14, dir)?.ep && c.out.letters.length === 1, J(iw?.readRecord?.("p", 14, dir)))
}

// ---- W-8 the case of task 092
{
  // the task «goes» (running), the plugin noise keeps `updated` fresh, the window of the author is busy with other work (it holds the step: no
  // executor), the step did not change for two hours
  const t = mkTask(92, "running", {
    updated: NOW - MIN,
    history: [{ at: NOW - 125 * MIN, by: "sesAUTHOR", status: "running", note: "поставлена" }, { at: NOW - 30 * MIN, by: PLUGIN, note: "приёмка застряла: 3 хода подряд остановилась без работы и без ответа" }, { at: NOW - 8 * MIN, by: PLUGIN, note: "подталкивание" }],
  })
  const { d, out } = mkDeps({ turnGoing: (task, ses) => ses === "sesAUTHOR" && false })
  const busyElsewhere = true
  tick([t], d, NOW - 20 * MIN)
  cell("W-8a 092: running, the step stands 105+ minutes, the author is busy elsewhere: the letter that asks for an answer goes", busyElsewhere && out.letters.length === 1 && out.letters[0].to === "sesAUTHOR" && /crew_step_note/.test(out.letters[0].text) && /092/.test(out.letters[0].text), J(out.letters))
  tick([t], d, NOW)
  const q = out.letters.find((x) => x.kind === "question")
  cell("W-8b 092: no answer for 15+ minutes: the question to the owner with the options and a recommendation; the task is marked «срок вышел, вопрос открыт»", !!q && out.notices.length === 1 && iw?.readRecord?.("p", 92, d.dir)?.ep?.question?.recommend !== undefined, J([out.letters.map((x) => x.kind), out.notices]))
  const rows = iw?.stepRows?.(NOW, { project: "p", dir: d.dir, taskOf: () => t }) ?? []
  cell("W-8c 092: the row for /crew says «срок вышел, вопрос открыт»", rows.some((r) => /092/.test(r.text) && /срок вышел, вопрос открыт/.test(r.text)), J(rows))
}

// ---- W-9 the rows
{
  const t = mkTask(15, "running", { executor: "sesX" })
  const { d, out } = mkDeps()
  tick([t], d, NOW - 40 * MIN)
  const o = { project: "p", dir: d.dir, taskOf: () => t }
  const rowsA = iw?.stepRows?.(NOW - 39 * MIN, o) ?? []
  cell("W-9a a step past the term, no question yet: «шаг стоит N мин, срок вышел»", rowsA.some((r) => /015/.test(r.text) && /шаг стоит \d+ мин, срок вышел/.test(r.text)), J(rowsA))
  const side = iw?.stepSideRows?.(NOW - 39 * MIN, o) ?? []
  cell("W-9b the side panel: a short row with the number and the minutes", side.some((r) => /015/.test(r.text) && /срок вышел/.test(r.text)) && side.every((r) => r.text.length <= 32), J(side))
  const noteRows = iw?.stepNotes?.(NOW - 39 * MIN, o) ?? []
  const probs0 = iw?.stepProblems?.(NOW - 39 * MIN, o) ?? []
  cell("W-9c crew_doctor: an expired step is a note, not yet a problem", noteRows.some((x) => /015/.test(x) && /срок вышел/.test(x)) && probs0.length === 0, J([noteRows, probs0]))
  tick([t], d, NOW) // no answer: the question opens
  const probs = iw?.stepProblems?.(NOW, o) ?? []
  cell("W-9d crew_doctor: an open question is a problem that names the task, the minutes and what to do", probs.length === 1 && /015/.test(probs[0]) && /срок вышел, вопрос открыт/.test(probs[0]) && /crew_step_note/.test(probs[0]), J(probs))
  const moved = mkTask(15, "submitted", { reviewer: "sesR" })
  const gone = iw?.stepRows?.(NOW, { project: "p", dir: d.dir, taskOf: () => moved }) ?? []
  cell("W-9e the step has moved on: no row and no problem from the old episode", gone.length === 0 && (iw?.stepProblems?.(NOW, { project: "p", dir: d.dir, taskOf: () => moved }) ?? []).length === 0, J(gone))
  const other = iw?.stepRows?.(NOW, { project: "other", dir: d.dir, taskOf: () => t }) ?? []
  cell("W-9f rows are per project", other.length === 0, J(other))
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)
