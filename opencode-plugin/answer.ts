// РЕШЕНИЕ О ВОПРОСАХ СЕССИЙ ПО НАСТРОЙКЕ ПРОЕКТА (задача 007, ADR-0010). Здесь ввод-вывод и решение: журнал ответов
// (answers/ в ящике плагина), предел ответов подряд, отзыв словом владельца, письма автоответа и остатка, событие задачи,
// общая идемпотентная функция answerTurn. Чистая логика разбора и слов ворот — answer-parse.ts. Вызывают nudge и syncStatus
// (index.ts); режимы выключены — answerTurn возвращает { handled: false } до разбора, прежние пути работают как были.
//
// Закрыто по умолчанию: любой сбой, сомнение и неготовность — вопрос остаётся владельцу, ошибка идёт в журнал службы.
import { linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { type Card, type CrewConfig, type TurnEnd, PLUGIN_SENDER, letterExistsFor, log, obligationsOf, postLetter, safeKey, sessionLabel } from "./core.ts"
import { loadTask, taskEvent, taskRef } from "./tasks.ts"
import { BASE } from "./paths.ts"
import { type Block, type ClassifyCtx, answerModesOn, classify, parseTurn } from "./answer-parse.ts"

export const ANSWERS = path.join(BASE, "answers")
/** Записи журнала хранятся не меньше 30 суток; читатель пропускает более старые, чистка — не в этой задаче. */
export const KEEP_MS = 30 * 24 * 3_600_000
const DAY_MS = 24 * 3_600_000
const MARK_EVERY_MS = 60_000

export type RestItem = { n: number; head: string; reason: string }
export type AnswerState = "дан" | "владелец вмешался" | "остаток: ждёт слова владельца" | "снято: владелец написал"
export type AnswerRecord = {
  id: string
  /** a — ответ на вопрос; r — пометка остатка хода (в счёт предела не идёт) */
  kind: "a" | "r"
  session: string
  project?: string
  /** номер задачи сессии, если есть */
  task?: number
  /** номер вопроса «В-NN»; 0 — без номера (и у пометки остатка) */
  qn: number
  /** время конца хода, на который отвечено */
  end: number
  type?: string
  mode?: string
  who?: string
  /** вопрос, до 300 знаков */
  question: string
  /** текст ответа, до 1000 знаков */
  answer: string
  state: AnswerState
  askedAt: number
  answeredAt: number
  remindedAt?: number
  letterPostedAt?: number
  intervenedAt?: number
  rest?: RestItem[]
}

const recId = (kind: "a" | "r", session: string, end: number, qn: number) => `${kind}-${safeKey(session)}-${end}-${qn}`
const recFile = (id: string) => path.join(ANSWERS, `${id}.json`)

// ЖУРНАЛ ------------------------------------------------------------------------------------------------------------

/**
 * Создать запись «если нет»: временный файл рядом становится видимым жёсткой ссылкой — второй процесс получает EEXIST и запись
 * соседа не трогает. Файловая система без жёстких ссылок — запасной путь: создание с флагом wx. true — запись создана этим вызовом.
 */
export function createRecord(rec: AnswerRecord, link: (from: string, to: string) => void = linkSync): boolean {
  mkdirSync(ANSWERS, { recursive: true })
  const final = recFile(rec.id)
  const tmp = path.join(ANSWERS, `.${rec.id}.${process.pid}.${Date.now()}.tmp`)
  writeFileSync(tmp, JSON.stringify(rec, null, 1))
  try {
    try {
      /* GATE:once-link< */ link(tmp, final) /* GATE:once-link> */
      return true
    } catch (e: any) {
      if (e?.code === "EEXIST") return false
      if (e?.code === "EPERM" || e?.code === "ENOSYS" || e?.code === "ENOTSUP" || e?.code === "EXDEV") {
        try {
          writeFileSync(final, readFileSync(tmp), { flag: "wx" })
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

/** Обновить поля записи: чтение, временный файл, переименование (повтор при EPERM/EBUSY, как в tasks.ts). */
export function updateRecord(id: string, patch: Partial<AnswerRecord>): AnswerRecord | undefined {
  const file = recFile(id)
  let cur: AnswerRecord
  try {
    cur = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
  const next = { ...cur, ...patch }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 1))
  for (let i = 0; ; i++)
    try {
      renameSync(tmp, file)
      return next
    } catch (e: any) {
      if (!(e?.code === "EPERM" || e?.code === "EACCES" || e?.code === "EBUSY") || i >= 20) {
        rmSync(tmp, { force: true })
        throw e
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
}

/** Конец хода из имени файла записи `<вид>-<сессия>-<конец хода>-<номер>.json`; 0 — имя не по форме. */
const endOfName = (f: string): number => Number(/^[ar]-.+-(\d{10,})-\d+\.json$/.exec(f)?.[1] ?? 0)

/** Одна запись по id (без чтения остального каталога). */
export function readRecord(id: string): AnswerRecord | undefined {
  try {
    return JSON.parse(readFileSync(recFile(id), "utf8"))
  } catch {
    return undefined
  }
}

let purgedAt = 0
/**
 * Чистка журнала: записи старше срока хранения (30 суток, REQ-15) удаляются; не чаще раза в 10 минут на процесс. Срок берётся
 * из конца хода в имени файла, файлы не открываются. Возвращает число удалённых.
 */
export function purgeOld(now = Date.now(), every = 10 * 60_000): number {
  if (now - purgedAt < every) return 0
  purgedAt = now
  let n = 0
  try {
    for (const f of readdirSync(ANSWERS)) {
      if (!f.endsWith(".json") || f.startsWith(".")) continue
      const at = endOfName(f)
      if (at && now - at > KEEP_MS) {
        rmSync(path.join(ANSWERS, f), { force: true })
        n++
      }
    }
  } catch {}
  return n
}

/**
 * Записи журнала (старше 30 суток пропускаются). session — только записи этой сессии: повреждённый файл её записей бросает
 * исключение (вопрос идёт владельцу, REQ-11); повреждённый файл чужой сессии только пишется в журнал службы.
 */
export function readRecords(session?: string, now = Date.now()): AnswerRecord[] {
  let names: string[]
  try {
    names = readdirSync(ANSWERS)
  } catch {
    return []
  }
  const key = session ? safeKey(session) : ""
  const out: AnswerRecord[] = []
  for (const f of names) {
    if (!f.endsWith(".json") || f.startsWith(".")) continue
    // отбор по имени файла до чтения: файл другой сессии и файл старше срока не открываются (журнал растёт, проход не должен)
    if (key && !f.startsWith(`a-${key}-`) && !f.startsWith(`r-${key}-`)) continue
    const at = endOfName(f)
    if (at && now - at > KEEP_MS) continue
    const mine = !!key
    let rec: AnswerRecord
    try {
      rec = JSON.parse(readFileSync(path.join(ANSWERS, f), "utf8"))
      if (!rec || typeof rec !== "object" || (rec.kind !== "a" && rec.kind !== "r") || typeof rec.session !== "string") throw new Error("not a record")
    } catch (e) {
      if (mine && session) throw new Error(`answers/${f}: ${e}`)
      log(`answers/${f}: unreadable record skipped: ${e}`)
      continue
    }
    if (session && rec.session !== session) continue
    if (now - (rec.answeredAt || rec.askedAt || 0) > KEEP_MS) continue
    out.push(rec)
  }
  return out
}

/**
 * Сколько ответов подряд получила сессия до этого хода (конец хода end): записи вида a (дан и владелец вмешался) по времени
 * ответа, считается хвост из `дан`; запись `владелец вмешался` обнуляет счёт, пометки остатка r в ряд не входят и ряд не
 * обрывают. Берутся записи только прежних ходов: решения этого же хода (и записанные ранее, и принятые в этом проходе) считает
 * сам проход, поэтому повторный проход того же хода счёт не меняет.
 */
export function seriesCount(records: AnswerRecord[], session: string, end: number): number {
  const before = /* GATE:recount-count< */ (r: AnswerRecord) => r.end < end /* GATE:recount-count> */
  const row = records
    .filter((r) => r.session === session && /* GATE:row< */ r.kind === "a" /* GATE:row> */ && before(r))
    .sort((a, b) => a.answeredAt - b.answeredAt || a.end - b.end || a.qn - b.qn)
  let n = 0
  for (let i = row.length - 1; i >= 0 && row[i].state === "дан"; i--) n++
  return n
}

// ОТЗЫВ -------------------------------------------------------------------------------------------------------------

export type Deps = {
  /** время первого слова владельца после момента (0 — не было) — core.ts ownerWordAfter */
  ownerWordAfter: (session: string, at: number) => Promise<number>
  /** время последней строки user сессии — дешёвый признак перемен в диалоге */
  lastUserAt?: (session: string) => Promise<number>
}
const marked = new Map<string, { at: number; userAt: number; idle: number }>()

/**
 * Слово владельца после автоответа помечает запись `владелец вмешался` (REQ-18); слово после конца хода с остатком снимает
 * пометку остатка. Не чаще раза в минуту на сессию и не чаще, чем
 * меняется время конца хода (idle) или время последней строки user; новая строка user снимает минутное ограничение: слово
 * владельца обнуляет счёт на ближайшем проходе. Проверяются только записи `дан` младше суток. Возвращает число помеченных.
 */
export async function markInterventions(session: string, now: number, deps: Deps, idle = 0): Promise<number> {
  const userAt = (await deps.lastUserAt?.(session)) ?? -1
  const memo = marked.get(session)
  // новая строка user проверяется сразу; иначе — только при новом конце хода и не чаще раза в минуту
  const due = !memo || memo.userAt !== userAt || (memo.idle !== idle && now - memo.at >= MARK_EVERY_MS)
  if (!due) return 0
  marked.set(session, { at: now, userAt, idle })
  let n = 0
  for (const r of readRecords(session, now)) {
    if (now - (r.answeredAt || r.askedAt) > DAY_MS) continue
    if (r.kind === "a" && r.state === "дан") {
      const at = await deps.ownerWordAfter(session, r.answeredAt)
      if (at > 0) {
        updateRecord(r.id, { state: "владелец вмешался", intervenedAt: at })
        n++
      }
    } else if (r.kind === "r" && r.state === "остаток: ждёт слова владельца") {
      // владелец написал после конца хода с остатком: пометка снимается, повтор уведомления прекращается (даже если ход уже идёт)
      const at = await deps.ownerWordAfter(session, r.end)
      if (at > 0) {
        updateRecord(r.id, { state: "снято: владелец написал", intervenedAt: at })
        n++
      }
    }
  }
  return n
}

// ПИСЬМА ------------------------------------------------------------------------------------------------------------

const GATES_TEXT = "Ворота — утверждение spec.md и plan.md, согласование плана, пуш, слияние, удаление, перезапуск или переключение службы, публикация, деньги и подписки, общие среды, отказ от требования, потолок заходов и раунды, решения по результату и сдаче — только слово владельца."
const restLine = (r: RestItem) => `- ${r.n ? `В-${String(r.n).padStart(2, "0")}` : "вопрос"} ${r.head} (${r.reason})`

/** Письмо-ответ закрытому вопросу (REQ-14); служебное: формат Letter тот же, метку ⚙ и шапку ставит formatLetters. */
export function answerLetterText(rec: AnswerRecord, rest: RestItem[]): string {
  const lines = [
    `Ответ по настройке проекта (answer_mode: recommendations, тип ${rec.type}), не слово владельца.`,
    `Вопрос ${rec.qn ? `В-${String(rec.qn).padStart(2, "0")}` : ""}: ${rec.question}`.replace("Вопрос :", "Вопрос:"),
    `Ответ — рекомендация вопроса: ${rec.answer}`,
    `${GATES_TEXT} Правило: вышел за рекомендацию — вопрос владельцу. Слово владельца в диалоге старше этого ответа.`,
  ]
  if (rest.length) lines.push("", "Вопросы, оставшиеся у владельца (умолчание по ним не принимай, работу, которая от них зависит, не продолжай, жди слов владельца):", ...rest.map(restLine))
  return lines.join("\n")
}

/** Что показать владельцу об остатке одной строкой (уведомление, /crew). */
export const restSummary = (rest: RestItem[], max = 240) => {
  const t = rest.map((r) => `${r.n ? `В-${String(r.n).padStart(2, "0")}` : "вопрос"} ${r.head} (${r.reason})`).join("; ")
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function restLetterText(card: Card, key: string, end: TurnEnd, rest: RestItem[]): string {
  const ref = card.task ?? card.review
  const what = ref ? `${card.review && !card.task ? "приёмка задачи" : "задача"} ${taskRef({ n: ref.n })}` : "вопрос"
  const tail = end.text.replace(/\r/g, "").trim().slice(-700)
  return `${what}: вкладка ${key} (сессия ${card.session}) остановилась с вопросами, которых по настройке проекта закрыть нельзя, работа стоит до ответа:\n${rest.map(restLine).join("\n")}\n\nКонец её ответа:\n${tail}\n\nОтветь ей сам: crew_send {to: "${card.session}", text: "..."}. Решить без владельца нельзя — спроси владельца (вопросом в конце своего хода).`
}

/**
 * Положить письмо; при гонке двух процессов за одно имя (общий временный файл postLetter: у проигравшего rename падает с ENOENT)
 * письмо уже лежит у победителя — это успех. Иная ошибка повторяется несколько раз с короткой паузой, затем бросается.
 */
function postLetterSafe(to: string, letter: Parameters<typeof postLetter>[1]) {
  for (let i = 0; ; i++)
    try {
      postLetter(to, letter)
      return
    } catch (e) {
      if (letterExistsFor(to, letter.id)) return
      if (i >= 5) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
}

// РЕШЕНИЕ -----------------------------------------------------------------------------------------------------------

export type AnswerInput = {
  card: Card
  /** адрес вкладки «проект.роль» для текстов писем */
  key: string
  end: TurnEnd | undefined
  cfg: CrewConfig
  now: number
  channel: "nudge" | "status"
  deps: Deps
}
export type AnswerResult = { handled: boolean; notice?: { message: string } }

const parsed = new Map<string, ReturnType<typeof parseTurn>>()
const inflight = new Map<string, Promise<AnswerResult>>()

/**
 * Решение по концу хода сессии. handled: true — режимы взяли ход на себя (пересылки вопроса и уведомления «ждёт вас» по нему нет),
 * false — путь прежний. Идемпотентна: один вопрос (сессия, конец хода, номер) получает не больше одного ответа и одного письма;
 * оборванная между шагами работа достраивается следующим проходом. Порядок: записи решений по закрываемым блокам (запись, письмо,
 * отметка о письме, событие задачи) в порядке номеров, потом одна пометка остатка. Любой сбой — вопрос владельцу.
 */
export function answerTurn(input: AnswerInput): Promise<AnswerResult> {
  if (!answerModesOn(input.cfg.answerMode) || !input.end?.text) return Promise.resolve({ handled: false })
  const key = `${input.card.session}:${input.end.at}`
  const running = inflight.get(key)
  if (running) return running
  const p = decide(input).catch((e) => {
    log(`answer: ${input.card.session} turn ${input.end?.at}: ${e instanceof Error ? e.stack ?? e.message : e}`)
    return { handled: false } as AnswerResult
  })
  inflight.set(key, p)
  p.finally(() => inflight.delete(key))
  return p
}

async function decide(input: AnswerInput): Promise<AnswerResult> {
  const { card, cfg, now, deps } = input
  const end = input.end!
  const session = card.session
  const text = end.text
  await markInterventions(session, now, deps, end.at)
  const pkey = `${session}:${end.at}:${text.length}`
  let turn = parsed.get(pkey)
  if (!turn) {
    turn = parseTurn(text)
    parsed.clear()
    parsed.set(pkey, turn)
  }
  if (turn.failed) {
    log(`answer: parse failed for ${session}: ${turn.failed}`)
    return { handled: false }
  }
  const questions = turn.blocks.filter((b) => b.question).sort((a, b) => a.qn - b.qn)
  if (!questions.length) return { handled: false }
  const restId = recId("r", session, end.at, 0)
  // слово владельца после конца хода: он ответил сам — автоответа нет, пометка остатка снимается
  if (/* GATE:owner< */ end.ownerAfter /* GATE:owner> */) {
    const old = readRecord(restId)
    if (old && old.state === "остаток: ждёт слова владельца") updateRecord(restId, { state: "снято: владелец написал" })
    return { handled: false }
  }

  purgeOld(now)
  const records = readRecords(session, now)
  const byQn = new Map(records.filter((r) => r.kind === "a" && r.end === end.at).map((r) => [r.qn, r]))
  const decisions: { block: Block; existing?: AnswerRecord; closed: boolean; reason?: string }[] = []
  let pending = 0
  for (const b of questions) {
    const existing = /* GATE:exists< */ byQn.get(b.qn) /* GATE:exists> */
    if (existing) {
      // решение уже записано: итог берётся из записи, не пересчитывается; в счёт этого прохода входит, если слова владельца после него не было
      pending = existing.state === "владелец вмешался" ? 0 : pending + 1
      decisions.push({ block: b, existing, closed: true })
      continue
    }
    const ctx: ClassifyCtx = { map: cfg.answerMode, review: !!card.review, count: seriesCount(records, session, end.at) + pending, max: cfg.answerMax }
    const v = classify(b, ctx)
    if (v.closed) pending++
    decisions.push({ block: b, closed: v.closed, ...(v.closed ? {} : { reason: v.reason }) })
  }
  const rest: RestItem[] = decisions.filter((d) => !d.closed).map((d) => ({ n: d.block.qn, head: d.block.head, reason: d.reason! }))

  const info = { project: card.project, task: card.task?.n }
  for (const d of decisions.filter((x) => x.closed)) {
    const b = d.block
    const rec: AnswerRecord = d.existing ?? {
      id: recId("a", session, end.at, b.qn),
      kind: "a",
      session,
      ...(info.project ? { project: info.project } : {}),
      ...(info.task ? { task: info.task } : {}),
      qn: b.qn,
      end: end.at,
      type: b.type,
      mode: "recommendations",
      who: "рекомендация",
      question: b.qtext,
      answer: b.recommendation.slice(0, 1000),
      state: "дан",
      askedAt: end.at,
      answeredAt: now,
    }
    // запись «если нет»: если другой процесс записал этот вопрос раньше, его запись решает, мы только достраиваем недостающее
    if (!d.existing) createRecord(rec)
    const stored = readRecord(rec.id) ?? rec
    // письмо: только если отметки нет и общая проверка письма не видит (оно могло лежать в delivering/)
    const letterId = `answer-${safeKey(session)}-${end.at}-${String(b.qn).padStart(2, "0")}`
    const exists = letterExistsFor(session, letterId)
    if (/* GATE:once-letter< */ !stored.letterPostedAt && !exists /* GATE:once-letter> */) {
      postLetterSafe(session, { id: letterId, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: session, time: now, text: answerLetterText(stored, rest.filter((r) => r.n !== b.qn)) })
      log(`answer ${stored.id}: letter ${letterId}`)
    }
    if (!stored.letterPostedAt) updateRecord(stored.id, { letterPostedAt: now })
    // событие задачи: задача загружается непосредственно перед записью, заметка с этим id уже есть — не повторять
    if (card.task) {
      const t = loadTask(card.task.project, card.task.n)
      if (t && !t.history.some((h) => h.note?.includes(stored.id))) taskEvent(t, PLUGIN_SENDER, undefined, `ответ по настройке проекта (recommendations, тип ${stored.type}), вопрос ${b.qn ? `В-${String(b.qn).padStart(2, "0")}` : "без номера"}: ${stored.answer.slice(0, 120)} [${stored.id}]`)
    }
  }

  let notice: AnswerResult["notice"]
  if (rest.length) {
    const fresh: AnswerRecord = { id: restId, kind: "r", session, ...(info.project ? { project: info.project } : {}), ...(info.task ? { task: info.task } : {}), qn: 0, end: end.at, question: restSummary(rest, 300), answer: "", state: "остаток: ждёт слова владельца", askedAt: end.at, answeredAt: now, rest }
    const created = createRecord(fresh)
    const cur = created ? fresh : (readRecord(restId) ?? fresh)
    if (card.spawned) {
      // сессия задачи или приёмки: остаток — письмо спросившим (те же, что у прежней пересылки), одно на ход
      const askers = [...new Set(obligationsOf(session).filter((o) => !o.stuck).map((o) => o.from_session))]
      const id = `answer-rest-${safeKey(session)}-${end.at}`
      for (const to of askers) {
        if (cur.letterPostedAt || letterExistsFor(to, id)) continue
        postLetterSafe(to, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to, time: now, text: restLetterText(card, input.key, end, rest) })
        log(`answer rest of ${session} forwarded to ${to}`)
      }
      if (!cur.letterPostedAt && askers.length) updateRecord(restId, { letterPostedAt: now })
    } else if (input.channel === "status" && cur.state === "остаток: ждёт слова владельца") {
      // вкладка владельца: одно уведомление с остатком, повтор по owner_reminder_min пока владелец не написал
      const every = cfg.ownerReminderMin * 60_000
      const due = !cur.remindedAt || (every > 0 && now - cur.remindedAt >= every)
      if (due) {
        updateRecord(restId, { remindedAt: now })
        notice = { message: restSummary(rest) }
      }
    }
  }
  return { handled: true, ...(notice ? { notice } : {}) }
}

// ПОКАЗ -------------------------------------------------------------------------------------------------------------
// Раздел «Автоответы» сводки /crew и строка боковой панели. Журнал читается целиком, но файлы разбираются заново только когда
// они изменились (время и размер), поэтому перерисовка панели не читает диск на каждый кадр.

const fileCache = new Map<string, { mtime: number; size: number; rec?: AnswerRecord }>()
function readAllCached(now: number): AnswerRecord[] {
  let names: string[]
  try {
    names = readdirSync(ANSWERS)
  } catch {
    return []
  }
  const out: AnswerRecord[] = []
  for (const f of names) {
    if (!f.endsWith(".json") || f.startsWith(".")) continue
    // показу нужны сутки: файл с концом хода старше суток и часа запаса не открывается и не проверяется
    const at = endOfName(f)
    if (at && now - at > DAY_MS + 3_600_000) continue
    const file = path.join(ANSWERS, f)
    let st
    try {
      st = statSync(file)
    } catch {
      continue
    }
    const hit = fileCache.get(file)
    let rec: AnswerRecord | undefined
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) rec = hit.rec
    else {
      try {
        rec = JSON.parse(readFileSync(file, "utf8"))
      } catch {
        rec = undefined
      }
      fileCache.set(file, { mtime: st.mtimeMs, size: st.size, rec })
    }
    if (rec && (rec.kind === "a" || rec.kind === "r") && now - (rec.answeredAt || rec.askedAt || 0) <= KEEP_MS) out.push(rec)
  }
  return out
}

const WIDTH = 72 // ширина строки окна /crew, как DIALOG_WIDTH в status.ts (импортировать нельзя: status.ts импортирует этот файл)
const fit72 = (line: string) => (line.length > WIDTH ? `${line.slice(0, WIDTH - 1)}…` : line)
const one = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const hmOf = (t: number) => new Date(t).toTimeString().slice(0, 5)
const refOf = (r: AnswerRecord) => (r.task ? `#${r.task}` : one(sessionLabel(r.session, r.session), 28))

/** Строки раздела «Автоответы» для /crew (REQ-17): ответы за 24 часа и вопросы, которые ждут слова владельца. Нет ни того ни другого — пусто. */
export function answerLines(project: string, now = Date.now()): string[] {
  const all = readAllCached(now).filter((r) => r.project === project)
  const day = all.filter((r) => r.kind === "a" && now - r.answeredAt <= DAY_MS).sort((a, b) => b.answeredAt - a.answeredAt)
  const waiting = all.filter((r) => r.kind === "r" && r.state === "остаток: ждёт слова владельца" && now - r.askedAt <= DAY_MS).sort((a, b) => b.askedAt - a.askedAt)
  const out: string[] = []
  if (day.length) {
    out.push(fit72(`  автоответы за 24 ч: ${day.length}, вмешался владелец: ${day.filter((r) => r.state === "владелец вмешался").length}`))
    for (const r of day.slice(0, 6)) {
      out.push(fit72(`    ${hmOf(r.answeredAt)} ${refOf(r)} · ${r.type ?? "?"} · ${r.mode ?? "?"}`))
      out.push(fit72(`      ${r.who ?? "?"} · ${r.state}: «${one(r.question, 26)}» → «${one(r.answer, 22)}»`))
    }
    if (day.length > 6) out.push(`    … и ещё ${day.length - 6}`)
  }
  for (const r of waiting.slice(0, 4)) {
    out.push(fit72(`  ждёт слова владельца: ${refOf(r)}`))
    for (const it of (r.rest ?? []).slice(0, 4)) out.push(fit72(`    ${it.n ? `В-${String(it.n).padStart(2, "0")}` : "вопрос"} ${one(it.head, 40)} (${it.reason})`))
  }
  return out
}

export type SideRowLike = { mark: string; who: string; what: string; tone: "accent" | "base" | "muted" }
/** Строка боковой панели «авто 24ч: N · вмеш. M» (REQ-17, AC-32); N = 0 — строки нет. Без проекта — по всем проектам журнала. */
export function answerSideRow(project?: string, now = Date.now()): SideRowLike | undefined {
  const day = readAllCached(now).filter((r) => r.kind === "a" && now - r.answeredAt <= DAY_MS && (!project || r.project === project))
  if (!day.length) return undefined
  return { mark: " ", who: "", what: `авто 24ч: ${day.length} · вмеш. ${day.filter((r) => r.state === "владелец вмешался").length}`, tone: "muted" }
}
