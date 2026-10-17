// Self-test of the colour of the rows that wait for the owner (task 082; node >= 24):  node test/crew-attention-color.test.mjs
// The owner (2026-10-17, to a screenshot of the panel): «"ждёт указаний" — сливается, показывай др. цветом». The cause: the panels took the
// colour of the tone "accent" from `theme.text.accent ?? theme.text.primary ?? theme.text.base`, but the theme of OpenCode 2.x has no such
// fields in `text` (its tree is text.base, text.muted, text.action.*, text.formfield.*, text.feedback.{error,warning,success,info}.base;
// the accent is `hue.accent`), so the tone fell to the colour of plain text. The rule now (attention-color.ts, one function for both
// panels): warning -> accent -> primary, the first one that differs from both the plain text and the grey; none -> plain colour + bold.
import { readFileSync } from "node:fs"

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
let mod
try {
  mod = await import("../attention-color.ts")
} catch (e) {
  cell("attention-color.ts loads", false, String(e?.message ?? e).split("\n")[0])
}
const BOLD = 1
// a colour of the window is an object with r, g, b, a; two colours of one value are two objects (never compared by reference)
const rgba = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
}
const fb = (hex) => ({ base: rgba(hex) })
// the values of the theme "opencode" of OpenCode 2.x (read from its sources): dark and light
const DARK = {
  text: { base: rgba("#eeeeee"), muted: rgba("#808080"), feedback: { error: fb("#e06c75"), warning: fb("#f5a742"), success: fb("#7fd88f"), info: fb("#56b6c2") } },
  hue: { accent: { 200: rgba("#9d7cd8") } },
}
const LIGHT = {
  text: { base: rgba("#1a1a1a"), muted: rgba("#8a8a8a"), feedback: { error: fb("#d1383d"), warning: fb("#d68c27"), success: fb("#3d9a57"), info: fb("#318795") } },
  hue: { accent: { 200: rgba("#7b5bb6") } },
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const style = (theme, tone) => mod?.toneStyle?.(theme, tone)
const th = (text, hue) => ({ text, ...(hue ? { hue } : {}) })

if (mod) {
  // the theme of the owner (dark and light): the waiting rows are neither plain nor grey
  for (const [nm, T] of [["dark", DARK], ["light", LIGHT]]) {
    const a = style(T, "accent")
    cell(`${nm} theme: tone accent is the warning colour`, eq(a?.fg, T.text.feedback.warning.base), JSON.stringify(a))
    cell(`${nm} theme: it differs from plain text and from grey, no bold needed`, !eq(a?.fg, T.text.base) && !eq(a?.fg, T.text.muted) && a?.attributes === undefined, JSON.stringify(a))
    cell(`${nm} theme: base and muted are untouched`, eq(style(T, "base"), { fg: T.text.base }) && eq(style(T, "muted"), { fg: T.text.muted }), JSON.stringify([style(T, "base"), style(T, "muted")]))
  }
  // the source of the task: accent equal to base -> still not drawn in base
  const same = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), accent: rgba("#eeeeee"), feedback: { warning: fb("#f5a742") } })
  cell("accent equal to base: the row is not drawn in base nor in muted", (() => { const a = style(same, "accent"); return a && !eq(a.fg, same.text.base) && !eq(a.fg, same.text.muted) })(), JSON.stringify(style(same, "accent")))
  // the fall-back order: warning -> accent -> primary
  const noWarn = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), accent: rgba("#9d7cd8"), primary: rgba("#fab283") })
  cell("no warning field: the accent is taken", eq(style(noWarn, "accent")?.fg, noWarn.text.accent) && style(noWarn, "accent")?.attributes === undefined, JSON.stringify(style(noWarn, "accent")))
  const onlyPrimary = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), primary: rgba("#fab283") })
  cell("no warning and no accent: the primary is taken", eq(style(onlyPrimary, "accent")?.fg, onlyPrimary.text.primary), JSON.stringify(style(onlyPrimary, "accent")))
  const hueOnly = th({ base: rgba("#eeeeee"), muted: rgba("#808080") }, { accent: { 200: rgba("#9d7cd8") } })
  cell("only the accent hue of the theme: it is taken", eq(style(hueOnly, "accent")?.fg, hueOnly.hue.accent[200]), JSON.stringify(style(hueOnly, "accent")))
  const warnIsBase = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), feedback: { warning: fb("#eeeeee") }, accent: rgba("#9d7cd8") })
  cell("the warning colour equal to plain text is skipped (compared by value, not by object)", eq(style(warnIsBase, "accent")?.fg, warnIsBase.text.accent), JSON.stringify(style(warnIsBase, "accent")))
  const warnIsMuted = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), feedback: { warning: fb("#808080") }, primary: rgba("#fab283") })
  cell("the warning colour equal to grey is skipped", eq(style(warnIsMuted, "accent")?.fg, warnIsMuted.text.primary), JSON.stringify(style(warnIsMuted, "accent")))
  // everything coincides: plain colour, but bold (a sign visible without colour)
  const allSame = th({ base: rgba("#eeeeee"), muted: rgba("#808080"), accent: rgba("#eeeeee"), primary: rgba("#808080"), feedback: { warning: fb("#eeeeee") } })
  const as = style(allSame, "accent")
  cell("every field coincides with plain text or grey: plain colour and bold", eq(as?.fg, allSame.text.base) && as?.attributes === BOLD, JSON.stringify(as))
  // colours as strings
  const strs = th({ base: "#eeeeee", muted: "#808080", feedback: { warning: { base: "#f5a742" } } })
  cell("colours given as strings work", style(strs, "accent")?.fg === "#f5a742", JSON.stringify(style(strs, "accent")))
  // no fields at all: no throw
  let threw = ""
  const odd = [undefined, null, {}, { text: undefined }, { text: null }, { text: {} }, { text: "x" }, 5, { text: { feedback: null } }, { text: { feedback: { warning: null } } }, { text: { feedback: { warning: {} } } }]
  for (const T of odd)
    for (const tone of ["accent", "base", "muted", "zzz", undefined]) {
      try {
        style(T, tone)
      } catch (e) {
        threw += `${JSON.stringify(T)}/${tone}: ${e?.message}; `
      }
    }
  cell("a theme without fields, or with odd ones, does not throw", threw === "", threw)
  const empty = style({}, "accent")
  cell("a theme without fields: no colour, bold as the only sign", empty?.fg === undefined && empty?.attributes === BOLD, JSON.stringify(empty))
  cell("an unknown tone is drawn as base", eq(style(DARK, "zzz")?.fg, DARK.text.base), JSON.stringify(style(DARK, "zzz")))
}

// both panels draw the tone through the one function; the old expression is gone
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")
for (const f of ["sidebar.tsx", "progress-sidebar.tsx"]) {
  const s = src(f)
  cell(`${f} imports toneStyle from attention-color.ts and draws with it`, /import \{[^}]*\btoneStyle\b[^}]*\} from "\.\/attention-color\.ts"/.test(s) && /toneStyle\(/.test(s) && /attributes=\{/.test(s), "")
  cell(`${f} has no own colour expression (t.accent ?? t.primary ...)`, !/t\.accent|t\.primary/.test(s), "")
}
const leaf = (() => {
  try {
    return src("attention-color.ts")
  } catch {
    return ""
  }
})()
cell("attention-color.ts is a module without UI and without imports", leaf !== "" && !/^\s*import\s/m.test(leaf) && !/<text|<box|solid-js|opentui/.test(leaf), "")

console.log(fail ? `\n${fail} FAILED` : "\nall ok")
process.exit(fail ? 1 : 0)
