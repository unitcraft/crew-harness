// Self-test: the texts of the base do not change (task 005, AC-01; node >= 24):  node test/crew-landing-golden.test.mjs
// test/landing-golden.mjs collects the texts the plugin shows (the refusal of crew_spawn by the limit, the reminders about an
// accepted task, the task letters, the review letters, crew_task show and list) on a throwaway project and compares them with
// the snapshot of the base (test/landing-golden.json, written before the core was changed). Passes: the old behaviour set explicitly (hold, off) gives the snapshot; no keys gives the same texts as free and required set explicitly,
// and they differ from the snapshot where the behaviour changed (owner, 2026-10-09: the new keys are on by default). The control: a snapshot with
// one line spoiled must differ.
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, "landing-golden.mjs")
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(here, "..")
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-landing-golden-"))
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const run = (args, env = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }) }
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout ?? "") + String(e.stderr ?? "") }
  }
}

const first = run(["--check", "--legacy"])
cell("AC-01 hold/off явно: with the old behaviour set explicitly the texts equal the snapshot of the base", first.code === 0 && /^golden ok/m.test(first.out), first.out.slice(0, 1500))

const schema = await import(pathToFileURL(path.join(plugin, "config-schema.ts")).href)
if (schema.SCHEMA_KEYS.includes("accepted_slot")) {
  // since 2026-10-09 the defaults are free and required: no keys == the same values set explicitly, and both differ from the old texts
  const none = path.join(tmp, "none.json")
  const expl = path.join(tmp, "new.json")
  const a = run(["--dump", none])
  const b = run(["--dump", expl, "--new"])
  cell("AC-01 умолчание: with no keys the texts equal the texts with free and required set explicitly", a.code === 0 && b.code === 0 && readFileSync(none, "utf8") === readFileSync(expl, "utf8"), a.out.slice(0, 500) + b.out.slice(0, 500))
  const snapOld = JSON.parse(readFileSync(path.join(here, "landing-golden.json"), "utf8"))
  const nowTexts = JSON.parse(readFileSync(none, "utf8"))
  const differs = Object.keys(snapOld).filter((k) => snapOld[k] !== nowTexts[k])
  cell("AC-01 умолчание: the default texts differ from the old behaviour (the review letter has the precheck step, the list marks the wait for cleanup)", differs.includes("letter reviewLetter #2") && /ПРЕДПРОВЕРКА/.test(nowTexts["letter reviewLetter #2"]) && / — ждёт уборки/.test(nowTexts["list"]), differs.join("; "))
  const c = path.join(tmp, "legacy.json")
  const l = run(["--dump", c, "--legacy"])
  cell("AC-01 hold/off явно: the explicit old values give back every old text", l.code === 0 && JSON.stringify(JSON.parse(readFileSync(c, "utf8"))) === JSON.stringify(snapOld), l.out.slice(0, 500))
} else console.log("skip AC-01 умолчание: ключей ещё нет")

// the control: one line of a copy of the snapshot is spoiled -- the check must say "golden differs"
const spoiled = path.join(tmp, "spoiled.json")
copyFileSync(path.join(here, "landing-golden.json"), spoiled)
const snap = JSON.parse(readFileSync(spoiled, "utf8"))
const key = Object.keys(snap).find((k) => k.startsWith("letter reviewLetter"))
snap[key] = snap[key].replace("ПРИЁМКА", "ПРИЕМКА")
writeFileSync(spoiled, JSON.stringify(snap, null, 1))
const ctl = run(["--check", "--legacy"], { LANDING_GOLDEN_FILE: spoiled })
cell("AC-01 control: a spoiled line of the snapshot is found", ctl.code === 1 && /golden differs: letter reviewLetter/.test(ctl.out), ctl.out.slice(0, 600))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-golden.test: FAIL ${fail}` : "crew-landing-golden.test ok")
process.exit(fail ? 1 : 0)
