// A TAB THAT ASKS AGAIN AFTER THE OWNER ANSWERED (task 078; owner, 2026-10-17, "по рекомендации", chat of the orchestrator).
// Source: the tab of task #94 asked the owner the same question again and again, though the owner answered it four times from outside
// the window (crew-answer, task 059). The model got old service messages from the queue of the OpenCode server, one per turn, and the
// letters with the answers stood at the tail; every old message made it call `question` again. The plugin cannot see that queue, so it
// counts what it can see and what is certain:
//   a form of the tab made AFTER a letter with the owner's answer was handed to the tab, with NO working turn in between (a tool
//   call other than `question`), and the same ask as the form that was answered. The third such form in a row opens the LOOP.
// While the loop is open: the reminders "Не завершено" and the repeats of a lost question stop (the answers of the owner still reach
// the tab), the owner sees ONE row (state owner, the mark ↻, the counter `loop` in /crew, a line in /ask), the author of the task gets
// ONE letter. The loop is cleared by a working turn of the tab, a word of the owner in the tab, a reassigned or closed task, a closed tab.
// Store: forms/loops/<session>.json = { session, asks: [the last forms with what became of them], loop? }. The store knows nothing about
// turns or windows (dependencies are passed in), so the pure rules are tested without a plugin.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

/** Forms in a row, each made after a delivered answer to the previous one, that make a loop. */
export const LOOP_AFTER = 3
/** The mark of a tab in a loop (next to MARK, WAIT_MARK, GATE_MARK, IDLE_MARK in status.ts; tasks 055, 056, 062, 063): one column. */
export const LOOP_MARK = "↻"
/** The word of the counter in /crew (the screen is English since task 077). */
export const LOOP_WORD = "loop"
const KEEP_ASKS = 12
/** A record with no loop whose last form is older than this is forgotten. */
const LOOP_FORGET_MS = 24 * 3_600_000
const FORMS_DIR = path.join(BASE, "forms")

/** One form of the tab as the loop sees it. */
export type Ask = {
  form: string
  at: number
  question?: string
  options?: string[]
  /** the owner answered from outside the window: when the plugin applied it, and the id of the letter with the answer */
  answered?: number
  letter?: string
  /** the letter with the answer was handed to the tab (the server took it) at this time */
  delivered?: number
  /** this form is the same ask as the previous one, asked after the delivered answer, with no working turn between (decided once) */
  link?: boolean
}
export type Loop = {
  since: number
  /** how many answers were given in the chain */
  n: number
  question: string
  options?: string[]
  forms: string[]
  /** the task of the tab when the loop opened (the author is told by it; a changed executor clears the loop) */
  task?: { project: string; n: number }
  /** the author was told at this time */
  told?: number
}
export type LoopState = { session: string; asks: Ask[]; loop?: Loop }

const dirOf = (formsDir: string) => path.join(formsDir, "loops")
const fileOf = (session: string, formsDir: string) => path.join(dirOf(formsDir), `${safeKey(session)}.json`)

function save(st: LoopState, formsDir: string) {
  const file = fileOf(st.session, formsDir)
  if (!st.asks.length && !st.loop) return void rmSync(file, { force: true })
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(st))
  renameSync(tmp, file)
}
const load = (session: string, formsDir: string): LoopState => {
  const st = readJson<LoopState>(fileOf(session, formsDir))
  return st && Array.isArray(st.asks) ? st : { session, asks: [] }
}
function change(session: string, formsDir: string, patch: (st: LoopState) => boolean | void) {
  const st = load(session, formsDir)
  if (patch(st) === false) return
  st.asks = st.asks.slice(-KEEP_ASKS)
  save(st, formsDir)
}

// ---------------------------------------------------------------------------------------------------------------------
// The same ask. Task 071 took "text and options"; task 073 "the same options". Here the labels may drift (the live case: "Разрешить
// Phase 1 (Recommended)" became "Разрешить (Recommended)" in the fourth form), so a label that is a whole-word prefix of the other
// counts as the same label. Texts are not compared when both forms have options: the model rewrites the words every time.
const norm = (t?: string) => (t ?? "").replace(/\s+/g, " ").trim().toLowerCase()
const label = (t: string) => norm(t.replace(/\(\s*(recommended|рекомендуется)\s*\)/gi, ""))
const wordPrefix = (a: string, b: string) => a.length > 0 && b.startsWith(a) && !/[\p{L}\p{N}]/u.test(b[a.length] ?? "")
const sameLabel = (a: string, b: string) => a === b || wordPrefix(a, b) || wordPrefix(b, a)

/** Are the two forms one ask: the same number of options with the same labels in the same order (a label may be a whole-word prefix of
 *  the other), or, with no options on both, the same text. A form with no text and no options is no ask. */
export function sameAsk(a: { question?: string; options?: string[] }, b: { question?: string; options?: string[] }): boolean {
  const oa = (a.options ?? []).map(label).filter(Boolean)
  const ob = (b.options ?? []).map(label).filter(Boolean)
  if (oa.length || ob.length) return oa.length === ob.length && oa.every((x, i) => sameLabel(x, ob[i]))
  const qa = norm(a.question)
  return !!qa && qa === norm(b.question)
}

// ---------------------------------------------------------------------------------------------------------------------
// Records. All idempotent: copies of the events and repeated passes change nothing.

/** The tab made a form (form.created, form-wait.ts). */
export function noteAsk(session: string, f: { id: string; at: number; question?: string; options?: string[] }, formsDir = FORMS_DIR) {
  try {
    change(session, formsDir, (st) => {
      if (st.asks.some((x) => x.form === f.id)) return false
      st.asks.push({ form: f.id, at: f.at, ...(f.question ? { question: f.question } : {}), ...(f.options?.length ? { options: f.options } : {}) })
      st.asks.sort((x, y) => x.at - y.at)
    })
  } catch {}
}

/** The owner's answer to the form was applied from outside the window and its letter is about to be posted (owner-answer.ts). */
export function noteAnswered(session: string, f: { id: string; at: number; question?: string; options?: string[] }, letter: string, at: number, formsDir = FORMS_DIR) {
  try {
    change(session, formsDir, (st) => {
      let ask = st.asks.find((x) => x.form === f.id)
      if (!ask) {
        // a form made before this rule, or whose event was missed: the answer brings what it knows
        ask = { form: f.id, at: f.at, ...(f.question ? { question: f.question } : {}), ...(f.options?.length ? { options: f.options } : {}) }
        st.asks.push(ask)
        st.asks.sort((x, y) => x.at - y.at)
      }
      ask.answered = at
      ask.letter = letter
    })
  } catch {}
}

/** The letter `letter` reached the tab (the server took it: index.ts, after the two-step delivery). Letters of other kinds change nothing. */
export function noteDelivered(session: string, letter: string, at: number, formsDir = FORMS_DIR) {
  if (!letter.startsWith("owner-answer-")) return
  try {
    change(session, formsDir, (st) => {
      const ask = st.asks.find((x) => x.letter === letter)
      if (!ask || ask.delivered) return false
      ask.delivered = at
    })
  } catch {}
}

/** Task 080: the last answer of the owner from outside the window that the plugin handed to the tab: when it was applied and, if the server
 *  took the letter, when. The reminders "Не завершено" wait for a working turn after it (queue-gate.ts). */
export function lastAnswer(session: string, formsDir = FORMS_DIR): { answered: number; delivered?: number } | undefined {
  const st = readJson<LoopState>(fileOf(session, formsDir))
  const a = st && Array.isArray(st.asks) ? [...st.asks].reverse().find((x) => x.answered) : undefined
  return a?.answered ? { answered: a.answered, ...(a.delivered ? { delivered: a.delivered } : {}) } : undefined
}

/** The open loop of the tab (sync: status.ts, nudge, formTick read it). */
export function loopOf(session: string, formsDir = FORMS_DIR): Loop | undefined {
  const st = readJson<LoopState>(fileOf(session, formsDir))
  return st?.loop
}

/** All open loops: { session, loop }. */
export function openLoops(formsDir = FORMS_DIR): { session: string; loop: Loop }[] {
  const out: { session: string; loop: Loop }[] = []
  try {
    const dir = dirOf(formsDir)
    if (!existsSync(dir)) return out
    for (const n of readdirSync(dir)) {
      if (!n.endsWith(".json")) continue
      const st = readJson<LoopState>(path.join(dir, n))
      if (st?.loop) out.push({ session: st.session, loop: st.loop })
    }
  } catch {}
  return out
}

export function clearLoop(session: string, why: string, formsDir = FORMS_DIR, say?: (line: string) => void): boolean {
  let cleared = false
  try {
    change(session, formsDir, (st) => {
      if (!st.loop) return false
      st.loop = undefined
      st.asks = [] // a new chain starts from the next form
      cleared = true
    })
  } catch {}
  if (cleared) say?.(`loop of ${session} cleared: ${why}`)
  return cleared
}

// ---------------------------------------------------------------------------------------------------------------------
// Texts.
const times = (n: number) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "раза" : "раз"}`
/** "ответ дан 3 раза". */
export const loopNote = (n: number) => `ответ дан ${times(n)}`
/** The row of the owner: "вкладка зациклилась на вопросе: <вопрос> (ответ дан N раз)". */
export const loopLine = (l: Pick<Loop, "n" | "question">) => `вкладка зациклилась на вопросе: ${l.question} (${loopNote(l.n)})`
/** The way out the owner is offered. */
export const LOOP_HINT = "переназначьте задачу (crew_task reassign) или напишите вкладке прямо"
/** The one letter to the author of the task. */
export const loopLetter = (a: { who: string; session: string; loop: Pick<Loop, "n" | "question">; task?: string }) =>
  `Исполнитель зациклился на вопросе, владелец ответил ${times(a.loop.n)}: вкладка ${a.who} (сессия ${a.session}) после каждого доставленного ответа снова задаёт «${a.loop.question}» и не работает. ` +
  `Напоминаний ей больше нет; ответы владельца ей по-прежнему приходят. Переназначь задачу с ответом владельца в цели` +
  (a.task ? `: crew_task {action: "reassign", n: ${a.task}, text: "<ответ владельца и что делать дальше>"}.` : ".")

// ---------------------------------------------------------------------------------------------------------------------
export type LoopDeps = {
  /** a working turn in the tab between the two times: a tool call other than `question` */
  worked(session: string, since: number, until?: number): Promise<boolean>
  /** did the owner write in the tab after `since` */
  ownerWrote(session: string, since: number): Promise<boolean>
  /** is the tab open (in a window, or a session of an open task) */
  alive(session: string): boolean | Promise<boolean>
  /** the task the tab holds as its executor now (undefined: none) */
  task(session: string): { project: string; n: number } | undefined
  /** the author is told once: the loop just opened */
  tell(session: string, loop: Loop): void | Promise<void>
  say?(line: string): void
}

/**
 * One look at the loops of all tabs: records the links of the chains, opens a loop on the third, clears loops that ended. A loop is
 * counted only after the letter with the answer was delivered; a form made before that, or after a working turn, or with another ask,
 * is no link. Returns the sessions whose loop opened.
 */
export async function loopTick(deps: LoopDeps, now = Date.now(), formsDir = FORMS_DIR): Promise<string[]> {
  const opened: string[] = []
  const dir = dirOf(formsDir)
  if (!existsSync(dir)) return opened
  const say = deps.say ?? (() => {})
  for (const n of readdirSync(dir)) {
    if (!n.endsWith(".json")) continue
    try {
      const snap = readJson<LoopState>(path.join(dir, n))
      if (!snap || !Array.isArray(snap.asks)) continue
      const session = snap.session
      // 1. a loop that ended
      if (snap.loop) {
        const lp = snap.loop
        const task = deps.task(session)
        const why = !(await deps.alive(session))
          ? "the tab is closed"
          : lp.task && (!task || task.project !== lp.task.project || task.n !== lp.task.n)
            ? "the task of the tab changed"
            : (await deps.ownerWrote(session, lp.since))
              ? "the owner wrote in the tab"
              : (await deps.worked(session, lp.since))
                ? "a working turn of the tab"
                : undefined
        if (why) {
          clearLoop(session, why, formsDir, say)
          continue
        }
      } else if (!snap.asks.length || now - snap.asks[snap.asks.length - 1].at > LOOP_FORGET_MS) {
        if (!snap.asks.length || !snap.asks.some((a) => a.answered && !a.delivered)) rmSync(path.join(dir, n), { force: true })
        continue
      }
      // 2. the links: a form made after the delivered answer to the previous one, the same ask, no working turn between
      const view = snap.asks.map((a) => ({ ...a }))
      const links = new Map<string, boolean>()
      for (let i = 1; i < view.length; i++) {
        const prev = view[i - 1]
        const cur = view[i]
        if (cur.link !== undefined) continue
        if (!prev.answered) cur.link = false
        else if (!prev.delivered) continue // the answer is not delivered yet: decided when it is (then this form was made before it: no link)
        else cur.link = cur.at > prev.delivered && sameAsk(prev, cur) && !(await deps.worked(session, prev.delivered, cur.at))
        links.set(cur.form, cur.link)
      }
      let run = 0
      for (let i = view.length - 1; i >= 1 && view[i].link === true; i--) run++
      let open: Loop | undefined
      let grow: { n: number; question: string; forms: string[] } | undefined
      const last = view[view.length - 1]
      if (run >= LOOP_AFTER && last) {
        const chain = view.slice(view.length - 1 - run)
        const question = last.question ?? chain[0].question ?? "вопрос"
        if (!snap.loop) {
          const task = deps.task(session)
          open = { since: now, n: run, question, ...(last.options?.length ? { options: last.options } : {}), forms: chain.map((a) => a.form), ...(task ? { task } : {}) }
          say(`loop of ${session}: ${run} forms in a row after delivered answers (${chain.map((a) => a.form).join(", ")})`)
        } else if (run > snap.loop.n || snap.loop.question !== question) grow = { n: Math.max(run, snap.loop.n), question, forms: chain.map((a) => a.form) }
      }
      // the patch goes onto the fresh record: a form or a delivery may have been noted while the database was read
      if (links.size || open || grow)
        change(session, formsDir, (cur) => {
          for (const a of cur.asks) {
            const l = links.get(a.form)
            if (l !== undefined && a.link === undefined) a.link = l
          }
          if (open && !cur.loop) cur.loop = open
          else if (grow && cur.loop) Object.assign(cur.loop, grow)
        })
      if (open) opened.push(session)
      const lp = loopOf(session, formsDir)
      if (lp && !lp.told) {
        try {
          await deps.tell(session, lp)
        } catch (e) {
          say(`loop of ${session}: the author was not told: ${e}`)
        }
        change(session, formsDir, (cur) => (cur.loop ? void (cur.loop.told = now) : false))
      }
    } catch (e) {
      deps.say?.(`loop tick failed for ${n}: ${e}`)
    }
  }
  return opened
}
