// crew-harness — ПЛАГИН ОКНА (TUI). OpenCode грузит его в каждом окне: tui.ts в папке плагина, папка указана в
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
// СВОДКА /crew и «ЖДЁТ ВАС» (план 003). Команда окна — как встроенный модуль opencode.stats той же версии:
// ui.slot({append: "app"}) + keymap.layer({commands: [{slash: {name}, palette: true, run}]}); run показывает
// ui.dialog.alert со сводкой из status/ (пишет плагин сервиса) — в окне, без хода модели. Уведомление с attention —
// ещё и attention.notify: системное уведомление, когда окно не в фокусе (настройка OpenCode attention.notifications).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DOCTOR_FILE, NOTICES, WINDOWS, cardFile, helpFor, log, readJson, verbHelpOf } from "./core.ts"
import { readCatalog } from "./model-catalog.ts"
import { doctorText, formatStatuses, readStatuses } from "./status.ts"
import { listTasks, loadTask } from "./tasks.ts"
import { DECISION_RU, type Decision, writeApproval } from "./approvals.ts"

const BEAT_MS = 1_000
const AUTOCLOSE_MS = Number(process.env.CREW_HARNESS_AUTOCLOSE_MS) || 120_000

export default {
  id: "crew-harness.window",
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
      // задачи или приёмки, чья задача влита (accepted, cleaned) или отменена больше AUTOCLOSE_MS назад, — если вкладка
      // не на экране и её ход не идёт. Вкладки владельца (задача assign) не трогаются. Сессия остаётся в истории
      // (Ctrl+P → Switch session). С ВЛИТОЙ, А НЕ С УБРАННОЙ (2026-10-07, #26 nova): пока открыта вкладка сессии из дерева
      // задачи, сервер держит экземпляр этой папки со слежкой за файлами, и Windows не даёт её удалить — уборка ждала
      // закрытия вкладки, а вкладка ждала уборки. Закрыли вкладки — пустой каталог удалился.
      if (Date.now() - closeCheckedAt > 10_000) {
        closeCheckedAt = Date.now()
        for (const t of tabs) {
          if (t.active || closedTabs.has(t.sessionID)) continue
          try {
            const card = readJson<any>(cardFile(t.sessionID))
            const ref = card?.spawned ? (card.task ?? card.review) : undefined
            const task = ref ? loadTask(ref.project, ref.n) : undefined
            if (t.busy || !task || !["accepted", "cleaned", "cancelled"].includes(task.status) || Date.now() - task.updated < AUTOCLOSE_MS) continue
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

    // длинный текст — в широком прокручиваемом диалоге (dialog-text.tsx): alert OpenCode узкий, прижат к верху и не прокручивается;
    // короткий остаётся обычным alert. Модуль грузится при старте, с защитой: не загрузился — везде alert
    let textDialog: any
    if (api.ui?.slot && !process.env.CREW_HARNESS_NO_SIDEBAR) import("./dialog-text.tsx").then((m) => (textDialog = m)).catch((e) => log(`text dialog not drawn pid=${process.pid}: ${String(e).slice(0, 300)}`))
    const showText = (o: { title: string; message: string }): Promise<void> | undefined => {
      // диалог сам выбирает размер по содержимому (dialog-size.ts): короткий текст - среднее окно по центру, большое - для длинного
      if (textDialog && api.ui?.dialog?.show) {
        try {
          return textDialog.showTextDialog(api, o)
        } catch {}
      }
      return api.ui?.dialog?.alert?.(o)
    }
    // ТЯЖЁЛОЕ — НЕ В ПОТОКЕ ОКНА. Чтение настроек проекта — вызовы git (1–4 с на нагруженной машине); окно сначала показывает диалог
    // «Загрузка…», а работу делает рабочий поток (cmd-worker.ts) или, если поток не поднялся, этот же процесс после перерисовки
    let worker: any
    const pending = new Map<number, (m: any) => void>()
    let seq = 0
    const inline = async (op: any): Promise<string> => {
      await new Promise((r) => setTimeout(r, 30)) // дать окну нарисовать «Загрузка…» до блокирующей работы
      try {
        return await (await import("./cmd-ops.ts")).execOp(op)
      } catch (e) {
        log(`window command failed: ${e}`)
        return `Команда не выполнена: ${(e as any)?.message ?? e}`
      }
    }
    const offThread = (op: any): Promise<string> =>
      new Promise((resolve) => {
        const fallback = () => void inline(op).then(resolve)
        if (process.env.CREW_HARNESS_NO_WORKER) return fallback()
        import("node:worker_threads")
          .then(({ Worker }) => {
            if (!worker) {
              const w = new Worker(new URL("./cmd-worker.ts", import.meta.url))
              w.unref?.()
              w.on("message", (m: any) => pending.get(m.id)?.(m))
              const lost = () => {
                if (worker === w) worker = undefined
                for (const f of [...pending.values()]) f({ failed: true })
              }
              w.on("error", (e: any) => (log(`window worker failed: ${String(e).slice(0, 200)}`), lost()))
              w.on("exit", lost)
              worker = w
            }
            const id = ++seq
            const timer = setTimeout(() => pending.get(id)?.({ failed: true }), 30_000)
            pending.set(id, (m) => {
              clearTimeout(timer)
              pending.delete(id)
              if (m.failed) return fallback()
              resolve(m.error !== undefined ? `Команда не выполнена: ${m.error}` : m.out)
            })
            worker.postMessage({ id, op })
          })
          .catch((e) => {
            log(`window worker not started: ${String(e).slice(0, 200)}`)
            worker = undefined
            fallback()
          })
      })
    // /crew: кто чего ждёт — свой проект первым
    const showStatus = () => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const list = readStatuses()
      const mine = list.find((s) => s.session === route)?.project
      showText({ title: "crew-harness — кто чего ждёт", message: formatStatuses(list, Date.now(), mine) })
    }
    // /crew-config: действующие настройки проекта вкладки на экране — значение и откуда (как crew_config show)
    const showConfig = async () => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const card = route ? readJson<any>(cardFile(route)) : undefined
      const title = "crew-harness — настройки проекта"
      showText({ title, message: "Загрузка…" })
      const text = await offThread({ kind: "config", dir: card?.directory || process.cwd(), project: card?.project })
      showText({ title, message: text })
    }
    // /plans: планы на согласовании (план 004) — владелец выбирает план и решение; решение пишется файлом, его применяет
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
          await showText({ title: t.title, message: `${text}\n\n— последний раунд перепроверки: ${last ? `${last.line ?? `блокирующих ${last.blocking}, существенных ${last.significant}, косметических ${last.cosmetic}`}${last.notes ? `\n${last.notes}` : ""}` : "нет"}` })
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
    // /crew-doctor: последняя самопроверка сервиса (он пишет её при запуске и раз в 10 минут)
    const showDoctor = () => {
      const d = readJson<{ at: number; problems: string[] }>(DOCTOR_FILE)
      showText({ title: "crew-harness — самопроверка", message: doctorText(d) })
    }
    // /crew-progress: что сейчас идёт (задача 004) — ход фоновых сессий методики по `progress.log` всех рабочих деревьев репозитория
    // вкладки на экране; без хода модели. progress-view.ts подгружается по требованию: сбой в нём — сообщение, а не падение окна
    const showProgress = async () => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const card = route ? readJson<any>(cardFile(route)) : undefined
      let text: string
      try {
        const view = await import("./progress-view.ts")
        text = view.progressDialog(card?.directory || process.cwd())
      } catch (e) {
        text = `Не прочитать ход работ: ${e}`
      }
      showText({ title: "crew-harness — что сейчас идёт", message: text })
    }
    // КОМАНДЫ БЕЗ ХОДА МОДЕЛИ, ОТВЕТ СРАЗУ (владелец, 2026-10-08: «выполнение команды должно делаться сразу»). Прежняя серверная
    // регистрация (ctx.command.transform + ctx.session.synthetic) отвечала служебным сообщением, которое окно OpenCode 2.0.23
    // не показывает вовсе (проба на одноразовом сервере: execute вызван, synthetic завершён, список сообщений сессии пуст).
    // Поэтому /crew-help, /crew-sets и /crew-profiles — команды окна, как /crew-progress: текст в диалоге. Серверных команд с
    // этими именами нет (два одноимённых пункта в списке слэш-команд были бы лишними).
    const tabDir = (): string => {
      let route: string | undefined
      try {
        const r = api.ui?.router?.current?.()
        route = r?.type === "session" ? r.sessionID : undefined
      } catch {}
      const card = route ? readJson<any>(cardFile(route)) : undefined
      return card?.directory || process.cwd()
    }
    const showHelp = () => {
      let text: string
      try {
        text = helpFor(tabDir())
      } catch (e) {
        text = `Не прочитать справку: ${e}`
      }
      showText({ title: "crew-harness — справка", message: text })
    }
    // Каталог моделей для сверки окон (use, check): живой список окна (api.state.provider), иначе снимок плагина сервиса
    // (model-catalog.ts) с возрастом; нет ни того ни другого — причина вместо молчаливого «недоступен»
    const catalogForOp = (): { catalog?: any[]; catalogNote?: string; catalogWhy?: string } => {
      const rows: { providerID: string; modelID: string; limit?: any }[] = []
      try {
        for (const p of Array.isArray(api.state?.provider) ? api.state.provider : []) {
          for (const [id, m] of p?.models && typeof p.models === "object" ? Object.entries<any>(p.models) : []) rows.push({ providerID: String(p.id ?? p.providerID ?? ""), modelID: String(m?.id ?? id), limit: m?.limit })
        }
      } catch {}
      if (rows.length) return { catalog: rows, catalogNote: "список окна OpenCode" }
      const snap = readCatalog()
      return snap.models ? { catalog: snap.models, catalogNote: snap.note } : { catalogWhy: snap.why }
    }
    // Меню команды: «Таблица» и все глаголы с краткой строкой «что делает и с какими аргументами» (описания — core.ts, VERB_HELP:
    // тот же источник, что у /crew-help и у строки отказов); глагол с аргументами открывает ввод с форматом именно этого глагола
    const verbCommand = (kind: "sets" | "profiles") => async (given?: unknown) => {
      const name = `/crew-${kind}`
      const helps = verbHelpOf(kind)
      let text = typeof given === "string" ? given : undefined
      if (text === undefined) {
        const dialog = api.ui?.dialog
        // ответ на пустой ввод от отмены не отличить, поэтому таблица — пункт меню, а не пустая строка
        const pick: string | undefined = await dialog?.select?.({
          title: name,
          options: [
            { title: "Таблица", value: "__table", description: kind === "sets" ? "все наборы, включённый отмечен" : "семья, ступень → модель, окно" },
            ...helps.map((v) => ({ title: v.verb, value: v.verb, description: `${v.verb}${v.usage ? " " + v.usage : ""} — ${v.what}` })),
          ],
        })
        if (!pick) return
        if (pick === "__table") text = ""
        else {
          const v = helps.find((h) => h.verb === pick)!
          if (v.bare) text = v.verb
          else {
            const allVerbs = `Все глаголы: ${helps.map((h) => h.verb).join(" · ")}`
            const ask = (extra: object) => dialog?.prompt?.({ title: `${name} ${v.verb}`, placeholder: `${v.verb} ${v.usage} — например: ${v.example}`, value: `${v.verb} `, ...extra })
            let typed: string | undefined
            try {
              typed = await ask(textDialog?.noteLine ? { description: () => textDialog.noteLine(api, allVerbs) } : {})
            } catch {
              typed = await ask({}) // окно не приняло подсказку под строкой — тот же ввод без неё
            }
            if (typed === undefined) return
            const t = typed.trim()
            const rest = t.startsWith(v.verb) ? t.slice(v.verb.length).trim() : t // строка могла прийти с глаголом или без него
            if (!rest && /^<[^>]*>/.test(v.usage)) return // нужные аргументы не введены
            text = `${v.verb}${rest ? " " + rest : ""}`
          }
        }
      }
      const title = `crew-harness — ${name}${text ? " " + text : ""}`
      showText({ title, message: "Загрузка…" })
      const out = await offThread({ kind, dir: tabDir(), text, ...catalogForOp() })
      showText({ title, message: out })
    }
    const commands = [
      { id: "crew-harness.status", title: "Crew: кто чего ждёт", group: "Crew", slash: { name: "crew" }, palette: true, run: showStatus },
      { id: "crew-harness.config", title: "Crew: настройки проекта", group: "Crew", slash: { name: "crew-config" }, palette: true, run: showConfig },
      { id: "crew-harness.plans", title: "Crew: планы на согласовании", group: "Crew", slash: { name: "plans" }, palette: true, run: showPlans },
      { id: "crew-harness.doctor", title: "Crew: самопроверка", group: "Crew", slash: { name: "crew-doctor" }, palette: true, run: showDoctor },
      { id: "crew-harness.progress", title: "Crew: что сейчас идёт", group: "Crew", slash: { name: "crew-progress" }, palette: true, run: showProgress },
      { id: "crew-harness.help", title: "Crew: справка", group: "Crew", slash: { name: "crew-help" }, palette: true, run: showHelp },
      { id: "crew-harness.sets", title: "Crew: наборы профилей моделей", group: "Crew", slash: { name: "crew-sets" }, palette: true, run: verbCommand("sets") },
      { id: "crew-harness.profiles", title: "Crew: профили моделей и окон", group: "Crew", slash: { name: "crew-profiles" }, palette: true, run: verbCommand("profiles") },
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

    // блок «Crew» в боковой панели (план 003.2): отдельным модулем и с защитой — JSX компилирует OpenCode; не вышло (другая
    // версия, тест под Node) — блока нет, присутствие, уведомления и команды работают
    const crewSidebar = api.ui?.slot && !process.env.CREW_HARNESS_NO_SIDEBAR ? import("./sidebar.tsx").then((m) => (m.mountSidebar(api), log(`sidebar mounted pid=${process.pid}`))).catch((e) => log(`sidebar not drawn pid=${process.pid}: ${String(e).slice(0, 300)}`)) : undefined
    // блок «Ход работ» (задача 004) — под «Crew», своей цепочкой: ошибка в нём не касается «Crew», ошибка в «Crew» не мешает ему
    crewSidebar?.finally(() => import("./progress-sidebar.tsx").then((m) => (m.mountProgress(api), log(`progress block mounted pid=${process.pid}`))).catch((e) => log(`progress block not drawn pid=${process.pid}: ${String(e).slice(0, 300)}`)))

    // поток поднимается заранее (через 5 с после открытия окна), чтобы первая команда не ждала ни загрузки модулей, ни git
    const warmTimer = process.env.CREW_HARNESS_NO_WORKER ? undefined : setTimeout(() => void offThread({ kind: "warm" }), 5_000)
    warmTimer?.unref?.()
    beat()
    const timer = setInterval(beat, BEAT_MS)
    return () => {
      clearInterval(timer)
      clearTimeout(warmTimer)
      try {
        worker?.terminate?.()
      } catch {}
      rmSync(file, { force: true })
      rmSync(notices, { recursive: true, force: true })
    }
  },
}
