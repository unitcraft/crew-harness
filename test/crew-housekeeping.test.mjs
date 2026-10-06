// Self-test of housekeeping (node >= 24):  node test/crew-housekeeping.test.mjs
// Read letters older than keep_days are removed, their ids stay (no repeated letters); the shared log rotates.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-house-"))
process.env.XDG_DATA_HOME = tmp
const hk = await import("../housekeeping.ts")
const core = await import("../core.ts")
const tasks = await import("../tasks.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const box = path.join(core.READ, "sesA")
mkdirSync(box, { recursive: true })
const put = (id, ageDays) => {
  const f = path.join(box, `${id}.json`)
  writeFileSync(f, "{}")
  const t = (Date.now() - ageDays * 86_400_000) / 1000
  utimesSync(f, t, t)
}
put("review-proj-1-1", 10)
put("old-2", 8)
put("fresh-3", 1)
const removed = hk.sweepRead(core.READ, 7 * 86_400_000)
cell("letters older than keep_days are removed, fresh ones stay", removed === 2 && existsSync(path.join(box, "fresh-3.json")) && !existsSync(path.join(box, "old-2.json")), JSON.stringify({ removed, left: readdirSync(box) }))
cell("a removed letter still counts as sent (no repeat)", tasks.letterExists("sesA", "review-proj-1-1") && tasks.letterExists("sesA", "fresh-3") && !tasks.letterExists("sesA", "never-sent"), "lost")
cell("a second sweep removes nothing more", hk.sweepRead(core.READ, 7 * 86_400_000) === 0, "removed again")

const log = path.join(tmp, "big.log")
writeFileSync(log, "x".repeat(2_000))
cell("a log under the limit stays", !hk.rotateLog(log, 5_000) && statSync(log).size === 2_000, "rotated")
writeFileSync(log, "x".repeat(6_000))
cell("a log over the limit goes to .1", hk.rotateLog(log, 5_000) && !existsSync(log) && statSync(`${log}.1`).size === 6_000, "not rotated")

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-housekeeping.test: FAIL ${fail}` : "crew-housekeeping.test ok")
process.exit(fail ? 1 : 0)
