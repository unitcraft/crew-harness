// ЛОКАЛЬНЫЙ СЛОЙ ПРАВОК ПРОФИЛЕЙ, ДЕЙСТВУЮЩИЕ ДАННЫЕ И СНИМОК (задача 003, ADR-0008).
//
// Команды окна правят профили и наборы СРАЗУ, без коммита файла проекта: правки лежат слоем поверх закоммиченного
// файла (ящик плагина, profiles/<проект>.layer.json). Слой — плоская карта записей по ключам:
//   name                       {value: "<имя>", base: "<имя из файла или null>"}     включённое локально имя
//   profile:<семья>/<ступень>  {value: профиль | null, base: профиль | null}          null у value — пометка об удалении
//   set:<имя>                  {mode: "new" | "deleted", base: клетки файла | null}   набор создан слоем / убран слоем
//   cell:<имя>/<этап>          {value: клетка | null, base: клетка | null}
// base — значение файла на момент правки: по нему видно «в файле теперь иначе», и save не затирает чужое.
// Действующие данные = файл со слоем поверх (запись слоя главнее записи файла по ключу). Снимок — последнее допустимое
// состояние трёх ключей (profiles/<проект>.snapshot.json), пишется проходом сервиса; читатели его только читают.

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BASE } from "./paths.ts"
import { projectFor, rawSettingsFor, workingSettings, writeSettings } from "./settings.ts"
import { log, projectOf, settingsContext } from "./core.ts"
import * as P from "./profiles.ts"
import { type Task, listTasks } from "./tasks.ts"
import { type SyncReport, type WindowPlan, qualifying, syncTaskWindow, syncWindows, windowNotes, windowPlanOf, windowProblems } from "./profile-windows.ts"

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const canonical = (v: any): string => JSON.stringify(v ?? null, (_k, x) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x))
export const same = (a: any, b: any): boolean => canonical(a) === canonical(b)

export type Layer = Record<string, any>

const dir = () => path.join(BASE, "profiles")
const keyOfProject = (project: string) => project.replace(/[^A-Za-z0-9_-]/g, "_")
export const layerFile = (project: string) => path.join(dir(), `${keyOfProject(project)}.layer.json`)
export const snapshotFile = (project: string) => path.join(dir(), `${keyOfProject(project)}.snapshot.json`)

function writeAtomic(file: string, text: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}
function readJsonFile(file: string): any {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""))
  } catch {
    return undefined
  }
}

export function readLayer(project: string): Layer {
  const v = readJsonFile(layerFile(project))
  return isObj(v) ? v : {}
}
export function writeLayer(project: string, layer: Layer) {
  if (!Object.keys(layer).length) return void rmSync(layerFile(project), { force: true })
  const text = JSON.stringify(layer, null, 1)
  if (existsSync(layerFile(project)) && readFileSync(layerFile(project), "utf8") === text) return
  writeAtomic(layerFile(project), text)
}

// ---- значения файла по ключам слоя ---------------------------------------------------------------------------------

/** Значение ключа слоя в данных файла (null — нет). Для set: — клетки набора. */
export function fileValue(raw: any, key: string): any {
  if (key === "name") return typeof raw?.profile_set === "string" ? raw.profile_set : null
  if (key.startsWith("profile:")) {
    const [f, t] = key.slice(8).split("/")
    return clone(raw?.model_profiles?.[f]?.[t]) ?? null
  }
  if (key.startsWith("set:")) return isObj(raw?.profile_sets?.[key.slice(4)]) ? clone(raw.profile_sets[key.slice(4)]) : null
  if (key.startsWith("cell:")) {
    const [n, st] = key.slice(5).split("/")
    return clone(raw?.profile_sets?.[n]?.[st]) ?? null
  }
  return null
}
const cellKey = (set: string, stage: string) => `cell:${set}/${stage}`
const setOfCellKey = (key: string) => key.slice(5).split("/")[0]

/** Файл со слоем поверх → действующие данные и имя набора. */
export function applyLayer(raw: any, layer: Layer): { data: P.Data; name?: string; nameSource?: "layer" | "file" } {
  let profiles: any = isObj(raw?.model_profiles) ? clone(raw.model_profiles) : undefined
  let sets: any = isObj(raw?.profile_sets) ? clone(raw.profile_sets) : undefined
  const keys = Object.keys(layer)
  for (const key of keys.filter((k) => k.startsWith("profile:"))) {
    const [f, t] = key.slice(8).split("/")
    const e = layer[key]
    if (!isObj(e)) continue
    if (e.value === null || e.value === undefined) {
      if (profiles?.[f]) {
        delete profiles[f][t]
        if (!Object.keys(profiles[f]).length) delete profiles[f]
      }
    } else {
      profiles ??= {}
      ;(profiles[f] ??= {})[t] = clone(e.value)
    }
  }
  for (const key of keys.filter((k) => k.startsWith("set:"))) {
    const e = layer[key]
    const name = key.slice(4)
    if (!isObj(e)) continue
    if (e.mode === "deleted") {
      if (sets) delete sets[name]
    } else if (e.mode === "new") {
      sets ??= {}
      sets[name] = {}
    }
  }
  for (const key of keys.filter((k) => k.startsWith("cell:"))) {
    const e = layer[key]
    const [name, st] = key.slice(5).split("/")
    if (!isObj(e) || !sets || !isObj(sets[name])) continue
    if (e.value === null || e.value === undefined) delete sets[name][st]
    else sets[name][st] = clone(e.value)
  }
  const ln = layer.name
  if (isObj(ln) && typeof ln.value === "string") return { data: { profiles, sets }, name: ln.value, nameSource: "layer" }
  const fn = typeof raw?.profile_set === "string" && raw.profile_set ? raw.profile_set : undefined
  return { data: { profiles, sets }, name: fn, nameSource: fn ? "file" : undefined }
}

/** Убрать из слоя записи, равные файлу (после коммита): слой после сохранения и коммита пуст. */
export function pruneLayer(raw: any, layer: Layer): Layer {
  const out: Layer = {}
  const isNewSet = (n: string) => layer[`set:${n}`]?.mode === "new"
  for (const [key, e] of Object.entries(layer)) {
    if (!isObj(e)) continue
    const file = fileValue(raw, key)
    if (key === "name") {
      if (e.value === file) continue
    } else if (key.startsWith("profile:")) {
      if (same(e.value ?? null, file)) continue
    } else if (key.startsWith("cell:")) {
      if (isNewSet(setOfCellKey(key))) {
        out[key] = e
        continue
      }
      if (same(e.value ?? null, file)) continue
    } else if (key.startsWith("set:")) {
      const name = key.slice(4)
      if (e.mode === "deleted" && file === null) continue
      if (e.mode === "new" && file !== null) {
        const mine: Record<string, any> = {}
        for (const [k, c] of Object.entries(layer)) if (k.startsWith(`cell:${name}/`) && isObj(c) && c.value) mine[k.split("/")[1]] = c.value
        if (same(mine, file)) continue
      }
    }
    out[key] = e
  }
  // клетки набора, чья запись `set:` ушла как равная файлу, уходят вместе с ней
  for (const key of Object.keys(out)) if (key.startsWith("cell:") && layer[`set:${setOfCellKey(key)}`]?.mode === "new" && !out[`set:${setOfCellKey(key)}`]) delete out[key]
  return out
}

// ---- правки слоя (возвращают новый слой; base сохраняется от первой правки записи) -----------------------------------

function put(layer: Layer, raw: any, key: string, patch: Record<string, any>, drop = false): Layer {
  const out = clone(layer)
  if (drop) delete out[key]
  else out[key] = { ...(out[key] ?? { base: fileValue(raw, key) }), ...patch }
  return out
}
export const layerSetName = (layer: Layer, raw: any, name: string): Layer => put(layer, raw, "name", { value: name })
export const layerSetProfile = (layer: Layer, raw: any, fam: string, tier: string, p: P.Profile | null): Layer => put(layer, raw, `profile:${fam}/${tier}`, { value: p ? clone(p) : null })
/** Клетка набора (set существует в данных или создан слоем); null убирает клетку. */
export function layerSetCell(layer: Layer, raw: any, set: string, stage: string, cell: P.Cell | null): Layer {
  const key = cellKey(set, stage)
  if (layer[`set:${set}`]?.mode === "new") {
    if (cell) return put(layer, raw, key, { value: clone(cell), base: null })
    return put(layer, raw, key, {}, true)
  }
  return put(layer, raw, key, { value: cell ? clone(cell) : null })
}
/** Новый набор с клетками (имя свободно в действующих данных). */
export function layerNewSet(layer: Layer, raw: any, name: string, cells: Partial<Record<string, P.Cell>>): Layer {
  let out = clone(layer)
  for (const k of Object.keys(out)) if (k.startsWith(`cell:${name}/`)) delete out[k]
  out[`set:${name}`] = { mode: "new", base: fileValue(raw, `set:${name}`) }
  for (const [st, c] of Object.entries(cells)) if (c) out[cellKey(name, st)] = { value: clone(c), base: null }
  return out
}
/** Удалить набор: запись слоя о новом наборе уходит; набор файла помечается удалённым. */
export function layerDeleteSet(layer: Layer, raw: any, name: string): Layer {
  const out = clone(layer)
  for (const k of Object.keys(out)) if (k.startsWith(`cell:${name}/`)) delete out[k]
  delete out[`set:${name}`]
  if (fileValue(raw, `set:${name}`) !== null) out[`set:${name}`] = { mode: "deleted", base: fileValue(raw, `set:${name}`) }
  return out
}

export type ResetForm = { kind: "name" } | { kind: "set"; name: string } | { kind: "cell"; name: string; stage: string } | { kind: "family"; family: string } | { kind: "profile"; family: string; tier: string } | { kind: "all" }
/** Снять записи слоя по форме reset; возвращает слой и ключи снятых записей. */
export function layerReset(layer: Layer, form: ResetForm): { layer: Layer; removed: string[] } {
  const hit = (key: string): boolean => {
    switch (form.kind) {
      case "all":
        return true
      case "name":
        return key === "name"
      case "set":
        return key === `set:${form.name}` || key.startsWith(`cell:${form.name}/`)
      case "cell":
        return key === cellKey(form.name, form.stage)
      case "family":
        return key.startsWith(`profile:${form.family}/`)
      case "profile":
        return key === `profile:${form.family}/${form.tier}`
    }
  }
  const out: Layer = {}
  const removed: string[] = []
  for (const [k, e] of Object.entries(layer)) (hit(k) ? removed.push(k) : (out[k] = e))
  return { layer: out, removed }
}

// ---- сравнение слоя с файлом ----------------------------------------------------------------------------------------

export function labelOf(key: string): string {
  if (key === "name") return "имя включённого набора"
  if (key.startsWith("profile:")) return `профиль ${key.slice(8)}`
  if (key.startsWith("set:")) return `набор «${key.slice(4)}»`
  const [n, st] = key.slice(5).split("/")
  return `клетка «${P.STAGE_RU[st as P.Stage] ?? st}» набора «${n}»`
}
export type Diff = { key: string; label: string; /** запись слоя отличается от файла (несохранённая) */ unsaved: boolean; /** значение файла с момента правки изменилось */ fileChanged: boolean; /** уже записано в рабочую копию файла, ждёт коммита */ inWorking: boolean }
/** Записи слоя против закоммиченного файла (raw) и рабочей копии (working). */
export function layerDiff(raw: any, layer: Layer, working?: any): Diff[] {
  const out: Diff[] = []
  for (const [key, e] of Object.entries(layer)) {
    if (!isObj(e)) continue
    if (key.startsWith("cell:") && layer[`set:${setOfCellKey(key)}`]?.mode === "new") continue // клетки нового набора идут вместе с ним
    const mine = key.startsWith("set:") ? (e.mode === "deleted" ? null : cellsOfNewSet(layer, key.slice(4))) : key === "name" ? e.value : (e.value ?? null)
    const file = fileValue(raw, key)
    if (same(mine, file)) continue
    const fileChanged = !same(e.base ?? null, file)
    const inWorking = working ? same(mine, fileValue(working, key)) : false
    out.push({ key, label: labelOf(key), unsaved: true, fileChanged, inWorking })
  }
  return out
}
function cellsOfNewSet(layer: Layer, name: string): Record<string, any> {
  const mine: Record<string, any> = {}
  for (const [k, c] of Object.entries(layer)) if (k.startsWith(`cell:${name}/`) && isObj(c) && c.value) mine[k.split("/")[1]] = c.value
  return mine
}

// ---- состояние проекта -----------------------------------------------------------------------------------------------

export type PState = {
  project: string
  /** папка настроек проекта (новая форма опций) или undefined */
  folder?: string
  raw: any
  layer: Layer
  data: P.Data
  name?: string
  nameSource?: "layer" | "file"
  snapshot?: P.Snapshot
  state: P.State
}

export function readSnapshot(project: string): P.Snapshot | undefined {
  const v = readJsonFile(snapshotFile(project))
  return isObj(v) && typeof v.name === "string" && isObj(v.sets) ? (v as P.Snapshot) : undefined
}
export function writeSnapshot(project: string, s: P.Snapshot) {
  const text = JSON.stringify(s, null, 1)
  try {
    if (readFileSync(snapshotFile(project), "utf8") === text) return
  } catch {}
  writeAtomic(snapshotFile(project), text)
}
export const dropSnapshot = (project: string) => void rmSync(snapshotFile(project), { force: true })

/** Состояние профилей проекта каталога dir: файл, слой, действующие данные, снимок и строка таблицы исходов. */
export function profileState(dir0: string): PState {
  const { projects, local } = settingsContext()
  const project = projectOf(dir0, projects)
  const raw = rawSettingsFor(dir0, projects, local) ?? {}
  const layer = pruneLayer(raw, readLayer(project))
  const applied = applyLayer(raw, layer)
  const snapshot = readSnapshot(project)
  const state = P.stateRow(applied.name, applied.data, snapshot)
  return { project, folder: projectFor(dir0, projects)?.dir, raw, layer, data: applied.data, name: applied.name, nameSource: applied.nameSource, snapshot, state }
}

/** Проход сервиса: снимок создаётся на первом допустимом проходе при включённом наборе и обновляется, отбрасывается на строках 1 и 7;
 *  записи слоя, равные файлу, убираются. Возвращает состояние. */
export function syncSnapshot(dir0: string): PState {
  const { projects, local } = settingsContext()
  const project = projectOf(dir0, projects)
  const raw = rawSettingsFor(dir0, projects, local) ?? {}
  const stored = readLayer(project)
  const layer = pruneLayer(raw, stored)
  if (!same(stored, layer)) writeLayer(project, layer)
  const st = profileState(dir0)
  if (st.state.row === 2 && st.name) writeSnapshot(project, P.snapshotOf(st.data, st.name))
  else if (st.state.row === 1 || st.state.row === 7) dropSnapshot(project)
  return profileState(dir0)
}

/** Подпись входных данных: когда меняется, файлы окон и снимок пересчитываются. */
export function stateSignature(ps: PState): string {
  return createHash("md5").update(canonical({ l: ps.layer, f: [ps.raw?.model_profiles, ps.raw?.profile_sets, ps.raw?.profile_set], s: ps.snapshot })).digest("hex")
}

// ---- save ------------------------------------------------------------------------------------------------------------

export type SaveResult = { ok: boolean; error?: string; file?: string; saved: string[]; skipped: { key: string; label: string; why: string }[] }

/**
 * Перенести записи слоя в рабочую копию файла проекта (три ключа; остальное в файле не трогается). Запись, значение
 * которой в файле с момента правки изменилось, пропускается и перечисляется; force перезаписывает перечисленное.
 */
export function saveLayer(dir0: string, force = false): SaveResult {
  const ps = profileState(dir0)
  if (!ps.folder) return { ok: false, error: "проект задан прежней формой опций: писать некуда (переведи его на папку настроек)", saved: [], skipped: [] }
  const work = workingSettings(ps.folder).raw
  const profiles: any = isObj(work.model_profiles) ? clone(work.model_profiles) : {}
  const sets: any = isObj(work.profile_sets) ? clone(work.profile_sets) : {}
  let name: any = typeof work.profile_set === "string" ? work.profile_set : null
  const saved: string[] = []
  const skipped: SaveResult["skipped"] = []
  const entries = Object.entries(ps.layer)
  const decide = (key: string, mine: any, base: any): boolean => {
    const committed = fileValue(ps.raw, key)
    const worked = key === "name" ? name : key.startsWith("profile:") ? clone(profiles[key.slice(8).split("/")[0]]?.[key.slice(8).split("/")[1]]) ?? null : key.startsWith("set:") ? (isObj(sets[key.slice(4)]) ? clone(sets[key.slice(4)]) : null) : clone(sets[key.slice(5).split("/")[0]]?.[key.slice(5).split("/")[1]]) ?? null
    if (same(worked, mine)) {
      saved.push(key)
      return false // уже так
    }
    if (!force && (!same(committed, base) || !same(worked, base))) {
      skipped.push({ key, label: labelOf(key), why: `в файле значение уже иное, чем было при правке (${same(committed, base) ? "в рабочей копии" : "в закоммиченном файле"})` })
      return false
    }
    return true
  }
  for (const [key, e] of entries.filter(([k]) => k === "name" || k.startsWith("profile:"))) {
    if (!isObj(e)) continue
    const mine = e.value ?? null
    if (!decide(key, mine, e.base ?? null)) continue
    if (key === "name") name = e.value
    else {
      const [f, t] = key.slice(8).split("/")
      if (mine === null) {
        if (profiles[f]) delete profiles[f][t]
        if (profiles[f] && !Object.keys(profiles[f]).length) delete profiles[f]
      } else (profiles[f] ??= {})[t] = clone(mine)
    }
    saved.push(key)
  }
  for (const [key, e] of entries.filter(([k]) => k.startsWith("set:"))) {
    if (!isObj(e)) continue
    const n = key.slice(4)
    const mine = e.mode === "deleted" ? null : cellsOfNewSet(ps.layer, n)
    if (!decide(key, mine, e.base ?? null)) continue
    if (mine === null) delete sets[n]
    else sets[n] = clone(mine)
    saved.push(key)
  }
  for (const [key, e] of entries.filter(([k]) => k.startsWith("cell:"))) {
    if (!isObj(e) || ps.layer[`set:${setOfCellKey(key)}`]?.mode === "new") continue
    const [n, st] = key.slice(5).split("/")
    if (!isObj(sets[n]) && e.value) {
      skipped.push({ key, label: labelOf(key), why: "набора нет в файле" })
      continue
    }
    if (!decide(key, e.value ?? null, e.base ?? null)) continue
    if (e.value === null || e.value === undefined) delete sets[n][st]
    else (sets[n] ??= {})[st] = clone(e.value)
    saved.push(key)
  }
  const values: Record<string, any> = {
    model_profiles: Object.keys(profiles).length ? profiles : null,
    profile_sets: Object.keys(sets).length ? sets : null,
    profile_set: name ?? null,
  }
  const file = writeSettings(ps.folder, values)
  return { ok: true, file, saved, skipped }
}

// ---- журнал правок и проблемы для самопроверки -----------------------------------------------------------------------

/** Строка журнала плагина на успешную правку (единственный вызывающий — commitEdit в profile-cmd.ts). */
export function logEdit(project: string, command: string, what: string, from: any, to: any) {
  const show = (v: any) => (v === undefined || v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v))
  log(`profile edit: ${project} ${command} ${what} (${show(from)} -> ${show(to)})`)
}
/** Отказанная правка: одна строка с причиной. */
export function logRefused(project: string, command: string, why: string) {
  log(`profile edit refused: ${project} ${command}: ${why}`)
}

/** Проблемы профилей проекта словами — для crew_doctor, check и уведомления (окна файлов добавляет profile-windows). */
export function problemsOf(ps: PState): string[] {
  const out: string[] = []
  const row = ps.state.row
  if (ps.state.message) out.push(`проект ${ps.project}: ${ps.state.message}`)
  if (row !== 6 && row !== 7) for (const w of ps.state.warnings) out.push(`проект ${ps.project}: ${w.text}`)
  const d = layerDiff(ps.raw, ps.layer)
  const unsaved = d.filter((x) => !x.inWorking)
  if (unsaved.length) out.push(`проект ${ps.project}: локальные правки профилей не сохранены в файл (${unsaved.length}): ${unsaved.map((x) => x.label).join(", ")} — /crew-sets save`)
  for (const x of d.filter((y) => y.fileChanged)) out.push(`проект ${ps.project}: ${x.label}: в файле теперь иначе, чем при локальной правке; действует локальное значение (reset или save force)`)
  return out
}

// ---- показ и проверка связей для crew_config ---------------------------------------------------------------------------

/** Блок «Профили моделей» для crew_config show и /crew-config (пусто, если у проекта нет профилей, наборов, имени и слоя). */
export function profilesShow(dir0: string): string {
  const ps = profileState(dir0)
  const has = (v: any) => isObj(v) && Object.keys(v).length > 0
  if (!has(ps.data.profiles) && !has(ps.data.sets) && !ps.name && !Object.keys(ps.layer).length) return ""
  const lines: string[] = []
  const src = ps.nameSource === "layer" ? "локальное переключение" : "файл проекта"
  lines.push(`Профили моделей: ${ps.name ? `включён набор «${ps.name}» (${src})` : "набор не включён"}${ps.state.row === 2 || ps.state.row === 1 ? "" : `; состояние — строка ${ps.state.row} таблицы исходов`}.`)
  if (has(ps.data.profiles)) lines.push(`  справочник: ${Object.entries(ps.data.profiles!).map(([f, t]) => `${f} (${P.PROFILE_TIERS.filter((x) => (t as any)[x]).join("/")})`).join(", ")}`)
  if (has(ps.data.sets)) lines.push(`  наборы: ${Object.keys(ps.data.sets!).map((n) => (n === ps.name ? `${n} *` : n)).join(", ")}`)
  const d = layerDiff(ps.raw, ps.layer)
  if (Object.keys(ps.layer).length) lines.push(`  локальный слой: ${Object.keys(ps.layer).length} записей${d.length ? `, не равных файлу ${d.length}: ${d.map((x) => x.label).join(", ")}` : ""}`)
  for (const p of problemsOf(ps)) lines.push(`  ! ${p}`)
  return lines.join("\n")
}

/** Новые повисшие ссылки, которые создала бы запись values в рабочую копию файла (REQ-34: рабочая копия плюс вносимое). */
export function linkErrorsOfWrite(folder: string, values: Record<string, any>): string[] {
  if (!("model_profiles" in values) && !("profile_sets" in values)) return []
  const work = workingSettings(folder).raw
  const merged: any = { ...work }
  for (const [k, v] of Object.entries(values)) if (v === null) delete merged[k]
  else merged[k] = v
  const before = P.linkProblems({ profiles: work.model_profiles, sets: work.profile_sets }).map((p) => p.text)
  return P.linkProblems({ profiles: merged.model_profiles, sets: merged.profile_sets }).map((p) => p.text).filter((t) => !before.includes(t))
}

// ---- файлы окон по состоянию ------------------------------------------------------------------------------------------

/** Файлы окон проекта привести к состоянию: записать, обновить, снять (проход сервиса, use, reset, правка, save). */
export function syncProjectFiles(dir0: string): SyncReport & { plan: WindowPlan } {
  const ps = profileState(dir0)
  const plan = windowPlanOf(ps.state)
  return { ...syncWindows(ps.project, listTasks(ps.project), plan), plan }
}
/** Файл окон для одной задачи до первого хода её сессии (REQ-22); сбой записи не срывает запуск. */
export function syncTaskFile(t: Task): SyncReport {
  const ps = profileState(t.directory)
  return syncTaskWindow(ps.project, t, windowPlanOf(ps.state))
}

/** Проблемы профилей всех проектов процесса — для crew_doctor и уведомления. */
export function profileProblems(): string[] {
  const out: string[] = []
  for (const p of settingsContext().projects) {
    const dir0 = p.dir ?? p.rootPath
    if (!dir0) continue
    try {
      const ps = profileState(dir0)
      out.push(...problemsOf(ps), ...windowProblems(ps.project, listTasks(ps.project), windowPlanOf(ps.state)))
      // рукописные окна, которые перекрывают окно профиля, и явный порог Claude Code — названы с файлом и значением (REQ-16, REQ-23)
      const u = ps.state.usable
      if (u && ps.state.row !== 6) out.push(...windowNotes(p.rootPath ?? dir0, qualifying(ps.project, listTasks(ps.project)), P.windowsOfSet(u.data, u.name).models).map((x) => `проект ${ps.project}: ${x}`))
      // сданные задачи, которым приёмщика не нашли из-за набора (REQ-15): причина — в самопроверке
      for (const t of listTasks(ps.project)) {
        if (t.status !== "submitted" || t.reviewer) continue
        const r = P.resolveStageProfile(ps.state, P.stageOfLaunch(t, "reviewer"), { taskTier: t.tier })
        if (r && "refuse" in r) out.push(`проект ${ps.project}: задача #${t.n} «${t.title}»: сдана, приёмщика нет — ${r.refuse}`)
      }
    } catch (e) {
      log(`profile problems of ${p.name} failed: ${e}`)
    }
  }
  return out
}
