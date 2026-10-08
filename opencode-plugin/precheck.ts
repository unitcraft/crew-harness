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
