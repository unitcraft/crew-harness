// plugins/nova-peers — переписка между окнами (сессиями) OpenCode во ВСЕХ репозиториях.
//
// ЗАЧЕМ. В Claude Code окна говорили через `/peers` и `SendMessage` по ИМЕНИ сессии,
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
//   read/<адрес>/*.json   — доставленные (история для `peer_inbox`).
// Доставка — переносом файла из inbox в read (rename атомарен): письмо уходит
// ровно одной сессии, даже если плагин загружен в нескольких процессах.
//
// РОЛЬ. Окно без назначенной роли получает её САМО: `assistant-<6 знаков id>`
// (слово владельца 2026-10-03). Назначенная (`peer_role`) хранится в визитке и
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
import {
  type Card,
  type Letter,
  POLL_MS,
  QUEUE,
  INBOX,
  BASE,
  DEFAULT_ROLE,
  normalizeRole,
  holdsOpenTask,
  DEFAULT_SPAWN_MODELS,
  lastTurn,
  turnEnd,
  idleAt,
  userAfter,
  hhmm,
  MODEL_TTL_MS,
  log,
  repoLabel,
  parseProjects,
  projectOf,
  roleKey,
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
  addObligation,
  obligationsOf,
  saveObligations,
  commonDoctor,
  helpFor,
  saveProjects,
  setProjects,
  makeTools,
  sessionFromDb,
  formatTaskLetter,
  postExpected,
  propagateToParent,
  PLUGIN_SENDER,
} from "./core.ts"
import { pollWatches, watchesOf } from "./watch.ts"
import { markNotified, removeStatus, saveStatus, statusOf } from "./status.ts"
import { type Task, byPriority, isOpen, letterExists, listTasks, loadTask, plannedSessionId, saveTask, statusRu, taskEvent, taskLetterId } from "./tasks.ts"
import { ensureWorktree, reviewLetter } from "./review.ts"

export { parseProjects, projectOf, parseAddr, HELP, helpFor } from "./core.ts"

export default {
  id: "nova.peers",
  async setup(ctx: any) {
    const mine = new Map<string, Card>() // сессии этого процесса
    const children = new Set<string>()
    const projects = parseProjects(ctx?.options)
    setProjects(projects, ctx?.options?.local)
    saveProjects(ctx?.options) // для MCP-сервера вкладок claude-code: список проектов один
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
      // ФАЙЛ ПЕРВЫМ, память — только запасом. Визитку правят и ДРУГИЕ сессии (peer_role force переписывает роль
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
      card.project = projectOf(card.directory, projects) // каждый раз: список проектов мог поменяться
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
    // Ответ, которого получатель ждёт в peer_wait, не трогается: его заберёт сам peer_wait в тот же ход.
    const held = new Set<string>()
    const delivering = new Set<string>()
    const keysOf = (card: Card) => [keyOf(card), card.role, card.session]
    // Идёт ли ход: у открытой вкладки это знает её окно (плагин окна, раз в секунду); у сессии под задачу окна нет —
    // флаг визитки (хук запроса ставит, событие или строка простоя в базе снимает).
    const turnRunning = (card: Card, windows: ReturnType<typeof liveWindows>) => {
      const t = card.spawned ? undefined : tabOf(card.session, windows)
      return t ? !!t.tab.busy : !!card.busy
    }
    function delivered(card: Card, letters: Letter[], windows: ReturnType<typeof liveWindows>) {
      for (const l of letters) if (l.qid) addObligation(card.session, { qid: l.qid, from_session: l.from_session, from_role: l.from_role, at: l.time, nudges: 0 })
      // будящее письмо в фоновую вкладку — уведомление её окну (кнопка Open)
      const loud = letters.find((l) => l.wake !== false)
      const t = tabOf(card.session, windows)
      if (loud && t && !t.tab.active && t.window.pid) postNotice(t.window.pid, { sessionID: card.session, title: "Письмо", message: `${loud.from_role}: ${loud.text.split(/\r?\n/)[0].slice(0, 120)}` })
    }
    async function deliver(card: Card) {
      if (delivering.has(card.session)) return
      const keys = keysOf(card)
      if (!waitingIn(keys)) return
      const windows = liveWindows()
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
      if (turnRunning(fresh, windows)) return // ход идёт: письма ждут его конца
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
          if (wake) await ctx.session.prompt({ sessionID: card.session, text, delivery: "queue" })
          else if (typeof ctx.session.synthetic === "function") await ctx.session.synthetic({ sessionID: card.session, text, resume: false })
          else await ctx.session.prompt({ sessionID: card.session, text, resume: false }) // OpenCode без synthetic: лишний шаг, но без хода
          confirmLetters(claimed)
          delivered(card, letters, windows)
          log(`delivered${wake ? "" : " quietly"} ${letters.map((l) => l.id).join(",")} -> ${card.session} (${keyOf(card)})`)
        } catch (e) {
          releaseLetters(claimed)
          log(`deliver failed ${card.session}: ${e}`)
        }
      } finally {
        delivering.delete(card.session)
      }
    }

    // ЗАНЯТОСТЬ: busy ставится в хуке запроса (context), снимается строкой `idle` в базе после busySince (таймер).
    function setBusy(card: Card, busy: boolean) {
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
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

    // ПОДТАЛКИВАНИЕ (план 002, Ф.2; core.ts, «ОБЯЗАТЕЛЬСТВА»). Ход вкладки кончился, а ответа по вопросу или задаче
    // нет — напоминание сразу. Различаем рабочий ход и пустой (lastTurn: были ли вызовы инструментов): рабочий
    // обнуляет счётчик пустых, пустой его растит. push_empty_turns пустых подряд или push_max напоминаний всего —
    // вкладка застряла: напоминаний больше нет, спросившему вызов (письмо и уведомление в окне). Ход, в котором писал
    // владелец, — без напоминания (владелец ведёт вкладку сам), счётчик с нуля. Снимает застревание peer_task push.
    async function nudge(card: Card) {
      const list = obligationsOf(card.session)
      if (!list.length) return
      const cfg = loadConfig(card.directory)
      const turn = await lastTurn(card.session, card.busySince ?? 0)
      const t = now()
      let changed = false
      for (const o of list) {
        if (o.stuck) continue
        changed = true
        if (turn?.owner) {
          o.empty = 0
          continue
        }
        // базы нет — ход считается рабочим (лишнее напоминание дешевле ложного «застряла»)
        o.empty = turn && !turn.tools ? (o.empty ?? 0) + 1 : 0
        const rv = card.review ? loadTask(card.review.project, card.review.n) : undefined
        const isReview = !!rv && rv.review_qid === o.qid
        const task = isReview ? rv : card.task ? loadTask(card.task.project, card.task.n) : undefined
        const what = isReview ? `приёмка задачи #${rv!.n} «${rv!.title}» (${statusRu(rv!.status)})` : task && task.qid === o.qid ? `задача #${task.n} «${task.title}»` : `вопрос ${o.qid}${o.task ? ` («${o.task.slice(0, 200)}»)` : ""}`
        const howTo = isReview
          ? `Продолжай приёмку: peer_task {action: "review" | "rework" | "merge" | "accept" | "cleaned", n: ${rv!.n}} (что дальше — в письме с приёмкой).`
          : `Закончил — отчёт: peer_send {to: "${o.from_session}", reply_to: "${o.qid}", text: "..."}. Упёрся — тем же ответом напиши, что мешает.`
        if (o.empty >= cfg.pushEmptyTurns || o.nudges >= cfg.pushMax) {
          o.stuck = true
          const failing = turn?.outcome === "failed" ? " (ход падает с ошибкой — посмотри модель и журнал сервера)" : ""
        const why = (o.empty >= cfg.pushEmptyTurns ? `${o.empty} хода подряд остановилась без работы и без ответа` : `${o.nudges} напоминаний остались без ответа`) + failing
          postLetter(o.from_session, {
            id: `${t}-stuck-${safeKey(o.qid)}`,
            from_role: "opencode-peers",
            from_session: "opencode-peers",
            to: o.from_session,
            time: t,
            text: `Вкладка ${keyOf(card)} (сессия ${card.session}) застряла: ${what} — ${why}. Напоминаний больше не будет. Подтолкни (peer_task {action: "push"${task ? `, n: ${task.n}` : ""}, text: "..."}), передай другой сессии (reassign) или загляни в неё сам.`,
          })
          const w = tabOf(o.from_session)
          if (w?.window.pid) postNotice(w.window.pid, { sessionID: card.session, title: task ? `Задача #${task.n} застряла` : "Вкладка застряла", message: `${keyOf(card)}: ${why}` })
          if (task && task.qid === o.qid) taskEvent(task, "opencode-peers", undefined, `застряла: ${why}`)
          log(`stuck ${card.session} for ${o.qid} (empty ${o.empty}, pushes ${o.nudges})`)
          continue
        }
        o.nudges++
        postLetter(card.session, {
          id: `${t}-nudge-${safeKey(o.qid)}`,
          from_role: "opencode-peers",
          from_session: "opencode-peers",
          to: card.session,
          time: t,
          text:
            `Не завершено: ${what} от ${o.from_role} (сессия ${o.from_session}). Ты остановился, не закончив. Продолжай работу. ` +
            howTo +
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
    const setupAt = Number(process.env.NOVA_PEERS_PROCESS_START) || Date.now() - process.uptime() * 1000
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
          .map((o) => `— ${task && task.qid === o.qid ? `задача #${task.n} «${task.title}»` : `вопрос${o.task ? ` «${o.task.slice(0, 200)}»` : ""}`} от ${o.from_role}: отчёт — peer_send {to: "${o.from_session}", reply_to: "${o.qid}", text: "..."}`)
          .join("\n")
        postLetter(c.session, {
          id,
          from_role: "opencode-peers",
          from_session: "opencode-peers",
          to: c.session,
          time: now(),
          text: `Работа прервана перезапуском OpenCode (ход оборвался в ${hhmm(row.suspended)}). Продолжай с того места, где остановился: сначала проверь, что успело сделаться (файлы, коммиты, запущенные команды). Открыто:\n${open}`,
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
        from_role: "opencode-peers",
        from_session: "opencode-peers",
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
      for (const t of listTasks()) {
        if (t.status !== "cleaned" && t.status !== "cancelled") continue
        const sessions = [t.executor, t.reviewer, ...t.executors, ...(t.reviewers ?? [])].filter(Boolean) as string[]
        for (const sid of new Set(sessions)) {
          const c = readJson<Card>(cardFile(sid))
          if (!c?.spawned || c.spawned.status === "closed" || c.busy) continue
          if (c.pid !== process.pid && pidAlive(c.pid)) continue
          c.spawned.status = "closed"
          saveCard(c)
          const done = t.status === "cleaned"
          try {
            const note = { sessionID: sid, text: done ? `✓✓ Задача #${t.n} принята и влита. Сессия закрыта — письма больше не приходят.` : `✗ Задача #${t.n} отменена. Сессия закрыта — письма больше не приходят.`, resume: false }
            await (typeof ctx.session.synthetic === "function" ? ctx.session.synthetic(note) : ctx.session.prompt(note)) // строка в историю, без хода
          } catch (e) {
            log(`final note failed ${sid}: ${e}`)
          }
          if (sid === t.executor) {
            const w = tabOf(t.author)
            if (w?.window.pid) postNotice(w.window.pid, { sessionID: sid, title: done ? `Задача #${t.n} принята ✓✓` : `Задача #${t.n} отменена`, message: t.title })
          }
          log(`task #${t.n} (${t.project}) ${t.status}: session ${sid} closed`)
        }
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
    // запускается так же повторяемо, как задача: id пишется в журнал до session.create.
    const reviewStarting = new Set<string>()
    async function startReviewer(t0: Task): Promise<void> {
      const key = `${t0.project}#${t0.n}`
      if (reviewStarting.has(key)) return
      reviewStarting.add(key)
      try {
        const t = loadTask(t0.project, t0.n) ?? t0
        if (!t.reviewer || t.review_kind !== "spawn" || readJson<Card>(cardFile(t.reviewer))) return
        const cfg = loadConfig(t.directory)
        const model = cfg.spawnModels[t.tier] ?? DEFAULT_SPAWN_MODELS[t.tier]
        const [providerID, ...rest] = model.split("/")
        await ctx.session.create({ id: t.reviewer, title: `#${t.n} приёмка ${t.title}`, location: { directory: t.directory }, metadata: { peersReview: { project: t.project, n: t.n } }, model: { providerID, id: rest.join("/") } })
        const now = Date.now()
        const card: Card = { session: t.reviewer, role: DEFAULT_ROLE, auto: false, title: `#${t.n} приёмка ${t.title}`, directory: t.directory, repo: repoLabel(t.directory), project: t.project, model, modelAt: now, modelFrom: "request", pid: process.pid, updated: now, spawned: { by: t.author, task: `приёмка #${t.n}`, tier: t.tier, status: "running", at: now, qid: t.review_qid ?? "" }, review: { project: t.project, n: t.n } }
        saveCard(card)
        mine.set(card.session, card)
        await reviewerAssigned(t, card)
        log(`task #${t.n} (${t.project}): reviewer session ${t.reviewer} started`)
      } catch (e) {
        log(`reviewer start #${t0.n} failed: ${e}`)
      } finally {
        reviewStarting.delete(key)
      }
    }
    // Приёмщик назначен (вкладка или сессия): обязательство и письмо с приёмкой (id письма — из номера и попытки).
    async function reviewerAssigned(t: Task, card: Card) {
      const cfg = loadConfig(t.directory)
      if (!obligationsOf(card.session).some((o) => o.qid === t.review_qid)) addObligation(card.session, { qid: t.review_qid!, from_session: t.author, from_role: t.author_role, at: Date.now(), nudges: 0, task: `приёмка #${t.n}` })
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
        const recent = t.status === "cleaned" && now() - t.updated < 24 * 3600_000
        if (!isOpen(t) && !recent) continue
        const author = readJson<Card>(cardFile(t.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue // сверяет процесс автора
        postExpected(t)
        if (t.status === "starting") continue // запуск доделает resumeTasks
        const need = (session: string | undefined, qid: string | undefined, what: string) => {
          if (session && qid && !obligationsOf(session).some((o) => o.qid === qid)) addObligation(session, { qid, from_session: t.author, from_role: t.author_role, at: now(), nudges: 0, task: what })
        }
        if (t.status === "running" || t.status === "rework") need(t.executor, t.qid, t.title)
        if (t.reviewer && ["submitted", "reviewing", "accepted"].includes(t.status)) {
          const rc = readJson<Card>(cardFile(t.reviewer))
          if (!rc) continue // сессия приёмки ещё не создана — её запустит assignReviewers
          if (!rc.review || rc.review.n !== t.n || rc.review.project !== t.project) {
            rc.review = { project: t.project, n: t.n }
            saveCard(rc)
          }
          if (!t.review_letter || !letterExists(t.reviewer, t.review_letter)) await reviewerAssigned(t, rc)
          if (!(t.status === "submitted" && (t.rework ?? 0) > 0)) need(t.reviewer, t.review_qid, `приёмка #${t.n}`)
        }
      }
    }
    async function assignReviewers() {
      const windows = liveWindows()
      const queue = listTasks().filter((t) => t.status === "submitted" && !t.reviewer).sort(byPriority)
      for (const t0 of queue) {
        const t = loadTask(t0.project, t0.n)
        if (!t || t.status !== "submitted" || t.reviewer) continue
        const author = readJson<Card>(cardFile(t.author))
        if (author && author.pid !== process.pid && pidAlive(author.pid)) continue // назначает процесс автора
        const cfg = loadConfig(t.directory)
        t.review_qid = `r${t.qid}`
        if (cfg.reviewer === "integrator") {
          t.reviewer = t.author
          t.review_kind = "integrator"
          taskEvent(t, "opencode-peers", undefined, "приёмщик — интегратор (настройка reviewer)")
          const ac = author ?? (readJson<Card>(cardFile(t.author)) as Card)
          if (ac) {
            ac.review = { project: t.project, n: t.n }
            saveCard(ac)
            await reviewerAssigned(t, ac)
          }
          continue
        }
        const tab = allCards().find(
          (c) =>
            !c.spawned &&
            (c.project ?? projectOf(c.directory, projects)) === t.project &&
            normalizeRole(c.role) === DEFAULT_ROLE &&
            c.session !== t.executor &&
            c.session !== t.author &&
            !holdsOpenTask(c) &&
            !!tabOf(c.session, windows)?.window.pid &&
            !tabOf(c.session, windows)?.tab.busy,
        )
        if (tab) {
          t.reviewer = tab.session
          t.review_kind = "tab"
          taskEvent(t, "opencode-peers", undefined, `приёмщик — открытая вкладка ${tab.session}`)
          tab.review = { project: t.project, n: t.n }
          saveCard(tab)
          await reviewerAssigned(t, tab)
          continue
        }
        const limit = cfg.spawnLimits.reviewer ?? 2
        // задача на доработке места не держит: следующий шаг — исполнителя, приёмщик ждёт без хода (правило «блокирует ли
        // незакрытая задача новую» методологии: ждём чужого хода — не блокирует). Досданную будит прежний приёмщик сразу.
        const reviewing = listTasks(t.project).filter((x) => isOpen(x) && x.review_kind === "spawn" && x.reviewer && x.status !== "accepted" && x.status !== "rework").length
        if (t.priority !== "P0" && reviewing >= limit) continue // ждёт: приёмщиков-сессий уже limit
        t.reviewer = plannedSessionId()
        t.review_kind = "spawn"
        taskEvent(t, "opencode-peers", undefined, `приёмщик — новая сессия ${t.reviewer}`)
        await startReviewer(t)
      }
      // сессия приёмки записана, но не создана (оборвался запуск) — повторить тем же id
      for (const t of listTasks()) if (isOpen(t) && t.review_kind === "spawn" && t.reviewer && !readJson<Card>(cardFile(t.reviewer))) await startReviewer(t)
    }

    // ЗАГОЛОВКИ СЕССИЙ ЗАДАЧ — из журнала: «#N название», сдана/закрыта «#N ✓», отменена «#N ✗», передана другой
    // сессии «#N ↷». Сверяются каждый проход (то, что поменял MCP-сервер или другой процесс, тоже доходит), меняются
    // через session.update — без хода модели. Вкладки владельца (assign) не переименовываются.
    // СОСТОЯНИЕ СЕССИЙ (план 004, status.ts). Раз в STATUS_EVERY_MS — status/<сессия>.json (сводка /peers окна и внешние
    // проверки, например хук проекта). Сессия закончила ход вопросом владельцу — уведомление во все живые окна (с
    // кнопкой Open и системным уведомлением, когда окно не в фокусе); не ответил — повтор через owner_reminder_min.
    // В сводке — открытые вкладки, сессии задач и те, у кого есть наблюдения или свои открытые задачи.
    const STATUS_EVERY_MS = Number(process.env.NOVA_PEERS_STATUS_MS) || 15_000
    // конец хода — из базы (5 ГБ у владельца) только когда появилась новая строка idle: сначала дешёвое время
    // последнего idle (idleAt), тяжёлое чтение сообщений — при его изменении (замер: ~0,1 с на вкладку, в главном потоке)
    const ends = new Map<string, { at: number; end: Awaited<ReturnType<typeof turnEnd>> }>()
    let statusAt = 0
    async function syncStatus() {
      if (now() - statusAt < STATUS_EVERY_MS) return
      statusAt = now()
      const windows = liveWindows()
      const t = now()
      const cards = allCards()
      // вопросы с ответом (expect_reply) — обязательства получателя перед спросившим; задачи и приёмки — не вопросы
      const asked = new Map<string, { qid: string; to: string; at: number }[]>()
      for (const c of cards) for (const o of obligationsOf(c.session)) if (!o.task && !o.stuck) asked.set(o.from_session, [...(asked.get(o.from_session) ?? []), { qid: o.qid, to: keyOf(c), at: o.at }])
      for (const c of cards) {
        if (c.pid !== process.pid && pidAlive(c.pid)) continue // вкладка другого живого сервера
        const tab = tabOf(c.session, windows)
        const live = !!tab || (!!c.spawned && c.spawned.status !== "closed") || watchesOf(c.session).length > 0 || listTasks(c.project).some((x) => x.author === c.session && isOpen(x))
        if (!live) {
          removeStatus(c.session)
          continue
        }
        const busy = !!tab?.tab.busy || !!c.busy
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
        const s = statusOf({ card: c, busy, busySince: c.busySince, end, asked: asked.get(c.session) ?? [], now: t })
        const prev = saveStatus(s)
        if (s.state !== "owner") continue
        const fresh = !(prev?.state === "owner" && prev.since === s.since)
        const every = loadConfig(c.directory).ownerReminderMin * 60_000
        if (!fresh && !(every > 0 && t - (prev?.notified ?? 0) >= every)) continue
        for (const w of windows) postNotice(w.pid, { sessionID: c.session, title: `${keyOf(c)} ждёт вашего ответа`, message: s.question ?? "", attention: true })
        markNotified(c.session, t)
        log(`owner wanted by ${c.session}${fresh ? "" : " (reminder)"}`)
      }
    }

    async function syncTitles() {
      if (typeof ctx.session.update !== "function") return
      for (const c of allCards()) {
        // карточки умершего процесса (сервер перезапущен посреди задачи) — тоже наши; чужой живой процесс — нет
        if (!c.spawned || (!c.task && !c.review) || (c.pid !== process.pid && pidAlive(c.pid))) continue
        const asReviewer = !c.task && !!c.review
        const ref = (c.task ?? c.review)!
        const t = loadTask(ref.project, ref.n)
        if (!t) continue
        const MARK: Record<string, string> = { submitted: "✓", reviewing: "✓◐", rework: "↻", accepted: "✓✓◐", cleaned: "✓✓", closed: "✓", cancelled: "✗" }
        const replaced = asReviewer ? t.reviewer !== c.session : t.executor !== c.session
        const mark = replaced ? "↷" : asReviewer ? (t.status === "cleaned" ? "✓✓" : t.status === "cancelled" ? "✗" : "") : (MARK[t.status] ?? "")
        const title = `#${t.n}${mark ? ` ${mark}` : ""} ${asReviewer ? "приёмка " : ""}${t.title}`
        if (c.titleShown === title) continue
        try {
          await ctx.session.update({ sessionID: c.session, title })
          const fresh = readJson<Card>(cardFile(c.session)) ?? c
          fresh.titleShown = title
          fresh.title = title
          saveCard(fresh)
        } catch (e) {
          log(`title ${c.session} failed: ${e}`)
        }
      }
    }

    // ЗАПУСК ЗАДАЧИ (план 002, Ф.1). Журнал уже записан (статус starting, id сессии выбран заранее). Шаги повторяемы:
    // session.create с тем же id возвращает уже созданную сессию (замер 2026-10-05), визитка перезаписывается тем же,
    // письмо с задачей кладётся, только если его ещё нет (id письма — из номера и попытки). Оборвался процесс на
    // любом шаге — следующий проход (resumeTasks) повторит запуск, второй сессии и второго письма не будет.
    const startingNow = new Set<string>()
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
        // план 006: worktree и ветку задачи создаёт плагин, сессия работает в нём (хуки видят ветку задачи, не main)
        let dir = t.directory
        if (t.kind === "spawn" && t.worktree && t.branch) {
          const w = ensureWorktree(t.directory, t.worktree, t.branch, loadConfig(t.directory).targetBranch)
          if (w.ok) {
            dir = t.worktree
            if (!t.worktree_ready) {
              t.worktree_ready = true
              saveTask(t)
              taskEvent(t, "opencode-peers", undefined, `worktree ${t.worktree}, ветка ${t.branch}${w.created ? " — создан плагином" : " — уже был"}`)
            }
          } else log(`task #${t.n} worktree not created (the worker creates it): ${w.error}`)
        }
        const [providerID, ...rest] = String(t.model ?? "").split("/")
        await ctx.session.create({ id: sid, title: `#${t.n} ${t.title}`, location: { directory: dir }, metadata: { peersTask: { project: t.project, n: t.n, attempt: t.attempt } }, ...(t.model ? { model: { providerID, id: rest.join("/") } } : {}) })
        const now = Date.now()
        const prev = readJson<Card>(cardFile(sid))
        const card: Card = { ...(prev ?? {}), session: sid, role: t.role, auto: false, title: `#${t.n} ${t.title}`, directory: dir, repo: repoLabel(dir), project: t.project, model: t.model, modelAt: now, modelFrom: "request", pid: process.pid, updated: now, spawned: { by: t.author, task: t.goal.slice(0, 300), tier: t.tier, status: "running", at: now, qid: t.qid }, task: { project: t.project, n: t.n } }
        saveCard(card)
        mine.set(sid, card)
        addObligation(sid, { qid: t.qid, from_session: t.author, from_role: t.author_role, at: now, nudges: 0, task: t.title })
        const lid = taskLetterId(t)
        if (!letterExists(sid, lid)) postLetter(sid, { id: lid, from_role: t.author_role, from_session: t.author, to: sid, time: now, qid: t.qid, text: formatTaskLetter(t) })
        taskEvent(t, "opencode-peers", "running", `сессия ${sid}`)
        void deliver(card)
        const w = tabOf(t.author)
        if (w?.window.pid) postNotice(w.window.pid, { sessionID: sid, title: `Запущена задача #${t.n}`, message: t.title })
        log(`task #${t.n} (${t.project}) started: ${sid} model=${t.model}`)
        return { session: sid }
      } catch (e) {
        log(`task #${t0.n} start failed: ${e}`)
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
        await startTask(t)
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

    // Один проход доставки: зовут таймер (страховка, раз в POLL_MS = 1 с) и fs.watch ящиков (сразу).
    let passBusy = false
    async function pass() {
      if (passBusy) return
      passBusy = true
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
        for (const w of liveWindows())
          for (const t of w.tabs ?? []) if (!existsSync(cardFile(t.sessionID)) && waitingIn([t.sessionID]) && (await sessionInfo(t.sessionID))) await touch(t.sessionID)
        await resumeTasks()
        await assignReviewers()
        await reconcile()
        await resumeInterrupted()
        await finishTasks()
        await syncTitles()
        await syncStatus()
        await processQueue()
        // наблюдения peer_watch (watch.ts): запустить новые, по концу — письмо окну с побудкой
        pollWatches((w, text) => postLetter(w.session, { id: `watch-${w.id}`, from_role: PLUGIN_SENDER, from_session: PLUGIN_SENDER, to: w.session, time: Date.now(), text }), log, now(), (w) => loadConfig(w.cwd).machineSlots)
        // АДРЕСАТЫ — ИЗ ВИЗИТОК НА ДИСКЕ (после перезагрузки плагина память пуста). Визитки этого процесса и умершего;
        // двойной доставки нет: письмо забирает тот, чей rename в claimLetters прошёл первым.
        for (const card of allCards()) {
          if (children.has(card.session) || card.spawned?.status === "closed") continue
          if (card.pid !== process.pid && pidAlive(card.pid)) continue // вкладка живого чужого процесса (частный сервер)
          void deliver(card)
        }
      } finally {
        passBusy = false
      }
    }
    const timer = setInterval(() => void pass(), POLL_MS)
    let watcher: any
    try {
      let soon: any
      watcher = watch(INBOX, { recursive: true }, () => {
        clearTimeout(soon)
        soon = setTimeout(() => void pass(), 100)
      })
    } catch (e) {
      log(`inbox watch unavailable (the ${POLL_MS} ms tick delivers): ${e}`)
    }

    await ctx.session.hook("context", async (ev: any) => {
      try {
        const card = await touch(String(ev.sessionID ?? ""), ev)
        if (!card) return
        setBusy(card, true) // запрос вкладки: она занята ходом до строки простоя
        // ПОДСКАЗКА — НЕИЗМЕННАЯ, пока не сменилась роль: системная часть стоит перед всей историей, и любое её
        // изменение заново оплачивает историю (замер 2026-10-04). Соседи — peer_list.
        ev.system.push({
          type: "text",
          text:
            `opencode-peers: ты — вкладка с ролью «${card.role}» в проекте ${projOf(card)} (адрес ${keyOf(card)}), репозиторий ${card.repo || "?"}, ` +
            `сессия ${card.session}. Соседи — peer_list, письмо — peer_send, вопрос с ответом — peer_send {expect_reply} + peer_wait, справка — peer_help.`,
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
      const probe = allCards()[0]
      if (probe) {
        const row = await sessionFromDb(probe.session)
        if (!row) out.push("база OpenCode (opencode.db) не читается или в ней нет session_v2 — модель и простой вкладок не видны")
      }
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

    // Слэш-команда /peer_help. Тело — просьба показать справку: своего канала «показать без хода модели» плагин V2 не даёт.
    try {
      const existing = new Set<string>()
      try {
        const list = await ctx.command.list()
        for (const c of list?.data ?? list ?? []) if (c?.name) existing.add(String(c.name))
      } catch {}
      if (!existing.has("peer_help")) {
        await ctx.command.transform((editor: any) => {
          editor.add({
            name: "peer_help",
            description: "Справка по письмам между вкладками (opencode-peers)",
            execute: async ({ sessionID, prompt, delivery }: any) => {
              const dir = readJson<Card>(cardFile(String(sessionID ?? "")))?.directory || String(ctx?.location?.directory ?? "")
              await ctx.session.prompt({ ...prompt, sessionID, text: `Покажи пользователю эту справку дословно, без пересказа:\n\n${helpFor(dir)}`, delivery })
            },
          })
        })
      }
    } catch (e) {
      log(`command peer_help failed: ${e}`)
    }

    // Самопроверка при загрузке (через 10 с: окна успевают отметиться). Проблемы — в журнал и уведомлением окнам.
    const doctorTimer = setTimeout(async () => {
      const problems = [...(await doctor()), ...commonDoctor()]
      if (!problems.length) return log("doctor: ok")
      log(`doctor: ${problems.join(" | ")}`)
      for (const w of liveWindows()) postNotice(w.pid, { title: "opencode-peers: проблемы", message: problems.join("; ").slice(0, 300) })
    }, 10_000)

    log(`setup pid=${process.pid} base=${BASE}`)
    const dispose = () => {
      clearInterval(timer)
      clearTimeout(doctorTimer)
      try {
        watcher?.close()
      } catch {}
    }
    // ОДИН ЦИКЛ НА ПРОЦЕСС (2026-10-05). OpenCode перегружает плагин при изменении его файлов, не всегда закрывая
    // прежний экземпляр: циклы прежних экземпляров жили дальше, каждый со своим проходом раз в секунду. Вместе с
    // чтением базы (5 ГБ) это клало сервер — «Event stream stalled», окно перезапускало сервис (18:19, 18:42).
    // Новый экземпляр останавливает цикл прежнего.
    const g = globalThis as any
    try {
      g.__opencodePeersDispose?.()
    } catch {}
    g.__opencodePeersDispose = dispose
    return () => {
      dispose()
      if (g.__opencodePeersDispose === dispose) g.__opencodePeersDispose = undefined
    }
  },
}
