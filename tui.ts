// opencode-peers — ПЛАГИН ОКНА (TUI). OpenCode грузит его в каждом окне: tui.ts в папке плагина, папка указана в
// ~/.config/opencode/cli.json, раздел plugins (сервер грузит index.ts той же папки из opencode.jsonc).
//
// ЗАЧЕМ. Письмо будит вкладку ходом модели, а сервис OpenCode работает и без окон; надёжно знать, какие вкладки
// открыты, может только само окно (у сервиса нет сигнала «окно показывает сессию»). Раз в секунду окно пишет
// windows/<pid>.json: время, открытые вкладки (сессии), активная, занятость. Закрыли окно — файл удаляется; закрыли
// крестиком или окно упало — файл остаётся, но время замирает, и через 3 с вкладки считаются закрытыми (core.ts,
// «ПРИСУТСТВИЕ»). Ещё окно показывает уведомления, которые для него положил плагин сервиса (notices/<pid>/): письмо
// в фоновую вкладку, запуск и конец задачи — всплывающим сообщением с кнопкой Open.
//
// Проверено на OpenCode 2.0.22 (2026-10-05): V2-модуль окна — default {id, setup(api)}; api.ui.router.current()
// даёт {type: "session", sessionID}; api.ui.tabs.list() — [{sessionID, title, active, busy, ...}]; api.ui.toast.show
// с sessionID чужой вкладки сам добавляет кнопку Open.
//
// СВОДКА /peers и «ЖДЁТ ВАС» (план 004). Команда окна — как встроенный модуль opencode.stats той же версии:
// ui.slot({append: "app"}) + keymap.layer({commands: [{slash: {name}, palette: true, run}]}); run показывает
// ui.dialog.alert со сводкой из status/ (пишет плагин сервиса) — в окне, без хода модели. Уведомление с attention —
// ещё и attention.notify: системное уведомление, когда окно не в фокусе (настройка OpenCode attention.notifications).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { NOTICES, WINDOWS, cardFile, configShowText, loadProjects, log, readJson } from "./core.ts"
import { formatStatuses, readStatuses } from "./status.ts"
import { listTasks, loadTask } from "./tasks.ts"
import { DECISION_RU, type Decision, writeApproval } from "./approvals.ts"

const BEAT_MS = 1_000
const AUTOCLOSE_MS = Number(process.env.NOVA_PEERS_AUTOCLOSE_MS) || 120_000

export default {
  id: "opencode-peers.window",
  setup(api: any) {
    mkdirSync(WINDOWS, { recursive: true })
    const file = path.join(WINDOWS, `${process.pid}.json`)
    const notices = path.join(NOTICES, String(process.pid))

    let closeCheckedAt = 0
    const closedTabs = new Set<string>()
    const beat = () => {
      let route: string | undefined
      let tabs: { sessionID: string; active: boolean; busy: boolean; title?: string }[] = []
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : r?.type
      } catch {}
      try {
        tabs = (api.ui?.tabs?.list?.() ?? []).map((t: any) => ({ sessionID: String(t.sessionID), active: !!t.active, busy: !!t.busy, title: t.title }))
      } catch {}
      // вкладки выключены в интерфейсе — открыта хотя бы показанная сессия
      if (!tabs.length && route?.startsWith("ses")) tabs = [{ sessionID: route, active: true, busy: false }]
      try {
        const tmp = `${file}.tmp`
        writeFileSync(tmp, JSON.stringify({ pid: process.pid, beat: Date.now(), route, tabs }))
        renameSync(tmp, file)
      } catch {}
      // ВКЛАДКИ ЗАКРЫТЫХ ЗАДАЧ закрываются сами (владелец 2026-10-06: «#6 вкладка закроется автоматически?»): сессия
      // задачи или приёмки, чья задача принята (cleaned) или отменена больше AUTOCLOSE_MS назад, — если вкладка не на
      // экране. Вкладки владельца (задача assign) не трогаются. Сессия остаётся в истории (Ctrl+P → Switch session).
      if (Date.now() - closeCheckedAt > 10_000) {
        closeCheckedAt = Date.now()
        for (const t of tabs) {
          if (t.active || closedTabs.has(t.sessionID)) continue
          try {
            const card = readJson<any>(cardFile(t.sessionID))
            const ref = card?.spawned ? (card.task ?? card.review) : undefined
            const task = ref ? loadTask(ref.project, ref.n) : undefined
            if (!task || (task.status !== "cleaned" && task.status !== "cancelled") || Date.now() - task.updated < AUTOCLOSE_MS) continue
            if (api.ui?.tabs?.close?.(t.sessionID)) closedTabs.add(t.sessionID)
          } catch {}
        }
      }
      try {
        for (const f of readdirSync(notices).filter((f) => f.endsWith(".json")).sort()) {
          const p = path.join(notices, f)
          const n = JSON.parse(readFileSync(p, "utf8"))
          rmSync(p, { force: true })
          api.ui?.toast?.show?.({ title: n.title, message: n.message, variant: n.attention ? "warning" : "info", ...(n.duration ? { duration: n.duration } : {}), ...(n.sessionID ? { sessionID: n.sessionID } : {}) })
          if (n.attention) {
            try {
              api.attention?.notify?.({ title: n.title, message: n.message, notification: { when: "blurred" } })
            } catch {}
          }
        }
      } catch {} // нет уведомлений — нет папки
    }

    // /peers: кто чего ждёт — свой проект первым
    const showStatus = () => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const list = readStatuses()
      const mine = list.find((s) => s.session === route)?.project
      api.ui?.dialog?.alert?.({ title: "opencode-peers — кто чего ждёт", message: formatStatuses(list, Date.now(), mine) })
    }
    // /peers-config: действующие настройки проекта вкладки на экране — значение и откуда (как peer_config show)
    const showConfig = () => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const card = route ? readJson<any>(cardFile(route)) : undefined
      let text: string
      try {
        loadProjects() // проекты — из ящика (их кладёт плагин сервиса)
        text = configShowText(card?.directory || process.cwd(), card?.project, true)
      } catch (e) {
        text = `Не прочитать настройки: ${e}`
      }
      api.ui?.dialog?.alert?.({ title: "opencode-peers — настройки проекта", message: text })
    }
    // /plans: планы на согласовании (план 012) — владелец выбирает план и решение; решение пишется файлом, его применяет
    // плагин сервиса. Агент этот диалог вызвать не может: согласует только человек в окне.
    const showPlans = async () => {
      const dialog = api.ui?.dialog
      if (!dialog?.select) return
      const waiting = listTasks().filter((t) => t.status === "approval" && t.plan)
      if (!waiting.length) return void dialog.alert?.({ title: "Планы", message: "Планов на согласовании нет." })
      const pick: string | undefined = await dialog.select({
        title: "Планы на согласовании",
        options: waiting.map((t) => ({
          title: `${t.project} · ${t.title}`,
          value: `${t.project}#${t.n}`,
          description: `раундов перепроверки ${t.plan!.rounds.length}${t.plan!.stuck ? " — раунды кончились, решаете по последним замечаниям" : ", два последних чистые"} · задача #${t.n}`,
        })),
      })
      if (!pick) return
      const [project, n] = [pick.slice(0, pick.lastIndexOf("#")), Number(pick.slice(pick.lastIndexOf("#") + 1))]
      const t = loadTask(project, n)
      if (!t?.plan || t.status !== "approval") return
      for (;;) {
        const d: string | undefined = await dialog.select({
          title: `${t.title}`,
          options: [
            { title: "Показать план", value: "show", description: t.plan.file },
            { title: "Согласовать: без упрощений", value: "ok", description: "ни заглушек, ни TODO, ни «временно» — шаг с упрощением не принимается" },
            { title: "Согласовать: упрощения — как в плане", value: "ok-shortcuts", description: "допустимы упрощения, перечисленные в «Режиме выполнения»" },
            { title: "Вернуть с замечаниями", value: "no", description: "план уйдёт автору, перепроверка начнётся заново" },
          ],
        })
        if (!d) return
        if (d === "show") {
          let text = ""
          try {
            text = readFileSync(path.join(t.worktree && existsSync(t.worktree) ? t.worktree : t.directory, t.plan.file), "utf8")
          } catch (e) {
            text = `Не прочитать ${t.plan.file}: ${e}`
          }
          const last = t.plan.rounds.at(-1)
          await dialog.alert?.({ title: t.title, message: `${text}\n\n— последний раунд перепроверки: ${last ? `блокирующих ${last.blocking}, существенных ${last.significant}, косметических ${last.cosmetic}${last.notes ? `\n${last.notes}` : ""}` : "нет"}` })
          continue
        }
        let text: string | undefined
        if (d === "no") {
          text = (await dialog.prompt?.({ title: `Замечания к плану ${t.plan.n}`, placeholder: "что изменить в плане" }))?.trim()
          if (!text) return
        }
        writeApproval({ project, n, decision: d as Decision, ...(text ? { text } : {}) })
        api.ui?.toast?.show?.({ title: `План ${t.plan.n}`, message: `${DECISION_RU[d as Decision]} — передано`, variant: "success", duration: 5_000 })
        return
      }
    }
    const commands = [
      { id: "opencode-peers.status", title: "Peers: кто чего ждёт", group: "Peers", slash: { name: "peers" }, palette: true, run: showStatus },
      { id: "opencode-peers.config", title: "Peers: настройки проекта", group: "Peers", slash: { name: "peers-config" }, palette: true, run: showConfig },
      { id: "opencode-peers.plans", title: "Peers: планы на согласовании", group: "Peers", slash: { name: "plans" }, palette: true, run: showPlans },
    ]
    try {
      api.ui.slot({
        append: "app",
        render() {
          api.keymap.layer(() => ({ mode: "global", commands }))
          return null
        },
      })
    } catch {
      try {
        api.keymap?.layer?.(() => ({ mode: "global", commands }))
      } catch {}
    }

    // блок «Peers» в боковой панели (план 010): отдельным модулем и с защитой — JSX компилирует OpenCode; не вышло (другая
    // версия, тест под Node) — блока нет, присутствие, уведомления и команды работают
    if (api.ui?.slot && !process.env.NOVA_PEERS_NO_SIDEBAR) import("./sidebar.tsx").then((m) => (m.mountSidebar(api), log(`sidebar mounted pid=${process.pid}`))).catch((e) => log(`sidebar not drawn pid=${process.pid}: ${String(e).slice(0, 300)}`))

    beat()
    const timer = setInterval(beat, BEAT_MS)
    return () => {
      clearInterval(timer)
      rmSync(file, { force: true })
      rmSync(notices, { recursive: true, force: true })
    }
  },
}
