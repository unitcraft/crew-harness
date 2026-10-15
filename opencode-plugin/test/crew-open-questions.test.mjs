// Self-test of overdue open questions in crew_doctor (node >= 24):  node test/crew-open-questions.test.mjs
// The number comes from the project's own guard script (check-open-questions.py --overdue); the plugin does not count by itself.
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { OQ_FILE, OQ_SCRIPT, overdueProblems } from "../open-questions.ts"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-oq-"))
const mk = (name, withFile = true, withScript = true) => {
  const root = path.join(tmp, name)
  mkdirSync(path.join(root, ...OQ_SCRIPT.slice(0, -1)), { recursive: true })
  mkdirSync(path.join(root, ...OQ_FILE.slice(0, -1)), { recursive: true })
  if (withScript) writeFileSync(path.join(root, ...OQ_SCRIPT), "")
  if (withFile) writeFileSync(path.join(root, ...OQ_FILE), "")
  return { name, root, rootPath: root }
}
try {
  const calls = []
  const fake = (answer) => async (file, args) => {
    calls.push([file, ...args])
    if (answer instanceof Error) throw answer
    return answer
  }
  // the same script with --overdue is called for the project root
  const a = mk("a")
  assert.deepEqual(await overdueProblems([a], fake("просрочено: 0\n")), [], "zero overdue says nothing")
  assert.equal(calls[0][0], "python")
  assert.deepEqual(calls[0].slice(1), [path.join(a.root, ...OQ_SCRIPT), "--root", a.root, "--overdue"])
  const two = await overdueProblems([a], fake("просрочено: 2\n#1 x — срок 2026-11-15\n#3 y — срок 2026-11-01\n"))
  assert.equal(two.length, 1)
  assert.match(two[0], /^a: просрочено открытых вопросов: 2 .*#1 x .*; #3 y/, "number and list from the script")
  // a project without the file or the script is silent and not called
  calls.length = 0
  assert.deepEqual(await overdueProblems([mk("b", false), mk("c", true, false)], fake("просрочено: 5\n")), [])
  assert.equal(calls.length, 0, "no call without the file and the script")
  // a failure or a wrong form is a problem, not silence
  assert.match((await overdueProblems([a], fake(new Error("boom"))))[0], /не удалось сосчитать/)
  assert.match((await overdueProblems([a], fake("что-то\n")))[0], /не по форме/)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log("crew-open-questions.test ok")
