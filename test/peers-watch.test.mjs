// Self-test of peer_watch (provider plan 002; node >= 24):  node test/peers-watch.test.mjs
// A watch is a file; the plugin's pass starts its command detached in Git Bash and, when the exit code appears,
// posts one letter: code, output tail. A command gone with no exit code -> "ОБОРВАНО". The time limit -> 124.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-watch-"))
process.env.XDG_DATA_HOME = tmp
const w = await import("../watch.ts")
const posted = []
const post = (x, text) => posted.push({ session: x.session, text, code: x.code })
const until = async (cond, ms = 20_000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout")
    w.pollWatches(post)
    await new Promise((r) => setTimeout(r, 200))
  }
}

// 1. a command that waits, prints and exits 3; quotes inside survive
const a = w.requestWatch({ session: "sesA", command: `sleep 1; echo "it's done"; exit 3`, cwd: tmp, note: "gate" })
assert.equal(a.minutes, w.WATCH_DEFAULT_MIN)
assert.equal(w.pollWatches(post), 1) // started
assert.equal(w.watchesOf("sesA").length, 1)
assert.equal(w.watchesOf("sesA")[0].status, "running")
await until(() => posted.length === 1)
assert.equal(posted[0].session, "sesA")
assert.equal(posted[0].code, 3)
assert.match(posted[0].text, /«gate» закончилось: код выхода 3/)
assert.match(posted[0].text, /it's done/)
assert.equal(w.watchesOf("sesA").length, 0) // done
w.pollWatches(post)
assert.equal(posted.length, 1) // one letter only

// 2. gone without an exit code (a machine reboot): "ОБОРВАНО"
const gone = { id: "1-gone", session: "sesB", command: "sleep 999", cwd: tmp, minutes: 5, created: Date.now() - 60_000, started: Date.now() - 60_000, status: "running", pid: 999999 }
writeFileSync(path.join(w.WATCHES, "1-gone.json"), JSON.stringify(gone))
w.pollWatches(post)
assert.equal(posted.length, 2)
assert.equal(posted[1].code, null)
assert.match(posted[1].text, /ОБОРВАНО/)

// 3. limits and texts
assert.equal(w.requestWatch({ session: "s", command: "true", cwd: tmp, minutes: 99999 }).minutes, w.WATCH_MAX_MIN)
assert.match(w.watchLetter({ id: "x", session: "s", command: "c", cwd: tmp, minutes: 5, created: 0, started: 0, ended: 300_000, status: "done", code: 124 }, ""), /истекло время \(5 мин\)/)
assert.equal(w.tailOf(Array.from({ length: 50 }, (_, i) => `l${i}`).join("\n")).split("\n")[0], "l20")
// 4. Git Bash, not WSL's
if (process.platform === "win32") assert.ok(!/System32/i.test(w.gitBash()) && existsSync(w.gitBash()), w.gitBash())
await until(() => posted.length === 3) // the "true" watch from 3.

// 5. the machine queue (plan 005): heavy commands of one project one at a time (machine_slots 1), in order;
// another project's heavy command and an ordinary watch do not wait; slots 0 = no limit
const running = (id) => JSON.parse(readFileSync(path.join(w.WATCHES, `${id}.json`), "utf8")).status === "running"
const started = (id) => existsSync(path.join(w.WATCHES, `${id}.json`))
const h1 = w.requestWatch({ session: "sesM", command: "sleep 3", cwd: tmp, machine: true, project: "P" }, Date.now())
const h2 = w.requestWatch({ session: "sesM", command: "true", cwd: tmp, machine: true, project: "P", note: "second" }, Date.now() + 1)
const hq = w.requestWatch({ session: "sesQ", command: "sleep 1", cwd: tmp, machine: true, project: "Q" }, Date.now() + 2)
const plain = w.requestWatch({ session: "sesM", command: "true", cwd: tmp }, Date.now() + 3)
w.pollWatches(post, () => {}, Date.now(), () => 1)
assert.ok(started(h1.id) && running(h1.id), "the first heavy command starts")
assert.ok(!started(h2.id), "the second of the same project waits")
assert.ok(started(hq.id), "another project's heavy command does not wait")
assert.ok(started(plain.id), "an ordinary watch does not wait")
assert.deepEqual(w.machineQueue("P").map((x) => x.id), [h2.id])
assert.equal(w.watchesOf("sesM").find((x) => x.id === h2.id)?.status, "requested") // /peers shows it queued
for (let i = 0; i < 100 && !started(h2.id); i++) {
  w.pollWatches(post, () => {}, Date.now(), () => 1)
  await new Promise((r) => setTimeout(r, 200))
}
assert.ok(started(h2.id), "the second starts once the first is done")
const z1 = w.requestWatch({ session: "sesZ", command: "sleep 2", cwd: tmp, machine: true, project: "Z" })
const z2 = w.requestWatch({ session: "sesZ", command: "sleep 2", cwd: tmp, machine: true, project: "Z" }, Date.now() + 1)
w.pollWatches(post, () => {}, Date.now(), () => 0)
assert.ok(started(z1.id) && started(z2.id), "machine_slots 0: no limit")
console.log("peers-watch: ok")
