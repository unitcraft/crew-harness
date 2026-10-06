// Self-test of letters to other machines (node >= 24):  node test/peers-remote.test.mjs
// remote.json routes a project to another machine; the letter waits in outbox and the bridge sends it; one bridge
// per machine (the lock). ntfy: the channel is shared — only our letters are taken, by the project's inbound.
// Tailscale: the sender is named by the network, its may_write limits where it writes, a refusal comes back to the
// sender. A session gets letters only from a machine it wrote to; a letter that cannot leave comes back.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-remote-"))
process.env.XDG_DATA_HOME = tmp
const r = await import("../remote.ts")
mkdirSync(path.dirname(r.REMOTE_FILE), { recursive: true })
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const tick = (ms = 30) => new Promise((res) => setTimeout(res, ms))
const setRemote = async (j) => {
  await tick(20) // the cache goes by mtime
  writeFileSync(r.REMOTE_FILE, JSON.stringify(j))
}

const isLocal = (s) => s === "ses_local1" || s === "ses_local2"
cell("no remote.json: nothing is remote", r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal) === undefined, "routed")
await setRemote({ node: "home", secret: "s", projects: ["site"] })
cell("a bad remote.json is ignored", r.loadRemote() === undefined, "loaded")
cell("problems are named", r.remoteProblems({ node: "home", transport: "tailnet", nodes: { home: { may_write: ["bad role"] } } }).length === 2, JSON.stringify(r.remoteProblems({ node: "home", transport: "tailnet", nodes: { home: { may_write: ["bad role"] } } })))

// ---- ntfy ----
await setRemote({ node: "home", secret: "0123456789abcdef0123", projects: ["site"] })
cell("ntfy: a project of another machine is remote", r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal)?.to_node === "*", "local")
cell("a local project is not", r.remoteRoute({ kind: "role", project: "nova", role: "lead" }, isLocal) === undefined, "remote")
cell("an unknown session is not", r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal) === undefined, "remote")

const sent = []
let deliverIn
let sendResult = () => Promise.resolve()
const fakeTransport = () => ({
  send: (l) => {
    sent.push(l)
    return sendResult(l)
  },
  start: (on) => {
    deliverIn = on
  },
  stop: () => {
    deliverIn = undefined
  },
})
const inbox = []
const notes = []
const logs = []
const deps = {
  deliver: (to, l) => inbox.push({ to, l }),
  exists: (to, id) => inbox.some((x) => x.to === to && x.l.id === id),
  isLocalSession: isLocal,
  isLocalProject: (p) => p === "nova" || p === "open",
  inboundOf: (p) => (p === "open" ? "any" : "integrator"),
  notify: (s, text) => notes.push({ s, text }),
  log: (l) => logs.push(l),
  makeTransport: fakeTransport,
}
const a = r.createRemoteBridge(deps)
const b = r.createRemoteBridge({ ...deps, pid: process.pid + 100000, pidAlive: () => true })
await a.step()
await b.step()
cell("one bridge per machine", a.leading() && !b.leading(), `${a.leading()} ${b.leading()}`)

r.queueRemote({ id: "l1", from_role: "nova.dev", from_session: "ses_local1", to: "site.lead", text: "hi", time: Date.now() }, r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal))
cell("the letter waits in outbox", existsSync(path.join(r.OUTBOX, "l1.json")), "missing")
await a.step()
await tick()
cell("the bridge sends it with the node name", sent.length === 1 && sent[0].from_node === "home" && sent[0].to === "site.lead", JSON.stringify(sent))
cell("and clears outbox", !existsSync(path.join(r.OUTBOX, "l1.json")), "left")
await a.step()
await tick()
cell("a letter is sent once", sent.length === 1, String(sent.length))

const far = (id, to, extra = {}) => ({ id, from_role: "site.lead", from_session: "ses_far1", from_node: "office", to, text: "x", time: Date.now(), ...extra })
deliverIn([far("i1", "nova.integrator"), far("i2", "nova.dev"), far("i3", "open.dev"), far("i4", "site.lead"), far("i5", "other.lead")])
cell("inbound integrator: only the integrator", inbox.some((x) => x.l.id === "i1") && !inbox.some((x) => x.l.id === "i2"), inbox.map((x) => x.l.id).join())
cell("inbound any: any role", inbox.some((x) => x.l.id === "i3"), "refused")
cell("ntfy: letters for other machines are left alone", !inbox.some((x) => x.l.id === "i4" || x.l.id === "i5") && !logs.some((l) => /site\.lead refused|other\.lead/.test(l)), logs.join("\n"))
cell("a refusal is logged", logs.some((l) => l.includes("nova.dev refused")), logs.join("\n"))
deliverIn([far("i1", "nova.integrator")])
cell("a repeat is not delivered twice", inbox.filter((x) => x.l.id === "i1").length === 1, "twice")

cell("the sender's session is remembered", r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal)?.to_node === "*", "unknown")
deliverIn([far("s1", "ses_local1"), far("s2", "ses_local2")])
cell("a session that wrote out gets the answer", inbox.some((x) => x.l.id === "s1"), "refused")
cell("a session that did not — does not", !inbox.some((x) => x.l.id === "s2"), "delivered")

sendResult = () => Promise.reject(new Error("too big"))
r.queueRemote({ id: "big", from_role: "nova.dev", from_session: "ses_local1", to: "site.lead", text: "…", time: Date.now() }, r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal))
await a.step()
await tick()
cell("a failed letter moves to failed/", readdirSync(r.FAILED).includes("big.json") && !existsSync(path.join(r.OUTBOX, "big.json")), "")
cell("and the sender is told", notes.some((n) => n.s === "ses_local1" && n.text.includes("не ушло")), JSON.stringify(notes))
sendResult = () => Promise.resolve()

// ---- Tailscale ----
await setRemote({
  node: "home",
  transport: "tailnet",
  nodes: { "vps-1": { projects: ["site"], may_write: ["nova.integrator", "open.*"] }, "vps-2": { projects: ["shop"], may_write: [] } },
})
await a.step()
cell("tailnet: the transport is rebuilt on a new remote.json", a.leading() && logs.some((l) => l.includes("bridge up (tailnet)")), logs.at(-1))
const toSite = r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal)
const toShop = r.remoteRoute({ kind: "role", project: "shop", role: "lead" }, isLocal)
cell("a project goes to its machine", toSite?.to_node === "vps-1" && toShop?.to_node === "vps-2", `${toSite?.to_node} ${toShop?.to_node}`)

const refusals = (vs) => Object.fromEntries(vs.map((v) => [v.id, v.why ?? ""]))
let vs = refusals(deliverIn([far("t1", "nova.integrator"), far("t2", "open.dev"), far("t3", "nova.dev"), far("t4", "site.lead")], "vps-1"))
cell("may_write: allowed roles pass", vs.t1 === "" && vs.t2 === "", JSON.stringify(vs))
cell("may_write: others are refused with a reason", /may_write/.test(vs.t3) && /проекта site/.test(vs.t4), JSON.stringify(vs))
cell("the machine name comes from the network, not the letter", inbox.find((x) => x.l.id === "t1")?.l.from_node === "vps-1", inbox.find((x) => x.l.id === "t1")?.l.from_node)
vs = refusals(deliverIn([far("t5", "open.dev")], "vps-2"))
cell("another machine has its own may_write", /may_write/.test(vs.t5), JSON.stringify(vs))

r.queueRemote({ id: "q1", from_role: "nova.dev", from_session: "ses_local2", to: "site.lead", text: "?", time: Date.now() }, toSite)
vs = refusals(deliverIn([far("t6", "ses_local2"), far("t7", "ses_local1")], "vps-2"))
cell("a session gets answers only from the machine it wrote to", /не писала машине vps-2/.test(vs.t6), JSON.stringify(vs))
vs = refusals(deliverIn([far("t8", "ses_local2")], "vps-1"))
cell("…and from that machine it does", vs.t8 === "", JSON.stringify(vs))
cell("a reply to a remote session goes to its machine", r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal)?.to_node === "vps-1", JSON.stringify(r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal)))

sendResult = (l) => Promise.resolve({ id: l.id, why: "в site извне — только интегратору (inbound: integrator)" })
await a.step()
await tick()
cell("a refusal there comes back to the sender", notes.some((n) => n.s === "ses_local2" && n.text.includes("не принято") && n.text.includes("vps-1")), JSON.stringify(notes.at(-1)))
cell("and the letter leaves outbox", !existsSync(path.join(r.OUTBOX, "q1.json")), "left")

a.stop()
await b.step()
cell("after stop another process takes the bridge", b.leading(), "not leading")
b.stop()

console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
