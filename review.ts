// ПРИЁМКА (план 002, Ф.3). Исполнитель сдал задачу — её проверяет и вливает приёмщик (воркер, не автор задачи; по
// настройке проекта — сам интегратор), интегратор принятое не перепроверяет. Здесь — то, что плагин проверяет сам,
// и тексты писем: замок вливания проекта, «ветка или коммит действительно в целевой ветке», «worktree и ветка
// удалены», письмо приёмщику, письмо на доработку, шаги очистки.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { type Card, type PeersConfig, ROLES, cardFile, mayWakeCard, readJson, safeKey } from "./core.ts"
import { type Task, isOpen, loadTask } from "./tasks.ts"

const git = (cwd: string, args: string[], timeout = 15_000) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, timeout, stdio: ["ignore", "pipe", "ignore"] })
const gitOk = (cwd: string, args: string[], timeout?: number) => {
  try {
    git(cwd, args, timeout)
    return true
  } catch {
    return false
  }
}

// ЗАМОК ВЛИВАНИЯ проекта: один вливающий за раз (иначе CI одного проверит не то, что окажется в целевой ветке).
// roles/<проект>_merge.json {session, n, at}; взять — атомарно создать файл (wx). Замок брошен (держатель закрыт и
// не сессия задачи, его приёмка уже не идёт, или замку больше 2 ч) — забирается переименованием-перехватом.
type MergeLock = { session: string; n: number; at: number }
const MERGE_STALE_MS = 2 * 3600_000
const mergeFile = (project: string) => path.join(ROLES, `${safeKey(project)}_merge.json`)
export const mergeHolder = (project: string) => readJson<MergeLock>(mergeFile(project))

export function takeMergeLock(project: string, session: string, n: number): { ok: true } | { ok: false; holder: MergeLock } {
  mkdirSync(ROLES, { recursive: true })
  const file = mergeFile(project)
  const mine = JSON.stringify({ session, n, at: Date.now() })
  try {
    writeFileSync(file, mine, { flag: "wx" })
    return { ok: true }
  } catch {}
  const cur = readJson<MergeLock>(file)
  if (cur?.session === session) {
    writeFileSync(file, mine) // тот же держатель — обновить время и номер
    return { ok: true }
  }
  if (cur && !mergeLockAbandoned(project, cur)) return { ok: false, holder: cur }
  const tomb = `${file}.${process.pid}.${Date.now()}.old`
  try {
    renameSync(file, tomb)
  } catch {
    const now = readJson<MergeLock>(file)
    return now ? { ok: false, holder: now } : takeMergeLock(project, session, n)
  }
  rmSync(tomb, { force: true })
  try {
    writeFileSync(file, mine, { flag: "wx" })
    return { ok: true }
  } catch {
    return { ok: false, holder: readJson<MergeLock>(file)! }
  }
}

function mergeLockAbandoned(project: string, lock: MergeLock): boolean {
  if (Date.now() - lock.at > MERGE_STALE_MS) return true
  const t = loadTask(project, lock.n)
  if (!t || !isOpen(t) || t.reviewer !== lock.session) return true
  const holder = readJson<Card>(cardFile(lock.session))
  return !holder || !mayWakeCard(holder)
}

export function releaseMergeLock(project: string, session: string) {
  const file = mergeFile(project)
  if (readJson<MergeLock>(file)?.session === session) rmSync(file, { force: true })
}
export const holdsMergeLock = (project: string, session: string) => mergeHolder(project)?.session === session

/** Каталог репозитория задачи: worktree (если ещё есть) или каталог, где задачу ставили. */
const repoDir = (t: Task) => (t.worktree && existsSync(t.worktree) ? t.worktree : t.directory)

/** Влито ли: коммит (squash-слияние) или ветка задачи — предок целевой ветки (локальной или origin/). */
export function isMerged(t: Task, target: string, commit?: string): { ok: boolean; how?: string; head?: string } {
  const dir = repoDir(t)
  const targets = [target, `origin/${target}`].filter((x) => gitOk(dir, ["rev-parse", "--verify", "--quiet", x]))
  if (!targets.length) return { ok: false, how: `целевой ветки ${target} в ${dir} нет` }
  const heads = commit ? [commit] : [t.branch, t.branch && `origin/${t.branch}`].filter(Boolean) as string[]
  for (const h of heads) {
    if (!gitOk(dir, ["rev-parse", "--verify", "--quiet", `${h}^{commit}`])) continue
    for (const tg of targets)
      if (gitOk(dir, ["merge-base", "--is-ancestor", h, tg])) {
        let head: string | undefined
        try {
          head = git(dir, ["rev-parse", `${h}^{commit}`]).trim()
        } catch {}
        return { ok: true, how: `${h} в ${tg}`, head }
      }
  }
  return { ok: false, how: commit ? `коммита ${commit} нет в ${targets.join(" / ")}` : `ветка ${t.branch ?? "?"} не влита в ${targets.join(" / ")} (squash-слияние — передай commit: <хэш коммита в ${target}>)` }
}

/** Шаги очистки по настройке проекта — текстом для приёмщика. */
export function cleanupSteps(t: Task, cfg: PeersConfig): string[] {
  if (cfg.cleanup === "none") return []
  const out: string[] = []
  if (t.worktree) out.push(`git worktree remove "${t.worktree}"`)
  if (t.branch) out.push(`git branch -D ${t.branch}`)
  if (t.branch && cfg.cleanup === "local+remote") out.push(`git push origin --delete ${t.branch}`)
  return out
}

/** Очистка сделана: worktree нет, локальной ветки нет, при local+remote — и на origin (если origin доступен). */
export function cleanupDone(t: Task, cfg: PeersConfig): { ok: boolean; left: string[] } {
  const left: string[] = []
  if (cfg.cleanup === "none") return { ok: true, left }
  if (t.worktree && existsSync(t.worktree)) left.push(`worktree ${t.worktree} ещё есть`)
  const dir = existsSync(t.directory) ? t.directory : undefined
  if (dir && t.branch && gitOk(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${t.branch}`])) left.push(`локальная ветка ${t.branch} ещё есть`)
  // ветки и worktree, которые исполнитель завёл сам, а не по письму (замер 2026-10-05: Claude Code создал worktree своим
  // инструментом EnterWorktree с веткой worktree-task-…): всё, что указывает на влитый коммит, кроме целевой ветки
  if (dir && t.merged_head) {
    try {
      for (const b of git(dir, ["for-each-ref", "--points-at", t.merged_head, "--format=%(refname:short)", "refs/heads"]).split(/\r?\n/).map((x) => x.trim()).filter(Boolean))
        if (b !== cfg.targetBranch && b !== t.branch) left.push(`ветка ${b} (на влитом коммите) ещё есть`)
      // блоки «worktree <путь> / HEAD <sha> / branch <ref>», разделённые пустой строкой
      const blocks = git(dir, ["worktree", "list", "--porcelain"]).split(/\r?\n\r?\n/)
      for (const b of blocks) {
        const get = (k: string) => b.split(/\r?\n/).find((l) => l.startsWith(`${k} `))?.slice(k.length + 1)
        const wt = get("worktree")
        const branch = get("branch")?.replace("refs/heads/", "")
        if (wt && get("HEAD") === t.merged_head && branch !== cfg.targetBranch) left.push(`worktree ${wt} (на влитом коммите) ещё есть`)
      }
    } catch {}
  }
  if (dir && t.branch && cfg.cleanup === "local+remote") {
    try {
      if (git(dir, ["ls-remote", "--heads", "origin", t.branch], 20_000).trim()) left.push(`ветка ${t.branch} на origin ещё есть`)
    } catch {} // origin недоступен — проверку remote пропускаем (не держим задачу из-за сети)
  }
  return { ok: !left.length, left }
}

/** Письмо приёмщику. */
export function reviewLetter(t: Task, cfg: PeersConfig): string {
  const steps = cfg.acceptance.length
    ? cfg.acceptance.map((a) => `  ${a.id}${a.required ? " (обязательно)" : ""}: ${a.text}`).join("\n")
    : "  (шаги приёмки в настройках проекта не заданы — проверь критерии задачи)"
  return [
    `ПРИЁМКА задачи #${t.n} «${t.title}» (приоритет ${t.priority}). Ты — приёмщик: проверяешь и вливаешь сам; интегратор принятое не перепроверяет. Автор задачи — ${t.author_role}, исполнитель — сессия ${t.executor}.`,
    `ЦЕЛЬ: ${t.goal}`,
    t.criteria ? `КРИТЕРИИ ПРИЁМКИ: ${t.criteria}` : "",
    t.boundaries ? `ГРАНИЦЫ: ${t.boundaries}` : "",
    t.worktree ? `WORKTREE ИСПОЛНИТЕЛЯ: ${t.worktree}, ветка ${t.branch}; целевая ветка ${cfg.targetBranch}.` : t.branch ? `ВЕТКА: ${t.branch}; целевая ${cfg.targetBranch}.` : `Целевая ветка ${cfg.targetBranch}.`,
    t.report ? `ОТЧЁТ ИСПОЛНИТЕЛЯ:\n${t.report.slice(0, 3000)}` : "",
    `ШАГИ ПРИЁМКИ:\n${steps}`,
    `ПОРЯДОК:`,
    `  1) peer_task {action: "review", n: ${t.n}} — начал приёмку (исполнитель узнает без пробуждения);`,
    `  2) нашёл ошибки — peer_task {action: "rework", n: ${t.n}, text: "что исправить"} (вернётся тебе на повторную приёмку);`,
    `  3) всё зелёное — peer_task {action: "merge", n: ${t.n}} (замок вливания проекта), влей в ${cfg.targetBranch} и запушь, затем`,
    `     peer_task {action: "accept", n: ${t.n}, checks: {${cfg.acceptance.map((a) => `"${a.id}": "чем подтверждено"`).join(", ")}}, commit: "<хэш в ${cfg.targetBranch}, если squash>"};`,
    `  4) плагин сам проверит, что влито, и выдаст шаги очистки; сделал — peer_task {action: "cleaned", n: ${t.n}}.`,
  ]
    .filter(Boolean)
    .join("\n")
}

/** Письмо исполнителю: на доработку. */
export function reworkLetter(t: Task, text: string, by: string): string {
  return [
    `ДОРАБОТКА задачи #${t.n} «${t.title}» (круг ${t.rework ?? 1}) от приёмщика ${by}:`,
    text,
    `Исправь в том же worktree${t.branch ? ` (ветка ${t.branch})` : ""} и сдай снова тем же отчётом: peer_send {to: "${t.author}", reply_to: "${t.qid}", text: "что исправлено, как проверено"}.`,
  ].join("\n")
}

// WORKTREE ЗАДАЧИ СОЗДАЁТ ПЛАГИН (план 006, 2026-10-05). Сессия воркера запускалась в главной копии проекта, а в свой
// worktree воркер переходил командами: хуки и стражи проекта видели ветку main и принимали воркера за интегратора
// (хук Stop nova требовал от него слияний), строка внизу вкладки показывала main. Теперь плагин до запуска сессии
// создаёт worktree и ветку задачи (от целевой ветки) и запускает сессию в нём. Повторный запуск переиспользует готовый
// worktree; не вышло — прежний порядок (сессия в папке проекта, worktree создаёт воркер), задача не падает.
export function ensureWorktree(repoDir: string, worktree: string, branch: string, base: string): { ok: boolean; created: boolean; error?: string } {
  try {
    if (existsSync(worktree)) {
      const head = git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()
      return head === branch ? { ok: true, created: false } : { ok: false, created: false, error: `в ${worktree} ветка ${head}, а не ${branch}` }
    }
    const top = git(repoDir, ["rev-parse", "--show-toplevel"]).trim()
    mkdirSync(path.dirname(worktree), { recursive: true })
    let exists = true
    try {
      git(top, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])
    } catch {
      exists = false
    }
    git(top, exists ? ["worktree", "add", worktree, branch] : ["worktree", "add", "-b", branch, worktree, base], 120_000)
    return { ok: true, created: true }
  } catch (e: any) {
    return { ok: false, created: false, error: String(e?.message ?? e).split("\n")[0].slice(0, 300) }
  }
}
