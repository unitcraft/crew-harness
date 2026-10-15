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
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { CARDS, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

export const FORMS = path.join(BASE, "forms")
export const FORM_TTL_MS = 12 * 3_600_000

/** Repeats of a lost question (the times can be shortened by CREW_HARNESS_FORM_*_MS, for self-tests), the pause between them, the reminder of the owner, the time a tab must be quiet before the
 *  question counts as gone, and the time the windows get to recover after a restart of the service. */
export const FORM_MAX_REPEATS = 3
export const FORM_REPEAT_GAP_MS = Number(process.env.CREW_HARNESS_FORM_REPEAT_GAP_MS) || 2 * 60_000
export const FORM_REMIND_MS = Number(process.env.CREW_HARNESS_FORM_REMIND_MS) || 30 * 60_000
export const FORM_GONE_MS = Number(process.env.CREW_HARNESS_FORM_GONE_MS) || 20_000
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
}

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
}

export function removeForm(session: string | undefined, id: string, dir = FORMS) {
  const files = session ? [fileOf(session, dir)] : existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n)) : []
  for (const file of files) {
    const list = readJson<PendingForm[]>(file) ?? []
    if (list.some((x) => x.id === id)) save(file, list.filter((x) => x.id !== id))
  }
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
  return Array.isArray(list) ? list.filter((f) => f && typeof f.at === "number" && now - f.at < FORM_TTL_MS) : []
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

export function handleFormEvent(ev: any, now = Date.now(), dir = FORMS) {
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
      // the model repeats a lost question: the new form takes the record over and keeps the count (otherwise every repeat
      // would start from zero and the loop would never end)
      const old = (readJson<PendingForm[]>(fileOf(session, dir)) ?? []).find((x) => x.id !== String(form.id) && (x.cancelled || x.repeats) && same(x.question, question))
      if (old) removeForm(session, old.id, dir)
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
    } else if (type === "form.replied") {
      const id = body.id ?? body.form?.id
      if (!id) return
      const sid = body.sessionID ?? body.form?.sessionID
      removeForm(sid ? String(sid) : undefined, String(id), dir)
    } else if (type === "form.cancelled") {
      // not an answer: the record stays and the repeat starts (formTick)
      const id = body.id ?? body.form?.id
      if (!id) return
      const sid = body.sessionID ?? body.form?.sessionID
      updateForm(sid ? String(sid) : undefined, String(id), (f) => void (f.cancelled ??= now), dir)
    }
  } catch {}
}

export async function startFormWait(ctx: any, log: (line: string) => void): Promise<void> {
  const handler = (ev: any) => handleFormEvent(ev)
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
export function allForms(now = Date.now(), dir = FORMS): { session: string; form: PendingForm }[] {
  const out: { session: string; form: PendingForm }[] = []
  try {
    if (!existsSync(dir)) return out
    for (const n of readdirSync(dir)) {
      if (!n.endsWith(".json")) continue
      const list = readJson<PendingForm[]>(path.join(dir, n))
      if (!Array.isArray(list)) continue
      for (const f of list) if (f && typeof f.at === "number" && now - f.at < FORM_TTL_MS) out.push({ session: f.session ?? n.replace(/\.json$/, ""), form: f })
    }
  } catch {}
  return out.sort((a, b) => a.form.at - b.form.at)
}

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
  say?(line: string): void
}

const goneSince = new Map<string, number>()
export const resetFormTick = () => goneSince.clear()

/**
 * One look at all open records. A record whose tab has no running turn for FORM_GONE_MS in a row (the question may still be
 * on the screen only while the turn runs: the tool waits for the answer) is lost: the tab is woken, at most
 * FORM_MAX_REPEATS times with FORM_REPEAT_GAP_MS between. Closed on the way: a succeeded turn ended after the question (it was
 * answered, the event was lost); the owner wrote in the tab. The first minutes after a start of the process are left to
 * the windows. A busy tab is never touched; a closed tab is not woken (the letter would only wait).
 */
export async function formTick(deps: FormDeps, now = Date.now(), dir = FORMS): Promise<void> {
  const say = deps.say ?? (() => {})
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
      if (now - since < FORM_GONE_MS) continue
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
      // the first repeat of a cancelled form needs no pause (the owner just closed it); the others wait the gap
      const need = f.wokeAt ? FORM_REPEAT_GAP_MS : f.cancelled ? 0 : FORM_REPEAT_GAP_MS
      if (now - (f.wokeAt ?? f.cancelled ?? f.at) < need) continue
      if ((f.repeats ?? 0) >= FORM_MAX_REPEATS) {
        updateForm(session, f.id, (x) => ((x.exhausted = now), (x.notifiedAt = undefined)), dir)
        say(`form ${f.id} of ${session}: no answer after ${FORM_MAX_REPEATS} repeats, the owner is needed`)
        continue
      }
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
    const message = f.exhausted ? `без ответа, нужен владелец: ${q}` : q
    if (notify(session, f, message) === false) continue
    updateForm(session, f.id, (x) => void (x.notifiedAt = now), dir)
    sent++
  }
  return sent
}

/** /ask: the open questions to the owner - project, tab, how long, text and options. */
export function askText(now = Date.now(), dir = FORMS): string {
  const list = allForms(now, dir)
  if (!list.length) return "Открытых вопросов к вам нет."
  const out = [`Ждут вас: ${list.length} · с ${hm(list[0].form.at)}`, ""]
  for (const { session, form: f } of list) {
    const card = readJson<any>(path.join(CARDS, `${safeKey(session)}.json`))
    const who = `${card?.project ?? "?"} · ${card?.role ?? "?"}${card?.title && card.title !== session ? ` «${card.title}»` : ""}`
    const waited = Math.max(0, Math.round((now - f.at) / 60_000))
    const how = f.exhausted ? ` — без ответа, нужен владелец (повторов было ${f.repeats ?? 0})` : f.repeats ? ` — повтор ${f.repeats} из ${FORM_MAX_REPEATS}` : f.cancelled ? " — закрыт без ответа, будет повторён" : ""
    out.push(`▶ ${who} — ждёт ${waited < 120 ? `${waited} мин` : `${Math.floor(waited / 60)} ч ${waited % 60} мин`} (с ${hm(f.at)})${how}`)
    out.push(`   ${f.question ?? f.title ?? "вопрос во встроенном вопроснике"}`)
    if (f.options?.length) out.push(`   Варианты: ${f.options.join("; ")}`)
    out.push(`   Сессия ${session}: откройте вкладку и ответьте в диалоге; если диалога нет, вкладка получит повтор.`)
    out.push("")
  }
  return out.join("\n").trimEnd()
}
