// ВЫБОР В ОКНЕ ДЛЯ /crew-sets И /crew-profiles (задача 066, пп. 8–9; владелец, 2026-10-17: «стрелками выбрали kimi — Enter, ничего
// вводить не надо»). Команда без слов и `ls` открывают выбор (dialog.select): строка — набор (семья), ● у включённого, модели в
// подписи; Enter включает набор (у семьи — показывает её), последняя строка открывает меню остальных глаголов. Глаголы, которым нужно
// имя набора (семьи), сначала показывают тот же список; текст набирается только для нового имени или ячейки. Модуль чистый: окно
// передаёт ему select / prompt / load (тяжёлая часть в рабочем потоке) / show; всё, что уходит в окно, — строки.
import { verbHelpOf } from "./core.ts"

export type FlowIO = {
  select: (o: any) => Promise<any>
  prompt: (o: any) => Promise<string | undefined>
  /** выполнить команду (текст как в строке) в рабочем потоке и вернуть ответ */
  load: (text: string) => Promise<string>
  show: (title: string, message: string) => void
}
type Item = { value: string; title: string; description: string }

const str = (v: unknown): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v))
/** Глаголы, которым нужно имя набора (семьи): они начинаются со списка. */
const SET_VERBS = ["use", "show", "rename", "delete", "set", "unset"]
const FAMILY_VERBS = ["show", "set", "rename", "delete"]

export async function runFlow(kind: "sets" | "profiles", typed: string, io: FlowIO): Promise<void> {
  const name = `/crew-${kind}`
  const needs = kind === "sets" ? SET_VERBS : FAMILY_VERBS
  const helps = verbHelpOf(kind)
  const what = kind === "sets" ? "набор" : "семью"
  const run = async (text: string) => {
    const title = `crew-harness — ${name}${text ? " " + text : ""}`
    io.show(title, "Загрузка…")
    io.show(title, await io.load(text))
  }
  const loadPick = async (arg?: string): Promise<{ items: Item[]; current?: string }> => {
    try {
      const d = JSON.parse(await io.load(arg ? `__pick ${arg}` : "__pick"))
      return { items: Array.isArray(d?.items) ? d.items.map((i: any) => ({ value: str(i.value), title: str(i.title), description: str(i.description) })) : [], current: typeof d?.current === "string" ? d.current : undefined }
    } catch {
      return { items: [] }
    }
  }
  const options = (items: Item[], category?: string) => items.map((i) => ({ title: i.title, value: i.value, description: i.description, ...(category ? { category } : {}) }))
  const askText = async (title: string, placeholder: string): Promise<string | undefined> => {
    const t = await io.prompt({ title: str(title), placeholder: str(placeholder), value: "" })
    return typeof t === "string" && t.trim() ? t.trim() : undefined
  }

  // ВВОД ТОЛЬКО СТРОКАМИ (дефект 2026-10-08): description у dialog.prompt - функция, чей результат окно вставляет в свой блок;
  // элемент <text> оттуда роняет окно (TextNodeRenderable only accepts strings). Подсказка со списком глаголов - в заголовке
  // (строка), формат и пример - в placeholder (строка).
  const askVerb = async (verb: string) => {
    const v = helps.find((h) => h.verb === verb)!
    const allVerbs = helps.map((h) => h.verb).join(" ")
    const typed = await io.prompt({ title: str(`${name} ${v.verb} · глаголы: ${allVerbs}`), placeholder: str(`${v.verb} ${v.usage} — например: ${v.example}`), value: str(`${v.verb} `) })
    if (typed === undefined) return
    const t = typed.trim()
    const rest = t.startsWith(v.verb) ? t.slice(v.verb.length).trim() : t // строка могла прийти с глаголом или без него
    if (!rest && /^<[^>]*>/.test(v.usage)) return // нужные аргументы не введены
    return run(`${v.verb}${rest ? " " + rest : ""}`)
  }

  const verbFlow = async (verb: string): Promise<void> => {
    if (verb === "ls") return pickFlow()
    const v = helps.find((h) => h.verb === verb)
    if (!v) return
    if (!needs.includes(verb)) return v.bare ? run(verb) : askVerb(verb)
    const d = await loadPick()
    if (!d.items.length) return void io.show(`crew-harness — ${name} ${verb}`, kind === "sets" ? "Наборов нет: создайте пункт «new» меню /crew-sets." : "Справочник пуст: создайте семью пунктом «new» меню /crew-profiles.")
    const target = await io.select({ title: str(`${name} ${verb} — выберите ${what}`), options: options(d.items), current: d.current })
    if (!target || !d.items.some((i) => i.value === target)) return
    if (verb === "use" || verb === "show" || (verb === "delete" && kind === "sets")) return run(`${verb} ${target}`)
    if (verb === "rename") {
      const to = await askText(`${name} rename ${target} → новое имя`, `новое имя ${kind === "sets" ? "набора" : "семьи"}`)
      return to ? run(`rename ${target} ${to}`) : undefined
    }
    if (kind === "sets" && verb === "set") {
      const cell = await askText(`${name} set ${target} — этап и ячейка`, "этап семья/ступень — например: develop_accept kimi/heavy")
      return cell ? run(`set ${target} ${cell}`) : undefined
    }
    if (kind === "sets" && verb === "unset") {
      const st = await loadPick(target)
      if (!st.items.length) return void io.show(`crew-harness — ${name} unset`, `У набора «${target}» нет описанных этапов.`)
      const stage = await io.select({ title: str(`${name} unset ${target} — какой этап убрать`), options: options(st.items) })
      return stage && st.items.some((i) => i.value === stage) ? run(`unset ${target} ${stage}`) : undefined
    }
    if (kind === "profiles" && verb === "delete") {
      const tier = await io.select({
        title: str(`${name} delete ${target} — что удалить`),
        options: [
          { title: "Вся семья", value: "__all", description: str(`семья «${target}» целиком`) },
          ...["heavy", "medium", "light"].map((t) => ({ title: t, value: t, description: str(`только запись ${target}/${t}`) })),
        ],
      })
      if (!tier) return
      return run(`delete ${target}${tier === "__all" ? "" : " " + tier}`)
    }
    if (kind === "profiles" && verb === "set") {
      const rec = await askText(`${name} set ${target} — ступень и запись`, "<ступень|all> <модель> <context> output=<n> [input=<n>] — например: all kimi-code-plan-global/k3-256k 220000 output=131072")
      return rec ? run(`set ${target} ${rec}`) : undefined
    }
  }

  const verbMenu = async (): Promise<void> => {
    const pick = await io.select({ title: str(name), options: helps.map((v) => ({ title: v.verb, value: v.verb, description: str(`${v.verb}${v.usage ? " " + v.usage : ""} — ${v.what}`) })) })
    if (typeof pick === "string" && pick) return verbFlow(pick)
  }

  const pickFlow = async (): Promise<void> => {
    const d = await loadPick()
    const title = kind === "sets" ? `${name} — наборы (Enter включает)` : `${name} — семьи (Enter показывает)`
    const v = await io.select({
      title: str(title),
      options: [...options(d.items, kind === "sets" ? "Наборы" : "Семьи"), { title: "Другие действия…", value: "__verbs", description: "show, rename, delete, set, new, check …", category: "Действия" }],
      ...(d.current ? { current: d.current } : {}),
    })
    if (typeof v !== "string" || !v) return
    if (v === "__verbs") return verbMenu()
    if (!d.items.some((i) => i.value === v)) return
    return run(kind === "sets" ? `use ${v}` : `show ${v}`)
  }

  const t = typed.trim()
  if (!t || t === "ls" || t === "list") return pickFlow()
  if (needs.includes(t) && helps.some((h) => h.verb === t && !h.bare)) return verbFlow(t)
  return run(t)
}
