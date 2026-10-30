// СТОРОЖ ПРОСТОЯ ЗАДАЧИ: СРОК ШАГА, ЛЕСТНИЦА И ВОПРОС ВЛАДЕЛЬЦУ (задача 161; владелец, 2026-10-24, чат оркестратора: «У каждого шага свой срок —
// да, 30 минут на выполнение», «092 не делается, в чем дело? как этого избежать в будущем?»). Случай 092 Новы: задача числилась идущей, окно
// автора было занято другим, правило простоя вкладки (idle-tab.ts) молчало, а его письмо «Ты простаиваешь» не требует ответа и выше не поднимается.
//
// ЗАДАЧА СТОИТ, когда её ШАГ не менялся дольше срока, независимо от занятости окна. Шаг — по статусу (stepOf): запуск исполнителя, работа,
// приёмка, предъявление плана, уборка, «между сессиями», ответ на заказ. Начало шага (stepAt) — самое позднее из: смена статуса, слово держателя
// в записи (не плагина, кроме «ответ владельца …», и не «подталкивание …»), проверка шага приёмки, начало и конец сессий, предпроверка. Поле
// `updated` не годится: его двигает любая запись плагина.
//
// ЛЕСТНИЦА (записи — файл idle-watch/<проект>/<номер>.json в ящике: срок и письма переживают перезапуск службы, повторов нет):
//   срок вышел → письмо держателю, которое ТРЕБУЕТ ответа инструментом crew_step_note {reason, minutes} или {done}: ответ продлевает срок на
//   step_extend_minutes (30) один раз на письмо; нет ответа step_answer_minutes (15) или та же причина второй раз → ВОПРОС ВЛАДЕЛЬЦУ: запись с
//   вариантами (ждать ещё, сузить задачу, сменить исполнителя, отказаться), рекомендацией и доводом из записей; автору — письмо с текстом для
//   инструмента question, окнам — уведомление, в /crew, панели, /crew-progress и crew_doctor — «срок вышел, вопрос открыт». Писем держателю
//   не больше двух. Решение владельца пишет автор: crew_step_note {decide, who}; после решения новый срок и повторов нет.
// БЕЗ ТРЕВОГИ: ход окна по этой задаче идёт, открыт вопрос владельцу, HOLD/STOP по слову владельца (метка в записи), внешний прогон с потолком.
// Модуль без обращений к окнам и службе: всё внешнее (письма, уведомления, факты окон) приходит в Deps — его проверяют без плагина.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { PLUGIN_SENDER, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"
import { type Task, type TaskStatus, isOpen, loadTask, statusRu, taskNo, taskRef } from "./tasks.ts"

export const WATCH_DIR = path.join(BASE, "idle-watch")
const MIN = 60_000
/** Писем держателю на шаг не больше двух (ответ на каждое продлевает срок один раз). */
export const LETTERS_MAX = 2

export type StepRole = "start" | "work" | "review" | "plan" | "order" | "cleanup" | "between"
export const STEP_ROLES: StepRole[] = ["start", "work", "review", "plan", "order", "cleanup", "between"]
const STEP_WORDS: Record<StepRole, string> = { start: "запуск исполнителя", work: "работа исполнителя", review: "приёмка", plan: "предъявление плана", order: "ответ на заказ", cleanup: "уборка принятой задачи", between: "запуск следующей сессии" }

/** questionsMax — открытых вопросов владельцу на проект (2), passMax — новых писем за проход (3), oldMin — после скольких минут стоянки задача входит в сводный вопрос (300; 0 — без сводного). */
export type StepConfig = { termMin: number; byStep: Record<string, number>; extendMin: number; answerMin: number; questionsMax?: number; passMax?: number; oldMin?: number }
export const DEFAULT_STEP: StepConfig = { termMin: 30, byStep: {}, extendMin: 30, answerMin: 15 }
/** Срок шага, мс: значение по шагу (step_term_by_step) или общее (step_term_minutes); 0 — сторож выключен. */
export const termMs = (role: StepRole | string, c: StepConfig): number => Math.max(0, (Number.isFinite(c.byStep?.[role]) ? c.byStep[role] : c.termMin) * MIN)

const ROLE_OF: Partial<Record<TaskStatus, StepRole>> = { starting: "start", running: "work", rework: "work", submitted: "review", reviewing: "review", approval: "plan", accepted: "cleanup", idle: "between" }

/** Когда шаг задачи начался (последнее его движение): см. шапку; поле `updated` не используется. */
export function stepAt(t: Task): number {
  let at = t.created ?? 0
  for (const h of t.history ?? []) {
    const own = h.by === PLUGIN_SENDER
    const note = h.note ?? ""
    const moves = h.status ? true : own ? /^ответ владельца/.test(note) : !/^подталкивание/.test(note)
    if (moves) at = Math.max(at, h.at ?? 0)
  }
  at = Math.max(at, t.checking?.at ?? 0, t.precheck?.at ?? 0)
  for (const s of t.sessions ?? []) at = Math.max(at, s.started ?? 0, s.ended ?? 0)
  return at
}

/** Шаг задачи: роль, ключ (статус и начало — сменился шаг, эпизод кончился) и начало. Нет шага: задача закрыта, пауза, чужой номер, заказ взят. */
export function stepOf(t: Task): { role: StepRole; key: string; at: number } | undefined {
  if (t.kind === "external") return undefined
  let role = ROLE_OF[t.status]
  if (t.kind === "order") {
    if (t.status !== "running" || t.child || !t.order_to) return undefined // взят: шаг ведёт задача проекта-исполнителя
    role = "order"
  }
  if (!role) return undefined
  const at = stepAt(t)
  return { role, key: `${t.status}:${at}`, at }
}

export type Holder = { session: string; label: string }
/** Кто держит шаг (кому письмо): исполнитель, приёмщик, автор; заказ — интегратор адресата, если у него есть окно (addressee). Никого — автор. */
export function holderOf(t: Task, addressee?: string): Holder {
  const author: Holder = { session: t.author, label: "автор" }
  switch (stepOf(t)?.role ?? ROLE_OF[t.status]) {
    case "start":
    case "work":
      return t.executor ? { session: t.executor, label: "исполнитель" } : author
    case "review":
    case "cleanup":
      return t.reviewer ? { session: t.reviewer, label: "приёмщик" } : author
    case "order":
      return addressee ? { session: addressee, label: "интегратор адресата" } : author
    default:
      return author
  }
}

/** Письмо сторожа срока шага и так придёт автору о том же шаге (держатель — автор: между сессиями, задача без исполнителя, заказ без окна адресата) и ТРЕБУЕТ ответа,
 *  поэтому старое «Ты простаиваешь» (idle-tab.ts) об этой задаче не шлётся: одно письмо на шаг, а не два (приёмка 161, замечание 4). Не покрыто: исполнитель без
 *  живой сессии, молчащий исполнитель, ждущая сессия, уборка — там старое письмо остаётся. */
export function watchCovers(item: { kind: string; task: Task; lost?: boolean; window?: boolean }, c: StepConfig): boolean {
  const role = stepOf(item.task)?.role
  if (!role || termMs(role, c) <= 0) return false
  return item.kind === "between" || (item.kind === "nosession" && !item.lost) || (item.kind === "order" && !item.window)
}

// ---- записи

export type OptionId = "wait" | "narrow" | "reassign" | "cancel"
export type Option = { id: OptionId; label: string; desc: string }
export type Decision = { kind: OptionId; label: string; who: string; at: number; minutes?: number; question?: string }
export type Question = { id: string; at: number; why: string; recommend: OptionId; options: Option[]; text: string; decision?: Decision }
export type Answer = { at: number; by: string; reason?: string; minutes?: number; done?: true; repeat?: true }
export type Episode = { key: string; role: StepRole; status: string; since: number; due: number; holder: string; label: string; round: number; letters: { at: number; id: string }[]; answers: Answer[]; repeat?: true; question?: Question }
export type Rec = { project: string; n: number; hold?: { kind: "HOLD" | "STOP"; who: string; at: number }; ep?: Episode; decisions?: Decision[] }

const fileOf = (project: string, n: number, dir: string) => path.join(dir, safeKey(project), `${n}.json`)
export const readRecord = (project: string, n: number, dir = WATCH_DIR): Rec | undefined => readJson<Rec>(fileOf(project, n, dir))
function writeRecord(r: Rec, dir = WATCH_DIR) {
  const file = fileOf(r.project, r.n, dir)
  if (!r.ep && !r.hold && !r.decisions?.length) return void rmSync(file, { force: true })
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(r, null, 1))
  renameSync(`${file}.tmp`, file)
}
/** Все записи сторожа (проект: только его). */
export function records(dir = WATCH_DIR, project?: string): Rec[] {
  const out: Rec[] = []
  if (!existsSync(dir)) return out
  for (const p of project ? [safeKey(project)] : readdirSync(dir)) {
    const d = path.join(dir, p)
    if (!existsSync(d)) continue
    for (const f of readdirSync(d).filter((x) => /^\d+\.json$/.test(x))) {
      const r = readJson<Rec>(path.join(d, f))
      if (r && typeof r.n === "number" && (!project || r.project === project)) out.push(r)
    }
  }
  return out.sort((a, b) => a.project.localeCompare(b.project) || a.n - b.n)
}

const hm = (t?: number) => (t ? new Date(t).toTimeString().slice(0, 5) : "?")
const norm = (s = "") => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const mins = (from: number, now: number) => Math.max(0, Math.round((now - from) / MIN))
const OPTIONS = (extendMin: number): Option[] => [
  { id: "wait", label: "Ждать ещё", desc: `ещё срок (по умолчанию ${extendMin} мин); для сознательного ожидания нужен HOLD, иначе лестница повторится` },
  { id: "narrow", label: "Сузить задачу", desc: "убрать из задачи то, что не вмещается в срок" },
  { id: "reassign", label: "Сменить исполнителя", desc: "crew_task reassign: новая сессия, прежняя сводка" },
  { id: "cancel", label: "Отказаться от задачи", desc: "crew_task cancel" },
]

// ---- лестница

export type Deps = {
  dir?: string
  cfg(t: Task): StepConfig
  /** сессия интегратора проекта-адресата заказа, если у него есть окно */
  addressee?(project: string): string | undefined
  /** ход окна держателя по этой задаче идёт (держатель — исполнитель или приёмщик этой задачи, сводка working) */
  turnGoing(t: Task, session: string | undefined): boolean
  /** у держателя, исполнителя или приёмщика открыт вопрос владельцу */
  formOpen(t: Task): boolean
  /** шаг по построению ждёт владельца: план на согласовании при plan_approver owner (владелец решает в /plans, он уже уведомлён); или у держателя, исполнителя, приёмщика вопрос владельцу текстом хода (состояние owner) */
  ownerHolds?(t: Task): boolean
  /** у держателя есть живая карточка и окно: письмо дойдёт (нет — задача идёт в сводный вопрос, письма нет) */
  holderAlive?(session: string): boolean
  /** открыто наблюдение (crew_watch) держателя, у которого потолок ещё не вышел */
  externalRun(t: Task, now: number): boolean
  letter(to: string, id: string, text: string, kind: "ask" | "question" | "summary"): void
  notice(title: string, message: string): void
  taskNote?(t: Task, text: string): void
  say?(line: string): void
}

const letterId = (t: Task, ep: Episode, k: number | "q") => `idle-step-${k === "q" ? "q-" : ""}${safeKey(t.project)}-${t.n}-${ep.since}-${ep.round}${k === "q" ? "" : `-${k}`}`

function askText(t: Task, ep: Episode, c: StepConfig, now: number, k: number): string {
  const no = taskNo(t)
  const term = Math.round(termMs(ep.role, c) / MIN)
  return (
    `Шаг стоит ${mins(ep.since, now)} мин, срок вышел: задача ${taskRef(t)} — ${STEP_WORDS[ep.role]} (${statusRu(t.status)}; шаг держишь ты как ${ep.label}). Шаг не менялся с ${hm(ep.since)}, срок ${term} мин. ` +
    `${k >= LETTERS_MAX ? "Это второе и последнее письмо. " : ""}` +
    `Письмо ТРЕБУЕТ ответа инструментом: crew_step_note {n: ${t.n}, reason: "<что сделано, чего ждёшь, почему стоит>", minutes: <на сколько продлить, не больше ${c.extendMin}>} — срок продлится один раз на ${c.extendMin} мин; ` +
    `если шаг сделан — crew_step_note {n: ${t.n}, done: true} и сдай его штатным действием. Текстом или ходом без инструмента ответ не засчитывается. ` +
    `Без ответа за ${c.answerMin} мин, а также при той же причине второй раз плагин поднимет вопрос владельцу о задаче ${no}.`
  )
}

function buildQuestion(t: Task, ep: Episode, c: StepConfig, now: number, why: "silent" | "repeat" | "twice"): Question {
  const standing = mins(ep.since, now)
  const term = Math.round(termMs(ep.role, c) / MIN)
  const reasons = ep.answers.filter((a) => a.reason).map((a) => `«${a.reason}»`)
  const last = ep.letters.at(-1)
  let line: string
  let recommend: OptionId
  if (why === "silent") {
    line = `${ep.label} (${ep.holder}) не ответил на письмо ${hm(last?.at)} за ${c.answerMin} мин; шаг «${STEP_WORDS[ep.role]}» стоит ${standing} мин при сроке ${term} мин, последнее движение шага ${hm(ep.since)}`
    recommend = ep.role === "order" ? "wait" : "reassign"
  } else if (why === "repeat") {
    line = `${ep.label} назвал ту же причину второй раз (${reasons.at(-1) ?? "—"}); шаг «${STEP_WORDS[ep.role]}» стоит ${standing} мин при сроке ${term} мин`
    recommend = "narrow"
  } else {
    line = `срок вышел снова после ${ep.answers.length} ответов (${reasons.join(", ") || "без причины"}); шаг «${STEP_WORDS[ep.role]}» стоит ${standing} мин при сроке ${term} мин, письма держателю исчерпаны (${LETTERS_MAX})`
    recommend = ep.role === "order" ? "wait" : "narrow"
  }
  const options = OPTIONS(c.extendMin)
  const rec = options.find((o) => o.id === recommend)!
  const list = options.map((o, i) => `${i + 1}. ${o.label}${o.id === recommend ? " (Recommended)" : ""} — ${o.desc}`).join("; ")
  const text =
    `Шаг стоит ${standing} мин, срок вышел: вопрос владельцу по задаче ${taskRef(t)}. Задай его инструментом question (один вопрос, варианты ниже, рекомендация первым вариантом с пометкой (Recommended)). ` +
    `Вопрос: шаг «${STEP_WORDS[ep.role]}» задачи ${taskNo(t)} стоит ${standing} мин при сроке ${term} мин, держатель — ${ep.label}. Что делать? ` +
    `Варианты: ${list}. Рекомендация: ${rec.label}. Довод: ${line}. ` +
    `Если ждать сознательно, поставь HOLD (crew_step_note {n: ${t.n}, hold: "HOLD", who}): без него после «ждать ещё» лестница начнётся заново через ${c.extendMin + c.answerMin} мин. ` +
    `Слово владельца запиши: crew_step_note {n: ${t.n}, decide: "wait"|"narrow"|"reassign"|"cancel", who: "владелец, <дата>, «слово»", minutes?: <новый срок для «ждать ещё»>}. ` +
    `Пока решения нет, задача помечена «срок вышел, вопрос открыт».`
  return { id: letterId(t, ep, "q"), at: now, why: `${line[0].toUpperCase()}${line.slice(1)}.`, recommend, options, text }
}

// ---- защита от залпа на старых задачах (приёмка 161: на реальном ящике на первом проходе «стояли» 10 открытых задач, до 10 писем и через 15 минут
// до 10 вопросов владельцу, 6 из них по одному проекту)
//   а) не больше passMax новых писем за проход (остальные ждут следующего прохода) и не больше questionsMax открытых вопросов владельцу на проект
//      (остальные ждут очереди: ступень не сдвигается, пока нет места);
//   б) задача, стоящая дольше oldMin (по умолчанию 300 минут), и в) задача, чей держатель не в окне, отдельных писем не получают: они входят в ОДИН
//      сводный вопрос владельцу на проект (файл _summary.json), пока ни одна из них не решена словом владельца (decide, HOLD) или не закрыта.
const QUESTIONS_MAX = 2
const PASS_MAX = 3
const OLD_MIN = 300

export type SummaryItem = { n: number; title: string; mins: number; why: "old" | "dead"; label: string; holder: string }
export type Summary = { project: string; at: number; ns: number[]; items: SummaryItem[]; question?: { id: string; at: number; why: string; text: string; options: Option[]; recommend: OptionId; decision?: Decision } }
const summaryFile = (project: string, dir: string) => path.join(dir, safeKey(project), "_summary.json")
export const readSummary = (project: string, dir = WATCH_DIR): Summary | undefined => readJson<Summary>(summaryFile(project, dir))
function writeSummary(s: Summary, dir: string) {
  const file = summaryFile(s.project, dir)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 1))
  renameSync(`${file}.tmp`, file)
}
const dropSummary = (project: string, dir: string) => rmSync(summaryFile(project, dir), { force: true })
/** Проекты, у которых есть сводный вопрос. */
const summaryProjects = (dir: string): string[] => {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const p of readdirSync(dir)) {
    const s = readJson<Summary>(path.join(dir, p, "_summary.json"))
    if (s?.project) out.push(s.project)
  }
  return out
}

function summaryText(project: string, items: SummaryItem[], oldMin: number, now: number): { text: string; why: string } {
  const list = items.map((i) => `${i.title} — ${i.mins} мин, ${i.why === "dead" ? `${i.label} (${i.holder}): окна нет` : i.label}`).join("; ")
  const dead = items.filter((i) => i.why === "dead").length
  const why = `${items.length} задач проекта ${project} не двигаются дольше ${oldMin} мин${dead ? ` или держатель не в окне (${dead})` : ""}: письма им не помогут`
  const text =
    `Шаг стоит давно, срок вышел: ${why}. Отдельных писем им нет. Задай владельцу ОДИН вопрос инструментом question (варианты ниже, рекомендация первым вариантом с пометкой (Recommended)). ` +
    `Стоят: ${list}. ` +
    `Вопрос: что делать с ними? Варианты: 1. Закрыть то, что мертво (crew_task cancel) (Recommended) — задача не нужна или давно заброшена; 2. HOLD — сознательно не трогать (crew_step_note {n, hold: "HOLD", who}); ` +
    `3. Ждать ещё (crew_step_note {n, decide: "wait", minutes, who}); 4. Сменить исполнителя (crew_task reassign). ` +
    `Рекомендация: закрыть мёртвое, остальное — HOLD. Довод: ${why}, значит, ни держатель, ни окно ими не занимаются (на ${hm(now)}). ` +
    `Решение владельца по каждой задаче: crew_step_note {n, decide | hold, who: "владелец, <дата>, «слово»"}; пока в списке есть задача, она помечена «стоят давно, вопрос открыт».`
  return { text, why }
}

/** Один проход по открытым задачам: письма и вопросы владельцу. Возвращает, сколько писем и вопросов ушло. */
export function watchTick(tasks: Task[], d: Deps, now: number): { letters: number; questions: number } {
  const dir = d.dir ?? WATCH_DIR
  const sum = { letters: 0, questions: 0 }
  let sent = 0 // письма этого прохода: не больше passMax
  const open = new Map<string, number>() // открытые вопросы владельцу по проектам
  for (const r of records(dir)) if (r.ep?.question && !r.ep.question.decision) open.set(r.project, (open.get(r.project) ?? 0) + 1)
  const todo: (() => void)[] = []
  const old = new Map<string, { t: Task; item: SummaryItem; c: StepConfig }[]>()
  for (const t of tasks) {
    const st = stepOf(t)
    const rec0 = readRecord(t.project, t.n, dir)
    if (!st) {
      if (rec0?.ep) writeRecord({ ...rec0, ep: undefined }, dir)
      continue
    }
    const c = d.cfg(t)
    const term = termMs(st.role, c)
    if (term <= 0) continue
    const rec: Rec = rec0 ?? { project: t.project, n: t.n }
    let dirty = false
    if (rec.ep && rec.ep.key !== st.key) {
      d.say?.(`step watch: ${taskNo(t)} the step moved on (${rec.ep.status} -> ${t.status}): the episode is closed${rec.ep.question && !rec.ep.question.decision ? ", the open question is closed with it" : ""}`)
      rec.ep = undefined
      dirty = true
    }
    const save = () => dirty && writeRecord(rec, dir)
    if (rec.hold) {
      save()
      continue
    }
    const due = Math.max(st.at + term, rec.ep?.due ?? 0)
    if (now < due) {
      save()
      continue
    }
    const h = holderOf(t, t.kind === "order" && t.order_to ? d.addressee?.(t.order_to) : undefined)
    if (d.turnGoing(t, h.session) || d.formOpen(t) || d.ownerHolds?.(t) || d.externalRun(t, now)) {
      save()
      continue
    }
    // старая задача или держатель не в окне: не письмо, а строка сводного вопроса (кроме задач, чей вопрос уже открыт)
    const questionOpen = !!rec.ep?.question && !rec.ep.question.decision
    const alive = d.holderAlive ? d.holderAlive(h.session) : true
    const oldMs = (c.oldMin ?? OLD_MIN) * MIN
    if (!questionOpen && (!alive || (oldMs > 0 && now - st.at >= oldMs))) {
      const item: SummaryItem = { n: t.n, title: taskRef(t), mins: mins(st.at, now), why: alive ? "old" : "dead", label: h.label, holder: h.session }
      old.set(t.project, [...(old.get(t.project) ?? []), { t, item, c }])
      save()
      continue
    }
    todo.push(() => {
      const passMax = c.passMax ?? PASS_MAX
      if (!rec.ep) {
        rec.ep = { key: st.key, role: st.role, status: t.status, since: st.at, due, holder: h.session, label: h.label, round: 0, letters: [], answers: [] }
        dirty = true
      }
      const ep = rec.ep
      if (ep.holder !== h.session) (ep.holder = h.session), (ep.label = h.label), (dirty = true)
      if (ep.question && !ep.question.decision) return save()
      const last = ep.letters.at(-1)
      const answered = !!last && ep.answers.some((a) => a.at >= last.at)
      const ask = () => {
        if (sent >= passMax) return
        const k = ep.letters.length + 1
        const id = letterId(t, ep, k)
        d.letter(h.session, id, askText(t, ep, c, now, k), "ask")
        ep.letters.push({ at: now, id })
        dirty = true
        sent++
        sum.letters++
        d.say?.(`step watch: ${taskNo(t)} the step stands ${mins(ep.since, now)} min past the term: letter ${k} of ${LETTERS_MAX} to ${h.label} ${h.session}`)
      }
      const raise = (why: "silent" | "repeat" | "twice") => {
        if (sent >= passMax || (open.get(t.project) ?? 0) >= (c.questionsMax ?? QUESTIONS_MAX)) return // нет места: ждёт очереди
        const q = buildQuestion(t, ep, c, now, why)
        ep.question = q
        ep.repeat = undefined
        d.letter(t.author, q.id, q.text, "question")
        d.notice(`${taskNo(t)} · срок вышел`, `шаг стоит ${mins(ep.since, now)} мин: вопрос владельцу (${ep.label}), рекомендация — ${q.options.find((o) => o.id === q.recommend)?.label}`)
        d.taskNote?.(t, `срок шага вышел, вопрос владельцу открыт: ${q.why}`)
        open.set(t.project, (open.get(t.project) ?? 0) + 1)
        dirty = true
        sent++
        sum.questions++
        d.say?.(`step watch: ${taskNo(t)} the question to the owner is open (${why})`)
      }
      if (!last) ask()
      else if (ep.repeat) raise("repeat")
      else if (!answered) {
        if (now - last.at >= c.answerMin * MIN) raise("silent")
      } else if (ep.letters.length < LETTERS_MAX) ask()
      else raise("twice")
      save()
    })
  }
  // сводные вопросы: первыми (один на проект), потом лестница задач
  for (const project of new Set([...old.keys(), ...summaryProjects(dir)])) {
    const list = (old.get(project) ?? []).sort((a, b) => a.t.n - b.t.n)
    const prev = readSummary(project, dir)
    if (!list.length) {
      if (prev) dropSummary(project, dir)
      continue
    }
    const items = list.map((x) => x.item)
    const ns = items.map((i) => i.n)
    const standing = prev?.question && !prev.question.decision ? prev : undefined
    const oldMin = list[0].c.oldMin ?? OLD_MIN
    const { text, why } = summaryText(project, items, oldMin, now)
    if (standing && ns.every((n) => standing.ns.includes(n))) {
      if (JSON.stringify(ns) !== JSON.stringify(standing.ns)) writeSummary({ ...standing, ns, items, question: { ...standing.question!, text, why } }, dir) // список сократился: тихо
      continue
    }
    if (sent >= (list[0].c.passMax ?? PASS_MAX)) continue // письмо за проход: ждёт следующего
    const author = list[0].t.author
    const id = `idle-step-s-${safeKey(project)}-${now}`
    d.letter(author, id, text, "summary")
    d.notice(`${project} · стоят давно`, `${items.length} задач проекта не двигаются или без окна держателя: один сводный вопрос владельцу`)
    writeSummary({ project, at: now, ns, items, question: { id, at: now, why, text, options: OPTIONS(list[0].c.extendMin), recommend: "cancel" } }, dir)
    sent++
    sum.letters++
    sum.questions++
    d.say?.(`step watch: ${project} ${items.length} tasks stand too long or lost their holder: one summary question to the owner (${ns.join(", ")})`)
  }
  for (const go of todo) go()
  return sum
}

// ---- инструмент crew_step_note

export type NoteInput = { n?: number; project?: string; reason?: string; minutes?: number; done?: boolean; decide?: string; who?: string; hold?: string; release?: boolean }
export type NoteDeps = { dir?: string; cfg(t: Task): StepConfig; task(project: string, n: number): Task | undefined; tasks(): Task[]; taskNote?(t: Task, text: string): void }
const refuse = (text: string) => ({ ok: false as const, text })
const NEED_WHO = "who — слово владельца с датой и источником («владелец, 2026-10-24, чат оркестратора, «…»»): без него решение не записывается"

/** Ответ держателя на письмо срока (reason + minutes, или done), решение владельца (decide + who, пишет автор) и метка HOLD/STOP (hold + who, release). */
export function noteStep(input: NoteInput, me: { session: string; project?: string }, d: NoteDeps, now: number): { ok: boolean; text: string } {
  const dir = d.dir ?? WATCH_DIR
  let t: Task | undefined
  if (input.n !== undefined) {
    t = d.task(input.project ?? me.project ?? "", Number(input.n))
    if (!t) return refuse(`Задачи ${input.n} в проекте ${input.project ?? me.project ?? "?"} нет.`)
  } else if (!input.decide && !input.hold && !input.release) {
    const mine = d.tasks().filter((x) => readRecord(x.project, x.n, dir)?.ep?.holder === me.session)
    if (mine.length > 1) return refuse(`Ждущих твоего ответа шагов несколько (${mine.map((x) => taskNo(x)).join(", ")}): укажи n.`)
    t = mine[0]
    if (!t) return refuse("Нет шага, который ждёт твоего ответа: письма о сроке шага тебе не приходили (или шаг уже сдвинулся). Укажи n, если хочешь продлить срок заранее.")
  } else return refuse("Укажи n — номер задачи.")
  const st = stepOf(t)
  const rec: Rec = readRecord(t.project, t.n, dir) ?? { project: t.project, n: t.n }
  const c = d.cfg(t)
  const no = taskNo(t)
  const isAuthor = t.author === me.session

  if (input.hold || input.release) {
    if (!isAuthor) return refuse(`Метку HOLD/STOP ставит и снимает только автор задачи ${no} (оркестратор) по слову владельца.`)
    if (!input.who?.trim()) return refuse(NEED_WHO)
    if (input.release) {
      rec.hold = undefined
      writeRecord(rec, dir)
      d.taskNote?.(t, `метка HOLD/STOP снята по слову владельца: ${input.who.trim()}`)
      return { ok: true, text: `Метка снята с задачи ${no}: сторож срока шага снова следит за ней.` }
    }
    const kind = String(input.hold).toUpperCase()
    if (kind !== "HOLD" && kind !== "STOP") return refuse('hold — "HOLD" или "STOP".')
    rec.hold = { kind, who: input.who.trim(), at: now }
    writeRecord(rec, dir)
    d.taskNote?.(t, `${kind} по слову владельца: ${input.who.trim()}; сторож срока шага молчит, пока метка не снята`)
    return { ok: true, text: `${kind} записан для задачи ${no} по слову владельца: срок шага не тревожит, пока метка не снята (crew_step_note {n: ${t.n}, release: true, who}). Метка видна в /crew и crew_doctor.` }
  }

  if (input.decide) {
    if (!isAuthor) return refuse(`Решение владельца записывает только автор задачи ${no} (оркестратор): вопрос ему и открыт.`)
    if (!input.who?.trim()) return refuse(NEED_WHO)
    const kind = String(input.decide) as OptionId
    const opt = OPTIONS(c.extendMin).find((o) => o.id === kind)
    if (!opt) return refuse('decide — "wait" (ждать ещё), "narrow" (сузить задачу), "reassign" (сменить исполнителя) или "cancel" (отказаться).')
    let ep = rec.ep
    if (!ep?.question || ep.question.decision) {
      // задача из сводного вопроса «стоят давно»: своей записи шага у неё может не быть
      if (!readSummary(t.project, dir)?.ns.includes(t.n) || !st) return refuse(`По задаче ${no} нет открытого вопроса владельцу о сроке шага.`)
      ep ??= rec.ep = { key: st.key, role: st.role, status: t.status, since: st.at, due: st.at + termMs(st.role, c), holder: holderOf(t).session, label: holderOf(t).label, round: 0, letters: [], answers: [] }
    }
    const minutes = Math.max(1, Number(input.minutes) || c.extendMin)
    const dec: Decision = { kind, label: opt.label, who: input.who.trim(), at: now, ...(kind === "wait" ? { minutes } : {}), question: ep.question?.why ?? "сводный вопрос: стоит давно" }
    ;(rec.decisions ??= []).push(dec)
    ep.question = undefined
    ep.letters = []
    ep.answers = []
    ep.repeat = undefined
    ep.round += 1
    ep.due = now + (kind === "wait" ? minutes : c.extendMin) * MIN
    writeRecord(rec, dir)
    d.taskNote?.(t, `решение владельца по сроку шага: ${opt.label}${kind === "wait" ? ` (${minutes} мин)` : ""}; ${dec.who}`)
    const next = { wait: `Срок продлён до ${hm(ep.due)}; повторов вопроса до этого времени нет.`, narrow: `Сузь задачу: напиши держателю, что убрать (crew_send), или поставь меньшую задачу. Срок на это — до ${hm(ep.due)}; если шаг не сдвинется, сторож начнёт лестницу заново.`, reassign: `Смени исполнителя: crew_task {action: "reassign", n: ${t.n}}. Срок на это — до ${hm(ep.due)}.`, cancel: `Отмени задачу: crew_task {action: "cancel", n: ${t.n}}. Срок на это — до ${hm(ep.due)}.` }[kind]
    return { ok: true, text: `Решение владельца записано: ${opt.label}. ${next}${kind === "wait" ? ` Для сознательного ожидания поставь HOLD (crew_step_note {n: ${t.n}, hold: "HOLD", who}): без него лестница начнётся заново через ${c.extendMin + c.answerMin} мин после срока.` : ""}` }
  }

  // ответ держателя
  if (!input.reason?.trim() && !input.done) return refuse(`Нечего записывать: reason — почему шаг стоит и что сделано (и minutes — на сколько продлить, не больше ${c.extendMin}), либо done: true, если шаг сделан.`)
  if (!st) return refuse(`У задачи ${no} сейчас нет шага под сторожем (${statusRu(t.status)}).`)
  const ep0 = rec.ep
  if (![t.author, t.executor, t.reviewer, ep0?.holder].includes(me.session)) return refuse(`На срок шага задачи ${no} отвечает её держатель: исполнитель, приёмщик или автор.`)
  const term = termMs(st.role, c)
  const ep: Episode = (rec.ep ??= { key: st.key, role: st.role, status: t.status, since: st.at, due: st.at + term, holder: holderOf(t).session, label: holderOf(t).label, round: 0, letters: [], answers: [] })
  const reason = input.reason?.trim()
  const answer: Answer = { at: now, by: me.session, ...(reason ? { reason } : {}), ...(input.minutes ? { minutes: Number(input.minutes) } : {}), ...(input.done ? { done: true as const } : {}) }
  if (ep.question && !ep.question.decision) {
    ep.answers.push(answer)
    writeRecord(rec, dir)
    return { ok: true, text: `Ответ записан, но по задаче ${no} уже открыт вопрос владельцу: срок продлит его решение, а не этот ответ.` }
  }
  if (reason && !input.done && ep.answers.some((a) => a.reason && norm(a.reason) === norm(reason))) {
    answer.repeat = true
    ep.answers.push(answer)
    ep.repeat = true
    writeRecord(rec, dir)
    return { ok: true, text: `Причина повторилась (${reason}): срок не продлён, плагин поднимет вопрос владельцу. Чтобы шаг сдвинулся, сделай следующее действие или назови другую причину.` }
  }
  const add = Math.min(input.minutes && Number(input.minutes) > 0 ? Number(input.minutes) : c.extendMin, c.extendMin)
  ep.answers.push(answer)
  ep.due = Math.max(ep.due, now) + add * MIN
  writeRecord(rec, dir)
  d.taskNote?.(t, input.done ? `срок шага: держатель сообщил «сдано»${reason ? ` (${reason})` : ""}; срок продлён до ${hm(ep.due)}` : `срок шага продлён до ${hm(ep.due)}: ${reason} (${me.session})`)
  return { ok: true, text: `Ответ записан: срок шага ${no} продлён на ${add} мин, до ${hm(ep.due)}. Продление одно на письмо: к тому времени сдвинь шаг (статус, запись, сдача) — иначе будет второе письмо, потом вопрос владельцу.${input.done ? " Сдай шаг штатным действием (crew_task submit или нужное)." : ""}` }
}

// ---- показ: /crew, панель, /crew-progress, crew_doctor

export type Row = { text: string; tone: "error" | "warn" | "muted" }
type View = { project?: string; dir?: string; taskOf?: (project: string, n: number) => Task | undefined }
type Live = { rec: Rec; t: Task; ep?: Episode }
const live = (now: number, o: View): Live[] => {
  const out: Live[] = []
  const of = o.taskOf ?? loadTask
  for (const rec of records(o.dir ?? WATCH_DIR, o.project)) {
    const t = of(rec.project, rec.n)
    if (!t || !isOpen(t)) continue
    const st = stepOf(t)
    if (rec.hold) out.push({ rec, t })
    else if (rec.ep && st && st.key === rec.ep.key) out.push({ rec, t, ep: rec.ep })
  }
  return out
}
const openQ = (e?: Episode) => !!e?.question && !e.question.decision
/** Открытые сводные вопросы «стоят давно» (проект: только его) с номерами задач, которые ещё открыты. */
const summaries = (o: View): { s: Summary; ns: number[] }[] => {
  const dir = o.dir ?? WATCH_DIR
  const of = o.taskOf ?? loadTask
  const out: { s: Summary; ns: number[] }[] = []
  for (const p of summaryProjects(dir)) {
    if (o.project && p !== o.project) continue
    const s = readSummary(p, dir)
    if (!s?.question || s.question.decision) continue
    const ns = s.ns.filter((n) => {
      const t = of(s.project, n)
      return !!t && isOpen(t)
    })
    if (ns.length) out.push({ s, ns })
  }
  return out
}

/** Строки /crew проекта: красная — вопрос владельцу открыт, жёлтая — срок вышел, серая — срок продлён или HOLD/STOP. */
export function stepRows(now: number, o: View = {}): Row[] {
  const rows: Row[] = []
  for (const { rec, t, ep } of live(now, o)) {
    const ref = taskRef(t, 28)
    if (rec.hold && !ep) rows.push({ tone: "muted", text: `⏸ ${ref}: ${rec.hold.kind} по слову владельца (${rec.hold.who}); срок шага не тревожит` })
    else if (ep && openQ(ep)) rows.push({ tone: "error", text: `⌛ ${ref}: срок вышел, вопрос открыт — ждёт владельца с ${hm(ep.question!.at)} (шаг стоит ${mins(ep.since, now)} мин, ${ep.label})` })
    else if (ep && now >= ep.due) rows.push({ tone: "warn", text: `⌛ ${ref}: шаг стоит ${mins(ep.since, now)} мин, срок вышел · письма ${ep.letters.length} из ${LETTERS_MAX}, ${ep.label}` })
    else if (ep) rows.push({ tone: "muted", text: `⌛ ${ref}: срок продлён до ${hm(ep.due)} (${ep.label})` })
  }
  for (const { s, ns } of summaries(o)) rows.push({ tone: "error", text: `⌛ ${s.project}: ${ns.length} задач стоят давно, вопрос открыт — ${ns.map((n) => taskNo({ n })).join(", ")}` })
  return rows
}

/** Строки боковой панели: короткие (до 32 знаков), только то, что требует внимания. */
export function stepSideRows(now: number, o: View = {}): Row[] {
  const rows: Row[] = []
  for (const { t, ep } of live(now, o)) {
    if (!ep) continue
    if (openQ(ep)) rows.push({ tone: "error", text: `⌛ ${taskNo(t)} срок вышел, вопрос` })
    else if (now >= ep.due) rows.push({ tone: "warn", text: `⌛ ${taskNo(t)} срок вышел ${mins(ep.since, now)}м` })
  }
  for (const { ns } of summaries(o)) rows.push({ tone: "error", text: `⌛ стоят давно: ${ns.length}, вопрос`.slice(0, 32) })
  return rows
}

/** Открытые задачи под меткой HOLD/STOP (панель, задача 262): метка записи сторожа + открытая задача. Вкладки такой задачи
 *  панель скрывает, а саму её показывает одной строкой блока «HOLD/STOP» и никогда — как работающую. */
export function holdsOf(o: { project?: string; dir?: string; taskOf?: (project: string, n: number) => Task | undefined } = {}): { t: Task; kind: "HOLD" | "STOP" }[] {
  const of = o.taskOf ?? loadTask
  const out: { t: Task; kind: "HOLD" | "STOP" }[] = []
  for (const rec of records(o.dir ?? WATCH_DIR, o.project)) {
    if (!rec.hold) continue
    const t = of(rec.project, rec.n)
    if (t && isOpen(t)) out.push({ t, kind: rec.hold.kind })
  }
  return out
}

/** Строки /crew-progress: текст без значка, по одной на задачу с вышедшим сроком. */
export function stepProgressLines(now: number, o: View = {}): string[] {
  return stepRows(now, o).filter((r) => r.tone !== "muted").map((r) => r.text)
}

/** Проблемы для crew_doctor: открытый вопрос владельцу о сроке шага. */
const taskProblems = (now: number, o: View): string[] =>
  live(now, o)
    .filter((x) => openQ(x.ep))
    .map(({ rec, t, ep }) => `задача ${taskRef(t)} (проект ${rec.project}): срок вышел, вопрос открыт с ${hm(ep!.question!.at)} — шаг «${STEP_WORDS[ep!.role]}» стоит ${mins(ep!.since, now)} мин (${ep!.label}); ${ep!.question!.why} Автор спрашивает владельца (question) и пишет решение: crew_step_note {n: ${t.n}, decide, who}`)

export function stepProblems(now: number, o: View = {}): string[] {
  const sums = summaries(o).map(({ s, ns }) => `проект ${s.project}: задачи ${ns.map((n) => taskNo({ n })).join(", ")} стоят давно или без окна держателя, вопрос владельцу открыт с ${hm(s.question!.at)}: ${s.question!.why}; автор спрашивает владельца (question) и пишет решение по каждой: crew_step_note {n, decide | hold, who}`)
  return [...taskProblems(now, o), ...sums]
}

/** Справка для crew_doctor: срок вышел, вопрос ещё не поднят; метки HOLD/STOP. Не проблема. */
export function stepNotes(now: number, o: View = {}): string[] {
  const out: string[] = []
  for (const { rec, t, ep } of live(now, o)) {
    if (rec.hold) out.push(`${rec.hold.kind} по слову владельца: задача ${taskRef(t)} (проект ${rec.project}), ${rec.hold.who}`)
    if (ep && !openQ(ep) && now >= ep.due) out.push(`задача ${taskRef(t)} (проект ${rec.project}): шаг стоит ${mins(ep.since, now)} мин, срок вышел; писем держателю ${ep.letters.length} из ${LETTERS_MAX}`)
  }
  return out
}
