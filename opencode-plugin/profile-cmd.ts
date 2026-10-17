// КОМАНДЫ ОКНА /crew-sets И /crew-profiles (задача 003, ADR-0008, заменён ADR-0014). Правят профили и наборы прямо в файле проекта
// (рабочая копия папки настроек, profile-layer.ts): СРАЗУ и атомарно, без коммита и без промежуточного слоя; `use` включает набор
// (пишет profile_set), `check` проверяет. Ответ — текст для окна без хода модели. Правка, делающая включённый набор недопустимым
// или создающая повисшую ссылку, отклоняется целиком (файл не тронут). Единственная точка журнала правок — commitEdit.

import * as L from "./profile-layer.ts"
import * as P from "./profiles.ts"

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const words = (t: string): string[] => String(t ?? "").trim().split(/\s+/).filter(Boolean)
const show = (v: any): string => (v === undefined || v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v))

/** Каталог моделей OpenCode, если запрос удался (подсказка для use и check, не условие работы). */
export type CmdDeps = {
  catalog?: () => Promise<{ providerID: string; modelID: string; limit?: { context?: number; input?: number; output?: number } }[] | undefined>
  /** версия OpenCode — check печатает её (чтение цепочки настроек может разойтись при смене версии) */
  version?: string
  /** команда вызвана из окна: тексты называют пункты меню */
  window?: boolean
  /** откуда каталог (снимок плагина сервиса и его возраст) — check печатает строкой; причина, если каталога нет */
  catalogNote?: string
  catalogWhy?: string
}

export const SETS_VERBS = ["ls", "show", "use", "off", "set", "unset", "new", "rename", "delete", "check"]
export const PROFILES_VERBS = ["ls", "show", "set", "new", "rename", "delete", "check"]
/** Глаголы прежнего локального слоя: убраны вместе со слоем (ADR-0014); на них — короткий ответ, а не «неизвестный глагол». */
const GONE_VERBS = ["save", "reset"]

const refused = (project: string, command: string, why: string): string => {
  L.logRefused(project, command, why)
  return `Не сделано: ${why}. Данные не тронуты.`
}
const usageLine = (cmd: "sets" | "profiles"): string =>
  cmd === "sets"
    ? `Глаголы /crew-sets: ${verbUsageList("sets")}. Этапы: develop, develop_accept, plan, plan_accept, spec, spec_accept, delivery, delivery_accept (прежнее accept — то же, что develop_accept; или русские: разработка, приёмка, планирование, приёмка-плана, разбор, приёмка-разбора, сдача, приёмка-сдачи). Без аргумента — таблица наборов.`
    : `Глаголы /crew-profiles: ${verbUsageList("profiles")}. Без аргумента — таблица справочника.`
/** В окне команды — пункты меню, а не набираемые слова: тексты ссылаются на пункт меню, слэш-форма остаётся записью для памяти. */
let windowMenu = false
const ref = (slash: string, item: string): string => (windowMenu ? `пункт «${item}» меню ${slash.split(" ")[0]} (${slash})` : slash)

/** Единственный вызывающий журнал правок: ровно одна строка на каждую успешную правку любого глагола (use — тоже). */
export function commitEdit(project: string, command: string, what: string, from: any, to: any) {
  L.logEdit(project, command, what, from, to)
}

type Mutation = { what: string; from?: any; to?: any } | { refuse: string }
type MutateCtx = { draft: L.Draft; data: P.Data; name?: string; project: string }

/**
 * Правка файла проекта с проверкой допустимости (REQ-28, REQ-34): новые ошибки включённого набора и новые повисшие ссылки любых
 * наборов — отказ целиком. Мутация меняет черновик (копию действующих данных); принятая правка пишется в файл проекта одной
 * атомарной записью, снимок и файлы окон пересчитываются сразу.
 */
export function applyEdit(dir: string, command: string, mutate: (c: MutateCtx) => Mutation): { ok: boolean; text: string; what?: string } {
  const ps = L.profileState(dir)
  const draft = L.draftOf(ps)
  const m = mutate({ draft, data: ps.data, name: ps.name, project: ps.project })
  if ("refuse" in m) return { ok: false, text: refused(ps.project, command, m.refuse) }
  const next = { data: { profiles: draft.profiles, sets: draft.sets } as P.Data, name: draft.name }
  // состояние после правки не должно стать хуже: из строк 1, 2, 7 (нет набора, допустим, имя игнорируется) — в 3…6 (REQ-28, REQ-33)
  const rowAfter = P.stateRow(next.name, next.data, ps.snapshot)
  if ([1, 2, 7].includes(ps.state.row) && [3, 4, 5, 6].includes(rowAfter.row)) return { ok: false, text: refused(ps.project, command, rowAfter.message || `правка сделала бы набор «${next.name}» недоступным`) }
  const before = P.checkData(ps.data, ps.name)
  const after = P.checkData(next.data, next.name)
  const known = new Set([...before.errors, ...before.warnings].map((x) => x.text))
  const created = [...after.errors, ...after.warnings].filter((x) => !known.has(x.text))
  if (created.length) return { ok: false, text: refused(ps.project, command, created.map((x) => x.text).join("; ")) }
  const w = L.writeDraft(ps, draft)
  if (!w.ok) return { ok: false, text: refused(ps.project, command, w.error) }
  L.syncSnapshot(dir)
  const files = L.syncProjectFiles(dir)
  commitEdit(ps.project, command, m.what, m.from, m.to)
  const note = files.written.length || files.removed.length ? `
Файлы окон в деревьях задач: записано ${files.written.length}, снято ${files.removed.length}.` : ""
  return { ok: true, text: `Готово: ${m.what}. Без коммита.${note}`, what: m.what }
}

const cellsString = (set: any): string =>
  P.cellsOf(set)
    .map(([st, c]) => `${st}=${P.cellText(c)}`)
    .join(", ") || "(пусто)"

// ---------------------------------------------------------------------------------------------------------------------
// /crew-sets: глаголы правки

function setNames(data: P.Data): string[] {
  return Object.keys(isObj(data.sets) ? data.sets : {}).sort()
}
const listSets = (data: P.Data) => (setNames(data).length ? setNames(data).join(", ") : "наборов нет")

export function setsEditVerb(dir: string, verb: string, args: string[]): { ok: boolean; text: string } | undefined {
  const ps = L.profileState(dir)
  const command = `crew-sets ${verb}`
  const bad = (why: string) => ({ ok: false, text: refused(ps.project, command, why) })
  switch (verb) {
    case "set": {
      if (args.length !== 3) return bad("нужно: set <имя> <этап> <семья>/<ступень>")
      const [name, stageWord, cellWord] = args
      const st = P.stageOfWord(stageWord)
      if (!st) return bad(`этап «${stageWord}» не годится: ${P.STAGES_TEXT} (или русские названия)`)
      const cell = P.parseCell(cellWord)
      if (typeof cell === "string") return bad(cell)
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)}); новый — /crew-sets new ${name}`)
      return applyEdit(dir, command, ({ draft, data }) => (L.dSetCell(draft, name, st, cell), { what: `набор «${name}»: этап «${P.STAGE_RU[st]}» — ${P.cellText(cell)}${P.rawCell((data.sets as any)[name], st) ? ` (было ${P.cellText(P.rawCell((data.sets as any)[name], st))})` : ""}`, from: P.rawCell((data.sets as any)[name], st) ? P.cellText(P.rawCell((data.sets as any)[name], st)) : undefined, to: P.cellText(cell) }))
    }
    case "unset": {
      if (args.length !== 2) return bad("нужно: unset <имя> <этап>")
      const [name, stageWord] = args
      const st = P.stageOfWord(stageWord)
      if (!st) return bad(`этап «${stageWord}» не годится: ${P.STAGES_TEXT} (или русские названия)`)
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)})`)
      if (!P.rawCell((ps.data.sets as any)[name], st)) return bad(`у набора «${name}» этап «${P.STAGE_RU[st]}» и так не описан`)
      return applyEdit(dir, command, ({ draft, data }) => (L.dSetCell(draft, name, st, null), { what: `набор «${name}»: этап «${P.STAGE_RU[st]}» убран (модель — по spawn_models)`, from: P.cellText(P.rawCell((data.sets as any)[name], st)), to: undefined }))
    }
    case "new": {
      if (!args.length || (args.length !== 1 && !(args.length === 3 && args[1] === "from"))) return bad("нужно: new <имя> [from <другой набор>]")
      const name = args[0]
      const e = P.invalidSetName(name)
      if (e) return bad(e)
      if (isObj(ps.data.sets?.[name])) return bad(`набор «${name}» уже есть`)
      let cells: Record<string, P.Cell> = {}
      if (args.length === 3) {
        const other = (ps.data.sets as any)?.[args[2]]
        if (!isObj(other)) return bad(`набора «${args[2]}» нет (есть: ${listSets(ps.data)})`)
        for (const [st, c] of P.cellsOf(other)) cells[st] = c
      }
      return applyEdit(dir, command, ({ draft }) => (L.dNewSet(draft, name, cells), { what: args.length === 3 ? `создан набор «${name}» как копия «${args[2]}»` : `создан пустой набор «${name}»`, from: undefined, to: cellsString(cells) }))
    }
    case "rename": {
      if (args.length !== 2) return bad("нужно: rename <имя> <новое>")
      const [a, b] = args
      const e = P.invalidSetName(b)
      if (e) return bad(e)
      if (!isObj(ps.data.sets?.[a])) return bad(`набора «${a}» нет (есть: ${listSets(ps.data)})`)
      if (isObj(ps.data.sets?.[b])) return bad(`набор «${b}» уже есть`)
      return applyEdit(dir, command, ({ draft, data, name }) => {
        const cells: Record<string, P.Cell> = {}
        for (const [st, c] of P.cellsOf((data.sets as any)[a])) cells[st] = c
        L.dNewSet(draft, b, cells)
        L.dDeleteSet(draft, a)
        if (name === a) draft.name = b
        return { what: `набор «${a}» переименован в «${b}»${name === a ? " (включённое имя перенесено на новое; других ссылок на набор нет)" : " (других ссылок на набор нет)"}`, from: a, to: b }
      })
    }
    case "delete": {
      if (args.length !== 1) return bad("нужно: delete <имя>")
      const name = args[0]
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)})`)
      if (ps.name === name) return bad(`набор «${name}» включён: сначала включи другой (use)`)
      return applyEdit(dir, command, ({ draft, data }) => (L.dDeleteSet(draft, name), { what: `набор «${name}» удалён`, from: cellsString((data.sets as any)[name]), to: undefined }))
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// /crew-profiles: глаголы правки

function parseProfileArgs(args: string[]): P.Profile | string {
  // <модель> <context> output=<n> [input=<n>]
  const [model, ctxWord, ...rest] = args
  if (!model || !ctxWord) return "нужно: set <семья> <ступень|all> <модель> <context> output=<n> [input=<n>]"
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN)
  const p: P.Profile = { model, context: num(ctxWord) }
  for (const w of rest) {
    const vm = /^variant=(\S+)$/.exec(w)
    if (vm) {
      p.variant = vm[1]
      continue
    }
    const m = /^(output|input)=(\d+)$/.exec(w)
    if (!m) return `лишний аргумент «${w}»: после context идут output=<n>, необязательные input=<n> и variant=<вариант>`
    ;(p as any)[m[1]] = Number(m[2])
  }
  if (p.output === undefined) return "нужен output=<n> (предел вывода: без него OpenCode отбросит запись окна целиком)"
  if (model !== "" && Number.isNaN(p.context)) return `context «${ctxWord}» — не целое число`
  return p
}
/** Наборы, ссылающиеся на семью (и ступень), — для запрета удаления. */
export function referencing(data: P.Data, family: string, tier?: string): string[] {
  const out: string[] = []
  for (const [name, set] of Object.entries(isObj(data.sets) ? data.sets : {}))
    for (const [st, c] of P.cellsOf(set)) {
      if (c.family !== family) continue
      if (!tier || c.tier === "task" || c.tier === tier) out.push(`«${name}» (этап «${P.STAGE_RU[st]}», ${P.cellText(c)})`)
    }
  return out
}

export function profilesEditVerb(dir: string, verb: string, args: string[]): { ok: boolean; text: string } | undefined {
  const ps = L.profileState(dir)
  const command = `crew-profiles ${verb}`
  const bad = (why: string) => ({ ok: false, text: refused(ps.project, command, why) })
  const fams = (data: P.Data) => Object.keys(isObj(data.profiles) ? data.profiles : {}).sort()
  const listFams = (data: P.Data) => (fams(data).length ? fams(data).join(", ") : "справочник пуст")
  switch (verb) {
    case "set": {
      if (args.length < 4) return bad("нужно: set <семья> <ступень|all> <модель> <context> output=<n> [input=<n>]")
      const [family, tierWord, ...rest] = args
      const fe = P.invalidFamilyName(family)
      if (fe) return bad(fe)
      const tiers = tierWord === "all" ? [...P.PROFILE_TIERS] : P.isPTier(tierWord) ? [tierWord] : undefined
      if (!tiers) return bad(`ступень «${tierWord}» не годится: heavy, medium, light или all`)
      const p = parseProfileArgs(rest)
      if (typeof p === "string") return bad(p)
      const e = P.invalidProfile(p, `${family}/${tierWord}`)
      if (e) return bad(e)
      return applyEdit(dir, command, ({ draft, data }) => {
        for (const t of tiers) L.dSetProfile(draft, family, t, p)
        const old = tiers.map((t) => (data.profiles as any)?.[family]?.[t]).filter(Boolean)
        return { what: `профиль ${family}/${tierWord}: ${P.modelText(p)}, ${limitsText(p as any)}${tiers.length > 1 ? " (все три ступени разом)" : ""}`, from: old.length ? old.map((x: any) => `${x.model} ${x.context}`).join("|") : undefined, to: `${p.model} ${p.context}` }
      })
    }
    case "new": {
      if (!args.length || (args.length !== 1 && !(args.length === 3 && args[1] === "from"))) return bad("нужно: new <семья> [from <другая семья>]")
      const family = args[0]
      const fe = P.invalidFamilyName(family)
      if (fe) return bad(fe)
      if (isObj(ps.data.profiles?.[family])) return bad(`семья «${family}» уже есть`)
      let src: any
      if (args.length === 3) {
        src = (ps.data.profiles as any)?.[args[2]]
        if (!isObj(src)) return bad(`семьи «${args[2]}» нет (есть: ${listFams(ps.data)})`)
      }
      return applyEdit(dir, command, ({ draft }) => {
        for (const t of P.PROFILE_TIERS) L.dSetProfile(draft, family, t, src?.[t] ?? { model: "" })
        return { what: src ? `создана семья «${family}» как копия «${args[2]}»` : `создана семья «${family}» из трёх пустых записей («заполнить»: /crew-profiles set ${family} all <модель> <context> output=<n>)`, from: undefined, to: src ? args[2] : "3 пустых" }
      })
    }
    case "rename": {
      if (args.length !== 2) return bad("нужно: rename <семья> <новое>")
      const [a, b] = args
      const fe = P.invalidFamilyName(b)
      if (fe) return bad(fe)
      if (!isObj(ps.data.profiles?.[a])) return bad(`семьи «${a}» нет (есть: ${listFams(ps.data)})`)
      if (isObj(ps.data.profiles?.[b])) return bad(`семья «${b}» уже есть`)
      return applyEdit(dir, command, ({ draft, data }) => {
        for (const t of P.PROFILE_TIERS) {
          const p = (data.profiles as any)[a][t]
          if (p) {
            L.dSetProfile(draft, b, t, p)
            L.dSetProfile(draft, a, t, null)
          }
        }
        let refs = 0
        for (const [name, set] of Object.entries(isObj(data.sets) ? data.sets : {}))
          for (const [st, c] of P.cellsOf(set))
            if (c.family === a) {
              L.dSetCell(draft, name, st, { family: b, tier: c.tier })
              refs++
            }
        return { what: `семья «${a}» переименована в «${b}»; ссылок в наборах обновлено: ${refs}`, from: a, to: b }
      })
    }
    case "delete": {
      if (args.length < 1 || args.length > 2) return bad("нужно: delete <семья> [<ступень>]")
      const [family, tier] = args
      if (!isObj(ps.data.profiles?.[family])) return bad(`семьи «${family}» нет (есть: ${listFams(ps.data)})`)
      if (tier !== undefined && !P.isPTier(tier)) return bad(`ступень «${tier}» не годится: heavy, medium, light`)
      if (tier !== undefined && !(ps.data.profiles as any)[family][tier]) return bad(`у семьи «${family}» нет записи «${tier}»`)
      const refs = referencing(ps.data, family, tier)
      if (refs.length) return bad(`на ${tier ? `запись ${family}/${tier}` : `семью «${family}»`} ссылаются наборы: ${refs.join("; ")}; сначала поправь набор`)
      return applyEdit(dir, command, ({ draft, data }) => {
        for (const t of tier ? [tier] : P.PROFILE_TIERS) if ((data.profiles as any)[family][t]) L.dSetProfile(draft, family, t, null)
        return { what: tier ? `запись ${family}/${tier} удалена` : `семья «${family}» удалена`, from: tier ?? family, to: undefined }
      })
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Показ, use, check, разбор команд (шаг 11)

import path from "node:path"
import { readdirSync } from "node:fs"
import { BASE, PROFILES_README_URL } from "./paths.ts"
import { DEFAULT_SPAWN_MODELS, LIMIT_RU, VIEW_GONE, fmtTokens, limitsText, loadConfig, readJson, settingsContext, verbUsageList } from "./core.ts"
import { projectFor } from "./settings.ts"
import { listTasks, taskNo } from "./tasks.ts"
import * as W from "./profile-windows.ts"

const STAGE_ORDER = P.CORE_STAGES
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].length))
const fileName = (f: string) => path.resolve(f).replace(/\\/g, "/")
const winOf = (p: any): P.Win => ({ context: Number(p.context), output: Number(p.output), ...(p.input !== undefined ? { input: Number(p.input) } : {}) })

/** Основная папка проекта: там идут сессии приёмки и вкладки владельца (окно профиля там не применяется). */
function mainFolder(dir: string): string {
  const { projects } = settingsContext()
  return projectFor(dir, projects)?.rootPath ?? dir
}
/** Окна моделей набора, по которому идут сессии сейчас (пусто — набор не применяется). */
function windowsOfActive(ps: L.PState): Map<string, P.Win> {
  const u = ps.state.usable
  return u && ps.state.row !== 6 ? P.windowsOfSet(u.data, u.name).models : new Map()
}
const fieldsText = (f: W.WindowFields): string =>
  (["context", "input", "output"] as const)
    .filter((k) => f[k])
    .map((k) => `${LIMIT_RU[k]} ${fmtTokens(f[k]!.value)}`)
    .join(" · ") || "контекст в файлах настроек не задан"
/** Окно модели по рукописным и общим настройкам папки как P.Win (если записаны context и output). */
function chainAsWin(dir: string, model: string): P.Win | undefined {
  const f = W.chainWindow(dir, model, { skipOurs: true })
  return f.context && f.output ? { context: f.context.value, output: f.output.value, ...(f.input ? { input: f.input.value } : {}) } : undefined
}

/** Строка про окно модели в основной папке (приёмка и вкладки владельца). */
function reviewerWindowLine(root: string, model: string): string {
  const f = W.chainWindow(root, model, { skipOurs: true })
  const src = f.context ? ` (${fileName(f.context.file)})` : ""
  return `контекст профиля здесь не применяется (приёмка идёт в основной папке): модель ${model} берёт контекст из рукописных и глобальных настроек: ${fieldsText(f)}${src}`
}

/** Метки ядра набора по четырём этапам: «модель» этапа (для task — модели трёх ступеней через «/»), этапы с одной меткой — в группе. */
function setGroups(ps: L.PState, n: string, shorts: Map<string, string>): { label: string; stages: string[] }[] {
  const out: { label: string; stages: string[] }[] = []
  for (const r of gridOf(ps, (ps.data.sets as any)[n]).filter((x) => (STAGE_ORDER as readonly string[]).includes(x.st))) {
    const label = !r.eff || !r.cols ? "spawn_models" : [...new Set(r.cols.map((c) => (c.key ? shorts.get(c.key)! : "нет профиля")))].join("/")
    const g = out.find((x) => x.label === label)
    if (g) g.stages.push(P.STAGE_RU[r.st])
    else out.push({ label, stages: [P.STAGE_RU[r.st]] })
  }
  return out
}
/** Модели ядра всех наборов в порядке появления: ключ «провайдер/id#вариант» → профиль (для коротких имён и расшифровки). */
function modelsOfSets(ps: L.PState, names: string[]): { keys: string[]; first: Map<string, any> } {
  const keys: string[] = []
  const first = new Map<string, any>()
  for (const n of names)
    for (const r of gridOf(ps, (ps.data.sets as any)[n]).filter((x) => (STAGE_ORDER as readonly string[]).includes(x.st)))
      for (const c of r.cols ?? []) if (c.key && !first.has(c.key)) (first.set(c.key, c.p), keys.push(c.key))
  return { keys, first }
}
const groupsText = (g: { label: string; stages: string[] }[]): string[] => (g.length === 1 ? [g[0].label] : g.map((x) => `${x.label}: ${x.stages.join(", ")}`))

/** /crew-sets ls (и команда без слов): набор в строке, ● у включённого, модели вместо «семья/режим», расшифровка коротких имён. */
export function setsTable(ps: L.PState): string {
  const names = setNames(ps.data)
  const lines = [`Наборы проекта ${ps.project}. Включён: ${ps.name ? `«${ps.name}».` : "нет (модели — по spawn_models)."}`]
  if (!names.length) lines.push(`Наборов нет. Готовый пример файла (справочник и наборы) — в разделе README о профилях моделей:
${PROFILES_README_URL}
Скопируйте пример в .opencode/crew-harness.json проекта (или передайте агенту: crew_config set) и коммитьте файл.`)
  else {
    const { keys, first } = modelsOfSets(ps, names)
    const shorts = shortModelNames(keys)
    const w0 = Math.max(...names.map((n) => [...n].length)) + 2
    for (const n of names) {
      const text = groupsText(setGroups(ps, n, shorts))
      text.forEach((t, i) => lines.push(i === 0 ? `${n === ps.name ? "● " : "  "}${pad(n, w0)}${t}` : `${" ".repeat(2 + w0)}${t}`))
    }
    lines.push(...legendOf(keys, first, shorts).lines)
    lines.push("● — включённый. По этапам: show <имя>; включить: use <имя>.")
  }
  if (ps.state.message) lines.push(`⚠ ${ps.state.message}`)
  for (const w of ps.state.warnings) lines.push(`⚠ ${w.text}`)
  return lines.join("\n")
}

/** Данные для выбора в окне (dialog.select): наборы или семьи; с аргументом-набором — его описанные этапы. Строка JSON. */
function pickJson(ps: L.PState, kind: "sets" | "profiles", args: string[]): string {
  if (kind === "sets") {
    if (args[0]) {
      const set = (ps.data.sets as any)?.[args[0]]
      return JSON.stringify({ items: P.cellsOf(set).map(([st, c]) => ({ value: st, title: P.STAGE_RU[st], description: P.cellText(c) })) })
    }
    const names = setNames(ps.data)
    const { keys } = modelsOfSets(ps, names)
    const shorts = shortModelNames(keys)
    return JSON.stringify({ current: ps.name, items: names.map((n) => ({ value: n, title: `${n === ps.name ? "● " : "  "}${n}`, description: groupsText(setGroups(ps, n, shorts)).join(" · ") })) })
  }
  const fams = Object.keys(isObj(ps.data.profiles) ? ps.data.profiles : {}).sort()
  const keys = fams.flatMap((f) => P.PROFILE_TIERS.map((t) => (ps.data.profiles as any)[f][t]).filter((p) => p && !P.isEmptyProfile(p)).map((p) => P.modelWithVariant(p)))
  const shorts = shortModelNames(keys)
  return JSON.stringify({
    items: fams.map((f) => {
      const per = P.PROFILE_TIERS.map((t) => {
        const p = (ps.data.profiles as any)[f][t]
        return { t, name: p && !P.isEmptyProfile(p) ? shorts.get(P.modelWithVariant(p))! : "пусто" }
      })
      return { value: f, title: f, description: per.every((x) => x.name === per[0].name) ? per[0].name : per.map((x) => `${x.t} ${x.name}`).join(" · ") }
    }),
  })
}

export function profilesTable(ps: L.PState): string {
  const fams = Object.keys(isObj(ps.data.profiles) ? ps.data.profiles : {}).sort()
  const lines = [`Справочник профилей проекта ${ps.project}: семья, ступень → модель, контекст.`]
  if (!fams.length) lines.push(`Справочник пуст. Готовый пример файла (справочник и наборы) — в разделе README о профилях моделей:\n${PROFILES_README_URL}\nСкопируйте пример в .opencode/crew-harness.json проекта (или передайте агенту: crew_config set) и коммитьте файл.`)
  for (const f of fams)
    for (const t of P.PROFILE_TIERS) {
      const p = (ps.data.profiles as any)[f][t]
      if (!p) continue
      lines.push(`  ${pad(f, 8)}${pad(t, 8)}${P.isEmptyProfile(p) ? "(пусто — заполнить)" : `${pad(P.modelText(p), 34)}${limitsText(winOf(p))}`}`)
    }
  if (ps.state.message) lines.push(`! ${ps.state.message}`)
  return lines.join("\n")
}

/** Окно записи профиля словами экрана семьи: «контекст 525K, ввод 461K, вывод 128K» (без «до»: экран короткий). */
const familyWindow = (p: any): string => [`контекст ${fmtTokens(Number(p.context))}`, ...(p.input !== undefined ? [`ввод ${fmtTokens(Number(p.input))}`] : []), `вывод ${fmtTokens(Number(p.output))}`].join(", ")

/**
 * Экран семьи (задача 075; /crew-profiles show <семья>, Enter на семье в окне): ступени с моделью без провайдера и окном («то же» —
 * как у выше стоящей), какие наборы семью используют и на каких этапах (словами этапов), используется ли она включённым набором
 * сейчас. Провайдер и клетки «семья/ступень» набора — в `/crew-profiles ls` и `/crew-sets show <набор> <этап>`.
 */
export function showFamily(ps: L.PState, family?: string): string {
  if (!family) return profilesTable(ps)
  const f = (ps.data.profiles as any)?.[family]
  if (!isObj(f)) return `Семьи «${family}» нет (есть: ${Object.keys(isObj(ps.data.profiles) ? ps.data.profiles : {}).sort().join(", ") || "справочник пуст"}).`
  const lines = [`Семья «${family}» (проект ${ps.project})`]
  const idOf = (p: any): string => P.modelText(p).replace(/^[^/]*\//, "")
  const w1 = Math.max(...P.PROFILE_TIERS.map((t) => (f[t] && !P.isEmptyProfile(f[t]) ? [...idOf(f[t])].length : 0))) + 2
  let prev: string | undefined
  for (const t of P.PROFILE_TIERS) {
    const p = f[t]
    if (!p) lines.push(`  ${pad(t, 8)}записи нет`)
    else if (P.isEmptyProfile(p)) lines.push(`  ${pad(t, 8)}пусто («заполнить»: ${ref(`/crew-profiles set ${family} ${t} <модель> <context> output=<n>`, "set")})`)
    else {
      const win = familyWindow(p)
      lines.push(`  ${pad(t, 8)}${pad(idOf(p), w1)}${win === prev ? "то же" : win}`)
      prev = win
    }
  }
  const users = setNames(ps.data)
    .map((n) => ({ n, st: P.cellsOf((ps.data.sets as any)[n]).filter(([, c]) => c.family === family).map(([st]) => P.STAGE_RU[st]) }))
    .filter((x) => x.st.length)
  if (!users.length) {
    lines.push("Ни один набор эту семью не использует.")
    return lines.join("\n")
  }
  lines.push(`Используют наборы: ${users.map((x) => `${x.n} (${x.st.join(", ")})`).join("; ")}.`)
  if (!ps.name) lines.push("Набор не включён — модели по spawn_models.")
  else {
    const set = (ps.data.sets as any)?.[ps.name]
    const eff = P.STAGES.map((st) => ({ st, e: P.effectiveCell(set, st, ps.data.profiles as any) })).filter((x) => x.e?.cell.family === family)
    const own = eff.filter((x) => x.e!.how === "explicit").map((x) => P.STAGE_RU[x.st])
    const inh = eff.filter((x) => x.e!.how === "inherited").map((x) => P.STAGE_RU[x.st])
    lines.push(eff.length ? `Включён набор «${ps.name}» — эта семья используется: ${[own.join(", "), inh.length ? `по наследству: ${inh.join(", ")}` : ""].filter(Boolean).join("; ")}.` : `Включён набор «${ps.name}» — эта семья сейчас не используется.`)
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------------------------------------------------
// Краткий вид набора (задача 066): таблица «этап × ступень» с короткими именами моделей, расшифровка, предупреждения одной
// строкой, подсказка. Подробности (наследование, срезы ступеней, откуда контекст) — по этапу: showSetFull.

/** Ширина диалога /crew (DIALOG_WIDTH в status.ts: импортировать нельзя — тот тянет ядро; самотест сверяет). */
export const SETS_VIEW_WIDTH = 72
const fit = (s: string, n = SETS_VIEW_WIDTH): string => {
  const a = [...s]
  return a.length > n ? a.slice(0, n - 1).join("") + "…" : s
}
const BRANDS = ["claude", "gpt", "gemini", "kimi", "glm", "qwen", "llama", "deepseek", "mistral", "grok"]
const MODIFIERS = ["fast", "mini", "nano", "pro", "turbo", "preview", "latest", "thinking", "flash", "lite", "max"]
/** Ступени имени модели от короткой к полной: слово модели; id без провайдера; «провайдер/id». */
function nameLevels(base: string): string[] {
  const id = base.includes("/") ? base.slice(base.indexOf("/") + 1) : base
  const toks = id.split("-")
  const alpha = (t: string) => /^[a-z]+$/i.test(t)
  const num = (t: string) => /^\d+(\.\d+)*$/.test(t)
  const out: string[] = []
  if (toks.every((t) => alpha(t) || num(t))) {
    const w = toks.filter(alpha)
    const brand = (t: string) => BRANDS.includes(t.toLowerCase())
    if (w.length === 1 && !brand(w[0])) out.push(w[0])
    else if (w.length === 2 && brand(w[0]) && !brand(w[1]) && !MODIFIERS.includes(w[1].toLowerCase())) out.push(w[1])
  }
  for (const x of [id, base]) if (!out.includes(x)) out.push(x)
  return out
}
/**
 * Короткие имена моделей («провайдер/id[#вариант]» → «luna», «luna·high»). Правило: слово модели без марки, версии и
 * провайдера; если у двух разных моделей имя одно — обе берут имя ступенью полнее (id без провайдера, затем с провайдером), так
 * что две разные модели никогда не получают одно имя. Вариант (#усилие) добавляется как «·вариант».
 */
export function shortModelNames(models: string[]): Map<string, string> {
  const items = [...new Set(models)].map((k) => ({ k, lv: nameLevels(P.baseModel(k)), at: 0, v: P.variantOf(k) }))
  const name = (x: (typeof items)[number]) => x.lv[x.at] + (x.v ? `·${x.v}` : "")
  for (let pass = 0; pass < 4; pass++) {
    const by = new Map<string, typeof items>()
    for (const x of items) by.set(name(x), [...(by.get(name(x)) ?? []), x])
    let moved = false
    for (const g of by.values())
      if (g.length > 1)
        for (const x of g)
          if (x.at < x.lv.length - 1) {
            x.at++
            moved = true
          }
    if (!moved) break
  }
  return new Map(items.map((x) => [x.k, name(x)]))
}

/** Расшифровка коротких имён: «имя — полное имя · контекст · вывод»; длинная строка делится на две. */
function legendOf(keys: string[], first: Map<string, any>, shorts: Map<string, string>): { lines: string[]; models: Map<string, P.Win> } {
  const lines: string[] = []
  const models = new Map<string, P.Win>()
  for (const k of keys) {
    const p = first.get(k)
    const head = `  ${shorts.get(k)} — ${P.modelText(p)}`
    const lim = limitsText(winOf(p))
    lines.push(...([...`${head} · ${lim}`].length <= SETS_VIEW_WIDTH ? [`${head} · ${lim}`] : [head, `      ${lim}`]))
    if (!models.has(P.baseModel(p))) models.set(P.baseModel(p), winOf(p))
  }
  return { lines, models }
}
type Col = { key?: string; p?: any; need?: string }
type Row = { st: P.Stage; eff?: P.Effective; cols?: Col[] }
/** Модель каждой ступени задачи (heavy, medium, light) на каждом этапе набора — по тем же правилам, что выбирает запуск сессии. */
function gridOf(ps: L.PState, set: any): Row[] {
  const cut = (t: P.PTier) => P.clampTier(t, ps.state.bounds)
  return P.STAGES.map((st) => {
    const eff = P.effectiveCell(set, st, ps.data.profiles as any)
    if (!eff) return { st }
    const cell = eff.cell
    const fam = (ps.data.profiles as any)?.[cell.family]
    const colOf = (t: P.PTier): Col => {
      const p = isObj(fam?.[t]) && !P.isEmptyProfile(fam[t]) ? fam[t] : undefined
      return p ? { key: P.modelWithVariant(p), p } : { need: `${cell.family}/${t}` }
    }
    const cols = P.PROFILE_TIERS.map((t) => colOf(cell.tier === "task" ? cut(eff.lower ? (P.lowerTier(t) as P.PTier) : t).tier : cut(cell.tier as P.PTier).tier))
    return { st, eff, cols }
  })
}
const tripleOf = (r?: Row): string => (r?.cols ? r.cols.map((c) => c.key ?? "∅").join("|") : "")

const hintLine = (): string => (windowMenu ? "Подробно: пункт «show» меню /crew-sets (show <этап> или show all)" : "Подробно: /crew-sets show <этап> или show all")

/** Ошибки набора и профили, которых не хватает после среза ступеней, — строками ⚠ (обрезаны до ширины окна; полный текст — в подробном виде). */
function problemWarns(ps: L.PState, n: string, rows: Row[]): string[] {
  const warns: string[] = []
  const errs = P.checkData(ps.data, n).errors
  for (const e of errs) warns.push(fit(`⚠ ${e.text}`))
  if (!errs.length) {
    const need = new Map<string, string[]>()
    for (const r of rows) for (const c of r.cols ?? []) if (c.need && !(need.get(c.need) ?? []).includes(P.STAGE_RU[r.st])) need.set(c.need, [...(need.get(c.need) ?? []), P.STAGE_RU[r.st]])
    for (const [k, st] of need) warns.push(fit(`⚠ нет профиля ${k} (после среза ступеней): ${st.map((x) => `«${x}»`).join(", ")}`))
  }
  return warns
}

type Brief = { table: string[]; legend: string[]; warns: string[]; shorts: Map<string, string> }
/** Таблица, расшифровка и предупреждения набора n. extraKeys — модели, которым нужны имена в той же раскладке (use); catalog — сверять с каталогом. */
async function briefParts(ps: L.PState, n: string, deps: CmdDeps, opts: { extraKeys?: string[]; catalog?: boolean } = {}): Promise<Brief> {
  const set = (ps.data.sets as any)[n]
  const rows = gridOf(ps, set)
  const keys: string[] = []
  const first = new Map<string, any>()
  for (const r of rows)
    for (const c of r.cols ?? [])
      if (c.key && !first.has(c.key)) {
        first.set(c.key, c.p)
        keys.push(c.key)
      }
  const shorts = shortModelNames([...keys, ...(opts.extraKeys ?? [])])
  const nm = (c: Col) => (c.key ? shorts.get(c.key)! : "нет профиля")
  const table: string[] = []
  const whole = rows.every((r) => r.eff && r.cols && r.cols.every((c) => c.key)) && rows.every((r) => tripleOf(r) === tripleOf(rows[0]))
  if (whole) {
    const names = rows[0].cols!.map(nm)
    table.push(names.every((x) => x === names[0]) ? `все этапы: ${P.PROFILE_TIERS.join("/")} → ${names[0]}` : `все этапы: ${P.PROFILE_TIERS.map((t, i) => `${t} → ${names[i]}`).join(" · ")}`)
  } else {
    const w0 = Math.max(...rows.map((r) => [...P.STAGE_RU[r.st]].length), 4) + 2
    const srcOf = (r: Row) => (r.eff?.how === "inherited" && r.cols ? rows.find((x) => x.st === r.eff!.from) : undefined)
    const asSrc = (r: Row) => {
      const s = srcOf(r)
      return s && tripleOf(s) === tripleOf(r) ? s : undefined
    }
    const widths = P.PROFILE_TIERS.map((t, i) => Math.max(t.length, ...rows.filter((r) => r.cols && !asSrc(r)).map((r) => [...nm(r.cols![i])].length)) + 2)
    table.push(`${pad("этап", w0)}${P.PROFILE_TIERS.map((t, i) => (i < 2 ? pad(t, widths[i]) : t)).join("")}`)
    for (const r of rows) {
      const label = pad(P.STAGE_RU[r.st], w0)
      const src = asSrc(r)
      if (!r.eff || !r.cols) table.push(`${label}не описан: по spawn_models`)
      else if (src) table.push(`${label}как «${P.STAGE_RU[src.st]}»`)
      else table.push(`${label}${r.cols.map((c, i) => (i < 2 ? pad(nm(c), widths[i]) : nm(c))).join("")}`.trimEnd())
    }
  }
  const lg = legendOf(keys, first, shorts)
  const legend = lg.lines
  const models = lg.models
  const warns: string[] = problemWarns(ps, n, rows)
  const groups = new Map<string, P.SameFamilyPair[]>()
  for (const pr of P.sameFamilyPairs(set, ps.data.profiles as any)) groups.set(`${pr.family}|${pr.other}`, [...(groups.get(`${pr.family}|${pr.other}`) ?? []), pr])
  for (const g of groups.values()) {
    const { family, other } = g[0]
    if (g.length === 1) warns.push(fit(`⚠ «${P.STAGE_RU[g[0].check]}» на той же семье ${family}, что «${P.STAGE_RU[g[0].author]}»; есть ${other}`))
    else if (g.length === Object.keys(P.AUTHOR_OF).length) warns.push(fit(`⚠ все приёмки на той же семье ${family}, что авторы; есть ${other}`))
    else warns.push(fit(`⚠ ${g.slice(0, 2).map((x) => P.STAGE_RU[x.check]).join(", ")}${g.length > 2 ? ` и ещё ${g.length - 2}` : ""} на той же семье ${family}, что авторы; есть ${other}`))
  }
  if (opts.catalog !== false) {
    const cat = await catalogOf(deps)
    if (cat)
      for (const m of models.keys()) {
        const [prov, ...rest] = m.split("/")
        if (!cat.some((x) => x.providerID === prov && x.modelID === rest.join("/"))) warns.push(fit(`⚠ модели ${m} нет в каталоге OpenCode`))
      }
  }
  return { table, legend, warns, shorts }
}

/** Разбор слов show: [набор] [этап|all]; набор, если первое слово — имя набора (имя набора главнее одноимённого слова этапа). */
function parseShowArgs(ps: L.PState, args: string[]): { set?: string; only?: P.Stage | "all" } | { error: string } {
  let set: string | undefined
  let rest = args
  if (args.length && setNames(ps.data).includes(args[0])) {
    set = args[0]
    rest = args.slice(1)
  }
  if (!rest.length) return { set }
  const word = rest.join("-")
  if (word.toLowerCase() === "all") return { set, only: "all" }
  const st = P.stageOfWord(word)
  if (st) return { set, only: st }
  if (!set && rest.length === 1) return { error: `Набора или этапа «${rest[0]}» нет (наборы: ${listSets(ps.data)}; этапы: ${P.STAGES_TEXT}, или all).` }
  return { error: `Этап «${rest.join(" ")}» не годится: ${P.STAGES_TEXT} (или русские названия), либо all.` }
}

export async function showSet(ps: L.PState, name: string | undefined, dir: string, deps: CmdDeps = {}, only?: P.Stage | "all"): Promise<string> {
  const n = name ?? ps.name
  if (!n) return `Набор не включён (имени нет в файле проекта). Покажи любой: ${ref("/crew-sets show <имя>", "show")}; включить: ${ref("/crew-sets use <имя>", "use")}.`
  const set = (ps.data.sets as any)?.[n]
  if (!isObj(set)) return `Набора «${n}» нет (есть: ${listSets(ps.data)}).`
  if (only) return showSetFull(ps, n, set, dir, only)
  const b = await briefParts(ps, n, deps)
  return [fit(`Набор «${n}» — ${n === ps.name ? "включён" : "выключен"}`), ...b.table, ...b.legend, ...b.warns, hintLine()].join("\n")
}

/** Подробный вид: прежний полный текст набора (all) или один его этап. */
function showSetFull(ps: L.PState, n: string, set: any, dir: string, only: P.Stage | "all"): string {
  const root = mainFolder(dir)
  const lines = [`Набор «${n}»${n === ps.name ? ` — включён (имя в файле проекта)` : " — не включён"}:`]
  const bounds = ps.state.bounds
  const cut = (t: P.PTier) => P.clampTier(t, bounds)
  for (const st of only === "all" ? P.STAGES : [only]) {
    const eff = P.effectiveCell(set, st, ps.data.profiles as any)
    const cell = eff?.cell
    if (!eff || !cell) {
      lines.push(`  ${P.STAGE_RU[st]}: не описан — модель по spawn_models`)
      continue
    }
    const how = eff.how === "inherited" ? ` (унаследован от «${P.STAGE_RU[eff.from!]}»${P.INHERIT[st]?.lower ? ", ступенью ниже" : ""})` : ""
    const fam = (ps.data.profiles as any)?.[cell.family]
    const prof = (t: P.PTier) => (isObj(fam?.[t]) && !P.isEmptyProfile(fam[t]) ? (fam[t] as any) : undefined)
    const front = st === "develop" || st === "plan"
    // этапы разбора и сдачи (spec, delivery и их приёмки) пока без сессий: окно приёмки к ним не относится
    const idle = !P.CORE_STAGES.includes(st as any)
    const winLine = (model: string) => (idle ? "окно не применяется: у этапа пока нет сессий" : reviewerWindowLine(root, model))
    if (cell.tier === "task") {
      // та же ступень, что выберет resolveStageProfile: клетка task на «ступень ниже» (сдача) сначала снижается, потом срезается
      const reach = (t: P.PTier) => cut(eff.lower ? (P.lowerTier(t) as P.PTier) : t)
      lines.push(`  ${P.STAGE_RU[st]}: ${P.cellText(cell)}${how} — по ступени задачи: ${P.PROFILE_TIERS.map((t) => `${t} → ${(prof(reach(t).tier) ? P.modelText(prof(reach(t).tier)) : "нет профиля")}${reach(t).from ? " (срез границами ступеней)" : ""}`).join(", ")}`)
      // окна — только достижимых ступеней (срезанные недостижимы)
      const live = [...new Set(P.PROFILE_TIERS.map((t) => reach(t).tier))].filter((t) => prof(t))
      if (front) {
        for (const t of live) lines.push(`      контекст профиля в рабочем дереве задачи (${t}): ${limitsText(winOf(prof(t)))}`)
      } else {
        for (const t of live) lines.push(`      ${t}: ${winLine(P.baseModel(prof(t)))}`)
      }
    } else {
      const cl = cut(cell.tier)
      const p = prof(cl.tier)
      lines.push(`  ${P.STAGE_RU[st]}: ${P.cellText(cell)}${how} → ${p ? P.modelText(p) : "нет профиля"}${cl.from ? ` — срез границами ступеней: ${cl.from} → ${cl.tier}` : ""}`)
      if (p) lines.push(front ? `      контекст профиля в рабочем дереве задачи: ${limitsText(winOf(p))}` : `      ${winLine(P.baseModel(p))}`)
    }
  }
  const mine = (t: string) => only === "all" || t.includes(`этап «${P.STAGE_RU[only]}»`) || !/этап «/.test(t)
  for (const e of P.checkData(ps.data, n).errors) if (mine(e.text)) lines.push(`! ${e.text}`)
  for (const pr of P.sameFamilyPairs(set, ps.data.profiles as any)) if (only === "all" || pr.check === only || pr.author === only) lines.push(`  заметка: ${pr.text}`)
  return lines.join("\n")
}

type Catalog = { providerID: string; modelID: string; limit?: { context?: number; input?: number; output?: number } }[]
async function catalogOf(deps: CmdDeps): Promise<Catalog | undefined> {
  try {
    return await deps.catalog?.()
  } catch {
    return undefined
  }
}

/** Предупреждения по каталогу моделей OpenCode (use, check): подсказка, не условие работы. */
async function catalogWarnings(models: Map<string, P.Win>, deps: CmdDeps, full: boolean): Promise<string[]> {
  const out: string[] = []
  const cat = await catalogOf(deps)
  if (!cat) {
    if (full) out.push(`модели не сверены с каталогом OpenCode: не проверено (каталог недоступен${deps.catalogWhy ? `: ${deps.catalogWhy}` : ""})`)
  } else {
    for (const [model, win] of models) {
      const [prov, ...rest] = model.split("/")
      const hit = cat.find((m) => m.providerID === prov && m.modelID === rest.join("/"))
      if (!hit) out.push(`модели ${model} нет в каталоге OpenCode (опечатка или провайдер не подключён)`)
      else if (full && hit.limit?.input !== undefined && win.input === undefined) out.push(`у модели ${model} в каталоге есть ввод (${fmtTokens(hit.limit.input)}), а в профиле его нет: контекст профиля сжатие этой модели не изменит (у моделей с вводом сжатием управляет ввод)`)
    }
  }
  return out
}
/** Заметки об окнах (рукописные перекрытия, явный порог Claude Code) и каталог — для check. */
async function windowWarnings(ps: L.PState, models: Map<string, P.Win>, dir: string, deps: CmdDeps, full: boolean): Promise<string[]> {
  return [...W.windowNotes(mainFolder(dir), W.qualifying(ps.project, listTasks(ps.project)), models), ...(await catalogWarnings(models, deps, full))]
}

/** Предупреждение об уменьшенном контексте одной строкой (порог сжатия «было → стало» по короткому имени модели); не уменьшился — undefined. */
function shrunkWarning(before: Map<string, P.Win>, after: Map<string, P.Win>, root: string, shorts: Map<string, string>): string | undefined {
  const reserved = W.reservedOf(root)?.value
  const shrunk: string[] = []
  for (const m of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(m) ?? chainAsWin(root, m)
    const a = after.get(m) ?? chainAsWin(root, m)
    const bt = b ? (b.input ?? b.context) : undefined
    const at = a ? (a.input ?? a.context) : undefined
    if (bt !== undefined && at !== undefined && at < bt) shrunk.push(`${shorts.get(m) ?? m} (порог сжатия ${reserved !== undefined ? `${fmtTokens(bt - reserved)} → ${fmtTokens(at - reserved)}` : `контекст ${fmtTokens(bt)} → ${fmtTokens(at)}`})`)
  }
  return shrunk.length ? `⚠ Контекст уменьшен: ${shrunk.join(", ")}; вкладки выше порога сожмутся на следующем ходе.` : undefined
}

/** Модели приёмки и приёмки плана набора (для строки про окно приёмки). */
function reviewerModels(data: P.Data, name: string, bounds?: P.Bounds): string[] {
  const out = new Set<string>()
  for (const [st, c] of P.cellsOf((data.sets as any)?.[name])) {
    // сессии приёмки плагин запускает только по этим двум этапам; spec_accept и delivery_accept окон не имеют
    if (st !== "develop_accept" && st !== "plan_accept") continue
    for (const ref of P.referencedProfiles(c)) {
      if (c.tier === "task" && ref.tier !== "medium") continue
      const p = (data.profiles as any)?.[c.family]?.[P.clampTier(ref.tier, bounds).tier]
      if (p && !P.isEmptyProfile(p)) out.add(P.baseModel(p))
    }
  }
  return [...out]
}

// ---------------------------------------------------------------------------------------------------------------------
// Экран после выбора набора (задача 075; use и Enter на наборе в окне). Первая строка — итог; ниже по одной строке: модель каждого
// этапа «было → стало» (одинаковое схлопнуто), ступени задачи (heavy/medium/light) не называются — «по размеру задачи»; идущие
// сессии, которые остаются на прежних моделях (по сводкам плагина); окно модели; предупреждения; «не закоммичено». Служебное
// (файлы окон, рукописные настройки приёмки, расшифровка имён) — в подробном виде (show), здесь только если что-то записано или мешает.

/** Этапы экрана: «Работа» — разработка и планирование, «Приёмка» — их проверки; различаются — идут по одному словами этапов. */
const SCREEN_GROUPS: { label: string; stages: [P.Stage, P.Stage] }[] = [
  { label: "Работа", stages: ["develop", "plan"] },
  { label: "Приёмка", stages: ["develop_accept", "plan_accept"] },
]
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Модели этапа словами экрана: от малой ступени к большой, одинаковые схлопнуты; этапа нет — по spawn_models. */
function stageText(r: Row | undefined, shorts: Map<string, string>): string {
  if (!r?.cols) return "по spawn_models"
  const names = [...new Set([...r.cols].reverse().map((c) => (c.key ? shorts.get(c.key)! : "нет профиля")))]
  return names.join(" / ") + (names.length > 1 ? " по размеру задачи" : "")
}

type ScreenRow = { label: string; now: string; was: string }
/** Строки экрана «этап: модели (было …)»: работа и приёмка по два этапа вместе, если у обоих то же самое, иначе каждый свой строкой. */
function screenRows(before: Row[] | undefined, after: Row[], shorts: Map<string, string>): string[] {
  const rows: ScreenRow[] = []
  const text = (rs: Row[] | undefined, st: P.Stage) => stageText(rs?.find((r) => r.st === st), shorts)
  for (const g of SCREEN_GROUPS) {
    const [a, b] = g.stages
    if (text(after, a) === text(after, b) && text(before, a) === text(before, b)) rows.push({ label: g.label, now: text(after, a), was: text(before, a) })
    else for (const st of g.stages) rows.push({ label: capital(P.STAGE_RU[st]), now: text(after, st), was: text(before, st) })
  }
  const w0 = Math.max(...rows.map((r) => [...r.label].length + 1)) + 2
  const w1 = Math.max(...rows.map((r) => [...r.now].length)) + 2
  let prevWas: string | undefined
  return rows.map((r) => {
    const note = r.was === r.now ? "(без изменений)" : r.was === prevWas ? "(было те же)" : `(было ${r.was})`
    prevWas = r.was === r.now ? undefined : r.was
    return `${pad(`${r.label}:`, w0)}${pad(r.now, w1)}${note}`
  })
}

type ModelWin = { base: string; name: string; win: P.Win }
/** Модели этапов ядра в порядке строк экрана (от малой ступени к большой) с короткими именами и окнами. */
function modelWindows(rows: Row[], shorts: Map<string, string>): ModelWin[] {
  const out: ModelWin[] = []
  for (const r of rows.filter((x) => (STAGE_ORDER as readonly string[]).includes(x.st)))
    for (const c of [...(r.cols ?? [])].reverse()) if (c.key && !out.some((x) => x.name === shorts.get(c.key!))) out.push({ base: P.baseModel(c.key), name: shorts.get(c.key)!, win: winOf(c.p) })
  return out
}
const WIN_FIELDS = ["context", "input", "output"] as const
/** Окно словами экрана: «220K, вывод до 131072» (контекст первым и без слова). */
function winPhrase(w: P.Win): string {
  const parts: string[] = []
  for (const f of WIN_FIELDS) if (w[f] !== undefined) parts.push(f === "context" ? fmtTokens(w[f]!) : `${LIMIT_RU[f]} ${fmtTokens(w[f]!)}`)
  return parts.join(", ")
}
/** Модели с одинаковым окном вместе: «luna, sol — 525K, …; k3-256k — 220K, …»; одна группа и names=false — только окно. */
function winGroupsText(ms: ModelWin[], names: boolean): string {
  const groups: { names: string[]; win: P.Win }[] = []
  for (const m of ms) {
    const g = groups.find((x) => JSON.stringify(x.win) === JSON.stringify(m.win))
    if (g) g.names.push(m.name)
    else groups.push({ names: [m.name], win: m.win })
  }
  return groups.length === 1 && !names ? winPhrase(groups[0].win) : groups.map((g) => `${g.names.join(", ")} — ${winPhrase(g.win)}`).join("; ")
}
/**
 * Строка про окна: что у моделей нового набора и, если окна поменялись, что было: у моделей прежнего набора, которых в новом нет, и у
 * тех, что остались с другим окном. Одинаковое схлопнуто, незатронутые модели не повторяются.
 */
function contextLine(before: Row[] | undefined, after: Row[], oldName: string | undefined, shorts: Map<string, string>): string | undefined {
  const now = modelWindows(after, shorts)
  if (!now.length) return undefined
  const head = now.length === 1 ? `Контекст модели: ${winPhrase(now[0].win)}` : `Контекст: ${winGroupsText(now, true)}`
  const gone = (before ? modelWindows(before, shorts) : []).filter((o) => {
    const n = now.find((x) => x.base === o.base)
    return !n || JSON.stringify(n.win) !== JSON.stringify(o.win)
  })
  return `${head}${gone.length ? ` (у «${oldName}» было ${winGroupsText(gone, false)})` : ""}.`
}

/** Предупреждения «проверяющий на той же семье, что автор» словами экрана: по одной строке на пару (семья, другая семья). */
function sameFamilyScreen(ps: L.PState, set: any, rows: Row[]): string[] {
  const groups = new Map<string, P.SameFamilyPair[]>()
  for (const pr of P.sameFamilyPairs(set, ps.data.profiles as any)) if ((STAGE_ORDER as readonly string[]).includes(pr.check)) groups.set(`${pr.family}|${pr.other}`, [...(groups.get(`${pr.family}|${pr.other}`) ?? []), pr])
  const out: string[] = []
  for (const g of groups.values()) {
    const checks = g.map((x) => x.check)
    const authors = g.map((x) => x.author)
    const has = (l: P.Stage[], a: P.Stage, b: P.Stage) => l.length === 2 && l.includes(a) && l.includes(b)
    const checkLabel = has(checks, "develop_accept", "plan_accept") ? "Приёмка" : capital(checks.map((x) => P.STAGE_RU[x]).join(", "))
    const authorLabel = has(authors, "develop", "plan") ? "работа" : authors.map((x) => P.STAGE_RU[x]).join(", ")
    const sameModel = g.every((x) => tripleOf(rows.find((r) => r.st === x.check)) === tripleOf(rows.find((r) => r.st === x.author)))
    out.push(`⚠ ${checkLabel} на той же семье, что и ${authorLabel}: проверяет та же ${sameModel ? "модель" : "семья моделей"}, что пишет. Другая семья есть: ${g[0].other}.`)
  }
  return out
}

type LiveSession = { ref: string; n: number; title: string; model: string }
/** Исполнитель работает в этих состояниях задачи; приёмщик — в этих. Остальные сессии свою работу кончили (сдача, принятие, отмена). */
const EXECUTOR_BUSY = ["starting", "running", "rework"]
const REVIEWER_BUSY = ["submitted", "reviewing", "approval"]
/**
 * Идущие сессии задач проекта по сводкам плагина (status/<сессия>.json: модель сессии, задача, её состояние). Сводки нет (папка не
 * создана или не читается) — undefined: строку про сессии не печатаем, не выдумываем.
 */
function liveSessions(project: string): LiveSession[] | undefined {
  const dir = path.join(BASE, "status")
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return undefined
  }
  const out: LiveSession[] = []
  for (const f of files) {
    const s = readJson<any>(path.join(dir, f))
    if (!s || s.project !== project || !isObj(s.task) || !s.model || s.task.ended) continue
    if (!(s.task.as === "reviewer" ? REVIEWER_BUSY : EXECUTOR_BUSY).includes(String(s.task.status))) continue
    out.push({ ref: String(s.task.ref ?? taskNo({ project: s.project, n: s.task.n })), n: Number(s.task.n), title: String(s.task.title ?? ""), model: P.baseModel(String(s.model)) })
  }
  return out
}
const clip = (s: string, n: number): string => (s.length > n ? `${[...s].slice(0, n - 1).join("")}…` : s)

/** Строки про идущие сессии, которые останутся на прежних моделях (их модели нет в новом наборе), и про то, куда пойдут новые. */
function sessionLines(project: string, newBases: Set<string>, target: string, shorts: Map<string, string>): string[] {
  const tail = `новые пойдут на ${target}, перезапуск не нужен.`
  const live = liveSessions(project)
  if (!live) return [`Новые сессии пойдут на ${target}, перезапуск не нужен.`]
  const stay = live.filter((s) => !newBases.has(s.model))
  if (!stay.length) return [`Идущих сессий на прежних моделях нет; ${tail}`]
  const tasks = new Map<string, { n: number; title: string; models: string[]; count: number }>()
  for (const s of stay) {
    const t = tasks.get(s.ref) ?? { n: s.n, title: s.title, models: [], count: 0 }
    t.count++
    const m = shorts.get(s.model) ?? s.model
    if (!t.models.includes(m)) t.models.push(m)
    tasks.set(s.ref, t)
  }
  const list = [...tasks].sort((a, b) => a[1].n - b[1].n)
  const refs = list.slice(0, 6).map(([ref, t]) => (t.count > 1 ? `${ref} ×${t.count}` : ref))
  const lines = [`Идущие сессии остаются на прежних моделях (сейчас ${stay.length}: ${refs.join(", ")}${list.length > 6 ? ` и ещё ${list.length - 6}` : ""}); ${tail}`]
  for (const [ref, t] of list.slice(0, 6)) lines.push(`  ${ref}${t.title ? ` «${clip(t.title, 40)}»` : ""} — ${t.models.join(", ")}`)
  return lines
}

/** Ступени ограничены границами проекта (tier_min, tier_max) и это что-то срезало у прежнего или нового набора — одной строкой. */
function boundsLine(ps: L.PState, sets: any[]): string | undefined {
  const b = ps.state.bounds
  if (!b || b.error || (!b.min && !b.max)) return undefined
  const cuts = sets.some((set) => P.cellsOf(set).some(([st, c]) => (STAGE_ORDER as readonly string[]).includes(st) && (c.tier === "task" ? P.PROFILE_TIERS : [c.tier as P.PTier]).some((t) => P.clampTier(t, b).from)))
  if (!cuts) return undefined
  return `Ступени ограничены проектом: ${[b.max ? `не выше ${b.max} (tier_max)` : "", b.min ? `не ниже ${b.min} (tier_min)` : ""].filter(Boolean).join(" и ")}.`
}

/** Служебная строка про файлы окон в рабочих деревьях задач: только если что-то записано, снято или не вышло. */
export function filesNote(f: { written: string[]; removed: string[]; foreign: string[]; errors: string[] }, trees: number): string | undefined {
  const out: string[] = []
  if (f.written.length || f.removed.length) out.push(`Файлы окон в рабочих деревьях задач: записано ${f.written.length}, снято ${f.removed.length} (деревьев задач: ${trees}).`)
  if (f.errors.length || f.foreign.length)
    out.push(`⚠ Окна задач не записаны: ${[f.errors.length ? `ошибка записи (${f.errors[0]}${f.errors.length > 1 ? ` и ещё ${f.errors.length - 1}` : ""})` : "", f.foreign.length ? `чужой файл окон, не тронут (${f.foreign.length})` : ""].filter(Boolean).join("; ")}.`)
  return out.length ? out.join("\n") : undefined
}

async function useSet(dir: string, name: string | undefined, deps: CmdDeps): Promise<string> {
  const ps = L.profileState(dir)
  const command = "crew-sets use"
  if (!name) return refused(ps.project, command, `нужно: use <имя>; наборы: ${listSets(ps.data)}`)
  if (!isObj(ps.data.sets?.[name])) return refused(ps.project, command, `набора «${name}» нет; наборы: ${listSets(ps.data)}`)
  const chk = P.checkData(ps.data, name)
  if (chk.errors.length) return refused(ps.project, command, `набор «${name}» нельзя включить: ${chk.errors.map((e) => e.text).join("; ")}`)
  const draft = L.draftOf(ps)
  draft.name = name
  const w = L.writeDraft(ps, draft)
  if (!w.ok) return refused(ps.project, command, w.error)
  L.syncSnapshot(dir)
  const files = L.syncProjectFiles(dir)
  const after = L.profileState(dir)
  commitEdit(ps.project, command, "включён набор", ps.name, name)
  const root = mainFolder(dir)
  const models = windowsOfActive(after)
  const wasModels = windowsOfActive(ps)
  const set = (after.data.sets as any)[name]
  const was = ps.name && isObj(ps.data.sets?.[ps.name]) ? ps.name : undefined
  const rowsNow = gridOf(after, set)
  const rowsWas = was ? gridOf(ps, (ps.data.sets as any)[was]) : undefined
  const sessions = liveSessions(ps.project)
  // имена моделей — одной раскладкой для обоих наборов и для моделей идущих сессий
  const keys = [...new Set([...rowsNow, ...(rowsWas ?? [])].flatMap((r) => (r.cols ?? []).flatMap((c) => (c.key ? [c.key] : []))))]
  const shorts = shortModelNames([...keys, ...[...wasModels.keys(), ...models.keys()], ...(sessions ?? []).map((s) => s.model)])
  const core = rowsNow.filter((r) => (STAGE_ORDER as readonly string[]).includes(r.st))
  const coreNames = [...new Set(core.flatMap((r) => (r.cols ?? []).map((c) => (c.key ? shorts.get(c.key)! : "нет профиля"))))]
  const target = coreNames.length === 1 ? coreNames[0] : "модели набора"
  const newBases = new Set(rowsNow.flatMap((r) => (r.cols ?? []).flatMap((c) => (c.key ? [P.baseModel(c.key)] : []))))
  const lines: string[] = [ps.name === name ? `Набор «${name}» уже включён` : `Набор «${name}» включён${was ? ` (был «${was}»)` : ""}`]
  lines.push(...screenRows(rowsWas, rowsNow, shorts))
  const bl = boundsLine(after, [set, was ? (ps.data.sets as any)[was] : undefined])
  if (bl) lines.push(bl)
  const apart = P.cellsOf(set).filter(([st]) => !(STAGE_ORDER as readonly string[]).includes(st)).map(([st]) => P.STAGE_RU[st])
  if (apart.length) lines.push(`Отдельно описаны ещё: ${apart.join(", ")} (подробности — show all).`)
  if (ps.name !== name) lines.push(...sessionLines(ps.project, newBases, target, shorts))
  const ctxLine = contextLine(rowsWas, rowsNow, was, shorts)
  if (ctxLine) lines.push(ctxLine)
  const shrunk = shrunkWarning(wasModels, models, root, shorts)
  if (shrunk) lines.push(shrunk)
  lines.push(...problemWarns(after, name, rowsNow))
  lines.push(...sameFamilyScreen(after, set, rowsNow))
  const wts = W.qualifying(ps.project, listTasks(ps.project))
  const cfg = loadConfig(dir)
  if (cfg.reviewer === "integrator" && P.cellsOf((after.data.sets as any)[name]).some(([s, c]) => (s === "develop_accept" || s === "plan_accept") && c.tier !== "task")) lines.push("⚠ в проекте reviewer: integrator — приёмку ведёт вкладка интегратора на её модели; набор приёмку не меняет (модель открытой вкладки плагин не переключает).")
  for (const x of after.state.warnings) lines.push(`⚠ ${x.text}`)
  for (const x of await catalogWarnings(models, deps, false)) lines.push(`⚠ ${x}`)
  for (const x of W.windowNotes(root, wts, models)) lines.push(`⚠ ${x}`)
  lines.push("Не закоммичено — это локальная настройка проекта.")
  const fn = filesNote(files, wts.length)
  if (fn) lines.push(fn)
  lines.push(hintLine())
  return lines.join("\n")
}

/** Выключить набор: убрать profile_set из рабочей копии файла проекта; модели новых сессий снова по spawn_models. */
function offSet(dir: string): string {
  const ps = L.profileState(dir)
  const command = "crew-sets off"
  if (!ps.name) return `Набор и так не включён (profile_set в файле проекта нет). Модели новых сессий — по spawn_models. Данные не тронуты.`
  const draft = L.draftOf(ps)
  draft.name = undefined
  const w = L.writeDraft(ps, draft)
  if (!w.ok) return refused(ps.project, command, w.error)
  L.syncSnapshot(dir)
  L.syncProjectFiles(dir)
  commitEdit(ps.project, command, "набор выключен", ps.name, undefined)
  return [
    `Набор «${ps.name}» выключен; новые сессии пойдут по spawn_models, перезапуск не нужен.`,
    "profile_set убран из файла проекта без коммита: если имя уже закоммичено, оно вернётся из коммита — закоммитьте файл.",
    `Наборы и справочник на месте; включить снова: ${ref("/crew-sets use <имя>", "use")}.`,
  ].join("\n")
}

async function checkReport(dir: string, deps: CmdDeps): Promise<string> {
  const ps = L.profileState(dir)
  const root = mainFolder(dir)
  const warn: string[] = []
  const info: string[] = [`Проект ${ps.project}${deps.version ? ` (OpenCode ${deps.version})` : ""}; проверка ничего не меняет.`]
  if (deps.catalogNote) info.push(`Каталог моделей OpenCode: ${deps.catalogNote}.`)
  info.push(`Включён: ${ps.name ? `«${ps.name}» (файл проекта), строка ${ps.state.row} таблицы исходов` : "набор не включён"}.`)
  if (ps.state.message) warn.push(ps.state.message)
  const all = P.checkData(ps.data, ps.name)
  for (const e of all.errors) warn.push(e.text)
  for (const w of all.warnings) warn.push(w.text)
  // пустые записи, на которые кто-то ссылается (пустую ступень без ссылок не называем); конфликты окон других наборов
  for (const name of setNames(ps.data)) {
    if (name === ps.name) continue
    for (const e of P.emptyRefs(ps.data, name)) warn.push(e.text)
    for (const c of P.windowsOfSet(ps.data, name).conflicts) warn.push(`${c.text} — use этого набора откажет`)
  }
  // расхождение с spawn_models (набор default повторяет прежнее поведение только при равенстве)
  const cfg = loadConfig(dir)
  for (const t of P.PROFILE_TIERS) {
    const p = (ps.data.profiles as any)?.claude?.[t]
    const want = cfg.spawnModels[t] ?? DEFAULT_SPAWN_MODELS[t]
    if (isObj(p) && !P.isEmptyProfile(p) && P.baseModel(p) !== want) warn.push(`модель профиля claude/${t} (${p.model}) не равна spawn_models.${t} (${want}): набор с клетками claude/task изменит выбор моделей новых сессий`)
  }
  const models = windowsOfActive(ps)
  for (const w of await windowWarnings(ps, models, dir, deps, true)) warn.push(w)
  for (const p of L.problemsOf(ps)) if (!warn.some((l) => l.includes(p))) warn.push(p)
  const old = L.legacyLayerText(ps.project)
  if (old) warn.push(old)
  const lines = [warn.length ? `Проверка профилей: замечаний ${warn.length}, ниже.` : "Проверка профилей: замечаний нет.", ...warn.map((w) => `⚠ ${w}`), ...info]
  if (ps.state.usable) for (const m of reviewerModels(ps.state.usable.data, ps.state.usable.name, ps.state.bounds)) lines.push(`Приёмка и приёмка плана: ${reviewerWindowLine(root, m)}.`)
  return lines.join("\n")
}

async function dispatch(kind: "sets" | "profiles", dir: string, text: string, deps: CmdDeps): Promise<string> {
  const w = words(text)
  const verb = w[0]
  const args = w.slice(1)
  windowMenu = !!deps.window
  const verbs = kind === "sets" ? SETS_VERBS : PROFILES_VERBS
  const bad = (why: string) => `${why}\n${usageLine(kind)}`
  if (verb === "view") return VIEW_GONE
  if (verb === "__pick") return pickJson(L.profileState(dir), kind, args)
  if (!verb || verb === "ls" || verb === "list") {
    if (verb && args.length) return bad("ls без аргументов.")
    const ps = L.profileState(dir)
    return kind === "sets" ? setsTable(ps) : profilesTable(ps)
  }
  if (GONE_VERBS.includes(verb)) return `Команды ${verb} больше нет: правки профилей и наборов идут прямо в файл проекта (рабочая копия, без коммита), сохранять и сбрасывать нечего.`
  if (!verbs.includes(verb)) return bad(`Неизвестный глагол «${verb}».`)
  switch (verb) {
    case "show": {
      const ps = L.profileState(dir)
      if (kind === "profiles") return args.length > 1 ? bad("show принимает не больше одного имени.") : showFamily(ps, args[0])
      const a = parseShowArgs(ps, args)
      if ("error" in a) return a.error
      return showSet(ps, a.set, dir, deps, a.only)
    }
    case "use":
      if (kind !== "sets" || args.length !== 1) return bad("use принимает ровно одно имя набора.")
      return useSet(dir, args[0], deps)
    case "off":
      if (kind !== "sets" || args.length) return bad("off без аргументов.")
      return offSet(dir)
    case "check":
      if (args.length) return bad("check без аргументов.")
      return checkReport(dir, deps)
  }
  const r = kind === "sets" ? setsEditVerb(dir, verb, args) : profilesEditVerb(dir, verb, args)
  return r ? r.text : bad(`Глагол «${verb}» не обработан.`)
}

export const runSetsCommand = (dir: string, text: string, deps: CmdDeps = {}): Promise<string> => dispatch("sets", dir, text, deps)
export const runProfilesCommand = (dir: string, text: string, deps: CmdDeps = {}): Promise<string> => dispatch("profiles", dir, text, deps)
