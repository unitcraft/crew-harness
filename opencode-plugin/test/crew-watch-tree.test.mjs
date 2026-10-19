// Self-test of the tree of a watch command (task 101; node >= 24, Windows):  node test/crew-watch-tree.test.mjs
// `taskkill /T /F /PID <pid of the watch>` does not reach `timeout.exe` and `sleep.exe` of the command: their Windows parent is a
// dead fork copy of Git Bash (msys), not the watch process. A cancelled gate or build stayed alive, held its slot's work and the
// console of the watch. Now every process of the command carries CREW_WATCH_ID=<id> in its environment, and cancel, the time
// limit and the "cut off" check close exactly the processes with that mark (and their descendants), never anyone else's.
// The command of each probe starts a tree: `sleep`, `bash -c 'timeout .. sleep ..'` (an msys chain) and a native
// Windows program (`cmd /c ping`). Every process is found by a unique number in its command line.
//   1. cancel (cancelWatch) leaves no process of the tree; a neighbour without the mark (same shape, other number) stays alive;
//   2. the time limit (exit code 124) leaves no process of the tree;
//   3. a watch whose own process vanished with no code ("cut off") leaves no process of the tree;
//   4. dropWatch of a watch whose bash is already gone still closes the tree.
// Red probe: before the fix step 1 is red (the processes of the tree stay alive after the cancel).
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"

if (process.platform !== "win32") {
  console.log("crew-watch-tree: skipped: the orphans of the tree are a Windows (msys) matter")
  process.exit(0)
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-watch-tree-"))
process.env.XDG_DATA_HOME = tmp
delete process.env.CREW_WATCH_ID
const w = await import("../watch.ts")
const posted = []
const post = (x, text) => posted.push({ id: x.id, code: x.code, text })
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))
const record = (id) => JSON.parse(readFileSync(path.join(w.WATCHES, `${id}.json`), "utf8"))

// nine digits: six digits happened to occur in the command lines of unrelated programs (Electron apps), and a probe that
// closes "what holds the number" would close them; the image name must be one of ours too
const number = () => String(100000000 + Math.floor(Math.random() * 900000000))
const OURS = /^(sleep|timeout|bash|cmd|ping)(\.exe)?$/i
const used = []

/** Processes whose command line holds the number: [{pid, name}]. The number goes by the environment, not into this command line. */
function find(tok) {
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$env:CREW_TEST_TOK*" -and $_.ProcessId -ne $PID } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`
  const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, env: { ...process.env, CREW_TEST_TOK: tok } })
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => ({ pid: Number(l.split(" ")[0]), name: l.split(" ")[1] }))
    .filter((p) => OURS.test(p.name))
}
const tree = (tok) => `sleep 9000.${tok} & bash -c 'timeout 9000 sleep 8000.${tok}' & (MSYS_NO_PATHCONV=1 cmd /c "ping -n ${tok} 127.0.0.1 >nul") & wait`
const names = (ps) => ps.map((p) => p.name).sort().join(",")

/** Waits until the whole tree of the number is up: sleep x2, timeout, bash, a native ping. */
async function up(tok) {
  for (let i = 0; i < 60; i++) {
    const ps = find(tok)
    if (ps.some((p) => /^ping/i.test(p.name)) && ps.filter((p) => /^sleep/i.test(p.name)).length >= 2) return ps
    await sleepMs(300)
  }
  throw new Error(`the tree of ${tok} did not come up: ${names(find(tok))}`)
}
/** Waits up to ms for no process of the number to be left; returns what is left. */
async function gone(tok, ms = 10_000) {
  const end = Date.now() + ms
  let ps = find(tok)
  while (ps.length && Date.now() < end) {
    await sleepMs(500)
    ps = find(tok)
  }
  return ps
}
function cleanup() {
  for (const tok of used) {
    try {
      const ps = find(tok)
      if (ps.length) execFileSync("taskkill", ["/F", ...ps.flatMap((p) => ["/PID", String(p.pid)])], { stdio: "ignore", windowsHide: true })
    } catch {}
  }
}
const fresh = () => {
  const t = number()
  used.push(t)
  return t
}

// the neighbour: the same shape of a process, started by hand, with no mark of any watch
const nTok = fresh()
const neighbour = spawn(w.gitBash(), ["-c", `sleep 7000.${nTok}`], { detached: true, stdio: "ignore", windowsHide: true })
neighbour.unref()

try {
  const nb = await (async () => {
    for (let i = 0; i < 30; i++) {
      const ps = find(nTok)
      if (ps.length) return ps
      await sleepMs(300)
    }
    throw new Error("the neighbour did not start")
  })()
  assert.ok(nb.length >= 1)

  // 0. the command sees the mark of its watch, and a normal exit kills nothing (a background process left by the command stays)
  {
    const tok = fresh()
    const z = w.requestWatch({ session: "sesZ", command: `echo "mark=$CREW_WATCH_ID"; (sleep 40.${tok} &) ; true`, cwd: tmp, note: "mark" })
    for (let i = 0; i < 100 && !posted.some((p) => p.id === z.id); i++) {
      w.pollWatches(post)
      await sleepMs(200)
    }
    const p = posted.find((x) => x.id === z.id)
    assert.ok(p, "the letter of the mark watch came")
    assert.equal(p.code, 0)
    assert.equal(readFileSync(path.join(w.WATCHES, `${z.id}.out`), "utf8").trim(), `mark=${z.id}`, "CREW_WATCH_ID is the id of the watch")
    assert.ok(find(tok).length >= 1, "a normal exit does not touch what the command left in the background")
    console.log("ok  the command sees CREW_WATCH_ID; a normal exit kills nothing")
  }

  // 1. cancel: the whole tree goes, the neighbour stays
  {
    const tok = fresh()
    const a = w.requestWatch({ session: "sesT", command: tree(tok), cwd: tmp, note: "tree cancel" })
    w.pollWatches(post)
    const alive = await up(tok)
    const r = w.cancelWatch(a.id, "sesT")
    assert.ok(r.ok, r.text)
    const left = await gone(tok)
    assert.deepEqual(left, [], `cancel left processes of the tree alive: ${names(left)} (was ${names(alive)})`)
    assert.ok(find(nTok).length >= 1, "the neighbour without the mark is not touched")
    const rec = record(a.id)
    assert.equal(rec.status, "done")
    assert.equal(rec.cancelled, true)
    assert.equal(rec.code, null)
    console.log(`ok  cancel closes the whole tree (${names(alive)}); the neighbour stays`)
  }

  // 2. the time limit: the watch is put with a limit of 24 s (the tool's minimum is a minute; under load the tree needs seconds to come up)
  {
    const tok = fresh()
    const id = `${Date.now()}-limit`
    const req = { id, session: "sesL", command: tree(tok), cwd: tmp, note: "tree limit", minutes: 0.4, created: Date.now(), status: "requested" }
    writeFileSync(path.join(w.WATCHES, `${id}.req.json`), JSON.stringify(req))
    w.pollWatches(post)
    await up(tok)
    for (let i = 0; i < 300 && !posted.some((p) => p.id === id); i++) {
      w.pollWatches(post)
      await sleepMs(200)
    }
    const p = posted.find((x) => x.id === id)
    assert.ok(p, "the letter of the limit came")
    assert.equal(p.code, 124)
    const left = await gone(tok)
    assert.deepEqual(left, [], `the time limit left processes of the tree alive: ${names(left)}`)
    assert.ok(find(nTok).length >= 1, "the neighbour is not touched by the limit")
    console.log("ok  the time limit (124) closes the whole tree")
  }

  // 3. cut off: the own process of the watch is gone without a code, the tree is not
  {
    const tok = fresh()
    const a = w.requestWatch({ session: "sesC", command: tree(tok), cwd: tmp, note: "tree cut off" })
    w.pollWatches(post)
    await up(tok)
    const rec = record(a.id)
    execFileSync("taskkill", ["/F", "/PID", String(rec.pid)], { stdio: "ignore", windowsHide: true })
    w.pollWatches(post, () => {}, Date.now() + 11_000)
    const p = posted.find((x) => x.id === a.id)
    assert.ok(p, "the letter of the cut off watch came")
    assert.equal(p.code, null)
    assert.match(p.text, /ОБОРВАНО/)
    const left = await gone(tok)
    assert.deepEqual(left, [], `a cut off watch left processes of the tree alive: ${names(left)}`)
    assert.ok(find(nTok).length >= 1, "the neighbour is not touched by the cut off check")
    console.log("ok  a cut off watch: the tree is closed")
  }

  // 4. dropWatch of a watch whose bash is already gone
  {
    const tok = fresh()
    const a = w.requestWatch({ session: "sesD", command: tree(tok), cwd: tmp, note: "tree drop" })
    w.pollWatches(post)
    await up(tok)
    const rec = record(a.id)
    execFileSync("taskkill", ["/F", "/PID", String(rec.pid)], { stdio: "ignore", windowsHide: true })
    w.dropWatch(rec)
    const left = await gone(tok)
    assert.deepEqual(left, [], `dropWatch left processes of the tree alive: ${names(left)}`)
    assert.ok(find(nTok).length >= 1, "the neighbour is not touched by dropWatch")
    console.log("ok  dropWatch closes the tree although the bash of the watch is gone")
  }
  console.log("crew-watch-tree: ok")
} finally {
  cleanup()
}
