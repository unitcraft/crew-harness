// ЗАПРЕТЫ ПРОЕКТА ДЛЯ peer_watch (план 013, п.6). Команду наблюдения запускает плагин в сервере OpenCode — мимо прав
// окна (permissions.deny из `.claude/settings.json`), которые Claude Code сверяет у своего Bash. Без сверки здесь
// peer_watch был обходом: `git reset --hard` или чтение ключа, запрещённые окну, проходили наблюдением. Выбор
// владельца (2026-10-06): сверять с запретами проекта, а не держать свой белый список.
//
// Файл — `.claude/settings.json` от каталога вкладки вверх до корня git (первый найденный; нет — проверки нет;
// не читается — отказ: молча пропустить сломанный файл значило бы снять все запреты). Правила:
//   Bash(<префикс>:*), PowerShell(<префикс>:*) — команда начинается с префикса (`:*` — любое продолжение; `*` внутри —
//     подстановка; без `:*` — команда целиком). Bash и PowerShell сверяются одинаково: запрещена команда, а не оболочка.
//     Голое `Bash` / `PowerShell` — запрещена любая команда.
//   Read(<глоб>), Edit(…), Write(…) и прочие файловые — команда, упоминающая подходящий файл (токены команды как пути).
// Сверяется команда целиком И каждая подкоманда: разделители `&&`, `||`, `;`, `|`, `&`, перевод строки; тело
// `bash -c '…'` / `sh -c "…"` / `eval …` и подстановок `$(…)`, `` `…` `` разбирается так же, рекурсивно.

import { existsSync } from "node:fs"
import path from "node:path"
import { readJson } from "./core.ts"

const SHELL_TOOLS = new Set(["Bash", "PowerShell"])
const PATH_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS"])

export type DenyRules = { file: string; root: string; rules: string[] }
export type DenyHit = { rule: string; part: string }

/** Запреты проекта для каталога dir: `.claude/settings.json` от dir вверх до корня git. Нет файла — undefined;
 *  файл есть, но не читается — { error }. Вне git — только сам dir (выше лежат чужие и личные настройки). */
export function projectDeny(dir: string): DenyRules | { error: string } | undefined {
  let d = path.resolve(dir)
  for (;;) {
    const f = path.join(d, ".claude", "settings.json")
    if (existsSync(f)) {
      const j = readJson<any>(f)
      if (!j || typeof j !== "object") return { error: `${f} не читается как JSON` }
      const deny = j.permissions?.deny
      return { file: f, root: d, rules: Array.isArray(deny) ? deny.filter((r: any) => typeof r === "string") : [] }
    }
    if (existsSync(path.join(d, ".git"))) return undefined // корень git: выше не идём
    const up = path.dirname(d)
    if (up === d || !hasGitAbove(up)) return undefined
    d = up
  }
}
// вне git вверх не ходим: ~/.claude/settings.json — личные настройки, не запреты проекта
function hasGitAbove(dir: string): boolean {
  for (let d = dir; ; ) {
    if (existsSync(path.join(d, ".git"))) return true
    const up = path.dirname(d)
    if (up === d) return false
    d = up
  }
}

// --- разбор команды ---

/** Слова оболочки с учётом кавычек (кавычки снимаются; `\` вне одинарных экранирует). */
export function shellWords(s: string): string[] {
  const out: string[] = []
  let cur = ""
  let has = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") {
      const j = s.indexOf("'", i + 1)
      const end = j < 0 ? s.length : j
      cur += s.slice(i + 1, end)
      has = true
      i = end
    } else if (ch === '"') {
      i++
      for (; i < s.length && s[i] !== '"'; i++) {
        if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) i++
        cur += s[i]
      }
      has = true
    } else if (ch === "\\" && i + 1 < s.length) {
      cur += s[++i]
      has = true
    } else if (/\s/.test(ch)) {
      if (has) out.push(cur)
      cur = ""
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has) out.push(cur)
  return out
}

/** Подкоманды верхнего уровня: разрез по `&&` `||` `;` `|` `&` и переводу строки вне кавычек и подстановок. */
export function splitCommands(s: string): string[] {
  const out: string[] = []
  let cur = ""
  let depth = 0 // $( … ) и ( … )
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1
      while (j < s.length && s[j] !== ch) j += ch !== "'" && s[j] === "\\" ? 2 : 1
      cur += s.slice(i, j + 1)
      i = j
      continue
    }
    if (ch === "\\" && i + 1 < s.length) {
      cur += s.slice(i, i + 2)
      i++
      continue
    }
    if (ch === "(") depth++
    if (ch === ")" && depth > 0) depth--
    if (depth === 0 && (ch === ";" || ch === "\n" || ch === "|" || ch === "&")) {
      // `2>&1`, `>&2`, `&>` — перенаправление, а не разделитель
      if (ch === "&" && (s[i - 1] === ">" || s[i - 1] === "<" || s[i + 1] === ">")) {
        cur += ch
        continue
      }
      if (cur.trim()) out.push(cur.trim())
      cur = ""
      if ((ch === "|" || ch === "&") && s[i + 1] === ch) i++
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Тела подстановок `$(…)` и `` `…` `` (вне одинарных кавычек). */
function substitutions(s: string): string[] {
  const out: string[] = []
  let inSingle = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'") inSingle = !inSingle
    if (inSingle) continue
    if (ch === "$" && s[i + 1] === "(") {
      let depth = 1
      let j = i + 2
      for (; j < s.length && depth; j++) {
        if (s[j] === "(") depth++
        else if (s[j] === ")") depth--
      }
      out.push(s.slice(i + 2, j - 1))
      i = j - 1
    } else if (ch === "`") {
      const j = s.indexOf("`", i + 1)
      if (j < 0) break
      out.push(s.slice(i + 1, j))
      i = j
    }
  }
  return out
}

const LEAD_WORDS = new Set(["then", "do", "else", "elif", "if", "while", "until", "!", "{", "(", "time", "nohup", "command", "exec", "env", "sudo", "builtin"])
const SHELLS = /^(?:.*[\\/])?(?:bash|sh|zsh|dash|ksh)(?:\.exe)?$/i

/** Слова подкоманды без ведущих ключевых слов, присваиваний `X=1` и обёрток (`timeout 60`, `env`, `nohup`); у git —
 *  без глобальных ключей (`-C <дерево>`, `-c k=v`, `--git-dir=…`): `git -C wt reset --hard` — тот же `git reset --hard`. */
export function coreWords(words: string[]): string[] {
  let w = words.map((x) => x.replace(/^[({]+/, "")).filter(Boolean)
  for (;;) {
    if (!w.length) return w
    if (LEAD_WORDS.has(w[0])) w = w.slice(1)
    else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1)
    else if (w[0] === "timeout") {
      w = w.slice(1)
      while (w.length && /^-/.test(w[0])) w = w.slice(/^-(?:s|k)$|^--(?:signal|kill-after)$/.test(w[0]) ? 2 : 1)
      if (w.length && /^\d/.test(w[0])) w = w.slice(1)
    } else break
  }
  while (w.length && /^[)}]+$/.test(w[w.length - 1])) w = w.slice(0, -1)
  if (w.length && /(?:^|[\\/])git(?:\.exe)?$/i.test(w[0])) {
    const out = ["git"]
    let i = 1
    for (; i < w.length; i++) {
      if (w[i] === "-C" || w[i] === "-c" || w[i] === "--git-dir" || w[i] === "--work-tree" || w[i] === "--namespace") i++
      else if (/^--(?:git-dir|work-tree|namespace)=/.test(w[i]) || w[i] === "--no-pager" || w[i] === "-P" || w[i] === "--paginate" || w[i] === "-p" || w[i] === "--bare" || w[i] === "--no-replace-objects" || w[i] === "--literal-pathspecs") continue
      else break
    }
    return [...out, ...w.slice(i)]
  }
  return w
}

/** Все подкоманды для сверки: верхний уровень, тела `bash -c`, `eval`, подстановок — рекурсивно. */
export function commandParts(cmd: string, depth = 0): string[] {
  if (depth > 6) return []
  const out: string[] = []
  for (const part of splitCommands(cmd)) {
    out.push(part)
    for (const sub of substitutions(part)) out.push(...commandParts(sub, depth + 1))
    const w = coreWords(shellWords(part))
    if (!w.length) continue
    if (SHELLS.test(w[0])) {
      const i = w.findIndex((x, k) => k > 0 && /^-[a-z]*c[a-z]*$/i.test(x))
      if (i > 0 && w[i + 1] !== undefined) out.push(...commandParts(w[i + 1], depth + 1))
    } else if (w[0] === "eval" && w.length > 1) out.push(...commandParts(w.slice(1).join(" "), depth + 1))
  }
  return out
}

// --- сверка с правилами ---

const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
const norm = (s: string) => s.trim().replace(/\s+/g, " ")

/** Правило вида `Tool(spec)` или голое `Tool`. */
function parseRule(rule: string): { tool: string; spec?: string } | undefined {
  const m = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\((.*)\))?\s*$/s.exec(rule)
  return m ? { tool: m[1], spec: m[2] } : undefined
}

/** Совпадение строки команды с шаблоном Bash(…): `x:*` — префикс, `*` — подстановка, иначе — целиком. */
export function commandMatches(spec: string, command: string): boolean {
  let s = norm(spec)
  const prefix = s.endsWith(":*")
  if (prefix) s = s.slice(0, -2)
  const re = new RegExp(`^${s.split("*").map(esc).join(".*")}${prefix ? "" : "$"}`)
  return re.test(norm(command))
}

/** Глоб пути → регулярное выражение (`**` — любые каталоги, `*` — в пределах имени, `?` — один знак). */
function globRe(glob: string): RegExp {
  let r = ""
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === "*" && glob[i + 1] === "*") {
      i++
      if (glob[i + 1] === "/") {
        i++
        r += "(?:.*/)?"
      } else r += ".*"
    } else if (ch === "*") r += "[^/]*"
    else if (ch === "?") r += "[^/]"
    else r += esc(ch)
  }
  return new RegExp(`^${r}$`, process.platform === "win32" ? "i" : "")
}

/** Токены команды как пути: слова без перенаправлений (`>f`, `2>f`, `<f`), значения `--k=v` и `K=v`. */
function pathTokens(part: string): string[] {
  const out: string[] = []
  for (const raw of shellWords(part)) {
    const w = raw.replace(/^\d*[<>]+&?/, "")
    if (!w) continue
    out.push(w)
    const eq = w.lastIndexOf("=")
    if (eq >= 0 && eq < w.length - 1) out.push(w.slice(eq + 1))
  }
  return out
}

/** Путь-токен подходит под глоб правила Read(…). `./**\/x`, `**\/x` — x в любом месте (сверяются хвосты пути);
 *  прочие — путь от корня проекта (`./a/b`, `/a/b` — от корня, `//abs` — абсолютный, `~/` — домашний). */
export function pathMatches(spec: string, token: string, root: string, cwd: string, home = process.env.USERPROFILE || process.env.HOME || ""): boolean {
  const slash = (p: string) => p.replace(/\\/g, "/")
  const tok = slash(token)
  const anywhere = /^(?:\.\/)?\*\*\//.exec(spec)
  if (anywhere) {
    const rest = spec.slice(anywhere[0].length)
    const re = globRe(rest)
    const parts = tok.split("/").filter(Boolean)
    const n = rest.split("/").filter(Boolean).length
    for (let k = Math.max(1, n); k <= parts.length; k++) if (re.test(parts.slice(-k).join("/"))) return true
    return false
  }
  let base = root
  let pat = spec
  if (pat.startsWith("//")) {
    base = ""
    pat = pat.slice(1)
  } else if (pat.startsWith("~/")) {
    base = home
    pat = pat.slice(2)
  } else pat = pat.replace(/^\.?\//, "")
  const abs = slash(path.resolve(cwd, tok.startsWith("~/") ? path.join(home, tok.slice(2)) : tok))
  const target = base ? slash(path.relative(base, abs)) : abs
  if (base && (target.startsWith("..") || path.isAbsolute(target))) return false
  return globRe(pat).test(target)
}

/** Первое совпавшее с командой правило: команда целиком и каждая подкоманда. undefined — запретов не задевает. */
export function deniedBy(command: string, rules: string[], root: string, cwd: string): DenyHit | undefined {
  const parts = [command, ...commandParts(command)]
  for (const rule of rules) {
    const r = parseRule(rule)
    if (!r) continue
    if (SHELL_TOOLS.has(r.tool)) {
      if (r.spec === undefined) return { rule, part: command }
      for (const p of parts) {
        if (commandMatches(r.spec, p)) return { rule, part: p }
        const core = coreWords(shellWords(p)).join(" ")
        if (core && commandMatches(r.spec, core)) return { rule, part: p }
      }
    } else if (PATH_TOOLS.has(r.tool) && r.spec) {
      for (const p of parts) for (const t of pathTokens(p)) if (pathMatches(r.spec, t, root, cwd)) return { rule, part: p }
    }
  }
  return undefined
}

/** Сверка команды peer_watch с запретами проекта каталога cwd: текст отказа или undefined (можно). */
export function watchRefusal(command: string, cwd: string): string | undefined {
  const d = projectDeny(cwd)
  if (!d) return undefined
  if ("error" in d) return `Наблюдение не поставлено: файл прав проекта ${d.error} — peer_watch не сверит команду с permissions.deny. Исправь файл.`
  const hit = deniedBy(command, d.rules, d.root, cwd)
  if (!hit) return undefined
  const part = hit.part.length > 200 ? `${hit.part.slice(0, 200)}…` : hit.part
  return `Наблюдение не поставлено: команда совпадает с запретом проекта «${hit.rule}» (permissions.deny в ${d.file})${norm(hit.part) !== norm(command) ? `, подкоманда «${part}»` : ""}. peer_watch запускает команду мимо прав окна, поэтому запреты проекта сверяются здесь; обходить их другой формой команды нельзя.`
}
