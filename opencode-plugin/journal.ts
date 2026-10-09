// ЖУРНАЛЫ ЗАДАЧИ: операции записи для агента (2026-10-09). Журналы задачи — территория CrewHarness (Канон, «Три журнала сессии»).
//   progress_line — одна строка `<код> k/N [ГГГГ-ММ-ДД ЧЧ:ММ] <текст>` с настоящими датой и временем машины в файл progress.log;
//   usage_line    — одна строка JSON (поле версии `v`) с учётом сессии в файл usage.log рядом с progress.log.
// Обе операции узкие: никакой оболочки, только дозапись, имя файла фиксировано, путь не выходит из папки проекта окна, отказ
// файловой системы возвращается отказом, прежние строки не переписываются. Чистые функции здесь; регистрация — registerJournalTools.
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, statSync } from "node:fs"
import path from "node:path"

const pad2 = (n: number) => String(n).padStart(2, "0")
export const hhmm = (d: Date = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
// Дата и время местные, как в Каноне: `ГГГГ-ММ-ДД ЧЧ:ММ` (поле строки progress.log) и ISO с местным поясом `2026-10-09T04:12:00+03:00` (usage.log).
export const ymdhm = (d: Date = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hhmm(d)}`
export function isoLocal(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off < 0 ? "-" : "+"
  const a = Math.abs(off)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`
}

export type Refused = { ok: false; reason: string }

const CODE_RE = /^[A-Za-zА-Яа-яЁё0-9]{1,8}$/
const UNIT_RE = /^(?:\d{1,4}\/\d{1,4}|\?\/\?)$/
const CONTROL_RE = /[\r\n\u0000-\u001f\u007f]/

// Файл внутри папки проекта окна и с нужным именем; иначе отказ.
function insideBase(fileArg: string, base: string, name: string): { ok: true; abs: string } | Refused {
  const file = String(fileArg ?? "").trim()
  if (!file) return { ok: false, reason: `не назван файл ${name}` }
  const abs = path.resolve(base, file)
  if (path.basename(abs).toLowerCase() !== name) return { ok: false, reason: `писать можно только в файл с именем ${name}` }
  const rel = path.relative(path.resolve(base), abs)
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, reason: "файл вне папки проекта окна" }
  return { ok: true, abs }
}

function appendOnly(abs: string, line: string): Refused | undefined {
  try {
    appendFileSync(abs, line + "\n", "utf8")
  } catch (e: any) {
    return { ok: false, reason: `файловая система отказала: ${e?.code ?? e}` }
  }
  return undefined
}

// ---- progress_line ----

export type ProgressInput = { file: string; code: string; unit: string; text: string }

export function progressLine(input: ProgressInput, base: string, now: Date = new Date()): { ok: true; line: string; file: string } | Refused {
  const text = String(input?.text ?? "").trim()
  const code = String(input?.code ?? "").trim()
  const unit = String(input?.unit ?? "").trim()
  if (!CODE_RE.test(code)) return { ok: false, reason: "код сессии: 1–8 букв или цифр без пробелов (например С5д)" }
  if (!UNIT_RE.test(unit)) return { ok: false, reason: "счёт: k/N числами (например 4/13) или ?/?" }
  if (!text) return { ok: false, reason: "текст пустой" }
  if (CONTROL_RE.test(text)) return { ok: false, reason: "текст в одну строку, без управляющих символов" }
  if ([...text].length > 120) return { ok: false, reason: "текст длиннее 120 знаков (строка журнала до 80 знаков по правилу проекта; сократи)" }
  const where = insideBase(input?.file, base, "progress.log")
  if (!where.ok) return where
  let st
  try {
    st = statSync(where.abs)
  } catch {
    return { ok: false, reason: "файла нет: журнал создаёт сессия методики, эта операция только дописывает" }
  }
  if (!st.isFile()) return { ok: false, reason: "это не файл" }
  const line = `${code} ${unit} [${ymdhm(now)}] ${text}`
  const bad = appendOnly(where.abs, line)
  if (bad) return bad
  return { ok: true, line, file: where.abs }
}

// ---- задержка цикла службы ----
// Таймер замера в index.ts отдаёт сюда каждое опоздание. Хранится наибольшее за каждую минуту (не больше суток), чтобы usage_line
// мог назвать наибольшую задержку с момента создания сессии (или с запуска плагина, если он стартовал позже).
const LAG_KEEP_MIN = 24 * 60
const lagByMinute = new Map<number, number>()
const pluginStartedAt = Date.now()
export function noteLoopLag(lagMs: number, at: number = Date.now()): void {
  const m = Math.floor(at / 60_000)
  const lag = Math.max(0, Math.round(lagMs))
  if (lag > (lagByMinute.get(m) ?? -1)) lagByMinute.set(m, lag)
  if (lagByMinute.size > LAG_KEEP_MIN) for (const k of lagByMinute.keys()) if (k < m - LAG_KEEP_MIN) lagByMinute.delete(k)
}
export function maxLoopLagSince(sinceMs: number): number | null {
  const from = Math.floor(Math.max(sinceMs, pluginStartedAt) / 60_000)
  let max: number | null = null
  for (const [m, v] of lagByMinute) if (m >= from && (max === null || v > max)) max = v
  return max
}
export function resetLoopLagForTest(): void {
  lagByMinute.clear()
}

// ---- usage_line ----

export type UsageInput = { file: string; code: string; result: string }
export type SessionCard = {
  model?: { id?: string; providerID?: string; variant?: string }
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  cost?: number
  time?: { created?: number; updated?: number }
}
export type UsageEnv = {
  session: string
  card?: SessionCard // карточка ctx.session.get; нет — поля из неё null
  now?: Date
  maxLag?: (sinceMs: number) => number | null
  commit?: (dir: string) => string
}

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function gitHead(dir: string): string {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

export function usageLine(input: UsageInput, base: string, env: UsageEnv): { ok: true; line: string; file: string } | Refused {
  const code = String(input?.code ?? "").trim()
  const result = String(input?.result ?? "").trim()
  if (!CODE_RE.test(code)) return { ok: false, reason: "код сессии: 1–8 букв или цифр без пробелов (например С5д)" }
  if (!result) return { ok: false, reason: "итог пустой" }
  if (CONTROL_RE.test(result)) return { ok: false, reason: "итог в одну строку, без управляющих символов" }
  if ([...result].length > 200) return { ok: false, reason: "итог длиннее 200 знаков; сократи" }
  const where = insideBase(input?.file, base, "usage.log")
  if (!where.ok) return where
  const dir = path.dirname(where.abs)
  if (!existsSync(path.join(dir, "progress.log"))) return { ok: false, reason: "рядом нет progress.log: usage.log заводится только в папке задачи" }
  if (existsSync(where.abs) && !statSync(where.abs).isFile()) return { ok: false, reason: "это не файл" }

  const now = env.now ?? new Date()
  const c = env.card
  const m = c?.model
  const created = num(c?.time?.created)
  const t = c?.tokens
  const tokens = t
    ? { input: num(t.input), output: num(t.output), reasoning: num(t.reasoning), cache_read: num(t.cache?.read), cache_write: num(t.cache?.write) }
    : null
  const row = {
    v: 1,
    code,
    at: isoLocal(now),
    session: env.session || null,
    model: m?.id ? `${m.providerID ? m.providerID + "/" : ""}${m.id}` : null,
    variant: m?.variant ? String(m.variant) : null,
    tokens,
    cost: num(c?.cost),
    started: created === null ? null : isoLocal(new Date(created)),
    seconds: created === null ? null : Math.max(0, Math.round((now.getTime() - created) / 1000)),
    max_loop_lag_ms: created === null ? null : (env.maxLag ?? maxLoopLagSince)(created),
    limits: null,
    tool_calls: null,
    test_runs: null,
    commit: (env.commit ?? gitHead)(dir),
    result,
  }
  const line = JSON.stringify(row)
  const bad = appendOnly(where.abs, line)
  if (bad) return bad
  return { ok: true, line, file: where.abs }
}

// ---- регистрация инструментов ----
// Отдельным вызовом ctx.tool.transform; сбой регистрации не ломает плагин.
export async function registerJournalTools(ctx: any, log: (s: string) => void): Promise<void> {
  const base = () => String(ctx?.location?.directory ?? process.cwd())
  const cardOf = async (sessionID: string): Promise<SessionCard | undefined> => {
    try {
      if (!sessionID || typeof ctx?.session?.get !== "function") return undefined
      const r = await ctx.session.get({ sessionID })
      const d = r?.data ?? r
      return d && typeof d === "object" ? d : undefined
    } catch (e) {
      log(`usage_line: session card unavailable: ${e}`)
      return undefined
    }
  }
  try {
    await ctx.tool.transform((editor: any) => {
      editor.add({
        name: "progress_line",
        description:
          "Append ONE line to a progress.log of the current project: '<code> <k/N> [YYYY-MM-DD HH:MM] <text>'. The tool puts the machine date and time itself; do not ask the clock with date or Get-Date (refused). Only a file named progress.log inside the project folder, only appending; the file must exist. Example: file 'doc/tasks/007-x/progress.log', code 'С5д', unit '4/13', text 'ворота merge: замок только на проверенную вершину'.",
        input: {
          type: "object",
          properties: {
            file: { type: "string", description: "path to progress.log, relative to the project folder or absolute inside it" },
            code: { type: "string", description: "session code, e.g. С5д" },
            unit: { type: "string", description: "k/N as numbers, e.g. 4/13, or ?/?" },
            text: { type: "string", description: "what is being done, one line, up to 120 characters" },
          },
          required: ["file", "code", "unit", "text"],
        },
        execute: async (input: any) => {
          const r = progressLine(input, base())
          if (!r.ok) {
            log(`progress_line refused: ${r.reason}`)
            return { content: `Не записано: ${r.reason}` }
          }
          return { content: `Записано: ${r.line}` }
        },
      })
      editor.add({
        name: "usage_line",
        description:
          "Append ONE JSON line with the accounting of this session to a usage.log of the current project (format version v:1). Call it once, when the session is finished. The tool fills everything itself (time, session, model, variant, tokens, cost, duration, longest service loop lag, last commit of the folder); you pass only the session code and the result. File named usage.log inside the project folder, only appending; it may be created only next to an existing progress.log of the same task folder. Example: file 'doc/tasks/007-x/usage.log', code 'С5д', result 'готово: 13 из 13 шагов, тесты зелёные'.",
        input: {
          type: "object",
          properties: {
            file: { type: "string", description: "path to usage.log (next to the task's progress.log), relative to the project folder or absolute inside it" },
            code: { type: "string", description: "session code, e.g. С5д" },
            result: { type: "string", description: "outcome of the session, one line, up to 200 characters" },
          },
          required: ["file", "code", "result"],
        },
        execute: async (input: any, context: any) => {
          const session = String(context?.sessionID ?? "")
          const r = usageLine(input, base(), { session, card: await cardOf(session) })
          if (!r.ok) {
            log(`usage_line refused: ${r.reason}`)
            return { content: `Не записано: ${r.reason}` }
          }
          return { content: `Записано в usage.log: ${r.line}` }
        },
      })
    })
  } catch (e) {
    log(`journal tools not registered: ${e}`)
  }
}
