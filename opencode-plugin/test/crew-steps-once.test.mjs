// Self-test of task 087 (node >= 24):  node test/crew-steps-once.test.mjs
// The owner (2026-10-18): the panel showed «проверка 1/12: criteria — …» twice under one task - under «прм» and under «исп». The steps
// and the step in progress are kept on the task, so every tab of the task carried them; only the reviewer checks them. The rule: the
// line of the steps is printed once per task and belongs to the reviewer; the executor and the finished sessions have none; with no
// reviewer among the shown sessions the one line stands under the title of the task. /crew follows the same rule.
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-steps-once-"))
process.env.XDG_DATA_HOME = tmp
const { sidebarLines, sideText, formatStatuses } = await import("../status.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const now = new Date(2026, 9, 18, 12, 0).getTime()
const st = (session, state, extra = {}) => ({ session, project: "nova", role: "worker", title: session, state, detail: "", watches: [], asked: [], tasks: [], updated: now, ...extra })
const steps = Array.from({ length: 12 }, (_, i) => ({ id: i === 0 ? "criteria" : "s" + i, text: i === 0 ? "критерии приёмки задачи" : "шаг " + i }))
const t = (as, extra = {}) => ({ n: 101, status: "reviewing", as, title: "Исправить eq", steps, checking: "criteria", ...extra })
const panel = (list) => sidebarLines(list, now, "nova").rows.map((r) => sideText(r))
const count = (rows, re) => rows.filter((l) => re.test(l)).length
const STEP = /проверка 1\/12/

// 1. the screenshot case: an executor and a reviewer of one task, both carry the steps
const two = [st("e", "task", { task: t("executor") }), st("r", "working", { since: now - 60_000, task: t("reviewer") })]
const p2 = panel(two)
const ir = p2.findIndex((l) => l.startsWith("↳ прм"))
cell("1: the steps line stands once under the reviewer", count(p2, STEP) === 1 && STEP.test(p2[ir] ?? ""), JSON.stringify(p2))
cell("1: the executor row has no steps", /^↳ исп/.test(p2.find((l) => l.startsWith("↳ исп")) ?? "") && !STEP.test(p2.find((l) => l.startsWith("↳ исп")) ?? ""), JSON.stringify(p2))
const c2 = formatStatuses(two, now, "nova")
cell("1: /crew shows the count once, on the reviewer", (c2.match(/1\/12/g) ?? []).length === 1 && /прм|rev|worker/.test(c2) && /working[^\n]*1\/12/.test(c2), c2)

// 2. three sessions of one task (a task with a folder): one line only
const g = (as, label, extra = {}) => t(as, { group: true, ref: "101", ...(label ? { label } : {}), ...extra })
const three = [st("e", "task", { task: g("executor") }), st("a", "task", { task: g("executor", "С4-3") }), st("b", "task", { task: g("executor", "С4-4") })]
const p3 = panel(three)
cell("2: three sessions, no reviewer - one line", count(p3, STEP) === 1, JSON.stringify(p3))
const three2 = [...three, st("r", "working", { since: now - 60_000, task: g("reviewer") })]
const p32 = panel(three2)
const ir2 = p32.findIndex((l) => STEP.test(l))
cell("2: three sessions and a reviewer - one line, on the reviewer", count(p32, STEP) === 1 && /^↳ (• )?прм/.test(p32[ir2] ?? ""), JSON.stringify(p32))
const c3 = formatStatuses(three2, now, "nova")
cell("2: /crew - one count", (c3.match(/1\/12/g) ?? []).length === 1, c3)

// 3. no reviewer: the one line stands under the title of the task (plain task and task with a folder)
const lone = [st("e", "working", { since: now - 60_000, task: t("executor") })]
const p1 = panel(lone)
cell("3: a plain task with no reviewer - one line under the title, then the executor", count(p1, STEP) === 1 && p1.findIndex((l) => STEP.test(l)) < p1.findIndex((l) => l.startsWith("↳ исп")) && p1.findIndex((l) => STEP.test(l)) >= 1, JSON.stringify(p1))
cell("3: its row is a muted «↳» row", sidebarLines(lone, now, "nova").rows.filter((r) => STEP.test(r.what)).every((r) => r.tone === "muted" && r.what.startsWith("↳ ")), JSON.stringify(sidebarLines(lone, now, "nova").rows))
const cl = formatStatuses(lone, now, "nova")
cell("3: /crew - the count once, the executor row has none", (cl.match(/1\/12/g) ?? []).length === 1, cl)
cell("3: a task with a folder and no reviewer - one line under the title", count(panel(three), STEP) === 1 && panel(three)[0] !== undefined && STEP.test(panel(three)[1] ?? "") && !STEP.test(panel(three)[0]), JSON.stringify(panel(three)))

// 4. a task with no steps is as before
const bare = [st("e", "working", { task: { n: 7, status: "running", as: "executor", title: "x" } })]
cell("4: a task without steps - no steps line", count(panel(bare), /проверка|шаги/) === 0 && panel(bare).some((l) => l.startsWith("↳ исп")), JSON.stringify(panel(bare)))

// 5. a method session with a kind does not lose its row
const k = [st("m", "working", { since: now - 60_000, task: g("executor", "С2-5", { kind: "проверка спецификации", status: "running" }) }), st("r", "working", { since: now - 60_000, task: g("reviewer") })]
const pk = panel(k)
cell("5: «↳ С2-5 проверка спецификации» stays, the steps once", pk.some((l) => /^↳ (• )?С2-5 проверка/.test(l)) && count(pk, STEP) === 1, JSON.stringify(pk))

// 6. the waiting state of a session is shown as before: an executor that waits, a reviewer that waits (the wait, the steps under it)
const w = { id: "w", note: "когда сдвинется main", started: now - 40 * 60_000, minutes: 90 }
const wl = [st("e", "watch", { since: now - 40 * 60_000, watches: [w], task: t("executor") }), st("r", "watch", { since: now - 40 * 60_000, watches: [w], task: t("reviewer") })]
const pw = panel(wl)
cell("6: waiting tabs keep their wait; the steps once, under the reviewer's wait", count(pw, /⧗/) >= 2 && count(pw, STEP) === 1 && pw.findIndex((l) => STEP.test(l)) > pw.findIndex((l) => l.startsWith("↳ прм")), JSON.stringify(pw))
// 7. a reviewer that asks the owner shows no steps and the executor does not take them over
const ask = [st("e", "task", { task: t("executor") }), st("r", "owner", { since: now - 60_000, question: "вливать?", task: t("reviewer") })]
cell("7: a reviewer that asks: no second copy on the executor", count(panel(ask), STEP) === 0, JSON.stringify(panel(ask)))
// 8. finished sessions of a task with a folder carry none; the live reviewer carries the line
const fin = [st("d", "task", { task: g("executor", "С1-1", { status: "submitted", ended: now - 1000 }) }), st("r", "working", { since: now - 60_000, task: g("reviewer") })]
cell("8: finished sessions - none; the reviewer - one", count(panel(fin), STEP) === 1, JSON.stringify(panel(fin)))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-steps-once.test: FAIL ${fail}` : "crew-steps-once.test ok")
process.exit(fail ? 1 : 0)
