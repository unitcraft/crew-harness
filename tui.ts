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
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { NOTICES, WINDOWS } from "./core.ts"
import { formatStatuses, readStatuses } from "./status.ts"

const BEAT_MS = 1_000

export default {
  id: "opencode-peers.window",
  setup(api: any) {
    mkdirSync(WINDOWS, { recursive: true })
    const file = path.join(WINDOWS, `${process.pid}.json`)
    const notices = path.join(NOTICES, String(process.pid))

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
      try {
        for (const f of readdirSync(notices).filter((f) => f.endsWith(".json")).sort()) {
          const p = path.join(notices, f)
          const n = JSON.parse(readFileSync(p, "utf8"))
          rmSync(p, { force: true })
          api.ui?.toast?.show?.({ title: n.title, message: n.message, variant: n.attention ? "warning" : "info", ...(n.sessionID ? { sessionID: n.sessionID } : {}) })
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
    const commands = [{ id: "opencode-peers.status", title: "Peers: кто чего ждёт", group: "Peers", slash: { name: "peers" }, palette: true, run: showStatus }]
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

    beat()
    const timer = setInterval(beat, BEAT_MS)
    return () => {
      clearInterval(timer)
      rmSync(file, { force: true })
      rmSync(notices, { recursive: true, force: true })
    }
  },
}
