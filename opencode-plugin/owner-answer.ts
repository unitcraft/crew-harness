// ОТВЕТ ВЛАДЕЛЬЦА НА ВОПРОСНИК СНАРУЖИ ОКНА (задача 059; владелец, 2026-10-15: «заводи 059», путь 2 — «по рекомендации»).
// OpenCode 2.0.26 не даёт плагину ответить на форму (в контексте плагина нет form.reply, см. analysis.md задачи 059), поэтому
// вопросник закрывается не ответом, а прерыванием хода (ctx.session.interrupt, как в задаче 048), а ответ владельца приходит
// вкладке письмом. Вход — файл в папке ANSWERS (кладёт scripts/crew-answer.mjs по слову владельца в чате оркестратора).
// Плагин на проходе (answerTick): форма ещё открыта → снимает запись forms/ как отвеченную (повтор задачи 040 не сработает),
// прерывает ход, кладёт письмо, пишет журнал и историю задачи; итог — в самом файле-ответе (status applied | refused, why).
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { noteAnswered } from "./answer-loop.ts"
import { type QuestionCall, readJson } from "./core.ts"
import { DEAD_WHY, FORMS, type PendingForm, addForm, allForms, removeForm, replacedForms, settleDuplicates } from "./form-wait.ts"
import { closeDeadMark, deadDialogOf } from "./form-restore.ts"
import { autoLetter, autoNote } from "./form-auto.ts"
import { BASE } from "./paths.ts"

export const ANSWERS = path.join(BASE, "answers")

/** Файл-ответ. Пишет скрипт (без status); плагин дописывает status, why, done. */
export type OwnerAnswer = {
  id: string
  at: number
  /** id формы (frm_…) или сессия вкладки; скрипт ставит оба, если нашёл */
  form?: string
  session?: string
  /** вариант: номер (с 1) или подпись */
  option?: string
  /** свой текст владельца вместо варианта */
  text?: string
  /** цитата слова владельца из чата оркестратора */
  quote: string
  /** applying — запись об ответе сделана и форма взята, но шаги доставки ещё не все выполнены (задача 096: после перезапуска они достраиваются) */
  status?: "applying" | "applied" | "refused"
  why?: string
  done?: number
  /** что передано вкладке */
  answer?: string
  /** задача 096: ответ положил плагин по настройке answer_mode (автоответ на форму); без этого поля — слово владельца через оркестратора */
  source?: "plugin"
  mode?: string
  type?: string
  project?: string
  task?: number
  /** запись формы на момент взятия (для письма, возврата формы и достройки после перезапуска) */
  snap?: PendingForm
  /** прерывание хода выполнено в это время (после перезапуска не повторяется) */
  interrupted?: number
}

const clean = (s: string) => s.replace(/\(recommended\)|\(рекомендуется\)/gi, "").replace(/\s+/g, " ").trim().toLowerCase()

/** Какая форма и какой ответ. Чистая функция: её проверяет test/crew-owner-answer.test.mjs. `replaced` — записи, которые вкладка заменила
 *  новой формой того же вопроса (задача 071): ответ на такую форму отказывается с id новой. */
export function resolveAnswer(a: OwnerAnswer, forms: { session: string; form: PendingForm }[], done: OwnerAnswer[], replaced: { session: string; form: PendingForm }[] = []): { ok: true; session: string; form: PendingForm; answer: string } | { ok: false; why: string; dead?: { session: string; id: string } } {
  if (!a || typeof a.quote !== "string" || !a.quote.trim()) return { ok: false, why: "no quote of the owner's word" }
  if (!a.form && !a.session) return { ok: false, why: "no form id and no session" }
  if (!a.option && !(a.text ?? "").trim()) return { ok: false, why: "no option and no text" }
  let hits = forms.filter((x) => (a.form ? x.form.id === a.form || x.form.rid === a.form : true) && (a.session ? x.session === a.session : true))
  // задача 120: вкладка назвала только сессию, а у неё живой вопрос и мёртвый диалог - ответ идёт живому
  if (!a.form && hits.length > 1 && hits.some((x) => !x.form.dead)) hits = hits.filter((x) => !x.form.dead)
  if (!hits.length) {
    // задача 071: форму заменила новая форма того же вопроса — отказ называет форму, на которую нужно ответить (цепочка замен идёт до открытой)
    let old = a.form ? replaced.find((x) => x.form.id === a.form && (!a.session || x.session === a.session)) : undefined
    for (let n = 0; old?.form.replacedBy && n < 20; n++) {
      const by = old.form.replacedBy
      if (forms.some((x) => x.form.id === by)) return { ok: false, why: `вопрос задан заново формой ${by}, ответьте на неё` }
      const next = replaced.find((x) => x.form.id === by)
      if (!next) return { ok: false, why: `вопрос задан заново формой ${by}, но она уже закрыта: открытого вопроса нет` }
      old = next
    }
    const prev = done.find((d) => d.status === "applied" && d.id !== a.id && ((a.form && d.form === a.form) || (!a.form && a.session && d.session === a.session)))
    return { ok: false, why: prev ? `already answered (answer ${prev.id})` : "no open question form" }
  }
  if (hits.length > 1) return { ok: false, why: `${hits.length} open forms, name the form id` }
  const { session, form } = hits[0]
  // задача 120: вызов question этой формы уже оборван (перезапуск службы), ответить некому; диалог в окне закрывают руками, запись снимается
  if (form.dead) return { ok: false, why: DEAD_WHY, dead: { session, id: form.id } }
  let answer: string
  if (a.option) {
    const opts = form.options ?? []
    const n = /^\d+$/.test(a.option.trim()) ? Number(a.option.trim()) : 0
    const pick = n ? opts[n - 1] : opts.find((o) => clean(o) === clean(a.option!)) ?? opts.find((o) => clean(o).startsWith(clean(a.option!)))
    if (!pick) return { ok: false, why: `no option "${a.option}" (options: ${opts.map((o, i) => `${i + 1}. ${o}`).join("; ") || "none"})` }
    answer = pick
    if ((a.text ?? "").trim()) answer += ` — ${a.text!.trim()}`
  } else answer = a.text!.trim()
  return { ok: true, session, form, answer }
}

/** Письмо вкладке с ответом владельца. */
export const answerLetter = (f: PendingForm, answer: string, quote: string) =>
  `Ответ владельца на ваш вопрос «${f.question ?? f.title ?? "вопрос"}»: ${answer} (передан через оркестратора по слову владельца: «${quote.trim()}»). ` +
  `Вопросник закрыт прерыванием хода; не задавайте этот вопрос снова, продолжайте с этим ответом.`

/** Запись в истории задачи вкладки. */
export const answerNote = (f: PendingForm, answer: string, quote: string, id?: string) => `ответ владельца через оркестратора на вопрос «${(f.question ?? f.title ?? "").slice(0, 150)}»: ${answer.slice(0, 200)} (слово владельца: «${quote.trim().slice(0, 200)}»)${id ? ` [answer ${id}]` : ""}`

function finish(file: string, a: OwnerAnswer, patch: Partial<OwnerAnswer>) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...a, ...patch }, null, 2))
  renameSync(tmp, file)
}

export type AnswerDeps = {
  interrupt(session: string): Promise<{ ok: boolean; why?: string }>
  letter(session: string, text: string, id: string): void
  history(session: string, note: string): void
  say(line: string): void
  /** задача 120: последний вызов question вкладки по базе (core.ts questionCall); без него отказ «нет открытой формы» не уточняется */
  call?(session: string): Promise<QuestionCall>
}

/** Один проход по папке входящих ответов: каждый новый файл — применён или отказан, итог в файле и в журнале. */
export async function answerTick(deps: AnswerDeps, now = Date.now(), dir = ANSWERS, formsDir = FORMS): Promise<void> {
  if (!existsSync(dir)) return
  const files = readdirSync(dir).filter((n) => n.endsWith(".json")).sort()
  const all = files.map((n) => ({ file: path.join(dir, n), a: readJson<OwnerAnswer>(path.join(dir, n)) }))
  // задача 071: накопленные дубли закрываются до разбора ответов — ответ на старую форму получит подсказку, а не уйдёт в никуда
  if (all.some((x) => x.a && !x.a.status)) for (const x of settleDuplicates(formsDir, now)) deps.say(`form ${x.id} of ${x.session}: replaced by ${x.by} (${x.reason ?? "the same question asked again"})`)
  for (const { file, a } of all) {
    if (!a || a.status === "applied" || a.status === "refused") continue
    a.id ??= path.basename(file, ".json")
    let session: string
    let form: PendingForm
    let answer: string
    if (a.status === "applying") {
      // задача 096: запись об ответе сделана и форма взята, но процесс умер до конца. Шаги достраиваются: прерывание — если его ещё не было,
      // письмо и событие повторяются с теми же id (второго письма и второй записи в истории не будет), итог ставится в конце
      if (!a.snap || !a.session || typeof a.answer !== "string") {
        finish(file, a, { status: "refused", why: "the record was taken but lost its form: nothing to finish", done: now })
        a.status = "refused"
        deps.say(`owner answer ${a.id} not applied: the record was taken but lost its form`)
        continue
      }
      ;({ session, snap: form, answer } = { session: a.session, snap: a.snap, answer: a.answer })
      deps.say(`owner answer ${a.id}: finishing after a restart (${a.interrupted ? "the turn was interrupted before" : "the turn is not interrupted yet"})`)
    } else {
      const done = all.map((x) => x.a).filter((x): x is OwnerAnswer => !!x && !!x.status)
      const r = resolveAnswer(a, allForms(now, formsDir), done, replacedForms(now, formsDir))
      if (!r.ok) {
        let why = r.why
        // задача 120: запись мёртвого диалога снимается («Ждут вас» его больше не держит); записи нет, но метка «удержана владельцу» и вызов оборван - тот же отказ
        if (r.dead) {
          removeForm(r.dead.session, r.dead.id, formsDir)
          closeDeadMark(r.dead.id, DEAD_WHY, now, formsDir)
        } else if (why === "no open question form" && deps.call) {
          const d = await deadDialogOf(a, { call: deps.call }, now, formsDir).catch(() => undefined)
          if (d) {
            why = DEAD_WHY
            closeDeadMark(d.id, DEAD_WHY, now, formsDir)
          }
        }
        finish(file, a, { status: "refused", why, done: now })
        a.status = "refused"
        deps.say(`owner answer ${a.id} not applied: ${why}`)
        continue
      }
      ;({ session, form, answer } = r)
      // запись о взятии — до снятия записи формы и до прерывания (задача 096): умер процесс между шагами — файл помнит форму и ответ
      finish(file, a, { status: "applying", form: form.id, session, answer, snap: form })
      Object.assign(a, { status: "applying", form: form.id, session, answer, snap: form })
      // запись снимается до прерывания: событие form.cancelled от прерывания не должно начать повтор (задача 040)
      removeForm(session, form.id, formsDir)
    }
    if (!a.interrupted) {
      const i = await deps.interrupt(session)
      if (!i.ok) {
        addForm(session, form, formsDir)
        finish(file, a, { status: "refused", why: `the turn was not interrupted: ${i.why}`, done: now })
        a.status = "refused"
        deps.say(`owner answer ${a.id} not applied: the turn of ${session} was not interrupted: ${i.why}`)
        continue
      }
      finish(file, a, { interrupted: now })
      a.interrupted = now
    }
    // задача 078: ответ записан до письма — отметка «доставлено» (index.ts) найдёт его по id письма; цикл «вопрос — ответ — тот же вопрос» считается по этим записям
    noteAnswered(session, form, `owner-answer-${a.id}`, now, formsDir)
    const plugin = a.source === "plugin"
    deps.letter(session, plugin ? autoLetter(form.question ?? form.title ?? "вопрос", answer, a.type ?? "default") : answerLetter(form, answer, a.quote), `owner-answer-${a.id}`)
    deps.history(session, plugin ? autoNote(form.question ?? form.title ?? "", answer, a.type ?? "default", a.id) : answerNote(form, answer, a.quote, a.id))
    finish(file, a, { status: "applied", form: form.id, session, answer, done: now })
    Object.assign(a, { status: "applied", form: form.id, session })
    deps.say(
      plugin
        ? `owner answer ${a.id} applied: form ${form.id} of ${session} closed by interrupt, the answer "${answer.slice(0, 80)}" sent as a letter (by answer_mode ${a.mode ?? "recommendations"}, type ${a.type ?? "default"}; not the owner's word)`
        : `owner answer ${a.id} applied: form ${form.id} of ${session} closed by interrupt, the answer "${answer.slice(0, 80)}" sent as a letter (owner's word: "${a.quote.slice(0, 80)}")`,
    )
  }
}

export const ensureAnswers = (dir = ANSWERS) => mkdirSync(dir, { recursive: true })
