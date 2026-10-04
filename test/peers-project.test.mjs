// Self-test of projects in opencode-peers (node >= 24):  node test/peers-project.test.mjs
// Projects come from the plugin options (one list); a window belongs to the project with the longest
// matching root. Addresses: role (own project), project.role, project.all. Exclusive roles are per project.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-project-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_VIEWERS ??= "open" // windows taken as open (the window rule has its own test)
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
const root = path.join(tmp, "src")
const dirs = {
  A: path.join(root, "nova", "repo-a"), // project nova
  B: path.join(root, "nova", "repo-b"), // project nova, another repository
  C: path.join(root, "nova", "limits"), // nested project limits (longest root wins)
}
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const dirOf = { sesAAAAAA: dirs.A, sesBBBBBB: dirs.B, sesCCCCCC: dirs.C }

const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
const hooks = {}
const tools = {}
const delivered = []
const ctx = {
  location: { directory: root },
  options: { projects: { nova: path.join(root, "nova"), limits: dirs.C, "Bad Name": root } },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: dirOf[sessionID] } }),
    prompt: async ({ sessionID, text }) => delivered.push({ sessionID, text }),
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
const call = async (tool, sessionID, input = {}) => tools[tool].execute(input, { sessionID })
const wait = () => new Promise((r) => setTimeout(r, 300))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t)).length

// pure helpers
const P = mod.parseProjects(ctx.options)
cell("invalid project name is ignored", P.length === 2 && !P.some((p) => p.name.includes(" ")), JSON.stringify(P))
cell("longest root wins", mod.projectOf(dirs.C, P) === "limits" && mod.projectOf(dirs.A, P) === "nova", `${mod.projectOf(dirs.C, P)} ${mod.projectOf(dirs.A, P)}`)
cell("outside the list -> repository name", mod.projectOf(path.join(tmp, "elsewhere", "my_Repo"), P) === "my-repo", mod.projectOf(path.join(tmp, "elsewhere", "my_Repo"), P))

// A and B in nova, C in limits: integrator is exclusive PER PROJECT
const ra = await call("peer_role", "sesAAAAAA", { role: "integrator" })
const rc = await call("peer_role", "sesCCCCCC", { role: "integrator" })
cell("integrator of nova", /nova\.integrator/.test(ra.content), ra.content)
cell("integrator of limits is not blocked by nova's", /limits\.integrator/.test(rc.content) && !/занята/.test(rc.content), rc.content)
const rb = await call("peer_role", "sesBBBBBB", { role: "integrator" })
cell("second integrator inside nova is refused", /занята/.test(rb.content), rb.content)
await call("peer_role", "sesBBBBBB", { role: "worker" })

// unqualified role = own project
await call("peer_send", "sesBBBBBB", { to: "integrator", text: "own-project" })
await wait()
cell("'integrator' from nova reaches nova's integrator only", got("sesAAAAAA", "own-project") === 1 && got("sesCCCCCC", "own-project") === 0, JSON.stringify(delivered))

// project.role crosses projects; the sender signs with its full address
await call("peer_send", "sesBBBBBB", { to: "limits.integrator", text: "cross-project" })
await wait()
const cross = delivered.find((d) => d.sessionID === "sesCCCCCC" && d.text.includes("cross-project"))
cell("limits.integrator reaches the other project", !!cross, JSON.stringify(delivered))
cell("the letter is signed nova.worker", !!cross && /от nova\.worker/.test(cross.text), cross?.text)

// all = own project; project.all = that project
await call("peer_send", "sesAAAAAA", { to: "all", text: "to-all-nova" })
await call("peer_send", "sesAAAAAA", { to: "limits.all", text: "to-all-limits" })
await wait()
cell("all stays inside the project", got("sesBBBBBB", "to-all-nova") === 1 && got("sesCCCCCC", "to-all-nova") === 0, JSON.stringify(delivered))
cell("limits.all reaches only limits", got("sesCCCCCC", "to-all-limits") === 1 && got("sesBBBBBB", "to-all-limits") === 0, JSON.stringify(delivered))

// peer_list: own project by default, every project with all
const own = (await call("peer_list", "sesAAAAAA")).content
const every = (await call("peer_list", "sesAAAAAA", { all: true })).content
cell("peer_list shows own project only", /nova\.integrator/.test(own) && /nova\.worker/.test(own) && !/limits\./.test(own) && /ещё 1 окон/.test(own), own)
cell("peer_list all shows every project", /limits\.integrator/.test(every), every)

// a bad address is refused, not delivered
const bad = await call("peer_send", "sesAAAAAA", { to: "No Such.x", text: "bad" })
cell("invalid project in the address is refused", /не годится/.test(bad.content), bad.content)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-project.test: FAIL ${fail}` : "peers-project.test ok")
process.exit(fail ? 1 : 0)
