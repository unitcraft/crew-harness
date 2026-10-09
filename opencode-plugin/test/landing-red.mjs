// Proof of red for the merge gate (task 005, AC-30):  node test/landing-red.mjs
// A test that cannot fail proves nothing. The script copies the plugin into a temp folder, replaces exactly ONE line (found by its
// marker `GATE:*`) by a stub that says "all is well" and runs the gate test on the copy (CREW_PLUGIN_DIR); the cells that guard that check
// must go red (a run may also name cells that must be among them). Five runs:
//   1. sameTip -> true                         red: AC-09, AC-17 (a moved tip is let through)
//   2. isFresh -> true                          red: AC-08 (a missing, running or stale record is let through)
//   3. recordUnchanged and lockStillMine -> true  red: AC-37 c1, c1 перехват, c2, c3, c4, c5, c8 (a changed record / a lost lock / a lock of another call is let through)
//   4. mayRelease -> true                       red: AC-37 c5, c6, c7 (a refusal takes off a lock of another task of the same session)
//   5. no stub                                  no red cell
// If a marker is not found in exactly one line the script fails ("маркер … не найден"): a drift of the markers must not pass silently.
// Heavy (the gate test on a copy, a few minutes): run it once, on a quiet machine. Flags: --markers-only (only count the markers),
// --src <folder> (take the plugin from another folder: the control that a deleted marker fails).
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const SRC = path.resolve(args.includes("--src") ? args[args.indexOf("--src") + 1] : path.join(import.meta.dirname, ".."))
const TEST = import.meta.dirname

const RUNS = [
  { name: "sameTip -> true", markers: ["GATE:same-tip"], sections: "AC-09,AC-17", red: ["AC-09", "AC-17"] },
  { name: "isFresh -> true", markers: ["GATE:green"], sections: "AC-08", red: ["AC-08"] },
  { name: "recordUnchanged and lockStillMine -> true", markers: ["GATE:recheck", "GATE:lock"], sections: "AC-37", red: ["AC-37"], cells: ["AC-37 c4", "AC-37 c5", "AC-37 c8"] },
  { name: "mayRelease -> true", markers: ["GATE:release"], sections: "AC-37", red: ["AC-37"], cells: ["AC-37 c5", "AC-37 c6", "AC-37 c7"] },
  { name: "no stub", markers: [], sections: "AC-08,AC-09,AC-17,AC-37", red: [] },
]

const sources = readdirSync(SRC).filter((f) => /\.(ts|tsx|json|md|mjs)$/.test(f))
const markerLines = (marker) => {
  const hits = []
  for (const f of sources.filter((x) => x.endsWith(".ts")))
    readFileSync(path.join(SRC, f), "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/^\s*(export )?const \w+ = .*=> .*\/\/ GATE:/.test(line) && line.trim().endsWith(`// ${marker}`)) hits.push({ f, i, line })
      })
  return hits
}
let bad = false
for (const m of RUNS.flatMap((r) => r.markers)) {
  const hits = markerLines(m)
  if (hits.length !== 1) {
    console.error(`маркер не найден: ${m} — нужна ровно одна строка, найдено ${hits.length}`)
    bad = true
  }
}
if (bad) process.exit(2)
if (flag("--markers-only")) {
  console.log("markers ok")
  process.exit(0)
}

let failed = false
RUNS.forEach((run, k) => {
  const copy = mkdtempSync(path.join(os.tmpdir(), "landing-red-"))
  try {
    for (const f of sources) cpSync(path.join(SRC, f), path.join(copy, f))
    for (const m of run.markers) {
      const [{ f, i }] = markerLines(m)
      const file = path.join(copy, f)
      const text = readFileSync(file, "utf8").split("\n")
      const line = text[i]
      const stub = line.replace(/=> .*(\/\/ GATE:[\w-]+)\s*\r?$/, (_all, mark) => `=> true ${mark}`)
      if (stub === line) throw new Error(`заглушка для ${m} не применилась`)
      text[i] = stub
      writeFileSync(file, text.join("\n"))
    }
    const r = spawnSync(process.execPath, [path.join(TEST, "crew-landing-gate.test.mjs")], { encoding: "utf8", env: { ...process.env, CREW_PLUGIN_DIR: copy, LANDING_SECTIONS: run.sections }, maxBuffer: 64 * 1024 * 1024 })
    const out = `${r.stdout}${r.stderr}`
    const reds = out.split(/\r?\n/).filter((l) => l.startsWith("FAIL"))
    const redIds = [...new Set(reds.map((l) => /^FAIL (AC-\d+)/.exec(l)?.[1]).filter(Boolean))]
    const missing = (run.cells ?? []).filter((c) => !reds.some((l) => l.startsWith(`FAIL ${c}`)))
    const crashed = r.status !== 0 && !reds.length // the file died before any cell: not a proof of red
    const ok = !crashed && !missing.length && run.red.every((id) => redIds.includes(id)) && (run.red.length ? true : reds.length === 0 && r.status === 0)
    console.log(`прогон ${k + 1}: ${run.name}: красных ячеек ${reds.length} (${redIds.join(", ") || "—"}); ${missing.length ? `не покраснели: ${missing.join(", ")}; ` : ""}ожидалось ${run.red.length ? "красные " + run.red.join(", ") : "ноль красных"}: ${ok ? "да" : "НЕТ"}`)
    for (const l of reds.slice(0, 6)) console.log(`   ${l.slice(0, 150)}`)
    if (!ok) {
      failed = true
      if (crashed) console.log(out.slice(-600))
    }
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
})
console.log(failed ? "landing-red FAIL" : "landing-red ok")
process.exit(failed ? 1 : 0)
