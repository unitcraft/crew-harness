// СОСТОЯНИЕ СЕССИЙ (план 003, 2026-10-05): кто чего ждёт — для владельца (сводка /crew, уведомление «ждёт вас») и
// для внешних проверок (хук проекта читает status/<сессия>.json — открытый контракт, README «Session status»).
//
// Случай владельца 2026-10-05: вопрос интегратора дважды висел незамеченным (окно прокручено вверх), а что работают
// три воркера, владелец узнал случайно. Состояние выводится из данных плагина, без проектного текста: идёт ход;
// ждёт наблюдения (crew_watch); ждёт ответа на свой вопрос; своя задача сдана / на доработке; ждёт своих задач;
// ход кончился вопросом — ждёт владельца. Последнее — общий признак любой модели: ответ кончается вопросом (строка
// с «?» в конце среди последних строк ответа), владелец после этого не писал, и это вкладка владельца, а не сессия
// задачи (её ведёт интегратор).

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { type Card, type Obligation, obligationsOf, readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"
import { answerCounts, answerSideRow } from "./answer.ts"
import { divergenceLineFor, unconfiguredLineFor } from "./config-diverge.ts"
import { branchRows, branchSideRows } from "./branch-guard.ts"
import { stepRows, stepSideRows } from "./idle-watch.ts"
import { DEAD_WHY, FORM_MAX_REPEATS, shownForms } from "./form-wait.ts"
import { lockWaitLine, lockWaiters } from "./review.ts"
import { refreshRouteStale } from "./task-folders.ts"
import { ROUTE_RU, STALE_WARNING } from "./route.ts"
import { type Task, ACCEPTED_REMINDERS_MAX, EXECUTOR_CODE, acceptedAt, acceptedReminders, isOpen, listTasks, loadTask, sesLabel, sessionOf, taskNo } from "./tasks.ts"
import { CREW_STATE_WORDS, ROLE_WORDS, SESSION_KIND, SESSION_WORDS, TASK_WORDS } from "./progress.ts"
import { LOOP_HINT, LOOP_MARK, LOOP_WORD, loopLine, loopOf } from "./answer-loop.ts"
import { GATE_MARK } from "./gate-stop.ts"
import { IDLE_MARK } from "./idle-tab.ts"
import { type Watch, watchesOf } from "./watch.ts"

export const STATUS = path.join(BASE, "status")

export type State = "working" | "owner" | "question" | "watch" | "reply" | "task" | "tasks" | "idle"
export type Status = {
  session: string
  project?: string
  role: string
  title: string
  model?: string
  state: State
  since?: number
  /** Порог «завис?» на момент записи, мс (long_turn_minutes, задача 111); есть только у state working и когда порог включён. since — последнее
   *  обновление хода (последний запрос модели): прошло больше порога — панель пишет «завис? Nч», а не «работает N мин». */
  longTurnMs?: number
  /** Одна строка по-русски: что делает или чего ждёт. */
  detail: string
  /** Вопрос владельцу (state owner): последние строки ответа. */
  question?: string
  /** Ход кончился фразой ожидания (WAITING_PHRASES), а не строкой с «?»: в question — эта фраза; показ — «ждёт указаний»,
   *  значок WAIT_MARK (задача 056). Подталкивание то же, что у вопроса. */
  wait?: true
  /** Вкладка остановилась на воротах без вопроса владельцу (задача 062, gate-stop.ts): state owner, значок GATE_MARK, подпись «ждёт вашего решения,
   *  вопроса нет». Снимается открытым вопросом или словом владельца. */
  gate?: true
  /** Отметка ворот поставлена не записью «ворота», а фразой ожидания решения владельца без вопроса (задача 064, п. 10). */
  gateWait?: true
  /** state owner, но «вопрос» — служебный текст плагина, а не слово вкладки (задача 077): lost — окно считает ход идущим, а сервер свободен;
   *  hung — ход завис. /crew называет такое словом (CREW_STATE_WORDS), а не русским предложением из question и detail. */
  sys?: "lost" | "hung"
  /** Вкладка зациклилась на вопросе (задача 078, answer-loop.ts): владелец ответил n раз, ответы доставлены, а она спрашивает снова. State owner, значок
   *  LOOP_MARK, подпись «вкладка зациклилась на вопросе…» с предложением (переназначить, написать вкладке). Снимается рабочим ходом, словом владельца,
   *  сменой задачи, закрытием вкладки. */
  loop?: { n: number; question: string }
  /** Вкладка простаивает (задача 063, idle-tab.ts): state tasks, у её задачи нет идущей сессии или сессия ждёт её указаний, вопроса
   *  владельцу нет, дольше idle_tab_minutes. since — начало эпизода, what — что стоит («061 между сессиями»). Значок IDLE_MARK. */
  idleTab?: { since: number; what: string[] }
  /** Вопрос встроенного вопросника (form-wait.ts): уведомления по нему ведёт formWatch, не общий повтор owner_reminder_min. */
  formId?: string
  /** Задача 120 (state owner): диалог вопроса на экране без записи формы в forms/ (norecord: вызов question открыт по базе, записи нет) или с мёртвой записью
   *  (dead: вызов оборван, диалог мог остаться в окне - закрыть вручную). Тот же «ждёт вас», с возрастом; /crew называет это словом. */
  dialog?: "norecord" | "dead"
  watches: { id: string; note?: string; started?: number; minutes: number }[]
  asked: { qid: string; to: string; at: number }[]
  /** Вопросы старше ASKED_STALE_MIN без ответа: в /crew отдельной строкой, состояние reply не держат. */
  askedStale?: { qid: string; to: string; at: number }[]
  /** Своя задача (исполнитель или приёмщик). ref — номер задачи в показе («045», задачи 058, 086); label — сессия
   *  методики («С4-3»); group — задача с папкой: панель и /crew группируют её сессии под строкой задачи; status у сессии методики —
   *  её собственный (сдана — submitted, передана — handed), ended — когда сдана. */
  task?: { n: number; status: string; as: "executor" | "reviewer"; title: string; steps?: StepView[]; checking?: string; ref?: string; label?: string; group?: true; ended?: number; kind?: string; route?: "fast"; routeStale?: true }
  /** Открытые задачи, поставленные этой сессией. */
  tasks: { n: number; status: string; priority: string; title: string }[]
  /** Вкладка застряла (задача 043, L3): с какого времени и по чему; держится, пока признак не снят (push, ответ, сдача, рабочий ход,
   *  слово или ответ владельца — задача 052). Пока вкладка ждёт владельца (state owner: вопросник, вопрос владельцу), не показывается. */
  stuck?: { at?: number; what: string }[]
  /** Когда владельцу последний раз показали «ждёт вас» (повтор по owner_reminder_min). */
  notified?: number
  updated: number
}

/** Шаг приёмки задачи в окне: result — итог (шаг пройден), без него — ещё нет. */
export type StepView = { id: string; text: string; result?: string }
const stepsOf = (t: Task): StepView[] | undefined => t.steps?.length ? t.steps.map((a) => ({ id: a.id, text: a.text, ...(t.checks?.[a.id] ? { result: t.checks[a.id] } : {}) })) : undefined
/** «проверка 3/13: fixture» — шаг, который приёмщик проверяет сейчас, или «шаги 5/13», когда между шагами. */
export function stepProgress(task: Status["task"]): string | undefined {
  if (!task?.steps?.length || !["reviewing", "accepted"].includes(task.status)) return undefined
  const total = task.steps.length
  const i = task.checking ? task.steps.findIndex((a) => a.id === task.checking) : -1
  // шаг — id и короткое название из его текста (задача 064, п. 7; владелец, 2026-10-17: «название шагов и сессий надо показывать»)
  const name = i >= 0 ? shortName(task.steps[i].text) : ""
  if (i >= 0 && !task.steps[i].result) return `проверка ${i + 1}/${total}: ${task.checking}${name && name !== task.checking ? ` — ${name}` : ""}`
  return `шаги ${task.steps.filter((a) => a.result).length}/${total}`
}
/**
 * Кому принадлежит строка шагов приёмки (задача 087; владелец, 2026-10-18: «почему повторяются суб-записи»): шаги и текущая проверка
 * хранятся на задаче, поэтому их несут вкладки всех её сессий, а проверяет шаги только приёмщик. Строка — одна на задачу: у приёмщика
 * (`holder`); нет приёмщика среди показываемых вкладок, а шаги есть — одна строка под названием задачи (`orphan`).
 * `group` — показываемые вкладки одной задачи.
 */
export function stepsPlace(group: Status[]): { holder?: Status; orphan?: string } {
  const holder = group.find((x) => x.task?.as === "reviewer")
  if (holder) return { holder }
  const orphan = group.map((x) => stepProgress(x.task)).find((x) => x)
  return orphan ? { orphan } : {}
}

/** Короткое название из текста шага или цели сессии: до первого «:», «;», «.», « — » или «(», без разметки. */
export const shortName = (text = ""): string => {
  const t = text.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim()
  const m = /[:;.](?=\s|$)|\s[—–]\s|\s\(/.exec(t)
  return (m ? t.slice(0, m.index) : t).trim()
}
/** Вид сессии задачи словами (задача 064, п. 7): по коду из единого перечня методики (progress.ts SESSION_WORDS); код вне перечня
 *  (С2м и подобные) — по записи сессии в задаче (её цель); у исполнителя и без цели — нет. */
export const sessionKind = (code: string, goal?: string): string | undefined => SESSION_WORDS[code] ?? (code !== EXECUTOR_CODE && goal ? shortName(goal) || undefined : undefined)

/**
 * Фразы ожидания слова владельца без знака «?» («жду вашего разрешения», «awaiting your GO»). ЕДИНЫЙ перечень: расширяется по
 * реальным примерам. Форма: глагол ожидания, рядом (до 60 знаков, в пределах предложения) слово о владельце или решении.
 * Отрицание перед глаголом («не жду», «ни», «not», «no need for») не срабатывает; прошедшее («ждал») глаголом не считается.
 */
export const WAITING_PHRASES: RegExp[] = [
  /(?<![а-яё])(?<!не\s)(?<!ни\s)(?:жду|ждёт|ждем|ждём|ожидаю|ожидает|ожидаем)(?![а-яё])(?:(?!\sбез\s)[^.!?\n,;:]){0,60}?(?<![а-яё])(?:вашего|владельц|разрешени|слова|решени|согласи|подтвержден|указани|GO(?![а-яё\w]))/i,
  /(?<![a-z])(?<!not\s)(?<!n't\s)(?<!no\s)(?:awaiting|waiting for|needs?)(?![a-z])(?:(?!\swithout\s)[^.!?\n,;:]){0,60}?(?<![a-z])(?:your|owner)(?![a-z])[^.!?\n,;:]{0,40}?(?<![a-z])(?:GO|approval|decision|confirmation|permission)(?![a-z])/i,
  /(?<![а-яё])пока не получу(?![а-яё])[^.!?\n]{0,60}?(?<![а-яё])(?:разрешени|слов|решени|подтвержден|GO(?![а-яё\w]))/i,
  /(?<![а-яё])(?<!не\s)(?:просит|просим|запрашивает)(?![а-яё])[^.!?\n,;:]{0,60}?(?<![а-яё])(?:разрешени|согласи|GO(?![а-яё\w]))/i,
  // задача 062, только дополнение к записи «ворота» (gate-stop.ts): живая фраза остановки на воротах без вопроса, 2026-10-16 —
  // «Остановлено до вашего решения; спецификация ещё не утверждена…». «до вашего решения / слова», «остановлено … решени(е)»
  // (кроме «решение принято / получено»)
  /(?<![а-яё])до (?:вашего|владельца)\s+(?:решени|слова|разрешени|подтвержден|указани)/i,
  /(?<![а-яё])остановлен[а-яё]*(?![а-яё])[^.!?\n]{0,60}?(?<![а-яё])решени[а-яё]*(?![^.!?\n]{0,40}(?:принят|получен))/i,
]

/** Ожидание не владельца, а приёмки, проверки, слияния, наблюдения или другой сессии: «жду решения приёмки». Вырезается до положительных фраз. */
const NOT_OWNER_WAIT = /(?<![а-яё])((?:жду|ждёт|ждем|ждём|ожидаю|ожидает|ожидаем)(?![а-яё]))\s+(?:решени|ответ|результат|вердикт|слов|итог|указани)[а-яё]*\s+(?:приёмк|приемк|приёмщик|приемщик|CI(?![a-z])|проверк|слиян|наблюден|воркер|исполнител)[а-яё]*/gi

/** Ответ кончается вопросом или фразой ожидания слова владельца: такая строка среди последних трёх непустых (за ней бывает подпись).
 *  wait — строка без «?» в конце, найдена по фразе ожидания (задача 056: показывается «ждёт указаний», а не «вопрос»). */
export function endOfTurn(text: string): { text: string; wait: boolean } | undefined {
  const waits = (l: string) => { const c = l.replace(NOT_OWNER_WAIT, "$1 "); return WAITING_PHRASES.some((r) => r.test(c)) }
  const asks = (l: string) => /\?[)»"*_`]*$/.test(l)
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean)
  const tail = lines.slice(-3)
  const i = tail.map((l) => asks(l) || waits(l)).lastIndexOf(true)
  if (i < 0) return undefined
  return { text: tail[i].length > 300 ? `${tail[i].slice(0, 300)}…` : tail[i], wait: !asks(tail[i]) }
}

/** Строка вопроса или ожидания в конце хода — для сторожа потока и подталкивания (index.ts): вопрос и ожидание не различает. */
export const endsWithQuestion = (text: string): string | undefined => endOfTurn(text)?.text

/** «ждёт указаний интегратора» — от кого, если фраза его называет; иначе «ждёт указаний». */
export function waitLabel(phrase = ""): string {
  const from = /интегратор/i.test(phrase) ? " интегратора" : /владельц/i.test(phrase) ? " владельца" : ""
  return `ждёт указаний${from}`
}

const hm = (t?: number) => (t ? new Date(t).toTimeString().slice(0, 5) : "?")
const minutes = (from: number | undefined, now: number) => (from ? `${Math.max(0, Math.round((now - from) / 60_000))} мин` : "")
const STATUS_RU: Record<string, string> = { starting: "запускается", running: "в работе", submitted: "сдана", reviewing: "на приёмке", rework: "на доработке", accepted: "принята", done: "влита", cancelled: "отменена", idle: "ждёт следующей сессии", backlog: "в бэклоге" }

export type StatusInput = {
  card: Card
  busy: boolean
  busySince?: number
  end?: { at: number; text: string; ownerAfter: boolean }
  /** Вопросы этой сессии, на которые ещё нет ответа (обязательства других перед ней). */
  asked: { qid: string; to: string; at: number }[]
  askedStale?: { qid: string; to: string; at: number }[]
  now: number
  /** наблюдения сессии, прочитанные проходом один раз на всех (иначе — читаются здесь) */
  watches?: Watch[]
  /** окно считает ход идущим, а сервер свободен с этого времени (core.ts staleBusy) */
  staleSince?: number
  /** ход завис: модель молчит с этого времени, строки idle нет (core.ts hungTurn) */
  hungSince?: number
  /** порог «завис?» панели, мс (cfg.longTurnMin, задача 111); 0 или нет — не показывать */
  longTurnMs?: number
  /** Задача 120: вызов question вкладки открыт по базе (core.ts questionCall), а записи формы в forms/ нет: с какого времени открыт диалог */
  dialog?: { since: number }
  /** Остановка на воротах без вопроса (index.ts: ход вкладки кончился, вопроса нет): с какого времени; wait — не запись «ворота», а ход
   *  вкладки владельца кончился фразой ожидания его решения (задача 064, п. 10), text — эта фраза */
  gate?: { at: number; wait?: true; text?: string }
}

/** Задача 084 (владелец, 2026-10-17, «по рекомендации»): обязательство «застряла» ждать больше нечего, если его задача сдана за эту роль: приёмщик —
 *  задача принята, влита, отменена, вернулась исполнителю на доработку или у неё другой приёмщик; исполнитель — задача уже сдана (submitted и дальше,
 *  отменена) или у неё другой исполнитель. Записи задачи нет (очищена) — тоже. Вопрос без задачи и задача, всё ещё ждущая этой вкладки, — не сняты.
 *  Запись обязательства не меняется: отметку только не показываем. Возвращает причину или undefined. */
export function obligationMoot(o: Obligation, card: Pick<Card, "session" | "project" | "task" | "review">): string | undefined {
  if (!o.task) return undefined
  const mine = card.project ? listTasks(card.project) : []
  const ref = card.task ?? card.review
  const t = mine.find((x) => x.review_qid === o.qid || x.qid === o.qid) ?? (ref ? loadTask(ref.project, ref.n) : undefined)
  if (!t || (t.review_qid !== o.qid && t.qid !== o.qid)) return "задачи нет"
  // приёмщик: qid обязательства - review_qid задачи (у старых задач без него - qid задачи, и запись зовёт «приёмка N»)
  if (t.review_qid === o.qid || (!t.review_qid && o.task.startsWith("приёмка "))) {
    if (t.reviewer && t.reviewer !== card.session) return "у задачи другой приёмщик"
    return ["accepted", "done", "cancelled", "rework", "starting", "running"].includes(t.status) ? `приёмка не ждёт: задача ${t.status}` : undefined
  }
  if (t.executor && t.executor !== card.session) return "у задачи другой исполнитель"
  return ["submitted", "reviewing", "accepted", "done", "cancelled"].includes(t.status) ? `задача уже сдана: ${t.status}` : undefined
}

/** Состояние одной сессии из её данных. Порядок важности: ход > вопрос владельцу > наблюдение > ответ > задачи. Вкладка, которая
 *  ждёт владельца (state owner), застрявшей не показывается (задача 052; владелец, 2026-10-15, «заводи 052»): стоит она за
 *  владельцем, а не сама; отметка в обязательствах остаётся и снимается ответом владельца. */
export function statusOf(x: StatusInput): Status {
  const s = statusOfAll(x)
  if (s.state !== "owner" || !s.stuck) return s
  const { stuck: _hidden, ...rest } = s
  return rest
}

function statusOfAll(x: StatusInput): Status {
  const { card, now } = x
  const watches: Watch[] = x.watches ?? watchesOf(card.session)
  const ref = card.task ?? card.review
  const own: Task | undefined = ref ? loadTask(ref.project, ref.n) : undefined
  // сессия задачи с папкой (задача 058): у сессии методики своё состояние
  const ses = own && card.task ? sessionOf(own, card.session) : undefined
  const authored = listTasks(card.project).filter((t) => t.author === card.session && isOpen(t))
  // УСТАРЕВШАЯ ПРИВЯЗКА (задача 064, п. 9; владелец, 2026-10-17, «по рекомендации»): вкладка, чья задача закрыта (отменена, влита), и вкладка
  // интегратора показываются по своей роли, а не как исполнитель задачи («#73 исп» у интегратора, подхватившего когда-то отменённую #73)
  const shown = own && isOpen(own) && card.role !== "integrator" ? own : undefined
  // маршрут (задача 092): постановка быстрого пути изменена после слова завода — запись помечается здесь же, при показе
  if (shown?.route === "fast") refreshRouteStale(shown)
  const stuck = obligationsOf(card.session)
    .filter((o) => o.stuck && !obligationMoot(o, card))
    .map((o) => ({ ...(o.stuckAt ? { at: o.stuckAt } : {}), what: o.stuckWhat ?? (o.task ? o.task : `вопрос ${o.qid}`) }))
  const base: Status = {
    session: card.session,
    project: card.project,
    role: card.role,
    title: card.titleShown ?? card.title,
    model: card.model,
    state: "idle",
    detail: "свободна",
    watches: watches.map((w) => ({ id: w.id, note: w.note, started: w.started, minutes: w.minutes })),
    asked: x.asked,
    ...(x.askedStale?.length ? { askedStale: x.askedStale } : {}),
    ...(shown ? { task: { n: shown.n, status: ses && ses.status !== "running" ? (ses.status === "submitted" ? "submitted" : ses.status === "handed" ? "handed" : "cancelled") : shown.status, as: card.task ? ("executor" as const) : ("reviewer" as const), title: shown.title, ...(stepsOf(shown) ? { steps: stepsOf(shown) } : {}), ...(shown.checking ? { checking: shown.checking.step } : {}), ref: taskNo(shown), ...(shown.folder ? { group: true as const } : {}), ...(ses && ses.code !== "исп" ? { label: sesLabel(ses), ...(sessionKind(ses.code, ses.goal) ? { kind: sessionKind(ses.code, ses.goal) } : {}) } : {}), ...(ses?.ended && ses.status !== "running" ? { ended: ses.ended } : {}), ...(shown.route === "fast" ? { route: "fast" as const } : {}), ...(shown.route === "fast" && shown.route_word_stale ? { routeStale: true as const } : {}) } } : {}),
    tasks: authored.map((t) => ({ n: t.n, status: t.status, priority: t.priority, title: t.title })),
    ...(stuck.length ? { stuck } : {}),
    updated: now,
  }
  if (x.staleSince) {
    const q = `окно считает ход идущим, а сервер свободен с ${hm(x.staleSince)}: сообщение, видимо, не дошло — нажмите Esc в окне и отправьте его снова`
    return { ...base, state: "owner", since: x.staleSince, question: q, detail: q, sys: "lost" }
  }
  if (x.hungSince) {
    const q = `ход завис с ${hm(x.hungSince)} (${minutes(x.hungSince, now)}): нажмите Esc в окне и напишите «продолжай»`
    return { ...base, state: "owner", since: x.hungSince, question: q, detail: q, sys: "hung" }
  }
  // встроенный вопросник OpenCode (события form.*, form-wait.ts): адресован человеку всегда, и у вкладки владельца, и у сессии задачи
  // задача 120: мёртвые диалоги (вызов оборван, запись оставлена) тоже видны - после живых вопросов
  const form = shownForms(card.session, now)[0]
  // ЦИКЛ НА ВОПРОСЕ (задача 078): владелец ответил, письма доставлены, вкладка спрашивает снова и не работает — ждёт владельца, пока он не переназначит задачу
  const lp = loopOf(card.session)
  if (lp) {
    const q = loopLine({ n: lp.n, question: form?.question ?? lp.question })
    return { ...base, state: "owner", since: lp.since, question: q, ...(form ? { formId: form.id } : {}), loop: { n: lp.n, question: form?.question ?? lp.question }, detail: `${q}; ${LOOP_HINT}` }
  }
  if (form?.dead) {
    const q = form.question ?? form.title ?? "вопрос во встроенном вопроснике"
    return { ...base, state: "owner", since: form.at, question: q, formId: form.id, dialog: "dead", detail: `ждёт вас с ${hm(form.at)} (${DEAD_WHY}): ${q}` }
  }
  if (form) {
    const q = form.question ?? form.title ?? "вопрос во встроенном вопроснике"
    const tail = form.exhausted ? "без ответа, нужен владелец" : form.repeats ? `повтор ${form.repeats} из ${FORM_MAX_REPEATS}` : form.cancelled ? "закрыт без ответа, будет повторён" : ""
    return { ...base, state: "owner", since: form.at, question: q, formId: form.id, detail: form.exhausted ? `${tail} (с ${hm(form.at)}): ${q}` : `ждёт вас с ${hm(form.at)}${tail ? ` (${tail})` : ""}: ${q}` }
  }
  // задача 120: диалог на экране (вызов question открыт по базе), а записи формы нет: вкладка ждёт владельца, а не «работает» и не «свободна»
  if (x.dialog) {
    const q = "диалог вопроса открыт, записи формы нет"
    return { ...base, state: "owner", since: x.dialog.since, question: q, dialog: "norecord", detail: `ждёт вас с ${hm(x.dialog.since)} (диалог без записи формы)` }
  }
  if (x.busy) return { ...base, state: "working", since: x.busySince, ...(x.longTurnMs && x.busySince ? { longTurnMs: x.longTurnMs } : {}), detail: `работает${x.busySince ? ` (${minutes(x.busySince, now)})` : ""}` }
  // сессию задачи ведёт интегратор, и её вопрос в конце хода бывает ему (сдавший воркер спросил интегратора), а бывает
  // владельцу (приёмщик просил «вливай?»): кому — по тексту не определить. Поэтому у сессии задачи — «question»: видно
  // в /crew, но без уведомления; «owner» с уведомлением — только у вкладок владельца.
  // исполнитель, сдавший задачу (submitted/reviewing/accepted), по роли ждёт приёмщика: «жду решения приёмки» — не вопрос
  const handedOver = !!card.task && !!own && ["submitted", "reviewing", "accepted"].includes(own.status)
  // ход кончился фразой ожидания, а не вопросом (задача 056): то же состояние, отметка wait и подпись без слова «вопрос»
  const e = x.end && !x.end.ownerAfter && !handedOver ? endOfTurn(x.end.text) : undefined
  const q = e?.text
  const w = e?.wait ? { wait: true as const } : {}
  // ВОРОТА БЕЗ ВОПРОСА (задача 062): запись «ворота» есть, а вопроса владельцу нет (ни вопросника, ни «?» в конце хода) — вкладка ждёт владельца,
  // но он об этом не знает. Фраза ожидания вопросом не считается: отметка ворот старше значка паузы
  // Фраза ожидания решения владельца без вопроса (задача 064, п. 10; gate.wait): та же отметка, подпись без слова «ворота», вопрос — сама фраза
  if (x.gate && (!e || e.wait)) {
    if (x.gate.wait) return { ...base, state: "owner", since: x.gate.at, gate: true, gateWait: true, question: `вопроса нет: ${x.gate.text ?? ""}`.trim(), detail: `ждёт вашего решения, вопроса нет (с ${hm(x.gate.at)})${x.gate.text ? `: ${x.gate.text}` : ""}` }
    const q = "ворота записаны, вопрос владельцу не задан"
    return { ...base, state: "owner", since: x.gate.at, gate: true, question: q, detail: `ждёт вашего решения, вопроса нет (ворота с ${hm(x.gate.at)})` }
  }
  if (q && !card.spawned) return { ...base, state: "owner", since: x.end!.at, question: q, ...w, detail: `ждёт вас с ${hm(x.end!.at)}: ${q}` }
  if (q && e?.wait) return { ...base, state: "question", since: x.end!.at, question: q, ...w, detail: `${waitLabel(q)} с ${hm(x.end!.at)}: ${q}` }
  if (q) return { ...base, state: "question", since: x.end!.at, question: q, detail: `ждёт ответа (интегратора или вас) с ${hm(x.end!.at)}: ${q}` }
  if (watches.length) {
    const w = watches[0]
    const queued = w.status === "requested" && w.machine ? `в очереди машины с ${hm(w.created)}` : `с ${hm(w.started ?? w.created)}, предел ${w.minutes} мин`
    return { ...base, state: "watch", since: w.started ?? w.created, detail: `ждёт наблюдения${w.note ? ` «${w.note}»` : ""} (${queued})${watches.length > 1 ? ` и ещё ${watches.length - 1}` : ""}` }
  }
  if (x.asked.length) return { ...base, state: "reply", since: x.asked[0].at, detail: `ждёт ответа от ${x.asked.map((a) => a.to).join(", ")} (с ${hm(x.asked[0].at)})` }
  if (own && isOpen(own)) {
    const s = own.status
    // у задачи с папкой номер — в строке задачи над сессиями (задача 058); без папки — в начале, как раньше
    const no = own.folder ? "" : `${taskNo(own)} `
    const what = ses && ses.code !== "исп" && ses.status !== "running"
      ? ses.status === "submitted" ? `сдана ${hm(ses.ended)}` : ses.status === "handed" ? "передана другой сессии" : "закрыта"
      : card.task
      ? s === "submitted" || s === "reviewing" || s === "accepted"
        ? `${no}сдана, ${STATUS_RU[s]}`
        : s === "rework"
          ? `${no}на доработке — стоит`
          : `${no}${STATUS_RU[s] ?? s} — стоит между ходами`
      : s === "rework"
        ? `приёмка${own.folder ? "" : ` ${taskNo(own)}`}: ждёт доработки`
        : `приёмка${own.folder ? "" : ` ${taskNo(own)}`}: ${STATUS_RU[s] ?? s}`
    return { ...base, state: "task", detail: what }
  }
  if (authored.length) {
    const by = (st: string[]) => authored.filter((t) => st.includes(t.status)).map((t) => `${taskNo(t)}`)
    const parts = [
      [by(["starting", "running"]), "в работе"],
      [by(["rework"]), "на доработке"],
      [by(["submitted", "reviewing", "accepted"]), "на приёмке"],
      [by(["idle"]), "между сессиями"],
    ]
      .filter(([l]) => (l as string[]).length)
      .map(([l, w]) => `${(l as string[]).join(" ")} ${w}`)
    return { ...base, state: "tasks", detail: `ждёт своих задач: ${parts.join("; ")}` }
  }
  return base
}

/** Отметка простоя (задача 063): состояние остаётся tasks — вкладка не ждёт владельца и в «Ждут вас» не входит, — подпись называет простой,
 *  отсутствие вопроса и что стоит. Не tasks — без изменений (ход, вопрос, наблюдение старше простоя). */
export function withIdle(s: Status, idle: { since: number; what: string[] }, now: number): Status {
  if (s.state !== "tasks") return s
  return { ...s, idleTab: idle, detail: `простаивает с ${hm(idle.since)} (${minutes(idle.since, now)}), вопроса владельцу нет: ${idle.what.join("; ")}` }
}

const comparable = (s: Status) => JSON.stringify({ ...s, updated: 0 })

/** Записать состояние, если оно изменилось; notified переносится из прежнего. Возвращает прежнее. */
export function saveStatus(s: Status): Status | undefined {
  mkdirSync(STATUS, { recursive: true })
  const file = path.join(STATUS, `${safeKey(s.session)}.json`)
  const prev = readJson<Status>(file)
  const next: Status = prev?.notified && s.state === "owner" && prev.state === "owner" && prev.since === s.since ? { ...s, notified: prev.notified } : s
  if (prev && comparable(prev) === comparable(next)) return prev
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 1))
  renameSync(`${file}.tmp`, file)
  return prev
}

export function removeStatus(session: string) {
  rmSync(path.join(STATUS, `${safeKey(session)}.json`), { force: true })
}

export function markNotified(session: string, at: number) {
  const file = path.join(STATUS, `${safeKey(session)}.json`)
  const s = readJson<Status>(file)
  if (!s) return
  s.notified = at
  writeFileSync(`${file}.tmp`, JSON.stringify(s, null, 1))
  renameSync(`${file}.tmp`, file)
}

export function readStatuses(): Status[] {
  if (!existsSync(STATUS)) return []
  return readdirSync(STATUS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Status>(path.join(STATUS, f)))
    .filter((s): s is Status => !!s)
}

/** Значки вкладок (владелец, 2026-10-15: «? — ждёт вас; ▶ — задал вопрос текстом, ждёт ответа интегратора (или вашего);»):
 *  панель, /crew, /ask. */
export const MARK: Partial<Record<State, string>> = { owner: "?", question: "▶", working: "•" }
/** Значок вкладки, чей ход кончился фразой ожидания, а не вопросом (задача 056; владелец, 2026-10-15: значок «не похожий на
 *  вопрос»): «‖» — пауза в одну колонку («⏸» в терминале бывает шириной в две, «…» — знак обрезки строки). */
export const WAIT_MARK = "‖"
/** Значок вкладки: ждёт указаний — WAIT_MARK, иначе по состоянию (MARK). */
export const markOf = (s: Pick<Status, "state" | "wait"> & { gate?: true; loop?: Status["loop"]; idleTab?: Status["idleTab"] }): string | undefined =>
  s.loop && s.state === "owner" ? LOOP_MARK : s.gate && s.state === "owner" ? GATE_MARK : s.wait && (s.state === "owner" || s.state === "question") ? WAIT_MARK : s.idleTab && s.state === "tasks" ? IDLE_MARK : MARK[s.state]
const ORDER: Record<State, number> = { owner: 0, question: 1, working: 2, watch: 3, reply: 4, task: 5, tasks: 6, idle: 7 }

/** Ширина строки окна /crew (диалог OpenCode ~74 знака): длиннее — перенос, и список рвётся (владелец 2026-10-07:
 *  «выглядит некрасиво»). Строка обрезается с «…». */
export const DIALOG_WIDTH = 72
const fit = (line: string, n = DIALOG_WIDTH) => (line.length > n ? `${line.slice(0, n - 1)}…` : line)

/** Сводная строка «Waiting for you: N · since ЧЧ:ММ · проект задача роль» (все проекты): первая строка /crew (задача 077: английская, подпись
 *  панели «Ждут вас» не менялась). Время и источник — у самого давнего ожидания; источник назван, чтобы в окне другого проекта было видно,
 *  что вопрос не его (владелец, 2026-10-15: «смущают» одинаковые строки в окнах всех проектов). Никто не ждёт — undefined. */
export function waitingLine(list: Status[], _now = Date.now()): string | undefined {
  const w = waitingOf(list)
  if (!w.length) return undefined
  const oldest = oldestWait(w)
  const where = [oldest.project, tabRef(oldest)].filter(Boolean).join(" ")
  return `Waiting for you: ${w.length}${oldest.since ? ` · since ${hm(oldest.since)}` : ""}${where ? ` · ${where}` : ""}`
}

/** Кто ждёт владельца (задача 084): один источник числа - «Ждут вас» в панели, первая строка /crew и «ждут N» внизу панели считают по нему. */
export const waitingOf = (list: Status[]) => list.filter((s) => s.state === "owner")
const oldestWait = (w: Status[]) => w.reduce((a, b) => ((b.since ?? Infinity) < (a.since ?? Infinity) ? b : a))
/** Номер своей задачи в показе (задачи 083, 086): тот же taskNo, что пишет ref сводки; у сводки прежней версии ref мог быть «#22». */
const refOf = (s: Pick<Status, "project" | "task">) => taskNo({ project: s.project, n: s.task!.n })
/** Начало заголовка сессии задачи: «022 исп», «045 прм», «045 С4-3» (задачи 058, 086); читается и прежняя форма с «#» («#33 исп» первой
 *  редакции 086 и Нова до неё) и числа короче трёх цифр: вкладки, названные раньше, пока syncTitles их не переименовал. */
export const TAB_RE = /^(?:#\d+|\d{3,}) \S+/
/** Вкладка ждущего — то, что открыть: «033 исп» (задача и роль), «045 С4-3» (сессия задачи), иначе роль («интегр.»). */
// прежняя форма заголовка («#33 исп») показывается по нынешнему правилу: «033 исп»
const tabOf = (s: Status) => TAB_RE.exec(s.title ?? "")?.[0].replace(/^#?(\d+)/, (_, d) => taskNo({ n: d })) ?? (s.task ? `${refOf(s)} ${s.task.label ?? (s.task.as === "reviewer" ? "прм" : "исп")}` : s.role === "integrator" ? "интегр." : s.role)

/** «Ждут вас» в боковой панели (задача 055; владелец, 2026-10-15: «не вижу кто меня ждет?» — одна строка
 *  «Ждут вас: 1 · с 18:55 · clau» обрезалась по ширине панели). Три строки, все проекты: сколько и с какого времени; кто ждёт
 *  дольше всех — проект и вкладка, что открыть (не обрезаются); начало вопроса по ширине панели (нет текста — нет строки). */
export function waitingRows(list: Status[], width = SIDE_WIDTH): SideRow[] {
  const w = waitingOf(list)
  if (!w.length) return []
  const oldest = oldestWait(w)
  const rows: SideRow[] = [
    { mark: " ", who: "", what: `Ждут вас: ${w.length}${oldest.since ? ` · с ${hm(oldest.since)}` : ""}`, tone: "accent" },
    { mark: markOf(oldest) ?? "?", who: "", what: `${markOf(oldest) ?? "?"} ${[oldest.project, tabOf(oldest)].filter(Boolean).join(" ")}`, tone: "accent" },
  ]
  const q = oldest.question?.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim()
  if (q) rows.push({ mark: " ", who: "", what: fit(`↳ ${q}`, width), tone: "muted" })
  return rows
}

// ЭКРАН /crew (задача 077; владелец, 2026-10-17: «в /crew нужно уменьшить количество текста до минимума, оставшийся сделай на анг.,
// общается crew должен на моем языке»). По проекту: название; вкладки и задачи — значок, номер и название как есть, роль и состояние одним
// английским словом (CREW_STATE_WORDS, progress.ts), возраст ожидания, у сессии задачи с папкой — код и вид (SESSION_KIND); вопрос владельцу —
// своей строкой «↳», как есть. Не больше одной строки на вкладку. Остальное (планы, неочищенные задачи, отчёты, автоответы, устаревшие
// вопросы, замок, настройки) — счётчиками в строке проекта. Содержимое вкладок и владельца не переводится: язык общения вкладок —
// owner_language проекта (core.ts, подсказка вкладкам); /crew только показывает их слова и ничего не подменяет.

/** Возраст ожидания для /crew: «35m», «10h», «2d». */
export function ageText(from: number | undefined, now: number): string {
  if (!from) return ""
  const m = Math.max(0, Math.round((now - from) / 60_000))
  return m < 120 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
/** Роль вкладки задачи словом: exec / rev. */
const roleWord = (t: NonNullable<Status["task"]>) => (t.as === "reviewer" ? ROLE_WORDS.reviewer : ROLE_WORDS.executor)
/** Вкладка ждущего — то, что открыть: «033 exec» (задача и роль), «045 С4-3» (сессия задачи), иначе роль («integrator»). */
const tabRef = (s: Status) => (s.task ? `${refOf(s)} ${s.task.label ?? roleWord(s.task)}` : s.role)
/** Сессия методики закончена (сдана, передана, закрыта) и не ждёт владельца и не работает: в /crew — счётом «N done», как в панели
 *  (то же правило, что finished() в sidebarLines). */
const finishedSession = (s: Status) => !!s.task?.group && !!s.task.label && ["submitted", "handed", "cancelled"].includes(s.task.status) && s.state !== "owner" && s.state !== "question" && s.state !== "working"
/** Вид сессии методики по-английски: по коду из SESSION_KIND; код вне перечня — цель сессии как есть (содержимое), у исполнителя — нет. */
const kindOf = (t: NonNullable<Status["task"]>): string | undefined => (t.label ? (SESSION_KIND[t.label.replace(/-\d+$/, "")] ?? t.kind) : undefined)
/** Кто это в строке: «С2-5 spec review», «exec», «rev», роль вкладки без задачи (с названием, только если таких ролей в проекте несколько). */
const whoOf = (s: Status, dup: Set<string>): string => {
  const t = s.task
  if (t) return t.group && t.label ? `${t.label} ${kindOf(t) ?? roleWord(t)}` : roleWord(t)
  return dup.has(s.role) && s.title && s.title !== s.session ? `${s.role} · ${short(s.title, 24)}` : s.role
}
/** Состояние вкладки словом и возрастом: «waiting you 35m», «watch gate 12m», «reply from proj.integrator 50m». */
export function stateText(s: Status, now: number): string {
  const age = (t?: number) => (t ? ` ${ageText(t, now)}` : "")
  if (s.sys) return `${CREW_STATE_WORDS[s.sys === "hung" ? "hung" : "lost"]}${age(s.since)}`
  switch (s.state) {
    case "owner":
      return `${CREW_STATE_WORDS[s.gate ? "gate" : "owner"]}${s.dialog ? ` (${CREW_STATE_WORDS[s.dialog === "dead" ? "deadDialog" : "dialog"]})` : ""}${age(s.since)}`
    case "question":
      return `${CREW_STATE_WORDS[s.wait ? "paused" : "question"]}${age(s.since)}`
    case "working":
      return `${CREW_STATE_WORDS.working}${age(s.since)}`
    case "watch": {
      const w = s.watches[0]
      return `${CREW_STATE_WORDS[w && !w.started ? "queued" : "watch"]}${w?.note ? ` ${short(w.note, 30)}` : ""}${age(s.since)}${s.watches.length > 1 ? ` +${s.watches.length - 1}` : ""}`
    }
    case "reply":
      return `${CREW_STATE_WORDS.reply}${s.asked.length ? ` from ${s.asked.map((a) => a.to).join(", ")}` : ""}${age(s.since)}`
    case "task": {
      const t = s.task
      if (!t) return "task"
      if (t.label && ["submitted", "handed", "cancelled"].includes(t.status)) return CREW_STATE_WORDS[t.status === "submitted" ? "done" : t.status === "handed" ? "handed" : "closed"]
      return TASK_WORDS[t.status] ?? t.status
    }
    case "tasks":
      return s.idleTab ? `${CREW_STATE_WORDS.stalled}${age(s.idleTab.since)}` : `${CREW_STATE_WORDS.tasks} ${s.tasks.length}`
    default:
      return CREW_STATE_WORDS.idle
  }
}
/** Слова строки вкладки после состояния: шаг приёмки «3/13» (у приёмщика) и «⚠ stuck 9h» (застряла, задача 043). */
const extrasOf = (s: Status, now: number, holder?: Status): string => {
  const steps = holder === s && s.state !== "owner" && s.state !== "question" ? stepProgress(s.task)?.match(/\d+\/\d+/)?.[0] : undefined
  const k = s.stuck?.[0]
  return `${steps ? ` ${steps}` : ""}${k ? ` ⚠ stuck${k.at ? ` ${ageText(k.at, now)}` : ""}` : ""}`
}
/** Вопрос владельцу как есть, одной строкой; служебные тексты плагина (sys, ворота без фразы) вопросом не считаются. */
const questionOf = (s: Status): string | undefined => {
  if (s.state !== "owner" || s.sys) return undefined
  const q = s.gate ? (s.gateWait ? s.question?.replace(/^вопроса нет:\s*/, "") : undefined) : s.question
  return q?.replace(/\s+/g, " ").trim() || undefined
}
/** Значок строки: только у вкладок, которым нужно внимание (как в панели). */
const rowMark = (s: Status) => (s.state === "owner" || s.state === "question" || (s.idleTab && s.state === "tasks") ? `${markOf(s)} ` : "")

/** Текст /crew: проекты (свой первым), в проекте — сначала ждущие владельца. */
export function formatStatuses(list: Status[], now = Date.now(), first?: string): string {
  if (!list.length) return "No sessions yet: the service plugin has not written status/ yet."
  const byProject = new Map<string, Status[]>()
  for (const s of list) byProject.set(s.project ?? "?", [...(byProject.get(s.project ?? "?") ?? []), s])
  const names = [...byProject.keys()].sort((a, b) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)))
  const out: string[] = []
  const sleeping: string[] = []
  const sum = waitingLine(list, now)
  if (sum) out.push(sum)
  for (const p of names) {
    const items = byProject.get(p)!.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.title.localeCompare(b.title))
    // тихие вкладки без задачи (свободные, ждут своих задач) — в заголовке проекта: «proj · integrator idle», «proj · 3 idle»
    const quiet = items.filter((s) => !s.task && !s.stuck?.length && (s.state === "idle" || (s.state === "tasks" && !s.idleTab)))
    const body = items.filter((s) => !quiet.includes(s))
    const idle = quiet.filter((s) => s.state === "idle")
    const quietParts = [
      ...(idle.length ? [idle.length === 1 ? `${idle[0].role} ${CREW_STATE_WORDS.idle}` : `${idle.length} ${CREW_STATE_WORDS.idle}`] : []),
      ...quiet.filter((s) => s.state === "tasks").map((s) => `${s.role} ${stateText(s, now)}`),
    ]
    const lines: string[] = []
    const roles = body.filter((s) => !s.task).map((s) => s.role)
    const dup = new Set(roles.filter((r, i) => roles.indexOf(r) !== i))
    // строка вкладки: «значок кто  состояние возраст шаги ⚠»; вопрос владельцу — своей строкой под ней
    const row = (s: Status, pad: string, holder?: Status) => {
      lines.push(`${pad}${rowMark(s)}${whoOf(s, dup)}  ${stateText(s, now)}${extrasOf(s, now, holder)}`)
      const q = questionOf(s)
      if (q) lines.push(`${pad}    ↳ ${q}`)
    }
    // задача — одним заголовком (задачи 058, 064): номер и название целиком; под ним её вкладки по состоянию. Вкладки задачи без папки,
    // у которых нет вопроса владельцу, — на строке заголовка; сданные сессии задачи с папкой — счётом «N done»
    const tk = (s: Status) => (s.task ? (s.task.group ? `g${s.task.ref ?? s.task.n}` : `t${s.task.n}`) : undefined)
    const shown = new Set<string>()
    for (const s of body) {
      const key = tk(s)
      if (!key) {
        row(s, "  ")
        continue
      }
      if (shown.has(key)) continue
      shown.add(key)
      const group = body.filter((y) => tk(y) === key).sort((a, b) => ORDER[a.state] - ORDER[b.state] || Number(!!a.task?.ended) - Number(!!b.task?.ended))
      const lead = group[0]
      // шаги приёмки — один раз на задачу (задача 087): у приёмщика, а без него — на строке названия («шаги 3/13»)
      const { holder, orphan } = stepsPlace(group.filter((y) => !finishedSession(y)))
      const onTitle = orphan ? ` · шаги ${orphan.match(/\d+\/\d+/)?.[0] ?? ""}`.trimEnd() : ""
      // маршрут (задача 092): у быстрой задачи — слово «быстрый» на строке названия, под ней предупреждение решения 51
      const title = `${refOf(s)} ${titleText(s.task!.title)}${group.some((x) => x.task?.route) ? ` · ${ROUTE_RU.fast}` : ""}`
      const staleLine = group.some((x) => x.task?.routeStale) ? `    ⚠ ${STALE_WARNING}` : undefined
      if (s.task!.group) {
        const done = group.filter(finishedSession).length
        lines.push(`  ${title}${onTitle}${done ? ` · ${done} ${CREW_STATE_WORDS.done}` : ""}`)
        if (staleLine) lines.push(staleLine)
        for (const x of group.filter((y) => !finishedSession(y))) row(x, "    ", holder)
      } else if (group.some((x) => x.state === "owner" || x.state === "question")) {
        lines.push(`  ${rowMark(lead)}${title}${onTitle}`.trimEnd())
        if (staleLine) lines.push(staleLine)
        for (const x of group) row(x, "    ", holder)
      } else {
        lines.push(`  ${title}${onTitle} — ${group.map((x) => `${whoOf(x, dup)} ${stateText(x, now)}${extrasOf(x, now, holder)}`).join(" · ")}`)
        if (staleLine) lines.push(staleLine)
      }
    }
    // планы: ждущий согласования владельца — своей строкой, остальные — счётчиком
    const plans = plansOf(p)
    for (const t of plans.approval) lines.push(`  ◇ plan ${t.plan!.n} ${t.title.replace(/^план \S+: /, "")} — ${TASK_WORDS.approval}${t.plan!.stuck ? " (rounds out)" : ""} · /plans`)
    // проект, где ничего не идёт (только свободные вкладки, счётчиков нет), — в одну последнюю строку «idle: …»
    // ветка и каталог окон (задача 157): красная строка расхождения, жёлтая — смена с причиной за сутки; окна на своих местах — одной серой строкой
    const branch = branchRows(BASE, p, now)
    if (branch.some((r) => r.tone !== "muted")) lines.push(...branch.map((r) => `  ${r.text}`))
    // срок шага задачи вышел (задача 161, idle-watch.ts): «шаг стоит N мин, срок вышел» и «срок вышел, вопрос открыт»
    lines.push(...stepRows(now, { project: p }).map((r) => `  ${r.text}`))
    const counters = countersOf(p, items, plans.other, now)
    if (!lines.length && !counters && !quiet.some((s) => s.state === "tasks")) {
      sleeping.push(p)
      continue
    }
    out.push([p, ...quietParts, ...(counters ? [counters] : [])].join(" · "), ...lines)
  }
  if (sleeping.length) out.push(`${CREW_STATE_WORDS.idle}: ${sleeping.join(", ")}`)
  return out.join("\n")
}

/** Строка-счётчик проекта: всё, что не вкладка и не вопрос владельцу. Каждый счётчик называет номера и часы там, где их мало; подробности —
 *  в своих местах (README плагина, «/crew»): crew_task list / show, /plans, /crew-doctor, панель. Нет ничего — undefined. */
function countersOf(project: string, items: Status[], otherPlans: number, now: number): string | undefined {
  const parts: string[] = []
  if (otherPlans) parts.push(`plans ${otherPlans}`)
  const un = uncleanedOf(project, now)
  if (un.length) parts.push(`uncleaned ${un.map((u) => `${u.ref} ${u.age}`).join(", ")}`)
  const rp = reportsOf(project, now)
  if (rp.length) parts.push(`reports ${rp.join(" ")}`)
  const stale = items.reduce((n, s) => n + (s.askedStale?.length ?? 0), 0)
  if (stale) parts.push(`stale asks ${stale}`)
  const loops = items.filter((s) => s.loop).length
  if (loops) parts.push(`${LOOP_WORD}: ${loops}`)
  const an = answerCounts(project, now)
  if (an?.auto) parts.push(`answers ${an.auto} (${an.stepped} owner)`)
  if (an?.forYou) parts.push(`for you ${an.forYou}`)
  if (an?.forms) parts.push(`form answers ${an.forms}`)
  if (an?.formsToYou) parts.push(`form to you ${an.formsToYou} (${an.formsWhy})`)
  const lw = lockWaiters(project)
  if (lw.length) parts.push(`lock ${lw.map((x) => `${taskNo({ project, n: x.n })} ${ageText(x.at, now)}`).join(", ")}`)
  const diverge = !!divergenceLineFor(project)
  const bare = !!unconfiguredLineFor(project)
  if (diverge) parts.push("⚠ off-branch")
  if (bare) parts.push("⚠ no models")
  if (diverge || bare) parts.push("/crew-doctor")
  return parts.length ? parts.join(" · ") : undefined
}

/** Принятые и не убранные после всех напоминаний (задача 043, M18a): «005 28h» — в счётчике «uncleaned». */
export function uncleanedOf(project: string, now = Date.now()): { ref: string; age: string }[] {
  let list: Task[] = []
  try {
    list = listTasks(project).filter((t) => t.status === "accepted" && acceptedReminders(t) >= ACCEPTED_REMINDERS_MAX)
  } catch {}
  return list.map((t) => ({ ref: taskNo(t), age: ageText(acceptedAt(t), now) }))
}

const short = (x: string, n: number) => {
  const one = x.replace(/\s+/g, " ").trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}
/** Планы проекта для /crew (план 004): на согласовании владельца — approval, остальные (на перепроверке, в работе) — числом other. */
export function plansOf(project: string): { approval: Task[]; other: number } {
  let list: Task[] = []
  try {
    list = listTasks(project).filter((t) => t.plan && !(t.status === "done" && t.plan.finished) && t.status !== "cancelled")
  } catch {}
  const approval = list.filter((t) => t.status === "approval")
  return { approval, other: list.length - approval.length }
}

const REPORT_MS = 24 * 3_600_000
/** Отчёты приёмки за сутки: задачи, принятые или влитые с шагами (до трёх, свежие первыми) — в счётчике «reports NNN»; шаги — crew_task show. */
export function reportsOf(project: string, now = Date.now()): string[] {
  let done: Task[] = []
  try {
    done = listTasks(project).filter((t) => ["accepted", "done"].includes(t.status) && t.checks && now - t.updated < REPORT_MS)
  } catch {}
  return done.sort((a, b) => b.updated - a.updated).slice(0, 3).map((t) => taskNo(t))
}

// БОКОВАЯ ПАНЕЛЬ ОКНА (план 003.2, 2026-10-06; владелец: «в этой области можно выводить активные сессии и обновлять в
// реальном времени?»). Строки блока «Crew» под «Context»: кто чего ждёт в проекте вкладки на экране, ждущие владельца
// первыми. Чистая функция — рисует sidebar.tsx, проверяет тест.
/** Строка панели. what — её текст; lead — то, что печатается перед ним (у строки вкладки: «↳ прм  », «интегр.   »; у остальных
 *  нет), mark и who остаются для логики (какая вкладка, её значок). Иерархия панели — знаком и цветом, не отступом (задача 068;
 *  владелец, 2026-10-17: «сейчас показывается каша», «название задачи белым цветом, под элементы серым»): название задачи — тон
 *  base, продолжение названия — «· », всё под задачей — тон muted и начинается со знака «↳», тон accent — у вкладки, что ждёт
 *  владельца, и у строк «⚠». Ни одна строка не начинается пробелом. */
export type SideRow = { mark: string; who: string; what: string; tone: "accent" | "base" | "muted" | "error" | "warn"; lead?: string }
/** Строка панели как она печатается (ширина панели ~32 знака: длиннее — перенос, и список выглядит разрезанным; OpenCode
 *  2.0.23 даёт панели 42 колонки, под текст после отступов — около 37).
 *
 *  ПОЧЕМУ НЕ ОТСТУПАМИ (разбор задачи 068, по исходникам OpenTUI и пробному рендеру, а не по догадке). Начальные пробелы строки
 *  отрисовщик окна НЕ отбрасывает: текст `<text>` проходит TextNodeRenderable → StyledText → текстовый буфер без обрезки, и тестовый
 *  рендер (тот же OpenTUI под Bun) печатает «  исп  работает» и «    ↳ шаги» ровно как строку, в том числе внутри прокручиваемого
 *  блока панели и после обновления сигнала. Теряется другое: когда строка длиннее блока, перенос по словам (wrapMode «word» по
 *  умолчанию) начинает продолжение с первой колонки, без отступа, — поэтому строки не длиннее SIDE_WIDTH. А «каша» — наш рисунок:
 *  заголовок задачи без значка, продолжение названия и строка роли начинались с одних и тех же двух пробелов, то есть стояли в одной
 *  колонке; отступ — слабый признак вложенности, на него нельзя класть смысл. Поэтому правило одно: строка сама говорит, кто она
 *  (значок, «·», «↳», «⚠»), и красится в свой тон, а sideText не добавляет пробелов ни к одной строке. */
export const SIDE_WIDTH = 32
export const sideText = (r: SideRow, width = SIDE_WIDTH) => `${r.lead ?? ""}${r.what}`.slice(0, width)
/** Название задачи для показа: без разметки и кавычек «», одной строкой. */
export const titleText = (t: string) => t.replace(/[`*_«»]/g, "").replace(/\s+/g, " ").trim()
/** Перенос по словам (задача 064, п. 6; владелец, 2026-10-17: «по рекомендации» — «название первой строкой, перенос не больше
 *  чем на две строки, дальше «…»»): не больше max строк шириной width; не влезло — последняя строка кончается «…». Слово длиннее
 *  строки режется. */
export function wrapWords(text: string, width: number, max = 2): string[] {
  const words = text.split(" ").filter(Boolean)
  const lines: string[] = []
  let cur = ""
  let i = 0
  while (i < words.length && lines.length < max) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (next.length <= width) {
      cur = next
      i++
      continue
    }
    if (!cur) {
      cur = words[i].slice(0, width)
      words[i] = words[i].slice(width)
    }
    lines.push(cur)
    cur = ""
  }
  if (cur) lines.push(cur)
  if (i < words.length && lines.length) {
    let last = lines[lines.length - 1]
    while (last.length + 1 > width && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "))
    lines[lines.length - 1] = `${last.slice(0, width - 1)}…`
  }
  return lines
}
const WORD_OF_TASK: Record<string, string> = { submitted: "✓ сдана", reviewing: "✓◐ приёмка", rework: "↻ доработка", approval: "◇ согласование", accepted: "✓✓◐ влита", running: "в работе", starting: "запуск", idle: "ждёт сессии", handed: "↷ передана" }
const SIDE_MAX = 9
/** «что» ждущей вкладки с длительностью ожидания (задача 068, п. 3; владелец, 2026-10-17: «⧗ ждать отдель… 580м» теряет суть): сначала суть,
 *  время ожидания — в конце последней строки. Суть переносится по словам не больше чем на две строки шириной width; не влезла
 *  вместе со временем — обрезается суть («…»), время остаётся. Нет времени (since) — суть как есть. */
export function waitText(text: string, since: number | undefined, now: number, width = 20): string[] {
  const lines = wrapWords(text, width)
  if (!since || !lines.length) return lines.length ? lines : [text]
  const dur = ` ${Math.max(0, Math.round((now - since) / 60_000))}м`
  const last = lines[lines.length - 1]
  if (last.length + dur.length <= width) lines[lines.length - 1] = `${last}${dur}`
  else {
    const room = width - dur.length - 1
    lines[lines.length - 1] = `${last.replace(/…$/, "").slice(0, room).trimEnd()}…${dur}`
  }
  return lines
}
export function sidebarLines(list: Status[], now = Date.now(), project?: string, width = SIDE_WIDTH): { title: string; rows: SideRow[]; foot: string } {
  const mine = project ? list.filter((s) => (s.project ?? "?") === project) : list
  // панель узкая (~32 знака): кто — до 9 знаков, что — до 20, иначе строка переносится
  const who = (s: Status) => (s.task ? `${refOf(s)} ${s.task.as === "reviewer" ? "прм" : "исп"}` : s.role === "integrator" ? "интегр." : s.role.slice(0, 9))
  // ход без обновления дольше порога (задача 111; порог записан в статус плагином, long_turn_minutes; 0 или нет — не «завис?»); строго больше
  const isLong = (s: Status) => s.state === "working" && !!s.since && !!s.longTurnMs && now - s.since > s.longTurnMs
  const what = (s: Status): string => {
    switch (s.state) {
      case "owner":
        return s.gate ? (s.gateWait ? "решение, вопроса нет" : "ворота, вопроса нет") : s.dialog === "dead" ? `диалог закрыт ${hm(s.since)}` : `ждёт вас ${hm(s.since)}`
      case "question":
        return s.wait ? "ждёт указаний" : "вопрос — ждёт ответа"
      case "working":
        // ход давно не обновлялся (задача 111): «завис? 42ч», а не «работает 2540 мин»
        if (isLong(s)) return `завис? ${now - s.since! >= 3_600_000 ? `${Math.floor((now - s.since!) / 3_600_000)}ч` : `${Math.floor((now - s.since!) / 60_000)}м`}`
        return s.since ? `работает ${minutes(s.since, now)}` : "работает"
      case "watch":
        return s.watches[0] && !s.watches[0].started ? `⧗ очередь: ${s.watches[0].note ?? "машина"}` : `⧗ ${s.watches[0]?.note ?? "наблюдение"}`
      case "reply":
        return `ждёт ответа от ${s.asked[0]?.to ?? "?"}`
      case "task":
        // приёмщик задачи на доработке ждёт её (задача 064, п. 8: «прм  ↻ ждёт доработки»)
        return s.task ? (s.task.as === "reviewer" && s.task.status === "rework" ? "↻ ждёт доработки" : (WORD_OF_TASK[s.task.status] ?? s.task.status)) : "задача"
      case "tasks":
        return s.idleTab ? `простаивает ${Math.max(0, Math.round((now - s.idleTab.since) / 60_000))}м` : `ждёт задач (${s.tasks.length})`
      default:
        return "свободна"
    }
  }
  const sorted0 = mine.slice().sort((a, b) => ORDER[a.state] - ORDER[b.state] || who(a).localeCompare(who(b)))
  // ЗАДАЧА — ОДНИМ ЗАГОЛОВКОМ (задача 058; задача 064, п. 8; владелец, 2026-10-17, «по рекомендации»): вкладки одной задачи подряд, под
  // строкой «номер название» — на месте самой важной из них. У задачи с папкой — по номеру папки, без папки — по номеру задачи.
  // Законченные сессии задачи с папкой (сданы, переданы, закрыты; не ждут вас и не работают) — одной строкой «✓ сдано N сессий» под
  // живыми, в счёт строк панели (SIDE_MAX) не идут; полный список — в /crew
  const tkey = (s: Status) => (s.task ? (s.task.group ? `g${s.task.ref ?? s.task.n}` : `t${s.task.n}`) : undefined)
  const finished = (s: Status) => !!s.task?.group && !!s.task.label && ["submitted", "handed", "cancelled"].includes(s.task.status) && s.state !== "owner" && s.state !== "question" && s.state !== "working"
  const live = sorted0.filter((s) => !finished(s))
  const sorted: Status[] = []
  for (const s of live) {
    const k = tkey(s)
    if (!k) sorted.push(s)
    else if (!sorted.some((x) => tkey(x) === k)) sorted.push(...live.filter((x) => tkey(x) === k).sort((a, b) => ORDER[a.state] - ORDER[b.state] || Number(!!a.task?.ended) - Number(!!b.task?.ended) || who(a).localeCompare(who(b))))
  }
  // вкладка, которой нужно внимание (ждёт вас, задала вопрос, простаивает): тон accent; иначе строка вкладки без задачи — base
  // (idle — muted), а строка под названием задачи — muted (задача 068)
  const needs = (s: Status) => s.state === "owner" || s.state === "question" || !!s.idleTab || isLong(s)
  const toneOf = (s: Status) => (needs(s) ? "accent" : s.state === "idle" ? "muted" : "base") as SideRow["tone"]
  const subTone = (s: Status) => (needs(s) ? "accent" : "muted") as SideRow["tone"]
  const rows: SideRow[] = []
  // «Ждут вас» на все окна (по всем проектам, не только по этому): сколько и с какого времени, кто ждёт дольше всех, начало вопроса
  rows.push(...waitingRows(list, width))
  // название задачи — первой строкой (задача 064, п. 6; владелец, 2026-10-17: «непонятно что за задачи, я по памяти не помню,
  // показывай название задачи»): номер и название, перенос по словам не больше чем на две строки, дальше «…». У задачи с папкой —
  // без значка (значки — у сессий), у задачи без папки — значок самой важной вкладки (first: она первая в группе). Название —
  // тон base (accent — если эта вкладка ждёт вас), продолжение названия начинается с «· » вместо пробелов (задача 068)
  const heading = (first: Status) => {
    const g = first.task!.group
    wrapWords(`${refOf(first)} ${titleText(first.task!.title)}${first.task!.route ? ` · ${ROUTE_RU.fast}` : ""}`, width - 2).forEach((l, k) => {
      const m = k || g ? " " : (markOf(first) ?? " ")
      rows.push({ mark: m, who: "", what: k ? `· ${l}` : m.trim() ? `${m} ${l}` : l, tone: g || !needs(first) ? "base" : "accent" })
    })
    // решение 51 (задача 092): постановка изменена после слова завода — две строки под названием
    if (first.task!.routeStale) for (const l of ["⚠ правка после слова завода", "↳ нужно новое слово владельца"]) rows.push({ mark: " ", who: "", what: l, tone: "accent" })
  }
  const doneRow = (k: string) => {
    const n = sorted0.filter((x) => finished(x) && tkey(x) === k).length
    if (n) rows.push({ mark: " ", who: "", what: `↳ ✓ сдано ${n} ${n % 10 === 1 && n % 100 !== 11 ? "сессия" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "сессии" : "сессий"}`, tone: "muted" })
  }
  const shown = sorted.slice(0, SIDE_MAX)
  // строка шагов приёмки — один раз на задачу (задача 087; владелец, 2026-10-18: «почему повторяются суб-записи»): у приёмщика, а без
  // приёмщика среди показываемых вкладок — одна строка под названием задачи; у исполнителя и других сессий её нет
  const placed = new Map<string, ReturnType<typeof stepsPlace>>()
  for (const s of shown) {
    const k = tkey(s)
    if (k && !placed.has(k)) placed.set(k, stepsPlace(shown.filter((x) => tkey(x) === k)))
  }
  let last: string | undefined
  shown.forEach((s, idx) => {
    const k = tkey(s)
    if (k && k !== last) {
      heading(s)
      const orphan = placed.get(k)?.orphan
      if (orphan) wrapWords(orphan, width - 2).forEach((l) => rows.push({ mark: " ", who: "", what: `↳ ${l}`, tone: "muted" }))
    }
    last = k
    const g = !!s.task?.group
    const plain = s.task && !g ? s.task : undefined
    // строка под названием задачи — тон muted, accent у ждущей вкладки; вкладка без задачи (интегратор) — своя строка со значком
    const tone = s.task ? subTone(s) : toneOf(s)
    const mark = markOf(s) ?? " "
    const shownMark = mark.trim() ? `${mark} ` : ""
    // работающая сессия без задачи названа по своей карточке (задача 111; владелец, 2026-10-19: «почему это не написано?» про «worker 2540 мин»):
    // название над строкой роли, тон base, перенос и «…» как у названия задачи; нет названия или оно равно роли — только роль, как раньше
    if (!s.task && s.state === "working" && s.role !== "integrator") {
      const name = titleText(s.title ?? "")
      // не название: пусто, роль, номер сессии («ses_…»), заготовка OpenCode («New session - …»)
      if (name && name !== s.role && !/^ses_?[A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(name) && !/^(?:new|child) session\b/i.test(name)) wrapWords(name, width - 2).forEach((l, i) => rows.push({ mark: " ", who: "", what: i ? `· ${l}` : l, tone: "base" }))
    }
    const role = s.task ? (s.task.as === "reviewer" ? "прм" : "исп") : ""
    // сессия методики с видом (задача 064, п. 7): «↳ С2-5 проверка спецификации» строкой (перенос — как у названия), состояние — под ней
    const kind = g && s.task!.label && s.task!.kind ? `${shownMark}${s.task!.label} ${s.task!.kind}` : undefined
    if (kind) wrapWords(kind, width - 2).forEach((l, i) => rows.push({ mark: i ? " " : mark, who: "", what: `↳ ${l}`, tone }))
    // что печатается перед текстом строки: «↳ прм  » (вкладка задачи), «↳ ? С4-3  » (сессия задачи с папкой), «↳ » (состояние сессии
    // с видом), «? интегр.   » (вкладка без задачи)
    const lead = kind ? "↳ " : plain ? `↳ ${role}  ` : g ? `↳ ${shownMark}${s.task!.label ?? role}  ` : `${shownMark}${who(s).padEnd(9).slice(0, 9)} `
    // приёмка по шагам: «проверка 3/13: fixture — название» вместо «работает», переносом по словам; ждущая вкладка (наблюдение, очередь
    // машины, ответ) показывает, чего ждёт, и сколько (суть, время в конце: waitText); шаги — строкой под ней
    const stepsLine = k && placed.get(k)?.holder === s && s.state !== "owner" && s.state !== "question" ? stepProgress(s.task) : undefined
    const waiting = s.state === "watch" || s.state === "reply"
    const prog = waiting ? undefined : stepsLine
    const room = width - lead.length
    const text = prog ? wrapWords(prog, room) : waiting ? waitText(what(s), s.since, now, room) : [short(what(s), room)]
    rows.push({ mark, who: g ? (s.task!.label ?? role) : who(s), what: text[0], tone, lead })
    for (const l of text.slice(1)) rows.push({ mark: " ", who: "", what: `↳ ${l}`, tone })
    // простой (задача 063): что стоит — строкой под вкладкой
    if (s.idleTab && s.state === "tasks") rows.push({ mark: " ", who: "", what: `↳ ${short(s.idleTab.what.join("; "), width - 2)}`, tone: "muted" })
    // вопрос или фраза ожидания сессии задачи — строкой под ней (задача 056): видно, о чём она стоит
    if (s.state === "question" && s.question) rows.push({ mark: " ", who: "", what: `↳ ${short(s.question.replace(/[`*_]/g, ""), width - 2)}`, tone: "muted" })
    if (waiting && stepsLine) rows.push({ mark: " ", who: "", what: `↳ ${short(stepsLine, width - 2)}`, tone: "muted" })
    // застряла (задача 043, L3): строка, пока признак не снят
    if (s.stuck?.length) rows.push({ mark: " ", who: "", what: s.stuck[0].at ? `⚠ застряла с ${hm(s.stuck[0].at)}` : "⚠ застряла", tone: "accent" })
    if (g && k && tkey(shown[idx + 1] ?? ({} as Status)) !== k) doneRow(k)
  })
  // задачи с папкой, у которых все сессии закончены: заголовок и строка «✓ сдано N»
  const folded = new Set<string>()
  for (const s of sorted0.filter(finished)) {
    const k = tkey(s)!
    if (live.some((x) => tkey(x) === k) || folded.has(k)) continue
    folded.add(k)
    heading(s)
    doneRow(k)
  }
  const auto = answerSideRow(project, now)
  if (auto) rows.push(auto)
  const lw = project ? lockWaitLine(project, now) : undefined
  if (lw) rows.push({ mark: " ", who: "", what: lw.replace(/ мин\)/g, "м)"), tone: "accent" })
  const dv = project ? divergenceLineFor(project) : undefined
  if (dv) rows.push({ mark: " ", who: "", what: dv.replace("⚠ настройки не на ветке:", "⚠ не на ветке:"), tone: "accent" })
  const uc = project ? unconfiguredLineFor(project) : undefined
  if (uc) rows.push({ mark: " ", who: "", what: uc, tone: "accent" })
  // окна не на своей ветке (красные) и недавние смены с причиной (жёлтые), задача 157
  for (const r of branchSideRows(BASE, project, now)) rows.push({ mark: " ", who: "", what: r.text, tone: r.tone === "muted" ? "muted" : r.tone })
  // срок шага вышел (задача 161): короткая строка на задачу
  for (const r of stepSideRows(now, { project })) rows.push({ mark: " ", who: "", what: r.text, tone: r.tone === "muted" ? "muted" : r.tone })
  // «ход» — модель думает сейчас; «ждут» — наблюдения (гейты, коммит в main), из них в очереди машины — ещё не запущены
  const working = mine.filter((s) => s.state === "working").length
  const watching = mine.filter((s) => s.state === "watch").length
  const queued = mine.filter((s) => s.state === "watch" && s.watches[0] && !s.watches[0].started).length
  const more = sorted.length > SIDE_MAX ? ` · +${sorted.length - SIDE_MAX}` : ""
  // «ждут» - то же число, что «Ждут вас» (задача 084; владелец видел «Ждут вас: 2» и внизу «ждут 0»); наблюдения - отдельным значком ⧗, как в строках
  const watch = watching ? ` · ⧗ ${watching}${queued ? ` (очередь ${queued})` : ""}` : ""
  return { title: `Crew${project ? ` · ${project}` : ""}`, rows, foot: `ход ${working} · ждут ${waitingOf(list).length}${watch}${more} · /crew` }
}

/** Текст /crew-doctor: последняя самопроверка сервиса (DOCTOR_FILE) и её время. */
export function doctorText(d: { at: number; problems: string[]; notes?: string[] } | undefined, now = Date.now()): string {
  if (!d?.at) return "Самопроверки ещё не было: сервис делает её через 10 с после запуска плагина и раз в 10 минут."
  const when = `проверено в ${hm(d.at)} (${minutes(d.at, now) || "0 мин"} назад)`
  const notes = d.notes?.length ? `\n\nК сведению:\n${d.notes.map((p) => `- ${p}`).join("\n")}` : "" // справка низкой важности, не проблема
  if (!d.problems?.length) return `Всё в порядке: окна отмечаются, ящик пишется, настройки проектов читаются, нужные возможности OpenCode на месте.${notes}\n\n${when}`
  return `Есть проблемы:\n${d.problems.map((p) => `- ${p}`).join("\n")}${notes}\n\n${when}`
}
