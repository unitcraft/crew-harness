// Self-test of the glued-words check (task 021, node >= 24):  node test/crew-glued.test.mjs
// Some models drop spaces in long mixed ru+en string literals; crew_send refuses such a letter and writes no file.
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-glued-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_PRESENCE ??= "all"
const { gluedText } = await import("../glued.ts")
const mod = await import("../index.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const good = [
  "Тесты зелёные, review уже входит в countedOpen, поэтому before merge остаётся 3 из 5.",
  "Пути и хеши: opencode-plugin/core.ts, src/storage/applog_test.nv, коммит 5cdd2bc9a1f0e3 и https://github.com/unitcraft/ai-dev-methodology/tree/main/файл готовы.",
  "Вызови `reviewУЖЕвходитвcountedOpen/inflight,поэтому` как есть, это код.\n```\nreviewУЖЕвходитвcountedOpen/inflight,поэтому beforemerge=3/5\n```",
  "Plain English letter: the gate is green, nothing to merge, crew_task list shows two open tasks and crew_send works.",
  "Только русский текст без латиницы совсем, все слова разделены пробелами, и длинный тоже нормально читается.",
  "Задача crew_task #31 и Nova-плагин: PascalCase вроде NovaПлагин короткий, не склейка.",
]
for (const [i, t] of good.entries()) cell(`normal letter ${i + 1} passes`, !gluedText(t).reject, JSON.stringify(gluedText(t).runs))

const bad = [
  "reviewУЖЕвходитвcountedOpen/inflight,поэтому beforemerge=3/5, готовоkeyfeatureзавершена",
  "envblockerконкретновыясненичистыйlightnativeprobePASSED, дальше нужноподтвердитьрезультатвlightnative",
  "Статус: послеfullacceptможноlocalmerge и cleanup. Остальное: явнаяграницаважнееtemplateдоаварии ждёт.",
]
for (const [i, t] of bad.entries()) cell(`glued letter ${i + 1} is rejected`, gluedText(t).reject, JSON.stringify(gluedText(t)))
cell("one glued run in a short letter is not enough", !gluedText("Привет, результатвlightnative есть.").reject, "rejected")
cell("one glued run in a long spaceless letter is rejected", gluedText("передамадреснымwakeписьмомтебеиисполнителю" + "x".repeat(160)).reject, "passed")

const tools = {}
const ctx = {
  location: { directory: process.cwd() },
  session: { get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: process.cwd() } }), prompt: async () => {}, synthetic: async () => {}, hook: async () => {} },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  command: { list: async () => [], transform: async (fn) => fn({ add: () => {} }) },
}
const stop = await mod.default.setup(ctx)
const inboxCount = () => {
  const root = path.join(tmp, "opencode", "crew-harness", "inbox")
  if (!existsSync(root)) return 0
  return readdirSync(root, { recursive: true }).filter((f) => String(f).endsWith(".json")).length
}
const before = inboxCount()
const r = (await tools.crew_send.execute({ to: "worker", text: bad[0] }, { sessionID: "sesGLUE01" })).content
cell("crew_send refuses the glued letter", /Не отправлено: в тексте слиплись слова/.test(r), r)
cell("the refusal quotes the start of the run", r.includes("reviewУЖЕвходитвcountedOpen…"), r)
cell("no letter file is created", inboxCount() === before, `${before} -> ${inboxCount()}`)
const r2 = (await tools.crew_send.execute({ to: "worker", text: good[0] }, { sessionID: "sesGLUE01" })).content
cell("crew_send does not refuse a normal letter as glued", !/слиплись/.test(r2), r2)

stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-glued.test: FAIL ${fail}` : "crew-glued.test ok")
process.exit(fail ? 1 : 0)
