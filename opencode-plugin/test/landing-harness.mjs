// Shared set-up of the landing tests (task 005): a fake OpenCode host over the real plugin modules, a project that is a real git
// repository with a local bare `origin` (a file path), a second clone that moves the origin, tabs of the integrator and the
// reviewers, and helpers that build tasks on review. Not a test itself (no `.test.` in the name: `npm test` does not take it).
// The plugin code comes from CREW_PLUGIN_DIR (a copy with stubs, task 005 AC-30) or from the folder above this one.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PLUGIN = process.env.CREW_PLUGIN_DIR ?? path.join(import.meta.dirname, "..")
const load = (f) => import(pathToFileURL(path.join(PLUGIN, f)).href)

/**
 * @param prefix temp folder prefix; @param opts {settings, tabs, attach, db}
 * attach: the folder of a harness already created by another process — the same project, origin and data folders, a second
 *   plugin instance in this process (the child processes of the race tests); nothing is created or removed there.
 * db: an OpenCode database with the session table (opts.tabs sessions), for the letter about an interrupted turn.
 */
export async function harness(prefix, opts = {}) {
  const attach = opts.attach
  const tmp = attach ?? mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  process.env.XDG_DATA_HOME = tmp
  process.env.CREW_HARNESS_POLL_MS = "100"
  process.env.CREW_HARNESS_STATUS_MS = "100"
  process.env.CREW_HARNESS_FLOW_MS = "200"
  process.env.CREW_HARNESS_LEFT_MS = "3600000"
  process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
  process.env.CREW_HARNESS_DB = path.join(tmp, opts.db || attach ? "opencode.db" : "absent.db")
  if (opts.db) process.env.CREW_HARNESS_PROCESS_START = String(Date.now()) // the turns that stopped before this moment were interrupted by a restart
  delete process.env.CREW_HARNESS_PRESENCE
  const proj = path.join(tmp, "proj")
  const bare = path.join(tmp, "origin.git")
  const other = path.join(tmp, "other")
  if (!attach) mkdirSync(path.join(proj, ".opencode"), { recursive: true })
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const gitTry = (cwd, ...args) => {
    try {
      return { ok: true, out: git(cwd, ...args) }
    } catch (e) {
      return { ok: false, out: String(e.stderr ?? e.message) }
    }
  }
  let current = {}
  const settings = (more = {}) => {
    current = { ...more }
    writeFileSync(path.join(proj, ".opencode", "crew-harness.json"), JSON.stringify({ spawn_limits: { worker: 20, reviewer: 0 }, stall_minutes: 600, inflight_limit: 50, accepted_reminder_min: 600, merge_precheck: "required", ...(opts.settings ?? {}), ...more }))
  }
  if (!attach) {
    settings()
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare], { stdio: "ignore" })
    git(proj, "init", "-q", "-b", "main")
    writeFileSync(path.join(proj, ".git", "info", "exclude"), ".opencode/\n") // the settings file is not part of any commit
    writeFileSync(path.join(proj, "a.txt"), "a\n")
    git(proj, "add", "-A")
    git(proj, "commit", "-q", "-m", "init")
    git(proj, "remote", "add", "origin", bare)
    git(proj, "push", "-q", "origin", "main")
    git(tmp, "clone", "-q", bare, other)
  }
  const sidsAll = ["sesINTEG1", ...(opts.tabs ?? ["sesREV1", "sesREV2", "sesREV3"])]
  let db
  if (opts.db && !attach) {
    db = new DatabaseSync(path.join(tmp, "opencode.db"))
    db.exec("create table session_v2 (id text primary key, directory text, title text, parent_id text, time_archived integer, time_idle integer, time_viewed integer, time_suspended integer)")
    for (const sid of sidsAll) db.prepare("insert into session_v2 values (?, ?, ?, null, null, null, null, null)").run(sid, proj, sid)
  }

  const mod = await load("index.ts")
  const core = await load("core.ts")
  const tasks = await load("tasks.ts")
  const review = await load("review.ts")
  const precheck = await load("precheck.ts")
  const hooks = {}
  const tools = {}
  const events = {}
  const delivered = []
  const sessions = new Map()
  const ctx = {
    location: { directory: proj },
    options: { projects: { proj } },
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
      prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
      synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
      create: async (req) => {
        if (!sessions.has(req.id)) sessions.set(req.id, req)
        return { id: req.id }
      },
      update: async () => {},
      hook: async (name, cb) => (hooks[name] = cb),
    },
    tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
    events: { on: async (name, cb) => (events[name] = cb) },
  }
  const stop = await mod.default.setup(ctx)
  const sids = sidsAll
  const WPID = 700000 + Math.floor(Math.random() * 90000)
  mkdirSync(core.WINDOWS, { recursive: true })
  const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs: sids.map((sessionID, i) => ({ sessionID, active: i === 0, busy: false })) }))
  beat()
  const heart = setInterval(beat, 300)
  const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
  const until = async (cond, ms = 8_000) => {
    for (const end = Date.now() + ms; !cond() && Date.now() < end; ) await wait(100)
  }
  // the window heartbeat is refreshed before every call: the synchronous git work of a test blocks the timer for seconds, and a
  // holder whose window looks dead would have its lock taken as abandoned
  const call = async (name, sid, input = {}) => {
    beat()
    return (await tools[name].execute(input, { sessionID: sid })).content
  }
  const roleOf = (sid) => (sid === "sesINTEG1" ? "integrator" : "worker")
  // a child (attach) registers only the session it acts as: the idle events of the other tabs would make every instance nudge the same
  // obligations at once, and two processes writing one letter file of the same name collide on a rename (a plugin weakness outside this task)
  for (const sid of attach ? (opts.only ? [opts.only] : []) : sids) {
    if (!attach) core.saveCard({ session: sid, role: roleOf(sid), auto: false, title: sid, directory: proj, repo: "proj", project: "proj", pid: process.pid, updated: Date.now() })
    await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
    await events["session.idle"]({ properties: { sessionID: sid } })
  }
  if (!attach) await call("crew_role", "sesINTEG1", { role: "integrator" })

  let seq = 0
  const H = {
    tmp, proj, bare, other, git, gitTry, settings, mod, core, tasks, review, precheck, delivered, hooks, tools, events, call, wait, until, sids,
    beat,
    /** take the merge lock for a session directly (the window heartbeat is fresh) */
    take: (sid, n) => {
      beat()
      return review.takeMergeLock("proj", sid, n)
    },
    cfg: () => core.loadConfig(proj),
    /** current settings written by the last settings() call */
    current: () => current,
    task: (n) => tasks.loadTask("proj", n),
    all: () => tasks.listTasks("proj"),
    reset: () => rmSync(path.join(tasks.TASKS, "proj"), { recursive: true, force: true }),
    /** a task on review for `reviewer`: its branch `t<n>` exists in the project with one commit of its own */
    reviewing: (more = {}) => {
      const t = tasks.createTask({
        project: "proj", title: more.title ?? `задача ${++seq}`, goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku",
        author: "sesINTEG1", author_role: "proj.integrator", qid: `q${Math.random().toString(36).slice(2, 8)}`, status: "reviewing", kind: "spawn", directory: proj,
        executor: more.executor ?? `sesEX${seq}`, reviewer: more.reviewer ?? "sesREV1", review_kind: "tab", review_qid: `rq${seq}-${Math.random().toString(36).slice(2, 6)}`, ...(more.plan ? { plan: more.plan } : {}),
      })
      if (more.branch !== false) {
        t.branch = `t${t.n}`
        const cur = git(proj, "rev-parse", "--abbrev-ref", "HEAD")
        git(proj, "branch", "-f", t.branch, `origin/main`)
        git(proj, "switch", "-q", t.branch)
        writeFileSync(path.join(proj, `f${t.n}.txt`), `feature ${t.n}\n`)
        git(proj, "add", "-A")
        git(proj, "commit", "-q", "-m", `feature ${t.n}`)
        git(proj, "switch", "-q", cur)
      }
      Object.assign(t, more.fields ?? {})
      tasks.saveTask(t)
      return t
    },
    /** move the origin: the second clone commits a file on main and pushes; returns the new tip */
    moveOrigin: (file = `m${Date.now()}.txt`) => {
      git(other, "pull", "-q", "--ff-only", "origin", "main")
      writeFileSync(path.join(other, file), `${file}\n`)
      git(other, "add", "-A")
      git(other, "commit", "-q", "-m", `move ${file}`)
      git(other, "push", "-q", "origin", "main")
      return git(other, "rev-parse", "HEAD")
    },
    originTip: () => git(bare, "rev-parse", "refs/heads/main"),
    /** a candidate branch: the origin tip plus one commit of its own (the integration of the task branch) */
    candidate: (name, { merge } = {}) => {
      git(proj, "fetch", "-q", "origin")
      const cur = git(proj, "rev-parse", "--abbrev-ref", "HEAD")
      git(proj, "switch", "-q", "-C", name, "origin/main")
      if (merge) git(proj, "merge", "-q", "--no-edit", merge)
      else {
        writeFileSync(path.join(proj, `${name.replace(/\W/g, "_")}.txt`), name)
        git(proj, "add", "-A")
        git(proj, "commit", "-q", "-m", `candidate ${name}`)
      }
      git(proj, "switch", "-q", cur)
      return git(proj, "rev-parse", name)
    },
    /** land a branch in main of the project and push: what the reviewer does after merge (fast-forward to the origin first) */
    land: (branch) => {
      git(proj, "fetch", "-q", "origin")
      git(proj, "switch", "-q", "main")
      git(proj, "merge", "-q", "--ff-only", "origin/main")
      git(proj, "merge", "-q", "--no-edit", "--no-ff", branch)
      git(proj, "push", "-q", "origin", "main")
      return git(proj, "rev-parse", "HEAD")
    },
    /** git processes of the machine whose command line contains the needle (the name condition keeps the probe itself out of the list) */
    gitProcs: (needle) => {
      let lines = []
      if (process.platform === "win32") {
        const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name LIKE 'git%'\" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"], { encoding: "utf8", windowsHide: true })
        const t = (r.stdout ?? "").trim()
        if (t) lines = (Array.isArray(JSON.parse(t)) ? JSON.parse(t) : [JSON.parse(t)]).map((p) => `${p.ProcessId} ${p.Name} ${p.CommandLine ?? ""}`)
      } else {
        lines = (spawnSync("ps", ["-eo", "pid,comm,args"], { encoding: "utf8" }).stdout ?? "").split(String.fromCharCode(10)).filter((l) => /^\s*\d+\s+git/.test(l))
      }
      return lines.filter((l) => l.includes(needle))
    },
    history: (n) => H.task(n).history.map((h) => h.note ?? "").filter(Boolean),
    lockFile: () => path.join(core.ROLES, "proj_merge.json"),
    holder: () => review.mergeHolder("proj"),
    letters: (to) =>
      ["inbox", "read"].flatMap((d) => {
        try {
          const dir = path.join(core.BASE, d, to)
          return readdirSync(dir).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
        } catch {
          return []
        }
      }),
    /** db: mark the turn of a session as cut off `agoMs` ago (time_suspended), without an idle after it */
    suspend: (sid, agoMs = 5_000) => db?.prepare("update session_v2 set time_suspended = ?, time_idle = null where id = ?").run(Date.now() - agoMs, sid),
    close: () => {
      clearInterval(heart)
      stop?.()
      try {
        db?.close()
      } catch {}
      if (!attach) rmSync(tmp, { recursive: true, force: true })
    },
  }
  return H
}

/** the cell reporter shared by the landing tests */
export function reporter(name) {
  let fail = 0
  return {
    cell: (title, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${title}${ok ? "" : " :: " + detail}`)
      if (!ok) fail++
    },
    done: (H) => {
      H?.close()
      console.log(fail ? `${name}: FAIL ${fail}` : `${name} ok`)
      process.exit(fail ? 1 : 0)
    },
  }
}
