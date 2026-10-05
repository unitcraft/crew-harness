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
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { NOTICES, WINDOWS } from "./core.ts"

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
          api.ui?.toast?.show?.({ title: n.title, message: n.message, variant: "info", ...(n.sessionID ? { sessionID: n.sessionID } : {}) })
        }
      } catch {} // нет уведомлений — нет папки
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
