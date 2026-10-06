// СОГЛАСОВАНИЕ ПЛАНА ВЛАДЕЛЬЦЕМ (план 012, шаг 3). Решение принимает человек в окне: команда /plans (tui.ts) показывает
// планы на согласовании и пишет решение файлом approvals/<проект>-<N>.json; плагин сервиса применяет его на проходе
// (index.ts applyApprovals). Агент диалог окна вызвать не может — согласие не подделать письмом или инструментом.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { readJson, safeKey } from "./core.ts"
import { BASE } from "./paths.ts"

export const APPROVALS = path.join(BASE, "approvals")
export type Decision = "ok" | "ok-shortcuts" | "no"
export type Approval = { project: string; n: number; decision: Decision; text?: string; at: number; by: "owner-window"; pid: number }

export const DECISION_RU: Record<Decision, string> = {
  ok: "согласован: без упрощений",
  "ok-shortcuts": "согласован: упрощения — как в плане",
  no: "возвращён с замечаниями",
}

const fileOf = (project: string, n: number) => path.join(APPROVALS, `${safeKey(project)}-${n}.json`)

export function writeApproval(a: Omit<Approval, "at" | "by" | "pid">, now = Date.now()) {
  mkdirSync(APPROVALS, { recursive: true })
  const f = fileOf(a.project, a.n)
  writeFileSync(`${f}.tmp`, JSON.stringify({ ...a, at: now, by: "owner-window", pid: process.pid }))
  renameSync(`${f}.tmp`, f)
}

export function readApprovals(): Approval[] {
  if (!existsSync(APPROVALS)) return []
  return readdirSync(APPROVALS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Approval>(path.join(APPROVALS, f)))
    .filter((a): a is Approval => !!a && typeof a.project === "string" && Number.isInteger(a.n) && ["ok", "ok-shortcuts", "no"].includes(a.decision))
}

export const removeApproval = (project: string, n: number) => rmSync(fileOf(project, n), { force: true })
