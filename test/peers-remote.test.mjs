// Self-test of letters to other machines (node >= 24):  node test/peers-remote.test.mjs
// remote.json routes a project to the channel; the letter waits in outbox and the bridge sends it; one bridge per
// machine (the lock); incoming letters are taken only when they are ours and the project's inbound allows them;
// a session gets letters only after it wrote to another machine; a letter too big for the channel comes back.
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

const isLocal = (s) => s === "ses_local1" || s === "ses_local2"
cell("no remote.json: nothing is remote", r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal) === undefined, "routed")
writeFileSync(r.REMOTE_FILE, JSON.stringify({ node: "home", secret: "s", projects: ["site"] }))
cell("a bad remote.json is ignored", r.loadRemote() === undefined && r.remoteProblems({ node: "home", secret: "s", projects: [] }).length === 1, "")
await tick(20) // mtime must change for the cache
writeFileSync(r.REMOTE_FILE, JSON.stringify({ node: "home", secret: "0123456789abcdef0123", projects: ["site"] }))
cell("a project of another machine is remote", r.remoteRoute({ kind: "role", project: "site", role: "lead" }, isLocal)?.node === "home", "local")
cell("a local project is not", r.remoteRoute({ kind: "role", project: "nova", role: "lead" }, isLocal) === undefined, "remote")
cell("an unknown session is not", r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal) === undefined, "remote")

// the bridge with a fake channel
const sent = []
let deliverIn
let failNextSend
const fakeTransport = () => ({
  send: (l) => {
    if (failNextSend) {
      failNextSend = false
      return Promise.reject(new Error("too big"))
    }
    sent.push(l)
    return Promise.resolve()
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

const cfg = r.loadRemote()
r.queueRemote({ id: "l1", from_role: "nova.dev", from_session: "ses_local1", to: "site.lead", text: "hi", time: Date.now() }, cfg)
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
cell("letters for other machines are left alone", !inbox.some((x) => x.l.id === "i4" || x.l.id === "i5") && !logs.some((l) => /i4|site\.lead refused|other\.lead/.test(l)), logs.join("\n"))
cell("a refusal is logged", logs.some((l) => l.includes("nova.dev refused")), logs.join("\n"))
deliverIn([far("i1", "nova.integrator")])
cell("a repeat is not delivered twice", inbox.filter((x) => x.l.id === "i1").length === 1, "twice")

cell("the sender's session is remembered", r.remoteRoute({ kind: "session", session: "ses_far1" }, isLocal)?.node === "home", "unknown")
deliverIn([far("s1", "ses_local1"), far("s2", "ses_local2")])
cell("a session that wrote out gets the answer", inbox.some((x) => x.l.id === "s1"), "refused")
cell("a session that did not — does not", !inbox.some((x) => x.l.id === "s2"), "delivered")

failNextSend = true
r.queueRemote({ id: "big", from_role: "nova.dev", from_session: "ses_local1", to: "site.lead", text: "…", time: Date.now() }, cfg)
await a.step()
await tick()
cell("a failed letter moves to failed/", readdirSync(r.FAILED).includes("big.json") && !existsSync(path.join(r.OUTBOX, "big.json")), "")
cell("and the sender is told", notes.some((n) => n.s === "ses_local1" && n.text.includes("не ушло")), JSON.stringify(notes))

a.stop()
await b.step()
cell("after stop another process takes the bridge", b.leading(), "not leading")
b.stop()

console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
