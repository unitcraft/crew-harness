// Waiting for the owner by the built-in OpenCode questionnaire (task 026, step 1). The bus event form.created with
// metadata.kind "question" opens a wait, form.replied / form.cancelled close it. No model involved. Every event comes
// in copies (several windows, several subscriptions), so all writes are idempotent by form id.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

export const FORMS = path.join(BASE, "forms")
export const FORM_TTL_MS = 12 * 3_600_000

export type PendingForm = { id: string; at: number; title?: string; question?: string; kind?: string }

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

export function handleFormEvent(ev: any, now = Date.now(), dir = FORMS) {
  try {
    const e = ev?.event && typeof ev.event === "object" && ev.event.type ? ev.event : ev
    const type = String(e?.type ?? "")
    const body = e?.data ?? e?.properties ?? {}
    if (type === "form.created") {
      const form = body.form ?? body
      if (form?.metadata?.kind !== "question" || !form.id || !form.sessionID) return
      addForm(String(form.sessionID), { id: String(form.id), at: now, title: form.title, question: firstQuestion(form), kind: "question" }, dir)
    } else if (type === "form.replied" || type === "form.cancelled") {
      const id = body.id ?? body.form?.id
      if (!id) return
      const sid = body.sessionID ?? body.form?.sessionID
      removeForm(sid ? String(sid) : undefined, String(id), dir)
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
