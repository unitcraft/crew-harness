// A STOP AT A GATE ENDS WITH A QUESTION TO THE OWNER (task 062; owner, 2026-10-16: "меня никто ничего не спросил, это ошибка в работе").
// The tab writes the log.md entry of kind "ворота" with log_line (journal.ts); the plugin notes the stop here when the tab has no
// open question to the owner (a record in forms/ or a question at the end of the turn). When the turn of such a tab ends, the pass of
// the summaries (index.ts) writes ONE letter to the tab and the status shows the mark "⚠" until a question is open or the owner writes.
// One file per session in gates/: { session, at, text, letter? }. The store knows nothing about forms/ or turns (no import of
// form-wait.ts: form-wait.ts clears the stop when a question is created).
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

export const GATES = path.join(BASE, "gates")
/** A stop older than this is forgotten (the tab is long gone, or the owner answered somewhere the plugin did not see). */
export const GATE_TTL_MS = 12 * 3_600_000

export type Gate = { session: string; at: number; text: string; letter?: number }

/** The mark of a tab that stopped at a gate with no question to the owner (next to MARK and WAIT_MARK in status.ts, tasks 055/056). */
export const GATE_MARK = "⚠"

/** The answer of log_line to an entry "ворота" when the tab has no open question to the owner. The entry itself is written. */
export const GATE_ANSWER = "Ворота записаны, но вопроса владельцу нет: задай его сейчас инструментом question — вопрос, рекомендация, довод. Сводка в ответе вопроса не заменяет."

/** The letter to the tab whose turn ended at a gate with no question. */
export const GATE_LETTER =
  "Ты остановился на воротах без вопроса владельцу. Задай его сейчас инструментом question: один вопрос, 2–4 варианта, рекомендация первым вариантом с пометкой (Recommended), довод рядом. " +
  "Сводка в окне вопроса не заменяет: владелец не видит, что решение ждёт его. Вопрос уже открыт или ворота были только записью — ничего не делай."

const fileOf = (session: string, dir: string) => path.join(dir, `${safeKey(session)}.json`)

function save(file: string, g: Gate, dir: string) {
  mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(g, null, 1))
  renameSync(tmp, file)
}

/** The open stop of a session (undefined: none, or older than GATE_TTL_MS). */
export function gateOf(session: string, dir = GATES, now = Date.now()): Gate | undefined {
  const g = readJson<Gate>(fileOf(session, dir))
  if (!g || typeof g.at !== "number") return undefined
  if (now - g.at > GATE_TTL_MS) {
    rmSync(fileOf(session, dir), { force: true })
    return undefined
  }
  return g
}

/** Note a stop. An open stop is kept as it is (one stop - one letter): a second entry "ворота" of the same stop changes nothing. */
export function noteGate(session: string, text: string, at = Date.now(), dir = GATES): Gate {
  const have = gateOf(session, dir, at)
  if (have) return have
  const g: Gate = { session, at, text: String(text).slice(0, 300) }
  save(fileOf(session, dir), g, dir)
  return g
}

/** The letter of the stop is written: not again for the same stop. */
export function markGateLetter(session: string, at = Date.now(), dir = GATES) {
  const g = gateOf(session, dir)
  if (g) save(fileOf(session, dir), { ...g, letter: at }, dir)
}

/** The stop is over: a question is open, or the owner wrote. */
export function clearGate(session: string, dir = GATES) {
  if (existsSync(fileOf(session, dir))) rmSync(fileOf(session, dir), { force: true })
}
