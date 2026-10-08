// ХОД РАБОТ — ТЕКСТЫ ПАНЕЛИ И КОМАНДЫ /crew-progress (задача 004). Из сводки `ProgressTask` (progress.ts) строит строки блока
// «Ход работ» (до 32 знаков) и текст диалога команды (до 72 знаков). Окна и OpenCode здесь нет: модуль под Node проверяется
// самотестом. Окно подгружает его через import() с защитой (progress-sidebar.tsx, tui.ts): не загрузился — блок пуст.
import { summarizeTasks, thresholdsFromEnv, type ProgressSession, type ProgressTask } from "./progress.ts"
import { createScanner } from "./progress-scan.ts"

/** Ширины продублированы из status.ts (SIDE_WIDTH, DIALOG_WIDTH): тот тянет ядро и ящик, а status.ts не меняется (DNC-01); самотест сверяет. */
export const PANEL_WIDTH = 32
export const DIALOG_WIDTH = 72
/** Показ из кэша — раз в 2 секунды (обход файлов — progress-scan.ts WALK_MS): видно не позже чем через 10 секунд (REQ-09). */
export const SHOW_MS = 2_000
export const MAX_TASKS = 3
export const OUTSIDE_TEXT = "Вкладка открыта вне репозитория: ход работ показывать нечем (осмотрено деревьев: 0)"

export type Tone = "base" | "accent" | "muted"
export type PanelRow = { text: string; tone: Tone }

/** Строка не длиннее `width`: лишнее отрезается с конца знаком «…», конечные пробелы снимаются. */
export function fitRow(text: string, width: number): string {
  const s = text.length > width ? `${text.slice(0, width - 1)}…` : text
  return s.replace(/ +$/, "")
}

const two = (n: number) => String(n).padStart(2, "0")
const clock = (ms: number) => `${two(new Date(ms).getHours())}:${two(new Date(ms).getMinutes())}`
const minutes = (ms: number) => Math.max(0, Math.floor(ms / 60_000))
/** «Nм» до 99, от 100 минут — целые часы «Nч» (панель). */
export const shortAge = (ms: number) => {
  const m = minutes(ms)
  return m < 100 ? `${m}м` : `${Math.floor(m / 60)}ч`
}
/** «N мин» до 99, от 100 минут — «N ч» (команда). */
export const longAge = (ms: number) => {
  const m = minutes(ms)
  return m < 100 ? `${m} мин` : `${Math.floor(m / 60)} ч`
}
const stamp = (s: ProgressSession) => `${s.byFile ? "≈" : ""}${clock(s.at)}`

/** Задача требует внимания: тишина (6), остановка (1), запуск после порога (3). Метка `!` (REQ-07); «итога нет» (7) — метка `•`. */
export const needsAttention = (s: ProgressSession) => s.state === 6 || s.state === 1 || (s.state === 3 && s.stale)
const markOf = (s: ProgressSession) => (needsAttention(s) ? "!" : s.state === 2 ? "✓" : "•")

/** Причина остановки: подпись после «стоп: <вид> —». */
const stopReason = (s: ProgressSession) => {
  let rest = s.signature.replace(/^стоп: */, "")
  if (s.kind && rest.startsWith(s.kind)) rest = rest.slice(s.kind.length)
  return rest.replace(/^[ .,:;!—–-]+/, "").trim()
}

/** Слово состояния по таблице REQ-07: столбец панели (до 28 знаков) или команды. `now` — часы показа. */
export function stateWord(s: ProgressSession, now: number, mode: "panel" | "dialog"): string {
  const silent = now - s.at
  const branch = s.branchAt !== undefined && s.branchAt > s.at ? now - s.branchAt : undefined
  const panel = mode === "panel"
  switch (s.state) {
    case 1:
      return panel ? `остановилась: ${s.kind ?? "вид не назван"}` : `остановилась: ${s.kind ?? "вид не назван"}${stopReason(s) ? ` — ${stopReason(s)}` : ""}, ${stamp(s)}`
    case 2:
      return panel ? `готово ${stamp(s)}` : `готово, ${stamp(s)}`
    case 3:
      if (!s.stale) return panel ? `запущена ${stamp(s)}` : `запущена ${stamp(s)}, шагов нет`
      return panel ? `⚠ нет вестей ${shortAge(silent)}${branch !== undefined ? ` · ветка ${shortAge(branch)}` : ""}` : `запущена ${stamp(s)}, шагов нет, давно нет вестей ${longAge(silent)}${branch !== undefined ? `, ветка двигалась ${longAge(branch)} назад` : ""}`
    case 4:
      return panel ? `без единиц ${stamp(s)}` : `без единиц, ${stamp(s)}`
    case 5:
      return panel ? `идёт ${stamp(s)} · ${shortAge(silent)} назад` : `идёт: последняя весть ${stamp(s)}, ${longAge(silent)} назад`
    case 6:
      return panel ? `⚠ нет вестей ${shortAge(silent)}${branch !== undefined ? ` · ветка ${shortAge(branch)}` : ""}` : `давно нет вестей ${longAge(silent)}${branch !== undefined ? `, ветка двигалась ${longAge(branch)} назад` : ""}`
    default:
      return "все шаги сделаны, итога нет"
  }
}

/** Порядок и отбор для панели: сначала требующие внимания (самые давние выше), затем остальные по свежести; не больше трёх (REQ-07). */
export function orderTasks(tasks: ProgressTask[]): { shown: ProgressTask[]; hidden: number } {
  const visible = tasks.filter((t) => t.visible)
  const attention = visible.filter(needsAttention).sort((a, b) => a.at - b.at)
  const rest = visible.filter((t) => !needsAttention(t)).sort((a, b) => b.at - a.at)
  const shown = [...attention, ...rest].slice(0, MAX_TASKS)
  return { shown, hidden: visible.length - shown.length }
}

const IND = "    "
const toneOf = (s: ProgressSession): Tone => (needsAttention(s) ? "accent" : s.state === 2 ? "muted" : "base")

/** Четыре строки задачи для панели (ширина 32). */
export function taskRows(t: ProgressTask, now: number): PanelRow[] {
  const kn = t.state === 3 ? "шагов нет" : `${t.k}/${t.n}`
  const tail = [kn, ...(t.divergent ? ["≠"] : []), ...(t.others > 0 ? [`+${t.others}`] : [])].join(" ")
  const room = PANEL_WIDTH - IND.length - 1 - tail.length
  const name = t.sessionName.length > room ? `${t.sessionName.slice(0, Math.max(0, room - 1))}…` : t.sessionName
  const attention = needsAttention(t)
  return [
    { text: fitRow(`${markOf(t)} ${t.number} ${t.title}`, PANEL_WIDTH), tone: toneOf(t) },
    { text: fitRow(`${IND}${name} ${tail}`, PANEL_WIDTH), tone: "base" },
    { text: fitRow(`${IND}↳ ${t.signature}`, PANEL_WIDTH), tone: "muted" },
    { text: fitRow(`${IND}${panelWord(t, now)}`, PANEL_WIDTH), tone: attention ? "accent" : "muted" },
  ]
}

// строка 4: «ветка Mм» дописывается, только если вся строка с отступом помещается в 32 знака
function panelWord(t: ProgressSession, now: number): string {
  const full = stateWord(t, now, "panel")
  if (full.includes(" · ветка ") && IND.length + full.length > PANEL_WIDTH) return full.slice(0, full.indexOf(" · ветка "))
  return full
}

/** Блок «Ход работ»: заголовок, до трёх задач по четыре строки и нижняя строка «ещё N · все: /crew-progress» (без скрытых —
 * «все: /crew-progress»); нет идущих задач — пусто (REQ-07). */
export function panelLines(tasks: ProgressTask[], now: number): PanelRow[] {
  const { shown, hidden } = orderTasks(tasks)
  if (!shown.length) return []
  const rows: PanelRow[] = [{ text: "Ход работ", tone: "base" }]
  for (const t of shown) rows.push(...taskRows(t, now))
  rows.push({ text: fitRow(hidden > 0 ? `ещё ${hidden} · все: /crew-progress` : "все: /crew-progress", PANEL_WIDTH), tone: "muted" })
  return rows
}

// ---- диалог команды /crew-progress (ширина 72) ---------------------------------------------------------------------------

const D = (s: string) => fitRow(s, DIALOG_WIDTH)

function sessionBlock(s: ProgressSession, now: number, lead: string): string[] {
  const kn = s.state === 3 ? "шагов нет" : `${s.k}/${s.n}`
  const out = [D(`${lead}${s.sessionName} ${kn}${s.divergent ? " ≠" : ""}`)]
  let word = stateWord(s, now, "dialog")
  if (s.state === 1) {
    // длинная причина сокращается, время остановки остаётся в конце
    const over = IND.length - 2 + word.length - DIALOG_WIDTH
    if (over > 0) {
      const reason = stopReason(s)
      const cut = reason.slice(0, Math.max(1, reason.length - over - 1))
      word = `остановилась: ${s.kind ?? "вид не назван"} — ${cut}…, ${stamp(s)}`
    }
  }
  out.push(D(`${IND}${word}${s.abandoned ? " — давно брошена" : ""}`))
  for (const l of s.tail) out.push(D(`${IND}↳ ${l}`))
  return out
}

/**
 * Текст диалога: все идущие задачи с кандидатами и тремя последними строками каждого, «вытеснено N», брошенные. Задача со скрытой
 * показываемой записью («итога нет» старше 24 часов, «готово» или «без единиц» старше 15 минут) остаётся ради кандидата с `abandoned`:
 * пишется только он, сама запись — нет (REQ-05).
 */
export function dialogText(tasks: ProgressTask[], now: number, scan?: { trees: number; journals: number }): string {
  const list = tasks.filter((t) => t.visible || t.candidates.some((c) => c.abandoned))
  if (!list.length) return `Идущих задач нет. Осмотрено деревьев: ${scan?.trees ?? 0}, журналов: ${scan?.journals ?? 0}.`
  const lines: string[] = [`Идущих задач: ${list.filter((t) => t.visible).length}${list.some((t) => !t.visible) ? `, давно брошенных: ${list.filter((t) => !t.visible).length}` : ""}`]
  const attention = (t: ProgressTask) => (needsAttention(t) ? 0 : 1)
  for (const t of [...list].sort((a, b) => Number(!a.visible) - Number(!b.visible) || attention(a) - attention(b) || a.at - b.at)) {
    lines.push("")
    lines.push(D(`${markOf(t)} ${t.number} ${t.title}`))
    const cands = t.visible || t.abandoned ? t.candidates.filter((c) => c.visible || c.abandoned) : t.candidates.filter((c) => c.abandoned)
    cands.forEach((c, i) => lines.push(...sessionBlock(c, now, i === 0 ? "  " : "  + ")))
    if (t.displaced > 0) lines.push(D(`  вытеснено ${t.displaced} (прошлые сессии)`))
  }
  return lines.join("\n")
}

// ---- входы окна: панель и команда -------------------------------------------------------------------------------------------

const scanner = createScanner()

/** Строки блока для вкладки с каталогом `dir`: обход не чаще раза в 5 секунд, между обходами — из кэша. Ошибка — пустой блок. */
export function progressPanel(dir: string | undefined, now: number = Date.now()): PanelRow[] {
  try {
    if (!dir) return []
    const th = thresholdsFromEnv(process.env)
    return panelLines(summarizeTasks(scanner.scan(dir, now), now, th), now)
  } catch {
    return []
  }
}

/** Текст диалога `/crew-progress`: журналы разбираются все за один вызов, начиная со свежих. */
export function progressDialog(dir: string | undefined, now: number = Date.now()): string {
  if (!dir) return OUTSIDE_TEXT
  const scan = scanner.scanAll(dir, now)
  if (!scan.repo) return OUTSIDE_TEXT
  return dialogText(summarizeTasks(scan, now, thresholdsFromEnv(process.env)), now, { trees: scan.trees.length, journals: scan.journals })
}
