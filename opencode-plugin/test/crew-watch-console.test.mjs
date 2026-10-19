// Self-test of the console of crew_watch (task 100; node >= 24, Windows):  node test/crew-watch-console.test.mjs
// The service of OpenCode has no console. A watch started `detached` (DETACHED_PROCESS) had none either, so every console program
// of its chain (cmd, python, vcvars64.bat, cl) made a new console of its own, and on a loaded machine such a program died with
// 0xC0000142 (3221225794) before its first command. Now the watch runs in ONE hidden console that the whole chain shares.
//   - the watch process has a console (AttachConsole to its pid succeeds);
//   - vcvars64.bat + cl from a watch, 5 runs in a row, exit 0 (no Visual Studio Build Tools -> skipped, said aloud);
//   - the watch outlives the process that started it, `.exit` appears, and the pid file is in the record.
// Red probe: CREW_HARNESS_WATCH_NO_CONSOLE=1 starts the watch the old way - the console check must go red.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import assert from "node:assert/strict"

if (process.platform !== "win32") {
  console.log("crew-watch-console: skipped: the console of a watch is a Windows matter")
  process.exit(0)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-watch-console-"))
process.env.XDG_DATA_HOME = tmp
const watchUrl = pathToFileURL(path.join(here, "..", "watch.ts")).href
const w = await import(watchUrl)
const posted = []
const post = (x, text) => posted.push({ id: x.id, code: x.code, text })
const until = async (cond, ms = 60_000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout")
    w.pollWatches(post)
    await new Promise((r) => setTimeout(r, 200))
  }
}
const record = (id) => JSON.parse(readFileSync(path.join(w.WATCHES, `${id}.json`), "utf8"))
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === "EPERM"
  }
}

// the Visual Studio Build Tools: CREW_TEST_VCVARS, else the newest vcvars64.bat under Program Files (x86) / Program Files
function findVcvars() {
  if (process.env.CREW_TEST_VCVARS) return existsSync(process.env.CREW_TEST_VCVARS) ? process.env.CREW_TEST_VCVARS : undefined
  const found = []
  for (const pf of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]) {
    if (!pf) continue
    const root = path.join(pf, "Microsoft Visual Studio")
    if (!existsSync(root)) continue
    for (const ver of readdirSync(root))
      for (const edition of existsSync(path.join(root, ver)) ? readdirSync(path.join(root, ver)) : []) {
        const f = path.join(root, ver, edition, "VC", "Auxiliary", "Build", "vcvars64.bat")
        if (existsSync(f)) found.push(f)
      }
  }
  return found.sort().pop()
}
const python = (() => {
  try {
    execFileSync("python", ["--version"], { stdio: "ignore", windowsHide: true })
    return "python"
  } catch {
    return undefined
  }
})()

// 1. the watch process has a console, hidden (the same call fails for a process without one: error 6)
if (!python) console.log("skip  console of the watch process: python is not on PATH")
else {
  const probe = "import ctypes,sys;k=ctypes.windll.kernel32;k.FreeConsole();sys.exit(0 if k.AttachConsole(int(sys.argv[1])) else 1)"
  const hasConsole = (pid) => {
    try {
      execFileSync(python, ["-c", probe, String(pid)], { stdio: "ignore", windowsHide: true })
      return true
    } catch {
      return false
    }
  }
  const c = w.requestWatch({ session: "sesC", command: "sleep 30", cwd: tmp })
  w.pollWatches(post)
  const rec = record(c.id)
  assert.ok(rec.pid > 0, "the record has the pid of the watch process")
  assert.ok(alive(rec.pid), "the watch process runs")
  assert.ok(hasConsole(rec.pid), "the watch process has a console (without it every console program of its chain makes one: 0xC0000142 under load)")
  w.dropWatch(rec)
  assert.ok(!alive(rec.pid), "a dropped watch is gone")
  console.log("ok  console of the watch process")
}

// 2. vcvars64.bat + cl from a watch, 5 runs in a row
const vcvars = findVcvars()
if (!vcvars) console.log("skip  vcvars: no Visual Studio Build Tools (vcvars64.bat) found; set CREW_TEST_VCVARS to run it")
else {
  const bat = path.join(tmp, "vc.cmd")
  writeFileSync(bat, `@echo off\r\ncall "${vcvars}" >nul\r\nif errorlevel 1 exit /b %errorlevel%\r\nwhere cl\r\n`)
  for (let i = 1; i <= 5; i++) {
    const v = w.requestWatch({ session: "sesV", command: `MSYS_NO_PATHCONV=1 cmd /c '${bat.replace(/\\/g, "/")}'`, cwd: tmp, machine: true, project: "V", note: `vcvars ${i}` })
    await until(() => posted.some((p) => p.id === v.id))
    const p = posted.find((x) => x.id === v.id)
    assert.equal(p.code, 0, `vcvars run ${i}: exit code ${p.code} (3221225794 = 0xC0000142)\n${p.text}`)
    assert.match(readFileSync(path.join(w.WATCHES, `${v.id}.out`), "utf8"), /cl\.exe/i, `vcvars run ${i}: cl is found`)
  }
  console.log("ok  vcvars64.bat + cl from a watch, 5 runs in a row")
}

// 3. the watch outlives the process that started it (the service restart), writes `.exit`, and a later pass posts its letter
{
  const helper = `
    process.env.XDG_DATA_HOME = process.argv[1]
    const w = await import(process.argv[2])
    const x = w.requestWatch({ session: "sesO", command: "sleep 4; echo survived", cwd: process.argv[1], note: "outlives" })
    w.pollWatches(() => {})
    console.log(x.id)
  `
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", helper, tmp, watchUrl], { encoding: "utf8", windowsHide: true }).trim()
  const rec = record(out)
  assert.equal(rec.status, "running")
  assert.ok(alive(rec.pid), "the watch outlives the process that started it")
  await until(() => posted.some((p) => p.id === out))
  assert.equal(posted.find((p) => p.id === out).code, 0)
  assert.match(posted.find((p) => p.id === out).text, /survived/)
  assert.ok(existsSync(path.join(w.WATCHES, `${out}.exit`)), ".exit is there")
  console.log("ok  the watch outlives its starter")
}
console.log("crew-watch-console: ok")
