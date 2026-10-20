// Страж слипшихся слов на инструментах (задача 127): письмо `crew_send`, вопросник `question`, записи текстовых файлов
// (`edit`, `write`, `patch` и их аналоги). Признак — glued.ts. Здесь: какие тексты брать из вызова, как отказывать и как не
// зациклить вкладку.
//
// КАК ОТКАЗЫВАЕМ. Хуки OpenCode V2 (читано по коду 2.0.26, документации нет):
//   tool.hook("execute.before")       {tool, sessionID, agent, messageID, id, input} — вызов отклонить нельзя;
//   permission.hook("evaluate")       {sessionID, agent, action, resources, metadata, source, effect}: action = "edit" у edit/write/patch
//                                      и "question" у question; source = {type: "tool", messageID, id}, id тот же, что в execute.before;
//                                      effect = "deny" и message отклоняют вызов до выполнения;
//   tool.hook("execute.after")        {…, status, error|result}: у question отказ приходит как «Permission denied: question», причину плагин
//                                      подставляет в ошибку сам.
// Поэтому: execute.before проверяет текст и записывает приговор под id вызова, evaluate читает приговор и отклоняет.
//
// НЕ ЗАЦИКЛИТЬ. Второй подряд отказ того же вида вызова в той же сессии (письмо, вопрос, запись файла) не блокирует вкладку: плагин пишет в
// журнал строку `glued words passed` и пропускает. Счётчик сбрасывается чистым вызовом того же вида или через REFUSAL_WINDOW_MS.
// Состояние — в globalThis: плагин перегружается на лету, а хуки прежних экземпляров могут жить дальше; приговор по id вызова один.
import { type Glued, type GluedWhere, gluedRefusal, gluedText } from "./glued.ts"

/** второй отказ позже этого срока считается первым */
export const REFUSAL_WINDOW_MS = 15 * 60_000
const VERDICT_TTL_MS = 10 * 60_000

/** Файлы, где слова — текст, а не идентификаторы. В коде (.ts, .mjs, .json, .nv…) признак не применяется. */
const TEXT_FILE = /\.(?:md|markdown|txt|text|tsv|csv|rst|adoc)$/i
export const isTextFile = (p: unknown): boolean => typeof p === "string" && TEXT_FILE.test(p.trim())

export type Segment = { text: string; file?: string }
export type Piece = { where: GluedWhere; segments: Segment[] }

const str = (v: unknown): string => (typeof v === "string" ? v : "")

/** Тексты вопросника: вопрос, заголовок, названия и пояснения вариантов. */
function questionTexts(input: any): string[] {
  const out: string[] = []
  const qs = Array.isArray(input?.questions) ? input.questions : []
  for (const q of qs) {
    out.push(str(q?.question), str(q?.header))
    for (const o of Array.isArray(q?.options) ? q.options : []) out.push(str(o?.label), str(o?.description))
  }
  return out.filter(Boolean)
}

/** Добавленные строки патча по текстовым файлам: `*** Add File: p`, `*** Update File: p` (или `+++ b/p` у unified diff); строки на «+». */
function patchSegments(patchText: string): Segment[] {
  const out = new Map<string, string[]>()
  let file: string | undefined
  for (const line of patchText.split(/\r?\n/)) {
    const h = /^\*\*\* (?:Add|Update) File:\s*(.+?)\s*$/.exec(line)
    if (h) {
      file = h[1]
      continue
    }
    if (/^\*\*\* Delete File:/.test(line)) {
      file = undefined
      continue
    }
    const ud = /^\+\+\+ (?:b\/)?([^\t]+)/.exec(line)
    if (ud) {
      file = ud[1].trim()
      continue
    }
    const mv = /^\*\*\* Move to:\s*(.+?)\s*$/.exec(line)
    if (mv) {
      file = mv[1]
      continue
    }
    if (file && isTextFile(file) && line.startsWith("+") && !line.startsWith("+++")) {
      const rows = out.get(file) ?? []
      rows.push(line.slice(1))
      out.set(file, rows)
    }
  }
  return [...out].map(([f, rows]) => ({ file: f, text: rows.join("\n") }))
}

/** Что проверять в вызове инструмента OpenCode: тексты, которые модель пишет. Чужие инструменты и код — ничего. */
export function pieceOf(tool: string, input: any): Piece | undefined {
  if (!input || typeof input !== "object") return undefined
  if (tool === "question") {
    const texts = questionTexts(input)
    return texts.length ? { where: "question", segments: [{ text: texts.join("\n") }] } : undefined
  }
  const file = str(input.path) || str(input.filePath) || str(input.file_path)
  if (tool === "write") {
    if (!isTextFile(file) || !str(input.content)) return undefined
    return { where: "file", segments: [{ file, text: str(input.content) }] }
  }
  if (tool === "edit") {
    if (!isTextFile(file) || !str(input.newString)) return undefined
    return { where: "file", segments: [{ file, text: str(input.newString) }] }
  }
  if (tool === "multiedit") {
    const text = (Array.isArray(input.edits) ? input.edits : []).map((e: any) => str(e?.newString)).filter(Boolean).join("\n")
    if (!isTextFile(file) || !text) return undefined
    return { where: "file", segments: [{ file, text }] }
  }
  if (tool === "patch" || tool === "apply_patch") {
    const segments = patchSegments(str(input.patchText) || str(input.patch) || str(input.input))
    return segments.length ? { where: "file", segments } : undefined
  }
  return undefined
}

type State = {
  refused: Map<string, number>
  verdicts: Map<string, { message: string; at: number; action: string }>
  seen: Set<string>
}
const state = (): State => {
  const g = globalThis as any
  return (g.__crewGluedGuard ??= { refused: new Map(), verdicts: new Map(), seen: new Set() })
}

/**
 * Приговор по тексту: сообщение отказа или undefined (чисто либо пропущено после первого отказа).
 * `kind` — вид вызова для счётчика: письмо, вопрос, запись файла.
 */
export function judge(sessionID: string, piece: Piece, log: (line: string) => void, now = Date.now()): string | undefined {
  let found: { g: Glued; file?: string } | undefined
  for (const s of piece.segments) {
    const g = gluedText(s.text)
    if (g.reject) {
      found = { g, file: s.file }
      break
    }
  }
  const key = `${sessionID}|${piece.where}`
  const st = state()
  if (!found) {
    st.refused.delete(key)
    return undefined
  }
  const prev = st.refused.get(key)
  if (prev !== undefined && now - prev < REFUSAL_WINDOW_MS) {
    st.refused.delete(key)
    const what = found.g.marks.length ? found.g.marks.slice(0, 3).join(", ") : (found.g.runs[0] ?? "").slice(0, 40)
    log(`glued words passed: second refusal in a row for ${piece.where} in session ${sessionID}${found.file ? ` (${found.file})` : ""}: ${what}`)
    return undefined
  }
  st.refused.set(key, now)
  log(`glued words refused: ${piece.where} in session ${sessionID}${found.file ? ` (${found.file})` : ""}: ${(found.g.marks[0] ?? found.g.runs[0] ?? "").slice(0, 40)}`)
  return gluedRefusal(found.g, piece.where, found.file)
}

const ACTION: Record<string, string> = { question: "question", edit: "edit", write: "edit", multiedit: "edit", patch: "edit", apply_patch: "edit" }

/** Регистрация хуков инструментов. Ничего не бросает: нет хука в этой версии OpenCode — строка в журнал, остальное работает. */
export async function registerGluedHooks(ctx: any, log: (line: string) => void): Promise<void> {
  const st = state()
  const purge = (now: number) => {
    for (const [id, v] of st.verdicts) if (now - v.at > VERDICT_TTL_MS) st.verdicts.delete(id)
    if (st.seen.size > 2000) st.seen.clear()
  }
  try {
    await ctx.tool.hook("execute.before", (ev: any) => {
      try {
        const tool = String(ev?.tool ?? "")
        const id = String(ev?.id ?? "")
        if (!ACTION[tool] || !id) return
        if (st.seen.has(id)) return // хук прежнего экземпляра плагина уже судил этот вызов
        st.seen.add(id)
        const piece = pieceOf(tool, ev.input)
        if (!piece) return
        const now = Date.now()
        purge(now)
        const message = judge(String(ev.sessionID ?? ""), piece, log, now)
        if (message) st.verdicts.set(id, { message, at: now, action: ACTION[tool] })
      } catch (e) {
        log(`glued guard (before) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`glued guard: no tool.hook("execute.before") in this OpenCode (${e}), question and file writes are not checked`)
    return
  }
  try {
    await ctx.permission.hook("evaluate", (ev: any) => {
      try {
        if (ev?.effect === "deny") return
        const v = st.verdicts.get(String(ev?.source?.id ?? ""))
        if (!v || v.action !== ev.action) return
        ev.effect = "deny"
        ev.message = v.message
      } catch (e) {
        log(`glued guard (evaluate) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`glued guard: no permission.hook("evaluate") in this OpenCode (${e}), refusals are not delivered`)
  }
  try {
    await ctx.tool.hook("execute.after", (ev: any) => {
      try {
        const v = st.verdicts.get(String(ev?.id ?? ""))
        if (!v) return
        st.verdicts.delete(String(ev.id))
        // OpenCode оборачивает отказ у question в «Permission denied: question»: причину кладём в ошибку сами
        if (ev.status === "error" && ev.error && typeof ev.error === "object") ev.error.message = v.message
      } catch (e) {
        log(`glued guard (after) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`glued guard: no tool.hook("execute.after") in this OpenCode (${e}), the reason of a refused question may be lost`)
  }
}
