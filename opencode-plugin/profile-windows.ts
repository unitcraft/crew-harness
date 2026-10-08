// ФАЙЛ ОКОН В РАБОЧЕМ ДЕРЕВЕ ЗАДАЧИ (задача 003, ADR-0008).
//
// Окно контекста в OpenCode — свойство модели в папке: каталог моделей собирается из файлов настроек от корня диска к папке
// сессии, провайдер Claude Code читает те же файлы на каждый ход. Поэтому окна профилей включённого набора плагин задаёт
// ФАЙЛОМ `.opencode/opencode.json` в рабочем дереве (worktree) задачи — только там: корень проекта и основные папки не
// трогаются (DNC-03). В файле только `limit` моделей набора (context и output вместе, input — если он есть в профиле) и
// ключ-пометка `_crew_harness`; файл без пометки плагин не перезаписывает и не удаляет. Строка `/.opencode/opencode.json` —
// в info/exclude общего каталога git. Реестр записанных файлов — ящик плагина (profiles/<проект>.windows.json): по нему
// плагин находит, что снимать, когда набора нет. Порог сжатия (compaction.*) файл не задаёт никогда (DNC-02).

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BASE } from "./paths.ts"
import type { Task } from "./tasks.ts"
import * as P from "./profiles.ts"

export const MARK = "_crew_harness"
export const MARK_TEXT = "created by crew-harness (model profiles): windows of the models of the enabled set for the sessions of this task; the plugin rewrites and removes this file, do not edit"
export const WINDOW_FILE = path.join(".opencode", "opencode.json")
export const EXCLUDE_LINE = "/.opencode/opencode.json"

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v)
const hashOf = (text: string) => createHash("sha1").update(text).digest("hex")

// ---- содержимое и запись файла ---------------------------------------------------------------------------------------

/** Содержимое файла окон по окнам моделей («провайдер/id» → окно): только limit и пометка; порядок ключей стабилен. */
export function windowFileContent(models: Map<string, P.Win>): string {
  const provider: Record<string, any> = {}
  for (const [model, w] of [...models].sort((a, b) => a[0].localeCompare(b[0]))) {
    const slash = model.indexOf("/")
    const prov = model.slice(0, slash)
    const id = model.slice(slash + 1)
    ;(provider[prov] ??= { models: {} }).models[id] = { limit: { context: w.context, ...(w.input !== undefined ? { input: w.input } : {}), output: w.output } }
  }
  return JSON.stringify({ [MARK]: MARK_TEXT, provider }, null, 2) + "\n"
}

/** Файл с пометкой плагина (разбор JSON; нечитаемый или без пометки — не наш). */
export function isOurs(text: string): boolean {
  try {
    const j = JSON.parse(text.replace(/^﻿/, ""))
    return isObj(j) && typeof j[MARK] === "string"
  } catch {
    return false
  }
}
export const windowPath = (worktree: string) => path.join(worktree, WINDOW_FILE)
const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return undefined
  }
}
export const fileOurs = (worktree: string): boolean => {
  const t = readText(windowPath(worktree))
  return t !== undefined && isOurs(t)
}

/** Записать файл атомарно и только если содержимое изменилось. foreign — там уже файл без пометки: не тронут. */
export function writeWindowFile(worktree: string, content: string): "written" | "same" | "foreign" {
  const file = windowPath(worktree)
  const cur = readText(file)
  if (cur !== undefined) {
    if (cur === content) return "same"
    if (!isOurs(cur)) return "foreign"
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
  return "written"
}
/** Снять файл, если он наш; пустую папку .opencode, созданную им, убрать. */
export function removeWindowFile(worktree: string): boolean {
  const file = windowPath(worktree)
  const cur = readText(file)
  if (cur === undefined || !isOurs(cur)) return false
  rmSync(file, { force: true })
  try {
    rmdirSync(path.dirname(file)) // только пустая
  } catch {}
  return true
}

// ---- исключение из git -----------------------------------------------------------------------------------------------

const excluded = new Set<string>()
/** Строка в info/exclude общего каталога git репозитория worktree (один раз). */
export function ensureExclude(worktree: string) {
  const common = path.resolve(worktree, execFileSync("git", ["-C", worktree, "rev-parse", "--git-common-dir"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim())
  if (excluded.has(common)) return
  const file = path.join(common, "info", "exclude")
  const text = readText(file) ?? ""
  if (!text.split(/\r?\n/).includes(EXCLUDE_LINE)) {
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}# crew-harness: window file of the model profiles (generated per task worktree)\n${EXCLUDE_LINE}\n`)
  }
  excluded.add(common)
}

// ---- реестр записанных файлов -----------------------------------------------------------------------------------------

type Registry = Record<string, { hash: string; task: number; at: number }>
const registryFile = (project: string) => path.join(BASE, "profiles", `${project.replace(/[^A-Za-z0-9_-]/g, "_")}.windows.json`)
export function readRegistry(project: string): Registry {
  try {
    const v = JSON.parse(readFileSync(registryFile(project), "utf8"))
    return isObj(v) ? (v as Registry) : {}
  } catch {
    return {}
  }
}
function writeRegistry(project: string, reg: Registry) {
  const file = registryFile(project)
  if (!Object.keys(reg).length) return void rmSync(file, { force: true })
  const text = JSON.stringify(reg, null, 1)
  if (readText(file) === text) return
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

// ---- кому нужен файл -------------------------------------------------------------------------------------------------

const NEEDS_FILE = ["starting", "running", "submitted", "reviewing", "rework", "approval"]
/** Задачи проекта, чьё рабочее дерево сейчас нуждается в файле окон: spawn, дерево создано плагином, не принята и не отменена, папка есть. */
export function qualifying(project: string, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.project === project && t.kind === "spawn" && t.worktree_ready && !!t.worktree && NEEDS_FILE.includes(t.status) && existsSync(t.worktree))
}

export type WindowPlan = {
  /** all — записать и обновить; new — только новым деревьям (существующие не меняются); none — не писать, не трогать; remove — снять все */
  mode: "all" | "new" | "none" | "remove"
  models?: Map<string, P.Win>
  set?: string
}
/** План файлов по строке таблицы исходов (REQ-33): строки 1 и 7 — снять; 2 — по набору; 3 и 5 — по снимку для новых; 4 и 6 — не писать. */
export function windowPlanOf(state: P.State): WindowPlan {
  switch (state.row) {
    case 1:
    case 7:
      return { mode: "remove" }
    case 2:
      return { mode: "all", models: P.windowsOfSet(state.usable!.data, state.usable!.name).models, set: state.usable!.name }
    case 3:
    case 5:
      return { mode: "new", models: P.windowsOfSet(state.usable!.data, state.usable!.name).models, set: state.usable!.name }
    default:
      return { mode: "none" }
  }
}

export type SyncReport = { written: string[]; removed: string[]; foreign: string[]; errors: string[] }
/**
 * Привести файлы окон проекта к плану: убрать записи и файлы тех, кому они больше не нужны (задача принята или отменена,
 * папка исчезла, набора нет); записать нужным (атомарно, только при изменении содержимого).
 */
export function syncWindows(project: string, tasks: Task[], plan: WindowPlan): SyncReport {
  const rep: SyncReport = { written: [], removed: [], foreign: [], errors: [] }
  const reg = readRegistry(project)
  const live = new Map(qualifying(project, tasks).map((t) => [path.resolve(t.worktree!), t] as const))
  for (const wt of Object.keys(reg)) {
    if (live.has(wt) && plan.mode !== "remove") continue
    try {
      if (existsSync(wt) && removeWindowFile(wt)) rep.removed.push(wt)
    } catch (e) {
      rep.errors.push(`${wt}: ${e}`)
    }
    delete reg[wt]
  }
  if ((plan.mode === "all" || plan.mode === "new") && plan.models?.size) {
    const content = windowFileContent(plan.models)
    for (const [wt, t] of live) {
      try {
        if (plan.mode === "new" && fileOurs(wt)) {
          reg[wt] ??= { hash: hashOf(readText(windowPath(wt)) ?? ""), task: t.n, at: Date.now() }
          continue // существующие файлы не меняются (строки 3 и 5)
        }
        ensureExclude(wt)
        const r = writeWindowFile(wt, content)
        if (r === "foreign") rep.foreign.push(wt)
        else {
          if (r === "written") rep.written.push(wt)
          reg[wt] = { hash: hashOf(content), task: t.n, at: Date.now() }
        }
      } catch (e) {
        rep.errors.push(`${wt}: ${e}`)
      }
    }
  }
  writeRegistry(project, reg)
  return rep
}

/** Файл для одной только что созданной (или обновляемой) задачи: до первого хода сессии (REQ-22). */
export function syncTaskWindow(project: string, t: Task, plan: WindowPlan): SyncReport {
  const rep: SyncReport = { written: [], removed: [], foreign: [], errors: [] }
  if (!t.worktree || !t.worktree_ready || (plan.mode !== "all" && plan.mode !== "new") || !plan.models?.size) return rep
  const wt = path.resolve(t.worktree)
  const reg = readRegistry(project)
  try {
    ensureExclude(wt)
    const content = windowFileContent(plan.models)
    const r = writeWindowFile(wt, content)
    if (r === "foreign") rep.foreign.push(wt)
    else {
      if (r === "written") rep.written.push(wt)
      reg[wt] = { hash: hashOf(content), task: t.n, at: Date.now() }
      writeRegistry(project, reg)
    }
  } catch (e) {
    rep.errors.push(`${wt}: ${e}`)
  }
  return rep
}

/** Задача принята или отменена: файл из её дерева снят, запись реестра удалена (дерево удалится позже без помех: файл игнорируется git). */
export function releaseTaskWindow(project: string, t: { worktree?: string }) {
  if (!t.worktree) return
  const wt = path.resolve(t.worktree)
  const reg = readRegistry(project)
  if (existsSync(wt) && (reg[wt] || fileOurs(wt))) removeWindowFile(wt)
  if (reg[wt]) {
    delete reg[wt]
    writeRegistry(project, reg)
  }
}
/** Снять все записанные файлы проекта (набора нет). */
export function removeProjectWindows(project: string): string[] {
  const out: string[] = []
  for (const wt of Object.keys(readRegistry(project))) if (existsSync(wt) && removeWindowFile(wt)) out.push(wt)
  rmSync(registryFile(project), { force: true })
  return out
}

// ---- проблемы файлов окон (для crew_doctor, check, уведомления) -------------------------------------------------------

export function windowProblems(project: string, tasks: Task[], plan: WindowPlan): string[] {
  const out: string[] = []
  if (plan.mode !== "all" && plan.mode !== "new") return out
  const expected = plan.models?.size ? windowFileContent(plan.models) : undefined
  for (const t of qualifying(project, tasks)) {
    const wt = path.resolve(t.worktree!)
    const cur = readText(windowPath(wt))
    if (cur !== undefined && !isOurs(cur)) {
      out.push(`проект ${project}, задача #${t.n}: в рабочем дереве уже есть .opencode/opencode.json без пометки плагина — файл окон профиля не записан, окно профиля там не действует (плагин чужой файл не трогает)`)
      continue
    }
    if (plan.mode === "all" && expected && cur !== expected) out.push(`проект ${project}, задача #${t.n}: файл окон в рабочем дереве ${cur === undefined ? "отсутствует" : "разошёлся с набором"} (плагин перепишет на ближайшем проходе)`)
  }
  return out
}


// ---------------------------------------------------------------------------------------------------------------------
// ЧТЕНИЕ НАСТРОЕК OPENCODE (шаг 9): какие окна на самом деле у модели в папке, что перекрывает окно профиля, явный порог
// Claude Code. Порядок файлов повторяет OpenCode (и `opencodeConfigFiles` провайдера claude-code): глобальные
// `opencode.json(c)`, затем для каждого уровня от корня диска вниз `opencode.json`, `opencode.jsonc`,
// `.opencode/opencode.json`, `.opencode/opencode.jsonc`; глубже — сильнее. Дубль логики сознательный: репозитории
// публичные и независимые, импорта между ними нет; при смене версии OpenCode сообщения могут разойтись с действительностью
// (check печатает версию). Только чтение: ничего здесь не пишет (DNC-02, DNC-03).

import os from "node:os"

/** JSONC: комментарии вне строк и висячие запятые убраны. */
export function parseJsonc(text: string): any {
  let out = ""
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      out += c
      if (c === "\\") out += text[++i] ?? ""
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      out += c
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      out += "\n"
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i++
    } else out += c
  }
  return JSON.parse(out.replace(/^﻿/, "").replace(/,(\s*[}\]])/g, "$1"))
}
const readCfg = (file: string): any => {
  try {
    return parseJsonc(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}
const LEVEL_NAMES = ["opencode.json", "opencode.jsonc", path.join(".opencode", "opencode.json"), path.join(".opencode", "opencode.jsonc")]

/** Файлы настроек OpenCode для папки в порядке возрастания силы (существующие и несуществующие: порядок нужен и для прогноза). */
export function configChainAll(dir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const configDir = env.XDG_CONFIG_HOME ? path.join(env.XDG_CONFIG_HOME, "opencode") : path.join(os.homedir(), ".config", "opencode")
  const files = ["opencode.json", "opencode.jsonc"].map((n) => path.join(configDir, n))
  const levels: string[] = []
  let d = dir ? path.resolve(dir) : ""
  for (let i = 0; d && i < 64; i++) {
    levels.unshift(d)
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  for (const l of levels) for (const n of LEVEL_NAMES) files.push(path.join(l, n))
  return files
}
export const configChain = (dir: string, env: NodeJS.ProcessEnv = process.env): string[] => configChainAll(dir, env).filter((f) => existsSync(f))

const sameFile = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
const providersOf = (cfg: any): Record<string, any> => ({ ...(isObj(cfg?.provider) ? cfg.provider : {}), ...(isObj(cfg?.providers) ? cfg.providers : {}) })
const limitOf = (cfg: any, prov: string, id: string): Partial<Record<"context" | "input" | "output", number>> | undefined => {
  const l = providersOf(cfg)[prov]?.models?.[id]?.limit
  return isObj(l) ? l : undefined
}
export type Field = { value: number; file: string }
export type WindowFields = Partial<Record<"context" | "input" | "output", Field>>
const splitModel = (model: string): [string, string] => {
  const i = model.indexOf("/")
  return [model.slice(0, i), model.slice(i + 1)]
}

/** Окно модели по файлам цепочки папки: значение каждого поля и файл, который его задал. skip — файлы, которых не учитывать (файл плагина). */
export function chainWindow(dir: string, model: string, opts: { skipOurs?: boolean; extra?: { file: string; limit: any } } = {}): WindowFields {
  const [prov, id] = splitModel(model)
  const out: WindowFields = {}
  const files = opts.extra ? configChainAll(dir) : configChain(dir)
  for (const file of files) {
    let limit: any
    if (opts.extra && sameFile(file, opts.extra.file)) limit = opts.extra.limit
    else {
      if (!existsSync(file)) continue
      const text = readText(file)
      if (text === undefined) continue
      if (opts.skipOurs && isOurs(text)) continue
      try {
        limit = limitOf(parseJsonc(text), prov, id)
      } catch {
        continue
      }
    }
    if (!limit) continue
    for (const k of ["context", "input", "output"] as const) if (typeof limit[k] === "number") out[k] = { value: limit[k], file }
  }
  return out
}
/** Окно модели в папке после записи файла плагина с содержимым content (прогноз для use и check). */
export function predictWindow(dir: string, model: string, content: string): WindowFields {
  const [prov, id] = splitModel(model)
  let limit: any
  try {
    limit = limitOf(JSON.parse(content), prov, id)
  } catch {}
  return chainWindow(dir, model, { extra: { file: windowPath(dir), limit } })
}

/** Рукописные значения окна модели, которые стоят в цепочке папки: сильнее файла плагина (позже него) и слабее (раньше, с иным значением). */
export type Override = { file: string; field: "context" | "input" | "output"; value: number; stronger: boolean }
export function handWrittenOverrides(dir: string, model: string, window: P.Win): Override[] {
  const [prov, id] = splitModel(model)
  const ours = windowPath(dir)
  const out: Override[] = []
  let passed = false
  for (const file of configChainAll(dir)) {
    if (sameFile(file, ours)) {
      passed = true
      continue
    }
    if (!existsSync(file)) continue
    const text = readText(file)
    if (text === undefined || isOurs(text)) continue
    let limit: any
    try {
      limit = limitOf(parseJsonc(text), prov, id)
    } catch {
      continue
    }
    if (!limit) continue
    for (const k of ["context", "input", "output"] as const) if (typeof limit[k] === "number" && limit[k] !== (window as any)[k]) out.push({ file, field: k, value: limit[k], stronger: passed })
  }
  return out
}
/** compaction.reserved из цепочки папки (только чтение; для порога в сообщениях), undefined — не задан. */
export function reservedOf(dir: string): { value: number; file: string } | undefined {
  let out: { value: number; file: string } | undefined
  for (const file of configChain(dir)) {
    const text = readText(file)
    if (text === undefined || isOurs(text)) continue
    try {
      const c = parseJsonc(text)?.compaction
      const v = typeof c?.reserved === "number" ? c.reserved : typeof c?.buffer === "number" ? c.buffer : undefined
      if (v !== undefined) out = { value: v, file }
    } catch {}
  }
  return out
}

/** autoCompactWindow: число — для всех моделей; объект — точное имя, семейство по подстроке, «*». */
function compactFor(option: any, modelId: string): number | undefined {
  if (typeof option === "number") return option
  if (!isObj(option)) return undefined
  const id = modelId.toLowerCase()
  if (typeof option[id] === "number") return option[id]
  const family = Object.keys(option).find((k) => k !== "*" && id.includes(k.toLowerCase()))
  if (family && typeof option[family] === "number") return option[family]
  return typeof option["*"] === "number" ? option["*"] : undefined
}
/**
 * Явный autoCompactWindow провайдера claude-code для модели в папке (REQ-23): опции провайдера в файлах цепочки
 * (`providers["claude-code"].settings`) и проектный файл провайдера вверх от папки. Он сильнее окна профиля; плагин его не
 * переписывает и не отменяет, а называет.
 */
export function explicitCompact(dir: string, modelId: string): { value: number; where: string } | undefined {
  let out: { value: number; where: string } | undefined
  for (const file of configChain(dir)) {
    const text = readText(file)
    if (text === undefined || isOurs(text)) continue
    try {
      const all = providersOf(parseJsonc(text))
      const p = all["claude-code"] ?? Object.values(all).find((x: any) => /claude-code-provider/.test(String(x?.package ?? x?.npm ?? "")))
      const v = compactFor((p?.settings ?? p?.options?.settings)?.autoCompactWindow, modelId)
      if (v !== undefined) out = { value: v, where: file }
    } catch {}
  }
  let d = dir ? path.resolve(dir) : ""
  for (let i = 0; d && i < 32; i++) {
    const f = path.join(d, ".opencode", "opencode-claude-code-provider.json")
    if (existsSync(f)) {
      try {
        const v = compactFor(JSON.parse((readText(f) ?? "").replace(/^﻿/, "")).autoCompactWindow, modelId)
        if (v !== undefined) out = { value: v, where: f }
      } catch {}
      break
    }
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return out
}
/** Порог сжатия модели в OpenCode: по input там, где он есть, иначе по context, минус reserved; undefined — окно нигде не записано. */
export function thresholdOf(w: { context?: number; input?: number }, reserved?: number): number | undefined {
  const base = w.input ?? w.context
  return base === undefined ? undefined : reserved === undefined ? undefined : base - reserved
}

const slash = (f: string) => path.resolve(f).split(path.sep).join("/")
/**
 * Заметки об окнах моделей набора (REQ-16, REQ-23, AC-25, AC-40): рукописное окно в рабочем дереве задачи, которое сильнее
 * файла плагина; рукописное окно в основной папке (вкладки владельца и сессии приёмки берут его, профиль там не применяется);
 * явный порог Claude Code. Только чтение.
 */
export function windowNotes(root: string, wts: Task[], models: Map<string, P.Win>): string[] {
  const out: string[] = []
  const reserved = reservedOf(root)
  for (const [model, win] of models) {
    for (const t of wts)
      for (const o of handWrittenOverrides(t.worktree!, model, win).filter((x) => x.stronger))
        out.push(`в рабочем дереве задачи #${t.n} окно модели ${model} (${o.field}) задано рукописно: ${o.value} (файл ${slash(o.file)}) — оно сильнее файла плагина, сессия получит его, а не окно профиля (${(win as any)[o.field] ?? "—"})`)
    const hand = chainWindow(root, model, { skipOurs: true })
    for (const k of ["context", "input", "output"] as const) {
      const h = hand[k]
      if (h && h.value !== (win as any)[k]) out.push(`в основной папке проекта у модели ${model} ${k} ${h.value} (файл ${slash(h.file)}): вкладки владельца и сессии приёмки берут его, профиль набора там не применяется (в профиле ${(win as any)[k] ?? "—"})`)
    }
    if (model.startsWith("claude-code/")) {
      const ex = explicitCompact(wts[0]?.worktree ?? root, model.slice("claude-code/".length))
      if (ex) out.push(`порог Claude Code для модели ${model} задан явно (${ex.value}, ${slash(ex.where)}) и от набора не меняется; окно OpenCode станет ${win.input ?? win.context}${reserved ? ` (сжатие OpenCode на ${(win.input ?? win.context) - reserved.value})` : ""}`)
    }
  }
  return out
}
