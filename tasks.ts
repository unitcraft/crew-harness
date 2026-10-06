// ЖУРНАЛ ЗАДАЧ (план 002, Ф.1). Задача — работа с номером #N (сквозной в проекте, только растёт), автором,
// исполнителем, приоритетом и статусом; файл tasks/<проект>/<N>.json в ящике. Номер берётся атомарным созданием
// файла (flag wx): из двух процессов, взявших один номер, проходит один, второй берёт следующий.
//
// ЗАПУСК ПОВТОРЯЕМ (замер 2026-10-05): session.create принимает свой id (начинается с "ses") и на повтор с тем же
// id возвращает уже созданную сессию. Поэтому id сессии пишется в журнал ДО создания (`planned`), а запуск,
// оборванный на любом шаге, повторяется с тем же id — второй сессии не будет. Письмо с задачей тоже идемпотентно:
// его id выводится из номера и попытки, и уже лежащее (в ящике или прочитанное) повторно не кладётся.

import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { INBOX, READ, type Priority, type Tier, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

// путь — из paths.ts (модуль без зависимостей: core и tasks импортируют друг друга, а BASE ядра здесь ещё не готов)
export const TASKS = path.join(BASE, "tasks")

// starting — записана, сессия создаётся; running — в работе; submitted — сдана (отчёт), ждёт приёмщика;
// reviewing — на приёмке; rework — на доработке; accepted — принята (влита), ждёт очистки; cleaned — очищена, всё
// закрыто; closed — закрыта (прежний путь «по отчёту»); cancelled — отменена.
export type TaskStatus = "starting" | "running" | "submitted" | "reviewing" | "rework" | "accepted" | "cleaned" | "closed" | "cancelled"
export const OPEN_STATUSES: TaskStatus[] = ["starting", "running", "submitted", "reviewing", "rework", "accepted"]
/** статусы, в которых исполнитель работает (может сдавать отчёт) */
export const WORKING_STATUSES: TaskStatus[] = ["starting", "running", "rework"]
export type TaskEvent = { at: number; by: string; status?: TaskStatus; note?: string }
export type Task = {
  project: string
  n: number
  title: string
  slug: string
  goal: string
  criteria?: string
  boundaries?: string
  open_questions?: string
  priority: Priority
  tier: Tier
  role: string
  model?: string
  /** сессия и адрес автора (интегратора) */
  author: string
  author_role: string
  /** qid отчёта: исполнитель отвечает peer_send {reply_to: qid} */
  qid: string
  status: TaskStatus
  /** spawn — сессия создана плагином; assign — задачу взяла вкладка владельца; order — заказ в другой проект (своей
   *  сессии нет: делает интегратор проекта-исполнителя своими задачами, у них parent — этот заказ) */
  kind: "spawn" | "assign" | "order"
  /** order: проект-исполнитель и его задача, взявшая заказ */
  order_to?: string
  child?: { project: string; n: number }
  /** задача-заказ другого проекта, которую выполняет эта задача */
  parent?: { project: string; n: number }
  /** нынешний исполнитель; для spawn — id сессии, записанный до её создания */
  executor?: string
  /** прежние исполнители (reassign) */
  executors: string[]
  /** номер попытки запуска (reassign увеличивает) — входит в id письма с задачей */
  attempt: number
  directory: string
  worktree?: string
  /** worktree создал плагин, сессия исполнителя работает в нём (план 006) */
  worktree_ready?: boolean
  branch?: string
  /** сводка сделанного прежним исполнителем (reassign) — в письмо новому */
  handoff?: string
  /** последний отчёт исполнителя */
  report?: string
  /** приёмщик (сессия) и как он выбран; qid его обязательства; прежние приёмщики */
  reviewer?: string
  review_kind?: "tab" | "spawn" | "integrator"
  review_qid?: string
  reviewers?: string[]
  /** кругов доработки; замечания последнего круга (для письма исполнителю — и для сверки после перезапуска) */
  rework?: number
  rework_note?: string
  /** адреса приёмщика и исполнителя — подписи писем, которые кладёт сверка */
  reviewer_role?: string
  executor_role?: string
  /** id письма с приёмкой (назначение приёмщика) */
  review_letter?: string
  /** отчёт приёмщика по шагам приёмки и коммит вливания */
  checks?: Record<string, string>
  /** шаги приёмки проекта на момент review (их ход видно в окне) и шаг, который приёмщик проверяет сейчас */
  steps?: { id: string; text: string; required?: boolean }[]
  checking?: { step: string; at: number }
  commit?: string
  /** влитый коммит (его ветки и worktree проверяет очистка) */
  merged_head?: string
  history: TaskEvent[]
  created: number
  updated: number
}

export const taskFile = (project: string, n: number) => path.join(TASKS, safeKey(project), `${n}.json`)
export const loadTask = (project: string, n: number) => readJson<Task>(taskFile(project, n))
export const isOpen = (t?: Task) => !!t && OPEN_STATUSES.includes(t.status)

// задача изменилась — сводка окна (status/) обновится на ближайшем проходе, а не через 15 с (шаги приёмки видно сразу)
let changed = false
export function tasksChanged(): boolean {
  const c = changed
  changed = false
  return c
}

export function saveTask(t: Task) {
  t.updated = Date.now()
  changed = true
  const file = taskFile(t.project, t.n)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(t, null, 1))
  renameSync(tmp, file)
}

/** Записать смену статуса (или заметку) в историю и сохранить. */
export function taskEvent(t: Task, by: string, status?: TaskStatus, note?: string) {
  if (status) t.status = status
  t.history.push({ at: Date.now(), by, ...(status ? { status } : {}), ...(note ? { note } : {}) })
  saveTask(t)
}

export function listTasks(project?: string): Task[] {
  const out: Task[] = []
  if (!existsSync(TASKS)) return out
  for (const p of project ? [safeKey(project)] : readdirSync(TASKS)) {
    const dir = path.join(TASKS, p)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
      const t = readJson<Task>(path.join(dir, f))
      if (t) out.push(t)
    }
  }
  return out.sort((a, b) => a.project.localeCompare(b.project) || a.n - b.n)
}

/** Новая задача: следующий свободный номер проекта, файл создаётся атомарно. */
export function createTask(fields: Omit<Task, "n" | "history" | "created" | "updated" | "executors" | "attempt" | "slug"> & { slug?: string }): Task {
  const dir = path.join(TASKS, safeKey(fields.project))
  mkdirSync(dir, { recursive: true })
  const used = readdirSync(dir).map((f) => /^(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number)
  let n = used.length ? Math.max(...used) + 1 : 1
  const now = Date.now()
  for (;;) {
    const t: Task = { ...fields, slug: fields.slug ?? slugify(fields.title), n, executors: [], attempt: 1, history: [{ at: now, by: fields.author, status: fields.status, note: "поставлена" }], created: now, updated: now }
    try {
      writeFileSync(taskFile(fields.project, n), JSON.stringify(t, null, 1), { flag: "wx" })
      return t
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e
      n++
    }
  }
}

/** Когда задачу приняли (последняя запись «accepted» журнала). */
export const acceptedAt = (t: Task) => [...(t.history ?? [])].reverse().find((h) => h.status === "accepted")?.at ?? t.updated
/** «12 мин назад», «11 ч назад» */
export const ago = (at: number, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 90 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`
}

/** id сессии задачи, выбранный заранее (OpenCode принимает свой id, если он начинается с "ses"). */
export const plannedSessionId = () => `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 30)

// Название латиницей для имён веток и папок: кириллица транслитерируется, прочее — в дефисы.
const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" }
export function slugify(title: string): string {
  const s = [...title.toLowerCase()].map((c) => TR[c] ?? c).join("")
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "task"
}

/** Подстановка {repo} {n} {slug} {project} в шаблон имени ветки или папки. */
export const fillName = (tpl: string, v: { repo: string; n: number; slug: string; project: string }) =>
  tpl.replace(/\{repo\}/g, v.repo).replace(/\{n\}/g, String(v.n)).replace(/\{slug\}/g, v.slug).replace(/\{project\}/g, v.project)

/** id письма с задачей: из проекта, номера и попытки — повтор запуска не кладёт второе письмо. */
export const taskLetterId = (t: Task) => `task-${safeKey(t.project)}-${t.n}-${t.attempt}`

/** Письмо с этим id уже лежит у адресата key (ждёт или прочитано). */
export function letterExists(key: string, id: string): boolean {
  const f = `${id}.json`
  return existsSync(path.join(INBOX, safeKey(key), f)) || existsSync(path.join(READ, safeKey(key), f))
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
export const byPriority = (a: Task, b: Task) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.created - b.created

const STATUS_RU: Record<TaskStatus, string> = { starting: "запускается", running: "в работе", submitted: "сдана", reviewing: "на приёмке", rework: "на доработке", accepted: "принята", cleaned: "очищена", closed: "закрыта", cancelled: "отменена" }
export const statusRu = (s: TaskStatus) => STATUS_RU[s] ?? s
