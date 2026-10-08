// КОМАНДЫ ОКНА /crew-sets И /crew-profiles (задача 003, ADR-0008). Правят профили и наборы в локальном слое проекта
// (profile-layer.ts) СРАЗУ, без коммита файла проекта; `use` включает набор, `check` проверяет, `save` переносит слой в рабочую
// копию файла. Ответ — текст для окна без хода модели. Правка, делающая включённый набор недопустимым или создающая
// повисшую ссылку, отклоняется целиком (данные не тронуты). Единственная точка журнала правок — commitEdit.

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

export const SETS_VERBS = ["show", "use", "reset", "set", "unset", "new", "rename", "delete", "check", "save"]
export const PROFILES_VERBS = ["show", "set", "new", "rename", "delete", "reset", "check", "save"]

const refused = (project: string, command: string, why: string): string => {
  L.logRefused(project, command, why)
  return `Не сделано: ${why}. Данные не тронуты.`
}
const usageLine = (cmd: "sets" | "profiles"): string =>
  cmd === "sets"
    ? `Глаголы /crew-sets: ${verbUsageList("sets")}. Этапы: develop, accept, plan, plan_accept (или разработка, приёмка, планирование, приёмка-плана). Без аргумента — таблица наборов.`
    : `Глаголы /crew-profiles: ${verbUsageList("profiles")}. Без аргумента — таблица справочника.`
/** В окне команды — пункты меню, а не набираемые слова: тексты ссылаются на пункт меню, слэш-форма остаётся записью для памяти. */
let windowMenu = false
const ref = (slash: string, item: string): string => (windowMenu ? `пункт «${item}» меню ${slash.split(" ")[0]} (${slash})` : slash)

/** Единственный вызывающий журнал правок: ровно одна строка на каждую успешную правку любого глагола (use, reset, save — тоже). */
export function commitEdit(project: string, command: string, what: string, from: any, to: any) {
  L.logEdit(project, command, what, from, to)
}

type Mutation = { layer: L.Layer; what: string; from?: any; to?: any } | { refuse: string }
type MutateCtx = { layer: L.Layer; raw: any; data: P.Data; name?: string; project: string }

/**
 * Правка слоя с проверкой допустимости (REQ-28, REQ-34): новые ошибки включённого набора и новые повисшие ссылки любых
 * наборов — отказ целиком. Принятая правка пишется в слой, снимок и файлы окон пересчитываются сразу.
 */
export function applyEdit(dir: string, command: string, mutate: (c: MutateCtx) => Mutation): { ok: boolean; text: string; what?: string } {
  const ps = L.profileState(dir)
  const m = mutate({ layer: ps.layer, raw: ps.raw, data: ps.data, name: ps.name, project: ps.project })
  if ("refuse" in m) return { ok: false, text: refused(ps.project, command, m.refuse) }
  const next = L.applyLayer(ps.raw, m.layer)
  // состояние после правки не должно стать хуже: из строк 1, 2, 7 (нет набора, допустим, имя игнорируется) — в 3…6 (REQ-28, REQ-33)
  const rowAfter = P.stateRow(next.name, next.data, ps.snapshot)
  if ([1, 2, 7].includes(ps.state.row) && [3, 4, 5, 6].includes(rowAfter.row)) return { ok: false, text: refused(ps.project, command, rowAfter.message || `правка сделала бы набор «${next.name}» недоступным`) }
  const before = P.checkData(ps.data, ps.name)
  const after = P.checkData(next.data, next.name)
  const known = new Set([...before.errors, ...before.warnings].map((x) => x.text))
  const created = [...after.errors, ...after.warnings].filter((x) => !known.has(x.text))
  if (created.length) return { ok: false, text: refused(ps.project, command, created.map((x) => x.text).join("; ")) }
  L.writeLayer(ps.project, m.layer)
  L.syncSnapshot(dir)
  const files = L.syncProjectFiles(dir)
  commitEdit(ps.project, command, m.what, m.from, m.to)
  const note = files.written.length || files.removed.length ? ` Файлы окон в деревьях задач пересчитаны: записано ${files.written.length}, снято ${files.removed.length}.` : ""
  return { ok: true, text: `Готово: ${m.what}.${note}`, what: m.what }
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

function parseResetSets(args: string[]): L.ResetForm | string {
  if (!args.length) return { kind: "name" }
  if (args[0] === "all") return args.length === 1 ? { kind: "all" } : "после all аргументов нет"
  const name = args[0]
  if (args.length === 1) return { kind: "set", name }
  const st = P.stageOfWord(args[1])
  if (!st || args.length > 2) return `этап «${args[1]}» не годится: develop, accept, plan, plan_accept (или русские названия)`
  return { kind: "cell", name, stage: st }
}

function resetEdit(dir: string, command: string, form: L.ResetForm): { ok: boolean; text: string } {
  const before = L.profileState(dir)
  const r = applyEdit(dir, command, ({ layer }) => {
    const x = L.layerReset(layer, form)
    if (!x.removed.length) return { refuse: "в локальном слое нечего снимать по этой форме" }
    return { layer: x.layer, what: `снято из локального слоя: ${x.removed.map(L.labelOf).join(", ")}`, from: x.removed.join(","), to: "(из файла)" }
  })
  if (!r.ok) return r
  // имя набора сменилось (reset имени или reset all): сказать, что включено и как изменились окна (как use)
  const after = L.profileState(dir)
  if (before.name === after.name) return r
  const now = after.name ? `Сейчас включён набор «${after.name}» (${after.nameSource === "layer" ? "локальное переключение" : "файл проекта"}); было ${before.name ? `«${before.name}»` : "набор не включён"}.` : "Набор не включён (имени нет ни в файле проекта, ни в локальном слое): модели — по spawn_models, файлы окон в деревьях задач сняты."
  return { ok: true, text: [r.text, now + " Перезапуск не нужен.", ...changeBody(before, after, dir)].join("\n") }
}

export function setsEditVerb(dir: string, verb: string, args: string[]): { ok: boolean; text: string } | undefined {
  const ps = L.profileState(dir)
  const command = `crew-sets ${verb}`
  const bad = (why: string) => ({ ok: false, text: refused(ps.project, command, why) })
  switch (verb) {
    case "set": {
      if (args.length !== 3) return bad("нужно: set <имя> <этап> <семья>/<ступень>")
      const [name, stageWord, cellWord] = args
      const st = P.stageOfWord(stageWord)
      if (!st) return bad(`этап «${stageWord}» не годится: develop, accept, plan, plan_accept (или русские названия)`)
      const cell = P.parseCell(cellWord)
      if (typeof cell === "string") return bad(cell)
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)}); новый — /crew-sets new ${name}`)
      return applyEdit(dir, command, ({ layer, raw, data }) => ({ layer: L.layerSetCell(layer, raw, name, st, cell), what: `набор «${name}»: этап «${P.STAGE_RU[st]}» — ${P.cellText(cell)}`, from: (data.sets as any)[name][st] ? P.cellText((data.sets as any)[name][st]) : undefined, to: P.cellText(cell) }))
    }
    case "unset": {
      if (args.length !== 2) return bad("нужно: unset <имя> <этап>")
      const [name, stageWord] = args
      const st = P.stageOfWord(stageWord)
      if (!st) return bad(`этап «${stageWord}» не годится: develop, accept, plan, plan_accept (или русские названия)`)
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)})`)
      if (!(ps.data.sets as any)[name][st]) return bad(`у набора «${name}» этап «${P.STAGE_RU[st]}» и так не описан`)
      return applyEdit(dir, command, ({ layer, raw, data }) => ({ layer: L.layerSetCell(layer, raw, name, st, null), what: `набор «${name}»: этап «${P.STAGE_RU[st]}» убран (модель — по spawn_models)`, from: P.cellText((data.sets as any)[name][st]), to: undefined }))
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
      return applyEdit(dir, command, ({ layer, raw }) => ({ layer: L.layerNewSet(layer, raw, name, cells), what: args.length === 3 ? `создан набор «${name}» как копия «${args[2]}»` : `создан пустой набор «${name}»`, from: undefined, to: cellsString(cells) }))
    }
    case "rename": {
      if (args.length !== 2) return bad("нужно: rename <имя> <новое>")
      const [a, b] = args
      const e = P.invalidSetName(b)
      if (e) return bad(e)
      if (!isObj(ps.data.sets?.[a])) return bad(`набора «${a}» нет (есть: ${listSets(ps.data)})`)
      if (isObj(ps.data.sets?.[b])) return bad(`набор «${b}» уже есть`)
      return applyEdit(dir, command, ({ layer, raw, data, name }) => {
        const cells: Record<string, P.Cell> = {}
        for (const [st, c] of P.cellsOf((data.sets as any)[a])) cells[st] = c
        let l = L.layerNewSet(layer, raw, b, cells)
        l = L.layerDeleteSet(l, raw, a)
        if (name === a) l = L.layerSetName(l, raw, b)
        return { layer: l, what: `набор «${a}» переименован в «${b}»${name === a ? " (включённое имя перенесено на новое; других ссылок на набор нет)" : " (других ссылок на набор нет)"}`, from: a, to: b }
      })
    }
    case "delete": {
      if (args.length !== 1) return bad("нужно: delete <имя>")
      const name = args[0]
      if (!isObj(ps.data.sets?.[name])) return bad(`набора «${name}» нет (есть: ${listSets(ps.data)})`)
      if (ps.name === name) return bad(`набор «${name}» включён: сначала включи другой (use) или сними имя (reset)`)
      return applyEdit(dir, command, ({ layer, raw, data }) => ({ layer: L.layerDeleteSet(layer, raw, name), what: `набор «${name}» удалён`, from: cellsString((data.sets as any)[name]), to: undefined }))
    }
    case "reset": {
      const form = parseResetSets(args)
      if (typeof form === "string") return bad(form)
      if (form.kind === "set" && !isObj(ps.data.sets?.[form.name]) && !Object.keys(ps.layer).some((k) => k === `set:${form.name}` || k.startsWith(`cell:${form.name}/`))) return bad(`набора «${form.name}» нет (есть: ${listSets(ps.data)})`)
      return resetEdit(dir, command, form)
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
    const m = /^(output|input)=(\d+)$/.exec(w)
    if (!m) return `лишний аргумент «${w}»: после context идут output=<n> и необязательный input=<n>`
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
function parseResetProfiles(args: string[]): L.ResetForm | string {
  if (!args.length) return "reset без аргумента — это /crew-sets reset (имя набора); здесь нужно reset <семья>, reset <семья>/<ступень> или reset all"
  if (args[0] === "all") return args.length === 1 ? { kind: "all" } : "после all аргументов нет"
  if (args.length > 1) return "лишний аргумент"
  const m = /^([^/]+)(?:\/(heavy|medium|light))?$/.exec(args[0])
  if (!m) return `«${args[0]}» — нужно <семья> или <семья>/<ступень>`
  return m[2] ? { kind: "profile", family: m[1], tier: m[2] } : { kind: "family", family: m[1] }
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
      return applyEdit(dir, command, ({ layer, raw, data }) => {
        let l = layer
        for (const t of tiers) l = L.layerSetProfile(l, raw, family, t, p)
        const old = tiers.map((t) => (data.profiles as any)?.[family]?.[t]).filter(Boolean)
        return { layer: l, what: `профиль ${family}/${tierWord}: ${p.model}, ${limitsText(p as any)}${tiers.length > 1 ? " (все три ступени разом)" : ""}`, from: old.length ? old.map((x: any) => `${x.model} ${x.context}`).join("|") : undefined, to: `${p.model} ${p.context}` }
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
      return applyEdit(dir, command, ({ layer, raw }) => {
        let l = layer
        for (const t of P.PROFILE_TIERS) l = L.layerSetProfile(l, raw, family, t, src?.[t] ?? { model: "" })
        return { layer: l, what: src ? `создана семья «${family}» как копия «${args[2]}»` : `создана семья «${family}» из трёх пустых записей («заполнить»: /crew-profiles set ${family} all <модель> <context> output=<n>)`, from: undefined, to: src ? args[2] : "3 пустых" }
      })
    }
    case "rename": {
      if (args.length !== 2) return bad("нужно: rename <семья> <новое>")
      const [a, b] = args
      const fe = P.invalidFamilyName(b)
      if (fe) return bad(fe)
      if (!isObj(ps.data.profiles?.[a])) return bad(`семьи «${a}» нет (есть: ${listFams(ps.data)})`)
      if (isObj(ps.data.profiles?.[b])) return bad(`семья «${b}» уже есть`)
      return applyEdit(dir, command, ({ layer, raw, data }) => {
        let l = layer
        for (const t of P.PROFILE_TIERS) {
          const p = (data.profiles as any)[a][t]
          if (p) {
            l = L.layerSetProfile(l, raw, b, t, p)
            l = L.layerSetProfile(l, raw, a, t, null)
          }
        }
        let refs = 0
        for (const [name, set] of Object.entries(isObj(data.sets) ? data.sets : {}))
          for (const [st, c] of P.cellsOf(set))
            if (c.family === a) {
              l = L.layerSetCell(l, raw, name, st, { family: b, tier: c.tier })
              refs++
            }
        return { layer: l, what: `семья «${a}» переименована в «${b}»; ссылок в наборах обновлено: ${refs}`, from: a, to: b }
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
      return applyEdit(dir, command, ({ layer, raw, data }) => {
        let l = layer
        for (const t of tier ? [tier] : P.PROFILE_TIERS) if ((data.profiles as any)[family][t]) l = L.layerSetProfile(l, raw, family, t, null)
        return { layer: l, what: tier ? `запись ${family}/${tier} удалена` : `семья «${family}» удалена`, from: tier ?? family, to: undefined }
      })
    }
    case "reset": {
      const form = parseResetProfiles(args)
      if (typeof form === "string") return bad(form)
      if ((form.kind === "family" || form.kind === "profile") && !Object.keys(ps.layer).some((k) => k.startsWith(`profile:${form.family}/`))) return bad(`в локальном слое нет правок семьи «${form.family}»`)
      return resetEdit(dir, command, form)
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Показ, use, check, save, разбор команд (шаг 11)

import path from "node:path"
import { PROFILES_README_URL } from "./paths.ts"
import { DEFAULT_SPAWN_MODELS, LIMIT_RU, fmtTokens, limitsText, loadConfig, settingsContext, verbUsageList } from "./core.ts"
import { projectFor, workingSettings } from "./settings.ts"
import { listTasks } from "./tasks.ts"
import * as W from "./profile-windows.ts"

const STAGE_ORDER = P.STAGES
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

export function setsTable(ps: L.PState): string {
  const names = setNames(ps.data)
  const src = ps.name ? (ps.nameSource === "layer" ? "локальное переключение (/crew-sets use)" : "файл проекта") : ""
  const lines = [`Наборы проекта ${ps.project}. Включён: ${ps.name ? `«${ps.name}» — источник имени: ${src}` : "нет (набор не применяется, модели — по spawn_models)"}.`]
  if (!names.length) lines.push(`Наборов нет. Готовый пример файла (справочник и наборы) — в разделе README о профилях моделей:\n${PROFILES_README_URL}\nСкопируйте пример в .opencode/crew-harness.json проекта (или передайте агенту: crew_config set) и коммитьте файл.`)
  else {
    const col = (n: string, st: P.Stage) => {
      const c = P.cellsOf((ps.data.sets as any)[n]).find(([s]) => s === st)
      return c ? P.cellText(c[1]) : "—"
    }
    const w0 = Math.max(4, ...names.map((n) => [...n].length))
    const widths = STAGE_ORDER.map((st) => Math.max([...P.STAGE_RU[st]].length, ...names.map((n) => [...col(n, st)].length)))
    lines.push(`  ${pad("имя", w0 + 2)}${STAGE_ORDER.map((st, i) => pad(P.STAGE_RU[st], widths[i] + 2)).join("")}`.trimEnd())
    for (const n of names) lines.push(`${n === ps.name ? "● " : "  "}${pad(n, w0 + 2)}${STAGE_ORDER.map((st, i) => pad(col(n, st), widths[i] + 2)).join("")}`.trimEnd())
    lines.push(`● — включённый набор. Подробно: ${ref("/crew-sets show [имя]", "show")}; включить: ${ref("/crew-sets use <имя>", "use")}.`)
  }
  if (ps.state.message) lines.push(`! ${ps.state.message}`)
  for (const w of ps.state.warnings) lines.push(`! ${w.text}`)
  const d = L.layerDiff(ps.raw, ps.layer)
  if (d.length) lines.push(`Локальные правки не в файле: ${d.length} (${d.map((x) => x.label).join(", ")}) — ${ref("/crew-sets save", "save")} перенесёт их в файл проекта; ${ref("/crew-sets check", "check")} — подробности.`)
  return lines.join("\n")
}

export function profilesTable(ps: L.PState): string {
  const fams = Object.keys(isObj(ps.data.profiles) ? ps.data.profiles : {}).sort()
  const lines = [`Справочник профилей проекта ${ps.project}: семья, ступень → модель, контекст.`]
  if (!fams.length) lines.push(`Справочник пуст. Готовый пример файла (справочник и наборы) — в разделе README о профилях моделей:\n${PROFILES_README_URL}\nСкопируйте пример в .opencode/crew-harness.json проекта (или передайте агенту: crew_config set) и коммитьте файл.`)
  for (const f of fams)
    for (const t of P.PROFILE_TIERS) {
      const p = (ps.data.profiles as any)[f][t]
      if (!p) continue
      lines.push(`  ${pad(f, 8)}${pad(t, 8)}${P.isEmptyProfile(p) ? "(пусто — заполнить)" : `${pad(p.model, 34)}${limitsText(winOf(p))}`}`)
    }
  if (ps.state.message) lines.push(`! ${ps.state.message}`)
  const d = L.layerDiff(ps.raw, ps.layer).filter((x) => x.key.startsWith("profile:"))
  if (d.length) lines.push(`Локальные правки не в файле: ${d.map((x) => x.label).join(", ")} — ${ref("/crew-profiles save", "save")}.`)
  return lines.join("\n")
}

export function showFamily(ps: L.PState, family?: string): string {
  if (!family) return profilesTable(ps)
  const f = (ps.data.profiles as any)?.[family]
  if (!isObj(f)) return `Семьи «${family}» нет (есть: ${Object.keys(isObj(ps.data.profiles) ? ps.data.profiles : {}).sort().join(", ") || "справочник пуст"}).`
  const lines = [`Семья «${family}» проекта ${ps.project}:`]
  for (const t of P.PROFILE_TIERS) {
    const p = f[t]
    if (!p) lines.push(`  ${t}: записи нет`)
    else if (P.isEmptyProfile(p)) lines.push(`  ${t}: пусто («заполнить»: ${ref(`/crew-profiles set ${family} ${t} <модель> <context> output=<n>`, "set")})`)
    else lines.push(`  ${t}: ${p.model} — ${limitsText(winOf(p))}`)
  }
  const refs = referencing(ps.data, family)
  lines.push(refs.length ? `Ссылаются наборы: ${refs.join("; ")}` : "Ни один набор на семью не ссылается.")
  return lines.join("\n")
}

export function showSet(ps: L.PState, name: string | undefined, dir: string): string {
  const n = name ?? ps.name
  if (!n) return `Набор не включён (имени нет ни в файле проекта, ни в локальном слое). Покажи любой: ${ref("/crew-sets show <имя>", "show")}; включить: ${ref("/crew-sets use <имя>", "use")}.`
  const set = (ps.data.sets as any)?.[n]
  if (!isObj(set)) return `Набора «${n}» нет (есть: ${listSets(ps.data)}).`
  const root = mainFolder(dir)
  const lines = [`Набор «${n}»${n === ps.name ? ` — включён (имя из: ${ps.nameSource === "layer" ? "локальное переключение" : "файл проекта"})` : " — не включён"}:`]
  for (const st of STAGE_ORDER) {
    const cell = P.cellsOf(set).find(([s]) => s === st)?.[1]
    if (!cell) {
      lines.push(`  ${P.STAGE_RU[st]}: не описан — модель по spawn_models`)
      continue
    }
    const fam = (ps.data.profiles as any)?.[cell.family]
    const prof = (t: P.PTier) => (isObj(fam?.[t]) && !P.isEmptyProfile(fam[t]) ? (fam[t] as any) : undefined)
    const front = st === "develop" || st === "plan"
    if (cell.tier === "task") {
      lines.push(`  ${P.STAGE_RU[st]}: ${P.cellText(cell)} — по ступени задачи: ${P.PROFILE_TIERS.map((t) => `${t} → ${prof(t)?.model ?? "нет профиля"}`).join(", ")}`)
      if (front) {
        for (const t of P.PROFILE_TIERS) if (prof(t)) lines.push(`      контекст профиля в рабочем дереве задачи (${t}): ${limitsText(winOf(prof(t)))}`)
      } else {
        for (const t of P.PROFILE_TIERS) if (prof(t)) lines.push(`      ${t}: ${reviewerWindowLine(root, prof(t).model)}`)
      }
    } else {
      const p = prof(cell.tier)
      lines.push(`  ${P.STAGE_RU[st]}: ${P.cellText(cell)} → ${p?.model ?? "нет профиля"}`)
      if (p) lines.push(front ? `      контекст профиля в рабочем дереве задачи: ${limitsText(winOf(p))}` : `      ${reviewerWindowLine(root, p.model)}`)
    }
  }
  for (const e of P.checkData(ps.data, n).errors) lines.push(`! ${e.text}`)
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

function updownLines(before: Map<string, P.Win>, after: Map<string, P.Win>, root: string): string[] {
  const out: string[] = []
  const reserved = W.reservedOf(root)?.value
  const fmt = (w: P.Win | undefined) => (w ? limitsText(w) : "контекста нет в рукописных настройках")
  const shrunk: string[] = []
  for (const m of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(m) ?? chainAsWin(root, m)
    const a = after.get(m) ?? chainAsWin(root, m)
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    out.push(`  ${m}: ${fmt(b)} → ${after.has(m) ? fmt(a) : `${fmt(a)} (набор контекст не задаёт — из рукописных настроек)`}`)
    const bt = b ? (b.input ?? b.context) : undefined
    const at = a ? (a.input ?? a.context) : undefined
    if (bt !== undefined && at !== undefined && at < bt) shrunk.push(`${m} (порог сжатия ${reserved !== undefined ? `${fmtTokens(bt - reserved)} → ${fmtTokens(at - reserved)}` : `контекст ${fmtTokens(bt)} → ${fmtTokens(at)}`})`)
  }
  if (!out.length) out.push("  контексты моделей этого набора совпадают с прежними — файл пределов не изменился")
  if (shrunk.length) out.push(`Контекст уменьшен: ${shrunk.join(", ")}. Вкладки, чей контекст уже больше нового порога, сожмутся на следующем ходе (порог — контекст минус compaction.reserved; у моделей с вводом — ввод минус reserved).`)
  return out
}

/** Модели приёмки и приёмки плана набора (для строки про окно приёмки). */
function reviewerModels(data: P.Data, name: string): string[] {
  const out = new Set<string>()
  for (const [st, c] of P.cellsOf((data.sets as any)?.[name])) {
    if (st !== "accept" && st !== "plan_accept") continue
    for (const ref of P.referencedProfiles(c)) {
      if (c.tier === "task" && ref.tier !== "medium") continue
      const p = (data.profiles as any)?.[c.family]?.[ref.tier]
      if (p && !P.isEmptyProfile(p)) out.add(p.model)
    }
  }
  return [...out]
}

/** Что изменилось в окнах при смене набора (use, reset): было → стало, окно приёмки, заметки об окнах. */
function changeBody(before: L.PState, after: L.PState, dir: string): string[] {
  const root = mainFolder(dir)
  const am = windowsOfActive(after)
  const lines = ["Контекст сессий в рабочих деревьях задач (было → стало), применится на следующем ходе каждой сессии:", ...updownLines(windowsOfActive(before), am, root)]
  if (after.state.usable) for (const m of reviewerModels(after.state.usable.data, after.state.usable.name)) lines.push(`Приёмка и приёмка плана: ${reviewerWindowLine(root, m)}.`)
  for (const w of W.windowNotes(root, W.qualifying(after.project, listTasks(after.project)), am)) lines.push(`Предупреждение: ${w}`)
  return lines
}

async function useSet(dir: string, name: string | undefined, deps: CmdDeps): Promise<string> {
  const ps = L.profileState(dir)
  const command = "crew-sets use"
  if (!name) return refused(ps.project, command, `нужно: use <имя>; наборы: ${listSets(ps.data)}`)
  if (!isObj(ps.data.sets?.[name])) return refused(ps.project, command, `набора «${name}» нет; наборы: ${listSets(ps.data)}`)
  const chk = P.checkData(ps.data, name)
  if (chk.errors.length) return refused(ps.project, command, `набор «${name}» нельзя включить: ${chk.errors.map((e) => e.text).join("; ")}`)
  L.writeLayer(ps.project, L.layerSetName(ps.layer, ps.raw, name))
  L.syncSnapshot(dir)
  const files = L.syncProjectFiles(dir)
  const after = L.profileState(dir)
  commitEdit(ps.project, command, "включён набор", ps.name, name)
  const models = windowsOfActive(after)
  const fileSet = typeof ps.raw?.profile_set === "string" ? ps.raw.profile_set : undefined
  const lines: string[] = []
  lines.push(`Включён набор «${name}» (локальное переключение, без коммита; ${ps.name ? `было «${ps.name}»` : "набор не был включён"}${fileSet && fileSet !== name ? `; в файле проекта по умолчанию «${fileSet}»` : ""}). Перезапуск не нужен.`)
  const cellOf = (st: P.Stage) => {
    const c = P.cellsOf((after.data.sets as any)[name]).find(([s]) => s === st)
    return c ? P.cellText(c[1]) : "не описан (spawn_models)"
  }
  lines.push("Этапы: " + STAGE_ORDER.map((st) => `${P.STAGE_RU[st]} — ${cellOf(st)}`).join("; ") + ".")
  lines.push(...changeBody(ps, after, dir))
  const wts = W.qualifying(ps.project, listTasks(ps.project))
  lines.push(`Файлы окон: записано ${files.written.length}, снято ${files.removed.length}; задач с рабочим деревом сейчас ${wts.length}. Задачи без рабочего дерева (исполнитель в основной папке) окон профиля не получают.`)
  const cfg = loadConfig(dir)
  if (cfg.reviewer === "integrator" && P.cellsOf((after.data.sets as any)[name]).some(([s, c]) => (s === "accept" || s === "plan_accept") && c.tier !== "task")) lines.push("Предупреждение: в проекте reviewer: integrator — приёмку ведёт вкладка интегратора на её модели; набор приёмку не меняет (модель открытой вкладки плагин не переключает).")
  for (const w of after.state.warnings) lines.push(`Предупреждение: ${w.text}`)
  for (const w of await catalogWarnings(models, deps, false)) lines.push(`Предупреждение: ${w}`)
  return lines.join("\n")
}

async function checkReport(dir: string, deps: CmdDeps): Promise<string> {
  const ps = L.profileState(dir)
  const root = mainFolder(dir)
  const lines = [`Проверка профилей проекта ${ps.project}${deps.version ? ` (OpenCode ${deps.version})` : ""}: данные не меняются.`]
  if (deps.catalogNote) lines.push(`Каталог моделей OpenCode: ${deps.catalogNote}.`)
  lines.push(`Включён: ${ps.name ? `«${ps.name}» (${ps.nameSource === "layer" ? "локальное переключение" : "файл проекта"}), строка ${ps.state.row} таблицы исходов` : "набор не включён"}.`)
  if (ps.state.message) lines.push(`! ${ps.state.message}`)
  const all = P.checkData(ps.data, ps.name)
  for (const e of all.errors) lines.push(`! ${e.text}`)
  for (const w of all.warnings) lines.push(`! ${w.text}`)
  // пустые записи, на которые кто-то ссылается (пустую ступень без ссылок не называем); конфликты окон других наборов
  for (const name of setNames(ps.data)) {
    if (name === ps.name) continue
    for (const e of P.emptyRefs(ps.data, name)) lines.push(`! ${e.text}`)
    for (const c of P.windowsOfSet(ps.data, name).conflicts) lines.push(`! ${c.text} — use этого набора откажет`)
  }
  // расхождение с spawn_models (набор default повторяет прежнее поведение только при равенстве)
  const cfg = loadConfig(dir)
  for (const t of P.PROFILE_TIERS) {
    const p = (ps.data.profiles as any)?.claude?.[t]
    const want = cfg.spawnModels[t] ?? DEFAULT_SPAWN_MODELS[t]
    if (isObj(p) && !P.isEmptyProfile(p) && p.model !== want) lines.push(`! модель профиля claude/${t} (${p.model}) не равна spawn_models.${t} (${want}): набор с клетками claude/task изменит выбор моделей новых сессий`)
  }
  const models = windowsOfActive(ps)
  for (const w of await windowWarnings(ps, models, dir, deps, true)) lines.push(`! ${w}`)
  for (const p of L.problemsOf(ps)) if (!lines.some((l) => l.includes(p))) lines.push(`! ${p}`)
  const work = ps.folder ? workingSettings(ps.folder).raw : undefined
  const d = L.layerDiff(ps.raw, ps.layer, work)
  if (d.length) {
    lines.push("Локальные правки (не в файле проекта):")
    for (const x of d) lines.push(`  ${x.label}${x.inWorking ? " — записано в рабочую копию, ждёт коммита" : " — только в локальном слое"}${x.fileChanged ? "; в файле теперь иначе, чем было при правке (действует локальное значение)" : ""}`)
  }
  if (ps.state.usable) for (const m of reviewerModels(ps.state.usable.data, ps.state.usable.name)) lines.push(`Приёмка и приёмка плана: ${reviewerWindowLine(root, m)}.`)
  if (lines.length === 2) lines.push("Замечаний нет.")
  return lines.join("\n")
}

function saveReport(dir: string, force: boolean): string {
  const ps = L.profileState(dir)
  const command = `crew-sets save${force ? " force" : ""}`
  const r = L.saveLayer(dir, force)
  if (!r.ok) return refused(ps.project, command, r.error ?? "не записано")
  commitEdit(ps.project, command, `save: записано ${r.saved.length}, пропущено ${r.skipped.length}`, undefined, r.saved.join(","))
  const lines = [`Перенесено в рабочую копию ${fileName(r.file!)}: ${r.saved.length} записей${r.saved.length ? ` (${r.saved.map(L.labelOf).join(", ")})` : ""}. Плагин не коммитит: закоммить файл в ветку настроек — после коммита записи слоя исчезнут сами.`]
  if (r.skipped.length) lines.push(`Пропущено — в файле значение уже иное, чем было при правке (${r.skipped.length}): ${r.skipped.map((x) => `${x.label} (${x.why})`).join("; ")}. Что делать: reset <запись> (оставить файл) или save force (перезаписать файл локальным значением).`)
  return lines.join("\n")
}

async function dispatch(kind: "sets" | "profiles", dir: string, text: string, deps: CmdDeps): Promise<string> {
  const w = words(text)
  const verb = w[0]
  const args = w.slice(1)
  windowMenu = !!deps.window
  const verbs = kind === "sets" ? SETS_VERBS : PROFILES_VERBS
  const bad = (why: string) => `${why}\n${usageLine(kind)}`
  if (!verb) {
    const ps = L.profileState(dir)
    return kind === "sets" ? setsTable(ps) : profilesTable(ps)
  }
  if (!verbs.includes(verb)) return bad(`Неизвестный глагол «${verb}».`)
  switch (verb) {
    case "show": {
      if (args.length > 1) return bad("show принимает не больше одного имени.")
      const ps = L.profileState(dir)
      return kind === "sets" ? showSet(ps, args[0], dir) : showFamily(ps, args[0])
    }
    case "use":
      if (kind !== "sets" || args.length !== 1) return bad("use принимает ровно одно имя набора.")
      return useSet(dir, args[0], deps)
    case "check":
      if (args.length) return bad("check без аргументов.")
      return checkReport(dir, deps)
    case "save":
      if (args.length > 1 || (args.length === 1 && args[0] !== "force")) return bad("save принимает только слово force.")
      return saveReport(dir, args[0] === "force")
  }
  const r = kind === "sets" ? setsEditVerb(dir, verb, args) : profilesEditVerb(dir, verb, args)
  return r ? r.text : bad(`Глагол «${verb}» не обработан.`)
}

export const runSetsCommand = (dir: string, text: string, deps: CmdDeps = {}): Promise<string> => dispatch("sets", dir, text, deps)
export const runProfilesCommand = (dir: string, text: string, deps: CmdDeps = {}): Promise<string> => dispatch("profiles", dir, text, deps)
