// Waiting for the owner by the built-in OpenCode questionnaire (task 026, step 1). The bus event form.created with
// metadata.kind "question" opens a wait, form.replied closes it. No model involved. Every event comes in copies
// (several windows, several subscriptions), so all writes are idempotent by form id.
//
// TASK 040: a question must not be lost silently. form.cancelled does NOT close the record (the owner pressed Esc, or the
// window went away): it starts a repeat. A record that is still open while the tab has no running turn (restart of the
// window or the service, an event that never came) is "lost": the tab is woken with the text and the options and asked to
// call `question` again - at most FORM_MAX_REPEATS times, FORM_REPEAT_GAP_MS apart; then the record says "no answer, the
// owner is needed" and nothing wakes the tab any more. The plugin NEVER answers for the owner and never picks the
// recommended option: it only repeats the question and shows who is waiting (/ask, the summary line, notices).
//
// TASK 080: a repeat is made only for a LOST question: the turn is not alive (a `question` tool still pending in the database counts as alive,
// index.ts) and no message stands in the queue of the server (queue-gate.ts); the letter is also held by the gate of the delivery.
//
// TASK 078: a tab that keeps asking after the owner answered (answer-loop.ts) is not woken any more: a form of such a tab is not repeated
// and its reminders to the owner say "loop".
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { CARDS, readJson, safeKey } from "./core.ts"
import { loopLine, loopNote, loopOf, LOOP_HINT, noteAsk } from "./answer-loop.ts"
import { clearGate, GATE_MARK } from "./gate-stop.ts"
import { BASE } from "./paths.ts"

export const FORMS = path.join(BASE, "forms")
export const FORM_TTL_MS = 12 * 3_600_000

/** Repeats of a lost question (the times can be shortened by CREW_HARNESS_FORM_*_MS, for self-tests), the pause between them, the reminder of the owner, the time a tab must be quiet before the
 *  question counts as gone, and the time the windows get to recover after a restart of the service. */
export const FORM_MAX_REPEATS = 3
export const FORM_REPEAT_GAP_MS = Number(process.env.CREW_HARNESS_FORM_REPEAT_GAP_MS) || 2 * 60_000
export const FORM_REMIND_MS = Number(process.env.CREW_HARNESS_FORM_REMIND_MS) || 30 * 60_000
export const FORM_GONE_MS = Number(process.env.CREW_HARNESS_FORM_GONE_MS) || 20_000
/** TASK 069: a question closed WITHOUT an answer (Esc, a window that took the keys) is known at once from form.cancelled, so the tab waits only for the end of
 *  its turn (FORM_CANCEL_GONE_MS) and not for the long time of a question that vanished unseen; while such a question waits to be returned the service looks
 *  every FORM_HOT_LOOK_MS instead of the usual time. */
export const FORM_CANCEL_GONE_MS = Number(process.env.CREW_HARNESS_FORM_CANCEL_GONE_MS) || 3_000
export const FORM_HOT_LOOK_MS = 1_000
export const FORM_RESTART_GRACE_MS = Number(process.env.CREW_HARNESS_FORM_RESTART_GRACE_MS) || 3 * 60_000
/** A model request this soon after the question is the question itself, not a new turn. */
const FORM_SELF_MS = 3_000

export type PendingForm = {
  id: string
  at: number
  title?: string
  question?: string
  kind?: string
  session?: string
  options?: string[]
  /** the id of the first form of this question: the repeats keep the identity (ids of the wake letters) */
  rid?: string
  /** form.cancelled seen at this time */
  cancelled?: number
  /** wakes sent so far and the time of the last one */
  repeats?: number
  wokeAt?: number
  /** the repeats are used up: "no answer, the owner is needed" */
  exhausted?: number
  /** the owner was last reminded at this time (notice in the windows) */
  notifiedAt?: number
  /** task 071: the tab asked the same question (same text and options) with this newer form: this one is history, not an open question */
  replacedBy?: string
  replacedAt?: number
  /** task 073: set only when the tab did not repeat the words: the old form was in the repeat and the new one has the same options */
  replacedReason?: string
}

/** Task 073: the reason written on a form replaced by a new form with the same options (other words) while it was in the repeat. */
export const REPLACED_REPEAT = "повтор тем же набором вариантов"

const fileOf = (session: string, dir = FORMS) => path.join(dir, `${safeKey(session)}.json`)

function save(file: string, list: PendingForm[]) {
  if (!list.length) return void rmSync(file, { force: true })
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(list))
  renameSync(tmp, file)
}

export function addForm(session: string, f: PendingForm, dir = FORMS) {
  const file = fileOf(session, dir)
  const list = readJson<PendingForm[]>(file) ?? []
  if (list.some((x) => x.id === f.id)) return
  save(file, [...list, f])
  // вопрос владельцу открыт: остановка на воротах без вопроса (задача 062) кончилась
  if (dir === FORMS) clearGate(session)
}

/** Returns the sessions whose record was removed (the record names its session; the event of a reply may not). */
export function removeForm(session: string | undefined, id: string, dir = FORMS): string[] {
  const files = session ? [fileOf(session, dir)] : existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n)) : []
  const out: string[] = []
  for (const file of files) {
    const list = readJson<PendingForm[]>(file) ?? []
    const hit = list.find((x) => x.id === id)
    if (!hit) continue
    save(file, list.filter((x) => x.id !== id))
    const s = hit.session ?? session
    if (s) out.push(s)
  }
  return out
}

/** Change one record in place (by id; the session is known or searched in all files). Returns the record after the change. */
export function updateForm(session: string | undefined, id: string, patch: (f: PendingForm) => void, dir = FORMS): PendingForm | undefined {
  const files = session ? [fileOf(session, dir)] : existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n)) : []
  for (const file of files) {
    const list = readJson<PendingForm[]>(file) ?? []
    const f = list.find((x) => x.id === id)
    if (!f) continue
    patch(f)
    save(file, list)
    return f
  }
  return undefined
}

export function pendingForms(session: string, now = Date.now(), dir = FORMS): PendingForm[] {
  const list = readJson<PendingForm[]>(fileOf(session, dir))
  return Array.isArray(list) ? list.filter((f) => f && typeof f.at === "number" && now - f.at < FORM_TTL_MS && !f.replacedBy) : []
}

/** Setup: drop wait files whose forms are all stale. */
export function cleanupForms(now = Date.now(), dir = FORMS) {
  try {
    if (!existsSync(dir)) return
    for (const n of readdirSync(dir)) {
      const file = path.join(dir, n)
      if (!n.endsWith(".json")) continue
      const list = readJson<PendingForm[]>(file)
      const fresh = Array.isArray(list) ? list.filter((f) => f && typeof f.at === "number" && now - f.at < FORM_TTL_MS) : []
      if (!Array.isArray(list) || fresh.length !== list.length) save(file, fresh)
    }
  } catch {}
}

// the text of the first question among the form fields. The built-in questionnaire turns a question into a field with
// title = header and description = the question text (read from the OpenCode 2.0.26 binary, not yet seen live): the question
// text is preferred over the short header; other names are a fallback.
function firstQuestion(form: any): string | undefined {
  const seen = new Set<any>()
  const walk = (v: any, depth: number): string | undefined => {
    if (!v || typeof v !== "object" || depth > 4 || seen.has(v)) return undefined
    seen.add(v)
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x, depth + 1)
        if (r) return r
      }
      return undefined
    }
    for (const k of ["question", "description", "prompt", "text", "label", "title"]) if (typeof v[k] === "string" && v[k].trim()) return v[k]
    for (const k of ["fields", "questions", "items", "children"]) {
      const r = walk(v[k], depth + 1)
      if (r) return r
    }
    return undefined
  }
  const q = walk(form?.fields ?? form?.questions ?? form, 0)
  return q ? q.replace(/\s+/g, " ").trim().slice(0, 200) : undefined
}

function firstOptions(form: any): string[] | undefined {
  const seen = new Set<any>()
  const label = (o: any) => (typeof o === "string" ? o : typeof o?.label === "string" ? o.label : typeof o?.title === "string" ? o.title : typeof o?.name === "string" ? o.name : typeof o?.value === "string" ? o.value : "")
  const walk = (v: any, depth: number): string[] | undefined => {
    if (!v || typeof v !== "object" || depth > 4 || seen.has(v)) return undefined
    seen.add(v)
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x, depth + 1)
        if (r) return r
      }
      return undefined
    }
    for (const k of ["options", "choices", "enum"]) {
      if (Array.isArray(v[k])) {
        const list = v[k].map(label).map((x: string) => x.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 8)
        if (list.length) return list
      }
    }
    for (const k of ["fields", "questions", "items", "children"]) {
      const r = walk(v[k], depth + 1)
      if (r) return r
    }
    return undefined
  }
  return walk(form?.fields ?? form?.questions ?? form, 0)
}

const same = (a?: string, b?: string) => (a ?? "").replace(/\s+/g, " ").trim().toLowerCase() === (b ?? "").replace(/\s+/g, " ").trim().toLowerCase()

const norm = (t?: string) => (t ?? "").replace(/\s+/g, " ").trim().toLowerCase()

/** Task 071: what makes two forms of one tab "the same question": the text and the options, both, in the same order, compared
 *  without case and spacing. No text - no key (a form without a text is never taken for a repeat); nothing is guessed by closeness. */
export function formKey(question?: string, options?: string[], title?: string): string | undefined {
  const q = norm(question)
  // the text of the form header is the fallback of firstQuestion (no question field found): then the question is not known
  return q && q !== norm(title) ? `${q}\u0001${(options ?? []).map(norm).join("\u0002")}` : undefined
}

/** Task 073: the options as one key: labels in the same order, case and spacing ignored. No options - no key (a free-text question is never matched). */
const optsKey = (options?: string[]): string | undefined => (options && options.length ? options.map(norm).join("\u0002") : undefined)

/** Task 073: the plugin itself asked the tab to ask again (a wake was sent; an exhausted form had all of them). A form that was only cancelled is not yet: the tab has not been prompted. */
const inRepeat = (f: PendingForm) => (f.repeats ?? 0) > 0 || !!f.exhausted

/** Task 073: when the tab was first prompted. The record keeps only the last wake, so the first one is exact only for one wake; for more the Esc time (or the ask) is the bound. */
const firstWakeAt = (f: PendingForm) => ((f.repeats ?? 0) === 1 && f.wokeAt ? f.wokeAt : (f.cancelled ?? f.at))

/**
 * Task 073: is the old form `o` replaced by the form `n` of the same tab although the words differ? Yes, when `o` is in the repeat and `n`
 * was made after the tab was first prompted, with the same options (all labels, same order; at least one). Only in the repeat: there the
 * plugin itself pushed the tab to ask this question again, so a new form with the same options is the answer to that push.
 */
export function repeatedWith(o: PendingForm, n: { at: number; options?: string[] }): boolean {
  if (o.replacedBy || !inRepeat(o) || n.at <= firstWakeAt(o)) return false
  const k = optsKey(o.options)
  return k !== undefined && k === optsKey(n.options)
}

function markReplaced(session: string, id: string, by: string, now: number, dir = FORMS, reason?: string) {
  updateForm(session, id, (f) => {
    f.replacedBy = by
    f.replacedAt = now
    if (reason) f.replacedReason = reason
  }, dir)
}

/**
 * Task 071: forms that piled up before the rule (or whose event came in some other way): in every file, of the open forms with
 * the same question (formKey) only the newest stays, the older ones become "replaced" (the record stays as history). The order of
 * the list is the order of the asks. Returns what it closed; a second pass finds nothing.
 */
export function settleDuplicates(dir = FORMS, now = Date.now()): { session: string; id: string; by: string; reason?: string }[] {
  const out: { session: string; id: string; by: string; reason?: string }[] = []
  try {
    if (!existsSync(dir)) return out
    for (const n of readdirSync(dir)) {
      if (!n.endsWith(".json")) continue
      const file = path.join(dir, n)
      const list = readJson<PendingForm[]>(file)
      if (!Array.isArray(list)) continue
      const newest = new Map<string, PendingForm>()
      for (const f of list) {
        const key = f && !f.replacedBy ? formKey(f.question, f.options, f.title) : undefined
        if (key !== undefined) newest.set(key, f)
      }
      let changed = false
      for (const f of list) {
        const key = f && !f.replacedBy ? formKey(f.question, f.options, f.title) : undefined
        const last = key !== undefined ? newest.get(key) : undefined
        if (!last || last === f) continue
        f.replacedBy = last.id
        f.replacedAt = now
        out.push({ session: f.session ?? n.replace(/\.json$/, ""), id: f.id, by: last.id })
        changed = true
      }
      // task 073: a form in the repeat is replaced by the newest later form of the tab with the same options (other words)
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        if (!f || f.replacedBy) continue
        let by: PendingForm | undefined
        for (let j = list.length - 1; j > i && !by; j--) if (list[j] && repeatedWith(f, list[j])) by = list[j]
        if (!by) continue
        f.replacedBy = by.id
        f.replacedAt = now
        f.replacedReason = REPLACED_REPEAT
        out.push({ session: f.session ?? n.replace(/\.json$/, ""), id: f.id, by: by.id, reason: REPLACED_REPEAT })
        changed = true
      }
      if (changed) save(file, list)
    }
  } catch {}
  return out
}

/** onReplied: the owner answered the question of this session (task 052: the mark "stuck" of the tab goes at once). */
export function handleFormEvent(ev: any, now = Date.now(), dir = FORMS, onReplied?: (session: string) => void) {
  try {
    const e = ev?.event && typeof ev.event === "object" && ev.event.type ? ev.event : ev
    const type = String(e?.type ?? "")
    const body = e?.data ?? e?.properties ?? {}
    if (type === "form.created") {
      const form = body.form ?? body
      if (form?.metadata?.kind !== "question" || !form.id || !form.sessionID) return
      const session = String(form.sessionID)
      const question = firstQuestion(form)
      const options = firstOptions(form)
      const before = readJson<PendingForm[]>(fileOf(session, dir)) ?? []
      if (before.some((x) => x.id === String(form.id))) return // a copy of the event: nothing to do (an old copy must not replace a newer form)
      // the model repeats a lost question: the new form takes the record over and keeps the count (otherwise every repeat
      // would start from zero and the loop would never end)
      const old = before.find((x) => !x.replacedBy && (x.cancelled || x.repeats) && same(x.question, question))
      // task 071: the same question again (same text and options) - every older open form of it is replaced, the record stays as history
      const key = formKey(question, options, form.title)
      const strict = (x: PendingForm) => x === old || (key !== undefined && formKey(x.question, x.options, x.title) === key)
      // task 073: or the old form is in the repeat and this form has the same options (the tab found its own words)
      const stale = before.filter((x) => !x.replacedBy && (strict(x) || repeatedWith(x, { at: now, options })))
      // task 078: the loop counts the forms of a tab by the time they were made (the record may keep the older time of a repeated question)
      noteAsk(session, { id: String(form.id), at: now, question, options }, dir)
      addForm(
        session,
        {
          id: String(form.id),
          at: old?.at ?? now,
          title: form.title,
          question,
          ...(options ? { options } : {}),
          kind: "question",
          session,
          ...(old ? { rid: old.rid ?? old.id, repeats: old.repeats, wokeAt: old.wokeAt, notifiedAt: old.notifiedAt } : {}),
        },
        dir,
      )
      for (const x of stale) markReplaced(session, x.id, String(form.id), now, dir, strict(x) ? undefined : REPLACED_REPEAT)
    } else if (type === "form.replied") {
      const id = body.id ?? body.form?.id
      if (!id) return
      const sid = body.sessionID ?? body.form?.sessionID
      const sessions = removeForm(sid ? String(sid) : undefined, String(id), dir)
      if (onReplied) for (const s of new Set(sessions.length ? sessions : sid ? [String(sid)] : [])) onReplied(s)
    } else if (type === "form.cancelled") {
      // not an answer: the record stays and the repeat starts (formTick)
      const id = body.id ?? body.form?.id
      if (!id) return
      const sid = body.sessionID ?? body.form?.sessionID
      updateForm(sid ? String(sid) : undefined, String(id), (f) => void (f.cancelled ??= now), dir)
    }
  } catch {}
}

export async function startFormWait(ctx: any, log: (line: string) => void, onReplied?: (session: string) => void): Promise<void> {
  const handler = (ev: any) => handleFormEvent(ev, Date.now(), FORMS, onReplied)
  try {
    if (typeof ctx?.event?.subscribe !== "function") throw new Error("no ctx.event.subscribe")
    const r = await ctx.event.subscribe((ev: any) => handler(ev))
    const it = r?.stream ?? r
    if (it && typeof it[Symbol.asyncIterator] === "function") {
      void (async () => {
        try {
          for await (const ev of it) handler(ev)
        } catch (e) {
          log(`form wait: iterator ended: ${e}`)
        }
      })()
    }
    return
  } catch (e) {
    log(`form wait: event.subscribe unavailable (${e}), trying session.hook`)
  }
  try {
    if (typeof ctx?.session?.hook !== "function") throw new Error("no ctx.session.hook")
    await ctx.session.hook("event", (ev: any) => handler(ev?.event ?? ev))
  } catch (e) {
    log(`form wait: subscription failed (${e})`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// TASK 040. All records with their sessions (stale ones are not counted, the files are cleaned by cleanupForms).
export function allForms(now = Date.now(), dir = FORMS, replaced = false): { session: string; form: PendingForm }[] {
  const out: { session: string; form: PendingForm }[] = []
  try {
    if (!existsSync(dir)) return out
    for (const n of readdirSync(dir)) {
      if (!n.endsWith(".json")) continue
      const list = readJson<PendingForm[]>(path.join(dir, n))
      if (!Array.isArray(list)) continue
      for (const f of list) if (f && typeof f.at === "number" && now - f.at < FORM_TTL_MS && !!f.replacedBy === replaced) out.push({ session: f.session ?? n.replace(/\.json$/, ""), form: f })
    }
  } catch {}
  return out.sort((a, b) => a.form.at - b.form.at)
}

/** Task 071: the history - forms the tab replaced with a newer one (not open questions; an answer to them is refused with the new id). */
export const replacedForms = (now = Date.now(), dir = FORMS) => allForms(now, dir, true)

const hm = (t?: number) => (t ? new Date(t).toTimeString().slice(0, 5) : "?")
const lostState = (f: PendingForm) => !!(f.cancelled || f.repeats)

/** The text of the wake: the question and the options, as they were, and the order to call `question` again. */
export function repeatText(f: PendingForm, n: number): string {
  const q = f.question ?? f.title ?? "вопрос владельцу"
  const opts = f.options?.length ? `\nВарианты ответа:\n${f.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : ""
  return (
    `Ваш вопрос владельцу не получил ответа: окно или служба перезапускались, диалог закрыли без ответа или он пропал с экрана. Владелец его не видел. ` +
    `Задайте его заново инструментом question — тот же вопрос и те же варианты. Не отвечайте за владельца и не выбирайте вариант сами, даже рекомендованный: ждите его ответа. ` +
    `(Повтор ${n} из ${FORM_MAX_REPEATS}; после этого вопрос останется у владельца без новых напоминаний.)\n` +
    `Вопрос: «${q}»${opts}`
  )
}

export type FormDeps = {
  /** the start of the plugin process: the windows get FORM_RESTART_GRACE_MS after it to show their questions again */
  processStart: number
  /** is the tab open in a window (or a running task session) and does a turn run in it */
  tab(session: string): Promise<{ open: boolean; busy: boolean }>
  /** the last end of a turn (idle row) after `since`, with its outcome */
  idle(session: string, since: number): Promise<{ at: number; outcome?: string } | undefined>
  /** did the owner write in the tab after `since` */
  ownerWrote(session: string, since: number): Promise<boolean>
  /** send the service message to the tab; `id` is stable, so a copy of the call is the same letter */
  wake(session: string, text: string, id: string): void | Promise<void>
  /** task 080: how many messages stand in the queue of the server for the tab; a repeat is not made while any stands (the turn is about to start, the question may come back by itself) */
  queued?(session: string): Promise<number>
  say?(line: string): void
}

const goneSince = new Map<string, number>()
export const resetFormTick = () => goneSince.clear()

/** How soon the service must look at the records again: every `every` ms, but every FORM_HOT_LOOK_MS while a question cancelled without an answer has not yet been returned to its tab. */
export function formLookEvery(now = Date.now(), dir = FORMS, every = 5_000): number {
  return allForms(now, dir).some((x) => x.form.cancelled && !x.form.wokeAt && !x.form.exhausted) ? Math.min(every, FORM_HOT_LOOK_MS) : every
}

/**
 * One look at all open records. A record whose tab has no running turn for FORM_GONE_MS in a row (the question may still be
 * on the screen only while the turn runs: the tool waits for the answer) is lost: the tab is woken, at most
 * FORM_MAX_REPEATS times with FORM_REPEAT_GAP_MS between. Closed on the way: a succeeded turn ended after the question (it was
 * answered, the event was lost); the owner wrote in the tab. The first minutes after a start of the process are left to
 * the windows. A busy tab is never touched; a closed tab is not woken (the letter would only wait).
 */
export async function formTick(deps: FormDeps, now = Date.now(), dir = FORMS): Promise<void> {
  const say = deps.say ?? (() => {})
  for (const x of settleDuplicates(dir, now)) say(`form ${x.id} of ${x.session}: replaced by ${x.by} (${x.reason ?? "the same question asked again"})`)
  for (const { session, form: f } of allForms(now, dir)) {
    try {
      const key = `${session}/${f.id}`
      const tab = await deps.tab(session)
      if (tab.busy) {
        goneSince.delete(key)
        continue
      }
      if (!tab.open) continue
      const since = goneSince.get(key) ?? now
      if (!goneSince.has(key)) goneSince.set(key, now)
      if (now - since < (f.cancelled ? FORM_CANCEL_GONE_MS : FORM_GONE_MS)) continue
      if (lostState(f)) {
        if (await deps.ownerWrote(session, f.at)) {
          removeForm(session, f.id, dir)
          say(`form ${f.id} of ${session}: closed, the owner wrote in the tab`)
          continue
        }
      } else {
        const idle = await deps.idle(session, f.at)
        if (idle && idle.outcome !== "interrupted" && idle.outcome !== "failed") {
          removeForm(session, f.id, dir)
          say(`form ${f.id} of ${session}: closed, the turn ended after the question (answered, the event was lost)`)
          continue
        }
        if (f.at < deps.processStart && now - deps.processStart < FORM_RESTART_GRACE_MS) continue // the window may still show it
      }
      if (f.exhausted) continue
      // task 078: a tab in a loop on its question is not woken (its answers still reach it; the owner sees the loop)
      if (loopOf(session, dir)) continue
      // the first repeat of a cancelled form needs no pause (the owner just closed it); the others wait the gap
      const need = f.wokeAt ? FORM_REPEAT_GAP_MS : f.cancelled ? 0 : FORM_REPEAT_GAP_MS
      if (now - (f.wokeAt ?? f.cancelled ?? f.at) < need) continue
      if ((f.repeats ?? 0) >= FORM_MAX_REPEATS) {
        updateForm(session, f.id, (x) => ((x.exhausted = now), (x.notifiedAt = undefined)), dir)
        say(`form ${f.id} of ${session}: no answer after ${FORM_MAX_REPEATS} repeats, the owner is needed`)
        continue
      }
      // task 080: something stands in the queue of the server - the tab will have a turn without our repeat; no repeat is counted or made
      if (deps.queued && (await deps.queued(session)) > 0) continue
      const n = (f.repeats ?? 0) + 1
      const rid = f.rid ?? f.id
      updateForm(session, f.id, (x) => ((x.repeats = n), (x.wokeAt = now), (x.rid ??= rid)), dir)
      await deps.wake(session, repeatText(f, n), `form-repeat-${safeKey(rid)}-${n}`)
      say(`form ${f.id} of ${session}: repeat ${n} of ${FORM_MAX_REPEATS}`)
    } catch (e) {
      say(`form tick failed for ${session}: ${e}`)
    }
  }
}

/**
 * The tab made a model request. A question still on the screen has no new request (the tool waits), so a request after it
 * means the turn went on: the question was answered, or is dead. Closes the record - except a record that is already in the
 * repeat (cancelled, or woken): the next step of the model after Esc or after our wake is the same turn; those are closed by
 * the owner's word, a new form of the same text (takes over) or the TTL.
 */
export async function settleOnRequest(session: string, now: number, ownerWrote: (since: number) => Promise<boolean>, dir = FORMS): Promise<void> {
  for (const { form: f } of allForms(now, dir).filter((x) => x.session === session)) {
    if (now - f.at < FORM_SELF_MS) continue
    if (!lostState(f) || (await ownerWrote(f.at))) removeForm(session, f.id, dir)
  }
}

/**
 * Reminders: a notice at the first sight of an open record and then every FORM_REMIND_MS while it is open. `notify` shows the
 * notice and returns false when it reached nobody (no window): the time is not noted, the next call tries again.
 */
export function formReminders(now: number, notify: (session: string, f: PendingForm, message: string) => boolean | void, dir = FORMS, every = FORM_REMIND_MS): number {
  let sent = 0
  for (const { session, form: f } of allForms(now, dir)) {
    if (f.notifiedAt && now - f.notifiedAt < every) continue
    const q = f.question ?? f.title ?? "вопрос во встроенном вопроснике"
    const lp = loopOf(session, dir)
    const message = lp ? loopLine({ n: lp.n, question: q }) : f.exhausted ? `без ответа, нужен владелец: ${q}` : q
    if (notify(session, f, message) === false) continue
    updateForm(session, f.id, (x) => void (x.notifiedAt = now), dir)
    sent++
  }
  return sent
}

/** A tab that waits for the owner without a record in forms/: its turn ended with a question (status.ts, state "owner"). */
export type EndedWait = { session: string; project?: string; role: string; title: string; since?: number; question?: string; wait?: true; gate?: true }
/** The mark of a tab whose turn ended with a waiting phrase, not a question (task 056): the same as WAIT_MARK in status.ts
 *  (not imported: status.ts imports this module). */
const WAIT_MARK = "‖"

/** /ask: the open questions to the owner - project, tab, how long, text and options; `ended` - the tabs whose turn ended
 *  with a question (task 055: /ask names every tab that waits, not only the questionnaire ones). */
export function askText(now = Date.now(), dir = FORMS, ended: EndedWait[] = []): string {
  const list = allForms(now, dir)
  const more = ended.filter((e) => !list.some((x) => x.session === e.session))
  if (!list.length && !more.length) return "Открытых вопросов к вам нет."
  const first = Math.min(...list.map((x) => x.form.at), ...more.map((e) => e.since ?? Infinity))
  const out = [`Ждут вас: ${list.length + more.length}${Number.isFinite(first) ? ` · с ${hm(first)}` : ""}`, ""]
  const ago = (at: number) => {
    const m = Math.max(0, Math.round((now - at) / 60_000))
    return m < 120 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`
  }
  for (const e of more) {
    out.push(`${e.gate ? GATE_MARK : e.wait ? WAIT_MARK : "?"} ${e.project ?? "?"} · ${e.role}${e.title && e.title !== e.session ? ` «${e.title}»` : ""}${e.since ? ` — ${e.gate ? "ждёт вашего решения, вопроса нет," : e.wait ? "ждёт указаний" : "ждёт"} ${ago(e.since)} (с ${hm(e.since)})` : ""}`)
    if (e.question) out.push(`   ${e.question}`)
    out.push(`   Сессия ${e.session}: ${e.gate ? "остановилась на воротах без вопроса — откройте вкладку и спросите, что решить; плагин уже напомнил ей задать вопрос." : e.wait ? "ход кончился ожиданием ваших указаний — откройте вкладку и напишите, что дальше." : "ход кончился вопросом — откройте вкладку и ответьте."}`)
    out.push("")
  }
  for (const { session, form: f } of list) {
    const card = readJson<any>(path.join(CARDS, `${safeKey(session)}.json`))
    const who = `${card?.project ?? "?"} · ${card?.role ?? "?"}${card?.title && card.title !== session ? ` «${card.title}»` : ""}`
    const waited = Math.max(0, Math.round((now - f.at) / 60_000))
    const lp = loopOf(session, dir)
    const how = lp ? ` — вкладка зациклилась на вопросе (${loopNote(lp.n)}); ${LOOP_HINT}` : f.exhausted ? ` — без ответа, нужен владелец (повторов было ${f.repeats ?? 0})` : f.repeats ? ` — повтор ${f.repeats} из ${FORM_MAX_REPEATS}` : f.cancelled ? " — закрыт без ответа, будет повторён" : ""
    out.push(`? ${who} — ждёт ${waited < 120 ? `${waited} мин` : `${Math.floor(waited / 60)} ч ${waited % 60} мин`} (с ${hm(f.at)})${how}`)
    out.push(`   ${f.question ?? f.title ?? "вопрос во встроенном вопроснике"}`)
    if (f.options?.length) out.push(`   Варианты: ${f.options.join("; ")}`)
    out.push(`   Сессия ${session}: откройте вкладку и ответьте в диалоге; если диалога нет, вкладка получит повтор.`)
    out.push("")
  }
  return out.join("\n").trimEnd()
}
