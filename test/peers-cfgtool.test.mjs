// Self-test of peer_config (plan 002, Ph.6; node >= 24):  node test/peers-cfgtool.test.mjs
// The settings live in a settings repository (a real git repo here). guide covers every key of the schema with the
// current value and its source; show names the source of each value (default, the committed file, the local option)
// and the uncommitted edits; set is the integrator's, checks every value (a wrong value or an unknown key -> nothing
// written), writes the working copy; the new value applies only once committed.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-cfgtool-"))
process.env.XDG_DATA_HOME = path.join(tmp, "data")
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
process.env.NOVA_PEERS_SETTINGS_TTL_MS = "1"
process.env.NOVA_PEERS_PRESENCE = "all"
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const root = path.join(tmp, "proj")
const cfgDir = path.join(root, "proj-settings")
const work = path.join(root, "repo")
mkdirSync(path.join(cfgDir, ".opencode"), { recursive: true })
mkdirSync(work, { recursive: true })
const file = path.join(cfgDir, ".opencode", "opencode-peers.json")
git(cfgDir, "init", "-q", "-b", "main")
writeFileSync(file, JSON.stringify({ project: "proj", root: "..", cleanup: "local" }, null, 2))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "settings")

const mod = await import("../index.ts")
const core = await import("../core.ts")
const { SCHEMA_KEYS } = await import("../config-schema.ts")
const hooks = {}
const tools = {}
const ctx = {
  location: { directory: work },
  options: { projects: [cfgDir], local: { proj: { spawn_models: { light: "kimi/k3" } } } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: work }, time: {} }),
    prompt: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const call = async (sid, input) => (await tools.peer_config.execute(input, { sessionID: sid })).content
for (const s of ["sesINT", "sesWRK"]) await hooks.context({ sessionID: s, system: [], model: { id: "x", providerID: "y" } })
await tools.peer_role.execute({ role: "integrator" }, { sessionID: "sesINT" })

// guide: every key of the schema, with the current value and source
const guide = await call("sesWRK", { action: "guide" })
const missing = SCHEMA_KEYS.filter((k) => !guide.includes(`- ${k}:`))
cell("guide covers every key of the schema", missing.length === 0, JSON.stringify(missing))
cell("guide shows the current value and where it comes from", /- cleanup: .*Сейчас: local \(файл, ветка main\)/.test(guide), guide.split("\n").find((l) => l.includes("- cleanup:")))
cell("guide numbers the options and recommends", /1\) none  2\) local  3\) local\+remote/.test(guide) && /Рекомендация: local\+remote/.test(guide), "no options")
// every key the plugin reads is in the schema (and so in the questionnaire)
const cfg = core.loadConfig(work)
cell("the project settings are read from the repo", cfg.cleanup === "local" && cfg.spawnModels.light === "kimi/k3", JSON.stringify({ c: cfg.cleanup, m: cfg.spawnModels }))

// show: sources
const show = await call("sesWRK", { action: "show" })
cell("show: a committed value -> the file", /cleanup = "local" — файл, ветка main/.test(show), show)
cell("show: an unset value -> default", /reviewer = "worker" — по умолчанию/.test(show), show)
cell("show: the local option -> opencode.jsonc", /spawn_models = .*kimi\/k3.* — local в opencode\.jsonc/.test(show), show)

// set: the integrator's; a wrong value or an unknown key -> nothing written
const notInt = await call("sesWRK", { action: "set", values: { inflight_limit: 4 } })
cell("set by a worker is refused", /только интегратор/.test(notInt), notInt)
const before = readFileSync(file, "utf8")
const bad = await call("sesINT", { action: "set", values: { cleanup: "everything", nope: 1, inflight_limit: 4 } })
cell("a wrong value and an unknown key are both named", /cleanup: одно из none \/ local \/ local\+remote/.test(bad) && /неизвестный ключ «nope»/.test(bad), bad)
cell("the file is untouched after a refused set", readFileSync(file, "utf8") === before, "changed")
const acc = await call("sesINT", { action: "set", values: { acceptance: [{ id: "tests", text: "x" }, { id: "tests", text: "y" }] } })
cell("acceptance with repeated ids is refused", /id без повторов/.test(acc), acc)

// a good set: written to the working copy, applies only after the commit
const ok = await call("sesINT", { action: "set", values: { inflight_limit: 4, help_extra: "ABC-LINE", cleanup: null } })
cell("a good set writes the working copy", /Записано/.test(ok) && JSON.parse(readFileSync(file, "utf8")).inflight_limit === 4 && !("cleanup" in JSON.parse(readFileSync(file, "utf8"))), ok)
cell("the file keeps the other keys", JSON.parse(readFileSync(file, "utf8")).project === "proj", readFileSync(file, "utf8"))
const pend = await call("sesWRK", { action: "show" })
cell("show lists the uncommitted keys", /Незакоммичено.*inflight_limit/.test(pend) && /help_extra/.test(pend) && /cleanup/.test(pend), pend)
cell("until the commit the old values apply", core.loadConfig(work).inflightLimit === 6 && core.loadConfig(work).cleanup === "local", JSON.stringify(core.loadConfig(work).inflightLimit))
git(cfgDir, "add", "-A")
git(cfgDir, "commit", "-q", "-m", "set")
const after = core.loadConfig(work)
cell("after the commit the new values apply", after.inflightLimit === 4 && after.cleanup === "local+remote" && after.helpExtra === "ABC-LINE", JSON.stringify({ i: after.inflightLimit, c: after.cleanup }))
cell("no uncommitted keys after the commit", !/Незакоммичено/.test(await call("sesWRK", { action: "show" })), "still pending")

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-cfgtool.test: FAIL ${fail}` : "peers-cfgtool.test ok")
process.exit(fail ? 1 : 0)
