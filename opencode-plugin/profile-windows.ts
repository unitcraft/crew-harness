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

