// ПРОСТОЙ ВКЛАДКИ МЕЖДУ СЕССИЯМИ (задача 063; владелец, 2026-10-16: «что-то застряло?», «по рекомендации»). Интегратор стоял почти два
// часа в «ждёт своих задач: #22 на приёмке; 061 между сессиями»: следующая сессия не запущена, вопроса владельцу нет, приёмщик #22 ждал его
// указаний. Признак 062 (ворота без вопроса) ловит только запись «ворота». Здесь — правило над задачами вкладки: задача СТОИТ, если она
// между сессиями (статус idle, задача 058) или её исполнитель или приёмщик ждёт указаний автора («застряла» перед ним или вопрос в конце
// хода — состояние question). Вкладка простаивает, если стоящая задача есть и при этом ни одна её задача не идёт либо какая-то сессия ждёт её.
// Остальные условия (состояние «ждёт своих задач», вкладка открыта, порог) и письмо — в проходе сводок (index.ts). Эпизод с отправленным
// письмом хранится файлом idle-tabs/<сессия>.json: { session, since, letter } — пустой ход в ответ на письмо не начинает новый эпизод.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { obligationsOf, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"
import { type Task, EXECUTOR_CODE, sesLabel, sessionOf, taskNo, taskRef } from "./tasks.ts"

export const IDLE_DIR = path.join(BASE, "idle-tabs")
/** Эпизод старше этого забывается (вкладка давно закрыта или служба не видела, что эпизод кончился). */
export const IDLE_TTL_MS = 12 * 3_600_000
/** Значок простаивающей вкладки (рядом с MARK, WAIT_MARK, GATE_MARK; задачи 055, 056, 062): «◷» — простой по часам, одна колонка. */
export const IDLE_MARK = "◷"

export type IdleEpisode = { session: string; since: number; letter: number }
/** Стоящая задача: between — между сессиями; waits — её сессия (who: «исп», «прм», «С4-2») ждёт указаний автора. */
export type IdleItem = { kind: "between" | "waits"; task: Task; who?: string; at?: number }

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

/** Открытые статусы, в которых задача идёт без автора: исполнитель работает (starting, running, rework), приёмщика назначает плагин и
 *  поднимает сторож потока (submitted), приёмщик ведёт приёмку и уборку (reviewing, accepted), план ждёт владельца (approval). */
const GOING = ["starting", "running", "rework", "submitted", "reviewing", "accepted", "approval"]

/** Правило простоя над открытыми задачами вкладки me (автор). idle — есть стоящая задача и (ни одна не идёт или какая-то сессия ждёт me);
 *  at — с какого времени стоят (последнее изменение стоящих задач или начало ожидания их сессий). */
export function idleBlockers(me: string, tasks: Task[], waits: (sid: string | undefined) => number | undefined): { idle: boolean; at: number; items: IdleItem[] } {
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
    else if (GOING.includes(t.status)) going = true
  }
  const idle = items.length > 0 && (!going || items.some((x) => x.kind === "waits"))
  const at = Math.max(0, ...items.map((x) => Math.max(x.task.updated ?? 0, x.at ?? 0)))
  return { idle, at, items }
}

/** Что стоит — для владельца (/crew, панель): «061 между сессиями», «#22 прм ждёт указаний». */
export const idleWhat = (items: IdleItem[]): string[] => items.map((x) => (x.kind === "between" ? `${taskNo(x.task)} между сессиями` : `${taskNo(x.task)} ${x.who ?? "исп"} ждёт указаний`))

/** Письмо вкладке, раз на эпизод. */
export function idleLetter(minutes: number, items: IdleItem[]): string {
  const what = items
    .map((x) => (x.kind === "between" ? `у задачи ${taskRef(x.task)} нет идущей сессии` : `сессия ${taskNo(x.task)} ${x.who ?? "исп"} (${taskRef(x.task).slice(taskNo(x.task).length + 1)}) ждёт твоих указаний`))
    .join("; ")
  return (
    `Ты простаиваешь ${Math.max(1, Math.round(minutes))} мин: ${what} — и нет вопроса владельцу. ` +
    `Сделай следующий шаг цикла (запусти сессию, ответь ждущей сессии) или задай вопрос владельцу инструментом question — вопрос, рекомендация, довод. ` +
    `Ждёшь законно — открой crew_watch или вопрос с expect_reply.`
  )
}
