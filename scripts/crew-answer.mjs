#!/usr/bin/env node
// Зачем: передать ответ владельца на открытый вопросник окна OpenCode снаружи окна (задача 059) — по слову владельца
//     в чате оркестратора. OpenCode не даёт плагину ответить на форму, поэтому плагин закрывает вопросник прерыванием
//     хода и кладёт вкладке письмо с ответом (opencode-plugin/owner-answer.ts).
// Проверяет: что вопросник есть в записях плагина (forms/), что вариант есть среди вариантов, что цитата слова владельца
//     дана; потом ждёт итога плагина (до 30 с) и печатает его: применён или нет и почему.
// Не проверяет: что владелец правда сказал это слово — цитату даёт оркестратор (граница: кто пишет в папку данных
//     службы, тот может подделать ответ; сигнал — журнал плагина и событие в истории задачи).
// Правило: AGENTS.md п.14 (не должно быть ручных команд там, где их может сделать программа).
//
// Использование:
//   node scripts/crew-answer.mjs                       — открытые вопросники: проект, вкладка, вопрос, варианты
//   node scripts/crew-answer.mjs <форма|сессия|проект.роль> (--option <номер|подпись> | --text "<свой ответ>") --quote "<слово владельца>" [--no-wait]
// Папка данных — как у плагина: $XDG_DATA_HOME/opencode или ~/.local/share/opencode, подпапка crew-harness.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const root = process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "opencode") : path.join(os.homedir(), ".local", "share", "opencode")
const base = ["crew-harness", "opencode-peers", "nova-peers"].map((n) => path.join(root, n)).find((p) => existsSync(p)) ?? path.join(root, "crew-harness")
const FORMS = path.join(base, "forms")
const CARDS = path.join(base, "cards")
const ANSWERS = path.join(base, "answers")
const TTL = 12 * 3_600_000
const safeKey = (k) => k.replace(/[^A-Za-z0-9_-]/g, "_")
const read = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"))
  } catch {
    return undefined
  }
}

// replaced=true — история: формы, которые вкладка заменила новой формой того же вопроса (задача 071); они не открыты
function openForms(replaced = false) {
  const out = []
  if (!existsSync(FORMS)) return out
  for (const n of readdirSync(FORMS).filter((n) => n.endsWith(".json"))) {
    const list = read(path.join(FORMS, n))
    if (!Array.isArray(list)) continue
    for (const f of list) {
      if (!f || typeof f.at !== "number" || Date.now() - f.at >= TTL || !!f.replacedBy !== replaced) continue
      const session = f.session ?? n.replace(/\.json$/, "")
      const card = read(path.join(CARDS, `${safeKey(session)}.json`)) ?? {}
      const project = card.project ?? (card.directory ? path.basename(card.directory) : "?")
      out.push({ session, form: f, project, key: `${project}.${card.role ?? "?"}` })
    }
  }
  return out.sort((a, b) => a.form.at - b.form.at)
}

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const forms = openForms()
if (!args.length) {
  if (!forms.length) console.log("открытых вопросников нет")
  for (const x of forms) {
    console.log(`${x.project}  ${x.key}  сессия ${x.session}  форма ${x.form.id}${x.form.exhausted ? "  (без ответа после повторов)" : ""}`)
    console.log(`  вопрос: ${x.form.question ?? x.form.title ?? "?"}`)
    ;(x.form.options ?? []).forEach((o, i) => console.log(`  ${i + 1}. ${o}`))
  }
  process.exit(0)
}
const target = args[0]
const option = opt("--option")
const text = opt("--text")
const quote = opt("--quote")
if (!quote || !quote.trim()) (console.error("нужна цитата слова владельца: --quote \"…\""), process.exit(2))
if (!option && !text) (console.error("нужен вариант (--option) или свой текст (--text)"), process.exit(2))
const hits = forms.filter((x) => x.form.id === target || x.form.rid === target || x.session === target || x.key === target)
if (!hits.length) {
  // задача 071: вопрос задан заново — назвать форму, на которую нужно ответить
  const old = openForms(true).find((x) => x.form.id === target || x.form.rid === target)
  if (old) {
    const by = old.form.replacedBy
    const open = forms.find((x) => x.form.id === by)
    console.error(open ? `вопрос задан заново формой ${by}, ответьте на неё` : `вопрос задан заново формой ${by}, но открытого вопроса нет`)
    process.exit(1)
  }
}
if (hits.length !== 1) {
  console.error(hits.length ? `под «${target}» ${hits.length} вопросника — назовите форму: ${hits.map((x) => x.form.id).join(", ")}` : `открытого вопросника «${target}» нет; список — без аргументов`)
  process.exit(1)
}
const { session, form } = hits[0]
const id = `${Date.now()}-${process.pid}`
mkdirSync(ANSWERS, { recursive: true })
const file = path.join(ANSWERS, `${id}.json`)
const tmp = `${file}.tmp`
writeFileSync(tmp, JSON.stringify({ id, at: Date.now(), form: form.id, session, ...(option ? { option } : {}), ...(text ? { text } : {}), quote }, null, 2))
renameSync(tmp, file)
console.log(`ответ ${id} положен: форма ${form.id}, вкладка ${hits[0].key} (${session})`)
if (args.includes("--no-wait")) process.exit(0)
const until = Date.now() + 30_000
while (Date.now() < until) {
  await new Promise((r) => setTimeout(r, 500))
  const r = read(file)
  if (r?.status === "applied") (console.log(`применён: «${r.answer}» — ход прерван, вкладке ушло письмо`), process.exit(0))
  if (r?.status === "refused") (console.log(`не применён: ${r.why}`), process.exit(1))
}
console.log("плагин не ответил за 30 с (служба не работает?); файл остаётся и будет обработан на ближайшем проходе")
process.exit(3)
