// ПАПКА ЗАДАЧИ И ЖУРНАЛЫ СЕССИЙ (задача 058): текст задания task/message.md и первая строка log.md новой задачи, название задачи по
// её папке, номер запуска сессии и строки запуска (progress.log копии, где работает сессия, и log.md задачи), записи log.md о сдаче
// сессии и заведении подзадачи. Формы строк — общими функциями журнала (journal.ts, задача 053). Основную копию целевой ветки модуль
// не пишет: журналы — только в дереве задачи и в дереве сессии (AGENTS.md, пп. 3 и 11).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { buildProgress, logLine, ymdhm } from "./journal.ts"
import { parseJournal } from "./progress.ts"
import { type FolderHit, pad3, tasksDirOn, repoTop } from "./task-numbers.ts"
import { type Task, type TaskSession, sesLabel, sessionRef, taskNo } from "./tasks.ts"

/** Папки задач проекта каталога dir включены: корень репозитория и каталог задач; иначе undefined. */
export function folderInfo(dir: string, cfg: { tasksDir: string; targetBranch: string }): { top: string; rel: string } | undefined {
  const rel = (cfg.tasksDir ?? "").replace(/\\/g, "/").replace(/^\.\/+|\/+$/g, "")
  if (!rel) return undefined
  const top = repoTop(dir)
  if (!top || !tasksDirOn(top, rel, cfg.targetBranch)) return undefined
  return { top, rel }
}

/** Название задачи по тексту задания: заголовок «# Задание: …», иначе имя папки без номера. */
export function titleOfMessage(folder: string, message: string | undefined): string {
  const m = message ? /^# Задание:[ \t]*(.+?)[ \t]*$/m.exec(message) : null
  return m?.[1] ?? (folder.replace(/^[0-9]+-/, "") || folder)
}

/** Текст task/message.md найденной папки: из дерева (на диске) или из ветки (git show). */
export function readFolderFile(top: string, rel: string, hit: FolderHit, file: string): string | undefined {
  if (hit.tree) {
    try {
      return readFileSync(path.join(hit.tree, ...rel.split("/"), hit.name, ...file.split("/")), "utf8")
    } catch {
      return undefined
    }
  }
  if (!hit.ref) return undefined
  try {
    return execFileSync("git", ["-C", top, "show", `${hit.ref}:${rel}/${hit.name}/${file}`], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return undefined
  }
}

/** Задание по шаблону из полей задачи (интегратор не передал текст message; вопрос В-06). */
export function templateMessage(t: Pick<Task, "title" | "goal" | "criteria" | "boundaries" | "open_questions" | "author_role">, now: Date = new Date()): string {
  return [
    `# Задание: ${t.title}`,
    "",
    `Заказчик: ${t.author_role}, ${ymdhm(now).slice(0, 10)}. Задание собрано плагином из полей crew_spawn.`,
    "",
    "## Цель",
    "",
    t.goal,
    ...(t.criteria ? ["", "## Критерии приёмки", "", t.criteria] : []),
    ...(t.boundaries ? ["", "## Границы", "", t.boundaries] : []),
    ...(t.open_questions ? ["", "## Открытые вопросы", "", t.open_questions] : []),
    "",
  ].join("\n")
}

/** Первая строка log.md новой задачи. */
export function firstLogLine(t: Pick<Task, "title">, how: string, base: string, now: Date = new Date()): string {
  return `${ymdhm(now)} документ: задание заведено плагином: «${t.title.replace(/[«»\r\n]/g, "")}»; task/message.md — ${how}; основа — ${base}\n`
}

/** Номера запусков, уже записанные в журналах папки: строки «запуск №n» progress.log и log.md. */
function launchesIn(dir: string): number[] {
  const out: number[] = []
  for (const f of ["progress.log", "log.md"]) {
    let text = ""
    try {
      text = readFileSync(path.join(dir, f), "utf8")
    } catch {
      continue
    }
    for (const m of text.matchAll(/запуск №([1-9][0-9]*)/g)) out.push(Number(m[1]))
  }
  return out
}

/** Каталог папки задачи в копии root (дерево задачи или сессии). */
export const folderIn = (root: string, t: Pick<Task, "folder">) => path.join(root, ...String(t.folder).split("/"))

/** Номер запуска новой сессии: 1 + наибольший из сессий записи и строк «запуск» журналов папки во всех копиях (дерево задачи и деревья сессий). */
export function nextLaunch(t: Task): number {
  const nums = (t.sessions ?? []).map((s) => s.launch)
  if (t.folder) {
    const roots = [t.worktree, ...(t.sessions ?? []).map((s) => s.worktree)].filter((x): x is string => !!x && existsSync(x))
    for (const r of new Set(roots)) nums.push(...launchesIn(folderIn(r, t)))
  }
  return Math.max(0, ...nums) + 1
}

/** Копия — основная копия проекта (туда плагин журналы не пишет). */
const isMain = (root: string, t: Task) => path.resolve(root).toLowerCase() === path.resolve(t.directory).toLowerCase()

/**
 * Строки запуска сессии (REQ-06): «<код> 0/0 [ГГГГ-ММ-ДД ЧЧ:ММ] запуск №n» в progress.log копии, где сессия работает, и
 * «пуск: запуск №n <код> [время] — 045 С4-3 …» в log.md задачи. Сначала запись в log.md, потом строка в progress.log (строка без
 * записи — существенная находка, методика ab2a4ef). Возвращает отказ строкой или undefined.
 */
export function writeLaunch(t: Task, s: TaskSession, sessionRoot: string, now: Date = new Date()): string | undefined {
  if (!t.folder) return undefined
  const taskRoot = t.worktree && existsSync(t.worktree) ? t.worktree : undefined
  if (!taskRoot || isMain(taskRoot, t)) return "дерева задачи нет — журналы в основной копии плагин не пишет"
  if (isMain(sessionRoot, t)) return "сессия в основной копии — журналы там плагин не пишет"
  const sdir = folderIn(sessionRoot, t)
  mkdirSync(sdir, { recursive: true })
  let prior: ReturnType<typeof parseJournal> = []
  try {
    prior = parseJournal(readFileSync(path.join(sdir, "progress.log")))
  } catch {}
  const built = buildProgress({ file: `${t.folder}/progress.log`, code: s.code, kind: "launch", launch: s.launch }, prior, now, { launcher: true, launches: launchesIn(folderIn(taskRoot, t)) })
  if (!built.ok) return built.reason
  const stamp = ymdhm(now)
  // форма записи о запуске — та, что ищет страж журнала (journal-launch): «запуск №n <код>», затем время и идентификатор сессии
  const lg = logLine({ file: `${t.folder}/log.md`, kind: "пуск", text: `запуск №${s.launch} ${s.code} [${stamp}] — ${sessionRef(t, s)} ${s.goal ? `«${s.goal.replace(/[«»\r\n]/g, " ").slice(0, 120)}»` : ""}`.trim() }, taskRoot, now, { launcher: true })
  if (!lg.ok) return lg.reason
  try {
    const file = path.join(sdir, "progress.log")
    let lead = ""
    try {
      const old = readFileSync(file)
      if (old.length && old[old.length - 1] !== 10) lead = "\n"
    } catch {}
    appendFileSync(file, lead + built.line + "\n", "utf8")
  } catch (e: any) {
    return `progress.log не записан: ${e?.code ?? e}`
  }
  return undefined
}

/** Запись в log.md задачи (в её дереве): вид и текст одной строкой. Дерева нет — отказ строкой. */
export function taskLog(t: Task, kind: string, text: string, now: Date = new Date()): string | undefined {
  if (!t.folder) return "у задачи нет папки"
  const root = t.worktree && existsSync(t.worktree) ? t.worktree : undefined
  if (!root || isMain(root, t)) return "дерева задачи нет"
  if (!existsSync(folderIn(root, t))) return "папки задачи в её дереве нет"
  const r = logLine({ file: `${t.folder}/log.md`, kind, text: text.replace(/[\r\n]+/g, " ").slice(0, 1900) }, root, now)
  return r.ok ? undefined : r.reason
}

/** «045 С4-3» сессии по id OpenCode или «045 исп». */
export const sessionTitleRef = (t: Task, s: TaskSession | undefined) => (s ? sessionRef(t, s) : `${taskNo(t)} исп`)
export { pad3, sesLabel }
