// Self-test of the panel, the doctor, the hooks and the plugin around the control of the windows (task 157, node >= 24):  node test/crew-branch-panel.test.mjs
// /crew and the side panel show "expected -> actual" of every controlled window (red at a drift, yellow for a change with a reason in
// the last day); crew_doctor names the drift; the hooks of OpenCode refuse a command through the permission check; and the plugin
// itself puts one line into the system part of a turn of an integrator who stands in the folder of task 145.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-branch-panel-"))
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_POLL_MS = "100"
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
process.env.CREW_HARNESS_PRESENCE = "all"
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
let fail = 0
let n = 0
const cell = (name, ok, detail) => {
  n++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const J = (v) => JSON.stringify(v)
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href).catch((e) => ({ missing: String(e?.message ?? e) }))
const bg = await load("branch-guard.ts")
const status = await import(pathToFileURL(path.join(plugin, "status.ts")).href)
const { BASE } = await import(pathToFileURL(path.join(plugin, "paths.ts")).href)
const fn = (name, dflt) => (typeof bg[name] === "function" ? bg[name] : () => dflt ?? { missing: name })
const checkWindow = fn("checkWindow")
const branchRows = fn("branchRows", [])
const branchProblems = fn("branchProblems", [])
const branchNotes = fn("branchNotes", [])
const noteBranch = fn("noteBranch")
const registerBranchHooks = fn("registerBranchHooks")
const fw = (p) => p.replace(/\\/g, "/")

// ---- a real repository: the main copy, the tree of task 145, a helper tree
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const MAIN = path.join(tmp, "proj")
mkdirSync(path.join(MAIN, ".opencode"), { recursive: true })
writeFileSync(path.join(MAIN, ".opencode", "crew-harness.json"), JSON.stringify({ project: "proj", allow_default_models: true }))
git(MAIN, "init", "-q", "-b", "main")
writeFileSync(path.join(MAIN, "a.txt"), "a\n")
git(MAIN, "add", "-A")
git(MAIN, "commit", "-q", "-m", "init")
const T145 = path.join(tmp, "trees", "proj-145-orders")
git(MAIN, "worktree", "add", "-q", "-b", "task/145-orders", T145)
const HELPER = path.join(tmp, "trees", "proj-helper")
git(MAIN, "worktree", "add", "-q", "-b", "update/main", HELPER)

// ---- the states for the panel, written by the module on fake dependencies
const clock = { t: Date.now() }
const tasks = new Map([["proj#145", { project: "proj", n: 145, status: "running", executor: "ses_145", directory: MAIN, worktree: T145, branch: "task/145-orders", sessions: [], side: [] }]])
const logs = []
const deps = {
  base: BASE,
  log: (l) => logs.push(l),
  now: () => clock.t,
  projectRoot: (p) => (p === "proj" ? MAIN : undefined),
  targetBranch: () => "main",
  task: (p, nn) => tasks.get(`${p}#${nn}`),
  openTasks: () => [...tasks.values()],
  holdsLock: () => false,
  taskNote: () => {},
}
const integrator = { session: "ses_int", role: "integrator", project: "proj" }
const exec145 = { session: "ses_145", role: "worker", project: "proj", task: { project: "proj", n: 145 } }
checkWindow(integrator, T145, deps)
checkWindow(exec145, T145, deps)
const sum = (now = clock.t) => status.formatStatuses([{ session: "s1", project: "proj", role: "worker", title: "t", state: "idle", detail: "free", watches: [], asked: [], tasks: [] }], now)
const side = (now = clock.t) => status.sidebarLines([], now, "proj").rows

const rows = branchRows(BASE, "proj", clock.t)
cell("branchRows: a red row for the drift of the integrator, a muted row for the executor that is where it should be", Array.isArray(rows) && rows.some((r) => r.tone === "error" && /integrator/.test(r.text)) && rows.some((r) => r.tone === "muted" && /145/.test(r.text)), J(rows))
const text = sum()
cell("/crew shows expected -> actual of the window: the folder and the branch", /integrator/.test(text) && /ожидалось/.test(text) && /фактически/.test(text) && text.includes("@ main") && text.includes("task/145-orders"), text)
cell("/crew marks the drift with the red sign", /⚠[^\n]*integrator/.test(text), text)
cell("/crew keeps a window that is where it should be to one calm line", /как ожидалось/.test(text), text)
const sr = side()
cell("the side panel: the drift is a red (error) row that begins with the sign", sr.some((r) => r.tone === "error" && /^⚠/.test(r.what)), J(sr))
cell("every row of the panel fits its width", sr.length > 0 && sr.every((r) => status.sideText(r).length <= status.SIDE_WIDTH), J(sr.map((r) => status.sideText(r))))
cell("other projects do not see the rows of this one", branchRows(BASE, "proj", clock.t).length > 0 && !status.sidebarLines([], clock.t, "other").rows.some((r) => /integrator/.test(r.what)) && branchRows(BASE, "other", clock.t).length === 0, "")
const pr = branchProblems(BASE, clock.t)
cell("crew_doctor lines: the drift names the role, the session, the expected and the actual", pr.length === 1 && /integrator/.test(pr[0]) && /ses_int/.test(pr[0]) && /ожидалось/.test(pr[0]) && /фактически/.test(pr[0]) && pr[0].includes("task/145-orders"), J(pr))
clock.t += 60_000
const stale = branchProblems(BASE, clock.t + 3 * 3600_000)
cell("a state nobody has refreshed for hours is not a live problem", pr.length === 1 && stale.length === 0, J(stale))

// a reason: the yellow line for a day
const nn = noteBranch(integrator, T145, { what: "stay in the tree of 145 to read its report", why: "the owner asked to look at the result of 145", who: "owner, 2026-10-23", directory: T145 }, deps)
checkWindow(integrator, T145, deps)
const rows2 = branchRows(BASE, "proj", clock.t)
cell("with the reason the red row turns into a yellow (warn) one with the reason and who allowed it", nn?.ok === true && rows2.some((r) => r.tone === "warn" && /причина/.test(r.text) && /owner/.test(r.text)) && !rows2.some((r) => r.tone === "error"), J(rows2))
cell("the doctor has no problem now, the note goes to the information lines", branchProblems(BASE, clock.t).length === 0 && branchNotes(BASE, clock.t).some((l) => /integrator/.test(l) && /owner/.test(l)), J(branchNotes(BASE, clock.t)))
cell("after a day the yellow row is gone", rows2.some((r) => r.tone === "warn") && !branchRows(BASE, "proj", clock.t + 25 * 3600_000).some((r) => r.tone === "warn"), "")
const tonePath = pathToFileURL(path.join(plugin, "attention-color.ts")).href
const { toneStyle } = await import(tonePath)
const theme = { text: { base: "B", muted: "M", feedback: { warning: { base: "W" }, error: { base: "E" } } } }
cell("the colors: error is red, warn is yellow, muted grey, both fall back to the accent when the theme has no such color", toneStyle(theme, "error").fg === "E" && toneStyle(theme, "warn").fg === "W" && toneStyle(theme, "muted").fg === "M" && toneStyle({ text: { base: "B", muted: "M" } }, "error").attributes === 1, J([toneStyle(theme, "error"), toneStyle({ text: { base: "B", muted: "M" } }, "error")]))

// ---- the hooks in the way OpenCode calls them
const handlers = { tool: {}, permission: {} }
const fakeCtx = { tool: { hook: async (name, f) => void (handlers.tool[name] = f) }, permission: { hook: async (name, f) => void (handlers.permission[name] = f) } }
const cards = { ses_int: integrator, ses_145: exec145, ses_orch: { session: "ses_orch", role: "orchestrator", project: "proj" } }
const where = { ses_int: MAIN, ses_145: T145, ses_orch: MAIN }
const hlogs = []
await registerBranchHooks(fakeCtx, (l) => hlogs.push(l), { cardOf: (sid) => cards[sid], dirOf: async (sid) => where[sid], deps })
cell("the three hooks are registered", typeof handlers.tool["execute.before"] === "function" && typeof handlers.tool["execute.after"] === "function" && typeof handlers.permission.evaluate === "function", J(Object.keys(handlers.tool)))
let callNo = 0
// one call as OpenCode makes it: execute.before, the permission check, execute.after
const call = async (tool, input, sessionID) => {
  if (typeof handlers.tool["execute.before"] !== "function") return { effect: "missing" }
  const id = `c${++callNo}`
  await handlers.tool["execute.before"]({ tool, sessionID, id, input })
  const ev = { sessionID, action: tool === "bash" ? "bash" : "edit", resources: ["*"], source: { type: "tool", id }, effect: "allow" }
  await handlers.permission.evaluate(ev)
  const after = { tool, sessionID, id, status: ev.effect === "deny" ? "error" : "completed", error: ev.effect === "deny" ? { message: "denied" } : undefined }
  await handlers.tool["execute.after"](after)
  return { effect: ev.effect, message: ev.message }
}
const c1 = await call("bash", { command: "git checkout update/main" }, "ses_int")
cell("a bash call that switches the branch of the main copy is denied through the permission check, with the way to a reason", c1.effect === "deny" && /crew_branch_note/.test(c1.message ?? ""), J(c1))
cell("the refusal is written to the journal of the project (blocked)", existsSync(path.join(BASE, "branch-journal.jsonl")) && readFileSync(path.join(BASE, "branch-journal.jsonl"), "utf8").split("\n").some((l) => l.includes('"blocked"') && l.includes("ses_int")), "")
const c2 = await call("bash", { command: "git status" }, "ses_int")
cell("a read passes", c2.effect === "allow", J(c2))
const c3 = await call("bash", { command: `git -C ${fw(HELPER)} commit --allow-empty -m x` }, "ses_int")
cell("git -C <its helper tree> passes", c3.effect === "allow", J(c3))
const c4 = await call("bash", { command: "git reset --hard" }, "ses_orch")
cell("a window that is not controlled passes everything", c4.effect === "allow", J(c4))
const c5 = await call("write", { filePath: path.join(T145, "x.md"), content: "x" }, "ses_int")
cell("a write into the tree of someone else's task is denied", c5.effect === "deny", J(c5))
const c6 = await call("bash", { command: "git checkout update/main" }, "ses_unknown")
cell("a session without a card passes (nothing is known about it)", c6.effect === "allow", J(c6))
// after a command the branch that changed is written as was -> became
where.ses_145 = T145
git(T145, "switch", "-q", "-c", "side/oops")
await handlers.tool["execute.after"]?.({ tool: "bash", sessionID: "ses_145", id: "x-after", status: "completed" })
const lines = (existsSync(path.join(BASE, "branch-journal.jsonl")) ? readFileSync(path.join(BASE, "branch-journal.jsonl"), "utf8") : "").split("\n").filter(Boolean).map((l) => JSON.parse(l))
cell("after a shell call the window is checked again: a branch that changed under it is a line was -> became", lines.some((l) => l.session === "ses_145" && l.kind === "drift" && l.to?.includes("side/oops")), J(lines.filter((l) => l.session === "ses_145")))
git(T145, "switch", "-q", "task/145-orders")
// a call that is judged by two instances of the plugin: one verdict
const regs2 = { tool: {}, permission: {} }
await registerBranchHooks({ tool: { hook: async (k, f) => void (regs2.tool[k] = f) }, permission: { hook: async (k, f) => void (regs2.permission[k] = f) } }, (l) => hlogs.push(l), { cardOf: (sid) => cards[sid], dirOf: async (sid) => where[sid], deps })
const idDup = `dup${++callNo}`
const blockedN = () => (existsSync(path.join(BASE, "branch-journal.jsonl")) ? readFileSync(path.join(BASE, "branch-journal.jsonl"), "utf8").split("\n").filter((l) => l.includes('"blocked"')).length : 0)
const before = blockedN()
await handlers.tool["execute.before"]?.({ tool: "bash", sessionID: "ses_int", id: idDup, input: { command: "git merge x" } })
await regs2.tool["execute.before"]?.({ tool: "bash", sessionID: "ses_int", id: idDup, input: { command: "git merge x" } })
const afterN = blockedN()
cell("the same call seen by two instances is judged and written once", afterN - before === 1, `${before} -> ${afterN}`)
const logs2 = []
await registerBranchHooks({}, (l) => logs2.push(l), { cardOf: () => undefined, dirOf: async () => undefined, deps })
cell("an OpenCode without the hooks: no exception, a line in the journal", logs2.some((l) => /no tool\.hook/.test(l)), J(logs2))

// ---- the plugin: the turn of the integrator who stands in the folder of task 145
const mod = await import(pathToFileURL(path.join(plugin, "index.ts")).href)
const tools = {}
const hooks = {}
const regs = { tool: {}, permission: {} }
const sessionDir = new Map([["sesINTEGR1", T145]])
const ctx = {
  location: { directory: MAIN },
  options: { projects: [MAIN] },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: sessionDir.get(sessionID) ?? MAIN }, time: {} }),
    prompt: async () => {},
    synthetic: async () => {},
    create: async (r) => ({ id: r.id }),
    update: async () => {},
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (f) => f({ add: (t) => (tools[t.name] = t) }), hook: async (name, f) => void (regs.tool[name] = f) },
  permission: { hook: async (name, f) => void (regs.permission[name] = f) },
  command: { list: async () => [], transform: async (f) => f({ add: () => {} }) },
}
const stop = await mod.default.setup(ctx)
cell("setup registers the tool crew_branch_note and the branch hooks", typeof tools.crew_branch_note?.execute === "function" && typeof regs.tool["execute.before"] === "function", J(Object.keys(tools)))
await tools.crew_role.execute({ role: "integrator" }, { sessionID: "sesINTEGR1" })
const sys = []
await hooks.context({ sessionID: "sesINTEGR1", system: sys })
const warned = sys.map((s) => s.text).filter((t) => /окно не на своей ветке/.test(t))
cell("the turn of the integrator in the tree of 145: one line in the system part, expected and actual", warned.length === 1 && /ожидалось/.test(warned[0]) && /фактически/.test(warned[0]) && warned[0].includes("task/145-orders"), J(sys.map((s) => s.text.slice(-300))))
sessionDir.set("sesINTEGR1", MAIN)
const sys2 = []
await hooks.context({ sessionID: "sesINTEGR1", system: sys2 })
cell("after session_move to the main copy the next turn has no warning", warned.length === 1 && !sys2.some((s) => /окно не на своей ветке/.test(s.text)), J(sys2.map((s) => s.text.slice(-200))))
sessionDir.set("sesINTEGR1", T145)
await hooks.context({ sessionID: "sesINTEGR1", system: [] })
const doc = (await tools.crew_doctor.execute({}, { sessionID: "sesINTEGR1" })).content
cell("crew_doctor of the plugin names the window that is not where it should be", /ожидалось/.test(doc) && /integrator/.test(doc), doc)
const nt = (await tools.crew_branch_note?.execute({ what: "reading the report of 145", why: "the owner asked", who: "owner, 2026-10-23", directory: T145 }, { sessionID: "sesINTEGR1" }))?.content
cell("crew_branch_note works through the tool: the answer says the reason is recorded", /записан/i.test(nt ?? ""), nt)
const nt2 = (await tools.crew_branch_note?.execute({ what: "x" }, { sessionID: "sesINTEGR1" }))?.content
cell("crew_branch_note without the reason answers what is missing", /why|зачем|причин/i.test(nt2 ?? "") && /who|кто/i.test(nt2 ?? ""), nt2)
stop?.()

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-branch-panel.test: FAIL ${fail} of ${n}${bg.missing ? " (module: " + bg.missing + ")" : ""}` : `crew-branch-panel.test ok (${n} checks)`)
process.exit(fail ? 1 : 0)
