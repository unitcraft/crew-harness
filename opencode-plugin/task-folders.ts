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

// ОБРАЗЕЦ ЗАДАНИЯ (задача 065; Канон, process.md, «Задание task/message.md»): заголовок «# Задание: …», шапка, разделы по порядку;
// пустой раздел — «нет: <почему>». Те же правила судит страж check-task-docs.py (message-title, message-section, message-owner).
export const MESSAGE_SECTIONS = ["Чего хочет владелец", "Что нужно", "Критерии приёмки", "Результат и куда он попадает", "Связи", "Границы"] as const
const OWNER_SECTION = MESSAGE_SECTIONS[0]
const DATE_RE = /(?<![0-9])[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?![0-9])/
const BARE_NONE_RE = /^[ \t]*(?:[-*][ \t]+)?нет:[ \t.,;:—–-]*$/
export const OWNER_EXAMPLE = "- «сделай X» (владелец, 2026-10-17, чат оркестратора)"
const TEMPLATE_REF = "образец задания — Канон crew-harness, doc/canon/process.md, «Задание task/message.md»"

/** Цель — пунктами «Что нужно»: уже нумерованная остаётся как есть; иначе пункт — абзац или строка «- …» (строка перед списком — тоже пункт). */
export function numberedPoints(goal: string): string {
  const text = goal.replace(/\r\n?/g, "\n").trim()
  if (!text || /^[ \t]*[0-9]+[.)][ \t]+\S/m.test(text)) return text
  const items: string[][] = []
  for (const para of text.split(/\n[ \t]*\n/)) {
    let cur: string[] | undefined
    let bullet = false
    for (const raw of para.split("\n")) {
      const line = raw.trim()
      if (!line) continue
      const b = /^[-*•][ \t]+(.*)$/.exec(line)
      if (b) {
        if (cur) items.push(cur)
        cur = [b[1]]
        bullet = true
      } else if (!cur) {
        cur = [line]
        bullet = false
      } else if (bullet && /^[ \t]/.test(raw)) cur.push(line) // продолжение пункта списка с отступом
      else if (bullet) {
        items.push(cur)
        cur = [line]
        bullet = false
      } else cur.push(line)
    }
    if (cur) items.push(cur)
  }
  return items.map((lines, i) => `${i + 1}. ${lines.join("\n" + " ".repeat(String(i + 1).length + 2))}`).join("\n")
}

export type MessageFields = Pick<Task, "title" | "goal" | "criteria" | "boundaries" | "open_questions" | "author_role" | "owner_words" | "result" | "links"> & { project?: string }

/** Задание по образцу из полей задачи (интегратор не передал текст message): разделы по порядку, цель пунктами, пустой — «нет: …». */
export function templateMessage(t: MessageFields, now: Date = new Date(), opts: { target?: string; via?: string } = {}): string {
  const none = (field: string, what: string) => `нет: интегратор ${what} не назвал (поле ${field} не передано)`
  const part = (name: string, body: string | undefined, field: string, what: string) => ["", `## ${name}`, "", body?.trim() || none(field, what)]
  return [
    `# Задание: ${t.title}`,
    "",
    `Заказчик: ${t.author_role}; задание собрано плагином из полей ${opts.via ?? "crew_spawn"}.`,
    `Репозиторий: ${t.project ? `проект ${t.project}` : "проект задачи"}${opts.target ? `, ветка ${opts.target}` : ""}. Дата задания: ${ymdhm(now).slice(0, 10)}.`,
    `Источник: слова владельца с датой — раздел «${OWNER_SECTION}».`,
    ...part(OWNER_SECTION, t.owner_words, "owner_words", "слов владельца"),
    ...part("Что нужно", numberedPoints(t.goal ?? ""), "goal", "цели"),
    ...part("Критерии приёмки", t.criteria, "criteria", "критериев приёмки"),
    ...part("Результат и куда он попадает", t.result, "result", "места результата"),
    ...part("Связи", t.links, "links", "связей"),
    ...part("Границы", t.boundaries, "boundaries", "границ"),
    ...(t.open_questions?.trim() ? ["", "## Открытые вопросы", "", t.open_questions.trim()] : []),
    "",
  ].join("\n")
}

/** Нарушения образца в тексте задания (те же правила, что у стража check-task-docs.py); пустой список — по образцу. */
export function messageFaults(message: string): string[] {
  const lines = message.replace(/^﻿/, "").split("\n").map((l) => l.replace(/\r$/, ""))
  let fence = false
  const plain = lines.map((l) => {
    if (/^[ \t]*(```|~~~)/.test(l)) {
      fence = !fence
      return ""
    }
    return fence ? "" : l
  })
  const out: string[] = []
  const heads = plain.flatMap((l, i) => {
    const m = /^##[ \t]+(.+?)[ \t]*$/.exec(l)
    return m ? [{ i, name: m[1].replace(/[ \t]*\(.*\)$/, "").trim(), line: l }] : []
  })
  const firstHead = heads.length ? heads[0].i : plain.length
  if (!plain.slice(0, firstHead).some((l) => /^#[ \t]+Задание:[ \t]*\S/.test(l))) out.push("нет заголовка «# Задание: <название>» перед разделами")
  const found = MESSAGE_SECTIONS.map((name) => ({ name, h: heads.find((x) => x.name === name) }))
  const missing = found.filter((x) => !x.h).map((x) => `«${x.name}»`)
  if (missing.length) out.push(`нет ${missing.length > 1 ? "разделов" : "раздела"} ${missing.join(", ")} (заголовок второго уровня «## …»)`)
  const present = found.filter((x) => x.h)
  if (present.some((x, k) => k > 0 && x.h!.i < present[k - 1].h!.i)) out.push(`разделы не по порядку образца: ${MESSAGE_SECTIONS.map((x) => `«${x}»`).join(", ")}`)
  for (const { name, h } of present) {
    const end = plain.findIndex((l, k) => k > h!.i && /^#{1,2}[ \t]/.test(l))
    const body = plain.slice(h!.i + 1, end < 0 ? undefined : end)
    if (!body.some((l) => l.trim())) out.push(`раздел «${name}» пуст — пустой раздел пишется «нет: <почему>»`)
    else if (body.some((l) => BARE_NONE_RE.test(l))) out.push(`в разделе «${name}» «нет:» без причины — пишется «нет: <почему>»`)
    else if (name === OWNER_SECTION && !DATE_RE.test(h!.line) && !body.some((l) => DATE_RE.test(l)) && !/^[ \t]*(?:[-*][ \t]+)?нет:/.test(body.find((l) => l.trim()) ?? ""))
      out.push(`в разделе «${OWNER_SECTION}» нет даты ГГГГ-ММ-ДД — слова владельца пишутся с датой и источником, например ${OWNER_EXAMPLE}`)
  }
  return out
}

/** Отказ постановки задачи с папкой: текст message не по образцу или нет полей для задания из полей; undefined — можно ставить. */
export function messageRefusal(input: { message?: unknown; owner_words?: unknown; result?: unknown }): string | undefined {
  const own = String(input.message ?? "")
  if (own.trim()) {
    const f = messageFaults(own)
    return f.length ? `Задача не поставлена: текст message не по образцу задания (${TEMPLATE_REF}): ${f.join("; ")}. Допиши разделы или не передавай message — плагин соберёт задание из полей.` : undefined
  }
  const words = String(input.owner_words ?? "").trim()
  const lack: string[] = []
  if (!words) lack.push(`нет поля owner_words — слова владельца дословно с датой и источником, например owner_words: "${OWNER_EXAMPLE}"`)
  else if (!DATE_RE.test(words)) lack.push(`в owner_words нет даты ГГГГ-ММ-ДД — допиши дату и источник, например "${OWNER_EXAMPLE}"`)
  if (!String(input.result ?? "").trim()) lack.push("нет поля result — результат и куда он попадает: действующее место (например doc/canon/process.md, раздел «…») или «нет: результат — код: <что сдаётся>»")
  return lack.length ? `Задача не поставлена: задание task/message.md пишется по образцу (${TEMPLATE_REF}); ${lack.join("; ")}. Повтори вызов с этими полями (links и boundaries — по желанию) или передай message по образцу.` : undefined
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
