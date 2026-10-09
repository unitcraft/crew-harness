// Self-test: the texts of the base do not change (task 007, AC-01; node >= 24):  node test/crew-answer-golden.test.mjs
// test/answer-golden.mjs collects the texts the plugin shows (the notice "waits for you" of the owner's tab and its repeat, the
// forwarded question of a task session, /crew and the side panel, crew_config guide and show, crew_help, formatLetters) on a
// throwaway project and compares them with the snapshot of the base (test/answer-golden.json, written before the core was
// changed). Two passes: no new keys in the project file, and answer_mode set to {"default": "owner"} -- both must give the same
// texts. The control: a snapshot with one line spoiled must differ. The cells that must stay green on the base too (AC-04
// endsWithQuestion, AC-18 прежние письма, AC-19 статус, AC-21 пять текстов) join this file in the later steps of the plan.
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, "answer-golden.mjs")
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(here, "..")
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-answer-golden-"))
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
cell("AC-01 без ключей", first.code === 0 && /^golden ok/m.test(first.out), first.out.slice(0, 1500))

const schema = await import(pathToFileURL(path.join(plugin, "config-schema.ts")).href)
if (schema.SCHEMA_KEYS.includes("answer_mode")) {
  const second = run(["--check", "--owner"])
  cell("AC-01 owner во всех типах", second.code === 0 && /^golden ok/m.test(second.out), second.out.slice(0, 1500))
} else console.log("skip AC-01 owner во всех типах: ключей ещё нет")

// the control: one line of a copy of the snapshot is spoiled -- the check must say "golden differs"
const spoiled = path.join(tmp, "spoiled.json")
copyFileSync(path.join(here, "answer-golden.json"), spoiled)
const snap = JSON.parse(readFileSync(spoiled, "utf8"))
const key = Object.keys(snap).find((k) => k.startsWith("forward:") && snap[k].includes("Решить без владельца"))
snap[key] = snap[key].replace("Решить без владельца", "Решить без хозяина")
writeFileSync(spoiled, JSON.stringify(snap, null, 1))
const ctl = run(["--check"], { ANSWER_GOLDEN_FILE: spoiled })
cell("AC-01 control", ctl.code === 1 && /golden differs: forward:/.test(ctl.out), ctl.out.slice(0, 600))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-answer-golden.test: FAIL ${fail}` : "crew-answer-golden.test ok")
process.exit(fail ? 1 : 0)
