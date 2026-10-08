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
}

export const SETS_VERBS = ["show", "use", "reset", "set", "unset", "new", "rename", "delete", "check", "save"]
export const PROFILES_VERBS = ["show", "set", "new", "rename", "delete", "reset", "check", "save"]

const refused = (project: string, command: string, why: string): string => {
  L.logRefused(project, command, why)
  return `Не сделано: ${why}. Данные не тронуты.`
}
const usageLine = (cmd: "sets" | "profiles"): string =>
  cmd === "sets"
    ? "Глаголы /crew-sets: show [имя] | use <имя> | reset [<имя> [<этап>] | all] | set <имя> <этап> <семья>/<ступень> | unset <имя> <этап> | new <имя> [from <имя>] | rename <а> <б> | delete <имя> | check | save [force]. Этапы: develop, accept, plan, plan_accept (или разработка, приёмка, планирование, приёмка-плана). Без аргумента — таблица наборов."
    : "Глаголы /crew-profiles: show [<семья>] | set <семья> <ступень|all> <модель> <context> output=<n> [input=<n>] | new <семья> [from <семья>] | rename <а> <б> | delete <семья> [<ступень>] | reset [<семья>[/<ступень>] | all] | check | save [force]. Без аргумента — таблица справочника."

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
  const sync = L.syncSnapshot(dir)
  const files = L.syncProjectFiles(dir)
  commitEdit(ps.project, command, m.what, m.from, m.to)
  const note = files.written.length || files.removed.length ? ` Файлы окон в деревьях задач пересчитаны: записано ${files.written.length}, снято ${files.removed.length}.` : ""
  void sync
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

function parseResetSets(args: string[], data: P.Data): L.ResetForm | string {
  if (!args.length) return { kind: "name" }
  if (args[0] === "all") return args.length === 1 ? { kind: "all" } : "после all аргументов нет"
  const name = args[0]
  if (args.length === 1) return { kind: "set", name }
  const st = P.stageOfWord(args[1])
  if (!st || args.length > 2) return `этап «${args[1]}» не годится: develop, accept, plan, plan_accept (или русские названия)`
  void data
  return { kind: "cell", name, stage: st }
}

function resetEdit(dir: string, command: string, form: L.ResetForm): { ok: boolean; text: string } {
  return applyEdit(dir, command, ({ layer }) => {
    const r = L.layerReset(layer, form)
    if (!r.removed.length) return { refuse: "в локальном слое нечего снимать по этой форме" }
    return { layer: r.layer, what: `снято из локального слоя: ${r.removed.map(L.labelOf).join(", ")}`, from: r.removed.join(","), to: "(из файла)" }
  })
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
      const form = parseResetSets(args, ps.data)
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
        return { layer: l, what: `профиль ${family}/${tierWord}: ${p.model}, ${P.winText(p as any)}${tiers.length > 1 ? " (все три ступени разом)" : ""}`, from: old.length ? old.map((x: any) => `${x.model} ${x.context}`).join("|") : undefined, to: `${p.model} ${p.context}` }
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
