// Self-test: reading the tip of the target branch (task 005, REQ-09; AC-11, AC-20, AC-32 at the level of originTip; node >= 24):
//   node test/crew-landing-tip.test.mjs
// Heavy (network cases, up to 20 s each; they run in parallel, about one term in all): run it alone, after the other tests.
// The plugin reads the tip with `git ls-remote` under its own timer and kills the process tree of its own launch by the process
// number when the term runs out (never by name or mask); after the term no git process with the address of the case remains.
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const PLUGIN = process.env.CREW_PLUGIN_DIR ?? path.join(import.meta.dirname, "..")
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-landing-tip-"))
const { originTip, hasOrigin, killTree, TIP_TIMEOUT_MS } = await import(pathToFileURL(path.join(PLUGIN, "precheck.ts")).href)

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()

/** a work repository with one commit on main and the given origin url (or none) */
const mkRepo = (name, origin) => {
  const dir = path.join(tmp, name)
  mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  writeFileSync(path.join(dir, "a.txt"), name)
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "init")
  if (origin) git(dir, "remote", "add", "origin", origin)
  return dir
}
/** a bare origin with main (and optionally only other branches) */
const mkBare = (name, branch = "main") => {
  const bare = path.join(tmp, `${name}.git`)
  execFileSync("git", ["init", "-q", "--bare", "-b", branch, bare], { stdio: "ignore" })
  const w = mkRepo(`${name}-seed`, bare)
  git(w, "branch", "-M", branch)
  git(w, "push", "-q", "origin", branch)
  return { bare, seed: w }
}

// ---- the work cases on a local origin (a file path)
const { bare, seed } = mkBare("good")
const work = mkRepo("work", bare)
const head0 = git(seed, "rev-parse", "main")
const r0 = await originTip(work, "main")
cell("AC-32 tip: the tip of main on a local origin is the full hash", r0.ok && r0.tip === head0 && r0.source === "origin", JSON.stringify(r0))
writeFileSync(path.join(seed, "b.txt"), "b")
git(seed, "add", "-A")
git(seed, "commit", "-q", "-m", "second")
git(seed, "push", "-q", "origin", "main")
const head1 = git(seed, "rev-parse", "main")
const r1 = await originTip(work, "main")
cell("AC-32 без кеша: after the origin moved the next read returns the new tip", r1.ok && r1.tip === head1 && head1 !== head0, JSON.stringify(r1))
git(seed, "branch", "dev")
git(seed, "push", "-q", "origin", "dev")
const r1b = await originTip(work, "dev")
cell("AC-32 target_branch: the tip is read by the name of the setting, not by the literal main", r1b.ok && r1b.tip === head1, JSON.stringify(r1b))
const r1c = await originTip(work, "mai")
cell("AC-32 точное имя: a prefix of the branch name is not the branch", !r1c.ok && r1c.kind === "missing", JSON.stringify(r1c))

// AC-20 tip: references, objects, FETCH_HEAD before and after
const snap = (dir) => {
  const g = path.join(dir, ".git")
  let size = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walk(f)
      else size += statSync(f).size
    }
  }
  walk(path.join(g, "objects"))
  return { refs: git(dir, "for-each-ref"), count: git(dir, "count-objects", "-v"), size, fetchHead: existsSync(path.join(g, "FETCH_HEAD")), packed: existsSync(path.join(g, "packed-refs")) ? 1 : 0 }
}
const before = snap(work)
await originTip(work, "main")
await originTip(work, "nosuch")
const after = snap(work)
cell("AC-20 tip: the references and the size of the objects are the same after the reads, no FETCH_HEAD", JSON.stringify(before) === JSON.stringify(after) && !after.fetchHead, JSON.stringify({ before, after }))

// ---- AC-32: no branch on origin (code 0, empty output), no origin, an unavailable origin, code 128
const { bare: bareDev } = mkBare("onlydev", "dev")
const wNo = mkRepo("w-nobranch", bareDev)
const rNo = await originTip(wNo, "main")
cell("AC-32 ветки нет: code 0 with an empty output is a refusal 'ветки main на origin нет'", !rNo.ok && rNo.kind === "missing" && /ветки main на origin нет/.test(rNo.error), JSON.stringify(rNo))
const wLocal = mkRepo("w-noorigin", undefined)
const localHead = git(wLocal, "rev-parse", "main")
const rLoc = await originTip(wLocal, "main")
cell("AC-32 нет origin: without origin the tip is the local branch", rLoc.ok && rLoc.tip === localHead && rLoc.source === "local" && hasOrigin(wLocal).origin === false, JSON.stringify(rLoc))
const rLoc2 = await originTip(wLocal, "nosuch")
cell("AC-32 нет origin, нет ветки: without origin and without the local branch it is a refusal", !rLoc2.ok && /нет/.test(rLoc2.error), JSON.stringify(rLoc2))
const wBad = mkRepo("w-unavailable", path.join(tmp, "no-such-origin.git"))
const rBad = await originTip(wBad, "main")
cell("AC-32 недоступен: an origin that cannot be read is a failure with the text, not a moved tip", !rBad.ok && rBad.kind === "fail" && /ls-remote/.test(rBad.error), JSON.stringify(rBad))
const plain = path.join(tmp, "not-a-repo")
mkdirSync(plain)
const r128 = await originTip(plain, "main")
cell("AC-32 код 128: a folder that is not a repository is a failure, not 'no origin'", !r128.ok && r128.kind === "fail" && /remote get-url/.test(r128.error), JSON.stringify(r128))

// ---- AC-11: the cases without an answer. Servers on a port chosen by the system, closed after the cell.
const procs = () => {
  if (process.platform === "win32") {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name LIKE 'git%'\" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"], { encoding: "utf8", windowsHide: true })
    const t = (r.stdout ?? "").trim()
    if (!t) return []
    const j = JSON.parse(t)
    return (Array.isArray(j) ? j : [j]).map((p) => `${p.ProcessId} ${p.Name} ${p.CommandLine ?? ""}`)
  }
  const r = spawnSync("ps", ["-eo", "pid,comm,args"], { encoding: "utf8" })
  return (r.stdout ?? "").split("\n").filter((l) => /^\s*\d+\s+git/.test(l))
}
const withAddress = (needle) => procs().filter((l) => l.includes(needle))
const silent = await new Promise((resolve) => {
  const s = net.createServer((sock) => sock.on("error", () => {})) // accepts and says nothing
  s.listen(0, "127.0.0.1", () => resolve(s))
})
const silentPort = silent.address().port
const closedPort = await new Promise((resolve) => {
  const s = net.createServer()
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port
    s.close(() => resolve(p))
  })
})
// control of the check itself: a git process of this test is visible in the list while it waits, and killTree (by its number) removes it
const ctl = spawn("git", ["ls-remote", `http://127.0.0.1:${silentPort}/control.git`], { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" })
await new Promise((r) => setTimeout(r, 2500))
const seen = withAddress("control.git").length
killTree(ctl)
await new Promise((r) => setTimeout(r, 2000))
cell("AC-11 контроль: the process list sees a waiting git process, and killTree by its number removes the whole tree", seen >= 1 && withAddress("control.git").length === 0, `seen ${seen}, left ${withAddress("control.git").length}`)
const sshHere = spawnSync("ssh", ["-V"], { encoding: "utf8", windowsHide: true }).error === undefined
const cases = [
  ["AC-11 нет адреса", "http://no-such-host.invalid/r.git", "no-such-host.invalid"],
  ["AC-11 закрытый порт", `http://127.0.0.1:${closedPort}/r.git`, String(closedPort)],
  ["AC-11 молчит http", `http://127.0.0.1:${silentPort}/r.git`, String(silentPort)],
  ["AC-11 молчит https", `https://127.0.0.1:${silentPort}/r.git`, String(silentPort)],
  ["AC-11 недоступный адрес", "http://192.0.2.1/r.git", "192.0.2.1"],
  ...(sshHere ? [["AC-11 ssh", `ssh://127.0.0.1:${silentPort}/r.git`, String(silentPort)]] : []),
]
const repos = cases.map(([, url], i) => mkRepo(`net-${i}`, url))
const t0 = Date.now()
const results = await Promise.all(
  cases.map(async ([name, , needle], i) => {
    const started = Date.now()
    const r = await originTip(repos[i], "main")
    return { name, needle, r, secs: Math.round((Date.now() - started) / 100) / 10 }
  }),
)
const wall = Date.now() - t0
await new Promise((r) => setTimeout(r, 1500)) // the tree is gone a moment after the kill
for (const { name, needle, r, secs } of results) {
  const left = withAddress(needle)
  cell(`${name}: a failure with the text of the cause (${secs} s), not 'moved' or 'not moved'`, !r.ok && r.kind === "fail" && r.error.length > 10 && secs <= TIP_TIMEOUT_MS / 1000 + 5, JSON.stringify(r))
  cell(`${name} процессы: after the term no git process with ${needle} is left`, left.length === 0, left.join(" | "))
  console.log(`процессов git с этим адресом: ${left.length} (${name})`)
}
if (!sshHere) console.log("не проверено: нет ssh (AC-11 ssh) — в Known limitations")
const longest = Math.max(...results.map((x) => x.secs))
console.log(`AC-11: ${results.length} cases in parallel, the longest ${longest} s, ${Math.round(wall / 100) / 10} s in all`)
cell("AC-11 срок: a silent server is cut off by the term of the plugin (the term is not shorter than it should be)", results.filter((x) => /молчит/.test(x.name)).every((x) => x.secs >= 14), JSON.stringify(results.map((x) => [x.name, x.secs])))
cell("AC-11 общее время: the cases run in parallel, in about one term", wall < TIP_TIMEOUT_MS + 12_000, `${wall} ms`)
silent.close()

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-tip.test: FAIL ${fail}` : "crew-landing-tip.test ok")
process.exit(fail ? 1 : 0)
