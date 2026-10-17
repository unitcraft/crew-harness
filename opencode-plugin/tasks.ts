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
import { idsHas } from "./housekeeping.ts"
import { BASE } from "./paths.ts"

// путь — из paths.ts (модуль без зависимостей: core и tasks импортируют друг друга, а BASE ядра здесь ещё не готов)
export const TASKS = path.join(BASE, "tasks")

// starting — записана, сессия создаётся; running — в работе; submitted — сдана (отчёт), ждёт приёмщика;
// reviewing — на приёмке; rework — на доработке; accepted — принята (влита), ждёт очистки; done — принята и убрана, всё
// закрыто (в старых файлах это слово «cleaned»: читается как done, см. normTask); cancelled — отменена.
// idle (задача 058) — задача с сессиями методики между сессиями: прежняя сессия сдана интегратору, следующей ещё нет; приёмки нет.
export type TaskStatus = "starting" | "running" | "submitted" | "reviewing" | "rework" | "approval" | "accepted" | "done" | "cancelled" | "idle"
export const OPEN_STATUSES: TaskStatus[] = ["starting", "running", "submitted", "reviewing", "rework", "approval", "accepted", "idle"]
/** статусы, в которых исполнитель работает (может сдавать отчёт) */
export const WORKING_STATUSES: TaskStatus[] = ["starting", "running", "rework"]
export type TaskEvent = { at: number; by: string; status?: TaskStatus; note?: string }
/** Номер задачи в показе (задача 058): у задачи с папкой — номер папки тремя цифрами без «#» («045»), без папки — «#88», как раньше. */
export const taskNo = (t: { n: number | string; folder?: string }): string => (t.folder ? String(t.n).padStart(3, "0") : `#${t.n}`)
/** «#31 «замок вливания»» — номер задачи с названием: по одному номеру не вспомнить, о чём она (владелец, 2026-10-07); у задачи с
 *  папкой — «045 «…»» (задача 058). */
export const taskRef = (t: { n: number | string; title?: string; folder?: string }, max = 40): string => {
  const title = (t.title ?? "").replace(/[«»]/g, "").replace(/\s+/g, " ").trim()
  return title ? `${taskNo(t)} «${title.length > max ? `${title.slice(0, max - 1)}…` : title}»` : taskNo(t)
}

// СЕССИИ ЗАДАЧИ (задача 058). Сессия — один запуск агента внутри задачи: исполнитель (код «исп») или сессия методики (С1, С2, С3п,
// С4…). Своего номера задачи у неё нет: идентификатор — номер задачи, код и порядковый номер кода в задаче («045 С4-3»), в записи и
// журналах к нему добавляется номер запуска методики №n, сквозной в задаче (тот же, что в строке «запуск №n» журнала хода).
export const EXECUTOR_CODE = "исп"
/** running — работает; submitted — сдала интегратору (или работу задачи — у кода «исп»); handed — передана другой сессии; cancelled — задача отменена. */
export type SessionStatus = "running" | "submitted" | "handed" | "cancelled"
export type TaskSession = {
  code: string
  /** порядковый номер кода в задаче: С4-1, С4-2… */
  k: number
  /** номер запуска методики №n, сквозной в задаче */
  launch: number
  /** сессия OpenCode */
  session: string
  status: SessionStatus
  /** цель этой сессии (письмо: «ЦЕЛЬ СЕССИИ») */
  goal?: string
  /** место: task — дерево и ветка задачи; own — своё дерево и ветка от ветки задачи */
  place: "task" | "own"
  worktree?: string
  branch?: string
  started: number
  ended?: number
  /** отчёт сдачи */
  report?: string
}
/** «С4-3»; у исполнителя — «исп» (одна сессия на задачу, порядковый номер не нужен). */
export const sesLabel = (s: { code: string; k: number }) => (s.code === EXECUTOR_CODE ? EXECUTOR_CODE : `${s.code}-${s.k}`)
/** Сессия записи по id сессии OpenCode. */
export const sessionOf = (t: { sessions?: TaskSession[] }, id: string | undefined): TaskSession | undefined => (id ? t.sessions?.find((s) => s.session === id) : undefined)
/** Задача ведётся сессиями методики: нынешняя сессия — не «исп» (её сдача идёт интегратору, приёмка плагина — по deliver). */
export const methodSession = (t: { sessions?: TaskSession[]; executor?: string }): TaskSession | undefined => {
  const s = sessionOf(t, t.executor)
  return s && s.code !== EXECUTOR_CODE ? s : undefined
}
/** «045 С4-3» — сессия задачи; у исполнителя и приёмщика — «060 исп» / «060 прм». */
export const sessionRef = (t: { n: number | string; folder?: string }, s: { code: string; k: number }) => `${taskNo(t)} ${sesLabel(s)}`

/** Как запущена сессия при включённом наборе: этап, набор, семья, ступень, модель и откуда окно (profile — файл окон
 *  в worktree; snapshot — по снимку; general — окно из общих настроек: приёмка, задача без worktree, набор недопустим). */
export type ProfileStamp = { at: number; role: "executor" | "reviewer"; session: string; stage: string; set: string; family: string; tier: string; model: string; window: "profile" | "general" | "snapshot"; clamped_from?: string; how?: "inherited" }

/** Запись предпроверки вливания: running — начата на вершине base; green — кандидат собран и проверен на base; stale — устарела
 *  (причина в stale). lock_on — замок выдан на эту вершину; accepted_on — вершина целевой ветки, в которой принята задача. */
export type PrecheckRecord = {
  state: "running" | "green" | "stale"
  base: string
  at: number
  by: string
  /** rounds(t) + attempt на момент начала: запись прежнего круга зелёной не считается */
  round: number
  candidate?: string
  /** вершина ветки задачи в момент фиксации кандидата (задача 030): если ветка ушла дальше, кандидат устарел, когда не содержит её и не равен ей по дереву */
  branch_tip?: string
  result?: string
  green_at?: number
  lock_on?: { tip: string; at: number }
  stale?: { reason: string; at: number }
  accepted_on?: string
  /** замок отпущен службой, потому что проверенный кандидат уже в вершине главной ветки на origin (accept после этого не требует замка) */
  landed?: { tip: string; at: number }
}

export type Task = {
  project: string
  n: number
  title: string
  slug: string
  goal: string
  criteria?: string
  boundaries?: string
  open_questions?: string
  /** задание по образцу (задача 065): слова владельца дословно с датой и источником, результат и куда он попадает, связи с задачами */
  owner_words?: string
  result?: string
  links?: string
  /** дополнительные поля проекта (task_extra_fields): {id: значение}; подписи берутся из настроек в момент письма */
  extra?: Record<string, string>
  priority: Priority
  tier: Tier
  role: string
  model?: string
  /** сессия и адрес автора (интегратора) */
  author: string
  author_role: string
  /** qid отчёта: исполнитель отвечает crew_send {reply_to: qid} */
  qid: string
  status: TaskStatus
  /** spawn — сессия создана плагином; assign — задачу взяла вкладка владельца; order — заказ в другой проект (своей
   *  сессии нет: делает интегратор проекта-исполнителя своими задачами, у них parent — этот заказ); external — номер взял агент
   *  вне OpenCode (scripts/task-number.mjs, задача 058): запись только занимает номер */
  kind: "spawn" | "assign" | "order" | "external"
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
  /** worktree создал плагин, сессия исполнителя работает в нём (план 002.3) */
  worktree_ready?: boolean
  branch?: string
  /** сводка сделанного прежним исполнителем (reassign) — в письмо новому */
  handoff?: string
  /** уточнение цели при передаче (reassign {text}, задача 057): идёт в первое письмо новой сессии перед прежней целью и
   *  действует вместо неё там, где они расходятся; держится до следующего reassign с текстом */
  refinement?: { text: string; at: number; by: string }
  /** последний отчёт исполнителя */
  report?: string
  /** приёмщик (сессия) и как он выбран; qid его обязательства; прежние приёмщики */
  reviewer?: string
  review_kind?: "tab" | "spawn" | "integrator"
  review_qid?: string
  reviewers?: string[]
  /** задача-план (план 004): номер и файл плана, исходная задача, раунды перепроверки, решение владельца */
  plan?: TaskPlan
  /** задача — шаг плана: план, задача-план, шаг, файл (приёмка требует отметку «✅ СДЕЛАНО» шага в целевой ветке) */
  plan_step?: { project: string; task: number; plan: string; step: string; file: string }
  /** кругов доработки; замечания последнего круга (для письма исполнителю — и для сверки после перезапуска) */
  rework?: number
  /** возвраты «влей свежую целевую ветку» (rework {sync: true}): не доработка, в rework_max не идут (план 002.6, дефект 4) */
  syncs?: number
  /** последний возврат — синхронизация, а не доработка */
  rework_sync?: boolean
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
  /** след профилей (задача 003): по записи на каждый запуск сессии исполнителя или приёмщика при включённом наборе */
  profiles?: ProfileStamp[]
  /** модель приёмщика, выбранная набором до запуска сессии: повтор оборванного запуска даёт ту же модель */
  review_model?: string
  commit?: string
  /** предпроверка вливания (задача 005, merge_precheck): на какой вершине главной ветки приёмщик собрал и проверил кандидата */
  precheck?: PrecheckRecord
  /** влитый коммит (его ветки и worktree проверяет очистка) */
  merged_head?: string
  /** деревья, которые приёмщик сохранил как улики (cleanup {keep}): уборка их не проверяет, пока они есть (задача 005, REQ-29) */
  kept?: { path: string; at: number; by: string }[]
  /** побочные ветки и деревья задачи (задача 023; поле `extra` занято дополнительными полями проекта): track и автозапись; cleanup убирает всё, кроме деревьев kept */
  side?: SideItem[]
  /** папка задачи от корня репозитория («doc/tasks/045-runner-registry», задача 058): номер задачи — номер папки; без папки — «#N» */
  folder?: string
  /** сессии задачи (задача 058): по записи на запуск, в порядке запуска */
  sessions?: TaskSession[]
  /** подзадача: номер задачи-родителя; у родителя — номера подзадач */
  part_of?: number
  parts?: number[]
  history: TaskEvent[]
  created: number
  updated: number
}

/** запись побочной ветки или дерева задачи: branch и/или worktree, когда и кем (auto — плагин увидел сам) */
export type SideItem = { branch?: string; worktree?: string; at: number; by: string; auto?: boolean }

export const taskFile = (project: string, n: number) => path.join(TASKS, safeKey(project), `${n}.json`)
/** Старые файлы: статус «cleaned» (так звался нынешний done) читается как done — в статусе и в истории; массовой миграции нет. */
export function normTask<T extends Task | undefined>(t: T): T {
  if (!t) return t
  const old = (s: unknown) => s === "cleaned"
  if (old(t.status)) (t as Task).status = "done"
  for (const h of t.history ?? []) if (old(h.status)) h.status = "done"
  return t
}
export const loadTask = (project: string, n: number) => normTask(readJson<Task>(taskFile(project, n)))
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
  // Windows: файл задачи в этот миг переименовывает другой процесс (сервер и MCP-процесс пишут одну задачу) — EPERM;
  // короткий повтор, а не падение инструмента
  for (let i = 0; ; i++)
    try {
      renameSync(tmp, file)
      return
    } catch (e: any) {
      if (!(e?.code === "EPERM" || e?.code === "EACCES" || e?.code === "EBUSY") || i >= 20) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
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
      const t = normTask(readJson<Task>(path.join(dir, f)))
      if (t) out.push(t)
    }
  }
  return out.sort((a, b) => a.project.localeCompare(b.project) || a.n - b.n)
}

/** Новая задача: следующий свободный номер проекта, файл создаётся атомарно (флаг wx: из двух процессов, взявших один номер,
 *  проходит один, второй берёт следующий). opts.used — номера, занятые вне записей (папки задач во всех деревьях и ветках, задача
 *  058: task-numbers.ts); opts.n — ровно этот номер (папка уже есть): занят — ошибка EEXIST, следующий не берётся. */
// place — место задачи (worktree, ветка) по номеру и слагу: пишется ВМЕСТЕ с задачей, первой же записью. Раньше его
// дописывали вторым сохранением, и сервер, подхватив задачу между ними, запускал её без места (план 002.6, дефект 3).
export function createTask(fields: Omit<Task, "n" | "history" | "created" | "updated" | "executors" | "attempt" | "slug"> & { slug?: string }, place?: (n: number, slug: string) => Partial<Task>, opts: { used?: number[]; n?: number; fill?: (n: number, slug: string) => Partial<Task> } = {}): Task {
  const dir = path.join(TASKS, safeKey(fields.project))
  mkdirSync(dir, { recursive: true })
  const used = readdirSync(dir).map((f) => /^(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number)
  let n = opts.n ?? Math.max(0, ...used, ...(opts.used ?? [])) + 1
  const now = Date.now()
  for (;;) {
    const t: Task = { ...fields, slug: fields.slug ?? slugify(fields.title), n, executors: [], attempt: 1, history: [{ at: now, by: fields.author, status: fields.status, note: "поставлена" }], created: now, updated: now }
    if (opts.fill) Object.assign(t, opts.fill(n, t.slug))
    if (place) Object.assign(t, place(n, t.slug))
    try {
      writeFileSync(taskFile(fields.project, n), JSON.stringify(t, null, 1), { flag: "wx" })
      return t
    } catch (e: any) {
      if (e?.code !== "EEXIST" || opts.n !== undefined) throw e
      n++
    }
  }
}

/** Перенести старую закрытую запись с номером n в tasks/<проект>/legacy/ без изменений (задача 058, переход): номер освобождается
 *  для задачи с папкой. Повтор номера в legacy — имя «n-2.json» и далее. Возвращает путь переноса. */
export function moveToLegacy(project: string, n: number): string {
  const dir = path.join(TASKS, safeKey(project), "legacy")
  mkdirSync(dir, { recursive: true })
  let dest = path.join(dir, `${n}.json`)
  for (let k = 2; existsSync(dest); k++) dest = path.join(dir, `${n}-${k}.json`)
  renameSync(taskFile(project, n), dest)
  changed = true
  return dest
}
/** Старые записи, перенесённые в legacy/ (задача 058): видны в crew_task list all. */
export function listLegacy(project: string): Task[] {
  const dir = path.join(TASKS, safeKey(project), "legacy")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^\d+(-\d+)?\.json$/.test(f))
    .map((f) => normTask(readJson<Task>(path.join(dir, f))))
    .filter((t): t is Task => !!t)
    .sort((a, b) => a.n - b.n)
}

/** Раунд перепроверки плана: вердикт проверяющего по градациям замечаний. */
export type PlanRound = { reviewer: string; at: number; counts?: Record<string, number>; line?: string; blocking?: number; significant?: number; cosmetic?: number; notes: string }
export type TaskPlan = {
  /** номер плана («12», подплан «12.1») */
  n: string
  /** путь файла плана от корня репозитория */
  file: string
  /** исходная задача — против неё перепроверка проверяет план */
  source: string
  parent?: string
  rounds: PlanRound[]
  /** раундов подряд только с косметическими замечаниями */
  clean: number
  /** раундов не хватило (plan_rounds_max): владелец решает по последним замечаниям */
  stuck?: boolean
  /** решение владельца из окна (/plans) */
  approval?: { decision: "ok" | "ok-shortcuts" | "no"; text?: string; at: number }
  /** когда владельцу последний раз напомнили о согласовании */
  notifiedAt?: number
  /** шаг плана → номер задачи (поставленные плагином после вливания плана) */
  spawned?: Record<string, number>
  /** все шаги закрыты, автору написано */
  finished?: boolean
  /** plan_steps: manual — список шагов автору отправлен */
  listed?: boolean
  /** шагов в плане (по файлу в целевой ветке) */
  total?: number
}

/** Сколько раз задачу возвращали исполнителю (доработки и синхронизации): номер круга в id писем. */
export const rounds = (t: Task) => (t.rework ?? 0) + (t.syncs ?? 0)

/** Принятые и не очищенные задачи из списка: они ждут уборки (при accepted_slot: free, по умолчанию, место в inflight_limit не занимают). */
export const waitingCleanup = (tasks: Task[]): Task[] => tasks.filter((t) => t.status === "accepted")
/** Открытые задачи, которые идут в счёт inflight_limit. Принимает уже отобранные открытые задачи проекта; slot "hold" — все
 *  (как всегда), "free" — без принятых, ждущих уборки. Одна функция на два места: crew_spawn и шаги авто-плана. */
export const countedOpen = (open: Task[], slot: "hold" | "free"): Task[] => (slot === "free" ? open.filter((t) => !waitingCleanup([t]).length) : open)

/** Когда задачу приняли (последняя запись «accepted» журнала). */
export const acceptedAt = (t: Task) => [...(t.history ?? [])].reverse().find((h) => h.status === "accepted")?.at ?? t.updated
// ПРИНЯТА, НО НЕ ОЧИЩЕНА (задача 043, M18a): напоминание повторяется каждые accepted_reminder_min, не больше
// ACCEPTED_REMINDERS_MAX раз на приёмку; счёт — по письмам автору (id первого — прежний, без номера). После предела — строка в /crew.
export const ACCEPTED_REMINDERS_MAX = 5
export const acceptedReminderId = (t: Task, at: number, k: number) => `stale-accepted-${safeKey(t.project)}-${t.n}-${at}${k > 1 ? `-${k}` : ""}`
/** Сколько напоминаний «принята и не очищена» уже ушло автору по этой приёмке. */
export function acceptedReminders(t: Task, at = acceptedAt(t)): number {
  let k = 0
  while (k < ACCEPTED_REMINDERS_MAX && letterExists(t.author, acceptedReminderId(t, at, k + 1))) k++
  return k
}
/** Когда ушло последнее из напоминаний «принята и не очищена» автору по этой приёмке (задача 076). Письма убрала уборка ящика (времени
 *  не узнать) — самый ранний срок последнего: приёмка + (предел - 1) интервалов accepted_reminder_min. */
export function lastAcceptedReminder(t: Task, at: number, accMin: number): number {
  let last = 0
  for (let k = 1; k <= ACCEPTED_REMINDERS_MAX; k++) last = Math.max(last, letterTime(t.author, acceptedReminderId(t, at, k)))
  return last || at + (ACCEPTED_REMINDERS_MAX - 1) * accMin * 60_000
}
/** Время письма id в ящике key (непрочитанное или доставленное); убранное уборкой — 0. */
export function letterTime(key: string, id: string): number {
  for (const d of [INBOX, READ]) {
    const l = readJson<{ time?: number }>(path.join(d, safeKey(key), `${id}.json`))
    if (l) return Number(l.time) || 0
  }
  return 0
}
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

/** Подстановка {repo} {n} {slug} {project} в шаблон имени ветки или папки ({n} задачи с папкой — три цифры, задача 058). */
export const fillName = (tpl: string, v: { repo: string; n: number | string; slug: string; project: string }) =>
  tpl.replace(/\{repo\}/g, v.repo).replace(/\{n\}/g, String(v.n)).replace(/\{slug\}/g, v.slug).replace(/\{project\}/g, v.project)

/** id письма с задачей: из проекта, номера и попытки — повтор запуска не кладёт второе письмо. */
export const taskLetterId = (t: Task) => `task-${safeKey(t.project)}-${t.n}-${t.attempt}`

/** Письмо с этим id уже лежит у адресата key (ждёт или прочитано). */
export function letterExists(key: string, id: string): boolean {
  const f = `${id}.json`
  return existsSync(path.join(INBOX, safeKey(key), f)) || existsSync(path.join(READ, safeKey(key), f)) || idsHas(path.join(READ, safeKey(key)), id) // удалённое уборкой — по списку id
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
export const byPriority = (a: Task, b: Task) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.created - b.created

const STATUS_RU: Record<TaskStatus, string> = { starting: "запускается", running: "в работе", submitted: "сдана", reviewing: "на приёмке", rework: "на доработке", approval: "на согласовании у владельца", accepted: "принята", done: "готова", cancelled: "отменена", idle: "ждёт следующей сессии" }
export const statusRu = (s: TaskStatus) => STATUS_RU[s] ?? s
