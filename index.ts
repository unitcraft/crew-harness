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

import { readdirSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import {
  type Card,
  type Letter,
  type PeersConfig,
  POLL_MS,
  QUEUE,
  BASE,
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
  autoRole,
  safeKey,
  readJson,
  cardFile,
  allCards,
  saveCard,
  pidAlive,
  postLetter,
  takeLetters,
  formatLetters,
  helpFor,
  saveProjects,
  makeTools,
} from "./core.ts"

export { parseProjects, projectOf, parseAddr, HELP, helpFor } from "./core.ts"

export default {
  id: "nova.peers",
  async setup(ctx: any) {
    const mine = new Map<string, Card>() // сессии этого процесса
    const children = new Set<string>()
    const projects = parseProjects(ctx?.options)
    saveProjects(ctx?.options) // для MCP-сервера окон claude-code: список проектов один
    // Проект визитки: записанный в ней (окно само ставит его при каждом обращении) или вычисленный по каталогу.
    const projOf = (c: Card) => c.project ?? projectOf(c.directory, projects)
    const keyOf = (c: Card) => roleKey(projOf(c), c.role)

    async function sessionInfo(sessionID: string): Promise<any> {
      try {
        const r = await ctx.session.get({ sessionID })
        return r?.data ?? r
      } catch {
        return undefined
      }
    }

    // КАНДИДАТЫ: процесс визитки жив (kill -0) и сессия существует и не архивирована. Закрытая сессия — get падает или
    // отдаёт архивную метку. Время последней активности не смотрится.
    async function candidates(cards: Card[]): Promise<Card[]> {
      const out: Card[] = []
      for (const c of cards) {
        if (children.has(c.session)) continue
        if (c.pid !== process.pid && !pidAlive(c.pid)) continue
        const info = await sessionInfo(c.session)
        if (!info) continue
        if (info.time?.archived || info.time_archived || info.archived) continue
        out.push(c)
      }
      return out
    }

    // Визитка сессии: создаётся при первом обращении, отметка жизни — при каждом.
    async function touch(sessionID: string, ev?: any): Promise<Card | undefined> {
      if (!sessionID || children.has(sessionID)) return undefined
      // ФАЙЛ ПЕРВЫМ, память — только запасом. Визитку правят и ДРУГИЕ сессии:
      // `peer_role force` переписывает роль прежнего владельца. Брать её из памяти
      // процесса значило на следующем ходу записать старую роль поверх — замер
      // 2026-10-03: после передачи исключительной роли прежнее окно снова числилось её
      // держателем, и письмо новому держателю ушло старому.
      let card = readJson<Card>(cardFile(sessionID)) ?? mine.get(sessionID)
      if (!card) {
        const info = await sessionInfo(sessionID)
        if (info?.parentID) {
          children.add(sessionID)
          return undefined
        }
        const directory = String(info?.location?.directory ?? info?.directory ?? ctx?.location?.directory ?? "")
        card = {
          session: sessionID,
          role: autoRole(sessionID),
          auto: true,
          title: String(info?.title ?? ""),
          directory,
          repo: repoLabel(directory),
          pid: process.pid,
          updated: Date.now(),
        }
        log(`card new ${sessionID} role=${card.role} repo=${card.repo}`)
      }
      if (!card.repo) card.repo = repoLabel(card.directory)
      card.project = projectOf(card.directory, projects) // каждый раз: список проектов мог поменяться
      // МОДЕЛЬ. Запрос (ev.model из хука запроса) всегда главнее и пишется каждый раз. Запас — база: берётся,
      // только когда запрос модели не дал, и только если у визитки нет модели из запроса (иначе давний
      // запрос затёрся бы старым ходом из базы, а то и наоборот — новый запрос старой моделью).
      const fromRequest = fmtModel(ev?.model)
      if (fromRequest) {
        card.model = fromRequest
        card.modelAt = Date.now()
        card.modelFrom = "request"
      } else if (card.modelFrom !== "request" && (!card.model || Date.now() - (card.modelCheckedAt ?? 0) > MODEL_TTL_MS)) {
        const db = await modelFromDb(sessionID)
        if (db) {
          card.model = db.model
          card.modelAt = db.at
          card.modelFrom = "db"
        }
        card.modelCheckedAt = Date.now()
      }
      card.pid = process.pid
      card.updated = Date.now()
      saveCard(card)
      mine.set(sessionID, card)
      return card
    }

    async function deliver(card: Card) {
      // Ящики окна: `<проект>.<роль>`, id сессии и прежний ящик роли без проекта (письма, отправленные до проектов).
      const letters = [...takeLetters(keyOf(card)), ...takeLetters(card.role), ...takeLetters(card.session)]
      if (!letters.length) return
      try {
        await ctx.session.prompt({ sessionID: card.session, text: formatLetters(letters, card), delivery: "queue" })
        log(`delivered ${letters.map((l) => l.id).join(",")} -> ${card.session} (${keyOf(card)})`)
      } catch (e) {
        // Не доставилось — вернуть в ящик, чтобы не потерять.
        for (const l of letters) postLetter(l.to === card.session ? card.session : keyOf(card), l)
        log(`deliver failed ${card.session}: ${e}`)
      }
    }

    // ЗАНЯТОСТЬ. busy ставится в хуке запроса (context) и снимается событием простоя сессии V2 `session.idle`
    // {sessionID} (имя найдено по бинарю V2); запас — строка `idle` в session_message после busySince (опрос в
    // таймере). Без вызовов модели: только код плагина.
    function setBusy(card: Card, busy: boolean) {
      const fresh = readJson<Card>(cardFile(card.session)) ?? card
      fresh.busy = busy
      fresh.busySince = busy ? Date.now() : undefined
      saveCard(fresh)
      mine.set(fresh.session, fresh)
    }

    // ОЧЕРЕДЬ роли+ступени: письмо с tier, которому не нашлось свободного окна нужной ступени, ждёт здесь и уходит
    // первому освободившемуся держателю с подходящей моделью. Забирается переименованием — второй процесс
    // того же письма не получит.
    let queueBusy = false
    async function processQueue() {
      if (queueBusy) return
      queueBusy = true
      try {
        await processQueueOnce()
      } finally {
        queueBusy = false
      }
    }
    async function processQueueOnce() {
      for (const roleDir of readdirSync(QUEUE)) {
        const dir = path.join(QUEUE, roleDir)
        for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
          const letter = readJson<Letter>(path.join(dir, f))
          if (!letter?.tier) continue
          const holders = await candidates(allCards().filter((c) => safeKey(keyOf(c)) === roleDir))
          if (!holders.length) continue
          const cfg = loadConfig(holders[0].directory)
          const pick = pickHolder(holders, letter.tier, cfg)
          if (!pick) continue
          const claim = path.join(dir, `.${f}.claim`)
          try {
            renameSync(path.join(dir, f), claim)
          } catch {
            continue
          }
          postLetter(pick.session, { ...letter, to: pick.session })
          rmSync(claim, { force: true })
          if (mine.has(pick.session)) {
            setBusy(pick, true) // письмо займёт окно: следующее с tier не должно уйти туда же
            void deliver(mine.get(pick.session)!)
          }
          log(`queue ${f} -> ${pick.session} (${pick.role}, ${tierOf(pick.model, cfg)})`)
        }
      }
    }

    const clearIdle = (sessionID: string) => {
      const c = readJson<Card>(cardFile(sessionID))
      if (c?.busy) setBusy(c, false)
      void processQueue()
    }
    try {
      const bus = (ctx as any).events ?? (ctx as any).event
      const on = bus?.on?.bind(bus)
      if (on) await on("session.idle", (ev: any) => clearIdle(String(ev?.properties?.sessionID ?? ev?.data?.sessionID ?? ev?.sessionID ?? "")))
      else log("no event bus in plugin context: idle comes from the database fallback")
    } catch (e) {
      log(`session.idle subscribe failed: ${e}`)
    }

    const timer = setInterval(() => {
      // Запас снятия busy: строка простоя в базе после busySince (событие могло не дойти).
      for (const c of allCards()) {
        if (c.busy && c.pid === process.pid && !children.has(c.session)) {
          void idleAfter(c.session, c.busySince ?? 0).then((done) => {
            if (done) clearIdle(c.session)
          })
        }
      }
      void processQueue()
      // АДРЕСАТЫ — ИЗ ВИЗИТОК НА ДИСКЕ, а не из памяти (замер 2026-10-03): после перезагрузки плагина память пуста, а простаивающее
      // окно не делает запросов и в неё не попадает — письма ему лежали в ящике
      // вечно, ровно в том случае, ради которого доставка будит окно. Берутся
      // визитки этого процесса и визитки умершего процесса (после перезапуска
      // сервера сессии те же, процесс новый). Двойной доставки нет: письмо
      // забирает тот экземпляр, чей rename в takeLetters прошёл первым.
      for (const card of allCards()) {
        if (children.has(card.session)) continue
        if (card.pid !== process.pid && pidAlive(card.pid)) continue // окно живого чужого процесса
        void deliver(card)
      }
    }, POLL_MS)

    await ctx.session.hook("context", async (ev: any) => {
      try {
        const card = await touch(String(ev.sessionID ?? ""), ev)
        if (!card) return
        setBusy(card, true) // запрос окна: оно занято ходом до события простоя
        // ПОДСКАЗКА — НЕИЗМЕННАЯ, пока не сменилась роль. Строка «живые соседи» с их моделями
        // (была до 2026-10-04) менялась на каждом ходе ЛЮБОГО соседа («последний ход HH:MM», окно
        // ожило/замолчало), а системная часть стоит перед всей историей: кэш промпта Claude
        // совпадает по префиксу, и каждое изменение заново оплачивало всю историю окна (замер
        // владельца: 6 сбросов по 75–97 тыс. токенов за 40 шагов). Соседи и модели — peer_list.
        ev.system.push({
          type: "text",
          text:
            `nova-peers: ты — окно с ролью «${card.role}»${card.auto ? " (назначена автоматически; своя — инструментом peer_role)" : ""} в проекте ${projOf(card)} (адрес ${keyOf(card)}), репозиторий ${card.repo || "?"}, ` +
            `сессия ${card.session}. Соседи — peer_list, письмо — peer_send, история — peer_inbox, справка — peer_help (или /peer_help).`,
        })
      } catch (e) {
        log(`context failed: ${e}`)
      }
    })

    // ЗАПРОС ОКНА — источник модели. Хук `model.request` V2 получает {sessionID, agent, model, kind}; модель
    // пишется в визитку на каждом запросе, до запроса `context`. Сбой не должен ломать запрос.
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

    // Инструменты — общие с MCP-сервером (core.ts); здесь только то, что умеет процесс OpenCode: свои
    // сессии получают письма сразу, не дожидаясь опроса.
    const tools = makeTools({
      projects,
      defaultDir: String(ctx?.location?.directory ?? ""),
      touch: (sessionID) => touch(sessionID),
      candidates,
      isChild: (s) => children.has(s),
      posted: (targets) => {
        // Получатель в этом же процессе — доставить сразу.
        for (const c of mine.values()) if (targets.includes(keyOf(c)) || targets.includes(c.session)) void deliver(c)
      },
      picked: (pick) => {
        if (mine.has(pick.session)) {
          setBusy(pick, true)
          void deliver(mine.get(pick.session)!)
        }
      },
      roleTaken: (me) => {
        mine.set(me.session, me)
        void deliver(me)
      },
    })
    const toEditor = (t: (typeof tools)[number]) => ({ name: t.name, description: t.description, input: t.input, execute: (input: any, context: any) => t.execute(input, context?.sessionID) })

    await ctx.tool.transform((editor: any) => {
      for (const t of tools) if (t.name !== "peer_help") editor.add(toEditor(t))
    })

    await ctx.tool.transform((editor: any) => {
      editor.add(toEditor(tools.find((t) => t.name === "peer_help")!))
    })

    // Слэш-команда /peer_help — тем же способом, что команды nova-guards. Тело — просьба показать справку:
    // ответом будет текст HELP; своего канала «показать без хода модели» плагин V2 не даёт.
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
            description: "Справка по письмам между окнами (nova-peers)",
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

    log(`setup pid=${process.pid} base=${BASE}`)
    return () => clearInterval(timer)
  },
}
