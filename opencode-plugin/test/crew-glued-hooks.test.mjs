// Self-test of the glued-words guard on tools (task 127, node >= 24):  node test/crew-glued-hooks.test.mjs
// The question tool, text-file writes (edit, write, patch) and crew_send refuse a text with "потолок092 решён15:21"; the second refusal in a
// row (same session, same kind of call) goes through and leaves a line in the journal, so a tab is never blocked.
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-glued-hooks-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all"
const guard = await import("../glued-guard.ts")
const { pieceOf, judge, isTextFile, registerGluedHooks, REFUSAL_WINDOW_MS } = guard

let fail = 0
let n = 0
const cell = (name, ok, detail) => {
  n++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)

// ---- what is taken from a call
const q = (question, labels = ["Да (Recommended)", "Нет"], header = "Ворота") => ({ questions: [{ question, header, options: labels.map((label) => ({ label, description: "" })) }] })
cell("question: the question, the header and the option labels are taken", J(pieceOf("question", q("Влить ветку?", ["Влить", "Подождать"], "Слияние"))?.segments.map((s) => s.text)).includes("Подождать"), J(pieceOf("question", q("Влить ветку?"))))
cell("question: where is 'question'", pieceOf("question", q("Влить ветку?"))?.where === "question", "")
cell("question without texts is not a piece", pieceOf("question", { questions: [] }) === undefined, "")
cell("write of .md is a file piece", pieceOf("write", { path: "doc/a.md", content: "текст" })?.where === "file", "")
cell("write of .portolan.md is a file piece", pieceOf("write", { path: "x/y.portolan.md", content: "текст" }) !== undefined, "")
cell("write of .tsv is a file piece", pieceOf("write", { path: "x/names.tsv", content: "a\tb" }) !== undefined, "")
cell("write of .txt is a file piece", pieceOf("write", { path: "x/a.txt", content: "text" }) !== undefined, "")
for (const f of ["a.ts", "a.mjs", "a.json", "a.nv", "a.tsx", "a.py", "a.yml"]) cell(`write of ${f} is not checked (code)`, pieceOf("write", { path: f, content: "потолок092" }) === undefined, "")
cell("isTextFile", isTextFile("A.MD") && isTextFile("x/b.txt") && !isTextFile("x/b.ts") && !isTextFile(undefined), "")
cell("edit takes newString only", J(pieceOf("edit", { path: "a.md", oldString: "потолок092", newString: "потолок 092" })?.segments) === J([{ file: "a.md", text: "потолок 092" }]), J(pieceOf("edit", { path: "a.md", oldString: "потолок092", newString: "потолок 092" })))
cell("edit of code is not checked", pieceOf("edit", { path: "a.ts", oldString: "a", newString: "потолок092" }) === undefined, "")
cell("multiedit takes the newStrings", pieceOf("multiedit", { filePath: "a.md", edits: [{ newString: "раз" }, { newString: "два" }] })?.segments[0].text === "раз\nдва", "")
const patch = ["*** Begin Patch", "*** Update File: doc/a.md", "@@", " контекст задача081 как был", "-старая строка", "+новая строка потолок092", "*** Update File: src/a.ts", "+const x = 'потолок092'", "*** Add File: doc/b.txt", "+первая", "+вторая", "*** Delete File: doc/c.md", "*** End Patch"].join("\n")
const pp = pieceOf("patch", { patchText: patch })
cell("patch: added lines of text files only", J(pp?.segments) === J([{ file: "doc/a.md", text: "новая строка потолок092" }, { file: "doc/b.txt", text: "первая\nвторая" }]), J(pp))
cell("patch: the context line is not checked", !J(pp).includes("контекст"), J(pp))
cell("apply_patch is the same", pieceOf("apply_patch", { patchText: patch })?.segments.length === 2, "")
cell("patch of code only is not a piece", pieceOf("patch", { patchText: "*** Begin Patch\n*** Update File: a.ts\n+x\n*** End Patch" }) === undefined, "")
cell("unified diff: +++ b/file", pieceOf("patch", { patchText: "--- a/x.md\n+++ b/x.md\n@@ -1 +1 @@\n-a\n+задача081\n" })?.segments[0].file === "x.md", "")
cell("other tools are not checked", pieceOf("bash", { command: "echo потолок092" }) === undefined && pieceOf("read", { path: "a.md" }) === undefined, "")
cell("no input is not a piece", pieceOf("write", null) === undefined && pieceOf("question", "x") === undefined, "")

// ---- the verdict and the second refusal
const logs = []
const log = (l) => logs.push(l)
const letter = (t) => ({ where: "letter", segments: [{ text: t }] })
const GLUED = "потолок092 решён15:21"
cell("judge: a clean text is passed", judge("sj1", letter("потолок 092 решён 15:21"), log) === undefined, "")
const m1 = judge("sj2", letter(GLUED), log)
cell("judge: a glued text is refused with the words", /Не отправлено/.test(m1 ?? "") && (m1 ?? "").includes("«потолок092» → «потолок 092»"), String(m1))
cell("judge: the refusal is logged", logs.some((l) => l.includes("glued words refused: letter in session sj2")), J(logs))
const m2 = judge("sj2", letter(GLUED), log)
cell("judge: the second refusal in a row is passed", m2 === undefined, String(m2))
cell("judge: the pass is logged with the mark", logs.some((l) => l.includes("glued words passed") && l.includes("sj2") && l.includes("потолок092")), J(logs))
cell("judge: after the pass the next glued text is refused again", typeof judge("sj2", letter(GLUED), log) === "string", "")
judge("sj3", letter(GLUED), log)
judge("sj3", letter("чисто, без склеек"), log)
cell("judge: a clean text in between resets the counter", typeof judge("sj3", letter(GLUED), log) === "string", "")
judge("sj4", letter(GLUED), log)
cell("judge: another session has its own counter", typeof judge("sj5", letter(GLUED), log) === "string", "")
cell("judge: another kind of call has its own counter", typeof judge("sj4", { where: "question", segments: [{ text: GLUED }] }, log) === "string", "")
judge("sj6", letter(GLUED), log, 1_000_000)
cell("judge: after the window the refusal counts as the first", typeof judge("sj6", letter(GLUED), log, 1_000_000 + REFUSAL_WINDOW_MS + 1) === "string", "")
const mf = judge("sj7", { where: "file", segments: [{ file: "doc/x.md", text: "ок" }, { file: "doc/y.md", text: GLUED }] }, log)
cell("judge: a file refusal names the file with the glue", /Файл doc\/y\.md не записан/.test(mf ?? ""), String(mf))

// ---- the hooks in the way OpenCode calls them
const handlers = { tool: {}, permission: {} }
const fakeCtx = () => ({ tool: { hook: async (name, f) => void (handlers.tool[name] = f) }, permission: { hook: async (name, f) => void (handlers.permission[name] = f) } })
await registerGluedHooks(fakeCtx(), log)
cell("the three hooks are registered", typeof handlers.tool["execute.before"] === "function" && typeof handlers.tool["execute.after"] === "function" && typeof handlers.permission.evaluate === "function", J(Object.keys(handlers.tool)))
let callNo = 0
// one call as OpenCode makes it: execute.before, then the permission check of the tool, then execute.after
const call = (tool, input, sessionID, action) => {
  const id = `call${++callNo}`
  handlers.tool["execute.before"]({ tool, sessionID, id, input })
  const ev = { sessionID, action: action ?? (tool === "question" ? "question" : "edit"), resources: ["*"], source: { type: "tool", id }, effect: "allow" }
  handlers.permission.evaluate(ev)
  const after = { tool, sessionID, id, status: ev.effect === "deny" ? "error" : "completed", error: ev.effect === "deny" ? { message: "Permission denied: question" } : undefined }
  handlers.tool["execute.after"](after)
  return { effect: ev.effect, message: ev.message, error: after.error?.message }
}
const r1 = call("question", q("Принять задачу081 или потолок092?"), "sh1")
cell("a glued question is denied", r1.effect === "deny", J(r1))
cell("the denial says the question is not shown and what to fix", /Вопрос не показан/.test(r1.message ?? "") && (r1.message ?? "").includes("задачу 081"), J(r1))
cell("the error of the refused question carries our text, not 'Permission denied'", /Вопрос не показан/.test(r1.error ?? ""), J(r1))
const r2 = call("question", q("Принять задачу081 или потолок092?"), "sh1")
cell("the second glued question in a row goes through", r2.effect === "allow", J(r2))
const r3 = call("question", q("Принять задачу 081 или потолок 092?"), "sh2")
cell("a clean question goes through", r3.effect === "allow", J(r3))
const r4 = call("write", { path: "doc/restart-handoff.md", content: "# Передача\n\nпотолок092 решён15:21\n" }, "sh3")
cell("a glued write of .md is denied", r4.effect === "deny" && /Файл doc\/restart-handoff\.md не записан/.test(r4.message ?? ""), J(r4))
const r5 = call("write", { path: "doc/restart-handoff.md", content: "# Передача\n\nпотолок092 решён15:21\n" }, "sh3")
cell("the second glued write in a row goes through", r5.effect === "allow", J(r5))
const r6 = call("write", { path: "src/a.ts", content: "const s = 'потолок092'" }, "sh4")
cell("a write of code is not checked", r6.effect === "allow", J(r6))
const r7 = call("edit", { path: "doc/a.tsv", oldString: "a", newString: "задача081\tx" }, "sh5")
cell("a glued edit of .tsv is denied", r7.effect === "deny", J(r7))
const r8 = call("edit", { path: "doc/a.md", oldString: "потолок092", newString: "потолок 092" }, "sh6")
cell("an edit that fixes the glue (glue only in oldString) goes through", r8.effect === "allow", J(r8))
const r9 = call("patch", { patchText: patch }, "sh7")
cell("a glued patch is denied with the file name", r9.effect === "deny" && r9.message.includes("doc/a.md"), J(r9))
const r10 = call("question", q("Принять задачу081?"), "sh8", "shell")
cell("the verdict is applied to the permission of its own action only", r10.effect === "allow", J(r10))
const r11 = call("bash", { command: "echo задача081" }, "sh9", "shell")
cell("a shell call is not checked", r11.effect === "allow", J(r11))
const r12 = call("question", q("Выбор", ["Принять (Recommended) — готовность0.3", "Нет"]), "sh10")
cell("a glued option label is caught", r12.effect === "deny", J(r12))

// the same call seen by two instances of the plugin (a reload does not always drop the old hooks): one verdict, one count
const before2 = handlers.tool["execute.before"]
await registerGluedHooks(fakeCtx(), log)
const idDup = `dup${++callNo}`
const sizeBefore = logs.length
before2({ tool: "question", sessionID: "sdup", id: idDup, input: q("Принять задачу081?") })
handlers.tool["execute.before"]({ tool: "question", sessionID: "sdup", id: idDup, input: q("Принять задачу081?") })
cell("the same call judged by two instances counts once", logs.slice(sizeBefore).filter((l) => l.includes("sdup")).length === 1, J(logs.slice(sizeBefore)))
const evDup = { sessionID: "sdup", action: "question", source: { id: idDup }, effect: "allow" }
handlers.permission.evaluate(evDup)
cell("and is denied once", evDup.effect === "deny", J(evDup))

// an OpenCode without the hooks: no exception, a line in the journal
const logs2 = []
await registerGluedHooks({}, (l) => logs2.push(l))
cell("no tool.hook in this OpenCode: no exception, a line in the journal", logs2.some((l) => l.includes("no tool.hook")), J(logs2))

// ---- the plugin: the hooks are registered by the setup, and crew_send lets the second glued letter go
const mod = await import("../index.ts")
const tools = {}
const regs = { tool: {}, permission: {} }
const ctx = {
  location: { directory: process.cwd() },
  session: { get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: process.cwd() } }), prompt: async () => {}, synthetic: async () => {}, hook: async () => {} },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }), hook: async (name, f) => void (regs.tool[name] = f) },
  permission: { hook: async (name, f) => void (regs.permission[name] = f) },
  command: { list: async () => [], transform: async (fn) => fn({ add: () => {} }) },
}
const stop = await mod.default.setup(ctx)
cell("setup registers execute.before, execute.after and evaluate", typeof regs.tool["execute.before"] === "function" && typeof regs.tool["execute.after"] === "function" && typeof regs.permission.evaluate === "function", J(Object.keys(regs.tool)))
const inboxCount = () => {
  const root = path.join(tmp, "opencode", "crew-harness", "inbox")
  if (!existsSync(root)) return 0
  return readdirSync(root, { recursive: true }).filter((f) => String(f).endsWith(".json")).length
}
const files0 = inboxCount()
const sendGlued = () => tools.crew_send.execute({ to: "worker", text: "Оркестратору передано16:27, потолок092 решён" }, { sessionID: "sesGLUEW1" })
const s1 = (await sendGlued()).content
cell("crew_send refuses the owner's phrase", /Не отправлено: в тексте слиплись слова/.test(s1) && s1.includes("«передано16:27» → «передано 16:27»"), s1)
cell("crew_send writes no file on a refusal", inboxCount() === files0, `${files0} -> ${inboxCount()}`)
const s2 = (await sendGlued()).content
cell("crew_send lets the second glued letter in a row go (no glued refusal)", !/слиплись/.test(s2), s2)
const s3 = (await sendGlued()).content
cell("and refuses the third again", /слиплись/.test(s3), s3)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-glued-hooks.test: FAIL ${fail} of ${n}` : `crew-glued-hooks.test ok (${n} checks)`)
process.exit(fail ? 1 : 0)
