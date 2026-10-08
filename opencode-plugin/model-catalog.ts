// СНИМОК КАТАЛОГА МОДЕЛЕЙ (правка 003, 2026-10-08). Каталог моделей (провайдер, модель, окно) знает сервер OpenCode: плагин сервиса
// получает его через ctx.model.list(). У окна (tui.ts) такого списка нет надёжно, поэтому плагин сервиса при загрузке и раз в десять
// минут пишет снимок в файл model-catalog.json ящика, а окно читает его для `check` и `use` (/crew-sets, /crew-profiles). У снимка
// есть время; старый снимок (служба давно не обновляла) окно не берёт и называет причину.
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BASE, readJson } from "./core.ts"

export const CATALOG_FILE = path.join(BASE, "model-catalog.json")
/** старше — снимок не берётся: служба давно не обновляла (обновление раз в 10 минут) */
export const CATALOG_MAX_AGE_MS = Number(process.env.CREW_HARNESS_CATALOG_MAX_AGE_MS) || 60 * 60_000

export type CatalogModel = { providerID: string; modelID: string; limit?: { context?: number; input?: number; output?: number } }

/** Ответ ctx.model.list() → записи снимка (пустой ответ — не снимок). */
export function catalogModels(reply: any): CatalogModel[] {
  const d = reply?.data ?? reply
  if (!Array.isArray(d)) return []
  return d
    .map((m: any) => ({ providerID: String(m?.providerID ?? ""), modelID: String(m?.modelID ?? m?.id ?? ""), ...(m?.limit && typeof m.limit === "object" ? { limit: { context: m.limit.context, input: m.limit.input, output: m.limit.output } } : {}) }))
    .filter((m) => m.providerID && m.modelID)
}

export function writeCatalog(models: CatalogModel[], now = Date.now(), file = CATALOG_FILE): boolean {
  if (!models.length) return false
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ at: now, models }))
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

export const ageText = (ms: number): string => (ms < 90_000 ? `${Math.max(0, Math.round(ms / 1000))} с` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} мин` : `${Math.round(ms / 3_600_000)} ч`)

/** Снимок для окна: модели и пометка возраста, либо причина, почему его нет. */
export function readCatalog(now = Date.now(), file = CATALOG_FILE): { models?: CatalogModel[]; note?: string; why?: string } {
  const j = readJson<{ at?: number; models?: CatalogModel[] }>(file)
  if (!j) return { why: "плагин сервиса ещё не записал снимок каталога (после запуска сервиса — до минуты) или службы нет" }
  if (!Array.isArray(j.models) || !j.models.length || typeof j.at !== "number") return { why: "снимок каталога пуст или повреждён" }
  const age = now - j.at
  if (age > CATALOG_MAX_AGE_MS) return { why: `снимок каталога старый (${ageText(age)} назад): плагин сервиса давно не обновлял его` }
  return { models: j.models, note: `снимок плагина сервиса, ${ageText(Math.max(0, age))} назад` }
}
