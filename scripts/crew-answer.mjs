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
// 2026-10-20: было 12 часов, и вопросы, ждавшие владельца дольше (удержанные по закрытому списку: слияние, приёмка), пропадали из списка; теперь 14 суток
const TTL = Number(process.env.CREW_ANSWER_TTL_H ?? 24 * 14) * 3_600_000
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
  if (!replaced) {
    markHeld(out)
    addHeld(out)
    // вкладка, задавшая новый вопрос, старый оставила (ответ пришёл или ход идёт дальше): по вкладке живёт самый новый
    const newest = new Map()
    for (const x of out) if (!newest.has(x.session) || newest.get(x.session) < x.form.at) newest.set(x.session, x.form.at)
    for (let i = out.length - 1; i >= 0; i--) if (out[i].form.at < newest.get(out[i].session)) out.splice(i, 1)
  }
  return out.sort((a, b) => a.form.at - b.form.at)
}

// Задача 142: причина удержания видна и у формы, чья запись лежит в forms/ (раньше — только у формы без записи, addHeld ниже): метка
// forms/auto/<форма>.json в состоянии «held» называет правило закрытого списка и слово, что его сработало («утверждение правил («утверждаешь»)»).
function markHeld(out) {
  for (const x of out) {
    const m = read(path.join(FORMS, "auto", `${safeKey(x.form.id)}.json`))
    if (m && m.state === "held" && !x.form.held) x.form.held = m.why ?? m.reason ?? true
  }
}

// 2026-10-20: форма, которую плагин УДЕРЖАЛ для владельца по закрытому списку (forms/auto/<форма>.json, state «held»), могла выпасть
// из forms/<сессия>.json (чистка записей) и пропасть из списка, хотя вопрос висит в окне. Добавляем такие формы: варианты — из
// forms/loops/<сессия>.json (там они записаны), если ответа на форму ещё нет. Возраст и причина удержания печатаются.
function addHeld(out) {
  const AUTO = path.join(FORMS, "auto")
  if (!existsSync(AUTO)) return
  const known = new Set(out.map((x) => x.form.id))
  const answered = new Set()
  if (existsSync(ANSWERS)) {
    for (const n of readdirSync(ANSWERS).filter((n) => n.endsWith(".json"))) {
      const a = read(path.join(ANSWERS, n))
      if (a?.form && (a.status === "applied" || a.status === undefined)) answered.add(a.form)
    }
  }
  for (const n of readdirSync(AUTO).filter((n) => n.endsWith(".json"))) {
    const h = read(path.join(AUTO, n))
    if (!h || h.state !== "held" || known.has(h.id) || answered.has(h.id) || typeof h.at !== "number" || Date.now() - h.at >= TTL) continue
    const loops = read(path.join(FORMS, "loops", `${safeKey(h.session)}.json`))
    const ask = (loops?.asks ?? []).find((a) => a.form === h.id)
    if (ask?.answered) continue
    const card = read(path.join(CARDS, `${safeKey(h.session)}.json`)) ?? {}
    const project = card.project ?? h.project ?? "?"
    out.push({ session: h.session, form: { id: h.id, at: h.at, question: h.question, options: ask?.options ?? [], held: h.why ?? h.reason ?? true }, project, key: `${project}.${card.role ?? "?"}` })
  }
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
    const age = Math.round((Date.now() - x.form.at) / 60000)
    const ageText = age >= 120 ? `${Math.round(age / 60)} ч` : `${age} мин`
    console.log(`${x.project}  ${x.key}  сессия ${x.session}  форма ${x.form.id}  (ждёт ${ageText})${x.form.held ? `  [удержана для владельца: ${x.form.held}]` : ""}${x.form.dead ? "  [диалог закрыт: вызов question оборван, вкладку закрыть вручную; ответ будет отклонён]" : ""}${x.form.exhausted ? "  (без ответа после повторов)" : ""}`)
    console.log(`  вопрос: ${x.form.question ?? x.form.title ?? "?"}`)
    ;(x.form.options ?? []).forEach((o, i) => console.log(`  ${i + 1}. ${o}`))
  }
  // 2026-10-20: перекрёстная проверка с панелью: вкладка в состоянии «вопрос»/«владелец» (status/<сессия>.json), у которой нет открытой формы в
  // списке, — вопрос текстом («ждёт указаний») или потерянная запись формы; её тоже надо показать владельцу, а не молчать.
  const STATUS = path.join(base, "status")
  if (existsSync(STATUS)) {
    const have = new Set(forms.map((x) => x.session))
    for (const n of readdirSync(STATUS).filter((n) => n.endsWith(".json"))) {
      const st = read(path.join(STATUS, n))
      if (!st || !["question", "owner"].includes(st.state) || have.has(n.replace(/\.json$/, ""))) continue
      const card = read(path.join(CARDS, n)) ?? {}
      const since = typeof st.since === "number" ? `${Math.round((Date.now() - st.since) / 3_600_000)} ч` : "?"
      console.log(`БЕЗ ФОРМЫ  ${card.project ?? st.project ?? "?"}  ${card.role ?? st.role ?? "?"}  сессия ${n.replace(/\.json$/, "")}  состояние ${st.state}${st.wait ? " (ждёт указаний: вопрос текстом)" : ""}  ждёт ${since}  ${String(st.title ?? card.title ?? "").slice(0, 70)}`)
    }
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
  if (r?.status === "applied") (console.log(`применён: «${r.answer}»`), process.exit(0))
  if (r?.status === "refused") (console.log(`не применён: ${r.why}`), process.exit(1))
  if (r?.status === "unknown") (console.log(`исход неизвестен: ${r.why}; не повторять автоматически, проверить форму`), process.exit(1))
}
console.log("плагин не ответил за 30 с (служба не работает?); файл остаётся и будет обработан на ближайшем проходе")
process.exit(3)
