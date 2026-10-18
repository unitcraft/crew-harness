// Stability run: the given test files N times, J at a time (default 8), and the number of red runs per file.
//   node test/stable.mjs [--runs N] [--jobs J] [--cores C] [--timeout S] [--all] [file ...]
// Without files and without --all it runs the files named in STABLE_FILES below. --all takes every file of
// the "test" script of package.json (this is how the whole set is run in parallel: --runs 1 --all).
// --cores C pins this process, and so every test it starts, to the first C processor cores (Windows): J tests on C cores is
// a loaded machine, which is how the flaky tests of task 085 are made red on purpose without more processes.
// A red run prints the head of its output. The exit code is 1 if any run was red.
import { execFileSync, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "..")
// the files that were flaky under load (tasks 085, 088); `npm run test:stable` runs them
export const STABLE_FILES = [
  "crew-landing-golden",
  "crew-progress",
  "crew-step-yield",
  "crew-hung-turn",
  "crew-hung-resume",
  "crew-owner-answer",
  "crew-stale-diag",
  "crew-stuck",
  "crew-stuck-clear",
  "crew-acceptance-file",
  "crew-profiles-layer",
  "crew-answer-journal",
  "crew-answer-golden",
  "crew-profiles-select",
  "crew-push",
  "crew-plan-task",
  "crew-landing-slot",
  "crew-mcp",
  // task 088: the lock release race and the rest of the files that were red under load
  "crew-landing-race",
  "crew-landing-release",
  "crew-nudge-matrix",
  "crew-answer-flow",
  "crew-landing-tip",
  "crew-landing-gate",
  "crew-review",
  "crew-idle-tab",
  "crew-esc-question",
  "crew-owner-wait",
  "crew-submit",
  "crew-gate-stop",
  "crew-answer-loop",
  // task 096: timing of the delay and the interrupt
  "crew-form-auto-flow",
]

const args = process.argv.slice(2)
let runs = 10
let jobs = 8
let timeoutS = 1800 // crew-landing-gate alone takes about 4 minutes, several times that on a loaded machine (task 088)
let all = false
let cores = 0
const names = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--runs") runs = Number(args[++i])
  else if (args[i] === "--jobs") jobs = Number(args[++i])
  else if (args[i] === "--timeout") timeoutS = Number(args[++i])
  else if (args[i] === "--cores") cores = Number(args[++i])
  else if (args[i] === "--all") all = true
  else names.push(args[i])
}
let files = names
if (all) {
  const script = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts.test
  execFileSync(process.execPath, [path.join(here, "cleanup-tmp.mjs")], { stdio: "inherit" })
  files = [...script.matchAll(/node (test\/[\w.-]+\.mjs)/g)].map((m) => m[1]).filter((f) => !/cleanup-tmp/.test(f))
} else if (!files.length) files = STABLE_FILES
files = files.map((f) => (f.endsWith(".mjs") ? f : `test/${f}.test.mjs`).replace(/^\.?\//, ""))

if (cores > 0) {
  if (process.platform !== "win32") console.log("stable: --cores works on Windows only, ignored")
  else {
    const mask = 2 ** Math.min(cores, 30) - 1
    try {
      execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${process.pid}).ProcessorAffinity = ${mask}`], { stdio: "ignore", windowsHide: true })
    } catch (e) {
      console.log(`stable: could not pin to ${cores} cores: ${e.message}`)
    }
  }
}

const queue = []
for (let r = 0; r < runs; r++) for (const f of files) queue.push({ f, r })
const red = new Map(files.map((f) => [f, 0]))
const total = new Map(files.map((f) => [f, 0]))
const reports = []
const t0 = Date.now()

const runOne = ({ f }) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [f], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    const timer = setTimeout(() => child.kill(), timeoutS * 1000)
    child.on("close", (code) => {
      clearTimeout(timer)
      total.set(f, total.get(f) + 1)
      if (code !== 0) {
        red.set(f, red.get(f) + 1)
        reports.push(`--- RED ${f} (exit ${code})\n${out.split("\n").filter((l) => /FAIL|Error|error/.test(l)).slice(0, 6).join("\n") || out.slice(-600)}`)
      }
      resolve()
    })
  })

const worker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) await runOne(job)
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, worker))

for (const r of reports) console.log(r)
let bad = 0
for (const f of files) {
  if (red.get(f)) bad += red.get(f)
  console.log(`${red.get(f) ? "RED " : "ok  "} ${f}: ${red.get(f)} red of ${total.get(f)}`)
}
console.log(`stable: ${bad} red of ${files.length * runs} runs, ${jobs} at a time, ${Math.round((Date.now() - t0) / 1000)} s`)
process.exit(bad ? 1 : 0)
