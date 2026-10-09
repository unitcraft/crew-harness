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
import { fileURLToPath } from "node:url"
import { harness } from "./answer-harness.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, "answer-golden.mjs")
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

// the second pass: answer_mode set to {"default": "owner"}; on the base the key is unknown and ignored, the texts stay the same
const second = run(["--check", "--owner"])
cell("AC-01 owner во всех типах", second.code === 0 && /^golden ok/m.test(second.out), second.out.slice(0, 1500))

// The cells below use only the old functions and files, so they are green on the base too (the harness starts the plugin and a
// real database of turns; the modes of the new keys are written into the project file and are ignored there).
const H = await harness("crew-answer-golden-cells", { sessions: ["sesGold001", "sesGold002", "sesGold003"] })
const status = H.status
const NL = String.fromCharCode(10)
const blk = (n, type, rec) => [`В-0${n} Вопрос номер ${n}?`, `Тип: ${type}`, ...(rec ? [`Рекомендация: ${rec}`] : []), "Автоответ: допустим"].join(NL)

// AC-04: a pack of three blocks of the form of the Canon plus the lines of the type and the permission: the old pass (endsWithQuestion)
// sees no question in it
const pack = [blk(1, "implementation", "делаем по первому варианту"), "", blk(2, "implementation"), "", blk(3, "gate", "влить ветку")].join(NL)
cell("AC-04 endsWithQuestion", status.endsWithQuestion(pack) === undefined, String(status.endsWithQuestion(pack)))

// AC-21: five texts; a block of four lines (the form of the Canon) is not a question for the old pass
const five = [
  [["Итог.", "", "Пушить main?", "", "СТОП: вопрос"].join(NL), "Пушить main?"],
  [["Готово. Как? — так.", "Всё."].join(NL), undefined],
  [["В-01 Как назвать функцию?", "Тип: implementation", "Рекомендация: parseBlock", "Автоответ: допустим"].join(NL), undefined],
  [["Сделал.", "Можно ли так (если да, продолжу)?"].join(NL), "Можно ли так (если да, продолжу)?"],
  [["Отчёт.", "Что дальше?»", "Подпись"].join(NL), "Что дальше?»"],
]
const bad = five.filter(([t, want]) => status.endsWithQuestion(t) !== want)
cell("AC-21 пять текстов", bad.length === 0, JSON.stringify(bad.map(([t]) => [t, status.endsWithQuestion(t)])))

// AC-19: the files status/<session>.json of a turn without a question are the same with the modes on and off (but for the time of the write)
const same = async (sid, on) => {
  on ? H.setSettings({ answer_mode: { default: "recommendations" } }) : H.setSettings({})
  await H.turn(sid, "Готово, вопросов нет.", { user: "поехали", at: Date.now() - 20_000 })
  await H.wait(1200)
  const raw = JSON.parse(readFileSync(path.join(status.STATUS, `${sid}.json`), "utf8"))
  delete raw.updated
  return JSON.stringify(raw).replaceAll(sid, "<S>")
}
const off = await same("sesGold001", false)
const onn = await same("sesGold002", true)
cell("AC-19 статус", off === onn, off + NL + onn)
// AC-18: the letters of the old kinds look as before (formatLetters over a letter of a neighbour, with a question, a reply and a
// service letter of the plugin); the text is compared with the snapshot of the base (or the current one)
{
  const me = { session: "sesTASK02", role: "worker", auto: false, title: "sesTASK02", directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: 1 }
  const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)
  const peer = (id, more = {}) => ({ id, from_role: "proj.worker", from_session: "sesOWNER1", to: "sesTASK02", time: NOW, text: `письмо ${id}`, ...more })
  const letters = [peer("l1"), peer("l2", { qid: "q1" }), peer("l3", { reply_to: "q0" }), { id: "l4", from_role: H.core.PLUGIN_SENDER, from_session: H.core.PLUGIN_SENDER, to: "sesTASK02", time: NOW, text: "служебное письмо плагина" }]
  const shown = H.core.formatLetters(letters, me).replace(/\d\d:\d\d/g, "HH:MM")
  const snap = JSON.parse(readFileSync(process.env.ANSWER_GOLDEN_FILE || path.join(here, "answer-golden.json"), "utf8"))["letters: formatLetters"]
  cell("AC-18 прежние письма", shown === snap, shown + NL + "---" + NL + snap)
}
H.close()

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
