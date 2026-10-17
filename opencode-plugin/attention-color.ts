// ЦВЕТ СТРОК ПАНЕЛИ (задача 082, 2026-10-17). Один способ для обоих блоков окна (sidebar.tsx, progress-sidebar.tsx); модуль без UI и
// без импортов, чтобы его проверял тест. Тон строки (status.ts: base | muted | accent) → цвет темы окна.
// Тема OpenCode 2.x (`api.theme`) — дерево: text.base, text.muted, text.action.*, text.formfield.*, text.feedback.{error,warning,success,info}.base
// и hue.* (hue.accent — шкала акцента). Полей text.accent и text.primary в ней нет: прежнее `t.accent ?? t.primary ?? t.base`
// всегда падало в цвет обычного текста, и строки «ждёт указаний», «Ждут вас», «⚠» не отличались от названий задач (слово владельца,
// 2026-10-17: «"ждёт указаний" — сливается, показывай др. цветом»).
// Тон accent: предупреждение → акцент → основной цвет; берётся первый, что отличается и от обычного текста, и от серого (сравнение по
// значению: цвета окна — объекты, один цвет в разных объектах). Не нашлось — обычный цвет, но жирным (знак виден без цвета).

/** Бит жирного начертания в `attributes` текста окна (TextAttributes.BOLD в рисовальщике OpenCode). */
export const BOLD = 1

export type ToneStyle = { fg?: any; attributes?: number }

const obj = (v: any) => (v !== null && typeof v === "object" ? v : undefined)

/** Один ли это цвет: по ссылке, по r/g/b/a, по буферу или по тексту (строка "#rrggbb"). */
function sameColor(a: any, b: any): boolean {
  if (a === b) return true
  if (a === undefined || a === null || b === undefined || b === null) return false
  if (obj(a) && obj(b)) {
    if (["r", "g", "b", "a"].every((k) => typeof a[k] === "number" && typeof b[k] === "number")) return ["r", "g", "b", "a"].every((k) => a[k] === b[k])
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()
}

const has = (c: any) => c !== undefined && c !== null && c !== ""

/** Цвет и начертание строки по тону; `theme` — `api.theme` окна. Не бросает ни на какой теме. */
export function toneStyle(theme: any, tone?: string): ToneStyle {
  try {
    const t = obj(theme?.text) ?? {}
    if (tone === "muted") return { fg: t.muted }
    if (tone !== "accent") return { fg: t.base }
    const candidates = [obj(obj(t.feedback)?.warning)?.base, t.accent, t.primary, obj(obj(obj(theme)?.hue)?.accent)?.[200]]
    const pick = candidates.find((c) => has(c) && !sameColor(c, t.base) && !sameColor(c, t.muted))
    return pick !== undefined ? { fg: pick } : { fg: t.base, attributes: BOLD }
  } catch {
    return { attributes: BOLD }
  }
}
