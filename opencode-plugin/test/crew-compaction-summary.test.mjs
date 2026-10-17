// Self-test of task 072 (node >= 24):  node test/crew-compaction-summary.test.mjs
// The summary that OpenCode writes at the compaction of a tab is short and by a pattern. OpenCode 2.0.26 gives a plugin the session hook
// `compaction` (the same payload as the hook `context`: system, messages, tools, model, agent); the template of the summary is fixed in the
// build and is added after the hook, so the plugin adds a rule to the system part of the compaction request. CS-1 the hook, CS-2 the text
// (the template headings are kept: the build accepts a summary only if it carries one of them), CS-3 the cases without the text,
// CS-4 the setting, CS-5 the pattern lives in the Canon once and the code, the README and the Canon agree.
import { readFileSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-compaction-summary.test")
const H = await harness("crew-compaction-summary", { settings: { worktrees: "wt", cleanup: "local", merge_precheck: "off" } })
const { hooks } = H
const ROOT = path.join(import.meta.dirname, "..", "..")
const read = (f) => readFileSync(path.join(ROOT, f), "utf8")

const ask = async (more = {}) => {
  const ev = { sessionID: "sesINTEG1", system: [{ type: "text", text: "base" }], messages: [], model: { providerID: "anthropic", id: "opus" }, ...more }
  await hooks.compaction?.(ev)
  return ev
}
const added = (ev) => ev.system.slice(1).map((x) => x.text).join("\n")

// ---- CS-1 the hook
cell("CS-1a the plugin registers the session hook compaction", typeof hooks.compaction === "function", typeof hooks.compaction)
const ev1 = await ask()
cell("CS-1b the hook adds one text to the system part and keeps what stood there", ev1.system.length === 2 && ev1.system[0].text === "base" && ev1.system[1].type === "text" && ev1.system[1].text.length > 0, JSON.stringify(ev1.system).slice(0, 200))

// ---- CS-2 the text
const t1 = added(ev1)
const t2 = added(await ask())
cell("CS-2a the text is English, byte-identical between requests, and short (under 2600 characters)", t1.length > 0 && !/[а-яё]/i.test(t1) && t1 === t2 && t1.length < 2600, `${t1.length}`)
cell("CS-2b it keeps every heading of the template of OpenCode (the build accepts a summary only with one of them)", /keep (all|every) /i.test(t1) && ["Requirements", "Decisions", "Work State", "Relevant Files", "Important Context"].every((h) => t1.includes(h)), t1)
cell("CS-2c the owner's decisions are verbatim with date and source; one that a later word changed or lifted is dropped", /verbatim/.test(t1) && /date and source/.test(t1) && /(lifted|changed)/.test(t1) && /dropped|drop /.test(t1), t1)
cell("CS-2d bans and limits of the owner, open questions to the owner, what runs and what waits (tasks by title, sessions by kind)", /ban/.test(t1) && /open questions? to the owner/i.test(t1) && /by (its )?title/.test(t1) && /kind/.test(t1), t1)
cell("CS-2e documents by path, never by hash; hashes, card and session numbers and process remarks only when the work cannot go on without them", /path/.test(t1) && /never .*hash/.test(t1) && /(card|session) numbers?/.test(t1) && /process remarks?/.test(t1), t1)
cell("CS-2f length: about 1500 characters a section, up to 6000 in all", /1500/.test(t1) && /6000/.test(t1), t1)
cell("CS-2g the summary is in the owner's language (Russian by default), code and paths unchanged", /in Russian/.test(t1) && /unchanged/.test(t1), t1)

// ---- CS-3 the cases without the text
cell("CS-3a a tab of Claude Code (provider claude-code) gets nothing: Claude Code compacts itself", added(await ask({ model: { providerID: "claude-code", id: "opus" } })) === "", "")
cell("CS-3b a request without a model (older host) still gets the text", added(await ask({ model: undefined })).length > 0, "")
cell("CS-3c a request without a session id gets nothing and the hook does not throw", added(await ask({ sessionID: "" })) === "", "")

// ---- CS-4 the setting
const schema = await import("../config-schema.ts")
const k = schema.SCHEMA.find((s) => s.key === "compaction_summary")
cell("CS-4a compaction_summary is in the schema: bool, true by default, with a question and a reason", !!k && k.kind.type === "bool" && k.default === true && k.question.length > 10 && k.why.length > 10, JSON.stringify(k))
cell("CS-4b the schema checks the value: true and false pass, a string is refused", !!k && schema.invalid("compaction_summary", false) === undefined && schema.invalid("compaction_summary", true) === undefined && !!schema.invalid("compaction_summary", "no"), "")
cell("CS-4c loadConfig: true by default", H.cfg().compactionSummary === true, JSON.stringify(H.cfg().compactionSummary))
H.settings({ compaction_summary: false })
cell("CS-4d compaction_summary false: loadConfig reads it and the hook adds nothing", H.cfg().compactionSummary === false && added(await ask()) === "", JSON.stringify(H.cfg().compactionSummary))
H.settings({ compaction_summary: "no" })
cell("CS-4e a bad value in the file falls back to true", H.cfg().compactionSummary === true && added(await ask()).length > 0, "")
H.settings({ owner_language: "English" })
const en = added(await ask())
cell("CS-4f owner_language English: the text says in English, not Russian", /in English/.test(en) && !/in Russian/.test(en), en)
H.settings({})
cell("CS-4g crew_config names compaction_summary", /compaction_summary/.test(H.tools.crew_config.description), "")

// ---- CS-5 one pattern in the Canon; the code, the README and the Canon agree
const processMd = read("doc/canon/process.md")
const at = processMd.indexOf("## Сводка при сжатии контекста")
const next = at < 0 ? -1 : processMd.indexOf("\n## ", at + 5)
const canon = at < 0 ? "" : processMd.slice(at, next < 0 ? undefined : next)
cell("CS-5a process.md has the section «Сводка при сжатии контекста»", at >= 0 && canon.length > 500, `${at}`)
const cs = await import("../compaction-summary.ts").catch(() => null)
const secs = cs?.COMPACTION_SECTIONS ?? []
cell("CS-5b the module lists the five sections of the pattern: the owner's decisions, open questions, what runs and waits, where the documents are, what is forbidden", secs.length === 5 && ["Что решил владелец", "Открытые вопросы владельцу", "Что идёт и что ждёт", "Где лежат документы", "Что нельзя делать"].every((n) => secs.some((s) => s.ru === n)), JSON.stringify(secs.map((s) => s.ru)))
cell("CS-5c the Canon names each section and the heading of the OpenCode template it goes under", secs.length === 5 && secs.every((s) => canon.includes(s.ru) && canon.includes(s.template)), canon.slice(0, 100))
cell("CS-5d the Canon states the lengths (1–1,5 thousand a section, up to 6 thousand) and the no-hash rule", /1–1,5 тысячи/.test(canon) && /6 тысяч/.test(canon) && /хеш/.test(canon), "")
cell("CS-5e the Canon says what the plugin does not reach (Claude Code tabs, the template) and names the setting", /Claude Code/.test(canon) && /compaction_summary/.test(canon) && /шаблон/.test(canon), "")
let head = ""
try {
  head = readFileSync(path.join(ROOT, "opencode-plugin", "compaction-summary.ts"), "utf8").slice(0, 1500)
} catch {}
cell("CS-5f the module refers to the Canon section (the pattern is not repeated as a second source)", /doc\/canon\/process\.md/.test(head), head.slice(0, 80))
const readme = read("opencode-plugin/README.md")
cell("CS-5g the README of the plugin has a paragraph on the summary at compaction: the hook, the setting, the Canon", /compaction_summary/.test(readme) && /session hook `compaction`/.test(readme) && /process\.md/.test(readme), "")

done(H)
