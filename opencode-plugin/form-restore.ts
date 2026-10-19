// A FORM WHOSE RECORD IS GONE WHILE ITS DIALOG IS OPEN (task 120). Source: 2026-10-20 two dialogs "Questions" (acceptance of tasks 105 and 107) hung in the window
// for 18-19 hours, forms/<session>.json was gone, crew-answer got "no open question form" and the orchestrator answered "no questions" (analysis.md).
// The plugin keeps three other traces of every form it saw: the marker of the automatic answer (forms/auto/<form>.json, state "held" for the owner), the ask of the
// loop (forms/loops/<session>.json) and, the truth, the call `question` in the database of OpenCode (core.ts questionCall). Here:
//   restoreForms - on every pass of the service (and at the start): a tab with an OPEN call `question` and no record of it gets the record back from the marker or the
//                  ask of the loop, with the options and the facts read from the call itself. A call that has ended restores nothing (answered, or dead: see below);
//   deadDialogOf - a held form with no record whose call ended with an abort: the dialog may still hang in the window, nobody can answer it; crew-answer says so
//                  (owner-answer.ts) and the marker stops counting as "left to the owner" (closeDeadMark).
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { LoopState } from "./answer-loop.ts"
import { type QuestionCall, readJson, safeKey } from "./core.ts"
import type { Mark } from "./form-auto.ts"
import { FORMS, FORM_TTL_MS, type PendingForm, addForm, closedRecently, fateOf, formFacts, shownForms } from "./form-wait.ts"

export type RestoreDeps = {
  /** the last call `question` of the tab in the database (core.ts questionCall) */
  call(session: string): Promise<QuestionCall>
  say?(line: string): void
}

/** What the traces say about a form: enough to find it again and to compare with the call. */
type Trace = { id: string; session: string; at: number; question?: string; options?: string[] }

const jsonsIn = (dir: string): string[] => {
  try {
    return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n)) : []
  } catch {
    return []
  }
}

/** The forms the owner was left (markers "held") and the last ask of every loop that nobody answered, young enough to still be a live dialog. Newest first. */
function tracesOf(now: number, dir: string): Trace[] {
  const out: Trace[] = []
  for (const file of jsonsIn(path.join(dir, "auto"))) {
    const m = readJson<Mark>(file)
    if (m && m.state === "held" && m.id && m.session && typeof m.first === "number" && now - m.first < FORM_TTL_MS) out.push({ id: m.id, session: m.session, at: m.first, ...(m.question ? { question: m.question } : {}) })
  }
  for (const file of jsonsIn(path.join(dir, "loops"))) {
    const st = readJson<LoopState>(file)
    const a = st && Array.isArray(st.asks) ? [...st.asks].reverse().find((x) => x && x.form && typeof x.at === "number" && !x.answered) : undefined
    if (st?.session && a && now - a.at < FORM_TTL_MS) out.push({ id: a.form, session: st.session, at: a.at, ...(a.question ? { question: a.question } : {}), ...(a.options?.length ? { options: a.options } : {}) })
  }
  return out.sort((x, y) => y.at - x.at)
}

/** Every id the file of the tab knows, replaced or not: a form that has its record (even as history) is not made again. */
const knownIds = (session: string, dir: string): Set<string> => {
  const list = readJson<PendingForm[]>(path.join(dir, `${safeKey(session)}.json`))
  return new Set(Array.isArray(list) ? list.map((f) => f?.id).filter(Boolean) : [])
}

const lookedAt = new Map<string, number>()
/** A tab is looked at once in this time (a read of the database each); the first look after the start of the process is not held back. */
export const RESTORE_LOOK_MS = 30_000
export const resetRestore = () => lookedAt.clear()

/** Task 120 (b): a held form without a record whose call is still open is made again. Returns the records made. */
export async function restoreForms(deps: RestoreDeps, now = Date.now(), dir = FORMS): Promise<PendingForm[]> {
  const made: PendingForm[] = []
  const bySession = new Map<string, Trace[]>()
  for (const t of tracesOf(now, dir)) bySession.set(t.session, [...(bySession.get(t.session) ?? []), t])
  for (const [session, traces] of bySession) {
    try {
      if (shownForms(session, now, dir).length) continue // the tab has a record (open or dead): the look of formTick covers it
      if (now - (lookedAt.get(session) ?? 0) < RESTORE_LOOK_MS) continue
      lookedAt.set(session, now)
      const known = knownIds(session, dir)
      const call = await deps.call(session)
      if (call.state !== "open") continue
      const t = traces.find((x) => !known.has(x.id) && !closedRecently(x.id, now) && fateOf({ id: x.id, at: x.at, born: x.at, ...(x.question ? { question: x.question } : {}) }, call) === "open")
      if (!t) continue
      const question = (call.question ?? t.question ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
      const options = call.options?.length ? call.options.slice(0, 8) : t.options
      const f: PendingForm = {
        id: t.id,
        at: t.at,
        question: question || undefined,
        ...(options?.length ? { options } : {}),
        kind: "question",
        session,
        born: t.at,
        ...formFacts({ questions: call.input?.questions }),
        restored: now,
      }
      if (!f.question) delete f.question
      addForm(session, f, dir)
      made.push(f)
      deps.say?.(`form ${f.id} of ${session}: the record was gone, the dialog is open (the call question is running) - the record is made again`)
    } catch (e) {
      deps.say?.(`form restore failed for ${session}: ${e}`)
    }
  }
  return made
}

// ---------------------------------------------------------------------------------------------------------------------
// A dead dialog without a record: the marker says "held", the call ended with an abort.
export type DeadDialog = { session: string; id: string }

/**
 * The answer names a form (or a tab) that has no record; its marker is "held" and its call died: the dialog hangs in the window and nobody can answer it.
 * `a` is the answer file (form id, session). Returns the form, or undefined (the old reason "no open question form" stands).
 */
export async function deadDialogOf(a: { form?: string; session?: string }, deps: RestoreDeps, now = Date.now(), dir = FORMS): Promise<DeadDialog | undefined> {
  const marks = jsonsIn(path.join(dir, "auto"))
    .map((f) => readJson<Mark>(f))
    .filter((m): m is Mark => !!m && m.state === "held" && !!m.session && (a.form ? m.id === a.form : a.session ? m.session === a.session : false) && (!a.session || m.session === a.session))
    .sort((x, y) => y.first - x.first)
  for (const m of marks) {
    const call = await deps.call(m.session)
    if (call.state !== "dead") continue
    if (fateOf({ id: m.id, at: m.first, born: m.first, ...(m.question ? { question: m.question } : {}) }, call) === "dead") return { session: m.session, id: m.id }
  }
  return undefined
}

/** The marker of a dead dialog stops counting as "left to the owner" (autoStats counts only "held" and "failed"): the owner has been told. */
export function closeDeadMark(id: string, why: string, now = Date.now(), dir = FORMS) {
  const file = path.join(dir, "auto", `${safeKey(id)}.json`)
  const m = readJson<Mark>(file)
  if (!m || m.state !== "held") return
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...m, state: "owner", why, at: now }, null, 1))
  renameSync(tmp, file)
}
