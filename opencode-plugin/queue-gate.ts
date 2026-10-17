// SERVICE MESSAGES DO NOT PILE UP IN THE QUEUE OF THE SERVER BEHIND A WAITING QUESTION (task 080; owner, 2026-10-17, "по рекомендации", chat of
// the orchestrator, on open question #9). Source: the tab of task #94 (task 078, analysis.md). A turn with the `question` tool is held by the
// server for up to an hour; the plugin judged the tab idle and queued three repeats of "ask again" (delivery "queue"), and every end of such
// a turn got one more reminder "Не завершено". The server hands the model ONE queued message per turn, the oldest, so the queue stood at four
// messages for five hours and the letters with the owner's answers, at its tail, never reached the model.
// Two kinds of letters of the plugin:
//   service (reminders and repeats: they vanish when the reason is gone) - "Не завершено", the repeat of a lost question, the reminders about
//     idle time, a hung turn, a stop at a gate, cleanup and stalls, "continue" after a restart;
//   needed by the tab (letters of people and tabs, the answer of the owner, tasks, results of watches) - never held here.
// Rules (deliver in index.ts asks `verdict` for every service letter before it takes the letters; nudge asks `nudgeHold`):
//   1. while the tab has an open form of a question to the owner, no service letter goes into the queue (the letters wait in the mailbox of
//      the plugin). The only exception is the repeat of a LOST question: one at a time, never while the turn is alive (a `question` tool is
//      still pending in the database) and never while any message stands in the queue (a turn is about to start; the question may come back);
//   2. after the answer of the owner the letter with the answer goes first and alone: the service letters wait in the same pass, the
//      reminder "Не завершено" is not made until a working turn of the tab or until stall_minutes have passed;
//   3. a service letter of a kind that already stands in the queue is not queued again (a reminder or a repeat is dropped, the others wait).
// The facts are plain data (`Facts`), the verdict is a pure function: tested without a plugin, replayed on the record of a live tab.
import { type Letter, PLUGIN_SENDER, pendingTool, queuedTexts, safeKey } from "./core.ts"
import { lastAnswer } from "./answer-loop.ts"
import { pendingForms } from "./form-wait.ts"

export type ServiceKind = "nudge" | "form-repeat" | "idle" | "hung-resume" | "gate" | "stall" | "resume"

// The kind of a letter by its id (the plugin makes the ids): the reminder "Не завершено" is `<time>-nudge-<qid>`, the repeat of a lost question
// `form-repeat-<form>-<n>`, the reminders about idle time `idle-…`, a hung turn `hung-resume-…`, a stop at a gate `gate-…` / `wait-…`, a stall
// or a leftover `stall-…`, a task accepted but not cleaned up `stale-accepted-…`, "continue" after a restart or a failed turn `resume-…` / `retry-…`.
const BY_ID: [ServiceKind, RegExp][] = [
  ["nudge", /^\d+-nudge-/],
  ["form-repeat", /^form-repeat-/],
  ["idle", /^idle-/],
  ["hung-resume", /^hung-resume-/],
  ["gate", /^(gate|wait)-/],
  ["stall", /^(stall|stale-accepted)-/],
  ["resume", /^(resume|retry)-/],
]
/** The kinds whose second copy is dropped (the reason is stale as soon as the first is read); the others wait their turn (their number or episode is counted by the letters). */
const DROP_ON_DUP = new Set<ServiceKind>(["nudge", "form-repeat", "hung-resume"])

/** The service kind of a letter of the plugin; undefined for a letter of a person, a tab, the answer of the owner, a task. */
export function serviceKindOf(l: Pick<Letter, "id" | "from_session">): ServiceKind | undefined {
  if (l.from_session !== PLUGIN_SENDER) return undefined
  return BY_ID.find(([, re]) => re.test(l.id))?.[0]
}

export const isOwnerAnswer = (l: Pick<Letter, "id">) => l.id.startsWith("owner-answer-")

// The kind of a message that STANDS in the queue, by the first line of its body (the plugin writes `⚙  HH:MM · crew → … (служебное, не отвечай)` over every
// service letter; a letter of a person never has this mark, so a person's quote of "Не завершено" is no reminder).
const BY_TEXT: [ServiceKind, RegExp][] = [
  ["nudge", /^Не завершено: /],
  ["form-repeat", /^Ваш вопрос владельцу не получил ответа/],
  ["hung-resume", /^Ход завис и прерван плагином/],
  ["resume", /^(Работа прервана перезапуском OpenCode|Прошлый ход \()/],
  ["idle", /^Ты простаиваешь \d+ мин:/],
  ["gate", /^(Ты остановился на воротах без вопроса|Ты ждёшь решения владельца, но вопроса нет)/],
]
export function kindsOfTexts(texts: string[]): ServiceKind[] {
  const out = new Set<ServiceKind>()
  for (const t of texts)
    for (const m of t.matchAll(/\(служебное, не отвечай\)\n([^\n]*)/g)) {
      const hit = BY_TEXT.find(([, re]) => re.test(m[1]))
      if (hit) out.add(hit[0])
    }
  return [...out]
}

/** The id of the form a repeat letter is about (the record keeps `rid`, the id of the first form of the question). */
const repeatRid = (id: string) => /^form-repeat-(.+)-\d+$/.exec(id)?.[1]

export type Facts = {
  /** the tab has an open form of a question to the owner */
  formOpen: boolean
  /** the forms (rid, as in the id of a repeat letter) that are open */
  repeatRids: string[]
  /** the kinds of service messages that stand in the queue of the server */
  standing: ServiceKind[]
  /** how many messages stand in the queue of the server */
  queueRows: number
  /** the pass takes the letter with the answer of the owner */
  answerPass: boolean
  /** a `question` tool of the tab is still pending in the database: the turn is alive */
  livePending: boolean
}

export type Verdict = "send" | "hold" | "drop"

/** What to do with one letter. `send` - into the queue now; `hold` - leave it in the mailbox for a later pass; `drop` - the reason is stale, the letter is read. */
export function verdict(l: Pick<Letter, "id" | "from_session">, f: Facts): Verdict {
  const kind = serviceKindOf(l)
  if (!kind) return "send"
  if (kind === "form-repeat") {
    const rid = repeatRid(l.id)
    if (!rid || !f.repeatRids.includes(rid)) return "drop" // the question is answered, replaced or gone: nothing to repeat
    return f.livePending || f.queueRows > 0 || f.standing.includes(kind) ? "hold" : "send"
  }
  if (f.standing.includes(kind)) return DROP_ON_DUP.has(kind) ? "drop" : "hold"
  if (f.formOpen || f.answerPass) return "hold"
  return "send"
}

/** The verdicts for the letters of one pass, in order; of two service letters of one kind in the pass only the first goes. */
export function verdicts(letters: Letter[], f: Facts): Map<string, Verdict> {
  const out = new Map<string, Verdict>()
  const sent = new Set<ServiceKind>()
  for (const l of letters) {
    let v = verdict(l, f)
    const k = serviceKindOf(l)
    if (v === "send" && k) {
      if (sent.has(k)) v = DROP_ON_DUP.has(k) ? "drop" : "hold"
      else sent.add(k)
    }
    out.set(l.id, v)
  }
  return out
}

/** Read the facts of a tab (forms/ records, the queue of the server, the database). */
export async function factsOf(session: string, o: { answerPass?: boolean; now?: number } = {}): Promise<Facts> {
  const forms = pendingForms(session, o.now ?? Date.now())
  const rows = await queuedTexts(session)
  return {
    formOpen: forms.length > 0,
    repeatRids: forms.map((f) => safeKey(f.rid ?? f.id)),
    standing: kindsOfTexts(rows),
    queueRows: rows.length,
    answerPass: !!o.answerPass,
    livePending: forms.length > 0 ? await pendingTool(session) : false,
  }
}

/**
 * May the reminder "Не завершено" be made now? Returns the reason it must wait, or undefined. Before the letter is made, so that the counters
 * of the obligation (empty turns, reminders) do not grow while the reminder waits.
 */
export async function nudgeHold(session: string, o: { now: number; stallMs: number; worked(since: number): Promise<boolean> }): Promise<string | undefined> {
  if (pendingForms(session, o.now).length) return "a question to the owner is open"
  const a = lastAnswer(session)
  if (a) {
    const at = a.delivered ?? a.answered
    if (o.now - at < o.stallMs && !(await o.worked(at))) return "the answer of the owner was just handed to the tab and no working turn followed"
  }
  if (kindsOfTexts(await queuedTexts(session)).includes("nudge")) return "a reminder already stands in the queue"
  return undefined
}
