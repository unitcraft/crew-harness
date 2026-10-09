// The proof of red of the question-answering tests (task 007; node >= 24):
//   node test/answer-red.mjs                 all runs: 0 (the base), 1..12 (stubs), 13 (no stubs); prints "answer-red ok"
//   node test/answer-red.mjs --run <k>       one run
//   node test/answer-red.mjs --markers-only  checks that each of the 14 markers GATE:<name> stands in the code exactly once
//   node test/answer-red.mjs --control       the control: the marker GATE:review is taken out of a copy -- the script must fall with
//                                            "маркер не найден" (prints "control ok")
// Run 0: the code of the base revision (git archive of $BASE, ANSWER_BASE or the merge base with origin/main) and the snapshot of its
// texts; the tests that need the new modules fail whole, the cells that must be green on the base are listed. Runs 1..12: a copy of
// the current code in which the places between the paired markers /* GATE:<name>< */ ... /* GATE:<name>> */ are replaced (each marker
// must be found exactly once, else the script falls: a drift of a marker is not silent); the named cells of the named tests must go
// red. Run 13: the copy without stubs, all tests green. The tests run one by one with a pause of 10 s; the script is heavy (copies,
// the flow test runs many times) -- run it once, on a free machine, never together with another heavy run.
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const here = import.meta.dirname
const pluginDir = path.join(here, "..")
const repo = path.join(pluginDir, "..")
const PAUSE_MS = 10_000
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
const NL = String.fromCharCode(10)

/** the stubs: marker -> [file, replacement] */
const MARKERS = {
  default: ["answer-parse.ts", '"recommendations"'],
  mode: ["answer-parse.ts", '"recommendations"'],
  flag: ["answer-parse.ts", "true"],
  type: ["answer-parse.ts", "true"],
  rec: ["answer-parse.ts", "true"],
  review: ["answer-parse.ts", "false"],
  limit: ["answer-parse.ts", "false"],
  words: ["answer-parse.ts", "undefined"],
  owner: ["answer.ts", "false"],
  exists: ["answer.ts", "undefined"],
  "once-link": ["answer.ts", "renameSync(tmp, final)"],
  "once-letter": ["answer.ts", "true"],
  "recount-count": ["answer.ts", "(r: AnswerRecord) => true"],
  row: ["answer.ts", "true"],
  addressee: ["answer-parse.ts", "false"],
}
const pairRe = (name) => new RegExp(`/\\* GATE:${name.replace(/[-]/g, "\\-")}< \\*/[\\s\\S]*?/\\* GATE:${name.replace(/[-]/g, "\\-")}> \\*/`, "g")

/** the stubs of runs 1..12: markers, and the tests with the cells that must go red (a trailing space or "*" -- a family by prefix) */
const STUBS = [
  { n: 1, name: "GATE:words", markers: ["words"], tests: { "crew-answer-gate": ["AC-05 а stem:*", "AC-05 б Т-7 *", "AC-05 з", "AC-05 и"] } },
  { n: 2, name: "GATE:flag", markers: ["flag"], tests: { "crew-answer-parse": ["AC-06", "AC-29 10"] } },
  { n: 3, name: "GATE:type", markers: ["type"], tests: { "crew-answer-parse": ["AC-06", "AC-29 3"], "crew-answer-flow": ["AC-04"] } },
  { n: 4, name: "GATE:review", markers: ["review"], tests: { "crew-answer-flow": ["AC-05 г"] } },
  { n: 5, name: "GATE:limit", markers: ["limit"], tests: { "crew-answer-journal": ["AC-14 счёт", "AC-14 пачка из трёх", "AC-14 после остатка"], "crew-answer-flow": ["AC-14 пакет"] } },
  { n: 6, name: "GATE:owner", markers: ["owner"], tests: { "crew-answer-flow": ["AC-11 a"] } },
  { n: 7, name: "GATE:once (exists, once-link, once-letter)", markers: ["exists", "once-link", "once-letter"], tests: { "crew-answer-journal": ["AC-17 письмо в доставке", "AC-17 повтор прохода", "AC-17 второй процесс"] } },
  { n: 8, name: "GATE:mode", markers: ["mode"], tests: { "crew-answer-flow": ["AC-03 c", "AC-30 е"] } },
  { n: 9, name: "GATE:rec", markers: ["rec"], tests: { "crew-answer-parse": ["AC-29 9"], "crew-answer-flow": ["AC-30 г"] } },
  { n: 10, name: "GATE:default", markers: ["default"], tests: { "crew-answer-golden": ["AC-01 без ключей"], "crew-answer-flow": ["AC-01 строки без ключей", "AC-03 a"] } },
  { n: 11, name: "GATE:recount (exists, recount-count)", markers: ["exists", "recount-count"], tests: { "crew-answer-journal": ["AC-17 повтор при пределе"], "crew-answer-flow": ["AC-14 пакет повтор"] } },
  { n: 12, name: "GATE:row", markers: ["row"], tests: { "crew-answer-journal": ["AC-14 после остатка"] } },
  { n: 14, name: "GATE:addressee", markers: ["addressee"], tests: { "crew-answer-gate": ["AC-05 и адресат"] } },
]
const ALL_TESTS = ["crew-answer-golden", "crew-answer-config", "crew-answer-parse", "crew-answer-gate", "crew-answer-journal", "crew-answer-view", "crew-answer-docs", "crew-answer-flow"]

/** the cells that must be green on the base (run 0); every other cell of these tests is red or the test falls whole */
const BASE_FILE = path.join(here, "answer-red-base.json")
let BASE_GREEN = {}
try {
  BASE_GREEN = JSON.parse(readFileSync(BASE_FILE, "utf8"))
} catch {}
const observed = {}

function copyCode(dst, from = pluginDir) {
  cpSync(from, dst, { recursive: true, filter: (src) => !/[\\/](test|node_modules)([\\/]|$)/.test(src) || src === from })
}
function load(copy) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", "for (const f of ['answer-parse','answer','config-schema','settings','core','status','index']) await import('./'+f+'.ts'); console.log('load ok')"], { cwd: copy, encoding: "utf8", env: { ...process.env, XDG_DATA_HOME: mkdtempSync(path.join(os.tmpdir(), "answer-red-load-")) } })
  return /load ok/.test(r.stdout) ? "" : `the copy does not load: ${(r.stderr || r.stdout).slice(0, 400)}`
}
function stubCopy(markers, dst) {
  copyCode(dst)
  applyStubs(markers, dst)
}
function applyStubs(markers, dst) {
  for (const m of markers) {
    const [file, repl] = MARKERS[m]
    const f = path.join(dst, file)
    const s = readFileSync(f, "utf8")
    const found = s.match(pairRe(m)) ?? []
    if (found.length !== 1) throw new Error(`маркер не найден: GATE:${m} в ${file} (совпадений ${found.length}, нужно 1)`)
    const next = s.replace(pairRe(m), () => repl)
    if (next === s) throw new Error(`подстановка не изменила файл: GATE:${m}`)
    writeFileSync(f, next)
  }
  const bad = load(dst)
  if (bad) throw new Error(bad)
}

/** one test file under a copy of the code; cells: name -> "ok" | "FAIL" */
function runTest(test, copy, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(here, `${test}.test.mjs`)], { cwd: pluginDir, encoding: "utf8", timeout: 900_000, env: { ...process.env, CREW_PLUGIN_DIR: copy, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 })
  const cells = new Map()
  for (const line of (r.stdout ?? "").split(NL)) {
    const m = /^(ok  |FAIL) (.*?)(?: :: |$)/.exec(line)
    if (m) cells.set(m[2].trim(), m[1].trim() === "ok" ? "ok" : "FAIL")
  }
  return { code: r.status, cells, tail: ((r.stdout ?? "").trim().split(NL).slice(-1)[0] ?? "") + " | " + (r.stderr ?? "").trim().split(NL).slice(0, 3).join(" / ").slice(0, 300) }
}
const matches = (cells, pat) => [...cells.keys()].filter((k) => (pat.endsWith("*") ? k.startsWith(pat.slice(0, -1)) : pat.endsWith(" ") ? k.startsWith(pat) : k === pat))

const problems = []
const say = (s) => console.log(s)
const tmp = mkdtempSync(path.join(os.tmpdir(), "answer-red-"))
const baseRev = process.env.ANSWER_BASE || git("merge-base", "HEAD", "origin/main")

function run0() {
  say(`прогон 0, база ${baseRev.slice(0, 12)}: новые тесты на коде базы со снимком базы`)
  const root = path.join(tmp, "base")
  mkdirSync(root, { recursive: true })
  execFileSync("git", ["-C", repo, "archive", baseRev, "opencode-plugin", "-o", path.join(tmp, "base.tar")])
  const tar = spawnSync("tar", ["-xf", "base.tar", "-C", "base"], { cwd: tmp, encoding: "utf8" }) // relative paths: a drive letter is read as a host by some tar
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`)
  const copy = path.join(root, "opencode-plugin")
  for (const test of ALL_TESTS) {
    sleep(PAUSE_MS)
    const r = runTest(test, copy, { ANSWER_GOLDEN_FILE: path.join(here, "answer-golden-base.json") })
    const green = [...r.cells].filter(([, v]) => v === "ok").map(([k]) => k).sort()
    observed[test] = green
    const want = process.env.ANSWER_RED_RECORD ? green : [...(BASE_GREEN[test] ?? [])].sort()
    const ok = JSON.stringify(green) === JSON.stringify(want) && (want.length === 0 ? r.code !== 0 : true)
    say(`  ${test}: зелёных ${green.length} (ожидалось ${want.length}), код ${r.code}${ok ? "" : " -- РАСХОЖДЕНИЕ"}`)
    if (process.env.ANSWER_RED_DEBUG) say(`    ${r.tail}`)
    if (!ok) problems.push(`прогон 0 ${test}: зелёные ${JSON.stringify(green)} против ожидаемых ${JSON.stringify(want)}`)
  }
}

function runStub(s) {
  say(`прогон ${s.n}, заглушка ${s.name}`)
  const copy = path.join(tmp, `stub${s.n}`)
  stubCopy(s.markers, copy)
  for (const [test, cellsRed] of Object.entries(s.tests)) {
    sleep(PAUSE_MS)
    const r = runTest(test, copy)
    for (const pat of cellsRed) {
      const found = matches(r.cells, pat)
      const notRed = found.filter((k) => r.cells.get(k) !== "FAIL")
      const red = !!found.length && !notRed.length && r.code !== 0
      say(`  ${test}: ${pat} -- ${red ? `красная (${found.length})` : "НЕ КРАСНАЯ"}`)
      if (!red) problems.push(`прогон ${s.n} ${s.name}: ${test} / ${pat}: найдено ${found.length}, не красных ${JSON.stringify(notRed)}, код ${r.code}`)
    }
  }
}

function run13() {
  say("прогон 13, без заглушек: копия текущего кода, все новые тесты зелёные")
  const copy = path.join(tmp, "plain")
  copyCode(copy)
  const bad = load(copy)
  if (bad) problems.push(`прогон 13: ${bad}`)
  for (const test of ALL_TESTS) {
    sleep(PAUSE_MS)
    const r = runTest(test, copy)
    const red = [...r.cells].filter(([, v]) => v === "FAIL").map(([k]) => k)
    say(`  ${test}: ячеек ${r.cells.size}, красных ${red.length}, код ${r.code}`)
    if (red.length || r.code !== 0) problems.push(`прогон 13 ${test}: красные ${JSON.stringify(red)}, код ${r.code}`)
  }
}

const arg = (k) => process.argv.includes(k)
try {
  if (arg("--markers-only")) {
    for (const m of Object.keys(MARKERS)) {
      const [file] = MARKERS[m]
      const n = (readFileSync(path.join(pluginDir, file), "utf8").match(pairRe(m)) ?? []).length
      if (n !== 1) problems.push(`маркер GATE:${m}: в ${file} пар ${n}, нужна 1`)
    }
    if (!problems.length) say("markers ok")
  } else if (arg("--control")) {
    const copy = path.join(tmp, "control")
    copyCode(copy)
    const f = path.join(copy, "answer-parse.ts")
    writeFileSync(f, readFileSync(f, "utf8").replace(pairRe("review"), "ctx.review")) // the pair of the marker is taken out
    let msg = ""
    try {
      applyStubs(["review"], copy)
    } catch (e) {
      msg = String(e.message)
    }
    say(/маркер не найден/.test(msg) ? "control ok" : "control FAILED: the script did not fall on a missing marker")
    if (!/маркер не найден/.test(msg)) problems.push("control")
  } else if (arg("--run")) {
    const k = Number(process.argv[process.argv.indexOf("--run") + 1])
    if (k === 0) {
      run0()
      if (process.env.ANSWER_RED_RECORD) {
        writeFileSync(BASE_FILE, JSON.stringify(observed, null, 1) + NL)
        say(`записано ${BASE_FILE}`)
      }
    }
    else if (k === 13) run13()
    else runStub(STUBS.find((s) => s.n === k))
  } else {
    run0()
    if (process.env.ANSWER_RED_RECORD) {
      writeFileSync(BASE_FILE, JSON.stringify(observed, null, 1) + NL)
      say(`записано ${BASE_FILE}`)
    }
    for (const s of STUBS) runStub(s)
    run13()
    if (!problems.length) say("answer-red ok")
  }
} catch (e) {
  problems.push(String(e.message ?? e))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
if (problems.length) {
  console.log(problems.join(NL))
  console.log("answer-red FAILED")
  process.exit(1)
}
