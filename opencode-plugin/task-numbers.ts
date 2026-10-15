// ОДНА ЗАДАЧА — ОДИН НОМЕР (задача 058). В проекте с папками задач (ключ tasks_dir, по умолчанию doc/tasks) номер задачи — номер её
// папки NNN-<slug>; запись плагина получает тот же номер. Здесь — всё, что про папки в git: включены ли они, какие номера уже заняты
// (папки во всех рабочих деревьях репозитория, во всех локальных ветках и ветках origin), где лежит папка с номером, и запись новой
// папки на ветку задачи без рабочей копии (основную копию целевой ветки плагин не меняет: она живая, AGENTS.md, пп. 3 и 11).
// Модуль без зависимостей от ядра: его берёт и скрипт агента вне OpenCode (scripts/task-number.mjs).
//
// Номер занимается не здесь, а атомарным созданием файла записи (tasks.ts, createTask, флаг wx): все окна и скрипт пишут в одно
// хранилище, два заведения одного номера не получат.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export const DEFAULT_TASKS_DIR = "doc/tasks"
export const pad3 = (n: number | string) => String(n).padStart(3, "0")
const FOLDER_RE = /^(\d{3,})-(.+)$/

const run = (cwd: string, args: string[], input?: string, env?: NodeJS.ProcessEnv): string =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 64 * 1024 * 1024, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"], ...(input !== undefined ? { input } : {}), ...(env ? { env } : {}) })
const runBuf = (cwd: string, args: string[], input: string): Buffer =>
  execFileSync("git", ["-C", cwd, ...args], { windowsHide: true, timeout: 20_000, maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "ignore"], input })
const tryRun = (cwd: string, args: string[]): string | undefined => {
  try {
    return run(cwd, args)
  } catch {
    return undefined
  }
}

/** Корень рабочей копии каталога dir (основной или связанной) или undefined. */
export function repoTop(dir: string): string | undefined {
  return tryRun(dir, ["rev-parse", "--show-toplevel"])?.trim() || undefined
}

const relOf = (rel: string) => rel.replace(/\\/g, "/").replace(/^\.\/+|\/+$/g, "")

/** Папки задач включены: ключ не пуст и каталог есть в целевой ветке (локальной или на origin). */
export function tasksDirOn(dir: string, rel: string, target: string): boolean {
  const r = relOf(rel ?? "")
  if (!r) return false
  for (const ref of [target, `origin/${target}`]) if (tryRun(dir, ["cat-file", "-t", `${ref}:${r}`])?.trim() === "tree") return true
  return false
}

/** Папка задачи, найденная где-то в репозитории: номер, имя папки и где она лежит (дерево или ветка). */
export type FolderHit = { n: number; name: string; where: string; ref?: string; tree?: string }

/** Рабочие деревья репозитория (основная копия и связанные), по `git worktree list`. */
export function worktreesOf(dir: string): { path: string; branch?: string }[] {
  const out: { path: string; branch?: string }[] = []
  const txt = tryRun(dir, ["worktree", "list", "--porcelain"]) ?? ""
  let cur: { path: string; branch?: string } | undefined
  for (const line of txt.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: path.resolve(line.slice(9).trim()) }
      out.push(cur)
    } else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, "")
  }
  return out
}

/** Имена в сыром объекте дерева git (запись: «режим имя\0» и 20 байт хеша). */
function treeNames(buf: Buffer, start: number, end: number): string[] {
  const names: string[] = []
  let i = start
  while (i < end) {
    const sp = buf.indexOf(0x20, i)
    const nul = buf.indexOf(0, sp)
    if (sp < 0 || nul < 0 || nul >= end) break
    const mode = buf.toString("latin1", i, sp)
    if (mode === "40000") names.push(buf.toString("utf8", sp + 1, nul))
    i = nul + 21
  }
  return names
}

/** Папки задач во всех рабочих деревьях (на диске, включая не закоммиченное) и во всех локальных ветках и ветках origin. */
export function scanFolders(dir: string, rel: string = DEFAULT_TASKS_DIR): FolderHit[] {
  const r = relOf(rel ?? "")
  if (!r) return []
  const hits: FolderHit[] = []
  const add = (name: string, where: string, extra: { ref?: string; tree?: string }) => {
    const m = FOLDER_RE.exec(name)
    if (m) hits.push({ n: Number(m[1]), name, where, ...extra })
  }
  for (const w of worktreesOf(dir)) {
    let names: string[] = []
    try {
      names = readdirSync(path.join(w.path, ...r.split("/")), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {}
    for (const n of names) add(n, `дерево ${w.path}`, { tree: w.path })
  }
  const refs = (tryRun(dir, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes/origin"]) ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.endsWith("/HEAD"))
  if (!refs.length) return hits
  // одним вызовом: какое дерево каталога задач у каждой ветки; вторым — сами деревья (одинаковые читаются один раз)
  let trees: string[] = []
  try {
    trees = run(dir, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], refs.map((x) => `${x}:${r}`).join("\n") + "\n").split(/\r?\n/)
  } catch {
    return hits
  }
  const byTree = new Map<string, string[]>()
  refs.forEach((ref, i) => {
    const [id, type] = (trees[i] ?? "").split(" ")
    if (type !== "tree") return
    byTree.set(id, [...(byTree.get(id) ?? []), ref])
  })
  if (!byTree.size) return hits
  const ids = [...byTree.keys()]
  let raw: Buffer
  try {
    raw = runBuf(dir, ["cat-file", "--batch"], ids.join("\n") + "\n")
  } catch {
    return hits
  }
  let pos = 0
  for (const id of ids) {
    const nl = raw.indexOf(0x0a, pos)
    if (nl < 0) break
    const head = raw.toString("latin1", pos, nl).split(" ")
    const size = Number(head[2])
    const start = nl + 1
    if (head[1] === "tree" && Number.isFinite(size)) {
      const shortRef = (x: string) => x.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "")
      for (const name of treeNames(raw, start, start + size)) for (const ref of byTree.get(id)!) add(name, `ветка ${shortRef(ref)}`, { ref: shortRef(ref) })
      pos = start + size + 1
    } else pos = start + (Number.isFinite(size) ? size + 1 : 0)
  }
  return hits
}

/** Номера папок задач, занятые где-либо в репозитории. */
export function usedNumbers(dir: string, rel: string = DEFAULT_TASKS_DIR): number[] {
  return [...new Set(scanFolders(dir, rel).map((h) => h.n))].sort((a, b) => a - b)
}

/** Где лежит папка задачи с номером n (несколько мест — одна папка в разных копиях; разные имена — повтор номера). */
export function findFolder(dir: string, rel: string, n: number): FolderHit[] {
  return scanFolders(dir, rel).filter((h) => h.n === n)
}

/** Имя папки задачи по номеру и слагу. */
export const folderName = (n: number, slug: string) => `${pad3(n)}-${slug}`

export type CommitResult = { ok: true; commit: string; parent: string } | { ok: false; error: string }

/**
 * Записать файлы на ветку `branch` одним коммитом, не трогая ни одной рабочей копии (временный индекс, commit-tree, update-ref).
 * Ветка есть — коммит поверх её вершины; нет — ветка создаётся от `base`. Подпись — как у `git commit -s`: строка Signed-off-by с
 * именем и адресом из настроек git репозитория (их нет — отказ). Ветка, вынутая в рабочее дерево, не двигается (отказ).
 */
export function commitFiles(dir: string, branch: string, base: string, files: Record<string, string>, message: string): CommitResult {
  const top = repoTop(dir)
  if (!top) return { ok: false, error: `${dir} — не репозиторий git` }
  if (worktreesOf(top).some((w) => w.branch === branch)) return { ok: false, error: `ветка ${branch} уже вынута в рабочее дерево — плагин её не двигает` }
  const name = tryRun(top, ["config", "user.name"])?.trim()
  const email = tryRun(top, ["config", "user.email"])?.trim()
  if (!name || !email) return { ok: false, error: "в настройках git репозитория нет user.name или user.email — подписать коммит нечем" }
  const existing = tryRun(top, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])?.trim()
  const parent = existing || tryRun(top, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`])?.trim()
  if (!parent) return { ok: false, error: `нет ветки ${base}` }
  const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-idx-"))
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, "index"), GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email }
  try {
    run(top, ["read-tree", parent], undefined, env)
    for (const [p, text] of Object.entries(files)) {
      const blob = run(top, ["hash-object", "-w", "--stdin"], text).trim()
      run(top, ["update-index", "--add", "--cacheinfo", `100644,${blob},${p.replace(/\\/g, "/")}`], undefined, env)
    }
    const tree = run(top, ["write-tree"], undefined, env).trim()
    const body = `${message.trim()}\n\nSigned-off-by: ${name} <${email}>\n`
    const commit = run(top, ["commit-tree", tree, "-p", parent, "-F", "-"], body, env).trim()
    run(top, ["update-ref", `refs/heads/${branch}`, commit, existing || "0".repeat(40)])
    return { ok: true, commit, parent }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).split("\n")[0].slice(0, 300) }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** База новой ветки задачи: опубликованная целевая ветка, если она есть, иначе локальная. */
export function baseRef(dir: string, target: string): string {
  return tryRun(dir, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${target}`]) ? `origin/${target}` : target
}

/** Ветка существует (локальная). */
export const branchExists = (dir: string, branch: string) => !!tryRun(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])

/** Создать ветку `branch` на вершине `from`, если её нет (без рабочей копии). */
export function ensureBranch(dir: string, branch: string, from: string): boolean {
  if (branchExists(dir, branch)) return true
  return tryRun(dir, ["branch", "--no-track", branch, from]) !== undefined
}
