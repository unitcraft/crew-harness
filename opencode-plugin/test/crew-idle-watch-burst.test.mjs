// Self-test of task 161, the guard against a volley of letters and questions at the first pass over OLD tasks (node >= 24):
//   node test/crew-idle-watch-burst.test.mjs
// The acceptance of 161 counted on the real box: on the first pass 10 open tasks "stand" (from 1590 to 7943 minutes) - up to 10 letters
// (some into long dead windows) and 15 minutes later up to 10 questions to the owner, 6 of them about one project. The guard:
// B-1 the settings (step_questions_max 2, step_letters_per_pass 3, step_old_minutes 300). B-2 at most M new letters in one pass, the rest wait
// for the next pass and are not lost. B-3 at most N open questions to the owner per project at a time, the rest wait their turn and are
// not lost; the limit is per project. B-4 a task that stands longer than step_old_minutes gets no letters of its own: ONE summary question
// per project (the list «number «title»» and the options close / HOLD / wait / change the executor), once. B-5 a holder whose window is dead
// gets no letter: the task goes into the summary question at once. B-6 the case of the acceptance: 10 old tasks on the first pass -> at most
// N questions of its own and ONE summary per project, never 10 letters. B-7 the summary question closes as its tasks are decided (wait,
// HOLD, cancelled). B-8 the question «wait more» says that a deliberate wait needs HOLD. B-9 the block «Срок шага вышел» of /crew-progress.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idle-watch-burst-"))
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

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const mk = (project, n, age, extra = {}) => ({
  project, n, title: `задача ${n}`, slug: `t${n}`, goal: "цель", priority: "P2", tier: "medium", role: "worker", author: `sesAUTH-${project}`, author_role: "integrator",
  qid: `q${n}`, status: "running", kind: "spawn", executor: `sesE${project}${n}`, executors: [], attempt: 1, directory: tmp,
  history: [{ at: NOW - age * MIN, by: `sesAUTH-${project}`, status: "running", note: "поставлена" }], created: NOW - age * MIN, updated: NOW, ...extra,
})
const base = { termMin: 30, byStep: {}, extendMin: 30, answerMin: 15, questionsMax: 2, passMax: 3, oldMin: 300 }
const mkDeps = (o = {}) => {
  const out = { letters: [], notices: [], notes: [] }
  const d = {
    dir: o.dir ?? path.join(tmp, `store-${Math.random().toString(36).slice(2)}`),
    cfg: () => ({ ...base, ...(o.cfg ?? {}) }),
    addressee: () => undefined,
    turnGoing: () => false,
    formOpen: () => false,
    externalRun: () => false,
    holderAlive: o.holderAlive,
    letter: (to, id, text, kind) => out.letters.push({ to, id, text, kind }),
    notice: (title, message) => out.notices.push({ title, message }),
    taskNote: (t, text) => out.notes.push(text),
    say: () => {},
  }
  return { d, out }
}
const tick = (tasks, d, at) => iw?.watchTick?.(tasks, d, at)
const asks = (out) => out.letters.filter((x) => x.kind === "ask")
const openQ = (d, project) => (iw?.records?.(d.dir, project) ?? []).filter((r) => r.ep?.question && !r.ep.question.decision).length
const note = (list, input, who, d, at) => iw?.noteStep?.(input, { session: who, project: input.project }, { dir: d.dir, cfg: d.cfg, task: (p, n) => list.find((t) => t.project === p && t.n === n), tasks: () => list, taskNote: d.taskNote }, at)

// ---- B-1 the settings
{
  const ks = ["step_questions_max", "step_letters_per_pass", "step_old_minutes"].map((k) => schema.SCHEMA.find((x) => x.key === k))
  cell("B-1a the schema has step_questions_max (2), step_letters_per_pass (3), step_old_minutes (300), group Подталкивание", ks[0]?.default === 2 && ks[1]?.default === 3 && ks[2]?.default === 300 && ks.every((k) => k?.kind?.type === "int" && k.group === "Подталкивание"), J(ks.map((k) => k?.key)))
  const c = core.loadConfig(path.join(tmp, "nowhere"))
  cell("B-1b loadConfig reads them with the defaults 2 / 3 / 300", c.stepQuestionsMax === 2 && c.stepLettersPerPass === 3 && c.stepOldMin === 300, J([c.stepQuestionsMax, c.stepLettersPerPass, c.stepOldMin]))
}

// ---- B-2 the cap of letters per pass
{
  const list = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mk("p", n, 150))
  const { d, out } = mkDeps()
  const per = []
  for (let k = 0; k < 4; k++) {
    const before = out.letters.length
    tick(list, d, NOW + k * 30_000)
    per.push(out.letters.length - before)
  }
  cell("B-2a eight tasks stand at the first pass: at most 3 new letters in one pass (3, 3, 2, then nothing)", J(per) === J([3, 3, 2, 0]), J(per))
  cell("B-2b nobody is lost: every one of the eight tasks got its letter, none got two", new Set(asks(out).map((l) => l.id)).size === 8 && asks(out).length === 8, J(asks(out).map((l) => l.id)))
  const f = mkDeps({ cfg: { passMax: 5 } })
  tick(list, f.d, NOW)
  cell("B-2c the cap is the setting step_letters_per_pass (5 here)", f.out.letters.length === 5, String(f.out.letters.length))
}

// ---- B-3 the cap of open questions per project
{
  const list = [1, 2, 3, 4, 5, 6].map((n) => mk("p", n, 150))
  const dir = path.join(tmp, "store-q")
  const first = mkDeps({ dir, cfg: { passMax: 100 } })
  tick(list, first.d, NOW - 20 * MIN) // the letters of all six go out together; nobody answers
  const { d, out } = mkDeps({ dir })
  tick(list, d, NOW)
  const open1 = openQ(d, "p")
  cell("B-3a six letters without answers: at most 2 questions to the owner are open for the project", first.out.letters.length === 6 && open1 === 2, J([first.out.letters.length, open1]))
  tick(list, d, NOW + 30_000)
  tick(list, d, NOW + 60_000)
  cell("B-3b the others wait: no third question while two stand open", openQ(d, "p") === 2 && out.letters.filter((x) => x.kind === "question").length === 2, J([openQ(d, "p"), out.letters.map((x) => x.kind)]))
  const opened = (iw?.records?.(dir, "p") ?? []).filter((r) => r.ep?.question && !r.ep.question.decision).map((r) => r.n)
  for (const n of opened) note(list, { n, project: "p", decide: "wait", who: "владелец, 2026-10-24", minutes: 600 }, "sesAUTH-p", d, NOW + 90_000)
  tick(list, d, NOW + 120_000)
  const opened2 = (iw?.records?.(dir, "p") ?? []).filter((r) => r.ep?.question && !r.ep.question.decision).map((r) => r.n)
  cell("B-3c two decided: the next two in the queue get their questions (nothing is lost), the open ones stay at 2", opened2.length === 2 && opened2.every((n) => !opened.includes(n)), J([opened, opened2]))
  const two = mkDeps({})
  const ps = [mk("a", 1, 150), mk("a", 2, 150), mk("a", 3, 150), mk("b", 1, 150), mk("b", 2, 150), mk("b", 3, 150)]
  tick(ps, { ...two.d, cfg: () => ({ ...base, passMax: 100 }) }, NOW - 20 * MIN)
  tick(ps, two.d, NOW)
  tick(ps, two.d, NOW + 30_000)
  cell("B-3d the limit is per project: two projects, two open questions each", openQ(two.d, "a") === 2 && openQ(two.d, "b") === 2, J([openQ(two.d, "a"), openQ(two.d, "b")]))
}

// ---- B-4 the old tasks: ONE summary question per project
{
  const list = [mk("p", 3, 400), mk("p", 4, 600), mk("p", 5, 7943)]
  const { d, out } = mkDeps()
  tick(list, d, NOW)
  const sum = iw?.readSummary?.("p", d.dir)
  const sl = out.letters.filter((x) => x.kind === "summary")
  cell("B-4a three tasks stand longer than step_old_minutes: no letter of their own, ONE summary letter to the author, one notice", asks(out).length === 0 && sl.length === 1 && sl[0].to === "sesAUTH-p" && out.notices.length === 1, J([out.letters.map((x) => x.kind), out.notices.length]))
  cell("B-4b the summary record lists the three tasks and has an open question", J(sum?.ns) === J([3, 4, 5]) && !!sum?.question && !sum.question.decision, J(sum))
  const text = sl[0]?.text ?? ""
  cell("B-4c the text names the tasks with number and title, the minutes, and offers: close, HOLD, wait, change the executor", /003 «задача 3»/.test(text) && /004 «задача 4»/.test(text) && /005 «задача 5»/.test(text) && /7943/.test(text) && /закрыть/i.test(text) && /HOLD/.test(text) && /ждать/i.test(text) && /сменить исполнителя/i.test(text) && /^Шаг стоит давно, срок вышел:/.test(text), text)
  tick(list, d, NOW + 30_000)
  tick(list, d, NOW + 40 * MIN)
  cell("B-4d the summary is not repeated: no new letter, no individual question, later", out.letters.filter((x) => x.kind === "summary").length === 1 && asks(out).length === 0 && out.letters.filter((x) => x.kind === "question").length === 0 && out.notices.length === 1, J(out.letters.map((x) => x.kind)))
  const young = mkDeps()
  tick([mk("p", 6, 200)], young.d, NOW)
  cell("B-4e a task under the old limit (200 minutes) goes the usual way: its own letter, no summary", asks(young.out).length === 1 && young.out.letters.every((x) => x.kind !== "summary"), J(young.out.letters.map((x) => x.kind)))
  const off = mkDeps({ cfg: { oldMin: 0 } })
  tick([mk("p", 7, 7000)], off.d, NOW)
  cell("B-4f step_old_minutes 0 switches the summary off: the old task gets its own letter", asks(off.out).length === 1 && off.out.letters.every((x) => x.kind !== "summary"), J(off.out.letters.map((x) => x.kind)))
}

// ---- B-5 a dead window
{
  const list = [mk("p", 8, 100), mk("p", 9, 100)]
  const { d, out } = mkDeps({ holderAlive: (s) => s !== "sesEp8" })
  tick(list, d, NOW)
  const sum = iw?.readSummary?.("p", d.dir)
  cell("B-5a the holder of task 8 has no live window: no letter to it, the task goes into the summary question at once (100 minutes only)", asks(out).every((l) => l.to !== "sesEp8") && J(sum?.ns) === J([8]) && out.letters.some((x) => x.kind === "summary"), J([out.letters.map((x) => [x.kind, x.to]), sum?.ns]))
  cell("B-5b the live holder of task 9 gets its letter as usual", asks(out).some((l) => l.to === "sesEp9"), J(out.letters.map((x) => [x.kind, x.to])))
  cell("B-5c the summary says that the window of the holder is dead", /окна нет|мертв|мёртв/i.test(out.letters.find((x) => x.kind === "summary")?.text ?? ""), out.letters.find((x) => x.kind === "summary")?.text)
}

// ---- B-6 the case of the acceptance: ten old tasks on the first pass
{
  const A = [1, 2, 3, 4, 5, 6].map((n, i) => mk("a", n, [1590, 2400, 3300, 4500, 6000, 7943][i]))
  const B = [1, 2, 3, 4].map((n, i) => mk("b", n, [1700, 2900, 5200, 7000][i]))
  const { d, out } = mkDeps({ holderAlive: (s) => !/E[ab][135]$/.test(s) })
  tick([...A, ...B], d, NOW)
  cell("B-6a ten old tasks, some in dead windows, on the first pass: no letter of their own, one summary per project (two letters, two notices)", asks(out).length === 0 && out.letters.filter((x) => x.kind === "summary").length === 2 && out.notices.length === 2, J(out.letters.map((x) => x.kind)))
  for (let k = 1; k <= 40; k++) tick([...A, ...B], d, NOW + k * MIN)
  cell("B-6b after the waiting time: still no individual question; at most N (2) per project and ONE summary", openQ(d, "a") <= 2 && openQ(d, "b") <= 2 && out.letters.filter((x) => x.kind === "question").length === 0 && out.letters.filter((x) => x.kind === "summary").length === 2, J(out.letters.map((x) => x.kind)))
  // the mixed case: four old and six middle-aged tasks in one project
  const mixed = [...[1, 2, 3, 4].map((n) => mk("m", n, 5000 + n)), ...[5, 6, 7, 8, 9, 10].map((n) => mk("m", n, 150))]
  const m = mkDeps()
  const per = []
  for (let k = 0; k < 3; k++) {
    const b = m.out.letters.length
    tick(mixed, m.d, NOW + k * 30_000)
    per.push(m.out.letters.length - b)
  }
  for (let k = 0; k < 60; k++) tick(mixed, m.d, NOW + 5 * MIN + k * 30_000)
  cell("B-6c four old and six middle-aged tasks: at most 3 letters in a pass (the summary is one of them), then at most 2 questions of their own + 1 summary", per.every((x) => x <= 3) && m.out.letters.filter((x) => x.kind === "summary").length === 1 && m.out.letters.filter((x) => x.kind === "question").length <= 2, J([per, m.out.letters.map((x) => x.kind)]))
}

// ---- B-7 the summary question closes as the tasks are decided
{
  const A = mk("p", 3, 400)
  const Bt = mk("p", 4, 600)
  const C = mk("p", 5, 800)
  const list = [A, Bt, C]
  const { d, out } = mkDeps()
  tick(list, d, NOW)
  const w = note(list, { n: 3, project: "p", decide: "wait", minutes: 120, who: "владелец, 2026-10-24, «ждать»" }, "sesAUTH-p", d, NOW + MIN)
  const strangers = note(list, { n: 4, project: "p", decide: "wait", who: "x" }, "sesSTRANGER", d, NOW + MIN)
  tick(list, d, NOW + 2 * MIN)
  cell("B-7a «wait» on a task of the summary (by the author, with the word of the owner) takes it out of the list for that time; a stranger cannot", w?.ok === true && strangers?.ok === false && J(iw?.readSummary?.("p", d.dir)?.ns) === J([4, 5]), J([w, strangers, iw?.readSummary?.("p", d.dir)?.ns]))
  const h = note(list, { n: 4, project: "p", hold: "HOLD", who: "владелец, 2026-10-24, «HOLD»" }, "sesAUTH-p", d, NOW + 3 * MIN)
  tick(list, d, NOW + 4 * MIN)
  cell("B-7b HOLD takes a task out of the summary", h?.ok === true && J(iw?.readSummary?.("p", d.dir)?.ns) === J([5]), J(iw?.readSummary?.("p", d.dir)?.ns))
  tick([A, Bt, { ...C, status: "cancelled" }], d, NOW + 5 * MIN)
  cell("B-7c the last task is cancelled: the summary question is gone", iw?.readSummary?.("p", d.dir) === undefined, J(iw?.readSummary?.("p", d.dir)))
  cell("B-7d no new summary letter while the list only shrank", out.letters.filter((x) => x.kind === "summary").length === 1, J(out.letters.map((x) => x.kind)))
  tick(list, d, NOW + 130 * MIN) // the wait of task 3 is over (it is still old)
  cell("B-7e when the wait is over the old task comes back into a new summary question", J(iw?.readSummary?.("p", d.dir)?.ns) === J([3]) || J(iw?.readSummary?.("p", d.dir)?.ns) === J([3, 5]), J(iw?.readSummary?.("p", d.dir)?.ns))
  const rows = iw?.stepRows?.(NOW + 130 * MIN, { project: "p", dir: d.dir, taskOf: (p, n) => list.find((t) => t.n === n) }) ?? []
  const probs = iw?.stepProblems?.(NOW + 130 * MIN, { project: "p", dir: d.dir, taskOf: (p, n) => list.find((t) => t.n === n) }) ?? []
  cell("B-7f the summary is shown: a row in /crew and a problem in crew_doctor with the numbers", rows.some((r) => /стоят давно/.test(r.text) && /003/.test(r.text)) && probs.some((x) => /стоят давно/.test(x) && /003/.test(x)), J([rows, probs]))
}

// ---- B-8 «wait more» needs HOLD
{
  const t = mk("p", 11, 100)
  const { d, out } = mkDeps()
  tick([t], d, NOW - 40 * MIN)
  tick([t], d, NOW)
  const q = out.letters.find((x) => x.kind === "question")
  const opt = iw?.readRecord?.("p", 11, d.dir)?.ep?.question?.options?.find((o) => o.id === "wait")
  cell("B-8a the question says that a deliberate wait needs HOLD, else the ladder begins again", /HOLD/.test(q?.text ?? "") && /заново|сначала|повтор/.test(q?.text ?? "") && /HOLD/.test(opt?.desc ?? ""), J([q?.text, opt]))
  const r = note([t], { n: 11, project: "p", decide: "wait", minutes: 30, who: "владелец, 2026-10-24" }, "sesAUTH-p", d, NOW)
  cell("B-8b the answer to the decision «wait» repeats it: the ladder is back after the term unless HOLD", /HOLD/.test(r?.text ?? ""), J(r))
}

// ---- B-9 /crew-progress
{
  const t = mk("p", 12, 100)
  const { d } = mkDeps()
  tick([t], d, NOW - 40 * MIN)
  const lines = iw?.stepProgressLines?.(NOW - 39 * MIN, { project: "p", dir: d.dir, taskOf: () => t }) ?? []
  cell("B-9a /crew-progress: the block lists the task whose term is out, with the minutes", lines.length === 1 && /012/.test(lines[0]) && /шаг стоит \d+ мин, срок вышел/.test(lines[0]), J(lines))
  tick([t], d, NOW)
  const lines2 = iw?.stepProgressLines?.(NOW, { project: "p", dir: d.dir, taskOf: () => t }) ?? []
  cell("B-9b with an open question the line says «срок вышел, вопрос открыт»", lines2.length === 1 && /срок вышел, вопрос открыт/.test(lines2[0]), J(lines2))
  cell("B-9c a HOLD alone gives no line in the block (it is no alarm)", (() => {
    const x = mkDeps()
    iw?.noteStep?.({ n: 13, project: "p", hold: "HOLD", who: "владелец, 2026-10-24" }, { session: "sesAUTH-p", project: "p" }, { dir: x.d.dir, cfg: x.d.cfg, task: () => mk("p", 13, 100), tasks: () => [], taskNote: () => {} }, NOW)
    return (iw?.stepProgressLines?.(NOW, { project: "p", dir: x.d.dir, taskOf: () => mk("p", 13, 100) }) ?? ["x"]).length === 0
  })(), "")
  const none = iw?.stepProgressLines?.(NOW, { project: "other", dir: d.dir, taskOf: () => t }) ?? ["x"]
  cell("B-9d another project: an empty block", none.length === 0, J(none))
}

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)
