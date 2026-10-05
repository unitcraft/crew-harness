// НАБЛЮДЕНИЯ (провайдер claude-code, план 002, 2026-10-05): долгое ожидание, которое переживает конец хода.
//
// Фоновая работа Claude Code (Bash run_in_background, Monitor) в окне claude-code гибнет с концом хода: процесс
// Claude Code закрывается, уведомления о конце не будет (замер). Случай владельца: интегратор поставил ожидание
// вердикта гейта в фон и закончил ход «уведомление придёт само» — гейт кончился, окно стояло.
//
// peer_watch {command}: инструмент только КЛАДЁТ задание (watches/<id>.req.json) — MCP-сервер окна claude-code
// умирает вместе с ходом. Запускает его плагин (сервер OpenCode, проход доставки): команда идёт в Git Bash
// ОТКРЕПЛЁННО (переживает и перезапуск сервиса), вывод — в <id>.out, код выхода — в <id>.exit. Когда код появился —
// письмо окну с побудкой: код, длительность, хвост вывода. Процесс пропал без кода — письмо «оборвано».

import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson } from "./core.ts"
import { BASE } from "./paths.ts"

export const WATCHES = path.join(BASE, "watches")
export const WATCH_MAX_MIN = 720
export const WATCH_DEFAULT_MIN = 120
const KEEP_DONE_MS = 24 * 3600_000
const TAIL_LINES = 30
const TAIL_CHARS = 3000

export type Watch = {
  id: string
  session: string
  command: string
  cwd: string
  note?: string
  minutes: number
  created: number
  status: "requested" | "running" | "done"
  /** Команда грузит машину (гейт, сборка, прогон тестов): ждёт места в очереди машины проекта (план 005). */
  machine?: boolean
  project?: string
  pid?: number
  started?: number
  ended?: number
  code?: number | null
}

const file = (id: string, ext: string) => path.join(WATCHES, `${id}${ext}`)
const writeAtomic = (f: string, data: any) => {
  writeFileSync(`${f}.tmp`, JSON.stringify(data, null, 1))
  renameSync(`${f}.tmp`, f)
}
const forBash = (p: string) => p.replace(/\\/g, "/")
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** Задание наблюдения: только файл, запустит плагин. */
export function requestWatch(w: { session: string; command: string; cwd: string; note?: string; minutes?: number; machine?: boolean; project?: string }, now = Date.now()): Watch {
  mkdirSync(WATCHES, { recursive: true })
  const minutes = Math.min(WATCH_MAX_MIN, Math.max(1, Math.round(Number(w.minutes) || WATCH_DEFAULT_MIN)))
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const watch: Watch = { id, session: w.session, command: w.command, cwd: w.cwd, ...(w.note ? { note: w.note } : {}), ...(w.machine ? { machine: true } : {}), ...(w.project ? { project: w.project } : {}), minutes, created: now, status: "requested" }
  writeAtomic(file(id, ".req.json"), watch)
  return watch
}

/** Git Bash: на Windows первым в PATH бывает bash WSL (System32) — он не годится. */
let bashPath: string | undefined
export function gitBash(): string {
  if (bashPath) return bashPath
  if (process.platform !== "win32") return (bashPath = "bash")
  const candidates = [process.env.CLAUDE_CODE_GIT_BASH_PATH]
  try {
    const git = execFileSync("where.exe", ["git"], { encoding: "utf8", windowsHide: true }).split(/\r?\n/)[0].trim()
    if (git) candidates.push(path.join(path.dirname(path.dirname(git)), "bin", "bash.exe"))
  } catch {}
  candidates.push("C:\\Program Files\\Git\\bin\\bash.exe")
  return (bashPath = candidates.find((c) => c && existsSync(c)) ?? "bash")
}

function pidAlive(pid?: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === "EPERM"
  }
}

function start(w: Watch, now: number, log: (s: string) => void): Watch {
  const out = forBash(file(w.id, ".out"))
  const exit = forBash(file(w.id, ".exit"))
  const script = `timeout ${w.minutes * 60} bash -c ${quote(w.command)} > ${quote(out)} 2>&1; echo $? > ${quote(exit + ".tmp")} && mv ${quote(exit + ".tmp")} ${quote(exit)}`
  try {
    const child = spawn(gitBash(), ["-c", script], { cwd: existsSync(w.cwd) ? w.cwd : undefined, detached: true, stdio: "ignore", windowsHide: true })
    child.on("error", (e) => log(`watch ${w.id}: ${e}`))
    child.unref()
    return { ...w, status: "running", pid: child.pid, started: now }
  } catch (e) {
    log(`watch ${w.id}: не запустилось: ${e}`)
    writeFileSync(file(w.id, ".exit"), "127")
    return { ...w, status: "running", started: now }
  }
}

export function tailOf(text: string): string {
  const t = text.replace(/\r/g, "").trimEnd().split("\n").slice(-TAIL_LINES).join("\n")
  return t.length > TAIL_CHARS ? `…${t.slice(-TAIL_CHARS)}` : t
}

const minutesText = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} с` : `${Math.round(ms / 60_000)} мин`)

/** Текст письма о конце наблюдения. */
export function watchLetter(w: Watch, output: string): string {
  const what = w.note ? `«${w.note}»` : "без пометки"
  const how =
    w.code === null || w.code === undefined
      ? "ОБОРВАНО: процесс пропал без кода выхода (перезагрузка машины?) — проверь сам и при нужде поставь заново"
      : w.code === 124
        ? `истекло время (${w.minutes} мин), команда остановлена`
        : `код выхода ${w.code}`
  const tail = tailOf(output)
  const queued = w.machine && w.started && w.started - w.created > 60_000 ? ` (до запуска ждало очереди машины ${minutesText(w.started - w.created)})` : ""
  return (
    `Наблюдение ${what} закончилось: ${how}, шло ${minutesText((w.ended ?? 0) - (w.started ?? w.created))}${queued}.\n` +
    `Команда: ${w.command.length > 300 ? `${w.command.slice(0, 300)}…` : w.command}\n` +
    (tail ? `Хвост вывода:\n${tail}` : "Вывода нет.") +
    `\nПолный вывод: ${file(w.id, ".out")}`
  )
}

// ОЧЕРЕДЬ МАШИНЫ (план 005, 2026-10-05): гейты трёх воркеров и приёмщиков шли разом с CI интегратора — машина
// владельца захлёбывалась. Наблюдение с machine: true запускается, только пока в его проекте таких работает меньше
// machine_slots (по умолчанию 1; 0 — без предела); остальные ждут по времени постановки (имя файла начинается
// с него). Предел времени (minutes) считается от запуска, не от постановки.
const runningMachine = (project: string | undefined) =>
  readdirSync(WATCHES)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".req.json"))
    .map((f) => readJson<Watch>(path.join(WATCHES, f)))
    .filter((w) => w?.machine && w.status === "running" && w.project === project).length

/** Ждущие в очереди машины проекта, по порядку. */
export function machineQueue(project: string | undefined): Watch[] {
  if (!existsSync(WATCHES)) return []
  return readdirSync(WATCHES)
    .filter((f) => f.endsWith(".req.json"))
    .sort()
    .map((f) => readJson<Watch>(path.join(WATCHES, f)))
    .filter((w): w is Watch => !!w?.machine && w.project === project)
}

/** Проход плагина: запустить новые, закончить завершённые. post — письмо окну; slots — machine_slots проекта. */
export function pollWatches(post: (w: Watch, text: string) => void, log: (s: string) => void = () => {}, now = Date.now(), slots: (w: Watch) => number = () => 1): number {
  if (!existsSync(WATCHES)) return 0
  let changed = 0
  for (const f of readdirSync(WATCHES).sort()) {
    if (f.endsWith(".req.json")) {
      // захват переименованием: запускает один процесс, даже если плагинов два
      const id = f.slice(0, -".req.json".length)
      const req = readJson<Watch>(path.join(WATCHES, f))
      if (req?.machine) {
        const limit = slots(req)
        if (limit > 0 && runningMachine(req.project) >= limit) continue // ждёт места в очереди машины
      }
      try {
        renameSync(path.join(WATCHES, f), file(id, ".claim"))
      } catch {
        continue
      }
      const w = readJson<Watch>(file(id, ".claim"))
      rmSync(file(id, ".claim"), { force: true })
      if (!w) continue
      writeAtomic(file(id, ".json"), start(w, now, log))
      changed++
      continue
    }
    if (!f.endsWith(".json") || f.endsWith(".req.json")) continue
    const w = readJson<Watch>(path.join(WATCHES, f))
    if (!w) continue
    if (w.status === "done") {
      if (now - (w.ended ?? now) > KEEP_DONE_MS) for (const ext of [".json", ".out", ".exit"]) rmSync(file(w.id, ext), { force: true })
      continue
    }
    const exitFile = file(w.id, ".exit")
    let code: number | null | undefined
    if (existsSync(exitFile)) code = Number(readFileSync(exitFile, "utf8").trim())
    else if (!pidAlive(w.pid) && now - (w.started ?? w.created) > 10_000 && !existsSync(exitFile)) code = null // пропал без кода
    else continue
    const done: Watch = { ...w, status: "done", ended: now, code: Number.isNaN(code) ? null : code }
    let output = ""
    try {
      output = existsSync(file(w.id, ".out")) ? readFileSync(file(w.id, ".out"), "utf8") : ""
    } catch {}
    writeAtomic(file(w.id, ".json"), done)
    post(done, watchLetter(done, output))
    changed++
  }
  return changed
}

/** Открытые наблюдения окна: запущенные и ждущие запуска (status requested — в очереди машины или ещё не взятые). */
export function watchesOf(session: string): Watch[] {
  if (!existsSync(WATCHES)) return []
  const out: Watch[] = []
  for (const f of readdirSync(WATCHES)) {
    if (!f.endsWith(".json")) continue
    const w = readJson<Watch>(path.join(WATCHES, f))
    if (w && w.session === session && w.status !== "done") out.push(w)
  }
  return out.sort((a, b) => a.created - b.created)
}
