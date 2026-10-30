// Self-test of tasks 083 and 086 (node >= 24):  node test/crew-task-label.test.mjs
// Task 083 (the owner, 2026-10-17) made the labels of crew-harness three digits; task 086 (2026-10-18: "все задачи всех проектов подписываются
// тремя цифрами без #") extended that to every project and forbade "#N" (crew-task-hash.test.mjs holds the rule itself). This test keeps the
// places of 083 one by one: each shows the one label, "022" / "081" / "094", and never a "#".
// TL-1 the one function (taskNo, taskRef, sessionRef): three digits with a folder and without, for every project.
// TL-2 the status (statusOf): task.ref is always set, "022" / "081" / "094"; group only with a folder.
// TL-3 every place that shows the label gives the same one: the waiting line and rows, /crew, the side panel (non-grouped rows), the
//      title of a group, idle-tab texts, the merge-lock texts (lockWaitLine, precheckLines, unlockMerge), the live sessions of the profiles.
// TL-4 no place glues "#" and a task number by hand: every "#${...n}" in the sources is a key "project#n" or goes through taskNo.
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-label-"))
process.env.XDG_DATA_HOME = tmp
const T = await import("../tasks.ts")
const S = await import("../status.ts")
const IT = await import("../idle-tab.ts")
const R = await import("../review.ts")
const PC = await import("../precheck.ts")
let fail = 0
const cell = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const check = (name, fn) => {
  try {
    fn()
    cell(name, true)
  } catch (e) {
    cell(name, false, String(e?.message ?? e).split("\n").slice(0, 14).join(" | "))
  }
}
const OWN = "crew-harness"

// TL-1
check("TL-1 taskNo: crew-harness without a folder - three digits", () => {
  assert.equal(T.taskNo({ project: OWN, n: 22 }), "022")
  assert.equal(T.taskNo({ project: OWN, n: 5 }), "005")
  assert.equal(T.taskNo({ project: OWN, n: 81 }), "081")
  assert.equal(T.taskNo({ project: OWN, n: 1000 }), "1000", "above 999 as it is")
})
check("TL-1 taskNo: with a folder, another project, no project - three digits", () => {
  assert.equal(T.taskNo({ project: OWN, n: 81, folder: "doc/tasks/081-x" }), "081")
  assert.equal(T.taskNo({ project: "nova", n: 45, folder: "doc/tasks/045-x" }), "045")
  assert.equal(T.taskNo({ project: "nova", n: 94 }), "094")
  assert.equal(T.taskNo({ n: 31 }), "031")
  assert.equal(T.taskNo({ n: 45, folder: "doc/tasks/045-x" }), "045")
})
check("TL-1 taskRef and sessionRef follow taskNo", () => {
  assert.equal(T.taskRef({ project: OWN, n: 22, title: "Реестры контрактов" }), "022 «Реестры контрактов»")
  assert.equal(T.taskRef({ project: "nova", n: 94, title: "Разбор" }), "094 «Разбор»")
  assert.equal(T.sessionRef({ project: OWN, n: 22 }, { code: "С4", k: 3 }), "022 С4-3")
  assert.equal(T.sessionRef({ project: "nova", n: 94 }, { code: "исп", k: 1 }), "094 исп")
})

// TL-2
const proj = path.join(tmp, "proj")
mkdirSync(proj, { recursive: true })
const mk = (project, n, fields = {}) =>
  T.createTask(
    { project, title: `task ${n}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesAUTH", author_role: `${project}.integrator`, qid: `q-${project}-${n}`, status: "running", kind: "spawn", directory: proj, executor: `ses_${project}_${n}`, ...fields },
    undefined,
    { n },
  )
const t22 = mk(OWN, 22)
const t81 = mk(OWN, 81, { folder: "doc/tasks/081-x", sessions: [] })
const t94 = mk("nova", 94)
const now = Date.now()
const stat = (t, as = "executor") =>
  S.statusOf({
    card: { session: t.executor, role: "worker", auto: false, title: "x", directory: proj, repo: "proj", project: t.project, pid: process.pid, updated: now, ...(as === "executor" ? { task: { project: t.project, n: t.n } } : { review: { project: t.project, n: t.n } }) },
    busy: false,
    end: { at: now, text: "Влить?", ownerAfter: false },
    asked: [],
    now,
  })
const s22 = stat(t22)
const s81 = stat(t81)
const s94 = stat(t94)
check("TL-2 statusOf: ref is 022 / 081 / 094, group only with a folder", () => {
  assert.equal(s22.task?.ref, "022")
  assert.equal(s81.task?.ref, "081")
  assert.equal(s94.task?.ref, "094")
  assert.equal(s22.task?.group, undefined)
  assert.equal(s81.task?.group, true)
  assert.equal(s94.task?.group, undefined)
})

// TL-3: statuses WITHOUT ref (written by an older plugin, or fixtures): the fallback gives the same label
const bare = (s) => ({ ...s, task: { ...s.task, ref: undefined } })
const own = (s, st = "owner") => ({ ...s, state: st, since: now - 60_000, question: "Влить?", title: "no title" })
const lines = (s) => [S.waitingLine([own(s)], now) ?? "", ...S.waitingRows([own(s)]).map((r) => r.what), S.formatStatuses([own(s)], now), ...S.sidebarLines([s], now, s.project).rows.map((r) => S.sideText(r)), ...S.sidebarLines([s], now, s.project).rows.map((r) => r.who)].join("\n")
for (const [name, mkS, want, notWant] of [
  ["22", () => s22, "022", "#"],
  ["22 without ref", () => bare(s22), "022", "#"],
  ["81", () => s81, "081", "#"],
  ["94 nova", () => s94, "094", "#"],
  ["94 nova without ref", () => bare(s94), "094", "#"],
]) {
  check(`TL-3 ${name}: waiting line, rows, /crew and the side panel give ${want}`, () => {
    const text = lines(mkS())
    assert.ok(text.includes(want), `no ${want} in:\n${text}`)
    assert.ok(!text.includes(notWant), `${notWant} in:\n${text}`)
  })
}
check("TL-3 the waiting line names the tab as 022 исп", () => {
  assert.match(S.waitingLine([own(bare(s22))], now), /crew-harness 022 exec/)
  assert.match(S.waitingLine([own(bare(s94))], now), /nova 094 exec/)
  const rows = S.waitingRows([own(bare(s22))]).map((r) => r.what).join("\n")
  assert.match(rows, /crew-harness 022 исп/)
})
check("TL-3 the side panel: a working row of a task without folder is 022 исп, the heading 022 ...", () => {
  const rows = S.sidebarLines([bare(s22)], now, OWN).rows
  const text = rows.map((r) => `${r.who} | ${S.sideText(r)}`).join("\n")
  assert.ok(/022 исп/.test(text) && /022 нужен ответ · task 22/.test(text), text)
  assert.ok(!text.includes("#"), text)
})

// idle-tab texts
const items = [
  { kind: "between", task: t22 },
  { kind: "waits", task: t22, who: "прм" },
  { kind: "order", task: { ...t22, project: OWN, kind: "order" }, to: "nova" },
  { kind: "silent", task: t94, at: now },
  { kind: "nosession", task: t81 },
]
check("TL-3 idle-tab: idleWhat and idleLetter give 022 / 094 / 081", () => {
  const what = IT.idleWhat(items).join("\n")
  assert.ok(what.includes("022 между сессиями") && what.includes("022 прм ждёт указаний") && what.includes("094 исполнитель молчит") && what.includes("081 без исполнителя"), what)
  assert.ok(!what.includes("#"), what)
  const letter = IT.idleLetter(25, items)
  assert.ok(letter.includes("022 «task 22»") && letter.includes("094 «task 94»") && letter.includes("081 «task 81»"), letter)
  assert.ok(!letter.includes("#"), letter)
})

// merge lock texts
{
  const C = await import("../core.ts")
  const base = { role: "worker", auto: false, title: "x", directory: proj, repo: "proj", project: OWN, pid: process.pid, updated: now, spawned: { by: "sesAUTH", task: "x", tier: "light", status: "running", at: now, qid: "q" } }
  C.saveCard({ ...base, session: "ses_holder", task: { project: OWN, n: 7 } })
  C.saveCard({ ...base, session: "ses_waiter", task: { project: OWN, n: 22 } })
  mk(OWN, 7, { status: "reviewing", reviewer: "ses_holder" })
  const got = R.takeMergeLock(OWN, "ses_holder", 7)
  const wait = R.takeMergeLock(OWN, "ses_waiter", 22)
  check("TL-3 lock taken, the second session waits", () => {
    assert.ok(got.ok)
    assert.ok(!wait.ok)
  })
  check("TL-3 lockWaitLine names the waiting task as 022", () => {
    const line = R.lockWaitLine(OWN, now) ?? ""
    assert.ok(line.includes("022 ("), line)
    assert.ok(!line.includes("#"), line)
    const st = S.formatStatuses([bare(s22)], now)
    void st
    assert.ok((S.formatStatuses([bare(s22)], now)).includes("lock 022"), S.formatStatuses([bare(s22)], now))
  })
  const rec = { state: "running", at: now, base: "a".repeat(40) }
  check("TL-3 precheckLines and unlockMerge name the holder's task as 007", () => {
    assert.ok(PC.precheckLines({ ...t22, precheck: rec }, "ses_holder").join("\n").includes("для задачи 007, не для этой"))
    assert.ok(PC.precheckLines({ ...t22, precheck: rec }, "ses_other").join("\n").includes("(задача 007)"))
    assert.ok(PC.unlockMerge(t22, "ses_other").includes("задачи 007"))
    const un = PC.unlockMerge(t22, "ses_holder")
    assert.ok(un.includes("для задачи 007, а не 022"), un)
  })
}

// profiles: live sessions of a project
check("TL-3 the profile-cmd fallback of a status without ref", () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "profile-cmd.ts"), "utf8")
  assert.ok(!/`#\$\{s\.task\.n\}`/.test(src), "profile-cmd.ts glues #n by hand")
  assert.ok(!/s\.task\.ref \?\? /.test(src), "profile-cmd.ts takes the stored ref before taskNo")
})

// TL-4: no "#${...n}" by hand in the sources
check("TL-4 no source glues # and a task number by hand", () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  const bad = []
  for (const f of readdirSync(dir).filter((x) => /\.(ts|tsx)$/.test(x) && x !== "tasks.ts")) { // tasks.ts holds the one function
    readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        // "#${...n}" or "#${taskNum}" not preceded by a word character, "}" or a quote: a key "project#n" and a parent address are not labels
        const re = /(^|[^\w}"])#\$\{([^}]*)\}/g
        let m
        while ((m = re.exec(line))) if (/(^|[^\w])(n|taskNum|ordinal)\b/.test(m[2]) || /\.n$/.test(m[2])) bad.push(`${f}:${i + 1}: ${m[0]}`)
      })
  }
  assert.deepEqual(bad, [])
})

try {
  const { rmSync } = await import("node:fs")
  rmSync(tmp, { recursive: true, force: true })
} catch {}
void writeFileSync
if (fail) {
  console.log(`crew-task-label.test FAILED: ${fail}`)
  process.exit(1)
}
console.log("crew-task-label.test ok")
