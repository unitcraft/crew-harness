// ЧТЕНИЕ ВЕТКИ БЕЗ GIT И РАЗБОР КОМАНД ОБОЛОЧКИ (задача 157). Контроль каталога и ветки окон (branch-guard.ts) идёт на каждом ходе и
// перед каждой командой оболочки, поэтому git-процессов здесь нет: ветка читается из файлов `.git`.
//   основная копия: `<корень>/.git` — папка, в ней HEAD;
//   рабочее дерево: `<корень>/.git` — файл `gitdir: <путь>`, HEAD лежит в `<gitdir>`, общий каталог — файл `<gitdir>/commondir`.
// HEAD: `ref: refs/heads/<ветка>` — ветка; 40 или 64 шестнадцатеричных знака — отсоединённая вершина.
// Команды: из строки оболочки достаются вызовы git с каталогом, в котором каждый из них действует (cd, git -C, --git-dir/--work-tree,
// bash -c), и признак «меняет ветку или историю». Честная граница: произвольный shell (переменные, подстановки, eval строк) не
// разбирается — путь с неразвёрнутой переменной помечается как неизвестный (dir undefined).
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export type Head = {
  /** корень рабочего дерева (настоящий путь) */
  top: string
  gitdir: string
  /** общий каталог репозитория: у основной копии он же gitdir, у дерева — `.git` основной копии */
  common: string
  /** основная копия (а не рабочее дерево) */
  main: boolean
  /** ветка из `ref: refs/heads/…` */
  branch?: string
  /** вершина при отсоединённом HEAD */
  detached?: string
  /** `ref:` на что-то кроме refs/heads */
  ref?: string
}

const real = (p: string): string => {
  try {
    return realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}
/** Ключ пути для сравнения: настоящий путь, прямые косые, без хвостовой косой; на Windows без различия регистра. */
export const fsKey = (p: string): string => {
  const r = real(p).replace(/\\/g, "/").replace(/\/+$/, "")
  return process.platform === "win32" ? r.toLowerCase() : r
}
export const sameTree = (a?: string, b?: string): boolean => !!a && !!b && fsKey(a) === fsKey(b)

const text = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim()
  } catch {
    return undefined
  }
}

/** HEAD и общий каталог репозитория, в котором лежит dir. Не репозиторий или каталога нет — undefined. Не бросает. */
export function readHead(dir: string): Head | undefined {
  try {
    if (!dir || !existsSync(dir)) return undefined
    let d = real(path.resolve(dir))
    for (let i = 0; i < 64; i++) {
      const g = path.join(d, ".git")
      let st: ReturnType<typeof statSync> | undefined
      try {
        st = statSync(g)
      } catch {}
      if (st) return fromGit(d, g, st.isDirectory())
      const up = path.dirname(d)
      if (up === d) return undefined
      d = up
    }
  } catch {}
  return undefined
}

function fromGit(top: string, dotGit: string, isDir: boolean): Head | undefined {
  let gitdir = dotGit
  let common = dotGit
  let main = true
  if (!isDir) {
    const m = /^gitdir:\s*(.+)$/m.exec(text(dotGit) ?? "")
    if (!m) return undefined
    gitdir = path.resolve(top, m[1].trim())
    const cd = text(path.join(gitdir, "commondir"))
    if (cd) {
      common = path.resolve(gitdir, cd)
      main = false
    } else common = gitdir
  }
  const head: Head = { top, gitdir, common: real(common), main }
  const h = text(path.join(gitdir, "HEAD"))
  if (!h) return head
  const ref = /^ref:\s*(.+)$/.exec(h)
  if (ref) {
    const r = ref[1].trim()
    if (r.startsWith("refs/heads/")) head.branch = r.slice("refs/heads/".length)
    else head.ref = r
  } else if (/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(h)) head.detached = h
  return head
}

// ---- команды оболочки

type Tok = { text: string; dynamic: boolean }
const OPEN = Symbol("(")
const CLOSE = Symbol(")")

/** Разбор строки на простые команды: кавычки, экранирование, разделители ; && || | & перевод строки и скобки. */
function tokenize(cmd: string): (Tok[] | typeof OPEN | typeof CLOSE)[] {
  const out: (Tok[] | typeof OPEN | typeof CLOSE)[] = []
  let cur: Tok[] = []
  let word = ""
  let has = false
  let dyn = false
  let q: "" | "'" | '"' = ""
  const endWord = () => {
    if (has) cur.push({ text: word, dynamic: dyn })
    word = ""
    has = false
    dyn = false
  }
  const endCmd = () => {
    endWord()
    if (cur.length) out.push(cur)
    cur = []
  }
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (q === "'") {
      if (c === "'") q = ""
      else word += c
      continue
    }
    if (q === '"') {
      if (c === '"') q = ""
      else if (c === "\\" && i + 1 < cmd.length && /["\\$`\n]/.test(cmd[i + 1])) word += cmd[++i]
      else {
        if (c === "$" || c === "`") dyn = true
        word += c
      }
      continue
    }
    if (c === "'" || c === '"') {
      q = c
      has = true
      continue
    }
    if (c === "\\" && i + 1 < cmd.length) {
      word += cmd[++i]
      has = true
      continue
    }
    if (c === "#" && !has && (i === 0 || /\s/.test(cmd[i - 1]))) {
      while (i < cmd.length && cmd[i] !== "\n") i++
      endCmd()
      continue
    }
    if (c === ";" || c === "&" || c === "|" || c === "\n") {
      endCmd()
      continue
    }
    if (c === "(" || c === ")") {
      endCmd()
      out.push(c === "(" ? OPEN : CLOSE)
      continue
    }
    if (/\s/.test(c)) {
      endWord()
      continue
    }
    if (c === "$" || c === "`") dyn = true
    if (c === "~" && !has) dyn = false
    word += c
    has = true
  }
  endCmd()
  return out
}

export type GitCall = {
  sub: string
  args: string[]
  /** каталог, в котором вызов действует; undefined — не разобрать (переменная, неизвестный cd) */
  dir?: string
  text: string
}

const WRAP = new Set(["sudo", "time", "command", "exec", "nohup", "env", "nice", "then", "do", "else", "if", "while", "until", "!", "{", "}", "builtin"])
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"])

function resolveDir(t: Tok, base: string | undefined): string | undefined {
  if (t.dynamic) return undefined
  let p = t.text
  if (!p) return base
  if (p === "~" || p.startsWith("~/")) p = path.join(os.homedir(), p.slice(1))
  const m = process.platform === "win32" ? /^\/([a-zA-Z])(\/.*)?$/.exec(p) : null
  if (m) p = `${m[1].toUpperCase()}:${m[2] ?? "/"}`
  if (path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p)) return path.resolve(p)
  return base ? path.resolve(base, p) : undefined
}

/** Вызовы git в строке команды оболочки; cwd — каталог, где команда выполняется. Не бросает. */
export function gitCalls(command: unknown, cwd: string): GitCall[] {
  const out: GitCall[] = []
  if (typeof command !== "string" || !command.trim()) return out
  try {
    walk(command, cwd || undefined, out, 0)
  } catch {}
  return out
}

function walk(cmd: string, cwd0: string | undefined, out: GitCall[], depth: number) {
  let cwd = cwd0
  const stack: (string | undefined)[] = []
  for (const item of tokenize(cmd)) {
    if (item === OPEN) {
      stack.push(cwd)
      continue
    }
    if (item === CLOSE) {
      if (stack.length) cwd = stack.pop()
      continue
    }
    const toks = item
    let i = 0
    while (i < toks.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i].text) || WRAP.has(toks[i].text))) i++
    const head = toks[i]?.text
    if (!head) continue
    const name = path.basename(head).replace(/\.exe$/i, "")
    if (name === "cd" || name === "pushd") {
      const a = toks[i + 1]
      cwd = a && a.text !== "-" ? resolveDir(a, cwd) : undefined
      continue
    }
    if (SHELLS.has(name) && depth < 3) {
      const ci = toks.findIndex((t, k) => k > i && /^-[a-z]*c$/.test(t.text))
      if (ci >= 0 && toks[ci + 1]) walk(toks[ci + 1].text, cwd, out, depth + 1)
      continue
    }
    if (name === "eval" && depth < 3) {
      walk(toks.slice(i + 1).map((t) => t.text).join(" "), cwd, out, depth + 1)
      continue
    }
    if (name !== "git") continue
    let dir = cwd
    let gitDir: Tok | undefined
    let workTree: Tok | undefined
    let j = i + 1
    for (; j < toks.length; j++) {
      const t = toks[j].text
      if (t === "-C") {
        const a = toks[j + 1]
        dir = a ? resolveDir(a, dir) : undefined
        j++
      } else if (t === "-c" || t === "--namespace" || t === "--super-prefix") j++
      else if (t === "--git-dir") gitDir = toks[++j]
      else if (t === "--work-tree") workTree = toks[++j]
      else if (t.startsWith("--git-dir=")) gitDir = { text: t.slice(10), dynamic: toks[j].dynamic }
      else if (t.startsWith("--work-tree=")) workTree = { text: t.slice(12), dynamic: toks[j].dynamic }
      else if (t.startsWith("-")) continue
      else break
    }
    const sub = toks[j]?.text
    if (!sub) continue
    if (workTree) dir = resolveDir(workTree, dir)
    else if (gitDir) {
      const g = resolveDir(gitDir, dir)
      dir = g && path.basename(g) === ".git" ? path.dirname(g) : undefined
    }
    out.push({ sub, args: toks.slice(j + 1).map((t) => t.text), dir, text: toks.slice(i).map((t) => t.text).join(" ") })
  }
}

export type Mutation = { kind: "branch" | "history"; /** switch/checkout: на какую ветку */ to?: string }

const HISTORY = new Set(["merge", "cherry-pick", "rebase", "reset", "commit", "pull", "revert", "am"])

/** Меняет ли вызов git ветку или историю. Чтение, пути (`checkout -- файл`, `reset -- файл`), `--abort` — нет. */
export function mutationOf(sub: string, args: string[]): Mutation | undefined {
  if (sub === "checkout" || sub === "switch") {
    if (sub === "checkout" && (args.includes("--") || args.includes("-p") || args.includes("--patch"))) return undefined
    const creates = args.some((a) => /^(-b|-B|-c|-C|--orphan|--detach|-d|--create|--force-create)$/.test(a))
    const pos = args.filter((a) => !a.startsWith("-"))
    if (sub === "checkout" && !creates && (pos[0] === "." || !pos.length)) return undefined
    return { kind: "branch", ...(creates || !pos[0] ? {} : { to: pos[0] }) }
  }
  if (!HISTORY.has(sub)) return undefined
  if (args.includes("--abort") || args.includes("--quit")) return undefined
  if (sub === "reset" && (args.includes("--") || args.includes("-p") || args.includes("--patch"))) return undefined
  if (sub === "commit" && args.includes("--dry-run")) return undefined
  return { kind: "history" }
}

/** Файлы, которые меняет вызов инструмента записи OpenCode (edit, write, multiedit, patch). */
export function writeTargets(tool: string, input: any): string[] {
  if (!input || typeof input !== "object") return []
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    const f = s(input.filePath) || s(input.path) || s(input.file_path)
    return f ? [f] : []
  }
  if (tool === "patch" || tool === "apply_patch") {
    const out: string[] = []
    for (const line of (s(input.patchText) || s(input.patch) || s(input.input)).split(/\r?\n/)) {
      const h = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/.exec(line) ?? /^\*\*\* Move to:\s*(.+?)\s*$/.exec(line)
      if (h && !out.includes(h[1])) out.push(h[1])
    }
    return out
  }
  return []
}
