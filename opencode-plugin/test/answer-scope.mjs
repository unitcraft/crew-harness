// The borders of the question-answering modes (task 007, DNC-02, DNC-03, DNC-05, DNC-06; node >= 24):
//   node test/answer-scope.mjs               prints "scope ok" when the gates of the owner are untouched, else the violations
//   node test/answer-scope.mjs --selfcheck   puts the word answerMode into a copy of approvals.ts: the check must fail ("scope selfcheck ok")
// The text of the code is read, not run: the files of the approval of plans, of the review and the merge, of the task store, of the
// panel and of the profiles do not mention the answer modes at all, and the bodies of applyApprovals, planSteps, flowWatch,
// endsWithQuestion and statusOf and the branches plan_decide, merge, accept, cleaned, rework of crew_task do not either.
// CREW_PLUGIN_DIR points to another copy of the code.
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const WORDS = /answerMode|answer_(mode|max)|answerTurn|answer-parse|answer\.ts|\banswers\b/
const read = (f) => readFileSync(path.join(plugin, f), "utf8")

/** the text from the first "{" after `start` to its closing brace */
export function bodyAt(text, start) {
  const open = text.indexOf("{", start)
  if (open < 0) return ""
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1)
  }
  return text.slice(open)
}

const WHOLE = ["approvals.ts", "plans.ts", "review.ts", "tasks.ts", "precheck.ts", "tui.ts", "sidebar.tsx", ...readdirSync(plugin).filter((f) => /^(progress|profile)[\w-]*\.tsx?$/.test(f))]
const BODIES = [
  ["index.ts", /function applyApprovals\b/],
  ["index.ts", /function planSteps\b/],
  ["index.ts", /function flowWatch\b/],
  ["status.ts", /function endsWithQuestion\b/],
  ["status.ts", /function statusOf\b/],
  ["core.ts", /action === "plan_decide"/],
  ["core.ts", /action === "merge"/],
  ["core.ts", /action === "accept"/],
  ["core.ts", /\["review", "check", "round", "merge", "unlock", "precheck", "rework", "accept", "cleaned"\]\.includes\(action\)\) \{/],
  ["core.ts", /action === "rework"/],
]

export function violations(override = {}) {
  const out = []
  const src = (f) => override[f] ?? read(f)
  for (const f of WHOLE) {
    const lines = src(f).split("\n")
    lines.forEach((l, i) => WORDS.test(l) && out.push(`${f}:${i + 1}: ${l.trim().slice(0, 100)}`))
  }
  for (const [f, re] of BODIES) {
    const text = src(f)
    const m = re.exec(text)
    if (!m) {
      out.push(`${f}: no place for ${re} (the check cannot find the body)`)
      continue
    }
    const body = bodyAt(text, m.index)
    if (!body) out.push(`${f}: the body of ${re} is empty`)
    else if (WORDS.test(body)) out.push(`${f}: the body of ${re} mentions the answer modes`)
  }
  return out
}

if (process.argv.includes("--selfcheck")) {
  const bad = violations({ "approvals.ts": `${read("approvals.ts")}\nconst x = answerMode\n` })
  console.log(bad.length && bad.some((v) => v.startsWith("approvals.ts")) ? "scope selfcheck ok" : "scope selfcheck FAILED: the planted word was not found")
  process.exit(bad.length ? 0 : 1)
}
const v = violations()
if (v.length) {
  console.log(v.join("\n"))
  console.log("scope FAILED")
  process.exit(1)
}
console.log("scope ok")
