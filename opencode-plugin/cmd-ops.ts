// ТЯЖЁЛАЯ ЧАСТЬ КОМАНД ОКНА (правка 003, 2026-10-08, замечание владельца: большая пауза перед диалогом). Чтение настроек проекта — это
// вызовы git (readSettingsFolder, кэш 5 с), на нагруженной машине они занимают 1–4 с и блокируют окно. Окно показывает диалог
// «Загрузка…» сразу, а эту часть выполняет в рабочем потоке (cmd-worker.ts); не вышел поток — здесь же, в процессе окна.
import { configShowText, loadProjects } from "./core.ts"
import { runProfilesCommand, runSetsCommand } from "./profile-cmd.ts"

export type Op =
  | { kind: "sets" | "profiles"; dir: string; text: string; catalog?: { providerID: string; modelID: string; limit?: any }[]; catalogNote?: string; catalogWhy?: string; version?: string }
  | { kind: "config"; dir: string; project?: string }
  | { kind: "warm" } // ничего не показывает: поднимает поток и прогревает кэш настроек проектов

export async function execOp(op: Op): Promise<string> {
  loadProjects() // проекты — из ящика (их кладёт плагин сервиса)
  if (op.kind === "warm") return ""
  if (op.kind === "config") return configShowText(op.dir, op.project, true)
  const deps = { window: true, version: op.version, catalogNote: op.catalogNote, catalogWhy: op.catalogWhy, ...(op.catalog ? { catalog: async () => op.catalog } : {}) }
  return await (op.kind === "sets" ? runSetsCommand : runProfilesCommand)(op.dir, op.text, deps)
}
