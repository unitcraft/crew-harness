// Self-test of peer_watch (provider plan 002; node >= 24):  node test/peers-watch.test.mjs
// A watch is a file; the plugin's pass starts its command detached in Git Bash and, when the exit code appears,
// posts one letter: code, output tail. A command gone with no exit code -> "ОБОРВАНО". The time limit -> 124.
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
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
console.log("peers-watch: ok")
