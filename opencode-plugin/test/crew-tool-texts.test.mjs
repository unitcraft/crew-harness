// Self-test of task 039 (node >= 24):  node test/crew-tool-texts.test.mjs
// TT-1 the system block is English, does not retell the tools, ends with "Project rules: <text>" when the project sets project_rules,
//      and is byte-identical between requests. TT-2 project_rules is a setting, help_extra is gone. TT-3 cleanup and cleaned give one
//      result. TT-4 a task file with the status cleaned is read as done; new records are written done. TT-5 the tool texts are line by
//      line, cover plan_decide, round, kind plan, cleanup, view; the old name cleaned is not in them. TT-6 view equals show.
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-tool-texts.test")
const H = await harness("crew-tool-texts", { settings: { worktrees: "wt", cleanup: "local", merge_precheck: "off" } })
const { call, tools, hooks, proj, git } = H
const sys = async () => {
  const ev = { sessionID: "sesINTEG1", system: [] }
  await hooks.context(ev)
  return ev.system.map((x) => x.text).join("\n")
}

// ---- TT-1 the system block
const s1 = await sys()
const s2 = await sys()
cell("TT-1a the block is English and keeps the tab identity", /You are the crew-harness tab with the role "integrator"/.test(s1) && /project proj/.test(s1) && /sesINTEG1/.test(s1), s1)
cell("TT-1b the block does not retell the tools (crew_list, crew_send, crew_wait) but points to crew_help", !/crew_list|crew_send|crew_wait/.test(s1) && /crew_help/.test(s1), s1)
cell("TT-1c the question rule and the task naming rule are there", /question tool/.test(s1) && /\(Recommended\)/.test(s1) && /#31/.test(s1), s1)
cell("TT-1d no Russian and no project rules by default", !/[а-яё]/i.test(s1) && !/Project rules:/.test(s1), s1)
cell("TT-1e the block is byte-identical between requests", s1 === s2 && s1.length > 0 && s1.length < 575, `${s1.length}`)
H.settings({ project_rules: "Never open a task before the owner says so." })
const s3 = await sys()
const s4 = await sys()
cell("TT-1f project_rules is appended at the end as 'Project rules: <text>'", s3.endsWith("Project rules: Never open a task before the owner says so.") && s3.startsWith(s1.slice(0, 60)), s3)
cell("TT-1g with project_rules the block is still byte-identical between requests", s3 === s4, "")
H.settings({})

// ---- TT-2 the setting
const schema = await import("../config-schema.ts")
cell("TT-2a project_rules is in the schema (string, empty by default), help_extra is not", schema.SCHEMA.some((k) => k.key === "project_rules" && k.default === "") && !schema.SCHEMA.some((k) => k.key === "help_extra"), "")
cell("TT-2b loadConfig reads project_rules", (H.settings({ project_rules: "R1" }), H.cfg().projectRules === "R1"), JSON.stringify(H.cfg().projectRules))
H.settings({})

// ---- TT-3 cleanup == cleaned
const accepted = () => {
  const t = H.reviewing()
  const x = H.task(t.n)
  x.status = "accepted"
  H.tasks.saveTask(x)
  git(proj, "branch", "-D", x.branch)
  return t.n
}
const a = accepted()
const b = accepted()
const ra = await call("crew_task", "sesREV1", { action: "cleanup", n: a })
const rb = await call("crew_task", "sesREV1", { action: "cleaned", n: b })
cell("TT-3 cleanup and cleaned (the synonym) give the same result", H.task(a).status === "done" && H.task(b).status === "done" && ra.replace(/\d+/g, "N") === rb.replace(/\d+/g, "N") && ra.length > 20, ra + "\n---\n" + rb)

// ---- TT-4 old files
const c = H.reviewing()
const file = path.join(H.tasks.TASKS, "proj", `${c.n}.json`)
const raw = JSON.parse(readFileSync(file, "utf8"))
raw.status = "cleaned"
raw.history.push({ at: Date.now(), by: "x", status: "cleaned", note: "old" })
writeFileSync(file, JSON.stringify(raw))
cell("TT-4a a file with the status cleaned is read as done (loadTask and listTasks)", H.task(c.n).status === "done" && H.all().find((x) => x.n === c.n).status === "done" && H.task(c.n).history.at(-1).status === "done", JSON.stringify(H.task(c.n).status))
cell("TT-4b the Russian label of done", H.tasks.statusRu("done").length > 0 && H.tasks.statusRu("done") !== "done", H.tasks.statusRu("done"))

// ---- TT-5 texts
const T = tools.crew_task.description
const lines = T.split("\n")
cell("TT-5a crew_task: one action per line, 'action - who - params - what'", lines.length >= 18 && lines.every((l) => l.length < 700), `${lines.length} lines, max ${Math.max(...lines.map((l) => l.length))}`)
cell("TT-5b crew_task names plan_decide, round, cleanup and not the old cleaned", /plan_decide/.test(T) && /\bround\b/.test(T) && /\bcleanup\b/.test(T) && !/\bcleaned\b/.test(T), "")
cell("TT-5c crew_task enum has cleanup and the synonym", tools.crew_task.input.properties.action.enum.includes("cleanup") && tools.crew_task.input.properties.action.enum.includes("cleaned"), "")
const S = tools.crew_spawn.description
cell("TT-5d crew_spawn describes kind plan fully (plans_dir, rounds, who approves, /plans, plan_decide)", /kind: plan/.test(S) && /plans_dir/.test(S) && /\/plans/.test(S) && /plan_decide/.test(S) && /approval/.test(S), S)
const C = tools.crew_config.description
cell("TT-5e crew_config: view is the main name, plan settings named", /\bview\b/.test(C) && !/show\b.*is the old name|\bshow —/.test(C) && /plan_approver/.test(C) && /plan_acceptance/.test(C) && /plans_dir/.test(C) && C.split("\n").length >= 4, C)
cell("TT-5f crew_watch is line by line", tools.crew_watch.description.split("\n").length >= 6, "")
const help = await call("crew_help", "sesINTEG1", {})
cell("TT-5g HELP explains planning and uses cleanup/done", /ЗАДАЧА-ПЛАН|задача-план/i.test(help) && /plan_decide/.test(help) && /approval/.test(help) && /cleanup/.test(help) && /ПЛАНИРОВАНИЕ/.test(help), "")

// ---- TT-6 view == show
const t6 = H.reviewing()
const v1 = await call("crew_task", "sesINTEG1", { action: "view", n: t6.n })
const v2 = await call("crew_task", "sesINTEG1", { action: "show", n: t6.n })
const g1 = await call("crew_config", "sesINTEG1", { action: "view" })
const g2 = await call("crew_config", "sesINTEG1", { action: "show" })
cell("TT-6 view equals show for crew_task and crew_config", v1.length > 20 && v1 === v2 && g1.length > 20 && g1 === g2, "")

done(H)
