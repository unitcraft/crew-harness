// ПРЕДПРОВЕРКА ВЛИВАНИЯ (задача 005, ADR-0009). Замок вливания проекта выдаётся только на ту вершину целевой ветки, на которой
// приёмщик уже собрал и проверил кандидата. Здесь — вся логика этого пункта: чтение вершины главной ветки, запись предпроверки
// в задаче, ворота `merge`, подсказки. Модуль ничего не пишет в репозиторий проекта: он только читает (rev-parse, merge-base,
// cat-file, remote, ls-remote); вливает, пушит и чистит приёмщик, CI запускает проект (плагин о них не знает).
//
// Чтение вершины — `originTip`: `git ls-remote origin refs/heads/<цель>` с собственным сроком плагина (20 с). Срок встроенного
// запуска убивает только родителя: помощник git для https остаётся сиротой и держит соединение. Поэтому срок исполняет таймер
// плагина, и по его истечении плагин снимает ДЕРЕВО процессов своего запуска по номеру процесса (`killTree`). По имени и маске
// не убивается ничего.

import { spawn, execFileSync } from "node:child_process"
import { mergeHolder, releaseMergeLock, repoDir } from "./review.ts"
import { type PrecheckRecord, type Task, loadTask, rounds, taskEvent } from "./tasks.ts"

/** срок чтения вершины на origin, мс */
export const TIP_TIMEOUT_MS = 20_000

/** Локальный вызов git только для чтения: код, вывод, первая строка stderr. Единственная точка вызова git (кроме `ls-remote` в originTip). */
export function runGit(dir: string, args: string[], timeout = 15_000): { ok: boolean; code: number | null; out: string; err: string } {
  try {
    const out = execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true, timeout, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } })
    return { ok: true, code: 0, out, err: "" }
  } catch (e: any) {
    const err = String(e?.stderr ?? e?.message ?? e).trim().split(/\r?\n/)[0] ?? ""
    return { ok: false, code: typeof e?.status === "number" ? e.status : null, out: String(e?.stdout ?? ""), err }
  }
}

/** Снять дерево процессов своего запуска (только пока процесс жив), по номеру: не по имени и не по маске. Ошибки не бросает. */
export function killTree(child: { pid?: number; exitCode: number | null; signalCode: NodeJS.Signals | null; kill: (s?: NodeJS.Signals) => boolean }): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return
  try {
    if (process.platform === "win32") {
      // код возврата taskkill не проверяется (бывает 255 при уже снятом дереве); запуск асинхронный, ошибка игнорируется
      const k = spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" })
      k.on("error", () => {})
    } else {
      process.kill(-child.pid, "SIGKILL")
    }
  } catch {
    try {
      child.kill("SIGKILL")
    } catch {}
  }
}

/** Вершина целевой ветки: из origin (ls-remote) или, если origin не настроен, из локальной ветки. */
export type Tip = { ok: true; tip: string; source: "origin" | "local" } | { ok: false; kind: "fail" | "missing"; error: string }

/** `origin` настроен? `git remote get-url origin`: код 0 — да, код 2 («No such remote») — нет, любой другой — сбой чтения настроек. */
export function hasOrigin(dir: string): { origin: true } | { origin: false } | { error: string } {
  const r = runGit(dir, ["remote", "get-url", "origin"], 10_000)
  if (r.ok) return { origin: true }
  if (r.code === 2) return { origin: false }
  return { error: `git remote get-url origin: ${r.err || `код ${r.code ?? "?"}`}` }
}

const HASH = /^[0-9a-f]{40}([0-9a-f]{24})?$/

/**
 * Прочитать вершину ветки `target` (REQ-09). Только чтение: ни fetch, ни записи ссылок и объектов. Без кеша. Сбой, срок, пустой
 * вывод — отказ с текстом (kind "fail" — сбой чтения, "missing" — на origin ветки нет); «не сдвинулась» из него не выводится.
 */
export function originTip(dir: string, target: string, opts: { timeoutMs?: number } = {}): Promise<Tip> {
  const timeoutMs = opts.timeoutMs ?? TIP_TIMEOUT_MS
  const o = hasOrigin(dir)
  if ("error" in o) return Promise.resolve({ ok: false, kind: "fail", error: o.error })
  if (!o.origin) {
    // origin не настроен: вершина — локальная ветка (прежнее поведение проекта без удалённого репозитория)
    const l = runGit(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${target}^{commit}`], 10_000)
    const tip = l.out.trim()
    return Promise.resolve(l.ok && HASH.test(tip) ? { ok: true, tip, source: "local" } : { ok: false, kind: "missing", error: `origin не настроен, а локальной ветки ${target} в ${dir} нет` })
  }
  return new Promise<Tip>((resolve) => {
    let done = false
    let out = ""
    let err = ""
    const finish = (r: Tip) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(r)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn("git", ["-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=15", "ls-remote", "origin", `refs/heads/${target}`], {
        cwd: dir,
        windowsHide: true,
        detached: process.platform !== "win32", // своя группа процессов: по сроку снимается вся
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
      })
    } catch (e: any) {
      return resolve({ ok: false, kind: "fail", error: `git ls-remote не запущен: ${e?.message ?? e}` })
    }
    const timer = setTimeout(() => {
      killTree(child)
      finish({ ok: false, kind: "fail", error: `git ls-remote origin: срок ${Math.round(timeoutMs / 1000)} с истёк (ответа нет; процессы запуска сняты)` })
    }, timeoutMs)
    child.stdout?.on("data", (d) => (out += d))
    child.stderr?.on("data", (d) => (err += d))
    child.on("error", (e: any) => finish({ ok: false, kind: "fail", error: `git ls-remote не запущен: ${e?.message ?? e}` }))
    child.on("close", (code) => {
      if (done) return
      if (code !== 0) return finish({ ok: false, kind: "fail", error: `git ls-remote origin: ${err.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? `код ${code}`}` })
      for (const line of out.split(/\r?\n/)) {
        const [hash, ref] = line.split(/\s+/)
        if (ref === `refs/heads/${target}` && HASH.test(hash ?? "")) return finish({ ok: true, tip: hash, source: "origin" })
      }
      finish({ ok: false, kind: "missing", error: `ветки ${target} на origin нет` })
    })
  })
}

// ---- швы для тестов (РП-02): по умолчанию пусты, производственный путь их нигде не заполняет
export const seams: { readTip?: typeof originTip; afterTip?: () => void | Promise<void>; afterMerged?: () => void } = {}
const readTip = (dir: string, target: string) => (seams.readTip ?? originTip)(dir, target)

const short = (h: string) => h.slice(0, 7)
const hm = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
/** круг задачи: запись прежнего круга зелёной не считается (РП-04) */
export const roundOf = (t: Task) => rounds(t) + t.attempt
/** Запись действует (не устарела). */
export const isLive = (rec?: PrecheckRecord): rec is PrecheckRecord => !!rec && rec.state !== "stale"
/** Подсказки о соседних задачах проекта — по шагу 9; здесь заготовка, возвращающая пустую строку. */
export function neighbourHints(_t: Task, _kind: "running" | "moved"): string {
  return ""
}

/**
 * Запись предпроверки устаревает с причиной. Чистая функция над записью: сохраняет не она, а тот `taskEvent`/`saveTask`, который
 * вызывающий место и так делает (запись устаревает той же записью файла, что и смена статуса). Уже устаревшая запись не меняется.
 */
export function markPrecheckStale(t: Task, reason: string): void {
  if (!t.precheck || t.precheck.state === "stale") return
  t.precheck = { ...t.precheck, state: "stale", stale: { reason, at: Date.now() } }
}

/** Перечитать задачу с диска и убедиться, что она по-прежнему на приёмке у этой сессии (после `await` чтения вершины). */
const fresh = (t: Task, session: string): Task | undefined => {
  const cur = loadTask(t.project, t.n)
  return cur && cur.status === "reviewing" && cur.reviewer === session ? cur : undefined
}
const REREAD = "за время чтения вершины задача изменилась (статус, приёмщик или запись); запись не тронута, повтори"

/** Начало предпроверки: прочитать вершину целевой ветки и записать «идёт» на ней (REQ-06). Замок не берётся. */
export async function beginPrecheck(t: Task, session: string, target: string): Promise<string> {
  const tip = await readTip(repoDir(t), target)
  await seams.afterTip?.()
  if (!tip.ok) return `Предпроверка не начата: вершину ${target} узнать не удалось (${tip.error}). Запись задачи не менялась; повтори позже.`
  const cur = fresh(t, session)
  if (!cur) return `Предпроверка не начата: ${REREAD}.`
  const rec = cur.precheck
  if (isLive(rec) && rec.base === tip.tip && rec.round === roundOf(cur)) {
    if (rec.state === "green") return `Предпроверка уже зелёная на ${short(rec.base)} (кандидат ${short(rec.candidate ?? "")}, ${hm(rec.green_at ?? rec.at)}); ${target} пока на той же вершине. Дальше — crew_task {action: "merge", n: ${t.n}}: замок выдастся на эту вершину.${neighbourHints(cur, "running")}`
    return `Предпроверка уже идёт с ${hm(rec.at)} на вершине ${rec.base} (${target}). Влей эту вершину в кандидата, прогони CI и заверши: crew_task {action: "precheck", n: ${t.n}, candidate: "<ветка или хеш>", result: "<чем подтверждено>"}.${neighbourHints(cur, "running")}`
  }
  const now = Date.now()
  cur.precheck = { state: "running", base: tip.tip, at: now, by: session, round: roundOf(cur) }
  const held = mergeHolder(cur.project)
  const note = isLive(rec) ? `предпроверка начата заново на ${short(tip.tip)} (прежняя на ${short(rec.base)}: ${rec.state === "green" ? "зелёная" : "шла"}, ${target} сдвинулась)` : `предпроверка начата на ${short(tip.tip)}`
  taskEvent(cur, session, undefined, note)
  const lockNote = held && held.session === session && held.n === cur.n ? ` Замок вливания у тебя уже есть для этой задачи и остаётся; если он не нужен — crew_task {action: "unlock", n: ${t.n}}.` : ""
  return `Предпроверка начата: ${target} на origin сейчас ${tip.tip}. Влей эту вершину в кандидата (например, в ветку integrate/t${t.n}; имя плагин не навязывает), прогони CI и заверши: crew_task {action: "precheck", n: ${t.n}, candidate: "<ветка или хеш>", result: "<чем подтверждено: строка CI>"}. Замок вливания этим действием не берётся: merge выдаст его только на эту же вершину.${lockNote}${neighbourHints(cur, "running")}`
}

/** Коммит по имени или хешу из локального репозитория задачи: полный хеш или undefined. */
function resolveCommit(dir: string, ref: string): string | undefined {
  const r = runGit(dir, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], 10_000)
  const h = r.out.trim()
  return r.ok && HASH.test(h) ? h : undefined
}
const FETCH_HINT = "подтяни объекты (git fetch) вручную и повтори, передав origin/<ветка> или хеш: короткое имя ветки, которая есть только на origin, после fetch не находится"

/** Завершение предпроверки: кандидат и результат (REQ-07). Любой отказ запись не меняет. */
export async function finishPrecheck(t: Task, session: string, target: string, input: { candidate?: string; result?: string }): Promise<string> {
  const rec0 = t.precheck
  const refuse = (why: string) => `Предпроверка не завершена: ${why}. Запись задачи не изменена${isLive(rec0) ? ` (остаётся ${rec0.state === "green" ? "зелёной" : "«идёт»"} на ${short(rec0.base)})` : ""}.`
  if (!isLive(rec0)) return `Предпроверка не завершена: записи «идёт» или «зелёная» нет${rec0 ? ` (прежняя устарела: ${rec0.stale?.reason ?? "?"})` : ""}. Начни: crew_task {action: "precheck", n: ${t.n}} (без candidate и result).`
  if (rec0.round !== roundOf(t)) return refuse(`запись прежнего круга, а задачу с тех пор возвращали; начни заново: crew_task {action: "precheck", n: ${t.n}}`)
  const result = String(input.result ?? "").trim()
  const candidate = String(input.candidate ?? "").trim()
  if (!result) return refuse("нужен result — чем подтверждено (строка CI), непустой")
  if (!candidate) return refuse("нужен candidate — ветка или хеш собранного кандидата")
  const held = mergeHolder(t.project)
  if (held && held.session === session && held.n === t.n) return refuse(`замок вливания уже у тебя для этой задачи; сначала crew_task {action: "unlock", n: ${t.n}}`)
  const dir = repoDir(t)
  if (!resolveCommit(dir, rec0.base)) return refuse(`основы ${short(rec0.base)} нет в локальном репозитории задачи (${dir}); ${FETCH_HINT}`)
  const cand = resolveCommit(dir, candidate)
  if (!cand) return refuse(`кандидата «${candidate}» нет в локальном репозитории задачи (${dir}); ${FETCH_HINT}`)
  const anc = runGit(dir, ["merge-base", "--is-ancestor", rec0.base, cand], 10_000)
  if (!anc.ok) return refuse(anc.code === 1 ? `кандидат ${short(cand)} не содержит основу ${short(rec0.base)}: влей ${target} на этой вершине (${rec0.base}) в кандидата и прогони CI заново` : `не удалось сверить кандидата с основой (git merge-base: ${anc.err || `код ${anc.code}`})`)
  const tip = await readTip(dir, target)
  await seams.afterTip?.()
  if (!tip.ok) return refuse(`вершину ${target} узнать не удалось (${tip.error})`)
  const cur = fresh(t, session)
  const rec = cur?.precheck
  if (!cur || !isLive(rec) || rec.base !== rec0.base || rec.at !== rec0.at || rec.round !== rec0.round) return refuse(REREAD)
  let warn = ""
  if (t.branch) {
    const b = resolveCommit(dir, t.branch) ?? resolveCommit(dir, `origin/${t.branch}`)
    if (b && runGit(dir, ["merge-base", "--is-ancestor", b, cand], 10_000).code === 1)
      warn = ` Внимание: ветка задачи ${t.branch} не входит в кандидата (его могли собрать перебазированием или squash); приёмщик сверяет содержимое сам — это предупреждение, не отказ.`
  }
  const now = Date.now()
  const replaced = rec.state === "green"
  cur.precheck = { state: "green", base: rec.base, at: rec.at, by: rec.by, round: rec.round, candidate: cand, result: result.slice(0, 500), green_at: now }
  taskEvent(cur, session, undefined, replaced ? `предпроверка: запись заменена на ${short(rec.base)} (кандидат ${short(rec.candidate ?? "")} → ${short(cand)}): ${result.slice(0, 200)}` : `предпроверка зелёная на ${short(rec.base)} (кандидат ${short(cand)}): ${result.slice(0, 200)}`)
  const moved = tip.tip !== rec.base
  return `Предпроверка зелёная на ${short(rec.base)} (кандидат ${short(cand)}, результат: ${result.slice(0, 200)}). ${
    moved ? `Но ${target} уже сдвинулась: сейчас ${short(tip.tip)} (проверено ${hm(now)}). Начни заново: crew_task {action: "precheck", n: ${t.n}} (эта запись остаётся, пока не начнёшь новую); замок на сдвинутую вершину не выдастся.` : `${target} пока не сдвинулась. Дальше — crew_task {action: "merge", n: ${t.n}}: замок выдастся на эту вершину.`
  }${warn}`
}

/** Отпустить замок вливания, который сессия держит для этой задачи (REQ-10). Запись устаревает («замок отпущен»). */
export function unlockMerge(t: Task, session: string): string {
  const h = mergeHolder(t.project)
  if (!h) return `Замка вливания проекта ${t.project} нет — отпускать нечего.`
  if (h.session !== session) return `Замок вливания проекта ${t.project} не твой (держит приёмщик задачи #${h.n}); чужой замок unlock не снимает.`
  if (h.n !== t.n) return `Твой замок вливания — для задачи #${h.n}, а не #${t.n}: unlock {n: ${h.n}}.`
  releaseMergeLock(t.project, session)
  markPrecheckStale(t, "замок отпущен")
  taskEvent(t, session, undefined, "замок вливания отпущен (unlock); предпроверка устарела")
  return `Замок вливания проекта ${t.project} отпущен. Предпроверка устарела (замок отпущен): чтобы вливать, начни заново — crew_task {action: "precheck", n: ${t.n}}.`
}
