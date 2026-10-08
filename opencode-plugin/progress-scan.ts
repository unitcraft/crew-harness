// ХОД РАБОТ — ОБХОД ДЕРЕВЬЕВ И ЧТЕНИЕ ЖУРНАЛОВ (задача 004). Находит репозиторий вкладки, его рабочие деревья по реестру
// `.git/worktrees` самого git (без процессов и без настроек плагина), читает `doc/tasks/*/progress.log` байтами и держит кэш
// разобранного. Только чтение: ничего не пишет туда, где наблюдает (DNC-02). Разбор строк и состояний — `progress.ts`.
//
// Нагрузка (REQ-10): обход файловой системы — не чаще WALK_MS на репозиторий; между обходами показ берёт готовый результат без
// доступа к файлам; файл перечитывается, только если пара (время изменения, размер) изменилась; за обход разбирается не больше
// PARSE_BUDGET изменившихся файлов, самые свежие первыми; `scanAll` (команда окна) бюджета не знает.
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { parseJournal, type JournalCopy, type Line, type ScanTask } from "./progress.ts"

/** Обход файловой системы — не чаще раза в 5 секунд на репозиторий; показ из кэша — раз в 2 секунды (progress-view.ts). */
export const WALK_MS = 5_000
/** За один обход разбирается не больше пяти изменившихся журналов. */
export const PARSE_BUDGET = 5
const MAX_REPOS = 8

// путь для сравнения: настоящий путь (короткие имена Windows раскрываются), прямые косые черты, строчные буквы
const norm = (p: string) => {
  let r = path.resolve(p)
  try {
    r = realpathSync.native(r)
  } catch {}
  return r.replace(/\\/g, "/").toLowerCase()
}
const statOf = (p: string) => {
  try {
    return statSync(p, { throwIfNoEntry: false })
  } catch {
    return undefined
  }
}
const readText = (p: string) => {
  try {
    return readFileSync(p, "utf8")
  } catch {
    return undefined
  }
}

export type RepoPlace = {
  /** корень основной копии */
  root: string
  /** общий каталог `.git` (там реестр `worktrees`) */
  commonGit: string
}

/**
 * Корень репозитория вкладки: подъём по родителям каталога вкладки до `.git`. Каталог `.git` значит основную копию; файл
 * `gitdir: …` — связанное дерево, общий `.git` берётся по `commondir`. Пути в `gitdir` и `commondir`, не абсолютные, разрешаются
 * от каталога файла, где они записаны (REQ-02). Нет репозитория — undefined.
 */
export function findRepoRoot(dir: string): RepoPlace | undefined {
  let cur = path.resolve(dir)
  for (;;) {
    const g = path.join(cur, ".git")
    const st = statOf(g)
    if (st?.isDirectory()) return { root: cur, commonGit: g }
    if (st?.isFile()) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(readText(g) ?? "")
      if (m) {
        const gitdir = path.resolve(cur, m[1])
        const c = readText(path.join(gitdir, "commondir"))?.trim()
        let common = c ? path.resolve(gitdir, c) : gitdir
        if (!c && path.basename(path.dirname(gitdir)) === "worktrees") common = path.dirname(path.dirname(gitdir))
        return { root: path.dirname(common), commonGit: common }
      }
    }
    const parent = path.dirname(cur)
    if (parent === cur) return undefined
    cur = parent
  }
}

export type Tree = {
  kind: "main" | "tree"
  /** имя записи в `.git/worktrees`, у основной копии пусто */
  name: string
  root: string
  /** файл `logs/HEAD` дерева: время его изменения — движение ветки (REQ-17) */
  headLog: string
}

/** Основная копия и записи реестра `.git/worktrees` (файл `gitdir` каждой записи), папка которых существует. */
export function listTrees(place: RepoPlace): Tree[] {
  const out: Tree[] = [{ kind: "main", name: "", root: place.root, headLog: path.join(place.commonGit, "logs", "HEAD") }]
  const seen = new Set([norm(place.root)])
  const reg = path.join(place.commonGit, "worktrees")
  let names: string[] = []
  try {
    names = readdirSync(reg)
  } catch {}
  for (const name of names) {
    try {
      const entry = path.join(reg, name)
      const pointer = readText(path.join(entry, "gitdir"))?.trim()
      if (!pointer) continue
      const root = path.dirname(path.resolve(entry, pointer))
      if (seen.has(norm(root)) || !statOf(root)?.isDirectory()) continue
      seen.add(norm(root))
      out.push({ kind: "tree", name, root, headLog: path.join(entry, "logs", "HEAD") })
    } catch {}
  }
  return out
}

/** Название задачи: заголовок `task/message.md` после «# Задание: », иначе имя папки без номера (Д-02). */
export function taskTitle(folder: string, message: string | undefined): string {
  const m = message ? /^# Задание:[ \t]*(.+?)[ \t]*$/m.exec(message) : null
  return m?.[1] ?? (folder.replace(/^[0-9]+-/, "") || folder)
}

export type ScanResult = {
  /** корень основной копии; пусто — вкладка вне репозитория */
  repo?: string
  trees: Tree[]
  /** сколько журналов найдено */
  journals: number
  /** все найденные журналы разобраны (у холодного обхода с бюджетом — нет) */
  complete: boolean
  tasks: ScanTask[]
}

type JournalCache = { mtimeMs: number; size: number; lines: Line[] }
type TitleCache = { mtimeMs: number; size: number; text: string | undefined }
type RepoState = {
  walkedAt: number
  result: ScanResult
  journals: Map<string, JournalCache>
  titles: Map<string, TitleCache>
}

export type ScanStats = {
  walks: number
  /** сколько журналов разобрано за всё время, и какие — за последний обход, по порядку разбора */
  parses: number
  lastParsed: string[]
}

export type Scanner = {
  /** результат для вкладки с каталогом `dir`: не чаще раза в WALK_MS обходит файлы, между обходами отдаёт готовое */
  scan(dir: string, now?: number): ScanResult
  /** то же без бюджета и без паузы между обходами: для команды окна */
  scanAll(dir: string, now?: number): ScanResult
  stats: ScanStats
}

const EMPTY: ScanResult = { trees: [], journals: 0, complete: true, tasks: [] }

export function createScanner(opts: { walkMs?: number; parseBudget?: number } = {}): Scanner {
  const walkMs = opts.walkMs ?? WALK_MS
  const budget = opts.parseBudget ?? PARSE_BUDGET
  const repos = new Map<string, RepoState>()
  const places = new Map<string, { at: number; place: RepoPlace | undefined }>()
  const stats: ScanStats = { walks: 0, parses: 0, lastParsed: [] }

  const walk = (place: RepoPlace, prev: RepoState | undefined, limit: number): RepoState => {
    stats.walks++
    stats.lastParsed = []
    const journals = new Map<string, JournalCache>()
    const titles = new Map<string, TitleCache>()
    const trees = listTrees(place)
    type Found = { tree: Tree; folder: string; file: string; mtimeMs: number; size: number; headMs?: number }
    const found: Found[] = []
    for (const tree of trees) {
      try {
        const head = statOf(tree.headLog)
        const base = path.join(tree.root, "doc", "tasks")
        let entries: string[] = []
        try {
          entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        } catch {}
        for (const folder of entries) {
          try {
            const file = path.join(base, folder, "progress.log")
            const st = statOf(file)
            if (st?.isFile()) found.push({ tree, folder, file, mtimeMs: st.mtimeMs, size: st.size, ...(head ? { headMs: head.mtimeMs } : {}) })
          } catch {}
        }
      } catch {}
    }
    // что изменилось с прошлого обхода: самые свежие файлы первыми, не больше `limit`
    const changed = found.filter((f) => {
      const c = prev?.journals.get(f.file)
      return !c || c.mtimeMs !== f.mtimeMs || c.size !== f.size
    })
    changed.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const parsedNow = new Set<string>()
    for (const f of changed.slice(0, limit)) {
      try {
        // пара (время, размер) снимается до чтения и сверяется после: файл дописывали — разбор повторится на следующем обходе
        const bytes = readFileSync(f.file)
        const after = statOf(f.file)
        stats.parses++
        stats.lastParsed.push(f.file)
        parsedNow.add(f.file)
        if (after && after.mtimeMs === f.mtimeMs && after.size === f.size && bytes.length === f.size) journals.set(f.file, { mtimeMs: f.mtimeMs, size: f.size, lines: parseJournal(bytes) })
        else {
          const old = prev?.journals.get(f.file)
          if (old) journals.set(f.file, old)
        }
      } catch {}
    }
    for (const f of found) {
      if (journals.has(f.file)) continue
      const old = prev?.journals.get(f.file)
      if (old) journals.set(f.file, old) // не дошла очередь разбора — пока старый разбор
    }
    // названия задач — из `task/message.md`, тоже по паре (время, размер)
    const titleOf = new Map<string, string | undefined>()
    for (const f of found) {
      if (titleOf.has(f.folder) && titleOf.get(f.folder) !== undefined) continue
      const mp = path.join(path.dirname(f.file), "task", "message.md")
      const st = statOf(mp)
      if (!st?.isFile()) {
        if (!titleOf.has(f.folder)) titleOf.set(f.folder, undefined)
        continue
      }
      let c = prev?.titles.get(mp)
      if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) c = { mtimeMs: st.mtimeMs, size: st.size, text: readText(mp) }
      titles.set(mp, c)
      titleOf.set(f.folder, c.text)
    }
    const byFolder = new Map<string, Found[]>()
    for (const f of found) byFolder.set(f.folder, [...(byFolder.get(f.folder) ?? []), f])
    const tasks: ScanTask[] = []
    let complete = true
    for (const folder of [...byFolder.keys()].sort()) {
      const copies: JournalCopy[] = []
      let all = true
      for (const f of byFolder.get(folder)!) {
        const c = journals.get(f.file)
        if (!c) {
          all = false
          continue
        }
        copies.push({ kind: f.tree.kind, ...(f.tree.name ? { tree: f.tree.name } : {}), lines: c.lines, mtimeMs: c.mtimeMs, ...(f.headMs !== undefined ? { branchMs: f.headMs } : {}) })
      }
      if (!all) {
        complete = false // задача появляется, когда разобраны все её копии (REQ-03)
        continue
      }
      tasks.push({ folder, title: taskTitle(folder, titleOf.get(folder)), copies })
    }
    return { walkedAt: 0, result: { repo: place.root, trees, journals: found.length, complete, tasks }, journals, titles }
  }

  const run = (dir: string, now: number, all: boolean): ScanResult => {
    try {
      let p = places.get(dir)
      if (all || !p || now - p.at >= walkMs) {
        p = { at: now, place: findRepoRoot(dir) }
        places.set(dir, p)
      }
      if (!p.place) return EMPTY
      const key = norm(p.place.commonGit)
      const prev = repos.get(key)
      if (!all && prev && now - prev.walkedAt < walkMs) return prev.result
      const state = walk(p.place, prev, all ? Infinity : budget)
      state.walkedAt = now
      repos.delete(key)
      repos.set(key, state)
      while (repos.size > MAX_REPOS) repos.delete(repos.keys().next().value as string)
      if (places.size > 64) places.clear()
      return state.result
    } catch {
      return EMPTY
    }
  }

  return {
    scan: (dir, now = Date.now()) => run(dir, now, false),
    scanAll: (dir, now = Date.now()) => run(dir, now, true),
    stats,
  }
}
