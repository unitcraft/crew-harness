// Self-test of the constant system hint of a tab (node >= 24):  node test/crew-system-hint.test.mjs
// The plugin pushes one text into the system part of every request of a tab. It must name the role and the address, tell
// the model to ask the owner by the question tool, and stay byte-identical between requests (a change re-bills the history).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-hint-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all"
process.env.CREW_HARNESS_POLL_MS = "100"
const cards = path.join(tmp, "opencode", "crew-harness", "cards")
mkdirSync(cards, { recursive: true })
const card = (session, role) =>
  writeFileSync(path.join(cards, `${session}.json`), JSON.stringify({ session, role, auto: false, title: "", directory: process.cwd(), repo: "nova", pid: process.pid, updated: Date.now() }))
card("sesHINT01", "carina")

const mod = await import("../index.ts")
const hooks = {}
const ctx = {
  location: { directory: process.cwd() },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, location: { directory: process.cwd() } }),
    prompt: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async () => {} },
}
const stop = await mod.default.setup(ctx)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const hint = async () => {
  const ev = { sessionID: "sesHINT01", system: [] }
  await hooks.context(ev)
  return ev.system.map((x) => x.text).join("\n")
}
const h1 = await hint()
const h2 = await hint()
cell("the hint names the tab and its role", /crew-harness: ты — вкладка с ролью «carina»/.test(h1), h1)
cell("the hint tells to ask the owner by the question tool", /инструментом question/.test(h1) && /\(Recommended\)/.test(h1), h1)
cell("the hint forbids a prose question at the end of the answer", /вопрос прозой в конце ответа не задавай/.test(h1), h1)
cell("the hint is byte-identical between requests", h1 === h2 && h1.length > 0, `${h1.length} vs ${h2.length}`)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-system-hint.test: FAIL ${fail}` : "crew-system-hint.test ok")
process.exit(fail ? 1 : 0)
