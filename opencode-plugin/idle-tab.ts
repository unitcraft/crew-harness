// ПРОСТОЙ ВКЛАДКИ МЕЖДУ СЕССИЯМИ (задача 063; владелец, 2026-10-16: «что-то застряло?», «по рекомендации»). Интегратор стоял почти два
// часа в «ждёт своих задач: 022 на приёмке; 061 между сессиями»: следующая сессия не запущена, вопроса владельцу нет, приёмщик 022 ждал его
// указаний. Признак 062 (ворота без вопроса) ловит только запись «ворота». Здесь — правило над задачами вкладки: задача СТОИТ, если она
// между сессиями (статус idle, задача 058) или её исполнитель или приёмщик ждёт указаний автора («застряла» перед ним или вопрос в конце
// хода — состояние question). Вкладка простаивает, если стоящая задача есть и при этом ни одна её задача не идёт либо какая-то сессия ждёт её.
// Остальные условия (состояние «ждёт своих задач», вкладка открыта, порог) и письмо — в проходе сводок (index.ts). Эпизод с отправленным
// письмом хранится файлом idle-tabs/<сессия>.json: { session, since, letter } — пустой ход в ответ на письмо не начинает новый эпизод.
//
// ТО ЖЕ ПРАВИЛО ПО СТАТУСУ ЗАДАЧИ (задача 070; владелец, 2026-10-17: «никто не работает?», «Простой по статусу «в работе» без живой сессии —
// завести задачу? - ДА»). Статус «идёт» (starting, running, rework) ещё не значит, что кто-то работает: у задачи нет исполнителя, его сессии
// нет, или он молчит дольше порога и ничего не ждёт. Такая задача СТОИТ, и в отличие от «между сессиями» её не оправдывает другая идущая
// задача автора: мёртвую задачу чужая работа не оживит. Заказ в другой проект (kind order) исполнителя не имеет по построению; он идёт, пока
// его взяли (child) или адресат работает, и стоит, когда его никто не взял дольше порога, — отдельной причиной.
//
// ТО ЖЕ ПРАВИЛО ДЛЯ ПРИНЯТОЙ, НО НЕ ОЧИЩЕННОЙ ЗАДАЧИ (задача 076; владелец, 2026-10-17: «6 — по рекомендации»). Статус accepted «идёт», пока
// приёмщик убирает, и плагин напоминает об уборке каждые accepted_reminder_min, не больше ACCEPTED_REMINDERS_MAX раз (задача 043). После
// последнего письма плагин молчал, а автор не простаивал: на Нове задача #91 девять часов ждала плана уборки, приёмщик ждал наблюдением.
// Теперь принятая задача СТОИТ, когда все напоминания ушли, приёмщик уборку не ведёт и с последнего из писем, его молчания и последнего
// изменения задачи прошло idle_tab_minutes. Уборку ведёт приёмщик, у которого идёт ход, открыт вопрос (владельцу или с expect_reply) или
// только что начато наблюдение (его started моложе порога); наблюдение старше порога без хода и изменений задачи — не ведение.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { INBOX, obligationsOf, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"
import { type Task, ACCEPTED_REMINDERS_MAX, EXECUTOR_CODE, acceptedAt, sesLabel, sessionOf, taskNo, taskRef } from "./tasks.ts"

export const IDLE_DIR = path.join(BASE, "idle-tabs")
/** Эпизод старше этого забывается (вкладка давно закрыта или служба не видела, что эпизод кончился). */
export const IDLE_TTL_MS = 12 * 3_600_000
/** Значок простаивающей вкладки (рядом с MARK, WAIT_MARK, GATE_MARK; задачи 055, 056, 062): «◷» — простой по часам, одна колонка. */
export const IDLE_MARK = "◷"

export type IdleEpisode = { session: string; since: number; letter: number }
/** Стоящая задача: between — между сессиями; waits — её сессия (who: «исп», «прм», «С4-2») ждёт указаний автора; nosession — идёт по статусу,
 *  а исполнителя нет (lost — id записан, но живой сессии нет); silent — исполнитель молчит с at; order — заказ в проект to не взят (window —
 *  интегратор адресата в окне, но не взял); cleanup — принята, все напоминания об уборке ушли, а приёмщик её не ведёт (acc — когда приняли). */
export type IdleItem = { kind: "between" | "waits" | "nosession" | "silent" | "order" | "cleanup"; task: Task; who?: string; at?: number; lost?: true; to?: string; window?: boolean; acc?: number }
/** Что известно об уборке принятой задачи (задача 076): sent — сколько напоминаний ушло автору, lastAt — когда ушло последнее, idleSince — с
 *  какого времени приёмщик её не ведёт (0 — приёмщика или живой сессии нет; нет значения — ведёт: ход идёт, вопрос, свежее наблюдение). */
export type CleanupFact = { sent: number; lastAt: number; idleSince?: number }
/** Что известно о сессии исполнителя: live — плагин её знает (есть сводка); silentSince — с какого времени у неё нет хода и она ничего не ждёт
 *  (нет — работает или ждёт законно: ход идёт, наблюдение, вопрос владельцу, свой вопрос). */
export type SessionFact = { live: boolean; silentSince?: number }
/** Данные для правила по статусу задачи (задача 070): now и порог, факт о сессии, интегратор проекта-адресата заказа. */
export type RunCtx = { now: number; minMs: number; session: (sid: string) => SessionFact; addressee: (project: string) => { window: boolean; working: boolean }; cleanup?: (t: Task) => CleanupFact }

const fileOf = (session: string, dir: string) => path.join(dir, `${safeKey(session)}.json`)

/** Эпизод с письмом (undefined — нет или старше IDLE_TTL_MS). */
export function idleOf(session: string, dir = IDLE_DIR, now = Date.now()): IdleEpisode | undefined {
  const e = readJson<IdleEpisode>(fileOf(session, dir))
  if (!e || typeof e.since !== "number") return undefined
  if (now - e.since > IDLE_TTL_MS) {
    rmSync(fileOf(session, dir), { force: true })
    return undefined
  }
  return e
}

/** Письмо эпизода ушло: эпизод держится с этим началом, пока его не кончит работа, вопрос, запуск сессии или слово владельца. */
export function holdIdle(session: string, since: number, letter: number, dir = IDLE_DIR) {
  mkdirSync(dir, { recursive: true })
  const file = fileOf(session, dir)
  writeFileSync(`${file}.tmp`, JSON.stringify({ session, since, letter }, null, 1))
  renameSync(`${file}.tmp`, file)
}

export function clearIdle(session: string, dir = IDLE_DIR) {
  if (existsSync(fileOf(session, dir))) rmSync(fileOf(session, dir), { force: true })
}

/** С какого времени сессия sid ждёт указаний вкладки me (undefined — не ждёт): «застряла» перед me (задача 043) или состояние question
 *  (ход кончился вопросом или фразой ожидания; nudge пересылает такой вопрос автору). saved — состояния прошлого прохода (status/). */
export function waitsOn(sid: string | undefined, me: string, saved: Map<string, { state: string; since?: number }>): number | undefined {
  if (!sid || sid === me) return undefined
  const o = obligationsOf(sid).find((x) => x.stuck && x.from_session === me)
  if (o) return o.stuckAt ?? 1
  const s = saved.get(sid)
  return s?.state === "question" ? (s.since ?? 1) : undefined
}

/** Время самого свежего письма в ящике сессии, которое ещё не прочитано (доставка идёт): 0 — писем нет. */
export function newestWaiting(sid: string): number {
  const dir = path.join(INBOX, safeKey(sid))
  if (!existsSync(dir)) return 0
  let at = 0
  for (const f of readdirSync(dir)) if (f.endsWith(".json")) at = Math.max(at, Number(readJson<{ time?: number }>(path.join(dir, f))?.time) || 0)
  return at
}

/** Статусы, в которых исполнитель должен работать: задача может стоять, и тогда это видно по его сессии (задача 070). */
const WORKING = ["starting", "running", "rework"]

/** Задача в рабочем статусе стоит? Нет — идёт (исполнитель работает или ждёт законно, заказ взят или адресат работает, срок ещё не вышел). */
function standing(t: Task, run: RunCtx): IdleItem | undefined {
  const aged = (at: number) => run.now - at >= run.minMs
  if (t.kind === "external") return undefined
  if (t.kind === "order") {
    if (t.child || !t.order_to) return undefined // взят: ход ведёт задача проекта-исполнителя, судит её автор
    const a = run.addressee(t.order_to)
    if (a.working || !aged(t.updated ?? 0)) return undefined
    return { kind: "order", task: t, to: t.order_to, window: a.window, at: t.updated }
  }
  if (!t.executor) return aged(t.updated ?? 0) ? { kind: "nosession", task: t, at: t.updated } : undefined
  const f = run.session(t.executor)
  if (!f.live) return aged(t.updated ?? 0) ? { kind: "nosession", task: t, lost: true, at: t.updated } : undefined
  if (f.silentSince === undefined) return undefined
  const at = Math.max(f.silentSince, t.updated ?? 0)
  return aged(at) ? { kind: "silent", task: t, at } : undefined
}

/** Принятая задача стоит? Да — все напоминания ушли, приёмщик уборку не ведёт, и с последнего письма, его молчания и изменения задачи прошёл
 *  порог (стоит с самого позднего из трёх). Иначе идёт; без фактов об уборке (cleanup не задан) — прежнее правило, идёт. */
function uncleaned(t: Task, run: RunCtx): IdleItem | undefined {
  const f = run.cleanup?.(t)
  if (!f || f.sent < ACCEPTED_REMINDERS_MAX || f.idleSince === undefined) return undefined
  const at = Math.max(f.lastAt, f.idleSince, t.updated ?? 0)
  return run.now - at >= run.minMs ? { kind: "cleanup", task: t, at, acc: acceptedAt(t) } : undefined
}

/** Открытые статусы, в которых задача идёт без автора: исполнитель работает (starting, running, rework), приёмщика назначает плагин и
 *  поднимает сторож потока (submitted), приёмщик ведёт приёмку и уборку (reviewing, accepted), план ждёт владельца (approval). */
const GOING = ["starting", "running", "rework", "submitted", "reviewing", "accepted", "approval"]

/** Правило простоя над открытыми задачами вкладки me (автор). idle — есть стоящая задача и (ни одна не идёт или какая-то сессия ждёт me);
 *  at — с какого времени стоят (последнее изменение стоящих задач или начало ожидания их сессий). */
export function idleBlockers(me: string, tasks: Task[], waits: (sid: string | undefined) => number | undefined, run?: RunCtx): { idle: boolean; at: number; items: IdleItem[] } {
  const items: IdleItem[] = []
  let going = false
  for (const t of tasks) {
    const who = (sid: string | undefined): string | undefined => {
      if (!sid) return undefined
      if (sid === t.reviewer) return "прм"
      const s = sessionOf(t, sid)
      return s && s.code !== EXECUTOR_CODE ? sesLabel(s) : "исп"
    }
    const sid = [t.executor, t.reviewer].find((x) => waits(x) !== undefined)
    if (sid) items.push({ kind: "waits", task: t, who: who(sid), at: waits(sid) })
    else if (t.status === "idle") items.push({ kind: "between", task: t })
    else if (GOING.includes(t.status)) {
      const dead = !run ? undefined : WORKING.includes(t.status) ? standing(t, run) : t.status === "accepted" ? uncleaned(t, run) : undefined
      if (dead) items.push(dead)
      else going = true
    }
  }
  // «между сессиями» оправдывает идущая задача (вкладка может ждать её итога); ждущую сессию и мёртвую задачу — нет
  const idle = items.length > 0 && (!going || items.some((x) => x.kind !== "between"))
  const at = Math.max(0, ...items.map((x) => Math.max(x.task.updated ?? 0, x.at ?? 0)))
  return { idle, at, items }
}

const hm = (t?: number) => (t ? new Date(t).toTimeString().slice(0, 5) : "?")

/** Что стоит — для владельца (/crew, панель): «061 между сессиями», «022 прм ждёт указаний», «096 заказ не взят: …», «092 исполнитель молчит с 10:24». */
export const idleWhat = (items: IdleItem[]): string[] =>
  items.map((x) => {
    const no = taskNo(x.task)
    if (x.kind === "between") return `${no} между сессиями`
    if (x.kind === "nosession") return x.lost ? `${no} сессии исполнителя нет` : `${no} без исполнителя`
    if (x.kind === "silent") return `${no} исполнитель молчит с ${hm(x.at)}`
    if (x.kind === "order") return `${no} заказ не взят: ${x.to}.integrator ${x.window ? "в окне, но не взял" : "вне окна"}`
    if (x.kind === "cleanup") return `${no} принята, уборка ждёт приёмщика с ${hm(x.acc)}`
    return `${no} ${x.who ?? "исп"} ждёт указаний`
  })

/** Письмо вкладке, раз на эпизод. */
export function idleLetter(minutes: number, items: IdleItem[]): string {
  const one = (x: IdleItem) => {
    if (x.kind === "between") return `у задачи ${taskRef(x.task)} нет идущей сессии`
    if (x.kind === "nosession") return x.lost ? `у задачи ${taskRef(x.task)} нет живой сессии исполнителя` : `у задачи ${taskRef(x.task)} нет исполнителя`
    if (x.kind === "silent") return `исполнитель задачи ${taskRef(x.task)} молчит с ${hm(x.at)}: хода нет, наблюдения и вопроса нет`
    if (x.kind === "order") return `заказ ${taskRef(x.task)} никто не взял: интегратор ${x.to}.integrator ${x.window ? "в окне, но заказ не взял" : "вне окна, письмо ждёт"}`
    if (x.kind === "cleanup") return `задача ${taskRef(x.task)} принята в ${hm(x.acc)}, все ${ACCEPTED_REMINDERS_MAX} напоминаний об уборке ушли, а приёмщик её не ведёт: хода, вопроса и свежего наблюдения нет`
    return `сессия ${taskNo(x.task)} ${x.who ?? "исп"} (${taskRef(x.task).slice(taskNo(x.task).length + 1)}) ждёт твоих указаний`
  }
  const what = items.map(one).join("; ")
  const dead = items.some((x) => x.kind === "nosession" || x.kind === "silent")
  const order = items.some((x) => x.kind === "order")
  const clean = items.find((x) => x.kind === "cleanup")
  return (
    `Ты простаиваешь ${Math.max(1, Math.round(minutes))} мин: ${what} — и нет вопроса владельцу. ` +
    `Сделай следующий шаг цикла (запусти сессию, ответь ждущей сессии) или задай вопрос владельцу инструментом question — вопрос, рекомендация, довод. ` +
    (dead ? `Задачу без исполнителя или с молчащим исполнителем передай (crew_task reassign), напиши исполнителю (crew_send) или отмени (crew_task cancel). ` : "") +
    (order ? `Заказ, который адресат не взял, — спроси владельца, откроет ли он окно адресата, или отмени заказ (crew_task cancel). ` : "") +
    (clean ? `Принятую задачу ${taskNo(clean.task)} убери сам или добейся уборки: напиши приёмщику, что мешает (crew_send), либо убери дерево и ветки и вызови crew_task {action: "cleanup", n: ${clean.task.n}} — отказ назовёт, что осталось. ` : "") +
    `Ждёшь законно — открой crew_watch или вопрос с expect_reply.`
  )
}
