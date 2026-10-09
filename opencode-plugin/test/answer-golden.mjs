// Golden texts of the base for the question-answering task (007; node >= 24).
//   node test/answer-golden.mjs --write            record the snapshot test/answer-golden.json (once, BEFORE the core is changed);
//                                                  the first write also saves the same texts as answer-golden-base.json (the proof of red)
//   node test/answer-golden.mjs --check            collect the texts again and compare with the snapshot: "golden ok" / "golden differs"
//   node test/answer-golden.mjs --check --owner    the same, with answer_mode set to {"default": "owner"} in the project file
// The texts: the notice "waits for you" of the owner's tab and its repeat, the forwarded question of a task session (the letter
// `ask-...`), /crew (formatStatuses) and the side panel (sidebarLines) for four states, crew_config guide and show, crew_help,
// formatLetters on letters of the old kinds. The temp folder, the clock and the moments are replaced by markers. The lines of the
// two new keys (`answer_*`), the heading of their group and the empty line before it are left out of guide and show: the new keys
// change those two texts, everything else must stay. ANSWER_GOLDEN_FILE points to another snapshot file (the control: a snapshot
// with one line spoiled must differ). CREW_PLUGIN_DIR points to another copy of the plugin code.
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { harness } from "./answer-harness.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = process.env.ANSWER_GOLDEN_FILE || path.join(HERE, "answer-golden.json")
const BASE_SNAPSHOT = path.join(HERE, "answer-golden-base.json")
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : ""
const withOwner = process.argv.includes("--owner")
if (!mode) {
  console.log("usage: node test/answer-golden.mjs --write | --check [--owner]")
  process.exit(2)
}

// the full block of a question: the identifier, the type, the recommendation, the permission, and a "?" at the end of a line among the last three
// (the old pass sees it; with the modes on by a broken default the new pass would see a block-question too, so a broken default changes the texts)
const BLOCK = ["Итог по шагу.", "", "В-01 Какой формат писать?", "Тип: implementation", "Рекомендация: формат json — потому что его читает тест", "Автоответ: допустим", "Согласны с рекомендацией?"].join(String.fromCharCode(10))
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)

const H = await harness("crew-answer-golden", { settings: { owner_reminder_min: 0.03, ...(withOwner ? { answer_mode: { default: "owner" } } : {}) } })
const out = {}
const { core, status } = H

// 1. the owner's tab ended a turn with a question: the notice and its repeat (owner_reminder_min 0.03 = 1.8 s)
await H.turn("sesOWNER1", BLOCK)
await H.until(() => H.notices().filter((n) => n.sessionID === "sesOWNER1").length >= 2, 12_000)
const mine = H.notices().filter((n) => n.sessionID === "sesOWNER1")
const shape = (n) => JSON.stringify({ sessionID: n.sessionID, title: n.title, message: n.message, attention: n.attention, duration: n.duration })
out["notice: first, the tab of the owner"] = mine[0] ? shape(mine[0]) : "(no notice)"
out["notice: repeat"] = mine[1] ? shape(mine[1]) : "(no repeat)"

// 2. a task session ended its turn with the same question: the plugin forwards it to the asker as a letter
H.taskSession("sesTASK01")
await H.turn("sesTASK01", BLOCK, { user: "[opencode-peers] Задача #1" })
await H.until(() => H.letters("sesOWNER1").some((l) => String(l.id).startsWith("ask-sesTASK01-")))
await H.wait(500)
const ask = H.letters("sesOWNER1").find((l) => String(l.id).startsWith("ask-sesTASK01-"))
out["forward: the letter of a question of a task session"] = ask ? `${String(ask.id).replace(/\d{10,}$/, "<AT>")} | ${ask.from_session} | ${ask.from_role}
${ask.text}` : "(no letter)"
const nudges = H.letters("sesTASK01").filter((l) => /Не завершено/.test(l.text ?? "")).length
out["forward: no 'Не завершено' letter to the task session"] = String(nudges)

// 3. /crew and the side panel for four states
const card = (session, extra = {}) => ({ session, role: "integrator", auto: false, title: session, directory: H.proj, repo: "proj", project: "proj", pid: process.pid, updated: NOW, ...extra })
const statuses = [
  status.statusOf({ card: card("sesOWNER1"), busy: false, end: { at: NOW - 600_000, text: BLOCK, ownerAfter: false }, asked: [], now: NOW, watches: [] }),
  status.statusOf({ card: card("sesWORK001", { role: "worker" }), busy: true, busySince: NOW - 120_000, asked: [], now: NOW, watches: [] }),
  status.statusOf({ card: card("sesIDLE001", { role: "worker" }), busy: false, end: { at: NOW - 300_000, text: "Готово. Вопросов нет.", ownerAfter: false }, asked: [], now: NOW, watches: [] }),
  status.statusOf({ card: card("sesTASKQ01", { role: "worker", spawned: { by: "sesOWNER1", task: "x", tier: "light", status: "running", at: NOW - 900_000, qid: "q9" } }), busy: false, end: { at: NOW - 60_000, text: "Сдал. Базу опустит интегратор или мне?", ownerAfter: false }, asked: [], now: NOW, watches: [] }),
]
out["crew: formatStatuses"] = status.formatStatuses(statuses, NOW, "proj")
out["crew: sidebarLines"] = JSON.stringify(status.sidebarLines(statuses, NOW, "proj"))
out["crew: sidebarLines, texts"] = status.sidebarLines(statuses, NOW, "proj").rows.map((r) => status.sideText(r)).join("\n")

// 4. crew_config guide and show, crew_help
out["config: guide"] = await H.call("crew_config", "sesTASK02", { action: "guide" })
out["config: show"] = await H.call("crew_config", "sesTASK02", { action: "show" })
out["help"] = await H.call("crew_help", "sesTASK02")

// 5. the letters of the old kinds as the session sees them
const me = card("sesTASK02", { role: "worker" })
const peer = (id, more = {}) => ({ id, from_role: "proj.integrator", from_session: "sesOWNER1", to: "sesTASK02", time: NOW, text: `письмо ${id}`, ...more })
out["letters: formatLetters"] = core.formatLetters([peer("l1"), peer("l2", { qid: "q1" }), peer("l3", { reply_to: "q0" }), { id: "l4", from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to: "sesTASK02", time: NOW, text: "служебное письмо плагина" }], me)

// markers: the temp folder (any spelling), the clock, the moments in the file names
const spellings = new Set()
for (const p of [H.tmp, realpathSync.native(H.tmp)]) for (const s of [p, p.replaceAll("\\", "/")]) spellings.add(s)
const mask = (s) => {
  let r = String(s).replaceAll("\\", "/")
  for (const p of [...spellings].map((x) => x.replaceAll("\\", "/")).sort((a, b) => b.length - a.length)) r = r.split(p).join("<TMP>")
  return r.replace(/\b\d\d:\d\d\b/g, "HH:MM")
}
// the lines of the new keys are left out of guide and show (see the header)
const dropNew = (key, text) => {
  if (!key.startsWith("config: ")) return text
  const lines = text.split("\n")
  const keep = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*(- )?answer_/.test(l)) continue
    if (/ОТВЕТЫ НА ВОПРОСЫ/.test(l)) {
      if (keep.length && keep[keep.length - 1] === "") keep.pop()
      continue
    }
    keep.push(l)
  }
  return keep.join("\n")
}
const result = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, dropNew(k, mask(v))]))
H.close()

if (mode === "write") {
  const text = JSON.stringify(result, null, 1) + "\n"
  writeFileSync(SNAPSHOT, text)
  if (!process.env.ANSWER_GOLDEN_FILE && !existsSync(BASE_SNAPSHOT)) copyFileSync(SNAPSHOT, BASE_SNAPSHOT)
  console.log(`golden written: ${Object.keys(result).length} texts -> ${path.basename(SNAPSHOT)}`)
  process.exit(0)
}
const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
for (const k of Object.keys(snap)) snap[k] = dropNew(k, snap[k])
const bad = [...new Set([...Object.keys(snap), ...Object.keys(result)])].filter((k) => snap[k] !== result[k])
if (!bad.length) {
  console.log(`golden ok (${Object.keys(result).length} texts${withOwner ? ", answer_mode owner set explicitly" : ""})`)
  process.exit(0)
}
console.log(`golden differs: ${bad.join("; ")}`)
const k = bad[0]
console.log(`--- snapshot [${k}]\n${snap[k] ?? "(absent)"}\n--- now\n${result[k] ?? "(absent)"}`)
process.exit(1)
