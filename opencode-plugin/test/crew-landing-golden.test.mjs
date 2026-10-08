// Self-test: the texts of the base do not change (task 005, AC-01; node >= 24):  node test/crew-landing-golden.test.mjs
// test/landing-golden.mjs collects the texts the plugin shows (the refusal of crew_spawn by the limit, the reminders about an
// accepted task, the task letters, the review letters, crew_task show and list) on a throwaway project and compares them with
// the snapshot of the base (test/landing-golden.json, written before the core was changed). Two passes: no new keys in the
// project file, and the new keys set to their default values -- both must give the same texts. The control: a snapshot with
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

const first = run(["--check"])
cell("AC-01 без ключей: the texts equal the snapshot of the base", first.code === 0 && /^golden ok/m.test(first.out), first.out.slice(0, 1500))

const schema = await import(pathToFileURL(path.join(plugin, "config-schema.ts")).href)
if (schema.SCHEMA_KEYS.includes("accepted_slot")) {
  const second = run(["--check", "--defaults"])
  cell("AC-01 значения по умолчанию: with the default values set explicitly the texts equal the snapshot", second.code === 0 && /^golden ok/m.test(second.out), second.out.slice(0, 1500))
} else console.log("skip AC-01 значения по умолчанию: ключей ещё нет")

// the control: one line of a copy of the snapshot is spoiled -- the check must say "golden differs"
const spoiled = path.join(tmp, "spoiled.json")
copyFileSync(path.join(here, "landing-golden.json"), spoiled)
const snap = JSON.parse(readFileSync(spoiled, "utf8"))
const key = Object.keys(snap).find((k) => k.startsWith("letter reviewLetter"))
snap[key] = snap[key].replace("ПРИЁМКА", "ПРИЕМКА")
writeFileSync(spoiled, JSON.stringify(snap, null, 1))
const ctl = run(["--check"], { LANDING_GOLDEN_FILE: spoiled })
cell("AC-01 control: a spoiled line of the snapshot is found", ctl.code === 1 && /golden differs: letter reviewLetter/.test(ctl.out), ctl.out.slice(0, 600))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-landing-golden.test: FAIL ${fail}` : "crew-landing-golden.test ok")
process.exit(fail ? 1 : 0)
