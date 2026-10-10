// Self-test: the delivery loop survives the removal of its owner instance (node >= 24):  node test/crew-loop-handover.test.mjs
// OpenCode creates one plugin instance per project directory and removes them one by one; the loop is ONE per process
// and belongs to the instance set up last. Case of 2026-10-10: the owner (directory D) was removed while the instance of
// the integrator's directory N lived on -> no pass ran for 32 minutes, a letter to an open idle tab stayed in the inbox.
// The test sets up N, then D, removes D, and writes a letter BY HAND into the role mailbox (a file, not crew_send) for a
// tab open in a live window (real presence, not CREW_HARNESS_PRESENCE=all). Probe: CREW_MODULE=<copy of the old index.ts>
// (the old plugin has no hand-over) makes the delivery cells go red.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-handover-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
delete process.env.CREW_HARNESS_PRESENCE
const base = path.join(tmp, "opencode", "crew-harness")
const SES = "ses_efdd2dc2effePXj0L8WPrxkIJN"
const dirN = path.join(tmp, "nova")
const dirD = path.join(tmp, "crew-harness")
for (const d of [dirN, dirD, path.join(base, "cards"), path.join(base, "windows")]) mkdirSync(d, { recursive: true })
writeFileSync(path.join(base, "cards", `${SES}.json`), JSON.stringify({ session: SES, role: "integrator", auto: false, title: "", directory: dirN, repo: "nova", project: "nova", pid: process.pid, updated: Date.now(), busy: false }))
const beat = () => writeFileSync(path.join(base, "windows", "56032.json"), JSON.stringify({ pid: 56032, beat: Date.now(), route: SES, tabs: [{ sessionID: SES, active: true, busy: false, title: "t" }] }))
beat()
const heart = setInterval(beat, 200)

const mod = await import(process.env.CREW_MODULE ?? "../index.ts")
const delivered = []
const host = (name, dir) => ({
  location: { directory: dir },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, location: { directory: dir } }),
    prompt: async ({ sessionID, text }) => delivered.push({ by: name, sessionID, text }),
    synthetic: async ({ sessionID, text }) => delivered.push({ by: name, sessionID, text }),
    hook: async () => {},
  },
  tool: { transform: async () => {} },
})
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 1200) => new Promise((r) => setTimeout(r, ms))
const box = path.join(base, "inbox", "nova_integrator")
const handWritten = (id, wake) => {
  mkdirSync(box, { recursive: true })
  writeFileSync(path.join(box, `${id}.json`), JSON.stringify({ id, from_role: "crew-harness.integrator", from_session: "ses_ee370751dffeztE2CBAcS8ip6m", to: "nova.integrator", text: id, time: Date.now(), wake }, null, 1))
}
const got = (id) => delivered.find((d) => d.text.includes(id))
const left = () => (existsSync(box) ? readdirSync(box).join(",") : "")

const stopN = await mod.default.setup(host("N", dirN))
const stopD = await mod.default.setup(host("D", dirD)) // set up last: owns the loop

// 1. the plain case: a hand-written letter is delivered (it is not the letter's format that matters)
handWritten("hand-1", true)
await wait()
cell("a hand-written letter to an open idle tab is delivered", !!got("hand-1"), `delivered ${JSON.stringify(delivered.map((d) => d.text.slice(-12)))} inbox ${left()}`)

// 2. the owner D is removed by the host while N lives on: the loop moves to N
stopD()
delivered.length = 0
handWritten("hand-2", true)
await wait()
cell("after the loop owner is removed, a letter is still delivered", !!got("hand-2"), `inbox ${left()}`)
cell("by the instance that stayed", got("hand-2")?.by === "N", JSON.stringify(got("hand-2")))

// 3. removing an instance that does not own the loop leaves the loop alone
const stopD2 = await mod.default.setup(host("D2", dirD)) // owner again
stopN() // N was superseded: not the owner
handWritten("hand-3", true)
await wait()
cell("removing a superseded instance does not stop the loop", got("hand-3")?.by === "D2", `inbox ${left()} ${JSON.stringify(got("hand-3"))}`)

// 4. the last instance removed: nothing is left to run, and a new setup starts the loop again
stopD2()
delivered.length = 0
handWritten("hand-4", true)
await wait(600)
cell("with no instance left nothing delivers", !got("hand-4"), JSON.stringify(got("hand-4")))
const stopN2 = await mod.default.setup(host("N2", dirN))
await wait()
cell("a new instance picks the letter up", got("hand-4")?.by === "N2", `inbox ${left()}`)

clearInterval(heart)
stopN2?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-loop-handover.test: FAIL ${fail}` : "crew-loop-handover.test ok")
process.exit(fail ? 1 : 0)
