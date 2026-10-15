// ПРОСРОЧЕННЫЕ ОТКРЫТЫЕ ВОПРОСЫ В crew_doctor (задача 060). Число считает страж проекта
// scripts/guards/check-open-questions.py --overdue — тот же код, что оркестратор зовёт перед «пушь»; второго счётчика здесь нет:
// плагин только вызывает скрипт и читает его первую строку «просрочено: N» и список. Проект без файла или стража — молчит.
import { existsSync } from "node:fs"
import path from "node:path"
import { execQueued } from "./async-git.ts"

export const OQ_SCRIPT = ["scripts", "guards", "check-open-questions.py"]
export const OQ_FILE = ["doc", "open-questions.md"]

type Run = (file: string, args: string[]) => Promise<string>

/** Строки для crew_doctor: по проекту с просроченными вопросами (или со сбоем счёта). Ноль просроченных — ничего. */
export async function overdueProblems(projects: { name: string; rootPath?: string; root: string }[], run: Run = (f, a) => execQueued(f, a, 15_000)): Promise<string[]> {
  const out: string[] = []
  for (const p of projects) {
    const root = p.rootPath ?? p.root
    const script = path.join(root, ...OQ_SCRIPT)
    if (!existsSync(script) || !existsSync(path.join(root, ...OQ_FILE))) continue
    let text: string
    try {
      text = await run("python", [script, "--root", root, "--overdue"])
    } catch (e) {
      out.push(`${p.name}: не удалось сосчитать просроченные открытые вопросы (${String(e).slice(0, 80)})`)
      continue
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const m = /^просрочено: (\d+)$/.exec(lines[0] ?? "")
    if (!m) {
      out.push(`${p.name}: счёт открытых вопросов ответил не по форме: «${(lines[0] ?? "").slice(0, 60)}»`)
      continue
    }
    if (Number(m[1]) > 0) out.push(`${p.name}: просрочено открытых вопросов: ${m[1]} (doc/open-questions.md) — ${lines.slice(1).join("; ")}`)
  }
  return out
}
