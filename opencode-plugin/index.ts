// plugins/nova-peers — переписка между окнами (сессиями) OpenCode во ВСЕХ репозиториях.
//
// ЗАЧЕМ. В Claude Code окна говорили через `/crew` и `SendMessage` по ИМЕНИ сессии,
// а имя менялось при каждом перезапуске, поэтому держались ещё визитки
// (`scripts/tools/session-card.sh`). В OpenCode ни того, ни другого нет; плагин
// команд Ensemble на V2 не работает (hueyexe/opencode-ensemble#40). Решение
// владельца 2026-10-03: свой плагин, адресат — РОЛЬ, а не имя.
//
// УСТРОЙСТВО. Ящик — в каталоге данных OpenCode (`$XDG_DATA_HOME/opencode/nova-peers`,
// иначе `~/.local/share/opencode/nova-peers`): он один на машину, его видят окна
// любого репозитория, и он не лежит ни в одном из них (не попадает ни в индекс, ни
// под грепы стражей). Первая версия держала ящик в общем `.git` одного репозитория —
// окна разных репозиториев друг друга не видели (замер 2026-10-03).
//   cards/<сессия>.json   — визитка: роль, заголовок, каталог, процесс, отметка жизни;
//   inbox/<адрес>/*.json  — непрочитанные письма; адрес — роль или id сессии;
//   read/<адрес>/*.json   — доставленные (история для `crew_inbox`).
// Доставка — переносом файла из inbox в read (rename атомарен): письмо уходит
// ровно одной сессии, даже если плагин загружен в нескольких процессах.
//
// РОЛЬ. Окно без назначенной роли получает её САМО: `assistant-<6 знаков id>`
// (слово владельца 2026-10-03). Назначенная (`crew_role`) хранится в визитке и
// переживает перезапуск сессии с тем же id. Занятая живой сессией роль не
// отбирается без `force`. Субагенты (сессии с родителем) визиток не получают.
//
// ДОСТАВКА. Раз в POLL_MS процесс проверяет ящики СВОИХ сессий и кладёт письмо в
// сессию очередным сообщением (`delivery: "queue"`): простаивающее окно
// просыпается, занятое прочтёт после текущего хода. Отправка своей же сессии в том
// же процессе доставляется сразу, без ожидания опроса.

//
// ОКНА claude-code. Провайдер claude-code отбрасывает инструменты OpenCode; им те же инструменты даёт
// MCP-сервер mcp.ts поверх того же ядра (core.ts). Получение писем у них работает и так — через
// session.prompt этого плагина.

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, watch, writeFileSync } from "node:fs"
import path from "node:path"
import { overdueProblems } from "./open-questions.ts"
import {
  type Card,
  type Letter,
  POLL_MS,
  QUEUE,
  INBOX,
  READ,
  BASE,
  DEFAULT_ROLE,
  normalizeRole,
  reviewerRole,
  reviewSessionLimit,
  holdsOpenTask,
  DEFAULT_SPAWN_MODELS,
  settingsContext,
  lastTurn,
  turnEnd,
  idleAt,
  openTurn,
  staleBusy,
  hungTurn,
  recentRows,
  insideDir,
  taskPlace,
  PROCESS_START,
  userAfter,
  hhmm,
  MODEL_TTL_MS,
  log,
  repoLabel,
  parseProjects,
  projectOf,
  roleKey,
  holdsExclusive,
  loadConfig,
  tierOf,
  pickHolder,
  fmtModel,
  modelFromDb,
  idleAfter,
  safeKey,
  readJson,
  cardFile,
  allCards,
  asksOpen,
  saveCard,
  pidAlive,
  postLetter,
  claimLetters,
  confirmLetters,
  releaseLetters,
  recoverClaims,
  formatLetters,
  waitingIn,
  hasQuietIn,
  waitingFor,
  liveWindows,
  tabOf,
  isBusy,
  mayWakeCard,
  postNotice,
  short,
  sessionLabel,
  addObligation,
  obligationsOf,
  settleObligation,
  askedClosedWhy,
  ASKED_STALE_MS,
  saveObligations,
  clearStuck,
  commonDoctor,
  DOCTOR_FILE,
  settingsProblems,
  helpFor,
  saveProjects,
  setProjects,
  makeTools,
  sessionFromDb,
  formatTaskLetter,
  postExpected,
  propagateToParent,
  PLUGIN_SENDER,
  stampClamp,
  stampProfile,
  ownerWordAfter,
  workedAfter,
  lastUserAt,
  idleFactsAfter,
  pendingTool,
  letterExistsFor,
} from "./core.ts"
import { answerTurn, markInterventions } from "./answer.ts"
import { answerModesOn } from "./answer-parse.ts"
import { DECISION_RU, readApprovals, removeApproval } from "./approvals.ts"
import { runRetention } from "./retention.ts"
import { allSteps, nextPlanNumber, parsePlan, stepDeps } from "./plans.ts"
import { dropWatch, openWatchesBySession, pollWatches, requestWatch, watchesOf } from "./watch.ts"
import { type Status, endOfTurn, endsWithQuestion, markNotified, readStatuses, removeStatus, saveStatus, statusOf, withIdle } from "./status.ts"
import { clearGate, GATE_LETTER, gateOf, markGateLetter, noteGate, WAIT_LETTER } from "./gate-stop.ts"
import { clearIdle as clearIdleTab, holdIdle, idleBlockers, idleLetter, idleOf, idleWhat, waitsOn } from "./idle-tab.ts" // clearIdle в setup — снятие занятости карточки
import { type Task, taskRef, acceptedAt, ago, byPriority, createTask, rounds, slugify, isOpen, letterExists, listTasks, loadTask, plannedSessionId, saveTask, statusRu, taskEvent, taskLetterId, tasksChanged } from "./tasks.ts"
import { countedOpen, waitingCleanup, ACCEPTED_REMINDERS_MAX, acceptedReminderId, acceptedReminders, letterTime } from "./tasks.ts"
import { EXECUTOR_CODE, sesLabel, sessionOf, sessionRef, taskNo } from "./tasks.ts"
import { profileProblems, profileState, stateSignature, syncProjectFiles, syncSnapshot, syncTaskFile } from "./profile-layer.ts"
import { cellOfState, clampTier, resolveStageProfile, splitLaunchModel, stageOfLaunch, tabFitsCell } from "./profiles.ts"
import { allForms, cleanupForms, formReminders, formTick, pendingForms, settleOnRequest, startFormWait } from "./form-wait.ts"
import { systemToast } from "./toast-win.ts"
import { probeEnabled, startEventProbe } from "./event-probe.ts"
import { catalogModels, writeCatalog } from "./model-catalog.ts"
import { forEachBudget, background, stepBudget } from "./async-git.ts"
import { ensureWorktree, fileAtAsync, gitTraces, leftoversOf, mergeHolder, mergeLockAbandoned, reviewLetter, wakeLockWaiters } from "./review.ts"
import { precheckLines, releaseLandedLock } from "./precheck.ts"
import { isLauncherCard, noteLoopLag, registerJournalTools } from "./journal.ts"
import { answerTick } from "./owner-answer.ts"
import { writeLaunch } from "./task-folders.ts"
import { type ResumeTry, RESUME_WINDOW_MS, canInterrupt, interruptTurn, resumeLetter, resumeNote, resumeVerdict } from "./hung-resume.ts"

export { parseProjects, projectOf, parseAddr, HELP, helpFor } from "./core.ts"

export default {
  id: "crew-harness",
  async setup(ctx: any) {
    const mine = new Map<string, Card>() // сессии этого процесса
    const children = new Set<string>()
    const projects = parseProjects(ctx?.options)
    setProjects(projects, ctx?.options?.local)
    saveProjects(ctx?.options) // для MCP-сервера вкладок claude-code: список проектов один
    // задача 034: дальше стартового чтения настройки и файл приёмки обновляются в фоне (асинхронный git), цикл службы не ждёт
    background.on = process.env.CREW_HARNESS_SYNC_GIT !== "1"
    // Проект визитки: записанный в ней (вкладка сама ставит его при каждом обращении) или вычисленный по каталогу.
    const projOf = (c: Card) => c.project ?? projectOf(c.directory, projects)
    const keyOf = (c: Card) => roleKey(projOf(c), normalizeRole(c.role)) // старые визитки с assistant — это worker
    const now = () => Date.now()

    async function sessionInfo(sessionID: string): Promise<any> {
      try {
        const r = await ctx.session.get({ sessionID })
        return r?.data ?? r
      } catch {
        return undefined
      }
    }

    // Визитка сессии: создаётся при первом обращении, отметка жизни — при каждом.
    async function touch(sessionID: string, ev?: any): Promise<Card | undefined> {
      if (!sessionID || children.has(sessionID)) return undefined
      // ФАЙЛ ПЕРВЫМ, память — только запасом. Визитку правят и ДРУГИЕ сессии (crew_role force переписывает роль
      // прежнего владельца); память процесса записала бы старую роль поверх (замер 2026-10-03).
      let card = readJson<Card>(cardFile(sessionID)) ?? mine.get(sessionID)
      if (!card) {
        const info = await sessionInfo(sessionID)
        if (info?.parentID) {
          children.add(sessionID)
          return undefined
        }
        const directory = String(info?.location?.directory ?? info?.directory ?? ctx?.location?.directory ?? "")
        card = { session: sessionID, role: DEFAULT_ROLE, auto: true, title: String(info?.title ?? ""), directory, repo: repoLabel(directory), pid: process.pid, updated: now() }
        log(`card new ${sessionID} role=${card.role} repo=${card.repo}`)
      }
      if (!card.repo) card.repo = repoLabel(card.directory)
      // каждый раз: список проектов мог поменяться. Вкладка задачи или приёмки — проект своей задачи, где бы ни лежал
      // её worktree (worktree claude-limits в nv-lang/worktrees — под корнем nova; 2026-10-06)
      card.project = card.task?.project ?? card.review?.project ?? projectOf(card.directory, projects)
      // каталог папок задач проекта (tasks_dir, задача 058) — для блока «Ход работ» окна: окно настроек проекта не читает
      try {
        const td = loadConfig(card.directory).tasksDir
        if (card.tasksDir !== td) card.tasksDir = td
      } catch {}
      // МОДЕЛЬ. Запрос (ev.model из хука запроса) главнее; запас — база (модель прошлого хода).
      const fromRequest = fmtModel(ev?.model)
      if (fromRequest) {
        card.model = fromRequest
        card.modelAt = now()
        card.modelFrom = "request"
      } else if (card.modelFrom !== "request" && (!card.model || now() - (card.modelCheckedAt ?? 0) > MODEL_TTL_MS)) {
        const db = await modelFromDb(sessionID)
        if (db) {
          card.model = db.model
          card.modelAt = db.at
          card.modelFrom = "db"
        }
        card.modelCheckedAt = now()
      }
      card.pid = process.pid
      card.updated = now()
      saveCard(card)
      mine.set(sessionID, card)
      return card
    }

    // ДОСТАВКА — без лишних ходов модели. Замеры 2026-10-05 на OpenCode 2.0.22:
    //  - session.prompt({resume: false}) кладёт письмо в очередь, но при следующем сообщении оно становится
    //    ОТДЕЛЬНЫМ шагом модели (лишний вызов);
    //  - session.synthetic({resume: false}) у свободной вкладки ждёт и встаёт перед следующим сообщением В ТОМ ЖЕ
    //    шаге (провайдер claude-code отдаёт Claude Code все такие сообщения); у занятой — становится шагом после
    //    текущего, поэтому занятой вкладке ничего не отправляем, письма ждут конца хода.
    // Отсюда: вкладка свободна — будящие письма (с ними и ждущие тихие) одним session.prompt, только вкладке, открытой
    // в живом окне, или сессии под задачу (core.ts, «ПРИСУТСТВИЕ»); одни тихие — session.synthetic без хода.
    // Ответ, которого получатель ждёт в crew_wait, не трогается: его заберёт сам crew_wait в тот же ход.
    const held = new Set<string>()
    const delivering = new Set<string>()
    const keysOf = (card: Card) => [keyOf(card), card.role, card.session]
    // Идёт ли ход: у открытой вкладки это знает её окно (плагин окна, раз в секунду); у сессии под задачу окна нет —
    // флаг визитки (хук запроса ставит, событие или строка простоя в базе снимает).
    const turnRunning = (card: Card, windows: ReturnType<typeof liveWindows>) => {
      const t = card.spawned ? undefined : tabOf(card.session, windows)
      return t ? !!t.tab.busy : !!card.busy
    }
    const staleLogged = new Set<string>()
    function delivered(card: Card, letters: Letter[], windows: ReturnType<typeof liveWindows>) {
      for (const l of letters) if (l.qid) addObligation(card.session, { qid: l.qid, from_session: l.from_session, from_role: l.from_role, at: l.time, nudges: 0 })
      // будящее письмо в фоновую вкладку — уведомление её окну (кнопка Open)
      const loud = letters.find((l) => l.wake !== false)
      const t = tabOf(card.session, windows)
      if (loud && t && !t.tab.active && t.window.pid) postNotice(t.window.pid, { sessionID: card.session, title: `✉ ${short(sessionLabel(loud.from_session, loud.from_role), 40)}`, message: short(loud.text.split(/\r?\n/)[0], 80), duration: 10_000 })
    }
    // СЕССИЯ ЗАДАЧИ ПРОПАЛА (задача 043, T11/M04a; владелец, 2026-10-15, «согласовано»). Сессию исполнителя или приёмщика удалили в
    // OpenCode (доставка падает с NotFoundError) или её визитки нет: задача стояла молча, знал только журнал сервера. После
    // LOST_AFTER неудач подряд — одно письмо автору с тем, что делать, и запись в истории задачи; повторов этого письма нет.
    const LOST_AFTER = 3
    const deliveryFails = new Map<string, number>()
    const cardMisses = new Map<string, number>()
    function sessionLost(t: Task, session: string, why: string) {
      if (session === t.author) return // автору о его же сессии сказать некуда
      const asReviewer = t.reviewer === session && t.executor !== session
      const id = `session-lost-${safeKey(t.project)}-${t.n}-${safeKey(session)}`
      if (letterExists(t.author, id)) return
      const text = asReviewer
        ? `Сессия приёмки задачи ${taskRef(t)} пропала (приёмщик ${session}: ${why}). Приёмка стоит. Сменить приёмщика инструментом нельзя: если вкладку приёмщика просто закрыли — открой её; если сессии больше нет — спроси владельца, что делать (например, отменить задачу: crew_task {action: "cancel", n: ${t.n}}).`
        : `Сессия задачи ${taskRef(t)} пропала (исполнитель ${session}: ${why}). Работа стоит. Передай задачу другой сессии: crew_task {action: "reassign", n: ${t.n}}; не нужна — отмени: crew_task {action: "cancel", n: ${t.n}}.`
      postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: now(), text })
      taskEvent(t, PLUGIN_SENDER, undefined, `${asReviewer ? "сессия приёмщика" : "сессия исполнителя"} ${session} пропала: ${why.slice(0, 200)}`)
      log(`task ${taskNo(t)} (${t.project}): session ${session} lost (${why.slice(0, 120)}), the author is told`)
    }
    // задачи, которые держит сессия: исполнитель — в работе или на доработке, приёмщик — сдана, на приёмке или принята
    const heldBy = (card: Card) =>
      [card.task, card.review]
        .map((r) => (r ? loadTask(r.project, r.n) : undefined))
        .filter((t): t is Task => !!t && ((t.executor === card.session && (t.status === "running" || t.status === "rework")) || (t.reviewer === card.session && ["submitted", "reviewing", "accepted"].includes(t.status))))
    function deliveryFailed(card: Card, e: unknown) {
      const err = `${String((e as any)?.name ?? "")} ${String(e)}`
      if (!/NotFound/i.test(err)) {
        deliveryFails.delete(card.session)
        return
      }
      const n = (deliveryFails.get(card.session) ?? 0) + 1
      deliveryFails.set(card.session, n)
      if (n === LOST_AFTER) for (const t of heldBy(card)) sessionLost(t, card.session, `доставка писем ${n} раза подряд: ${String(e).slice(0, 200)}`)
    }

    async function deliver(card: Card) {
      if (delivering.has(card.session)) return
      const keys = keysOf(card)
      if (!waitingIn(keys)) return
      const windows = liveWindows()
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
      if (turnRunning(fresh, windows)) {
        // ход идёт: письма ждут его конца. Но если «идёт» только по окну, а сервер свободен дольше 10 мин (сообщение
        // потерялось при перезапуске сервиса) — не ждать вечно: доставить, сервер примет письмо новым ходом
        const tab = fresh.spawned ? undefined : tabOf(fresh.session, windows)
        const stale = tab?.tab.busy && !fresh.busy ? await staleBusy(fresh.session, now()) : 0
        if (!stale) return
        if (!staleLogged.has(fresh.session)) log(`window says ${fresh.session} is busy, the database is idle since ${stale}: delivering`)
        staleLogged.add(fresh.session)
      } else staleLogged.delete(fresh.session)
      // сессия задачи: ход, начатый не плагином (продолженный OpenCode после перезапуска), виден только по базе
      if (fresh.spawned && (await openTurn(fresh.session, now()))) return
      const open = mayWakeCard(fresh, windows)
      if (!open && !hasQuietIn(keys)) {
        if (!held.has(card.session)) log(`hold letters for ${card.session} (${keyOf(card)}): tab not open`)
        held.add(card.session)
        return
      }
      if (open) held.delete(card.session)
      delivering.add(card.session)
      try {
        let claimed = keys.flatMap((k) => claimLetters(k, `${process.pid}-${now()}`))
        const awaited = waitingFor(card.session)
        const back = claimed.filter((c) => awaited && c.letter.reply_to === awaited)
        if (back.length) releaseLetters(back)
        claimed = claimed.filter((c) => !back.includes(c))
        if (!claimed.length) return
        const loud = claimed.some((c) => c.letter.wake !== false)
        if (loud && !open) {
          // вкладка закрыта: будящие ждут, тихие можно положить в историю без хода
          const wait = claimed.filter((c) => c.letter.wake !== false)
          releaseLetters(wait)
          claimed = claimed.filter((c) => !wait.includes(c))
          if (!claimed.length) return
        }
        const letters = claimed.map((c) => c.letter)
        const text = formatLetters(letters, card)
        const wake = loud && open
        try {
          // будящее письмо начинает ход: метка wokeAt. Занятость ставит хук запроса к модели, а ход, упавший ДО запроса
          // (модель недоступна — замер Ф.7: приёмщик на claude-code/sonnet, которой нет на сервере), его не вызывает:
          // без метки конца такого хода не видно — ни напоминания, ни вызова, обязательство висит молча. Доставку
          // метка не держит (в отличие от busy).
          if (wake) markWoke(card, now())
          // предел времени: зависшая отправка держала бы вкладку в delivering навсегда (письма ей больше не шли бы)
          const capped = (p: Promise<any>) => {
            let timer: any
            return Promise.race([p, new Promise((_, rej) => (timer = setTimeout(() => rej(new Error("delivery took too long")), Number(process.env.CREW_HARNESS_STEP_MS) || 60_000)))]).finally(() => clearTimeout(timer))
          }
          if (wake) await capped(ctx.session.prompt({ sessionID: card.session, text, delivery: "queue" }))
          else if (typeof ctx.session.synthetic === "function") await capped(ctx.session.synthetic({ sessionID: card.session, text, resume: false }))
          else await ctx.session.prompt({ sessionID: card.session, text, resume: false }) // OpenCode без synthetic: лишний шаг, но без хода
          confirmLetters(claimed)
          deliveryFails.delete(card.session)
          delivered(card, letters, windows)
          log(`delivered${wake ? "" : " quietly"} ${letters.map((l) => l.id).join(",")} -> ${card.session} (${keyOf(card)})`)
        } catch (e) {
          releaseLetters(claimed)
          log(`deliver failed ${card.session}: ${e}`)
          deliveryFailed(card, e)
        }
      } finally {
        delivering.delete(card.session)
      }
    }

    // ЗАНЯТОСТЬ: busy ставится в хуке запроса (context), снимается строкой `idle` в базе после busySince (таймер).
    function setBusy(card: Card, busy: boolean) {
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
      // начало хода (задача 052) — первый запрос; следующие шаги того же хода его не сдвигают
      fresh.turnStart = busy ? (fresh.busy && fresh.turnStart ? fresh.turnStart : now()) : undefined
      fresh.busy = busy
      fresh.busySince = busy ? now() : undefined
      if (!busy) fresh.wokeAt = undefined // конец хода увиден обычным путём
      saveCard(fresh)
      mine.set(fresh.session, fresh)
    }
    function markWoke(card: Card, at: number | undefined) {
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
      fresh.wokeAt = at
      saveCard(fresh)
      mine.set(fresh.session, fresh)
    }

    // УВЕДОМЛЕНИЕ АВТОРУ (задача 043, T7b; владелец, 2026-10-15, «согласовано»). Вкладка автора открыта — в её окно (whenOpen; иначе
    // ему хватает письма: в фоновую вкладку о нём скажет доставка). Вкладки автора нет — «застряла», «ждёт приёмщика» и «замок»
    // лежали только письмом в его ящике, и никто не знал: уведомление во все живые окна проекта, нет и их — во все живые окна.
    function noticeAuthor(author: string, project: string | undefined, notice: { sessionID?: string; title: string; message: string; duration?: number }, whenOpen: boolean) {
      const windows = liveWindows()
      const own = tabOf(author, windows)
      if (own) {
        if (whenOpen && own.window.pid) postNotice(own.window.pid, notice)
        return
      }
      const projectOfSession = new Map(allCards().map((c) => [c.session, projOf(c)]))
      const ofProject = project ? windows.filter((w) => (w.tabs ?? []).some((tab) => projectOfSession.get(tab.sessionID) === project)) : []
      const targets = ofProject.length ? ofProject : windows
      for (const w of targets) if (w.pid) postNotice(w.pid, notice)
      if (targets.length) log(`notice for the closed tab of ${author} -> ${targets.length} window(s)${ofProject.length ? ` of ${project}` : ""}: ${notice.title}`)
    }

    // ПОДТАЛКИВАНИЕ (план 002, Ф.2; core.ts, «ОБЯЗАТЕЛЬСТВА»). Ход вкладки кончился, а ответа по вопросу или задаче
    // нет — напоминание сразу. Различаем рабочий ход и пустой (lastTurn: были ли вызовы инструментов): рабочий
    // обнуляет счётчики пустых и напоминаний, пустой их растит. push_empty_turns пустых подряд или push_max напоминаний без рабочего хода —
    // вкладка застряла: напоминаний больше нет, спросившему вызов (письмо и уведомление в окне). Ход, в котором писал
    // владелец, — без напоминания (владелец ведёт вкладку сам), счётчик с нуля. Снимает застревание crew_task push.
    async function nudge(card: Card) {
      // ВКЛАДКА ОЖИЛА (задача 052; владелец, 2026-10-15, «заводи 052»): рабочий ход или ход, где писал владелец, снимает «застряла»
      // первым делом — до режимов ответа, сторожа потока и «ждёт по-честному» (наблюдение, открытый вопрос): раньше снятие стояло
      // после этих выходов, и вкладка, работавшая между вопросами, оставалась «застрявшей». Ход читается от его начала (turnStart):
      // от последнего запроса (busySince) видно только последний шаг, обычно текст без инструментов, и рабочий ход читался пустым
      const since = card.turnStart ?? card.busySince ?? 0
      let turn: Awaited<ReturnType<typeof lastTurn>> = undefined
      let turnRead = false
      let revived: string[] = []
      if (obligationsOf(card.session).some((o) => o.stuck)) {
        turn = await lastTurn(card.session, since)
        turnRead = true
        if (turn?.tools || turn?.owner) revived = clearStuck(card.session, turn.tools ? "a working turn" : "the owner wrote in the tab")
      }
      // РЕЖИМЫ ОТВЕТА НА ВОПРОСЫ (задача 007, ADR-0010): решение — сразу после снятия «застряла», до проверки обязательств (сессия задачи, сдавшая
      // отчёт, тоже получает ответ) и до пересылки вопроса и условия !turn?.owner (ход, начатый словом владельца, тоже). Режимы
      // выключены — ход не читается, дальше всё как раньше. handled — ни пересылки, ни «Не завершено», счётчики не растут.
      const cfgA = loadConfig(card.directory)
      if (answerModesOn(cfgA.answerMode)) {
        const endA = await turnEnd(card.session)
        if (endA) {
          const r = await answerTurn({ card, key: keyOf(card), end: endA, cfg: cfgA, now: now(), channel: "nudge", deps: { ownerWordAfter, lastUserAt } })
          if (r.handled) return
        }
      }
      const list = obligationsOf(card.session)
      if (!list.length) return
      const cfg = cfgA
      if (!turnRead) turn = await lastTurn(card.session, since)
      const t = now()
      // СТОРОЖ ПОТОКА (план 002.4): ход сессии задачи кончился вопросом — это не «остановилась», а «упёрлась». Вместо
      // «продолжай» (приёмщики #1 и #3 nova 2026-10-05 получили по 5–6 таких и стояли часами: вливать им было нельзя)
      // вопрос уходит тому, кто поставил задачу или спросил, письмом с побудкой. Тот решает сам или спрашивает владельца
      // («ждёт вас» у владельца) — цепочка доходит до владельца, только когда без него нельзя.
      if (card.spawned && !turn?.owner) {
        const end = await turnEnd(card.session)
        const q = end && !end.ownerAfter ? endsWithQuestion(end.text) : undefined
        if (q && end) {
          const askers = [...new Set(list.filter((o) => !o.stuck).map((o) => o.from_session))]
          const tail = end.text.replace(/\r/g, "").trim().slice(-700)
          for (const to of askers) {
            const id = `ask-${safeKey(card.session)}-${end.at}`
            if (letterExists(to, id)) continue
            const ref = card.task ?? card.review
            const what = ref ? `${card.review && !card.task ? "приёмка задачи" : "задача"} ${taskRef(ref)}` : "вопрос"
            postLetter(to, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to, time: t, text: `${what}: вкладка ${keyOf(card)} (сессия ${card.session}) остановилась с вопросом, работа стоит до ответа:\n«${q}»\n\nКонец её ответа:\n${tail}\n\nОтветь ей сам: crew_send {to: "${card.session}", text: "..."}. Решить без владельца нельзя — спроси владельца (вопросом в конце своего хода).` })
            log(`question of ${card.session} forwarded to ${to}`)
          }
          if (askers.length) return // не «продолжай»: ждёт ответа
        }
      }
      // ЖДЁТ ПО-ЧЕСТНОМУ (2026-10-06, дополнение к плану 002.4): у вкладки открыто наблюдение crew_watch или её вопрос ждёт
      // ответа (expect_reply) — её разбудят концом наблюдения или ответом. Раньше «Не завершено» шло на каждый конец хода:
      // исполнитель #17 nova, ждавший чужой коммит в main, получал его раз в минуту (ход ~220 тыс. токенов) и в ответ стал
      // ждать опросом в Bash, держа ход по 9 минут.
      if (!turn?.owner) {
        const watching = watchesOf(card.session).length > 0
        const asking = !watching && asksOpen(card.session)
        if (watching || asking) {
          log(`nudge skipped ${card.session}: waits for ${watching ? "a watch" : "a reply"}`)
          return
        }
      }
      let changed = false
      for (const o of list) {
        // снятое в начале хода (ВКЛАДКА ОЖИЛА) — без напоминания на этом ходу: счётчики начинаются заново, как после push
        if (o.stuck || revived.includes(o.qid)) continue
        changed = true
        if (turn?.owner) {
          o.empty = 0
          continue
        }
        // базы нет — ход считается рабочим (лишнее напоминание дешевле ложного «застряла»)
        o.empty = turn && !turn.tools ? (o.empty ?? 0) + 1 : 0
        // РАБОЧИЙ ХОД ОБНУЛЯЕТ СЧЁТЧИК НАПОМИНАНИЙ (задача 043, L1; владелец, 2026-10-15, «согласовано»): push_max копился за всё время
        // жизни обязательства, и исполнитель большой задачи после 20 рабочих ходов получал «застряла», хотя работа шла. Ход, о котором
        // базы нет, счётчик не обнуляет: тогда push_max — единственный предел
        if (turn?.tools) o.nudges = 0
        const rv = card.review ? loadTask(card.review.project, card.review.n) : undefined
        const isReview = !!rv && rv.review_qid === o.qid
        const task = isReview ? rv : card.task ? loadTask(card.task.project, card.task.n) : undefined
        const what = isReview ? `приёмка задачи ${taskNo(rv!)} «${rv!.title}» (${statusRu(rv!.status)})` : task && task.qid === o.qid ? `задача ${taskNo(task)} «${task.title}»` : `вопрос ${o.qid}${o.task ? ` («${o.task.slice(0, 200)}»)` : ""}`
        const howTo = isReview
          ? `Продолжай приёмку: crew_task {action: "review" | "rework" | "merge" | "accept" | "cleanup", n: ${rv!.n}} (что дальше — в письме с приёмкой).`
          : task && task.qid === o.qid && task.executor === card.session
            ? `Закончил — сдай: crew_task {action: "submit", n: ${task.n}, text: "..."}. Упёрся — в том же отчёте напиши, что мешает.`
            : `Закончил — отчёт: crew_send {to: "${o.from_session}", reply_to: "${o.qid}", text: "..."}. Упёрся — тем же ответом напиши, что мешает.`
        if (o.empty >= cfg.pushEmptyTurns || o.nudges >= cfg.pushMax) {
          o.stuck = true
          const failing = turn?.outcome === "failed" ? " (ход падает с ошибкой — посмотри модель и журнал сервера)" : ""
          const why = (o.empty >= cfg.pushEmptyTurns ? `${o.empty} хода подряд остановилась без работы и без ответа` : `${o.nudges} напоминаний остались без ответа`) + failing
          o.stuckAt = t
          o.stuckWhat = `${what} — ${why}`
          // приёмку подталкивают к приёмщику (to: "reviewer"), а не к исполнителю, давно сдавшему работу (задача 043)
          const pushHint = `crew_task {action: "push"${task ? `, n: ${task.n}` : ""}${isReview ? `, to: "reviewer"` : ""}, text: "..."}`
          postLetter(o.from_session, {
            id: `${t}-stuck-${safeKey(o.qid)}`,
            from_role: PLUGIN_SENDER,
            from_session: PLUGIN_SENDER,
            to: o.from_session,
            time: t,
            text: `Вкладка ${keyOf(card)} (сессия ${card.session}) застряла: ${what} — ${why}. Напоминаний больше не будет. Подтолкни (${pushHint}), передай другой сессии (reassign) или загляни в неё сам.`,
          })
          noticeAuthor(o.from_session, projOf(card), { sessionID: card.session, title: task ? `${((s) => (s && s.code !== EXECUTOR_CODE ? sessionRef(task, s) : taskNo(task)))(sessionOf(task, card.session))} застряла` : `${keyOf(card)} застряла`, message: short(task ? `«${task.title}» · ${why}` : why, 80), duration: 15_000 }, true)
          if (task && (task.qid === o.qid || isReview)) taskEvent(task, PLUGIN_SENDER, undefined, `${isReview ? "приёмка застряла" : "застряла"}: ${why}`)
          log(`stuck ${card.session} for ${o.qid} (empty ${o.empty}, pushes ${o.nudges})`)
          continue
        }
        o.nudges++
        postLetter(card.session, {
          id: `${t}-nudge-${safeKey(o.qid)}`,
          from_role: PLUGIN_SENDER,
          from_session: PLUGIN_SENDER,
          to: card.session,
          time: t,
          text:
            `Не завершено: ${what} от ${o.from_role} (сессия ${o.from_session}). Ты остановился, не закончив. Продолжай работу. ` +
            howTo +
            ` Ждёшь внешнего (коммит в main, чужую задачу, сборку) — crew_watch {command: "<ждёт и выходит>", note} или вопрос с expect_reply: пока они открыты, напоминаний нет, разбудят по итогу. Опросом в Bash не жди — он держит ход.` +
            (o.empty ? ` Ход без работы ${o.empty} из ${cfg.pushEmptyTurns}: дальше спросивший узнает, что вкладка стоит.` : ""),
        })
        log(`nudge ${card.session} for ${o.qid} (#${o.nudges}, empty ${o.empty})`)
      }
      if (!changed) return
      saveObligations(card.session, list)
      void deliver(readJson<Card>(cardFile(card.session)) ?? card)
    }

    // ПРЕРВАННЫЙ ХОД (замер Ф.0, п. 3): сервер оборвали посреди хода — строки `idle` нет, у сессии осталась метка
    // time_suspended, и сама OpenCode ход не продолжает. После старта плагин будит такие сессии, если у них есть
    // невыполненный вопрос или задача, одним письмом (id письма — из сессии и метки: второго не будет).
    // Граница — СТАРТ ПРОЦЕССА сервера, а не загрузка плагина: OpenCode грузит плагин заново в том же процессе на
    // каждую новую папку (замер 2026-10-05: десять загрузок за день в одном процессе). Новый экземпляр иначе считал
    // оборванными ходы, которые идут прямо сейчас (time_suspended стоит и у идущего хода), и слал работающим
    // приёмщикам «работа прервана перезапуском».
    const setupAt = PROCESS_START
    let interruptedChecked = 0
    async function resumeInterrupted() {
      if (now() - interruptedChecked < 30_000) return
      interruptedChecked = now()
      for (const c of allCards()) {
        if (children.has(c.session) || !obligationsOf(c.session).some((o) => !o.stuck)) continue
        const row = await sessionFromDb(c.session)
        if (!row?.suspended || row.suspended >= setupAt || (row.idle ?? 0) >= row.suspended) {
          await retryFailed(c)
          continue
        }
        if (!(await sessionInfo(c.session))) continue // сессия другого сервера
        // оборванный ход уже не кончится: отметку «занята» (её снимает только конец хода) снять, иначе письмо ниже
        // ждало бы конца хода вечно (замер в песочнице 2026-10-05)
        if (c.busy) setBusy(c, false)
        const id = `resume-${safeKey(c.session)}-${row.suspended}`
        if (letterExists(c.session, id)) continue
        const task = c.task ? loadTask(c.task.project, c.task.n) : undefined
        const open = obligationsOf(c.session)
          .filter((o) => !o.stuck)
          .map((o) => `— ${task && task.qid === o.qid ? `задача ${taskNo(task)} «${task.title}»` : `вопрос${o.task ? ` «${o.task.slice(0, 200)}»` : ""}`} от ${o.from_role}: ${task && task.qid === o.qid ? `сдача — crew_task {action: "submit", n: ${task.n}, text: "..."}` : `отчёт — crew_send {to: "${o.from_session}", reply_to: "${o.qid}", text: "..."}`}`)
          .join("\n")
        // следы оборванной операции git в деревьях задачи (worktree исполнителя и главная копия) и замок вливания
        const ref = c.task ?? c.review
        const t = ref ? loadTask(ref.project, ref.n) : undefined
        const dirs = [...new Set([t?.worktree, t?.directory, c.directory].filter((d): d is string => !!d && existsSync(d)))]
        const traces = dirs.flatMap((d) => gitTraces(d))
        const lock = t && mergeHolder(t.project)?.session === c.session ? `\nЗамок вливания проекта ${t.project} всё ещё твой (приёмка ${taskRef(t)}): доведи вливание или отпусти его.` : ""
        const gitNote = traces.length ? `\nВ git осталось от оборванного хода:\n${traces.map((x) => `— ${x}`).join("\n")}` : ""
        const pre = t ? precheckLines(t, c.session).map((x) => `\n${x}`).join("") : "" // предпроверка вливания и замок (задача 005, REQ-15)
        postLetter(c.session, {
          id,
          from_role: PLUGIN_SENDER,
          from_session: PLUGIN_SENDER,
          to: c.session,
          time: now(),
          text: `Работа прервана перезапуском OpenCode (ход оборвался в ${hhmm(row.suspended)}). Продолжай с того места, где остановился: сначала проверь, что успело сделаться (файлы, коммиты, запущенные команды; git status в деревьях задачи).${gitNote}${lock}${pre}\nОткрыто:\n${open}`,
        })
        log(`resume interrupted ${c.session} (suspended ${row.suspended})`)
      }
    }

    // УПАВШИЙ ХОД ДО СТАРТА ПЛАГИНА (замер Ф.7): последний ход вкладки с открытым обязательством кончился ошибкой
    // (модель недоступна и т. п.), а плагина тогда не было или он ещё не видел такие ходы — никто её больше не будит.
    // Одно письмо «продолжай»; упадёт снова — напоминания и вызов спросившему, как у любого хода без работы.
    async function retryFailed(c: Card) {
      if (c.busy) return
      const turn = await lastTurn(c.session, 0)
      if (turn?.outcome !== "failed" || turn.at >= setupAt) return
      if (!(await sessionInfo(c.session))) return // сессия другого сервера
      const id = `retry-${safeKey(c.session)}-${turn.at}`
      if (letterExists(c.session, id)) return
      const open = obligationsOf(c.session).filter((o) => !o.stuck).map((o) => `— ${o.task ?? `вопрос ${o.qid}`} от ${o.from_role}`).join("\n")
      postLetter(c.session, {
        id,
        from_role: PLUGIN_SENDER,
        from_session: PLUGIN_SENDER,
        to: c.session,
        time: now(),
        text: `Прошлый ход (${hhmm(turn.at)}) кончился ошибкой, не дойдя до дела. Продолжай работу. Открыто:\n${open}`,
      })
      log(`retry failed turn ${c.session} (${turn.at})`)
    }

    // КОНЕЦ ЗАДАЧИ (план 002, Ф.3). Задача очищена или отменена — сессии задачи (исполнитель, приёмщик, прежние)
    // закрываются: строка в историю без хода, уведомление интегратору. Только когда ход сессии не идёт: строка,
    // записанная посреди хода, стала бы ещё одним шагом модели (замер 2026-10-05).
    async function finishTasks() {
      // НАБЛЮДЕНИЕ ДЕРЖИТ ДЕРЕВО (2026-10-07, #26 nova): наблюдение идёт с рабочей папкой сессии, у приёмщика и
      // исполнителя это дерево задачи; на Windows папку, в которой стоит процесс, не удалить — уборка принятой задачи
      // кончалась «Permission denied», а держало её как раз наблюдение «жду, пока дерево исчезнет». Задача влита
      // (accepted) или отменена — наблюдения (любой сессии) из её дерева переезжают в основную копию: тот же процесс
      // снимается, та же команда ставится заново с папкой проекта, вкладке — письмо с новым id.
      const moving = openWatchesBySession()
      if (moving.size)
        for (const t of listTasks()) {
          if ((t.status !== "accepted" && t.status !== "cancelled") || !t.worktree || !t.directory) continue
          const tree = t.worktree
          const inTree = (p: string) => path.resolve(p).toLowerCase() === path.resolve(tree).toLowerCase() || insideDir(p, tree)
          for (const ws of moving.values())
            for (const w of ws) {
              if (!w.cwd || !inTree(w.cwd) || inTree(t.directory)) continue
              dropWatch(w, log, now(), { moved: true })
              const nw = requestWatch({ session: w.session, command: w.command, cwd: t.directory, note: w.note, minutes: w.minutes, machine: w.machine, project: w.project, env: w.env })
              postLetter(w.session, {
                id: `watch-moved-${w.id}`,
                from_role: PLUGIN_SENDER,
                from_session: PLUGIN_SENDER,
                to: w.session,
                time: now(),
                text: `Наблюдение ${w.note ? `«${w.note}» ` : ""}${w.id} стояло в дереве задачи ${taskRef(t)}, а задача ${t.status === "accepted" ? "влита и дерево убирается" : "отменена"}: Windows не даёт удалить папку, в которой идёт процесс. Перенёс его в основную копию (${t.directory}) — та же команда, новый id ${nw.id}; ждать его так же.`,
              })
              log(`watch ${w.id} moved out of ${tree} as ${nw.id}`)
            }
        }
      // наблюдения сессий закрытой задачи больше не нужны: снять (иначе висят до предела, до 12 ч, и держат очередь машины)
      const open = openWatchesBySession()
      if (open.size)
        for (const t of listTasks()) {
          if (t.status !== "done" && t.status !== "cancelled") continue
          for (const sid of new Set([t.executor, t.reviewer, ...t.executors, ...(t.reviewers ?? [])].filter(Boolean) as string[])) {
            const ws = open.get(sid)
            if (!ws) continue
            const c = readJson<Card>(cardFile(sid))
            const other = [c?.task, c?.review].some((r) => r && (r.project !== t.project || r.n !== t.n) && isOpen(loadTask(r.project, r.n) ?? ({ status: "cancelled" } as Task)))
            if (other) continue // сессия уже на другой открытой задаче
            for (const w of ws) dropWatch(w, log)
          }
        }
      for (const t of listTasks()) {
        if (t.status !== "done" && t.status !== "cancelled") continue
        const sessions = [t.executor, t.reviewer, ...t.executors, ...(t.reviewers ?? [])].filter(Boolean) as string[]
        for (const sid of new Set(sessions)) {
          const c = readJson<Card>(cardFile(sid))
          if (!c?.spawned || c.spawned.status === "closed" || c.busy) continue
          if (c.pid !== process.pid && pidAlive(c.pid)) continue
          c.spawned.status = "closed"
          saveCard(c)
          const done = t.status === "done"
          // отчёт приёмки по шагам — в конце истории вкладки (владелец: «+ отчёт в конце»)
          const ids = t.steps?.length ? t.steps.map((a) => a.id) : Object.keys(t.checks ?? {})
          const passed = ids.filter((id) => t.checks?.[id]).length
          const report = ids.length ? `\nОтчёт приёмки — шаги ${passed}/${ids.length}:\n${ids.map((id) => `${t.checks?.[id] ? "✓" : "–"} ${id}: ${t.checks?.[id] ?? "не отмечен (необязательный)"}`).join("\n")}` : ""
          try {
            const note = { sessionID: sid, text: done ? `✓✓ Задача ${taskRef(t)} принята и влита. Сессия закрыта — письма больше не приходят.${report}` : `✗ Задача ${taskNo(t)} отменена. Сессия закрыта — письма больше не приходят.`, resume: false }
            await (typeof ctx.session.synthetic === "function" ? ctx.session.synthetic(note) : ctx.session.prompt(note)) // строка в историю, без хода
          } catch (e) {
            log(`final note failed ${sid}: ${e}`)
          }
          if (sid === t.executor) {
            const w = tabOf(t.author)
            if (w?.window.pid) postNotice(w.window.pid, { sessionID: sid, title: done ? `${taskNo(t)} ✓✓ готово${ids.length ? ` · шаги ${passed}/${ids.length}` : ""}` : `${taskNo(t)} ✗ отменена`, message: done && ids.length ? `${short(t.title, 60)} · отчёт — /crew` : short(t.title, 80), duration: 10_000 })
          }
          log(`task ${taskNo(t)} (${t.project}) ${t.status}: session ${sid} closed`)
        }
      }
      // УСТАРЕВШАЯ ПРИВЯЗКА (задача 064, п. 9): вкладка владельца (не сессия задачи), чья задача закрыта (влита или отменена), — привязка
      // снимается: вкладка снова своей роли, письма и сводки её задачей не зовут. Сессии задач остаются привязаны: по ним окно закрывает вкладку
      for (const c of allCards()) {
        if (c.spawned) continue
        const closed = (r?: { project: string; n: number }) => {
          const x = r ? loadTask(r.project, r.n) : undefined
          return !!x && (x.status === "done" || x.status === "cancelled")
        }
        const dropTask = closed(c.task)
        const dropReview = closed(c.review)
        if (!dropTask && !dropReview) continue
        const fresh = readJson<Card>(cardFile(c.session))
        if (!fresh) continue
        if (dropTask) delete fresh.task
        if (dropReview) delete fresh.review
        saveCard(fresh)
        log(`stale task binding of ${c.session} dropped`)
      }
      // прежний путь (сессия под задачу без журнала): закрыть по отчёту
      for (const c of allCards()) {
        if (c.task || c.review || c.spawned?.status !== "done" || c.busy || (c.pid !== process.pid && pidAlive(c.pid))) continue
        c.spawned.status = "closed"
        saveCard(c)
      }
    }

    // ПРИЁМЩИК (план 002, Ф.3). Сданная задача без приёмщика получает его по приоритету (P0 первым): при reviewer
    // "integrator" — сам интегратор; иначе свободная открытая вкладка роли worker (не исполнитель, не автор, без своей
    // задачи), а нет такой — новая сессия под приёмку (лимит spawn_limits.reviewer, по умолчанию 2). Сессия приёмки
    // запускается так же повторяемо, как задача: id пишется в журнал до session.create. При reviewer "acceptor"
    // (план 002.7) — то же с ролью acceptor: вкладка годится только этой роли, сессия рождается с ней, лимит —
    // spawn_limits.acceptor (без него — reviewer).
    const reviewStarting = new Set<string>()
    async function startReviewer(t0: Task): Promise<void> {
      const key = `${t0.project}#${t0.n}`
      if (reviewStarting.has(key)) return
      reviewStarting.add(key)
      try {
        const t = loadTask(t0.project, t0.n) ?? t0
        if (!t.reviewer || t.review_kind !== "spawn" || readJson<Card>(cardFile(t.reviewer))) return
        const cfg = loadConfig(t.directory)
        // без модели от набора — spawn_models по ступени задачи, срезанной границами проекта (задача 016)
        const tierCut = clampTier(t.tier, cfg.tierBounds)
        const model = t.review_model ?? cfg.spawnModels[tierCut.tier] ?? DEFAULT_SPAWN_MODELS[tierCut.tier]
        await ctx.session.create({ id: t.reviewer, title: `${taskNo(t)} прм ${t.title}`, location: { directory: t.directory }, metadata: { crewReview: { project: t.project, n: t.n } }, model: splitLaunchModel(model) })
        const now = Date.now()
        // роль сессии приёмки — по настройке reviewer (план 002.7): acceptor несёт права вливания и принятия
        const card: Card = { session: t.reviewer, role: reviewerRole(cfg), auto: false, title: `${taskNo(t)} прм ${t.title}`, directory: t.directory, repo: repoLabel(t.directory), project: t.project, model, modelAt: now, modelFrom: "request", pid: process.pid, updated: now, spawned: { by: t.author, task: `приёмка ${taskNo(t)}`, tier: t.review_model ? t.tier : tierCut.tier, status: "running", at: now, qid: t.review_qid ?? "" }, review: { project: t.project, n: t.n } }
        saveCard(card)
        mine.set(card.session, card)
        // след профиля приёмки (задача 003): набор, этап, семья, ступень; окно у приёмки — общие настройки (general)
        const rch = t.review_model ? resolveStageProfile(profileState(t.directory).state, stageOfLaunch(t, "reviewer"), { taskTier: t.tier }) : undefined
        if (rch && !("refuse" in rch) && rch.model === model) stampProfile(t, "reviewer", t.reviewer, rch, false)
        else if (!t.review_model) stampClamp(t, "reviewer", t.reviewer, stageOfLaunch(t, "reviewer"), model, tierCut.tier, tierCut.from)
        await reviewerAssigned(t, card)
        log(`task ${taskNo(t)} (${t.project}): reviewer session ${t.reviewer} started`)
      } catch (e) {
        log(`reviewer start ${taskNo(t0)} failed: ${e}`)
        // сессию приёмки создать не удалось: повтор идёт сам (assignReviewers), но молча — автору одно письмо на сессию приёмки
        try {
          const t = loadTask(t0.project, t0.n)
          const id = t?.reviewer ? `review-start-failed-${safeKey(t.project)}-${t.n}-${safeKey(t.reviewer)}` : ""
          if (t && id && !letterExists(t.author, id)) {
            const why = String((e as any)?.message ?? e).slice(0, 300)
            postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: Date.now(), text: `Задача ${taskRef(t)} сдана, но сессию приёмки создать не удалось (${why}). Плагин повторяет запуск сам на каждом проходе; не получится — поправь причину (модель приёмки: spawn_models и профили) или смени способ приёмки (настройка reviewer).` })
            taskEvent(t, PLUGIN_SENDER, undefined, `сессия приёмки не создана: ${why.slice(0, 200)}`)
          }
        } catch {}
      } finally {
        reviewStarting.delete(key)
      }
    }
    // Приёмщик назначен (вкладка или сессия): обязательство и письмо с приёмкой (id письма — из номера и попытки).
    async function reviewerAssigned(t: Task, card: Card) {
      const cfg = loadConfig(t.directory)
      if (!obligationsOf(card.session).some((o) => o.qid === t.review_qid)) addObligation(card.session, { qid: t.review_qid!, from_session: t.author, from_role: t.author_role, at: Date.now(), nudges: 0, task: `приёмка ${taskNo(t)}` })
      const id = t.review_letter ?? `review-${safeKey(t.project)}-${t.n}-${(t.reviewers ?? []).length + 1}`
      if (t.review_letter !== id) {
        t.review_letter = id
        saveTask(t)
      }
      if (!letterExists(card.session, id)) postLetter(card.session, { id, from_role: t.author_role, from_session: t.author, to: card.session, time: Date.now(), text: reviewLetter(t, cfg) })
      void deliver(card)
    }

    // СВЕРКА ЖУРНАЛА (план 002, Ф.4). OpenCode могут закрыть посреди любого действия: статус записан, а письмо, отметка
    // приёмщика или обязательство — нет. Каждые 2 с проход приводит всё к журналу: недостающие письма (постоянные id —
    // без повторов), отметка приёмщика на его визитке, письмо с приёмкой, обязательства исполнителя и приёмщика (только
    // если их нет совсем — счётчики напоминаний не сбрасываются).
    let reconciledAt = 0
    async function reconcile() {
      if (now() - reconciledAt < 2_000) return
      reconciledAt = now()
      for (const t of listTasks()) {
        if (t.parent && now() - t.updated < 24 * 3600_000) propagateToParent(t) // заказ другого проекта идёт за этой задачей
        const recent = t.status === "done" && now() - t.updated < 24 * 3600_000
        if (!isOpen(t) && !recent) continue
        const author = readJson<Card>(cardFile(t.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue // сверяет процесс автора
        postExpected(t)
        if (t.status === "starting") continue // запуск доделает resumeTasks
        const need = (session: string | undefined, qid: string | undefined, what: string) => {
          if (session && qid && !obligationsOf(session).some((o) => o.qid === qid)) addObligation(session, { qid, from_session: t.author, from_role: t.author_role, at: now(), nudges: 0, task: what })
        }
        // визитки сессии нет LOST_AFTER проходов подряд — сессия пропала (задача 043, M04a): автору одно письмо
        const missing = (session: string, has: boolean) => {
          const key = `${t.project}#${t.n}:${session}`
          if (has) return void cardMisses.delete(key)
          const n = (cardMisses.get(key) ?? 0) + 1
          cardMisses.set(key, n)
          if (n === LOST_AFTER) sessionLost(t, session, "визитки сессии нет: плагин её не знает")
        }
        if (t.status === "running" || t.status === "rework") {
          need(t.executor, t.qid, t.title)
          if (t.executor && t.kind !== "order") missing(t.executor, existsSync(cardFile(t.executor)))
        }
        if (t.reviewer && ["submitted", "reviewing", "accepted"].includes(t.status)) {
          const rc = readJson<Card>(cardFile(t.reviewer))
          if (!rc && t.review_kind !== "spawn") missing(t.reviewer, false) // сессию приёмки spawn создаёт assignReviewers
          if (!rc) continue // сессия приёмки ещё не создана — её запустит assignReviewers
          missing(t.reviewer, true)
          if (!rc.review || rc.review.n !== t.n || rc.review.project !== t.project) {
            rc.review = { project: t.project, n: t.n }
            saveCard(rc)
          }
          if (!t.review_letter || !letterExists(t.reviewer, t.review_letter)) await reviewerAssigned(t, rc)
          if (!(t.status === "submitted" && rounds(t) > 0)) need(t.reviewer, t.review_qid, `приёмка ${taskRef(t)}`)
        }
      }
    }
    async function assignReviewers() {
      const windows = liveWindows()
      const queue = listTasks().filter((t) => t.status === "submitted" && !t.reviewer).sort(byPriority)
      const bud = stepBudget("assignReviewers", log)
      let qi = 0
      for (const t0 of queue) {
        if (await bud.stop(qi++, queue.length)) break
        const t = loadTask(t0.project, t0.n)
        if (!t || t.status !== "submitted" || t.reviewer) continue
        const author = readJson<Card>(cardFile(t.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue // назначает процесс автора
        const cfg = loadConfig(t.directory)
        t.review_qid = `r${t.qid}`
        if (cfg.reviewer === "integrator") {
          t.reviewer = t.author
          t.review_kind = "integrator"
          taskEvent(t, PLUGIN_SENDER, undefined, "приёмщик — интегратор (настройка reviewer)")
          const ac = author ?? (readJson<Card>(cardFile(t.author)) as Card)
          if (ac) {
            ac.review = { project: t.project, n: t.n }
            saveCard(ac)
            await reviewerAssigned(t, ac)
          }
          continue
        }
        // ПРОФИЛЬ ПРИЁМКИ ПО ВКЛЮЧЁННОМУ НАБОРУ (задача 003). Ветка reviewer: integrator выше от набора не зависит. Этап описан, а
        // профиль не находится — приёмщика нет: задача остаётся «сдана», интегратору одно письмо (постоянный id), строка в crew_doctor.
        const pstate = profileState(t.directory).state
        const rstage = stageOfLaunch(t, "reviewer")
        const chosen = resolveStageProfile(pstate, rstage, { taskTier: t.tier })
        if (chosen && "refuse" in chosen) {
          const id = `review-refused-${safeKey(t.project)}-${t.n}-${safeKey(chosen.refuse).slice(0, 60)}`
          if (!letterExists(t.author, id)) {
            postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: now(), text: `Задача ${taskRef(t)} сдана, но приёмщик не назначен: ${chosen.refuse}. Исправь профили или переключи набор (/crew-sets, /crew-profiles); приёмщик назначится сам.` })
            taskEvent(t, PLUGIN_SENDER, undefined, `приёмщик не назначен: ${chosen.refuse}`)
          }
          continue
        }
        const rcell = cellOfState(pstate, rstage)
        const rprofiles = pstate.usable?.data.profiles
        const tab = allCards().find(
          (c) =>
            !c.spawned &&
            tabFitsCell(rcell, c.model, rprofiles) && // явная ступень клетки — только вкладка семьи клетки (REQ-07)
            (c.project ?? projectOf(c.directory, projects)) === t.project &&
            normalizeRole(c.role) === reviewerRole(cfg) &&
            c.session !== t.executor &&
            c.session !== t.author &&
            !(t.reviewers ?? []).includes(c.session) && // перепроверка плана: каждый раунд — новая сессия (план 004)
            !holdsOpenTask(c) &&
            !!tabOf(c.session, windows)?.window.pid &&
            !tabOf(c.session, windows)?.tab.busy,
        )
        if (tab) {
          t.reviewer = tab.session
          t.review_kind = "tab"
          taskEvent(t, PLUGIN_SENDER, undefined, `приёмщик — открытая вкладка ${tab.session}`)
          tab.review = { project: t.project, n: t.n }
          saveCard(tab)
          await reviewerAssigned(t, tab)
          continue
        }
        const limit = reviewSessionLimit(cfg)
        // задача на доработке места не держит: следующий шаг — исполнителя, приёмщик ждёт без хода (правило «блокирует ли
        // незакрытая задача новую» методологии: ждём чужого хода — не блокирует). Досданную будит прежний приёмщик сразу.
        const reviewing = listTasks(t.project).filter((x) => isOpen(x) && x.review_kind === "spawn" && x.reviewer && x.status !== "accepted" && x.status !== "rework").length
        if (t.priority !== "P0" && reviewing >= limit) continue // ждёт: приёмщиков-сессий уже limit
        if (chosen) t.review_model = chosen.model
        else delete t.review_model
        t.reviewer = plannedSessionId()
        t.review_kind = "spawn"
        taskEvent(t, PLUGIN_SENDER, undefined, `приёмщик — новая сессия ${t.reviewer}`)
        await startReviewer(t)
      }
      // сессия приёмки записана, но не создана (оборвался запуск) — повторить тем же id
      for (const t of listTasks()) if (isOpen(t) && t.review_kind === "spawn" && t.reviewer && !readJson<Card>(cardFile(t.reviewer))) await startReviewer(t)
    }

    // ПРОФИЛИ МОДЕЛЕЙ (задача 003). Раз в проход, но тяжёлое — только когда сменилась подпись входных данных (три ключа
    // файла, снимок): снимок допустимого состояния (создаётся на первом допустимом проходе, обновляется, отбрасывается на
    // строках 1 и 7 таблицы исходов), уведомление окнам о новых проблемах профилей.
    const profileSigs = new Map<string, string>()
    let profilesSaid = ""
    let profilesAt = 0
    let profilesRunAt = 0
    const PROFILES_MS = Number(process.env.CREW_HARNESS_PROFILES_MS) || 10_000 // чтение настроек — процессы git: не чаще раза в 10 с
    async function profilesStep() {
      if (now() - profilesRunAt < PROFILES_MS) return
      profilesRunAt = now()
      let changed = false
      for (const p of projects) {
        const dir = p.dir ?? p.rootPath
        if (!dir) continue
        try {
          const ps = profileState(dir)
          const sig = stateSignature(ps)
          if (profileSigs.get(p.name) !== sig) {
            changed = true
            profileSigs.set(p.name, sig)
            const after = syncSnapshot(dir)
            profileSigs.set(p.name, stateSignature(after))
          }
          // файлы окон в деревьях задач: первый проход после старта безусловно, дальше — сверка с набором и задачами (задача 003, REQ-09)
          const rep = syncProjectFiles(dir)
          if (rep.written.length || rep.removed.length) log(`profile windows of ${p.name}: written ${rep.written.length}, removed ${rep.removed.length}`)
          for (const e of rep.errors) log(`profile windows of ${p.name}: ${e}`)
        } catch (e) {
          log(`profiles step of ${p.name} failed: ${e}`)
        }
      }
      if (!changed && now() - profilesAt < 30_000) return
      profilesAt = now()
      const problems = profileProblems(true)
      const said = problems.join(" | ")
      if (said === profilesSaid) return
      profilesSaid = said
      if (!problems.length) return
      log(`profiles: ${said}`)
      for (const w of liveWindows()) postNotice(w.pid, { title: "crew: профили моделей — /crew-sets check", message: short(problems.join("; "), 100), duration: 15_000 })
    }

    // ЗАГОЛОВКИ СЕССИЙ ЗАДАЧ — из журнала: «#N название», сдана/закрыта «#N ✓», отменена «#N ✗», передана другой
    // сессии «#N ↷». Сверяются каждый проход (то, что поменял MCP-сервер или другой процесс, тоже доходит), меняются
    // через session.update — без хода модели. Вкладки владельца (assign) не переименовываются.
    // СОСТОЯНИЕ СЕССИЙ (план 003, status.ts). Раз в STATUS_EVERY_MS — status/<сессия>.json (сводка /crew окна и внешние
    // проверки, например хук проекта). Сессия закончила ход вопросом владельцу — уведомление во все живые окна (с
    // кнопкой Open и системным уведомлением, когда окно не в фокусе); не ответил — повтор через owner_reminder_min.
    // В сводке — открытые вкладки, сессии задач и те, у кого есть наблюдения или свои открытые задачи.
    const STATUS_EVERY_MS = Number(process.env.CREW_HARNESS_STATUS_MS) || 15_000
    // конец хода — из базы (5 ГБ у владельца) только когда появилась новая строка idle: сначала дешёвое время
    // последнего idle (idleAt), тяжёлое чтение сообщений — при его изменении (замер: ~0,1 с на вкладку, в главном потоке)
    const ends = new Map<string, { at: number; end: Awaited<ReturnType<typeof turnEnd>> }>()
    let statusAt = 0
    // ДИАГНОСТИКА ЗАЛИПШЕГО ХОДА (владелец, 2026-10-12: «такое часто вижу, после перезагрузки или переоткрытия окна?»):
    // окно считает ход идущим, а база хода не видит. Одна строка в журнал при начале состояния и одна при конце — с фактами,
    // по которым видна закономерность: какое окно, как давно служба и окно живы, что в базе, когда сессию смотрели.
    const staleDiagAt = new Map<string, number>()
    const hm = (ms: number) => (ms ? new Date(ms).toTimeString().slice(0, 5) : "-")
    const hungDiagAt = new Map<string, number>()
    async function noteHung(c: Card, tab: any, hungSince: number, t: number) {
      try {
        const was = hungDiagAt.get(c.session)
        if (hungSince && was !== hungSince) {
          hungDiagAt.set(c.session, hungSince)
          const rows = await recentRows(c.session)
          const w = tab?.window
          log(
            `hung turn: ${keyOf(c)} (${c.session}) window pid=${w?.pid ?? "?"} beat ${w ? Math.round((t - Number(w.beat || 0)) / 1000) : "?"}s ago, ` +
              `tab active=${!!tab?.tab?.active} busy=${!!tab?.tab?.busy}; model silent since ${hm(hungSince)} (${Math.round((t - hungSince) / 60_000)} min); ` +
              `plugin process up since ${hm(PROCESS_START)} (${Math.round((t - PROCESS_START) / 60_000)} min); ` +
              `last rows: ${rows.map((r) => `${r.type}@${hm(r.at)}`).join(", ") || "-"}`,
          )
        } else if (!hungSince && was !== undefined) {
          hungDiagAt.delete(c.session)
          log(`hung turn cleared: ${keyOf(c)} (${c.session})`)
        }
      } catch (e) {
        log(`hung turn note failed: ${e}`)
      }
    }
    // САМОВОССТАНОВЛЕНИЕ ЗАВИСШЕГО ХОДА (задача 048, hung-resume.ts): плагин прерывает ход сам и будит вкладку письмом «продолжай».
    // true — зависание взято на себя (попытка удалась или ждёт итога): владельцу «нажмите Esc» не показывается. false — как в 036.
    const hungInterrupt = canInterrupt(ctx?.session)
    log(`hung turn self-recovery: ${hungInterrupt ? "on (session.interrupt)" : "off (no session.interrupt in this OpenCode; the owner is told to press Esc)"}`)
    const resumeTries = new Map<string, ResumeTry[]>()
    const resumeOwnerSaid = new Map<string, number>()
    async function selfResume(c: Card, since: number, t: number): Promise<boolean> {
      try {
        const tries = (resumeTries.get(c.session) ?? []).filter((x) => t - x.at < RESUME_WINDOW_MS || x.since === since)
        resumeTries.set(c.session, tries)
        const v = resumeVerdict(tries, since, t, hungInterrupt)
        if (v.act === "wait") return true
        if (v.act === "owner") {
          if (resumeOwnerSaid.get(c.session) !== since) log(`hung turn not resumed: ${keyOf(c)} (${c.session}) silent since ${hm(since)}: ${v.why}; the owner is told`)
          resumeOwnerSaid.set(c.session, since)
          return false
        }
        const r = await interruptTurn(ctx.session, c.session)
        tries.push({ since, at: t, ok: r.ok })
        if (!r.ok) {
          resumeOwnerSaid.set(c.session, since)
          log(`hung turn not resumed: ${keyOf(c)} (${c.session}) silent since ${hm(since)}: ${r.why}; the owner is told`)
          return false
        }
        postLetter(c.session, { id: `hung-resume-${safeKey(c.session)}-${t}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: c.session, time: t, text: resumeLetter(t) })
        for (const ref of [c.task, c.review]) {
          const task = ref ? loadTask(ref.project, ref.n) : undefined
          if (task && (task.executor === c.session || task.reviewer === c.session)) taskEvent(task, PLUGIN_SENDER, undefined, resumeNote(since, t))
        }
        log(`hung turn resumed: ${keyOf(c)} (${c.session}) silent since ${hm(since)}, interrupted at ${hm(t)}, the tab is asked to go on (try ${tries.filter((x) => t - x.at < RESUME_WINDOW_MS).length} in an hour)`)
        void deliver(c)
        return true
      } catch (e) {
        log(`hung turn self-recovery failed: ${e}`)
        return false
      }
    }
    async function noteStale(c: Card, tab: any, staleSince: number, t: number) {
      try {
        const was = staleDiagAt.get(c.session)
        if (staleSince && was !== staleSince) {
          staleDiagAt.set(c.session, staleSince)
          const row = await sessionFromDb(c.session)
          const rows = await recentRows(c.session)
          const w = tab?.window
          log(
            `stale busy: ${keyOf(c)} (${c.session}) window pid=${w?.pid ?? "?"} beat ${w ? Math.round((t - Number(w.beat || 0)) / 1000) : "?"}s ago, ` +
              `tab active=${!!tab?.tab?.active} busy=${!!tab?.tab?.busy}; server idle since ${hm(staleSince)} (${Math.round((t - staleSince) / 60_000)} min); ` +
              `plugin process up since ${hm(PROCESS_START)} (${Math.round((t - PROCESS_START) / 60_000)} min); ` +
              `db idle=${hm(row?.idle ?? 0)} viewed=${hm(row?.viewed ?? 0)} suspended=${hm(row?.suspended ?? 0)}; ` +
              `last rows: ${rows.map((r) => `${r.type}@${hm(r.at)}`).join(", ") || "-"}`,
          )
        } else if (!staleSince && was !== undefined) {
          staleDiagAt.delete(c.session)
          log(`stale busy cleared: ${keyOf(c)} (${c.session}) after ${Math.round((t - was) / 60_000)} min of idle server`)
        }
      } catch (e) {
        log(`stale busy note failed: ${e}`)
      }
    }

    async function syncStatus() {
      if (!tasksChanged() && now() - statusAt < STATUS_EVERY_MS) return
      statusAt = now()
      const windows = liveWindows()
      const t = now()
      const cards = allCards()
      // вопросы с ответом (expect_reply) — обязательства получателя перед спросившим; задачи и приёмки — не вопросы
      // ЗАДАЧА 032: закрытый адресат или очищенная задача снимают вопрос (то же правило чистит висящее при запуске — это первый
      // проход); старше ASKED_STALE_MS — «устарел», reply не держит. Письмо адресата автору закрывает вопрос в crew_send.
      const asked = new Map<string, { qid: string; to: string; at: number }[]>()
      const askedStale = new Map<string, { qid: string; to: string; at: number }[]>()
      for (const c of cards) {
        const list = obligationsOf(c.session).filter((o) => !o.task && !o.stuck)
        const why = list.length ? askedClosedWhy(c, !!tabOf(c.session, windows), t) : undefined
        for (const o of list) {
          if (why) {
            settleObligation(c.session, o.qid)
            log(`asked closed: qid=${o.qid} to ${keyOf(c)}: ${why}`)
            continue
          }
          const into = t - o.at > ASKED_STALE_MS ? askedStale : asked
          into.set(o.from_session, [...(into.get(o.from_session) ?? []), { qid: o.qid, to: keyOf(c), at: o.at }])
        }
      }
      const formOpen = new Set(allForms(t).map((x) => x.session))
      const watchesBy = openWatchesBySession() // одно чтение папки наблюдений на проход (их сотни: завершённые хранятся сутки)
      const saved = new Map(readStatuses().map((x) => [x.session, x])) // состояния прошлого прохода: кто из сессий задач ждёт автора (задача 063)
      for (const c of cards) {
        if (c.pid !== process.pid && pidAlive(c.pid)) continue // вкладка другого живого сервера
        const tab = tabOf(c.session, windows)
        const ws = watchesBy.get(c.session) ?? []
        const live = !!tab || (!!c.spawned && c.spawned.status !== "closed") || ws.length > 0 || listTasks(c.project).some((x) => x.author === c.session && isOpen(x))
        if (!live) {
          removeStatus(c.session)
          clearIdleTab(c.session)
          continue
        }
        // СЛОВО ВЛАДЕЛЬЦА СНИМАЕТ «ЗАСТРЯЛА» (задача 052): на ближайшем проходе, не в конце хода. Запись без stuckAt (до задачи 043) —
        // по словам после старта процесса службы: время отметки неизвестно, а слово до неё отметку бы не сняло
        const stuckNow = obligationsOf(c.session).filter((o) => o.stuck)
        if (stuckNow.length && (await ownerWordAfter(c.session, Math.min(...stuckNow.map((o) => o.stuckAt ?? PROCESS_START)))) > 0) clearStuck(c.session, "the owner wrote in the tab")
        // «работает» — ещё и по базе: ход открыт и обновляется (ход, продолженный самим OpenCode после перезапуска,
        // плагин не доставлял — признака busy у карточки нет; сводка писала «стоит», а сессия работала, 2026-10-05)
        // вопрос владельцу на экране (инструмент question ждёт ответа дольше окна открытого хода) - не залипший ход (задача 040)
        const staleSince = tab?.tab.busy && !(formOpen.has(c.session) && (await pendingTool(c.session))) ? await staleBusy(c.session, t) : 0
        await noteStale(c, tab, staleSince, t)
        // вопрос владельцу на экране (вопросник, задача 040) - не зависание (задача 048)
        const hungAt = tab?.tab.busy && !staleSince && !formOpen.has(c.session) ? await hungTurn(c.session, t, ws.length > 0) : 0
        await noteHung(c, tab, hungAt, t)
        // зависание взял на себя плагин (задача 048): ход прерван и вкладка разбужена письмом - владельцу ничего делать не нужно
        const hungSince = hungAt && (await selfResume(c, hungAt, t)) ? 0 : hungAt
        const busy = !staleSince && !hungSince && (!!tab?.tab.busy || !!c.busy || (await openTurn(c.session, t)))
        let end: Awaited<ReturnType<typeof turnEnd>> = undefined
        if (!busy) {
          const at = await idleAt(c.session)
          const hit = ends.get(c.session)
          if (hit && hit.at === at && at) end = hit.end
          else {
            end = await turnEnd(c.session)
            ends.set(c.session, { at, end })
          }
          // владелец написал после конца хода — это видно только в сообщениях: перечитать, если стоял вопрос
          if (end && !end.ownerAfter && hit && hit.at === at && (await userAfter(c.session, at))) {
            end = { ...end, ownerAfter: true }
            ends.set(c.session, { at, end })
          }
        }
        const gate = await gateStep(c, busy, end, formOpen.has(c.session), t)
        const s0 = statusOf({ card: c, busy, busySince: c.busySince, end, asked: asked.get(c.session) ?? [], askedStale: askedStale.get(c.session) ?? [], now: t, watches: ws, ...(staleSince ? { staleSince } : {}), ...(hungSince ? { hungSince } : {}), ...(gate ? { gate } : {}) })
        const idle = await idleStep(c, s0, end, !!tab, saved, t)
        const s = idle ? withIdle(s0, idle, t) : s0
        const prev = saveStatus(s)
        // РЕЖИМЫ ОТВЕТА НА ВОПРОСЫ (задача 007, ADR-0010): решение принимается раньше блока уведомлений. Режимы выключены —
        // ничего не читается и прежний путь идёт как был. handled — «ждёт вас» по этому ходу подавлено целиком; остаток вопросов
        // на вкладке владельца уходит одним уведомлением (повтор по owner_reminder_min), markNotified не вызывается.
        const cfgA = loadConfig(c.directory)
        if (answerModesOn(cfgA.answerMode)) {
          // слово владельца после автоответа или остатка — каждый проход, даже если ход уже идёт (отзыв не ждёт конца хода)
          try {
            await markInterventions(c.session, t, { ownerWordAfter, lastUserAt })
          } catch (e) {
            log(`answer: marks of ${c.session} failed: ${e}`)
          }
          if (end && !busy) {
            const r = await answerTurn({ card: c, key: keyOf(c), end, cfg: cfgA, now: t, channel: "status", deps: { ownerWordAfter, lastUserAt } })
            if (r.handled) {
              if (r.notice) for (const w of windows) postNotice(w.pid, { sessionID: c.session, title: `${short(sessionLabel(c.session, keyOf(c)), 40)} ждёт вас`, message: r.notice.message, attention: true, duration: 30_000 })
              if (r.notice) log(`owner wanted by ${c.session}: the rest of the questions`)
              continue
            }
          }
        }
        if (s.state !== "owner") continue
        if (s.formId) continue // вопрос вопросника: уведомление и повтор раз в 30 минут ведёт formWatch (form-wait.ts)
        const fresh = !(prev?.state === "owner" && prev.since === s.since)
        const every = loadConfig(c.directory).ownerReminderMin * 60_000
        if (!fresh && !(every > 0 && t - (prev?.notified ?? 0) >= every)) continue
        for (const w of windows) postNotice(w.pid, { sessionID: c.session, title: `${short(sessionLabel(c.session, keyOf(c)), 40)} ждёт вас`, message: short(s.question ?? "", 100), attention: true, duration: 30_000 })
        markNotified(c.session, t)
        log(`owner wanted by ${c.session}${fresh ? "" : " (reminder)"}`)
      }
    }

    // ВОРОТА БЕЗ ВОПРОСА (задача 062; владелец, 2026-10-16: «меня никто ничего не спросил, это ошибка в работе»). Вкладка записала log_line
    // «ворота», а вопроса владельцу у неё нет (gate-stop.ts хранит остановку; log_line запоминает её, только если вопросника нет). Ход кончился,
    // вопрос не задан (нет записи forms/ и нет «?» в конце хода) — вкладке ОДНО письмо «задай вопрос через question» и отметка «⚠ ждёт вашего
    // решения, вопроса нет» в сводках (возвращается gate для statusOf). Снимают: открытый вопрос, «?» в конце хода, слово владельца. Фраза
    // ожидания («до вашего решения») вопросом не считается. Идущий ход — без письма: вопрос может быть задан в нём. Письмо — раз на остановку.
    //
    // ОЖИДАНИЕ РЕШЕНИЯ ВЛАДЕЛЬЦА ТЕКСТОМ (задача 064, п. 10; владелец, 2026-10-17: «Это нарушает правило из задачи 062: остановка на ваших
    // воротах должна заканчиваться вопросом - исправь»). Ход вкладки владельца (не сессии задачи: её ожидание адресовано интегратору, задача
    // 056) кончился фразой ожидания решения владельца (WAITING_PHRASES, без «?» в конце), вопросника нет — та же остановка, вид «wait»: одно
    // письмо (WAIT_LETTER) и отметка ⚠ вместо «ждёт вас». Граница: ход, кончившийся «?», — вопрос текстом, владелец видит его и отвечает
    // словом; фраза ожидания вопросом не является — отвечать не на что. Фраза, называющая другую вкладку (интегратора, исполнителя,
    // приёмщика, сессию), — не ожидание владельца. Снимают: вопросник, «?» в конце хода, слово владельца, ход с работой после фразы; пустой
    // ход («понял») отметку держит без нового письма.
    const OTHER_PARTY = /интегратор|исполнител|при[её]мщик|при[её]мк|воркер|сесси/i
    async function gateStep(c: Card, busy: boolean, end: { at: number; text: string; ownerAfter: boolean } | undefined, formIsOpen: boolean, t: number): Promise<{ at: number; wait?: true; text?: string } | undefined> {
      let g = gateOf(c.session, undefined, t)
      if (!g && !busy && end && !end.ownerAfter && !c.spawned && !formIsOpen) {
        const e = endOfTurn(end.text)
        if (e?.wait && !OTHER_PARTY.test(e.text)) g = noteGate(c.session, e.text, end.at, undefined, "wait")
      }
      if (!g) return undefined
      if (formIsOpen) {
        clearGate(c.session)
        return undefined
      }
      // слово владельца после записи снимает остановку и в идущем ходе (после его слова вкладка работает); ownerAfter не годится: слово,
      // с которого начался ход, тоже «после прошлого конца»
      if ((await ownerWordAfter(c.session, g.at)) > 0) {
        clearGate(c.session)
        return undefined
      }
      if (g.kind === "wait") {
        if (busy || !end) return undefined
        if (end.at > g.at) {
          const e2 = endOfTurn(end.text)
          if ((e2 && !e2.wait) || (await workedAfter(c.session, g.at))) {
            clearGate(c.session)
            return undefined
          }
        }
        if (!g.letter) {
          const id = `wait-${safeKey(c.session)}-${g.at}`
          if (!letterExistsFor(c.session, id)) postLetter(c.session, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: c.session, time: t, text: WAIT_LETTER })
          markGateLetter(c.session, t)
          log(`owner awaited by a phrase without a question: ${c.session} reminded`)
        }
        return { at: g.at, wait: true, text: g.text }
      }
      if (busy || !end || end.at <= g.at) return undefined
      const e = endOfTurn(end.text)
      if (e && !e.wait) {
        clearGate(c.session)
        return undefined
      }
      if (!g.letter) {
        const id = `gate-${safeKey(c.session)}-${g.at}`
        if (!letterExistsFor(c.session, id)) postLetter(c.session, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: c.session, time: t, text: GATE_LETTER })
        markGateLetter(c.session, t)
        log(`gate stop without a question: ${c.session} reminded`)
      }
      return { at: g.at }
    }

    // ПРОСТОЙ ВКЛАДКИ МЕЖДУ СЕССИЯМИ (задача 063, idle-tab.ts; владелец, 2026-10-16: «что-то застряло?»). Вкладка «ждёт своих задач» (state
    // tasks: хода нет, вопроса владельцу нет, наблюдения нет, своего вопроса с expect_reply нет, своей задачи нет), открыта в окне, и у неё
    // стоящая задача (между сессиями или её сессия ждёт её указаний) без идущей сессии рядом либо с ждущей сессией — дольше idle_tab_minutes.
    // Начало эпизода — конец её последнего хода или изменение стоящих задач (что позже); после письма — закреплено в idle-tabs/, так что
    // пустой ход в ответ на письмо его не сдвигает. Кончают эпизод: другое состояние (вопрос, наблюдение…), запуск сессии, ход с работой
    // после письма, слово владельца после письма, изменение стоящих задач. Письмо — одно на эпизод; отметка ◷ — в сводках (withIdle).
    async function idleStep(c: Card, s: Status, end: { at: number } | undefined, open: boolean, saved: Map<string, Status>, t: number): Promise<{ since: number; what: string[] } | undefined> {
      if (s.state === "working") return undefined // ход идёт (и ход, начатый письмом): эпизод не трогается, отметки нет
      const ep = idleOf(c.session, undefined, t)
      const min = loadConfig(c.directory).idleTabMin
      const b = s.state === "tasks" && open && min > 0 ? idleBlockers(c.session, listTasks(c.project).filter((x) => x.author === c.session && isOpen(x)), (sid) => waitsOn(sid, c.session, saved)) : undefined
      if (!b?.idle) {
        if (ep) clearIdleTab(c.session)
        return undefined
      }
      let since = Math.max(end?.at ?? 0, b.at)
      if (ep) {
        const over = b.at > ep.since || (await ownerWordAfter(c.session, ep.letter)) > 0 || (await workedAfter(c.session, ep.letter))
        if (over) clearIdleTab(c.session)
        else since = ep.since
      }
      if (!since || t - since < min * 60_000) return undefined
      const what = idleWhat(b.items)
      if (!idleOf(c.session, undefined, t)) {
        const id = `idle-${safeKey(c.session)}-${since}`
        if (!letterExistsFor(c.session, id)) postLetter(c.session, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: c.session, time: t, text: idleLetter((t - since) / 60_000, b.items) })
        holdIdle(c.session, since, t)
        log(`idle tab: ${keyOf(c)} (${c.session}) stands since ${hm(since)}: ${what.join("; ")}; reminded`)
      }
      return { since, what }
    }

    // ВОПРОС ВЛАДЕЛЬЦУ НЕ ПРОПАДАЕТ МОЛЧА (задача 040, form-wait.ts). Раз в FORM_EVERY_MS: (1) запись о вопросе встроенного вопросника открыта,
    // а хода во вкладке нет (перезапуск окна или службы, вопрос закрыли без ответа, событие не дошло) - вкладку будит служебное письмо с
    // текстом и вариантами: задать вопрос заново (до 3 раз, не чаще раза в 2 минуты; потом «без ответа, нужен владелец»); (2) уведомление
    // владельцу при появлении вопроса и раз в 30 минут, пока он открыт: всплывающее в окнах, а по настройке проекта owner_system_notify -
    // ещё и системное Windows. За владельца не отвечается и вариант не выбирается нигде.
    const FORM_EVERY_MS = Number(process.env.CREW_HARNESS_FORM_MS) || 5_000
    let formAt = 0
    async function formWatch() {
      if (now() - formAt < FORM_EVERY_MS) return
      formAt = now()
      const windows = liveWindows()
      await formTick(
        {
          processStart: PROCESS_START,
          tab: async (s) => {
            const c = readJson<Card>(cardFile(s))
            const tab = tabOf(s, windows)
            const open = !!tab || (!!c && mayWakeCard(c, windows))
            let busy = tab ? !!tab.tab.busy : !!c?.busy
            // окно или визитка говорит «идёт», а база ходов не видит (после перезапуска): не занята. Вопрос на экране (инструмент ждёт) - занята
            if (busy && !(await pendingTool(s)) && (await staleBusy(s, now()))) busy = false
            if (!busy && !tab && (await openTurn(s, now()))) busy = true
            return { open, busy }
          },
          idle: (s, since) => idleFactsAfter(s, since),
          ownerWrote: async (s, since) => (await ownerWordAfter(s, since)) > 0,
          wake: (s, text, id) => {
            if (letterExistsFor(s, id)) return
            postLetter(s, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: s, time: now(), text })
          },
          say: (line) => log(line),
        },
        now(),
      )
      // ОТВЕТ ВЛАДЕЛЬЦА СНАРУЖИ ОКНА (задача 059, owner-answer.ts): файл из scripts/crew-answer.mjs — прерывание хода и письмо с ответом
      await answerTick({
        interrupt: (s) => interruptTurn(ctx.session, s),
        letter: (s, text, id) => {
          if (!letterExistsFor(s, id)) postLetter(s, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: s, time: now(), text })
        },
        history: (s, note) => {
          const c = readJson<Card>(cardFile(s))
          for (const ref of [c?.task, c?.review]) {
            const task = ref ? loadTask(ref.project, ref.n) : undefined
            if (task && (task.executor === s || task.reviewer === s)) taskEvent(task, PLUGIN_SENDER, undefined, note)
          }
          void clearStuck(s, "the owner answered the question form from outside")
          if (c) void deliver(c)
        },
        say: (line) => log(line),
      }, now())
      formReminders(now(), (session, f, message) => {
        const c = readJson<Card>(cardFile(session))
        const title = `${short(sessionLabel(session, c ? keyOf(c) : session), 40)} ждёт вас`
        const wins = liveWindows()
        for (const w of wins) postNotice(w.pid, { sessionID: session, title, message: short(message, 100), attention: true, duration: 30_000 })
        let toast = false
        try {
          if (c && loadConfig(c.directory).ownerSystemNotify) toast = systemToast(title, short(message, 200), log)
        } catch {}
        log(`owner wanted by ${session}: question ${f.id}${f.exhausted ? " (no answer after the repeats)" : f.notifiedAt ? " (reminder)" : ""}`)
        return wins.length > 0 || toast
      })
    }

    // СТОРОЖ ПОТОКА (план 002.4): раз в минуту — затянувшееся. Замок вливания держат дольше stall_minutes; сданная задача
    // ждёт приёмщика дольше stall_minutes (места заняты) — письмо с побудкой поставившему задачу (интегратору): что
    // стоит, кто держит, что можно сделать. Одно письмо на случай (id из проекта, номера и времени начала).
    let flowAt = 0
    // СОГЛАСОВАНИЕ ПЛАНОВ (план 004, шаг 3). Решение владельца приходит файлом из окна (/plans, approvals.ts):
    // «вернуть» — план автору с замечаниями владельца, перепроверка заново; «согласовать» — план уходит приёмщику
    // вливания (новая сессия): вписать решение в план, влить, accept. План на согласовании — уведомление во все окна,
    // повтор через owner_reminder_min.
    function applyApprovals() {
      for (const a of readApprovals()) {
        const t = loadTask(a.project, a.n)
        removeApproval(a.project, a.n)
        if (!t?.plan || t.status !== "approval") continue
        const p = t.plan
        p.approval = { decision: a.decision, ...(a.text ? { text: a.text } : {}), at: a.at }
        p.notifiedAt = undefined
        const day = new Date(a.at).toISOString().slice(0, 10)
        if (a.decision === "no") {
          p.clean = 0
          p.stuck = false
          t.rework = (t.rework ?? 0) + 1
          t.rework_sync = false
          t.rework_note = `ЗАМЕЧАНИЯ ВЛАДЕЛЬЦА к плану ${p.n} (${day}):\n${a.text ?? ""}\nИсправь в файле плана и сдай снова тем же отчётом — перепроверка начнётся заново (новыми сессиями).`
          if (t.executor) addObligation(t.executor, { qid: t.qid, from_session: t.author, from_role: t.author_role, at: now(), nudges: 0, task: t.title })
          taskEvent(t, "owner", "rework", `владелец вернул план: ${(a.text ?? "").slice(0, 300)}`)
        } else {
          taskEvent(t, "owner", "submitted", `владелец: план ${DECISION_RU[a.decision]} (${day}) — приёмщик впишет решение и вольёт`)
        }
        postLetter(t.author, { id: `plan-decision-${safeKey(t.project)}-${t.n}-${a.at}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: now(), wake: false, text: `План ${p.n} (задача ${taskNo(t)}): владелец — ${DECISION_RU[a.decision]}${a.text ? `: ${a.text}` : ""}.` })
        log(`plan ${p.n} (${t.project} ${taskNo(t)}): owner ${a.decision}`)
      }
      for (const t of listTasks()) {
        if (t.status !== "approval" || !t.plan) continue
        const acfg = loadConfig(t.directory)
        const every = Math.max(1, acfg.ownerReminderMin) * 60_000
        if (t.plan.notifiedAt && now() - t.plan.notifiedAt < every) continue
        if (acfg.planApprover === "integrator") {
          // согласует интегратор (plan_approver): письмо автору с побудкой; владелец видит план в /crew и может решить сам (/plans)
          postLetter(t.author, { id: `plan-approve-${safeKey(t.project)}-${t.n}-${t.plan.rounds.length}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: now(), text: `План ${t.plan.n} (${t.plan.file}, задача ${taskNo(t)}) прошёл перепроверку${t.plan.stuck ? " (раунды кончились — решай по последним замечаниям)" : ""} и ждёт твоего согласования: crew_task {action: "plan_decide", n: ${t.n}, decision: "ok" | "ok-shortcuts" | "no", text: "замечания, если no"}.` })
        } else {
          const message = `${t.title.replace(/^план \S+: /, "")}${t.plan.stuck ? " — раунды кончились, решаете по последним замечаниям" : ""} · /plans`
          const wins = liveWindows()
          if (!wins.length) continue // окон нет — уведомить некого: не отмечать, повторить на следующем проходе
          for (const w of wins) postNotice(w.pid, { title: `План ${t.plan.n} ждёт согласования`, message: short(message, 100), attention: true, duration: 30_000 })
        }
        t.plan.notifiedAt = now()
        saveTask(t)
      }
    }

    // ШАГИ ПЛАНА — ЗАДАЧИ (план 004, шаг 4). Согласованный и влитый план (задача-план очищена) читается из целевой
    // ветки; каждый шаг — задача с его «Что» и «Приёмкой», границами плана и режимом выполнения. Шаг стартует, когда
    // закрыто всё из его «после:» (и «после:» его фазы) и не идёт шаг с пересекающимся «где:»; внутри лимитов проекта;
    // по приоритету шага, иначе фазы, затем по порядку в плане. Шаг-подплан — задача-план. Все шаги закрыты —
    // письмо автору: закрыть план. Раз в PLAN_STEPS_MS: файл плана читается из git.
    const PLAN_STEPS_MS = Number(process.env.CREW_HARNESS_PLANSTEPS_MS) || 10_000
    let planStepsAt = 0
    async function planSteps() {
      if (now() - planStepsAt < PLAN_STEPS_MS) return
      planStepsAt = now()
      for (const pt of listTasks()) {
        if (!pt.plan || pt.status !== "done" || pt.plan.finished || !pt.plan.approval || pt.plan.approval.decision === "no") continue
        const author = readJson<Card>(cardFile(pt.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue // ставит процесс автора
        const cfg = loadConfig(pt.directory)
        const text = await fileAtAsync(pt.directory, cfg.targetBranch, pt.plan.file)
        if (!text) continue
        const plan = parsePlan(text, cfg.planForm)
        const steps = allSteps(plan)
        pt.plan.spawned ??= {}
        if (cfg.planSteps === "manual") {
          // задачи по шагам ставит автор сам (plan_steps: manual): одно письмо со списком шагов
          if (!pt.plan.listed) {
            pt.plan.listed = true
            pt.plan.total = steps.length
            saveTask(pt)
            postLetter(pt.author, { id: `plan-steps-${safeKey(pt.project)}-${pt.n}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: pt.author, time: now(), text: `План ${pt.plan.n} влит. Шаги (plan_steps: manual — задачи ставишь сам, crew_spawn):\n${steps.map((x) => `— ${x.id} ${x.title}${x.after.length ? ` [после: ${x.after.join(", ")}]` : ""}: ${x.what}\n  приёмка: ${x.criteria.join("; ")}`).join("\n")}` })
          }
          continue
        }
        if (pt.plan.total !== steps.length) {
          pt.plan.total = steps.length // для /crew: «шаги закрыто/всего»
          saveTask(pt)
        }
        // модель шагов — этап разработки набора (задача 003): отказ — шаги в этот проход не ставятся, автору одно письмо
        const stepChoice = resolveStageProfile(profileState(pt.directory).state, "develop", { autoPlan: true })
        if (stepChoice && "refuse" in stepChoice) {
          const rid = `plan-steps-refused-${safeKey(pt.project)}-${pt.n}-${safeKey(stepChoice.refuse).slice(0, 60)}`
          if (!letterExists(pt.author, rid)) postLetter(pt.author, { id: rid, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: pt.author, time: now(), text: `План ${pt.plan.n}: шаги не ставятся — ${stepChoice.refuse}. Исправь профили или переключи набор (/crew-sets, /crew-profiles); шаги встанут сами.` })
          continue
        }
        const taskOf = (id: string) => (pt.plan!.spawned![id] ? loadTask(pt.project, pt.plan!.spawned![id]) : undefined)
        const done = (id: string) => !!steps.find((s) => s.id === id)?.done || taskOf(id)?.status === "done"
        const running = steps.filter((s) => isOpen(taskOf(s.id)))
        const order = new Map(steps.map((s, i) => [s.id, i]))
        const prio = (s: (typeof steps)[number]) => s.priority ?? plan.phases.find((f) => f.id === s.phase)?.priority ?? cfg.defaultPriority
        const ready = steps
          .filter((s) => !s.done && !pt.plan!.spawned![s.id] && stepDeps(plan, s).every(done))
          .sort((a, b) => prio(a).localeCompare(prio(b)) || order.get(a.id)! - order.get(b.id)!)
        let changed = false
        for (const s of ready) {
          const busyWhere = running.find((r) => r.where.some((w) => s.where.includes(w)))
          if (busyWhere) continue // пересекается по «где:» с идущим шагом — ждёт его
          const open = listTasks(pt.project).filter(isOpen)
          const workers = open.filter((x) => x.kind === "spawn" && x.role === DEFAULT_ROLE && (x.status === "starting" || x.status === "running"))
          const p = prio(s)
          if (p !== "P0" && (countedOpen(open, cfg.acceptedSlot).length >= cfg.inflightLimit || workers.length >= (cfg.spawnLimits[DEFAULT_ROLE] ?? cfg.spawnLimits["*"] ?? 3))) break // лимиты — ждать
          if (p !== "P0" && cfg.acceptedSlot === "free" && cfg.cleanupLimit > 0 && waitingCleanup(open).length >= cfg.cleanupLimit) break // cleanup_limit: ждущих уборки слишком много — ждать
          const boundaries = [plan.bodies["Не делаем"]?.trim(), `Режим выполнения: ${pt.plan.approval.decision === "ok" ? "без упрощений — ни заглушек, ни TODO, ни «временно»" : "упрощения — только перечисленные в плане"}.`].filter(Boolean).join("\n")
          // без набора шаг идёт на medium, срезанной границами проекта (задача 016)
          const stepCut = clampTier("medium", cfg.tierBounds)
          const model = stepChoice ? stepChoice.model : (cfg.spawnModels[stepCut.tier] ?? DEFAULT_SPAWN_MODELS[stepCut.tier])
          const base = {
            project: pt.project, goal: s.subplan ? `${s.what}\n(подплан шага ${s.id} плана ${pt.plan.n})` : s.what, criteria: s.criteria.join("\n"), boundaries,
            priority: p, tier: (stepChoice ? stepChoice.tier : stepCut.tier) as "heavy" | "medium" | "light", role: DEFAULT_ROLE, model, author: pt.author, author_role: pt.author_role, qid: `q${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            status: "starting" as const, kind: "spawn" as const, executor: plannedSessionId(), directory: pt.directory,
            plan_step: { project: pt.project, task: pt.n, plan: pt.plan.n, step: s.id, file: pt.plan.file },
          }
          let t: Task
          if (s.subplan) {
            let names: string[] = []
            try {
              names = readdirSync(path.join(pt.worktree && existsSync(pt.worktree) ? pt.worktree : pt.directory, cfg.plansDir))
            } catch {}
            const n = nextPlanNumber(names, listTasks(pt.project).filter((x) => x.plan).map((x) => x.plan!.n), pt.plan.n)
            t = createTask({ ...base, title: `план ${n}: ${s.title}`, plan: { n, file: path.posix.join(cfg.plansDir.replace(/\\/g, "/"), cfg.planName.replace(/\{n\}/g, n).replace(/\{slug\}/g, slugify(s.title))), source: `${s.what}\nКритерии шага ${s.id} плана ${pt.plan.n}:\n${s.criteria.join("\n")}`, parent: pt.plan.n, rounds: [], clean: 0 } }, (n2, slug) => taskPlace(pt.directory, cfg, n2, slug, pt.project))
          } else t = createTask({ ...base, title: `${pt.plan.n} ${s.id} ${s.title}` }, (n2, slug) => taskPlace(pt.directory, cfg, n2, slug, pt.project))
          if (stepChoice) stampProfile(t, "executor", t.executor!, stepChoice, !!t.worktree)
          else stampClamp(t, "executor", t.executor!, stageOfLaunch(t, "executor"), model, stepCut.tier, stepCut.from)
          pt.plan.spawned[s.id] = t.n
          running.push(s)
          changed = true
          taskEvent(pt, PLUGIN_SENDER, undefined, `шаг ${s.id} плана ${pt.plan.n} — задача ${taskNo(t)}`)
          log(`plan ${pt.plan.n} (${pt.project}): step ${s.id} -> task ${taskNo(t)}`)
          await startTask(t)
        }
        if (steps.length && steps.every((s) => done(s.id))) {
          pt.plan.finished = true
          changed = true
          postLetter(pt.author, { id: `plan-finished-${safeKey(pt.project)}-${pt.n}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: pt.author, time: now(), text: `План ${pt.plan.n} «${plan.title}»: все шаги закрыты (${steps.length}). Закрой план: в шапке «**Статус:** ✅ ЗАКРЫТ <дата> (фазы; коммиты)», влей.` })
        }
        if (changed) saveTask(pt)
      }
    }

    // УБОРКА (retention.ts): раз в сутки, по retention_days (опция плагина; прежнее имя keep_days; умолчание 7, 0 — не
    // убирать); проверка — раз в HOUSEKEEP_MS, проход ограничен числом удалений за вызов и дозавершается со следующей проверки.
    const RETENTION_DAYS = ctx?.options?.retention_days !== undefined ? Number(ctx.options.retention_days) : Number(ctx?.options?.keep_days ?? 7)
    const HOUSEKEEP_MS = Number(process.env.CREW_HARNESS_HOUSEKEEP_MS) || 3_600_000
    let housekeptAt = 0
    function housekeep() {
      if (now() - housekeptAt < HOUSEKEEP_MS) return
      housekeptAt = now()
      const r = runRetention(RETENTION_DAYS, now())
      if (r?.done) log(`уборка: убрано писем ${r.letters}, папок ${r.dirs}, карточек ${r.cards}`)
    }

    const landedBusy = new Set<string>()
    function flowWatch() {
      if (now() - flowAt < (Number(process.env.CREW_HARNESS_FLOW_MS) || 60_000)) return
      flowAt = now()
      const t = now()
      const byProject = new Map<string, Task[]>()
      for (const x of listTasks()) byProject.set(x.project, [...(byProject.get(x.project) ?? []), x])
      for (const [project, list] of byProject) {
        const any = list.find((x) => x.directory)
        if (!any) continue
        const lock0 = mergeHolder(project)
        if (lock0 ? mergeLockAbandoned(project, lock0) : true) wakeLockWaiters(project, true) // брошенный замок или замка нет, а ждущие записаны: разбудить (задача 011)
        // замок слияния держит задача, чей проверенный кандидат уже в главной ветке на origin: отпустить (только чтение, 20 с)
        if (lock0 && list.some((x) => x.n === lock0.n) && !landedBusy.has(project)) {
          landedBusy.add(project)
          releaseLandedLock(project, loadConfig(any.directory).targetBranch)
            .then((m) => m && log(m))
            .catch((e) => log(`merge lock auto-release of ${project} failed: ${e}`))
            .finally(() => landedBusy.delete(project))
        }
        const stall = loadConfig(any.directory).stallMin * 60_000
        if (!(stall > 0)) continue
        const lock = mergeHolder(project)
        const lockTask = lock ? list.find((x) => x.n === lock.n) : undefined
        if (lock && lockTask && t - lock.at > stall) {
          const id = `stall-lock-${safeKey(project)}-${lock.n}-${lock.at}`
          if (!letterExists(lockTask.author, id)) {
            postLetter(lockTask.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: lockTask.author, time: t, text: `Замок слияния проекта ${project} держит приёмка #${lock.n} «${lockTask.title}» (сессия ${lock.session}) с ${hhmm(lock.at)} — ${Math.round((t - lock.at) / 60_000)} мин; остальные слияния ждут. Держателю: вызвать accept ${lock.n} после успешного слияния и пуша или unlock ${lock.n}, если слияние прервано; при merge_precheck: required плагин сам отпускает замок, когда проверенный кандидат уже на вершине origin. Узнай у приёмщика, что мешает (crew_send {to: "${lock.session}", text: "..."}), и помоги или реши; без владельца не решить — спроси владельца.` })
            noticeAuthor(lockTask.author, project, { sessionID: lock.session, title: `Замок слияния ${project}: #${lock.n} держит ${Math.round((t - lock.at) / 60_000)} мин`, message: short(`«${lockTask.title}» · письмо ждёт автора (${lockTask.author_role}) в ящике`, 80), duration: 15_000 }, false)
            log(`stall: merge lock of ${project} #${lock.n} held since ${lock.at}`)
          }
        }
        // ПРИНЯТА, НО НЕ ОЧИЩЕНА (план 002.6, дефект 2): держит место в inflight_limit. Через accepted_reminder_min —
        // письмо приёмщику с побудкой («повтори cleanup») и автору; отказ crew_spawn называет такие поимённо. Повтор (задача 043, M18a) —
        // каждые accepted_reminder_min, не больше ACCEPTED_REMINDERS_MAX раз на приёмку; дальше тишина и строка «не убрана N ч» в /crew.
        const accCfg = loadConfig(any.directory)
        const accMin = accCfg.acceptedReminderMin
        // accepted_slot: free — принятая место не занимает, письма говорят «ждёт уборки N из M» (cleanup_limit 0 — «N, предела нет»)
        const waitingN = waitingCleanup(list).length
        const waitingOf = accCfg.cleanupLimit > 0 ? `ждёт уборки ${waitingN} из ${accCfg.cleanupLimit}` : `ждёт уборки ${waitingN}, предела нет`
        if (accMin > 0)
          for (const x of list.filter((y) => y.status === "accepted")) {
            const at = acceptedAt(x)
            if (t - at < accMin * 60_000) continue
            const sent = acceptedReminders(x, at)
            if (sent >= ACCEPTED_REMINDERS_MAX) continue
            const k = sent + 1
            if (k > 1 && t - letterTime(x.author, acceptedReminderId(x, at, k - 1)) < accMin * 60_000) continue
            const id = acceptedReminderId(x, at, k)
            const nth = k > 1 ? ` Напоминание ${k} из ${ACCEPTED_REMINDERS_MAX}${k === ACCEPTED_REMINDERS_MAX ? ", последнее: дальше — только строка в /crew" : ""}.` : ""
            const toReviewer = accCfg.acceptedSlot === "free"
              ? `Задача ${taskNo(x)} «${x.title}» принята ${ago(at, t)}, но не очищена — ждёт уборки, место в inflight_limit не занимает (${waitingOf}). Убери её дерево и ветки и повтори crew_task {action: "cleanup", n: ${x.n}}: отказ назовёт, что осталось. Не убирается — напиши автору (${x.author_role}), что мешает.`
              : `Задача ${taskNo(x)} «${x.title}» принята ${ago(at, t)}, но не очищена — держит место в лимите задач проекта (inflight_limit). Убери её дерево и ветки и повтори crew_task {action: "cleanup", n: ${x.n}}: отказ назовёт, что осталось. Не убирается — напиши автору (${x.author_role}), что мешает.`
            const toAuthor = accCfg.acceptedSlot === "free"
              ? `Задача ${taskNo(x)} «${x.title}» принята ${ago(at, t)}, но не очищена${x.reviewer ? ` (приёмщик ${x.reviewer}, ему написано)` : ""} — ждёт уборки, место не занимает; ${waitingOf}, пока не будет crew_task cleanup.`
              : `Задача ${taskNo(x)} «${x.title}» принята ${ago(at, t)}, но не очищена${x.reviewer ? ` (приёмщик ${x.reviewer}, ему написано)` : ""} — держит место в inflight_limit, пока не будет crew_task cleanup.`
            if (x.reviewer && !letterExists(x.reviewer, id))
              postLetter(x.reviewer, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: x.reviewer, time: t, text: toReviewer + nth })
            if (!letterExists(x.author, id))
              postLetter(x.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: x.author, time: t, text: toAuthor + nth })
            log(`stall: ${taskNo(x)} of ${project} accepted ${at}, not cleaned up (reminder ${k} of ${ACCEPTED_REMINDERS_MAX})`)
          }
        for (const x of list.filter((y) => y.status === "submitted" && !y.reviewer)) {
          const since = [...(x.history ?? [])].reverse().find((h) => h.status === "submitted")?.at ?? 0
          if (!since || t - since <= stall) continue
          const id = `stall-review-${safeKey(project)}-${x.n}-${since}`
          if (letterExists(x.author, id)) continue
          const busy = list.filter((y) => y.review_kind === "spawn" && y.reviewer && isOpen(y) && y.status !== "rework" && y.n !== x.n)
          postLetter(x.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: x.author, time: t, text: `Задача ${taskNo(x)} «${x.title}» сдана в ${hhmm(since)} и ${Math.round((t - since) / 60_000)} мин ждёт приёмщика: места приёмщиков (spawn_limits.${loadConfig(x.directory).reviewer === "acceptor" ? "acceptor" : "reviewer"}) заняты — ${busy.map((y) => `#${y.n} ${statusRu(y.status)}`).join(", ") || "?"}. Разберись, почему те приёмки стоят (письмо приёмщику), или подними предел приёмщиков (crew_config).` })
          noticeAuthor(x.author, project, { title: `${taskNo(x)} ждёт приёмщика ${Math.round((t - since) / 60_000)} мин`, message: short(`«${x.title}» · места приёмщиков заняты, письмо ждёт автора в ящике`, 80), duration: 15_000 }, false)
          log(`stall: ${taskNo(x)} of ${project} waits for a reviewer since ${since}`)
        }
      }
    }

    // ХВОСТЫ ЗАКРЫТЫХ ЗАДАЧ (план 002.4): раз в LEFT_EVERY_MS у задач, закрытых за последние трое суток, ищем оставшиеся
    // ветки (локальные и на origin) и worktree по шаблонам настроек (review.ts leftoversOf, асинхронный git). Нашлись —
    // письмо автору задачи со списком; одно письмо на один набор хвостов. Отменённая задача — убрать или сохранить
    // работу решает автор. Сам плагин не удаляет: удаление веток на origin — действие наружу.
    const LEFT_EVERY_MS = Number(process.env.CREW_HARNESS_LEFT_MS) || 600_000
    // НЕ ПРИ ЗАПУСКЕ (2026-10-07): первый проход шёл сразу при подъёме сервиса, да ещё с ls-remote, — 32 с прохода
    // в минуту, когда сервер и так загружает сессии и окна переподключаются. Первый проход — через LEFT_EVERY_MS,
    // первый взгляд на origin — через LEFT_REMOTE_FIRST_MS.
    let leftAt = Date.now()
    const leftClean = new Set<string>()
    const LEFT_PER_RUN = Number(process.env.CREW_HARNESS_LEFT_PER_RUN) || 3
    const LEFT_REMOTE_MS = Number(process.env.CREW_HARNESS_LEFT_REMOTE_MS) || 6 * 3_600_000
    const LEFT_REMOTE_FIRST_MS = Number(process.env.CREW_HARNESS_LEFT_REMOTE_FIRST_MS) || 30 * 60_000
    let leftRemoteAt = Date.now() - LEFT_REMOTE_MS + LEFT_REMOTE_FIRST_MS
    async function leftWatch() {
      if (now() - leftAt < LEFT_EVERY_MS) return
      leftAt = now()
      // ЛЕГЧЕ (2026-10-07): проход гонял git по каждой задаче, закрытой за трое суток (ls-remote, for-each-ref, worktree
      // list на репозитории nova), — десятки процессов git каждые 10 мин на перегруженной гейтами машине; задержки потока
      // сервера 8–17 с пришлись на этот шаг. Теперь: задача, у которой хвостов не нашлось, больше не проверяется (до
      // перезапуска); за проход — не больше LEFT_PER_RUN задач; origin (ls-remote, сеть) — раз в LEFT_REMOTE_MS.
      const remote = now() - leftRemoteAt >= LEFT_REMOTE_MS
      if (remote) leftRemoteAt = now()
      const cand = listTasks().filter((t) => (t.status === "done" || t.status === "cancelled") && now() - (t.updated ?? 0) <= 3 * 86_400_000 && !leftClean.has(`${t.project}#${t.n}`)).slice(0, LEFT_PER_RUN)
      await forEachBudget("leftWatch", cand, async (t) => {
        const key0 = `${t.project}#${t.n}`
        const left = await leftoversOf(t, loadConfig(t.directory), remote)
        if (!left.length) {
          if (remote) leftClean.add(key0) // чисто и локально, и на origin — больше не смотреть
          return
        }
        const key = left.slice().sort().join("|")
        let h = 0
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
        const id = `stall-left-${safeKey(t.project)}-${t.n}-${(h >>> 0).toString(36)}`
        if (letterExists(t.author, id)) return
        const what = t.status === "done" ? `принятой задачи ${taskNo(t)} «${t.title}» остались хвосты — убери их` : `отменённой задачи ${taskNo(t)} «${t.title}» осталась работа — убери её или сохрани, решаешь ты`
        postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: now(), text: `У ${what}:\n${left.map((x) => `— ${x}`).join("\n")}\n(git worktree remove, git branch -D, git push origin --delete — по правилам проекта.)` })
        log(`leftovers of ${t.project} ${taskNo(t)}: ${left.length}`)
      }, log)
    }

    async function syncTitles() {
      if (typeof ctx.session.update !== "function") return
      const bud = stepBudget("syncTitles", log)
      const all = allCards()
      let ci = 0
      // ПЕРЕИМЕНОВАНИЕ — ТЯЖЁЛОЕ ДЛЯ СЛУЖБЫ (2026-10-13): каждый session.update пишет в базу OpenCode в процессе службы; 237 старых
      // сессий после смены формата названия давали задержку цикла 5–11 с. Поэтому: не больше TITLES_PER_PASS переименований за
      // проход и закрытые задачи старше TITLES_FRESH_MS не переименовываются вовсе (их названия не меняются, роль в них не нужна).
      const perPass = Number(process.env.CREW_HARNESS_TITLES_PER_PASS) || 3
      const freshMs = Number(process.env.CREW_HARNESS_TITLES_FRESH_MS) || 24 * 3_600_000
      let renamed = 0
      for (const c of all) {
        if (await bud.stop(ci++, all.length)) break
        // карточки умершего процесса (сервер перезапущен посреди задачи) — тоже наши; чужой живой процесс — нет
        if (!c.spawned || (!c.task && !c.review) || (c.pid !== process.pid && pidAlive(c.pid))) continue
        const asReviewer = !c.task && !!c.review
        const ref = (c.task ?? c.review)!
        const t = loadTask(ref.project, ref.n)
        if (!t) continue
        if (!isOpen(t) && Date.now() - (t.updated ?? 0) > freshMs) continue // старая закрытая задача: название не трогаем
        const MARK: Record<string, string> = { submitted: "✓", reviewing: "✓◐", rework: "↻", approval: "◇", accepted: "✓✓◐", done: "✓✓", cancelled: "✗" }
        const replaced = asReviewer ? t.reviewer !== c.session : t.executor !== c.session
        // сессия задачи (задача 058): своё состояние — сдана, передана; заголовок «045 С4-3 исп …»
        const ses = asReviewer ? undefined : sessionOf(t, c.session)
        const method = !!ses && ses.code !== EXECUTOR_CODE
        const mark = method && ses!.status === "submitted" ? (t.status === "done" ? "✓✓" : t.status === "cancelled" ? "✗" : "✓") : method && ses!.status === "handed" ? "↷" : replaced ? "↷" : asReviewer ? (t.status === "done" ? "✓✓" : t.status === "cancelled" ? "✗" : "") : (MARK[t.status] ?? "")
        // значок и слово (план 003.1; владелец: «что значат две галочки и луна?» — значки оставить, слово рядом)
        const WORD: Record<string, string> = { "✓": "сдана", "✓◐": "приёмка", "↻": "доработка", "◇": "согласование", "✓✓◐": "влита", "✓✓": "готово", "✗": "отменена", "↷": "передана" }
        // роль в названии (владелец, 2026-10-11: «в названиях сессий не указано, какая роль»): исп — исполнитель, прм — приёмщик;
        // слово «приёмка» рядом со значком — статус задачи, не роль
        const title = `${method ? `${sessionRef(t, ses!)} ` : `${taskNo(t)} `}${asReviewer ? "прм" : "исп"}${mark ? ` ${mark} ${WORD[mark]}` : ""} ${t.title}`
        if (c.titleShown === title) continue
        if (renamed >= perPass) break // остальное — на следующих проходах
        renamed++
        try {
          await ctx.session.update({ sessionID: c.session, title })
          const fresh = readJson<Card>(cardFile(c.session)) ?? c
          fresh.titleShown = title
          fresh.title = title
          saveCard(fresh)
        } catch (e) {
          // сессии в OpenCode нет (удалена): повторять каждый проход бессмысленно — запоминаем название как показанное
          if (/NotFound/i.test(String((e as any)?.name ?? "") + String(e))) {
            const fresh = readJson<Card>(cardFile(c.session)) ?? c
            fresh.titleShown = title
            saveCard(fresh)
            log(`title ${c.session}: session not found, not retried`)
          } else log(`title ${c.session} failed: ${e}`)
        }
      }
    }

    // ЗАПУСК ЗАДАЧИ (план 002, Ф.1). Журнал уже записан (статус starting, id сессии выбран заранее). Шаги повторяемы:
    // session.create с тем же id возвращает уже созданную сессию (замер 2026-10-05), визитка перезаписывается тем же,
    // письмо с задачей кладётся, только если его ещё нет (id письма — из номера и попытки). Оборвался процесс на
    // любом шаге — следующий проход (resumeTasks) повторит запуск, второй сессии и второго письма не будет.
    const startingNow = new Set<string>()
    const startBlocked = new Map<string, number>() // задача → когда повторить запуск, отложенный из-за дерева
    const startFailed = new Map<string, string>() // задача → причина последнего сбоя создания сессии (resumeTasks скажет автору)
    const START_RETRY_MS = Number(process.env.CREW_HARNESS_START_RETRY_MS) || 120_000
    async function startTask(t0: Task): Promise<{ session?: string; error?: string }> {
      const key = `${t0.project}#${t0.n}`
      if (startingNow.has(key)) return { error: "запуск уже идёт" }
      startingNow.add(key)
      try {
        const t = loadTask(t0.project, t0.n) ?? t0
        if (t.status !== "starting") return { session: t.executor }
        const sid = t.executor ?? plannedSessionId()
        if (t.executor !== sid) {
          t.executor = sid
          saveTask(t)
        }
        // план 002.3: worktree и ветку задачи создаёт плагин, сессия работает в нём (хуки видят ветку задачи, не main).
        // План 002.6, дефект 3: сессия задачи с деревом по настройкам НИКОГДА не открывается в главной копии — там
        // исполнитель заводил дерево сам, не в той папке и со своим слагом (#19, #22 nova). Места нет в записи (её
        // записали прежним путём) — достроить по шаблону; дерево вне папки деревьев или не создалось — не запускать.
        let dir = t.directory
        if (t.kind === "spawn") {
          if ((startBlocked.get(key) ?? 0) > Date.now()) return { error: "запуск отложен: дерево задачи не готово" }
          const cfg = loadConfig(t.directory)
          if (cfg.worktrees && (!t.worktree || !t.branch)) {
            Object.assign(t, taskPlace(t.directory, cfg, t.folder ? String(t.n).padStart(3, "0") : t.n, t.slug, t.project))
            taskEvent(t, PLUGIN_SENDER, undefined, `место задачи достроено по настройкам: worktree ${t.worktree}, ветка ${t.branch}`)
          }
          if (t.worktree && t.branch) {
            const refuse = (why: string) => {
              startBlocked.set(key, Date.now() + START_RETRY_MS)
              const id = `start-refused-${safeKey(t.project)}-${t.n}-${safeKey(why).slice(0, 60)}`
              if (!letterExists(t.author, id)) {
                postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: Date.now(), text: `Задача ${taskNo(t)} «${t.title}» не запущена: ${why}. Сессию в главной копии плагин не открывает. Повтор — сам, раз в ${START_RETRY_MS / 60_000} мин; поправь причину или отмени задачу (crew_task {action: "cancel", n: ${t.n}}).` })
                taskEvent(t, PLUGIN_SENDER, undefined, `не запущена: ${why}`)
              }
              log(`task ${taskNo(t)} (${t.project}) not started: ${why}`)
              return { error: why }
            }
            if (cfg.worktrees && !insideDir(t.worktree, cfg.worktrees)) return refuse(`worktree ${t.worktree} вне папки деревьев проекта ${cfg.worktrees}`)
            const w = await ensureWorktree(t.directory, t.worktree, t.branch, cfg.targetBranch)
            if (!w.ok) return refuse(`worktree ${t.worktree} не создан: ${w.error}`)
            dir = t.worktree
            if (w.warn) log(`task ${taskNo(t)} (${t.project}): ${w.warn}`)
            if (w.note) {
              log(`task ${taskNo(t)} (${t.project}): ${w.note}`)
              taskEvent(t, PLUGIN_SENDER, undefined, w.note)
            }
            if (!t.worktree_ready) {
              t.worktree_ready = true
              saveTask(t)
              taskEvent(t, PLUGIN_SENDER, undefined, `worktree ${t.worktree}, ветка ${t.branch}${w.created ? " — создан плагином" : " — уже был"}`)
            }
            // СЕССИЯ ЗАДАЧИ С ПАПКОЙ (задача 058): своё дерево и ветка от ветки задачи (place own) и строки запуска в журналах папки —
            // до старта сессии; повтор оборванного запуска строк не дублирует (номер запуска уже записан — строка не пишется)
            const ses = sessionOf(t, sid)
            if (ses && t.folder) {
              if (ses.place === "own" && ses.worktree && ses.branch) {
                if (cfg.worktrees && !insideDir(ses.worktree, cfg.worktrees)) return refuse(`дерево сессии ${ses.worktree} вне папки деревьев проекта ${cfg.worktrees}`)
                const ws = await ensureWorktree(t.directory, ses.worktree, ses.branch, t.branch)
                if (!ws.ok) return refuse(`дерево сессии ${ses.worktree} не создано: ${ws.error}`)
                dir = ses.worktree
              }
              const why = writeLaunch(t, ses, dir)
              if (why) log(`task ${taskNo(t)} ${sesLabel(ses)}: строки запуска не записаны: ${why}`)
              else taskEvent(t, PLUGIN_SENDER, undefined, `строки запуска №${ses.launch} записаны (progress.log, log.md)`)
            }
            // файл окон профилей включённого набора — в дерево задачи ДО первого хода сессии (задача 003, REQ-22); сбой записи запуск не срывает
            try {
              const rep = syncTaskFile(t)
              if (rep.foreign.length) log(`task ${taskNo(t)}: в ${t.worktree} уже есть .opencode/opencode.json без пометки плагина — файл окон профиля не записан`)
              for (const e of rep.errors) log(`task ${taskNo(t)}: файл окон профиля: ${e}`)
            } catch (e) {
              log(`task ${taskNo(t)}: файл окон профиля не записан: ${e}`)
            }
          }
        }
        // заголовок (задача 058): «045 С4-3 исп Название задачи» у сессии методики, «060 исп …» у исполнителя, «#88 исп …» без папки
        const ses0 = sessionOf(t, sid)
        const head = ses0 && ses0.code !== EXECUTOR_CODE ? `${sessionRef(t, ses0)} исп` : `${taskNo(t)} исп`
        await ctx.session.create({ id: sid, title: `${head} ${t.title}`, location: { directory: dir }, metadata: { crewTask: { project: t.project, n: t.n, attempt: t.attempt } }, ...(t.model ? { model: splitLaunchModel(String(t.model)) } : {}) })
        const now = Date.now()
        const prev = readJson<Card>(cardFile(sid))
        const card: Card = { ...(prev ?? {}), session: sid, role: t.role, auto: false, title: `${head} ${t.title}`, directory: dir, repo: repoLabel(dir), project: t.project, model: t.model, modelAt: now, modelFrom: "request", pid: process.pid, updated: now, spawned: { by: t.author, task: t.goal.slice(0, 300), tier: t.tier, status: "running", at: now, qid: t.qid }, task: { project: t.project, n: t.n } }
        saveCard(card)
        mine.set(sid, card)
        addObligation(sid, { qid: t.qid, from_session: t.author, from_role: t.author_role, at: now, nudges: 0, task: t.title })
        const lid = taskLetterId(t)
        if (!letterExists(sid, lid)) postLetter(sid, { id: lid, from_role: t.author_role, from_session: t.author, to: sid, time: now, qid: t.qid, text: formatTaskLetter(t) })
        taskEvent(t, PLUGIN_SENDER, "running", `сессия ${sid}`)
        void deliver(card)
        const w = tabOf(t.author)
        if (w?.window.pid) postNotice(w.window.pid, { sessionID: sid, title: `${ses0 && ses0.code !== EXECUTOR_CODE ? sessionRef(t, ses0) : taskNo(t)} запущена`, message: short(t.title, 80), duration: 8_000 })
        log(`task ${taskNo(t)} (${t.project}) started: ${sid} model=${t.model}`)
        return { session: sid }
      } catch (e) {
        log(`task ${taskNo(t0)} start failed: ${e}`)
        startFailed.set(key, String((e as any)?.message ?? e))
        return { error: String((e as any)?.message ?? e) }
      } finally {
        startingNow.delete(key)
      }
    }
    // Задачи в статусе starting (запуск оборвался или задачу поставил MCP-сервер): запускает процесс, где живёт
    // вкладка автора (её визитка), или любой, если процесса автора уже нет.
    async function resumeTasks() {
      for (const t of listTasks()) {
        if (t.status !== "starting") continue
        const author = readJson<Card>(cardFile(t.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue
        const key = `${t.project}#${t.n}`
        startFailed.delete(key)
        await startTask(t)
        // сессию создать не удалось (модель недоступна и т. п.): повтор идёт сам, но молча он ждал бы вечно — автору одно письмо на попытку
        const why = startFailed.get(key)
        if (why) {
          const id = `start-failed-${safeKey(t.project)}-${t.n}-${t.attempt}`
          if (!letterExists(t.author, id)) {
            postLetter(t.author, { id, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: t.author, time: Date.now(), text: `Задача ${taskRef(t)} не запущена: сессию создать не удалось (${why.slice(0, 300)}). Плагин повторяет запуск сам на каждом проходе; не получится — поправь причину, передай задачу другой сессии (crew_task {action: "reassign", n: ${t.n}}) или отмени (crew_task {action: "cancel", n: ${t.n}}).` })
            const fresh = loadTask(t.project, t.n)
            if (fresh) taskEvent(fresh, PLUGIN_SENDER, undefined, `не запущена: ${why.slice(0, 200)}`)
          }
        }
      }
    }

    // ОЧЕРЕДЬ роли+ступени: письмо с tier ждёт свободной открытой вкладки нужной ступени.
    let queueBusy = false
    async function processQueue() {
      if (queueBusy) return
      queueBusy = true
      try {
        const windows = liveWindows()
        for (const roleDir of readdirSync(QUEUE)) {
          const dir = path.join(QUEUE, roleDir)
          for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
            const letter = readJson<Letter>(path.join(dir, f))
            if (!letter?.tier) continue
            const holders = allCards().filter((c) => safeKey(keyOf(c)) === roleDir && !children.has(c.session) && mayWakeCard(c, windows))
            const free = holders.filter((c) => !isBusy(c, windows)).map((c) => ({ ...c, busy: false }))
            if (!free.length) continue
            const cfg = loadConfig(free[0].directory)
            const pick = pickHolder(free, letter.tier, cfg)
            if (!pick) continue
            const claim = path.join(dir, `.${f}.claim`)
            try {
              renameSync(path.join(dir, f), claim)
            } catch {
              continue
            }
            postLetter(pick.session, { ...letter, to: pick.session })
            rmSync(claim, { force: true })
            setBusy(pick, true) // письмо займёт вкладку: следующее с tier не должно уйти туда же
            log(`queue ${f} -> ${pick.session} (${pick.role}, ${tierOf(pick.model, cfg)})`)
          }
        }
      } finally {
        queueBusy = false
      }
    }

    const clearIdle = (sessionID: string) => {
      const c = readJson<Card>(cardFile(sessionID))
      if (!c?.busy) return
      setBusy(c, false)
      void nudge(c) // ход закончился: если есть невыполненное обязательство — напоминание
    }

    // Событие простоя сессии (если контекст плагина его даёт); запас — строка `idle` в базе (таймер).
    try {
      const bus = (ctx as any).events ?? (ctx as any).event
      const on = bus?.on?.bind(bus)
      if (on) await on("session.idle", (ev: any) => clearIdle(String(ev?.properties?.sessionID ?? ev?.data?.sessionID ?? ev?.sessionID ?? "")))
    } catch (e) {
      log(`session.idle subscribe failed: ${e}`)
    }

    cleanupForms()
    // ответ владельца на вопросник снимает «застряла» у всех обязательств вкладки сразу (задача 052)
    void startFormWait(ctx, log, (s) => void clearStuck(s, "the owner answered the question form")).catch(() => {}) // ожидание по встроенному вопроснику (task 026), всегда включено
    if (probeEnabled()) void startEventProbe(ctx, log).catch(() => {}) // проба событий (task 026), по умолчанию выкл

    // Один проход доставки: зовут таймер (страховка, раз в POLL_MS = 1 с) и fs.watch ящиков (сразу).
    let passBusy = false
    // ПРОХОД НЕ ЗАВИСАЕТ (2026-10-05): у владельца цикл встал на 47 мин (21:27–22:14) — один вызов OpenCode внутри
    // прохода не вернулся, passBusy остался true, следующие проходы выходили сразу: ни доставки, ни подталкивания, ни
    // сторожа, и всё молча. Теперь каждый шаг — с пределом времени (зависший или упавший шаг в журнал, остальные
    // идут), а проход, висящий дольше PASS_STUCK_MS, следующий не ждёт (в журнале — шаг, на котором висит).
    const STEP_MS = Number(process.env.CREW_HARNESS_STEP_MS) || 60_000
    const PASS_STUCK_MS = Number(process.env.CREW_HARNESS_PASS_STUCK_MS) || 120_000
    let passStage = ""
    let passStartedAt = 0
    let passId = 0
    // ЖУРНАЛ МЕДЛЕННЫХ ШАГОВ (задача 034): шаг дольше SLOW_STEP_MS — одна строка, не чаще раза в минуту на шаг
    const SLOW_STEP_MS = Number(process.env.CREW_HARNESS_SLOW_STEP_MS) || 1000
    const slowLoggedAt = new Map<string, number>()
    const step = async (name: string, fn: () => any) => {
      passStage = name
      let timer: any
      const t0 = Date.now()
      try {
        await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`step ${name} took over ${STEP_MS} ms`)), STEP_MS)))])
      } catch (e) {
        log(`pass step ${name} failed: ${e}`)
      } finally {
        clearTimeout(timer)
        const took = Date.now() - t0
        if (took > SLOW_STEP_MS && Date.now() - (slowLoggedAt.get(name) ?? 0) >= 60_000) {
          slowLoggedAt.set(name, Date.now())
          log(`slow step ${name}: ${took} ms`)
        }
      }
    }
    async function pass() {
      if (passBusy) {
        if (now() - passStartedAt < PASS_STUCK_MS) return
        log(`pass stuck at ${passStage} for ${Math.round((now() - passStartedAt) / 1000)} s -- the next pass does not wait`)
      }
      passBusy = true
      passStartedAt = now()
      const id = ++passId
      try {
        recoverClaims()
        for (const c of allCards()) {
          if (c.busy && c.pid === process.pid && !children.has(c.session))
            void idleAfter(c.session, c.busySince ?? 0).then((done) => {
              if (done) clearIdle(c.session)
            })
          // разбудили, а запроса к модели не было (ход упал раньше): конец хода — строка idle после побудки
          else if (!c.busy && c.wokeAt && c.pid === process.pid)
            void idleAfter(c.session, c.wokeAt).then((done) => {
              if (!done) return
              const fresh = readJson<Card>(cardFile(c.session))
              if (!fresh?.wokeAt || fresh.busy) return
              markWoke(fresh, undefined)
              void nudge({ ...fresh, busySince: c.wokeAt })
            })
        }
        // Вкладка открыта в окне, но ещё не делала запросов (визитки нет), а письмо по её id ждёт — завести визитку.
        // Чужая сессия (другого сервера) не найдётся в ctx.session.get — touch вернёт пусто.
        await step("cards", async () => {
          for (const w of liveWindows())
            for (const t of w.tabs ?? []) if (!existsSync(cardFile(t.sessionID)) && waitingIn([t.sessionID]) && (await sessionInfo(t.sessionID))) await touch(t.sessionID)
        })
        await step("resumeTasks", resumeTasks)
        await step("applyApprovals", applyApprovals)
        await step("assignReviewers", assignReviewers)
        await step("planSteps", planSteps)
        await step("profilesStep", profilesStep)
        await step("reconcile", reconcile)
        await step("resumeInterrupted", resumeInterrupted)
        await step("finishTasks", finishTasks)
        await step("syncTitles", syncTitles)
        await step("syncStatus", syncStatus)
        await step("formWatch", formWatch)
        await step("flowWatch", flowWatch)
        await step("leftWatch", leftWatch)
        await step("housekeep", housekeep)
        await step("processQueue", processQueue)
        // наблюдения crew_watch (watch.ts): запустить новые, по концу — письмо окну с побудкой
        await step("watches", () => pollWatches((w, text) => postLetter(w.session, { id: `watch-${w.id}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: w.session, time: Date.now(), text }), log, now(), (w) => loadConfig(w.cwd).machineSlots))
        passStage = "deliver"
        // АДРЕСАТЫ — ИЗ ВИЗИТОК НА ДИСКЕ (после перезагрузки плагина память пуста). Визитки этого процесса и умершего;
        // двойной доставки нет: письмо забирает тот, чей rename в claimLetters прошёл первым.
        for (const card of allCards()) {
          if (children.has(card.session) || card.spawned?.status === "closed") continue
          if (card.pid !== process.pid && pidAlive(card.pid)) continue // вкладка живого чужого процесса (частный сервер)
          void deliver(card)
        }
      } finally {
        if (id === passId) passBusy = false // зависший прежний проход, вернувшись, не снимает флаг идущего
      }
    }
    // Таймеры цикла создаёт start() в конце setup, снимает stop(): цикл можно перенести на другой экземпляр (см. «ОДИН ЦИКЛ»).
    let timer: any
    let watcher: any
    let soon: any
    const startPass = () => {
      timer = setInterval(() => void pass(), POLL_MS)
      try {
        watcher = watch(INBOX, { recursive: true }, () => {
          clearTimeout(soon)
          soon = setTimeout(() => void pass(), 100)
        })
      } catch (e) {
        log(`inbox watch unavailable (the ${POLL_MS} ms tick delivers): ${e}`)
      }
    }

    await ctx.session.hook("context", async (ev: any) => {
      try {
        const card = await touch(String(ev.sessionID ?? ""), ev)
        if (!card) return
        setBusy(card, true) // запрос вкладки: она занята ходом до строки простоя
        // новый запрос модели после вопроса владельцу: ход пошёл дальше, вопрос закрыт (form-wait.ts, задача 040)
        void settleOnRequest(card.session, now(), async (since) => (await ownerWordAfter(card.session, since)) > 0).catch(() => {})
        // ПОДСКАЗКА — НЕИЗМЕННАЯ, пока не сменилась роль: системная часть стоит перед всей историей, и любое её
        // изменение заново оплачивает историю (замер 2026-10-04). Соседи — crew_list.
        // Правила проекта (project_rules) — в конец: их изменение, как и смена роли, один раз заново оплачивает историю.
        // Язык владельца (owner_language, задача 054) — из настроек: письма вкладкам владелец тоже читает (уведомление, вкладка получателя).
        const cfg = loadConfig(card.directory)
        const rules = cfg.projectRules
        ev.system.push({
          type: "text",
          text:
            `crew-harness: You are the crew-harness tab with the role "${card.role}" in project ${projOf(card)} (address ${keyOf(card)}), repository ${card.repo || "?"}, session ${card.session}. ` +
            `Name a task with its title: "#31 "merge lock"" at the first mention, then just "#31". ` +
            `Ask the owner for a decision with the question tool: one decision, 2-4 options, the recommended one first marked "(Recommended)" with the reason. ` +
            `A stop at a gate, and any report that needs the owner's decision, ends with the question tool, not with a summary; ` +
            `a question in prose does not reach the owner. ` +
            `Everything the owner reads (replies, questions, option texts, reasons, letters to other tabs and task reports) is in ${cfg.ownerLanguage}; code, commands and identifiers stay unchanged. ` +
            `Create a task (crew_spawn, crew_task assign or order) only when the owner says so; you may propose one with a reason. ` +
            `A task changes code or texts on main and needs independent acceptance. ` +
            `Not tasks: an answer, a fact check, an analysis, an edit of 1-3 lines (the integrator's, or a worker's on the owner's word), a repeat of a cancelled task. ` +
            `Help on the tools: crew_help.` +
            (rules ? ` Project rules: ${rules}` : ""),
        })
      } catch (e) {
        log(`context failed: ${e}`)
      }
    })

    // ЗАПРОС ВКЛАДКИ — источник модели (хук model.request V2: {sessionID, agent, model, kind}).
    try {
      await ctx.session.hook("model.request", async (ev: any) => {
        try {
          if (ev?.kind && ev.kind !== "primary") return
          if (ev?.sessionID && ev?.model) await touch(String(ev.sessionID), { model: ev.model })
        } catch (e) {
          log(`model.request failed: ${e}`)
        }
      })
    } catch (e) {
      log(`model.request hook unavailable: ${e}`)
    }

    // САМОПРОВЕРКА: то, что умеет только процесс OpenCode.
    async function doctor(): Promise<string[]> {
      const out: string[] = []
      for (const [name, f] of [["session.prompt", ctx?.session?.prompt], ["session.create", ctx?.session?.create], ["session.get", ctx?.session?.get], ["session.hook", ctx?.session?.hook]] as const)
        if (typeof f !== "function") out.push(`в этой версии OpenCode у плагина нет ${name} — доставка или задачи не работают`)
      if (!hungInterrupt) out.push("в этой версии OpenCode у плагина нет session.interrupt — зависший ход плагин сам не снимает: владельцу приходит «нажмите Esc в окне и напишите «продолжай»» (задача 048)")
      const probe = allCards()[0]
      if (probe) {
        const row = await sessionFromDb(probe.session)
        if (!row) out.push("база OpenCode (opencode.db) не читается или в ней нет session_v2 — модель и простой вкладок не видны")
      }
      out.push(...(await overdueProblems(projects)))
      return out
    }

    const tools = makeTools({
      projects,
      defaultDir: String(ctx?.location?.directory ?? ""),
      touch: (sessionID) => touch(sessionID),
      isChild: (s) => children.has(s),
      posted: () => void pass(),
      picked: (pick) => {
        setBusy(pick, true)
        void pass()
      },
      roleTaken: (me) => {
        mine.set(me.session, me)
        void deliver(me)
      },
      startTask,
      doctor,
    })
    const toEditor = (t: (typeof tools)[number]) => ({ name: t.name, description: t.description, input: t.input, execute: (input: any, context: any) => t.execute(input, context?.sessionID) })
    await ctx.tool.transform((editor: any) => {
      for (const t of tools) editor.add(toEditor(t))
    })
    // Журналы задачи (journal.ts): progress_line, log_line и usage_line. Отдельным вызовом и вне списка tools / MCP-сервера; сбой не ломает плагин.
    try {
      // запускающий (задача 053): вкладка держит роль integrator своего проекта и сама не исполняет и не принимает задачу
      await registerJournalTools(ctx, log, {
        launcher: (sid) => {
          const c = readJson<Card>(cardFile(sid)) ?? mine.get(sid)
          return !!c && isLauncherCard(c, holdsExclusive(roleKey(projOf(c), "integrator"), sid))
        },
        // ворота без вопроса (задача 062): вопрос владельцу открыт — запись в forms/; текстовый вопрос появляется только в конце хода, его видит проход сводок
        gate: { open: (sid) => pendingForms(sid, now()).length > 0, note: (sid, text) => void noteGate(sid, text, now()) },
      })
    } catch (e) {
      log(`journal tools failed: ${e}`)
    }

    // Слэш-команды /crew-help, /crew-sets и /crew-profiles — команды окна (tui.ts, диалог с текстом сразу). Здесь они не
    // регистрируются: служебное сообщение (ctx.session.synthetic) окно 2.0.23 не показывает (проба 2026-10-08: execute вызван, сообщений
    // в сессии нет), а одноимённая серверная команда стояла бы вторым пунктом списка.

    // Самопроверка при загрузке (через 10 с: окна успевают отметиться) и раз в DOCTOR_EVERY_MS. Итог — в DOCTOR_FILE
    // (его показывает /crew-doctor окна), проблемы — в журнал; уведомление окнам — только когда набор проблем сменился.
    const DOCTOR_EVERY_MS = Number(process.env.CREW_HARNESS_DOCTOR_MS) || 10 * 60_000
    let doctorSaid = ""
    const runDoctor = async () => {
      const problems = [...(await doctor()), ...commonDoctor(), ...settingsProblems(projects, settingsContext().local), ...profileProblems()]
      try {
        writeFileSync(DOCTOR_FILE, JSON.stringify({ at: Date.now(), problems }))
      } catch {}
      const said = problems.join(" | ")
      if (said === doctorSaid) return
      doctorSaid = said
      if (!problems.length) return log("doctor: ok")
      log(`doctor: ${said}`)
      for (const w of liveWindows()) postNotice(w.pid, { title: "crew: проблемы — /crew-doctor", message: short(problems.join("; "), 100), duration: 15_000 })
    }
    let doctorTimer: any
    let doctorAgain: any
    let catalogFirst: any
    let catalogTimer: any
    let doctorEvery: any
    let lagTimer: any
    // снимок каталога моделей для окна (model-catalog.ts): при загрузке (после 3 с) и раз в 10 минут
    const snapCatalog = async () => {
      try {
        if (!writeCatalog(catalogModels(await ctx.model.list()))) log("model catalog snapshot: empty reply, not written")
      } catch (e) {
        log(`model catalog snapshot failed: ${e}`)
      }
    }

    // ЗАМЕР ЗАДЕРЖКИ ГЛАВНОГО ПОТОКА (2026-10-06). Сервер дважды за вечер терял окна («Event stream stalled»), и было
    // не понять, держал ли поток плагин. Таймер раз в LAG_EVERY_MS замечает, насколько опоздал: опоздание от
    // LAG_LOG_MS — строка в журнал с шагом прохода плагина, который в это время шёл («—» — плагин был свободен: держал
    // кто-то другой в процессе сервера), и памятью процесса.
    const LAG_EVERY_MS = 500
    const LAG_LOG_MS = Number(process.env.CREW_HARNESS_LAG_MS) || 1_000
    let lagExpected = Date.now() + LAG_EVERY_MS
    const lagTick = () => {
      const t = Date.now()
      const lag = t - lagExpected
      lagExpected = t + LAG_EVERY_MS
      noteLoopLag(lag, t) // для usage_line: наибольшая задержка за время сессии
      if (lag < LAG_LOG_MS) return
      const inPass = passBusy ? `шаг прохода ${passStage}, проход идёт ${Math.round((t - passStartedAt) / 1000)} с` : "плагин свободен"
      log(`loop lag ${lag} ms (${inPass}; память ${Math.round(process.memoryUsage().rss / 1048576)} МБ)`)
    }

    let running = false
    const start = () => {
      if (running) return
      running = true
      startPass()
      doctorTimer = setTimeout(() => void runDoctor(), 10_000)
      // и ещё раз через минуту: при подъёме сервиса окна переподключаются позже 10 с, и первая проверка видит «ни одно
      // окно не отмечается» (2026-10-07) — без повтора ложное замечание висело в /crew-doctor до плановой проверки
      doctorAgain = setTimeout(() => void runDoctor(), 70_000)
      doctorAgain.unref?.()
      catalogFirst = setTimeout(() => void snapCatalog(), 3_000)
      catalogTimer = setInterval(() => void snapCatalog(), 10 * 60_000)
      catalogFirst.unref?.()
      catalogTimer.unref?.()
      doctorEvery = setInterval(() => void runDoctor(), DOCTOR_EVERY_MS)
      doctorEvery.unref?.()
      lagExpected = Date.now() + LAG_EVERY_MS
      lagTimer = setInterval(lagTick, LAG_EVERY_MS)
      lagTimer.unref?.()
    }
    const stop = () => {
      if (!running) return
      running = false
      clearInterval(timer)
      clearTimeout(soon)
      clearInterval(lagTimer)
      clearTimeout(doctorTimer)
      clearTimeout(doctorAgain)
      clearTimeout(catalogFirst)
      clearInterval(catalogTimer)
      clearInterval(doctorEvery)
      try {
        watcher?.close()
      } catch {}
    }

    log(`setup pid=${process.pid} base=${BASE}`)
    // ОДИН ЦИКЛ НА ПРОЦЕСС (2026-10-05). OpenCode перегружает плагин при изменении его файлов, не всегда закрывая
    // прежний экземпляр: циклы прежних экземпляров жили дальше, каждый со своим проходом раз в секунду. Вместе с
    // чтением базы (5 ГБ) это клало сервер — «Event stream stalled», окно перезапускало сервис (18:19, 18:42).
    // Новый экземпляр останавливает цикл прежнего.
    // ЦИКЛ ПЕРЕХОДИТ К ЖИВОМУ СОСЕДУ (2026-10-10). Экземпляр плагина — на каталог (OpenCode создаёт и снимает их
    // по одному), а цикл один на процесс и принадлежит последнему созданному. Когда OpenCode снял именно его, а
    // экземпляры других каталогов живы, цикл вставал насовсем: письма не доставлялись, пока что-нибудь не создало
    // новый экземпляр (замер: 15:16–15:48, письмо открытой вкладке nova.integrator ждало 10 минут). Теперь снятый
    // хозяин цикла отдаёт его последнему из оставшихся. Новый экземпляр того же каталога заменяет прежний (перезагрузка
    // плагина): оставшийся от перезагрузки прежний экземпляр цикл не получит.
    const g = globalThis as any
    type Loop = { directory: string; running: () => boolean; start: () => void; stop: () => void }
    const loops: Loop[] = (g.__crewHarnessLoops ??= [])
    const directory = String(ctx?.location?.directory ?? "")
    const me: Loop = { directory, running: () => running, start, stop }
    try {
      g.__crewHarnessDispose?.() // экземпляр плагина прежней версии
    } catch {}
    for (const l of [...loops]) {
      l.stop()
      if (l.directory === directory) loops.splice(loops.indexOf(l), 1)
    }
    loops.push(me)
    const legacyDispose = () => stop()
    g.__crewHarnessDispose = legacyDispose
    start()
    return () => {
      const owned = running
      stop()
      const i = loops.indexOf(me)
      if (i >= 0) loops.splice(i, 1)
      if (g.__crewHarnessDispose === legacyDispose) g.__crewHarnessDispose = undefined
      const next = owned ? loops[loops.length - 1] : undefined
      if (next) {
        log(`loop of ${directory || "?"} released, handed over to ${next.directory || "?"}`)
        next.start()
      }
    }
  },
}
