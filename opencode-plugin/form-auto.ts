// THE PLUGIN ANSWERS THE FORMS OF THE BUILT-IN QUESTIONNAIRE BY THE RECOMMENDATION (task 096, ADR-0010 supplement of 2026-10-19).
// Owner, 2026-10-19: "answer_mode: recommendations only works for text questions of one kind - I was sure these were automatic answers to
// the questionnaires" and "why did a tab slow the process for a day, how to remove such delays without me". Until now the plugin never
// answered a form (the record in forms/ waits for the owner, task 040/059); the orchestrator put the answer by hand on the owner's word
// ("по рекомендации"), dozens of times a day. Now a form is closed by the plugin itself when ALL of this holds at once:
//   (a) the settings of the project (with the `local` block) give the mode `recommendations` for the type of the question: the type of a
//       form is `default`, or the `Тип:` of its text (answer_mode of task 007);
//   (b) exactly ONE option is marked "(Recommended)" and it is the FIRST (no mark, two marks, the mark elsewhere - the owner, no guessing);
//   (c) the question is not on the CLOSED LIST (CLOSED_LIST below: stays with the owner whatever the mode);
//   (d) the limit answer_max of automatic answers in a row for the session is not spent (the owner's answer or word resets the count);
//   (e) the form is open: not replaced, not stale, not cancelled, not in the repeat of a lost question (task 040/071/073);
//   and the form is at least answer_delay_sec old (the owner can answer first; his answer and his word in the tab win).
// Any doubt (a parse failure, an unknown type, not one question in the form, a multiple choice, a loop of task 078) - to the owner.
// Delivery is the answer file of task 059 (owner-answer.ts) with the source "plugin": the record in answers/ is made BEFORE the turn is
// interrupted and every step after it is repeatable, so a death of the process between the changes gives neither a repeat nor a loss
// (rules 13/34(e) of the methodology). The plugin never writes the keys answer_*: they are read only.
// Store: answers/auto-<form>.json (the answer, one per form - the name is the "once" mark) and forms/auto/<form>.json (the marker: held for
// the owner with the reason, or sent/applied/failed) - the counters of /crew and the doctor come from the markers.
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loopOf } from "./answer-loop.ts"
import { ANSWER_TYPES, type AnswerMap, modeFor, normalizeGateText } from "./answer-parse.ts"
import { readJson, safeKey } from "./core.ts"
import { FORMS, type PendingForm, waitingForms } from "./form-wait.ts"
import { BASE } from "./paths.ts"

const ANSWERS_DIR = path.join(BASE, "answers")
const DAY_MS = 24 * 3_600_000
const MARK_KEEP_MS = 3 * DAY_MS

// ---------------------------------------------------------------------------------------------------------------------
// THE CLOSED LIST. What stays with the owner at ANY mode. A table, not logic: a rule is added by a line (id, why, words); every
// rule has a cell in test/crew-form-auto.test.mjs. The words are looked for in the question (title and text), in the label and in
// the description of the RECOMMENDED option. Notation of the words as in GATE_STEMS (answer-parse.ts): "stem" - a substring anywhere,
// "^stem" - from the start of a word, "|word|" - the whole word. `any`: one hit is enough; `all`: lists of words that must ALL be
// present (a pair). The vocabulary is open and errs toward the owner: a false hit costs one question to the owner, a miss is a defect.
export type ClosedRule = { id: string; why: string; any?: string[]; all?: string[][] }
export const CLOSED_LIST: ClosedRule[] = [
  { id: "gates", why: "ворота методики", any: ["ворот", "|gate|", "|gates|"] },
  { id: "approval", why: "утверждение спецификации или плана", any: ["утвержд", "утверд", "одобр", "approv", "согласова", "согласу", "spec md", "plan md", "спецификац", "|spec|"] },
  { id: "accept", why: "решение по результату и сдаче", any: ["сдач", "|accept|", "^accepted", "^принять", "^принят", "^принима", "^приняли", "^прими"] },
  { id: "push", why: "пуш в main или на сервер", any: ["push", "пуш", "|origin|", "|main|", "upstream", "remote"] },
  { id: "merge", why: "слияние", any: ["мерж", "merge", "слия", "слит", "слив", "слей", "слил", "влив", "влит", "влей", "влил", "залит", "залей", "залив", "залил", "rebase", "ребейз", "squash", "ff only", "fast forward", "объедин"] },
  { id: "delete", why: "удаление и уборка", any: ["удал", "delete", "remove", "|rm|", "rmdir", "unlink", "wipe", "purge", "|drop|", "убор", "cleanup", "clean up", "|clean|", "очист", "очищ", "стер", "стир", "снос", "уничтож", "выброс", "выбрас", "сброс", "|reset|", "затер", "затр"] },
  {
    id: "restart",
    why: "перезапуск службы",
    any: ["перезапус", "перезапущ", "перезагруз", "рестарт", "restart", "reboot", "stop opencode"],
    all: [["^служб", "^останов"], ["^служб", "^переключ"], ["^служб", "^выключ"], ["^сервис", "^останов"], ["^сервис", "^переключ"], ["service", "stop"], ["service", "switch"]],
  },
  { id: "live", why: "живая проверка", any: ["^жив", "|live|", "боев", "продакш", "|prod|", "production"] },
  { id: "release", why: "tag, выпуск, публикация, asset, pin", any: ["|tag|", "|tags|", "^тег", "релиз", "release", "выпуск", "выпуст", "publish", "опубликов", "публикац", "|asset|", "|assets|", "|pin|", "deploy", "деплой", "деплои", "выкат", "раскат", "закреп"] },
  { id: "force", why: "force", any: ["^force", "принудит", "^форс"] },
  { id: "secret", why: "пароль, ключ, токен, учётные данные", any: ["парол", "password", "passwd", "секрет", "secret", "|key|", "|keys|", "^ключ", "токен", "token", "credential", "учетн", "apikey", "api key"] },
  { id: "money", why: "оплата и деньги", any: ["оплат", "платеж", "^плат", "^заплат", "деньг", "money", "|usd|", "|eur|", "|руб|", "доллар", "евро", "купи", "покуп", "|buy|", "|pay|", "^payment", "^billing", "подписк", "^subscri"] },
  { id: "owner-word", why: "слово владельца", all: [["^слов", "^владел"]] },
  { id: "answer-keys", why: "изменение ключей answer_*", any: ["^answer", "автоответ"] },
  {
    id: "boundaries",
    why: "снятие запретов и границ задачи",
    any: ["границ", "запрет", "запрещ", "расшир", "объем", "|scope|", "bypass", "обойти", "обход", "no verify", "|override|"],
    all: [["^разреш", "|вне|"]],
  },
  { id: "ceiling", why: "потолок заходов и раундов", any: ["потолок", "ceiling", "раунд", "^заход"] },
  { id: "environments", why: "общие среды", any: ["^среда", "^среде", "^среду", "^средах", "^средой", "^среды", "environment", "|env|"] },
]

type Needle = { stem: string; needle: string }
const needleOf = (stem: string): Needle => {
  const whole = stem.length > 2 && stem.startsWith("|") && stem.endsWith("|")
  const core = normalizeGateText(whole ? stem.slice(1, -1) : stem.startsWith("^") ? stem.slice(1) : stem).trim()
  return { stem, needle: whole ? ` ${core} ` : stem.startsWith("^") ? ` ${core}` : core }
}
const compiled = CLOSED_LIST.map((r) => ({ rule: r, any: (r.any ?? []).map(needleOf), all: (r.all ?? []).map((l) => l.map(needleOf)) }))

/** Every rule of the closed list that the text hits, with the word that hit. */
export function closedHits(text: string): { id: string; why: string; word: string }[] {
  const t = normalizeGateText(text)
  const out: { id: string; why: string; word: string }[] = []
  for (const c of compiled) {
    const one = c.any.find((n) => t.includes(n.needle))
    const pair = one ? undefined : c.all.find((l) => l.every((n) => t.includes(n.needle)))
    const word = one?.stem ?? pair?.map((n) => n.stem).join("+")
    if (word) out.push({ id: c.rule.id, why: c.rule.why, word })
  }
  return out
}
/** The first rule of the closed list that the text hits. */
export const closedBy = (text: string) => closedHits(text)[0]

// ---------------------------------------------------------------------------------------------------------------------
// THE JUDGEMENT on one form: pure, no files.
export type HoldReason = "closed" | "norec" | "limit" | "doubt" | "fail"
export type Judge =
  | { on: false }
  | { on: true; ok: true; option: 1; label: string; type: string }
  | { on: true; ok: false; reason: HoldReason; why: string; rule?: string; type: string }

const MARK = /\(\s*recommended\s*\)/i
const TYPE_RE = /(?:^|[\s(«"'])тип\s*:\s*([\p{L}_-]+)/iu
const hold = (type: string, reason: HoldReason, why: string, rule?: string): Judge => ({ on: true, ok: false, reason, why, type, ...(rule ? { rule } : {}) })

export function judgeForm(f: PendingForm, cfg: { mode: AnswerMap }): Judge {
  try {
    // (a) the mode: the project hands nothing to the recommendation - the old behaviour, no marker, nothing
    if (!(ANSWER_TYPES as readonly string[]).some((t) => modeFor(cfg.mode, t) === "recommendations")) return { on: false }
    const text = [f.title, f.full, f.question].filter(Boolean).join("\n")
    const declared = TYPE_RE.exec(text)?.[1]?.toLowerCase()
    const type = declared ?? "default"
    if (type === "gate") return hold(type, "closed", "тип gate: ворота всегда у владельца", "gate-type")
    if (!(ANSWER_TYPES as readonly string[]).includes(type)) return hold(type, "doubt", `тип «${type}» не из requirements / plan / implementation / default`)
    if (modeFor(cfg.mode, type) !== "recommendations") return { on: false }
    const opts = f.options ?? []
    const marks = opts.map((o, i) => (MARK.test(o) ? i : -1)).filter((i) => i >= 0)
    const rec = marks.length === 1 ? marks[0] : -1
    // (c) the closed list: the question and the RECOMMENDED option (label and description)
    const scan = [text, rec >= 0 ? opts[rec] : "", rec >= 0 ? (f.optDesc?.[rec] ?? "") : ""].join("\n")
    const hit = closedBy(scan)
    if (hit) return hold(type, "closed", `${hit.why} («${hit.word}»)`, hit.id)
    // the shape: exactly one question, not a multiple choice (the answer is one option)
    if (f.nq !== 1) return hold(type, "doubt", "в форме не один вопрос или форма не распознана")
    if (f.multi) return hold(type, "doubt", "вопрос с множественным выбором")
    // (b) exactly one mark, on the first option
    if (!opts.length) return hold(type, "norec", "нет вариантов (вопрос со свободным текстом)")
    if (marks.length !== 1) return hold(type, "norec", marks.length ? "пометка «(Recommended)» у нескольких вариантов" : "нет пометки «(Recommended)»")
    if (rec !== 0) return hold(type, "norec", "пометка «(Recommended)» не у первого варианта")
    return { on: true, ok: true, option: 1, label: opts[0], type }
  } catch (e) {
    return hold("default", "doubt", `сбой разбора: ${e}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// FILES
const autoDirOf = (formsDir: string) => path.join(formsDir, "auto")
const markFile = (formsDir: string, id: string) => path.join(autoDirOf(formsDir), `${safeKey(id)}.json`)
const answerFile = (answersDir: string, id: string) => path.join(answersDir, `auto-${safeKey(id)}.json`)

export type Mark = {
  id: string
  session: string
  project?: string
  task?: number
  type: string
  /** when the owner was first left this form (held) or the answer was put (sent) */
  first: number
  /** the last change of the state; for an applied answer - the time the plugin applied it */
  at: number
  state: "held" | "sent" | "applied" | "failed" | "owner"
  reason?: HoldReason
  rule?: string
  why?: string
  label?: string
  question?: string
}

function writeJson(file: string, v: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(v, null, 1))
  renameSync(tmp, file)
}
/** Create the file only if there is none: a temporary file becomes visible by a hard link (the loser gets EEXIST), the fallback is the flag wx. */
function createOnce(file: string, v: unknown): boolean {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(v, null, 2))
  try {
    try {
      linkSync(tmp, file)
      return true
    } catch (e: any) {
      if (e?.code === "EEXIST") return false
      if (e?.code === "EPERM" || e?.code === "ENOSYS" || e?.code === "ENOTSUP" || e?.code === "EXDEV") {
        try {
          writeFileSync(file, readFileSync(tmp), { flag: "wx" })
          return true
        } catch (e2: any) {
          if (e2?.code === "EEXIST") return false
          throw e2
        }
      }
      throw e
    }
  } finally {
    rmSync(tmp, { force: true })
  }
}
const readMark = (formsDir: string, id: string) => readJson<Mark>(markFile(formsDir, id))
const saveMark = (formsDir: string, m: Mark) => writeJson(markFile(formsDir, m.id), m)

type AnswerFile = { id: string; at: number; session?: string; form?: string; source?: string; status?: string; done?: number; why?: string }
const readAnswers = (answersDir: string): AnswerFile[] => {
  const out: AnswerFile[] = []
  try {
    for (const n of readdirSync(answersDir)) {
      if (!n.endsWith(".json")) continue
      const a = readJson<AnswerFile>(path.join(answersDir, n))
      if (a && typeof a === "object" && !(a as any).kind) out.push(a)
    }
  } catch {}
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// THE TICK
export type AutoConfig = { mode: AnswerMap; max: number; delaySec: number; project?: string; task?: number }
export type AutoDeps = {
  /** the settings of the project of the tab (undefined: no card or no project - nothing is done) */
  config(session: string): AutoConfig | undefined
  /** is the tab open in a window (or a running task session) and does a turn run in it: the question is on the screen only while the turn runs */
  tab(session: string): Promise<{ open: boolean; busy: boolean }>
  /** did the owner write in the tab after `since` */
  ownerWrote(session: string, since: number): Promise<boolean>
  /** the time of the first word of the owner in the tab after `at` (0: none) */
  ownerWordAfter(session: string, at: number): Promise<number>
  say?(line: string): void
}

/** How many automatic answers in a row the session has: those put after the last answer of the owner (a file without the source plugin)
 *  and without the owner's word in the tab between or after them. Answers that were refused are not counted; one put but not yet applied is. */
export async function seriesOf(deps: Pick<AutoDeps, "ownerWordAfter">, session: string, answersDir: string, upTo = Infinity): Promise<number> {
  const mine = readAnswers(answersDir)
    .filter((a) => a.session === session && a.status !== "refused")
    .map((a) => ({ a, t: a.done ?? a.at ?? 0 }))
    .sort((x, y) => x.t - y.t)
  let from = 0
  mine.forEach((x, i) => {
    if (x.a.source !== "plugin") from = i + 1
  })
  const auto = mine.slice(from)
  if (!auto.length) return 0
  if ((await deps.ownerWordAfter(session, auto[auto.length - 1].t)) > 0) return 0
  let n = 1
  for (let i = auto.length - 1; i >= 1 && n < upTo; i--) {
    const w = await deps.ownerWordAfter(session, auto[i - 1].t)
    if (w > 0 && w < auto[i].t) break
    n++
  }
  return n
}

const recheck = new Map<string, { until: number; max: number }>()
const RECHECK_MS = 30_000
let markers = new Set<string>()
let scanned = ""

/** Follow the answer file: sent -> applied / failed. */
function syncMark(formsDir: string, answersDir: string, m: Mark): Mark {
  if (m.state !== "sent") return m
  const a = readJson<AnswerFile>(answerFile(answersDir, m.id))
  if (a?.status === "applied") {
    const f: Mark = { ...m, state: "applied", at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  // the owner was first (his answer file or his reply took the form): not a failure of ours, not counted anywhere
  if (a?.status === "refused" && /already answered|no open question form|вопрос задан заново/.test(a.why ?? "")) {
    const f: Mark = { ...m, state: "owner", ...(a.why ? { why: a.why } : {}), at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  if (a?.status === "refused") {
    const f: Mark = { ...m, state: "failed", reason: "fail", ...(a.why ? { why: a.why } : {}), at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  return m
}

export async function autoTick(deps: AutoDeps, now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): Promise<void> {
  const say = deps.say ?? (() => {})
  const autoDir = autoDirOf(formsDir)
  // the markers that wait for their answer file: found once per process (and per folder), then kept in memory
  if (scanned !== autoDir) {
    scanned = autoDir
    markers = new Set()
    try {
      for (const n of existsSync(autoDir) ? readdirSync(autoDir) : []) if (n.endsWith(".json") && readJson<Mark>(path.join(autoDir, n))?.state === "sent") markers.add(n.replace(/\.json$/, ""))
    } catch {}
  }
  for (const key of [...markers]) {
    const m = readJson<Mark>(path.join(autoDir, `${key}.json`))
    if (!m || m.state !== "sent") {
      markers.delete(key)
      continue
    }
    if (syncMark(formsDir, answersDir, m).state !== "sent") markers.delete(key)
  }
  for (const { session, form: f } of waitingForms(now, formsDir)) {
    try {
      await one(deps, session, f, now, formsDir, answersDir, say)
    } catch (e) {
      say(`form auto failed for ${session}/${f.id}: ${e}`)
    }
  }
  purge(autoDir, now)
}

async function one(deps: AutoDeps, session: string, f: PendingForm, now: number, formsDir: string, answersDir: string, say: (l: string) => void) {
  if (f.replacedBy || f.cancelled || f.repeats || f.exhausted) return // the repeats of a lost question and the history are not touched (tasks 040, 071, 073)
  const cfg = deps.config(session)
  if (!cfg) return
  const file = answerFile(answersDir, f.id)
  const mark = readMark(formsDir, f.id)
  if (existsSync(file)) {
    // decided before (maybe by a process that died before it wrote the marker): the file is the fact, the marker follows it
    if (!mark || mark.state === "held") {
      const m: Mark = { id: f.id, session, ...(cfg.project ? { project: cfg.project } : {}), ...(cfg.task ? { task: cfg.task } : {}), type: "default", first: now, at: now, state: "sent" }
      saveMark(formsDir, m)
      markers.add(safeKey(f.id))
    }
    return
  }
  const j = judgeForm(f, cfg)
  if (!j.on) return
  const base = { id: f.id, session, ...(cfg.project ? { project: cfg.project } : {}), ...(cfg.task ? { task: cfg.task } : {}), type: j.type, question: (f.question ?? f.title ?? "").slice(0, 200) }
  const holdFor = (reason: HoldReason, why: string, rule?: string) => {
    if (mark?.state === "held" && mark.reason === reason && mark.rule === rule && mark.why === why) return
    saveMark(formsDir, { ...base, first: mark?.first ?? now, at: now, state: "held", reason, why, ...(rule ? { rule } : {}) })
    say(`form ${f.id} of ${session}: left to the owner (${reason}${rule ? `, ${rule}` : ""}): ${why}`)
  }
  if (!j.ok) return holdFor(j.reason, j.why, j.rule)
  if (now - (f.born ?? f.at) < Math.max(0, cfg.delaySec) * 1000) return // the owner may answer first
  const key = `${session}/${f.id}`
  const r0 = recheck.get(key)
  if (r0 && r0.until > now && r0.max === cfg.max) return // looked a moment ago (a query each): not every tick
  const tab = await deps.tab(session)
  if (!tab.open || !tab.busy) return // no running turn: the form is lost, not on the screen - the repeat of task 040 is its way
  if (loopOf(session, formsDir)) return holdFor("doubt", "вкладка зациклилась на вопросе (задача 078)")
  if (await deps.ownerWrote(session, f.at)) {
    recheck.set(key, { until: now + RECHECK_MS, max: cfg.max })
    return // the owner is in the tab: his word is older than any setting
  }
  const used = await seriesOf(deps, session, answersDir, cfg.max)
  if (used >= cfg.max) {
    recheck.set(key, { until: now + RECHECK_MS, max: cfg.max })
    return holdFor("limit", `предел answer_max: ${used} автоответов подряд`)
  }
  const out = {
    id: `auto-${safeKey(f.id)}`,
    at: now,
    source: "plugin",
    form: f.id,
    session,
    option: "1",
    quote: `answer_mode: recommendations (тип ${j.type}), форма встроенного вопросника, у первого варианта единственная пометка (Recommended); задержка ${cfg.delaySec} с`,
    mode: "recommendations",
    type: j.type,
    ...(cfg.project ? { project: cfg.project } : {}),
    ...(cfg.task ? { task: cfg.task } : {}),
  }
  // the record of the answer comes first (and only one per form: the name is the mark); delivery is owner-answer.ts
  if (!createOnce(file, out)) return
  saveMark(formsDir, { ...base, first: now, at: now, state: "sent", label: j.label })
  markers.add(safeKey(f.id))
  say(`form ${f.id} of ${session}: answered by answer_mode (recommendations, type ${j.type}): "${j.label.slice(0, 80)}" after ${Math.round((now - (f.born ?? f.at)) / 1000)} s`)
}

let purgedAt = 0
function purge(autoDir: string, now: number) {
  if (now - purgedAt < 10 * 60_000) return
  purgedAt = now
  try {
    for (const n of existsSync(autoDir) ? readdirSync(autoDir) : []) {
      const file = path.join(autoDir, n)
      if (n.endsWith(".json") && Date.now() - statSync(file).mtimeMs > MARK_KEEP_MS) rmSync(file, { force: true })
    }
  } catch {}
}

// ---------------------------------------------------------------------------------------------------------------------
// THE LETTER AND THE NOTE (owner-answer.ts uses them for the source plugin)
const GATES_TEXT = "Ворота — утверждение spec.md и plan.md, согласование плана, пуш, слияние, удаление, перезапуск или переключение службы, публикация, деньги и подписки, общие среды, отказ от требования, потолок заходов и раунды, решения по результату и сдаче — только слово владельца."
export const autoLetter = (question: string, answer: string, type: string) =>
  `Ответ по настройке проекта (answer_mode: recommendations, тип ${type}), не слово владельца. Ваш вопрос «${question}» закрыт плагином: выбран рекомендованный вариант «${answer}». ` +
  `Вопросник закрыт прерыванием хода; не задавайте этот вопрос снова, продолжайте с этим ответом. ` +
  `${GATES_TEXT} Правило: вышел за рекомендацию — вопрос владельцу. Слово владельца в диалоге старше этого ответа.`
export const autoNote = (question: string, answer: string, type: string, id: string) =>
  `ответ по настройке проекта (answer_mode: recommendations, тип ${type}) на форму «${question.slice(0, 150)}»: ${answer.slice(0, 200)} [answer ${id}]`

// ---------------------------------------------------------------------------------------------------------------------
// THE SHOW: the counters of /crew and of the side panel, the note of the doctor
export type AutoStats = { answered: number; last?: number; held: Record<HoldReason, number>; heldTotal: number }
const REASON_WORDS: Record<HoldReason, string> = { closed: "закрытый список", norec: "нет рекомендации", limit: "предел", doubt: "сомнение", fail: "сбой доставки" }
const REASON_SHORT: Record<HoldReason, string> = { closed: "closed", norec: "no rec", limit: "limit", doubt: "doubt", fail: "failed" }

/** The forms of the last 24 hours: answered by the plugin, and left to the owner by reason. `project` undefined - all projects. */
export function autoStats(project: string | undefined, now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): AutoStats {
  void answersDir
  const out: AutoStats = { answered: 0, held: { closed: 0, norec: 0, limit: 0, doubt: 0, fail: 0 }, heldTotal: 0 }
  const dir = autoDirOf(formsDir)
  let names: string[] = []
  try {
    names = existsSync(dir) ? readdirSync(dir) : []
  } catch {}
  for (const n of names) {
    if (!n.endsWith(".json")) continue
    const m = readJson<Mark>(path.join(dir, n))
    if (!m || (project && m.project !== project)) continue
    if (m.state === "applied" && now - m.at <= DAY_MS) {
      out.answered++
      out.last = Math.max(out.last ?? 0, m.at)
    } else if ((m.state === "held" || m.state === "failed") && now - (m.state === "held" ? m.first : m.at) <= DAY_MS) {
      const r: HoldReason = m.state === "failed" ? "fail" : (m.reason ?? "doubt")
      out.held[r]++
      out.heldTotal++
    }
  }
  return out
}

/** "closed 1, no rec 2": the reasons with a count, for the counter of /crew. */
export const heldShort = (s: AutoStats) => (Object.keys(REASON_SHORT) as HoldReason[]).filter((r) => s.held[r]).map((r) => `${REASON_SHORT[r]} ${s.held[r]}`).join(", ")

/** Lines of the doctor ("К сведению"): the day's count, the last closing, the forms left to the owner and why. Nothing happened - no line. */
export function autoNotes(now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): string[] {
  const s = autoStats(undefined, now, formsDir, answersDir)
  if (!s.answered && !s.heldTotal) return []
  const hm = (t: number) => new Date(t).toTimeString().slice(0, 5)
  const why = (Object.keys(REASON_WORDS) as HoldReason[]).filter((r) => s.held[r]).map((r) => `${REASON_WORDS[r]} ${s.held[r]}`).join(", ")
  return [`автоответы на формы встроенного вопросника за сутки: ${s.answered}${s.last ? ` (последнее в ${hm(s.last)})` : ""}; ушло владельцу: ${s.heldTotal}${why ? ` (${why})` : ""}`]
}
