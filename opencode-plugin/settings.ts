// ПРОЕКТЫ И ИХ НАСТРОЙКИ (план 002, решение №12, 2026-10-05).
//
// Проект бывает виртуальным: C:/work/nova — папка с многими репозиториями, сама не репозиторий. Поэтому
// настройки проекта живут в РЕПОЗИТОРИИ НАСТРОЕК, а не в рабочей папке вкладки:
//   opencode.jsonc:  "options": { "project_settings": ["C:/work/nova/nova-settings", "C:/work/tools"] }
//   <папка>/.opencode/crew-harness.json:  { "project": "nova", "root": "..", ... }
// Папка — любая внутри git-репозитория. Имя проекта — поле "project" (нет — имя папки); корень — "root" от папки
// (нет — сама папка). Файл читается ЗАКОММИЧЕННЫМ из ветки по умолчанию (`git show <ветка>:<путь>`; другая ветка —
// поле "branch"): незакоммиченная правка не действует, worktree и ветки кода на настройки не влияют.
//
// Ключ называется project_settings: он перечисляет папки настроек, а не проекты (задача 089). Прежнее имя `projects` — синоним:
// читается, если project_settings не задан; заданы оба — действует project_settings, crew_doctor говорит о расхождении.
//
// Прежняя форма опций `{ "nova": "C:/work/nova" }` (только под именем `projects`) читается дальше: имя → корень, а настройки — по-старому
// из `.opencode/crew-harness.json` вверх от каталога вкладки (рабочая копия). Старое имя nova-peers.json больше не
// читается (решение №16 плана 002 выполнено: nv-lang перешёл на репозиторий настроек 2026-10-05).
//
// Машинно-зависимое (модели по ступеням) — необязательная поправка в опциях плагина:
//   "options": { "project_settings": [...], "local": { "nova": { "spawn_models": { "light": "kimi/k3" } } } }

import { execFileSync } from "node:child_process"
import { background, gitAsync } from "./async-git.ts"
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { log, safeKey } from "./core.ts"
import { answerNotes } from "./answer-parse.ts"
import { BASE } from "./paths.ts"
import { configDivergence, divergenceProblem } from "./config-diverge.ts"

export const SETTINGS_FILE = path.join(".opencode", "crew-harness.json")
/** прежнее имя файла настроек (до плана 005, 2026-10-06) */
export const LEGACY_SETTINGS_NAME = ".opencode/opencode-peers.json"
export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
// Канонический путь: короткие имена Windows (8.3, `ABCD~1`) раскрываются, чтобы корень проекта и каталог вкладки
// совпадали, в каком бы виде путь ни пришёл; у несуществующего пути — его ближайший существующий предок.
export const canon = (p: string): string => {
  const abs = path.resolve(p)
  try {
    return realpathSync.native(abs)
  } catch {
    const up = path.dirname(abs)
    return up === abs ? abs : path.join(canon(up), path.basename(abs))
  }
}
export const normPath = (p: string) => canon(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()

/** Проект: имя, корень (нормализованный), откуда настройки. */
export type Project = {
  name: string
  /** корень, нормализованный для сравнения (канонический, нижний регистр) */
  root: string
  /** корень как путь (канонический, регистр сохранён) */
  rootPath?: string
  /** папка настроек (новая форма опций); нет — прежняя форма */
  dir?: string
  /** вершина репозитория настроек и путь файла в нём */
  repo?: string
  file?: string
  branch?: string
  /** что не так с этим проектом (для crew_doctor) */
  problems?: string[]
  /** настройки прочитаны из файла с прежним именем — переименовать */
  legacy?: string
}
export type Projects = Project[]

const git = (cwd: string, args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 })

// Чтение настроек — генератор: каждый вызов git он отдаёт наружу (yield [папка, аргументы]) и получает текст или исключение.
// Синхронный водитель гоняет execFileSync (старт, инструменты), асинхронный — gitAsync (обновление в фоне, цикл службы стоять не должен).
type GitCall = [string, string[]]
type GitGen<R> = Generator<GitCall, R, string>

function* defaultBranch(repo: string): GitGen<string> {
  try {
    const head = (yield [repo, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]]).trim() // origin/main
    if (head) return head.replace(/^[^/]+\//, "")
  } catch {}
  for (const b of ["main", "master"])
    try {
      yield [repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`]]
      return b
    } catch {}
  return "main"
}

/** Закоммиченный файл настроек: текст из ветки или undefined. */
function* showCommitted(repo: string, branch: string, file: string): GitGen<string | undefined> {
  try {
    return yield [repo, ["show", `${branch}:${file}`]]
  } catch {
    return undefined
  }
}

const parseJson = (text: string | undefined): any => {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""))
  } catch {
    return null // файл есть, но не JSON
  }
}

// Прочитанные файлы настроек — на несколько секунд (инструменты зовут настройки на каждое письмо, git — процесс).
const CACHE_MS = Number(process.env.CREW_HARNESS_SETTINGS_TTL_MS) || 5_000
const cache = new Map<string, { at: number; value: any }>()
const good = new Map<string, any>() // последние настройки без проблем, по папке

/** Папка настроек → проект (имя, корень, сырые настройки). */
type Folder = { project: Project; raw: any }
function* settingsBody(dir: string): GitGen<Folder> {
  const problems: string[] = []
  let repo: string | undefined
  let file: string | undefined
  let branch: string | undefined
  let legacy: string | undefined
  let raw: any = {}
  try {
    repo = (yield [dir, ["rev-parse", "--show-toplevel"]]).trim()
  } catch {
    problems.push(`папка настроек ${dir} не внутри git-репозитория`)
  }
  if (repo) {
    const prefix = (yield [dir, ["rev-parse", "--show-prefix"]]).trim()
    file = prefix + ".opencode/crew-harness.json" // путь в репозитории
    branch = yield* defaultBranch(repo)
    let j = parseJson(yield* showCommitted(repo, branch, file))
    // прежнее имя файла (до плана 005): читается, crew_doctor просит переименовать
    if (j === undefined) {
      const oldFile = prefix + LEGACY_SETTINGS_NAME
      const o = parseJson(yield* showCommitted(repo, branch, oldFile))
      if (o !== undefined) {
        j = o
        file = oldFile
        legacy = oldFile
      }
    }
    if (j && typeof j.branch === "string" && j.branch && j.branch !== branch) {
      branch = j.branch
      j = parseJson(yield* showCommitted(repo, branch, file))
    }
    if (j === undefined) {
      // файл в рабочей копии есть, а в ветке нет — его просто не закоммитили (claude-limits, 2026-10-07: приёмка
      // проекта сутки не действовала, а самопроверка говорила только «нет файла»)
      const local = [prefix + ".opencode/crew-harness.json", prefix + LEGACY_SETTINGS_NAME].find((f) => existsSync(path.join(repo!, f)))
      problems.push(
        local
          ? `${local} лежит в рабочей копии ${repo}, но не закоммичен в ${branch} — плагин его не читает, настройки по умолчанию; закоммить его в ${branch}${local.endsWith(LEGACY_SETTINGS_NAME) ? ` под именем .opencode/crew-harness.json` : ""}`
          : `в ветке ${branch} репозитория ${repo} нет ${file} — настройки по умолчанию`,
      )
    }
    else if (j === null) problems.push(`${file} в ветке ${branch} — не JSON; настройки по умолчанию`)
    else raw = j
  }
  const name = String(raw.project ?? path.basename(dir)).toLowerCase()
  if (!PROJECT_RE.test(name)) problems.push(`имя проекта «${name}» не годится: строчные латинские буквы, цифры, дефис`)
  const rootAbs = path.resolve(dir, typeof raw.root === "string" && raw.root ? raw.root : ".")
  if (!existsSync(rootAbs)) problems.push(`корень проекта ${name} (${rootAbs}) не существует`)
  let value = { project: { name, root: normPath(rootAbs), rootPath: canon(rootAbs), dir, repo, file, branch, problems, ...(legacy ? { legacy } : {}) }, raw }
  // ПОСЛЕДНИЕ ХОРОШИЕ НАСТРОЙКИ (2026-10-05): под нагрузкой git не ответил — и плагин молча взял умолчания: задача #6
  // nova пошла без worktree и ветки по настройкам, а приёмка решила «очистка не нужна» — ветки и worktree остались.
  // Чтение с проблемой при прежнем чтении без проблем — сбой, а не правка: берём последние хорошие (память, затем
  // диск — для MCP-процессов, они живут один ход) и пишем о сбое в журнал. Чтение без проблем их обновляет.
  const goodFile = path.join(BASE, "settings-good", `${safeKey(dir)}.json`)
  if (!problems.length) {
    good.set(dir, value)
    try {
      mkdirSync(path.dirname(goodFile), { recursive: true })
      writeFileSync(`${goodFile}.tmp`, JSON.stringify(value))
      renameSync(`${goodFile}.tmp`, goodFile)
    } catch {}
  } else {
    let last = good.get(dir)
    if (!last)
      try {
        last = JSON.parse(readFileSync(goodFile, "utf8"))
      } catch {}
    if (last && !last.project?.problems?.length) {
      log(`settings of ${dir}: ${problems.join("; ")} -- using the last good ones`)
      value = last
    }
  }
  return value
}

const sync = <R>(g: GitGen<R>): R => {
  let r = g.next()
  while (!r.done) {
    let out: string | undefined
    let err: unknown
    try {
      out = git(r.value[0], r.value[1])
    } catch (e) {
      err = e ?? new Error("git failed")
    }
    r = err !== undefined ? g.throw(err) : g.next(out!)
  }
  return r.value
}
const async_ = async <R>(g: GitGen<R>): Promise<R> => {
  let r = g.next()
  while (!r.done) {
    let out: string | undefined
    let err: unknown
    try {
      out = await gitAsync(r.value[0], r.value[1], 20_000)
    } catch (e) {
      err = e ?? new Error("git failed")
    }
    r = err !== undefined ? g.throw(err) : g.next(out!)
  }
  return r.value
}

// ФОНОВОЕ ОБНОВЛЕНИЕ (задача 034): чтение настроек — пять-шесть вызовов git подряд, на нагруженной машине секунды, и все они стояли
// поперёк цикла службы (loadConfig зовут шаги прохода). Служба включает режим: устаревшее значение отдаётся сразу, а перечитывается
// оно асинхронно (gitAsync). Первое чтение папки (старт) и инструменты без режима — по-прежнему синхронные.
const refreshing = new Set<string>()

/** Папка настроек → проект (имя, корень, сырые настройки). */
export function readSettingsFolder(folder: string, now = Date.now()): Folder {
  const dir = path.resolve(folder)
  const hit = cache.get(dir)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  if (hit && background.on) {
    if (!refreshing.has(dir)) {
      refreshing.add(dir)
      void async_(settingsBody(dir))
        .then((value) => cache.set(dir, { at: Date.now(), value }))
        .catch(() => {})
        .finally(() => refreshing.delete(dir))
    }
    return hit.value
  }
  const value = sync(settingsBody(dir))
  cache.set(dir, { at: now, value })
  return value
}


/** Основной ключ опций со списком папок настроек (задача 089); `projects` — прежнее имя, синоним. */
export const PROJECT_SETTINGS_KEY = "project_settings"
export const PROJECTS_KEY_OLD = "projects"
const given = (v: unknown) => v !== undefined && v !== null

/** Значение ключа папок настроек: project_settings, а если он не задан — projects. */
export function projectsOption(opt: any): any {
  return given(opt?.[PROJECT_SETTINGS_KEY]) ? opt[PROJECT_SETTINGS_KEY] : opt?.[PROJECTS_KEY_OLD]
}

/** Записи значения ключа для сравнения: список — папки, прежняя форма — «имя: корень». */
const entriesOf = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).map((x) => normPath(x)) : v && typeof v === "object" ? Object.entries(v).map(([n, r]) => `${String(n).toLowerCase()}: ${typeof r === "string" ? normPath(r) : String(r)}`) : []

/** Что сказать врачу о ключах опций: problems — мешают зелёному вердикту, notes — справка низкой важности. */
export function optionKeyLines(opt: any): { problems: string[]; notes: string[] } {
  const problems: string[] = []
  const notes: string[] = []
  const main = opt?.[PROJECT_SETTINGS_KEY]
  const old = opt?.[PROJECTS_KEY_OLD]
  if (given(main) && given(old)) {
    const a = entriesOf(main)
    const b = entriesOf(old)
    const onlyMain = a.filter((x) => !b.includes(x))
    const onlyOld = b.filter((x) => !a.includes(x))
    if (onlyMain.length || onlyOld.length)
      problems.push(
        `в опциях плагина заданы оба ключа, project_settings и projects: действует project_settings, projects игнорируется; расходятся записи${onlyOld.length ? ` — только в projects: ${onlyOld.join(", ")}` : ""}${onlyMain.length ? ` — только в project_settings: ${onlyMain.join(", ")}` : ""}; убери projects из opencode.jsonc`,
      )
    else notes.push(`в опциях плагина заданы оба ключа, project_settings и projects, с одинаковыми записями: действует project_settings, projects игнорируется; убери projects из opencode.jsonc`)
  } else if (given(old) && Array.isArray(old)) notes.push(`ключ projects переименован в project_settings; прежнее имя работает`)
  if (given(main) && !Array.isArray(main)) problems.push(`ключ project_settings — список папок настроек ["<папка с .opencode/crew-harness.json>"]; прежняя форма «имя → корень» работает только под прежним именем projects`)
  return { problems, notes }
}
// Строки врача по последним разобранным опциям (их ставит parseProjects: плагин и MCP-сервер разбирают опции один раз при загрузке).
let optionLines: { problems: string[]; notes: string[] } = { problems: [], notes: [] }
/** Справочные строки врача (низкая важность, не проблема): например, про прежнее имя ключа. */
export const settingsNotes = (): string[] => optionLines.notes

/** Опции плагина → проекты. Новая форма — массив папок настроек; прежняя — объект имя → корень. */
export function parseProjects(opt: any, log: (s: string) => void = () => {}): Projects {
  const out: Projects = []
  optionLines = optionKeyLines(opt)
  const list = projectsOption(opt)
  if (Array.isArray(list)) {
    for (const folder of list) {
      if (typeof folder !== "string" || !folder) continue
      out.push(readSettingsFolder(folder).project)
    }
  } else
    for (const [name, root] of Object.entries(list ?? {})) {
      const n = String(name).toLowerCase()
      if (!PROJECT_RE.test(n) || typeof root !== "string" || !root) {
        log(`project ignored: ${name} -> ${root}`)
        continue
      }
      out.push({ name: n, root: normPath(root), rootPath: canon(root) })
    }
  // проверки, которые видны только по всему списку
  const byName = new Map<string, Project[]>()
  for (const p of out) byName.set(p.name, [...(byName.get(p.name) ?? []), p])
  for (const [n, ps] of byName) if (ps.length > 1) for (const p of ps) (p.problems ??= []).push(`два проекта с именем «${n}»: ${ps.map((x) => x.dir ?? x.root).join(", ")}`)
  return out.sort((a, b) => b.root.length - a.root.length)
}

// ПРОЕКТ ВКЛАДКИ (задача 067, 2026-10-17). Папка вкладки — не проект: интегратор переезжает в рабочие деревья задач (session_move), а
// дерево лежит вне корня проекта, и по префиксу корня проект не находился (`/crew-sets use` отвечал «задан прежней формой опций»).
// Проект ищется так: 1) по имени — карточка вкладки хранит поле project (плагин пишет его сам; у вкладки задачи или приёмки это
// проект задачи, где бы ни лежало дерево); 2) по корню — самый длинный подходящий корень, как раньше; 3) по основной папке
// репозитория: рабочее дерево знает, чьё оно — `git rev-parse --git-common-dir` указывает на `.git` основного репозитория
// (ссылку делает сам git, имя папки дерева не угадывается), и проектом дерева будет проект, в корне которого лежит эта основная папка.
// `git worktree list` даёт то же, но спрашивает репозиторий проекта, а дереву нужен ответ из его собственной папки.
const mainTrees = new Map<string, { at: number; main: string | undefined }>()
const TREE_MISS_MS = 30_000 // «не в репозитории» перепроверяется (папка могла стать репозиторием); найденное не меняется
/** Основная рабочая папка репозитория, к которому подключена папка dir (для основной папки — она сама); нет репозитория — undefined. */
export function mainTreeOf(dir: string, now = Date.now()): string | undefined {
  if (!dir) return undefined
  const key = path.resolve(dir)
  const hit = mainTrees.get(key)
  if (hit && (hit.main || now - hit.at < TREE_MISS_MS)) return hit.main
  let main: string | undefined
  try {
    const common = path.resolve(key, git(key, ["rev-parse", "--git-common-dir"]).trim())
    // основная рабочая папка — над `.git`; у голого репозитория и подмодуля такой папки нет — проекта у них не бывает
    if (path.basename(common).toLowerCase() === ".git") main = canon(path.dirname(common))
  } catch {}
  mainTrees.set(key, { at: now, main })
  return main
}

const rootMatch = (d: string, projects: Projects) => projects.find((p) => d === p.root || d.startsWith(p.root + "/"))

/** Проект вкладки: имя из карточки (name), иначе самый длинный подходящий корень каталога, иначе корень основной папки репозитория каталога. */
export function projectFor(dir: string, projects: Projects, name?: string): Project | undefined {
  const n = typeof name === "string" ? name.trim().toLowerCase() : ""
  if (n) {
    const byName = projects.find((p) => p.name === n)
    if (byName) return byName
  }
  if (!dir) return undefined
  const hit = rootMatch(normPath(dir), projects)
  if (hit) return hit
  const main = mainTreeOf(dir)
  return main ? rootMatch(normPath(main), projects) : undefined
}

/** Каталог dir лежит под корнем проекта p (а не найден по имени или как рабочее дерево вне корня). */
export const inRoot = (dir: string, p: Project): boolean => {
  const d = normPath(dir)
  return d === p.root || d.startsWith(p.root + "/")
}
/** Откуда читать и искать файл настроек прежней формы: сам каталог под корнем, иначе корень проекта (дерево ветки не подменяет основную папку). */
export const legacyBase = (dir: string, p: Project | undefined): string => (p && !inRoot(dir, p) ? (p.rootPath ?? p.root) : dir)

/** Папка вкладки не относится ни к одному проекту плагина: фраза отказа, с маленькой буквы. */
export const outsideProject = (dir: string): string =>
  `папка вкладки ${dir.replace(/\\/g, "/")} не относится к проекту: она вне корней проектов плагина (opencode.jsonc) и не рабочее дерево репозитория проекта — открой вкладку в папке проекта или в рабочем дереве его задачи`

/** Сырые настройки проекта: файл из репозитория настроек (+ локальная поправка) или прежний поиск вверх от каталога. */
export function rawSettingsFor(dir: string, projects: Projects, local: Record<string, any> = {}, name?: string): any {
  const p = projectFor(dir, projects, name)
  let raw: any
  if (p?.dir) raw = readSettingsFolder(p.dir).raw
  else raw = legacyWalk(legacyBase(dir, p))
  const over = p ? local[p.name] : undefined
  return over && typeof over === "object" ? { ...raw, ...over } : raw
}

// Прежняя форма: `.opencode/crew-harness.json` вверх от каталога вкладки, рабочая копия.
// Битый файл (не JSON) молча давал пустые настройки, и защитные ключи (merge_precheck: required и др.) выключались без
// сообщения (задача 006): теперь берутся последние хорошие настройки этого файла, а о файле пишется в журнал и в crew_doctor.
const legacyGood = new Map<string, any>()
const legacyBroken = new Map<string, string>() // файл → когда замечен битым
function legacyFile(dir: string): string | undefined {
  let d = dir ? path.resolve(dir) : ""
  for (let i = 0; d && i < 32; i++) {
    const f = path.join(d, SETTINGS_FILE)
    if (existsSync(f)) return f
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return undefined
}
function legacyWalk(dir: string): any {
  const f = legacyFile(dir)
  if (!f) return {}
  try {
    const raw = JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""))
    legacyGood.set(f, raw)
    legacyBroken.delete(f)
    return raw
  } catch {
    const last = legacyGood.get(f)
    if (!legacyBroken.has(f)) log(`settings file ${f} is not valid JSON -- ${last ? "using the last good settings" : "defaults"}`)
    legacyBroken.set(f, new Date().toISOString())
    return last ?? {}
  }
}
/** Битые файлы настроек прежней формы (проекты без репозитория настроек): проверка на месте, для crew_doctor. */
function legacyProblems(projects: Projects): string[] {
  const out: string[] = []
  for (const p of projects) {
    if (p.dir) continue
    const f = legacyFile(p.rootPath ?? p.root)
    if (!f) continue
    try {
      JSON.parse(readFileSync(f, "utf8").replace(/^﻿/, ""))
    } catch {
      out.push(`проект ${p.name}: ${f} — не JSON; ${legacyGood.has(f) ? "действуют последние хорошие настройки" : "настройки по умолчанию, защитные ключи (merge_precheck и др.) не заданы"}; исправь файл`)
    }
  }
  return out
}

/** Файл настроек в рабочей копии папки настроек (то, что правит crew_config set; действует после коммита). */
export function workingSettings(folder: string): { file: string; raw: any } {
  const file = path.join(path.resolve(folder), SETTINGS_FILE)
  let raw: any = {}
  try {
    raw = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
  } catch {}
  return { file, raw: raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {} }
}

/** Записать ключи в рабочую копию (null — удалить ключ); остальное в файле не трогается. Без BOM, атомарно. */
export function writeSettings(folder: string, values: Record<string, any>): string {
  const { file, raw } = workingSettings(folder)
  for (const [k, v] of Object.entries(values)) {
    if (v === null) delete raw[k]
    else raw[k] = v
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n")
  renameSync(tmp, file)
  cache.delete(path.resolve(folder))
  return file
}

/** Проблемы настроек всех проектов (crew_doctor). Вложенные корни — не проблема: вложенный проект побеждает. */
/** Текст шага приёмки пересказывает порядок приёмки: «под замком» рядом с CI/land/посадка/гейт или «замок вливания» рядом с CI. */
const describesAcceptanceOrder = (text: unknown) => {
  const t = typeof text === "string" ? text : ""
  return /под замком[^.]{0,80}(ci|land|посадк|гейт)|(ci|land|посадк|гейт)[^.]{0,80}под замком|замок вливания[^.]{0,80}ci|ci[^.]{0,80}замок вливания/i.test(t)
}

/** Определены ли модели воркеров проекта (задача 033): включён набор профилей, либо заданы spawn_models, либо явно разрешены значения по умолчанию. */
export function modelsDefined(raw: any): boolean {
  if (raw?.allow_default_models === true) return true
  if (typeof raw?.profile_set === "string" && raw.profile_set.trim()) return true
  const sm = raw?.spawn_models
  return !!sm && typeof sm === "object" && Object.values(sm).some((v) => typeof v === "string" && v)
}
export function unconfiguredLine(name: string): string {
  return `проект ${name} не настроен: модели`
}

export function settingsProblems(projects: Projects, local: Record<string, any> = {}): string[] {
  const out = [...optionLines.problems, ...projects.flatMap((p) => p.problems ?? [])]
  for (const p of projects) if (p.legacy) out.push(`проект ${p.name}: настройки в файле с прежним именем ${p.legacy} — переименуй в .opencode/crew-harness.json (git mv) и закоммить`)
  // настройка, которая не может сработать: ключ gate в answer_mode, режим agent, неверный answer_max (задача 007)
  for (const p of projects) {
    if (!p.dir) continue
    const raw = readSettingsFolder(p.dir).raw
    for (const n of answerNotes(raw?.answer_mode, raw?.answer_max, raw?.answer_delay_sec)) out.push(`проект ${p.name}: ${n}`)
    // шаги приёмки — один источник (задача 027): и файл Канона, и тексты в настройках — ошибка; плагин берёт файл
    if (typeof raw?.acceptance_file === "string" && raw.acceptance_file.trim() && Array.isArray(raw?.acceptance) && raw.acceptance.length)
      out.push(`проект ${p.name}: шаги приёмки заданы и файлом Канона, и текстами в настройках: оставь один источник — acceptance_file`)
    // порядок приёмки задаёт плагин (merge_precheck); текст шага, пересказывающий старый порядок, устареет — только предупреждение
    if (raw?.merge_precheck !== "off" && Array.isArray(raw?.acceptance))
      for (const a of raw.acceptance) if (a && typeof a.id === "string" && describesAcceptanceOrder(a.text)) out.push(`проект ${p.name}: шаг ${a.id} описывает порядок приёмки, он задаётся плагином (crew_help, ПРИЁМКА): оставь в шаге только проектные команды и критерии`)
  }
  // расхождение файла рабочей копии с целевой веткой (задача 029): предупреждение, действуют настройки ветки
  for (const p of projects) {
    if (!p.dir) continue
    const w = divergenceProblem(p.name, configDivergence(p.repo, p.file, p.branch))
    if (w) out.push(w)
  }
  out.push(...legacyProblems(projects))
  // проект без определённых моделей: crew_spawn откажет (задача 033)
  for (const p of projects) {
    if (p.problems?.length) continue // нет читаемых настроек — об этом уже сказано выше
    if (!modelsDefined(rawSettingsFor(p.rootPath ?? p.root, projects, local))) out.push(`${unconfiguredLine(p.name)} (нет profile_set, spawn_models и allow_default_models: crew_spawn откажет; crew_config {action: "apply_template"} или crew_config guide)`)
  }
  const old = projects.filter((p) => !p.dir).map((p) => p.name)
  if (old.length) out.push(`проекты ${old.join(", ")} заданы прежней формой опций (имя → корень); новая — список папок настроек: "project_settings": ["<папка с .opencode/crew-harness.json>"], файл называет проект и root (doc/archive/plans/002-tasks.md, «Где живут настройки проекта»)`)
  return [...new Set(out)]
}
