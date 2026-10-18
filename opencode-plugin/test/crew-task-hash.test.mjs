// Self-test of task 086 (node >= 24):  node test/crew-task-hash.test.mjs
// The owner (2026-10-18): "все задачи всех проектов подписываются тремя цифрами без # (022, 061, 081, 094) ... количество цифр может быть
// и больше 3; закрепить #{N} за номером issue на github". GitHub turns every "#N" of a commit message into a link to an issue of the repository,
// so a task is never written with "#": every task of every project is its number with zeros on the left up to three digits, 1000 as it is.
// TH-1 the one function: taskNo, taskRef, sessionRef - three digits for every project, with a folder and without, no project; 1000 as it is.
// TH-2 the title of a tab: "#33 исп" (the first edition of task 086, the old Nova form) and "045 С4-3" are both read as a tab head and shown "NNN ...".
// TH-3 the title that syncTitles builds is "061 ..." with no "#": a session still titled "#33 исп ..." differs from it and is renamed.
// TH-4 the label and the names of folders and branches on disk are the same three digits.
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-task-hash-"))
process.env.XDG_DATA_HOME = tmp
const T = await import("../tasks.ts")
const S = await import("../status.ts")
const TN = await import("../task-numbers.ts")
const src = (f) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", f), "utf8")
let fail = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (e) {
    console.log(`FAIL ${name} :: ${String(e?.message ?? e).split("\n").slice(0, 14).join(" | ")}`)
    fail++
  }
}
const OWN = "crew-harness"

// TH-1
check("TH-1 taskNo: 22, 61, 81, 94, 1000 for every project, with a folder and without", () => {
  const want = [[22, "022"], [61, "061"], [81, "081"], [94, "094"], [5, "005"], [100, "100"], [1000, "1000"]]
  for (const [n, label] of want) {
    for (const project of [OWN, "nova", "claude-limits", undefined]) {
      assert.equal(T.taskNo({ project, n }), label, `${project} ${n}`)
      assert.equal(T.taskNo({ project, n, folder: `doc/tasks/${label}-x` }), label, `${project} ${n} with a folder`)
    }
  }
})
check("TH-1 taskNo: a string number, and a number that is not digits as it is", () => {
  assert.equal(T.taskNo({ n: "61" }), "061")
  assert.equal(T.taskNo({ n: "061" }), "061")
  assert.equal(T.taskNo({ n: "x7" }), "x7")
  assert.ok(!/#/.test(T.taskNo({ project: "nova", n: 94 })))
})
check("TH-1 taskRef and sessionRef follow taskNo", () => {
  assert.equal(T.taskRef({ project: OWN, n: 22, title: "Реестры контрактов" }), "022 «Реестры контрактов»")
  assert.equal(T.taskRef({ project: "nova", n: 94, title: "Разбор" }), "094 «Разбор»")
  assert.equal(T.taskRef({ project: OWN, n: 61 }), "061")
  assert.equal(T.sessionRef({ project: OWN, n: 61, folder: "doc/tasks/061-x" }, { code: "С4", k: 3 }), "061 С4-3")
  assert.equal(T.sessionRef({ project: OWN, n: 61, folder: "doc/tasks/061-x" }, { code: "исп", k: 1 }), "061 исп")
  assert.equal(T.sessionRef({ project: "nova", n: 94 }, { code: "прм", k: 1 }), "094 прм-1")
})

// TH-2: the head of a tab title
const now = Date.now()
const base = { session: "ses_x", role: "worker", state: "owner", since: now - 60_000, question: "Влить?", project: OWN, updated: now, watches: [], asked: [], repo: "proj", pid: process.pid }
const waitRow = (title) => S.waitingRows([{ ...base, title }]).map((r) => r.what).join("\n")
check("TH-2 a first-edition title '#33 исп' is read and shown as '033 исп'", () => {
  assert.match(waitRow("#33 исп название"), /crew-harness 033 исп/)
  assert.ok(!/#33/.test(waitRow("#33 исп название")), waitRow("#33 исп название"))
})
check("TH-2 a title '045 С4-3' stays '045 С4-3'", () => {
  assert.match(waitRow("045 С4-3 план"), /crew-harness 045 С4-3/)
  assert.match(waitRow("022 исп x"), /crew-harness 022 исп/)
  assert.match(waitRow("1000 исп x"), /crew-harness 1000 исп/)
})
check("TH-2 TAB_RE is exported and takes both forms", () => {
  assert.ok(S.TAB_RE, "TAB_RE is not exported")
  assert.ok(S.TAB_RE.test("#33 исп x") && S.TAB_RE.test("045 С4-3 x") && S.TAB_RE.test("1000 исп x") && !S.TAB_RE.test("план x") && !S.TAB_RE.test("12 исп x"))
})

// TH-3
check("TH-3 the title syncTitles builds is '061 исп ...' and differs from a first-edition '#61 исп ...'", () => {
  const t = { project: OWN, n: 61, folder: "doc/tasks/061-x", title: "Канон" }
  const title = `${T.taskNo(t)} исп ${t.title}`
  assert.equal(title, "061 исп Канон")
  assert.notEqual(title, "#61 исп Канон")
  const s = src("index.ts")
  const body = s.slice(s.indexOf("async function syncTitles"), s.indexOf("async function syncTitles") + 6000)
  assert.ok(/sessionRef\(t, ses!\)/.test(body) && /taskNo\(t\)/.test(body), "syncTitles builds the title not through taskNo / sessionRef")
  assert.ok(/c\.titleShown === title/.test(body), "syncTitles compares the title shown with the new one")
})

// TH-4
check("TH-4 the label and the names of folders and branches on disk are the same three digits", () => {
  assert.equal(TN.pad3(61), "061")
  assert.equal(TN.pad3(5), "005")
  assert.equal(T.taskNo({ n: 5 }), TN.pad3(5))
  assert.equal(T.taskNo({ n: 61 }), TN.pad3(61))
})

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
if (fail) {
  console.log(`crew-task-hash.test FAILED: ${fail}`)
  process.exit(1)
}
console.log("crew-task-hash.test ok")
