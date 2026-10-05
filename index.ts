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
  type SpawnRequest,
  POLL_MS,
  QUEUE,
  INBOX,
  BASE,
  SPAWN,
  DEFAULT_ROLE,
  normalizeRole,
  NUDGE_MAX,
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
  makeTools,
  sessionFromDb,
} from "./core.ts"

export { parseProjects, projectOf, parseAddr, HELP, helpFor } from "./core.ts"

export default {
  id: "nova.peers",
  async setup(ctx: any) {
    const mine = new Map<string, Card>() // сессии этого процесса
    const children = new Set<string>()
    const projects = parseProjects(ctx?.options)
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
      saveCard(fresh)
      mine.set(fresh.session, fresh)
    }

    // НАПОМИНАНИЯ (core.ts, «ОБЯЗАТЕЛЬСТВА»). Ход вкладки закончился, а на вопрос (или задачу) она не ответила —
    // будить её напоминанием; после NUDGE_MAX — написать спросившему, что вкладка стоит.
    function nudge(card: Card) {
      const list = obligationsOf(card.session)
      if (!list.length) return
      const t = now()
      for (const o of list) {
        if (o.nudges >= NUDGE_MAX) continue
        o.nudges++
        const left = NUDGE_MAX - o.nudges
        postLetter(card.session, {
          id: `${t}-nudge-${safeKey(o.qid)}`,
          from_role: "opencode-peers",
          from_session: "opencode-peers",
          to: card.session,
          time: t,
          text:
            `Задача не завершена: вопрос ${o.qid} от ${o.from_role} (сессия ${o.from_session})${o.task ? `: «${o.task.slice(0, 200)}»` : ""}. ` +
            `Ты остановился, не ответив. Продолжай работу. Закончил — отчёт: peer_send {to: "${o.from_session}", reply_to: "${o.qid}", text: "..."}. ` +
            `Упёрся — тем же ответом напиши, что мешает. Напоминание ${o.nudges} из ${NUDGE_MAX}${left ? "" : " (последнее: дальше спросивший узнает, что вкладка стоит)"}.`,
        })
        if (!left)
          postLetter(o.from_session, {
            id: `${t}-stuck-${safeKey(o.qid)}`,
            from_role: "opencode-peers",
            from_session: "opencode-peers",
            to: o.from_session,
            time: t,
            text: `Вкладка ${keyOf(card)} (сессия ${card.session}) ${NUDGE_MAX} раза останавливалась, не ответив на ${o.qid}. Загляни в неё или переназначь задачу.`,
          })
        log(`nudge ${card.session} for ${o.qid} (${o.nudges}/${NUDGE_MAX})`)
      }
      saveObligations(card.session, list)
      void deliver(readJson<Card>(cardFile(card.session)) ?? card)
    }

    // КОНЕЦ ЗАДАЧИ. Сессия под задачу ответила на qid задачи (core.ts ставит status "done"), её ход кончился —
    // финальная строка в историю (без хода), заголовок «✓ …», задача закрыта, интегратору уведомление в окне.
    async function finishTasks() {
      for (const c of allCards()) {
        if (c.spawned?.status !== "done" || (c.pid !== process.pid && pidAlive(c.pid))) continue
        if (c.busy) continue // ход сессии ещё идёт: строка, записанная сейчас, стала бы ещё одним шагом модели (замер 2026-10-05)
        c.spawned.status = "closed"
        saveCard(c)
        try {
          const note = { sessionID: c.session, text: `✓ Задача выполнена: отчёт отправлен интегратору (сессия ${c.spawned.by}). Сессия закрыта — письма больше не приходят.`, resume: false }
          await (typeof ctx.session.synthetic === "function" ? ctx.session.synthetic(note) : ctx.session.prompt(note)) // строка в историю, без хода
        } catch (e) {
          log(`final note failed ${c.session}: ${e}`)
        }
        // строка выше встанет в историю со следующим сообщением (показать сразу — значит потратить ход модели);
        // видно сразу — заголовок сессии «✓ …» (вкладки, список сессий)
        try {
          await ctx.session.update?.({ sessionID: c.session, title: `✓ ${c.title || c.spawned.task.slice(0, 60)}` })
        } catch (e) {
          log(`title mark failed ${c.session}: ${e}`)
        }
        const t = tabOf(c.spawned.by)
        if (t?.window.pid) postNotice(t.window.pid, { sessionID: c.session, title: "Задача выполнена", message: c.title || c.spawned.task.slice(0, 120) })
        log(`task done ${c.session} (by ${c.spawned.by})`)
      }
    }

    // ЗАДАЧИ ИНТЕГРАТОРА: новая сессия (ctx.session.create), визитка с отметкой задачи, обязательство отчитаться,
    // первое письмо — сама задача (с qid задачи). Заявки MCP-сервера (spawn/<id>.json) исполняет таймер.
    async function spawn(req: SpawnRequest): Promise<{ session?: string; error?: string }> {
      try {
        const [providerID, ...rest] = req.model.split("/")
        const created = await ctx.session.create({ title: req.title, location: { directory: req.directory }, model: { providerID, id: rest.join("/") } })
        const info = created?.data ?? created
        const sid = String(info?.id ?? "")
        if (!sid) return { error: `session.create returned no id: ${JSON.stringify(info)?.slice(0, 200)}` }
        const by = readJson<Card>(cardFile(req.by))
        const fromRole = by ? keyOf(by) : "integrator"
        const t = now()
        const card: Card = { session: sid, role: req.role, auto: false, title: req.title, directory: req.directory, repo: repoLabel(req.directory), project: req.project, model: req.model, modelAt: t, modelFrom: "request", pid: process.pid, updated: t, spawned: { by: req.by, task: req.task.slice(0, 300), tier: req.tier, status: "running", at: t, qid: req.qid } }
        saveCard(card)
        mine.set(sid, card)
        addObligation(sid, { qid: req.qid, from_session: req.by, from_role: fromRole, at: t, nudges: 0, task: req.task.slice(0, 200) })
        postLetter(sid, {
          id: `${t}-${safeKey(req.by)}-task`,
          from_role: fromRole,
          from_session: req.by,
          to: sid,
          time: t,
          qid: req.qid,
          text: `ЗАДАЧА от интегратора (ты — сессия под эту задачу, роль ${roleKey(req.project, req.role)}).\n\n${req.task}\n\nКогда закончишь — отчёт: peer_send {to: "${req.by}", reply_to: "${req.qid}", text: "что сделано, как проверено, что осталось"}. После отчёта сессия закроется.`,
        })
        void deliver(card)
        const w = tabOf(req.by)
        if (w?.window.pid) postNotice(w.window.pid, { sessionID: sid, title: "Запущена задача", message: req.title })
        log(`spawn ${sid} by ${req.by} role=${req.role} model=${req.model}`)
        return { session: sid }
      } catch (e) {
        log(`spawn failed: ${e}`)
        return { error: String((e as any)?.message ?? e) }
      }
    }
    async function processSpawnRequests() {
      if (!existsSync(SPAWN)) return
      for (const f of readdirSync(SPAWN).filter((f) => f.endsWith(".request.json"))) {
        const claim = path.join(SPAWN, f.replace(".request.json", ".claim"))
        try {
          renameSync(path.join(SPAWN, f), claim)
        } catch {
          continue
        }
        const req = readJson<SpawnRequest>(claim)
        const r = req ? await spawn(req) : { error: "bad request" }
        writeFileSync(path.join(SPAWN, f.replace(".request.json", ".result.json")), JSON.stringify(r))
        rmSync(claim, { force: true })
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
      nudge(c) // ход закончился: если есть невыполненное обязательство — напоминание
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
        }
        // Вкладка открыта в окне, но ещё не делала запросов (визитки нет), а письмо по её id ждёт — завести визитку.
        // Чужая сессия (другого сервера) не найдётся в ctx.session.get — touch вернёт пусто.
        for (const w of liveWindows())
          for (const t of w.tabs ?? []) if (!existsSync(cardFile(t.sessionID)) && waitingIn([t.sessionID]) && (await sessionInfo(t.sessionID))) await touch(t.sessionID)
        await processSpawnRequests()
        await finishTasks()
        await processQueue()
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
      spawn,
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
    return () => {
      clearInterval(timer)
      clearTimeout(doctorTimer)
      try {
        watcher?.close()
      } catch {}
    }
  },
}
