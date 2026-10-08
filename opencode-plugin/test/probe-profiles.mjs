// Probe of the window file on a THROWAWAY OpenCode server (task 003; not a test, not in npm test):
//   node test/probe-profiles.mjs <AC-08|AC-09|AC-10|AC-11|AC-14|AC-25|AC-40|all>
// Every run starts its own server on a free port of 127.0.0.1 with its own XDG_* folders in the OS temp dir and a stub
// provider; it never touches the real settings or the live service. At the end only the processes started by the probe
// (the listener of its own port and its own shell) are stopped, by the numbers it saved; nothing is stopped by name.
// Variables: CREW_HARNESS_OPENCODE (the executable, default `opencode` from PATH), CREW_HARNESS_PROVIDER_SRC (the root of the
// sources of the claude-code provider; without it the parts that call the provider functions are NOT VERIFIED).
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import http from "node:http"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const W = await import("../profile-windows.ts")
const OPENCODE = process.env.CREW_HARNESS_OPENCODE || "opencode"
const PROVIDER_SRC = process.env.CREW_HARNESS_PROVIDER_SRC
const wanted = process.argv[2] ?? "all"
const started = [] // numbers of the processes of this probe

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex")
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)) }); s.on("error", rej) })
function listenerPid(port) {
  const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" })
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().split(/\s+/)
    if (m[0] === "TCP" && m[1] === `127.0.0.1:${port}` && m[3] === "LISTENING") return Number(m[4])
  }
}
const results = []
const report = (name, status, detail) => {
  results.push({ name, status })
  console.log(`${status.padEnd(12)} ${name}${detail ? " :: " + detail : ""}`)
}
const pass = (name, ok, detail) => report(name, ok ? "PASS" : "FAIL", ok ? undefined : detail)

/** Own server: its own folders, a stub provider config merged into `config`; returns helpers and `stop`. */
async function startServer(prefix, config) {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), `probe-profiles-${prefix}-`)))
  const d = (n) => { const p = path.join(root, n); mkdirSync(p, { recursive: true }); return p }
  const env = { XDG_CONFIG_HOME: d("cfg"), XDG_DATA_HOME: d("data"), XDG_STATE_HOME: d("state"), XDG_CACHE_HOME: d("cache"), USERPROFILE: d("home"), HOME: d("home") }
  mkdirSync(path.join(env.XDG_CONFIG_HOME, "opencode"), { recursive: true })
  writeFileSync(path.join(env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc"), JSON.stringify(config, null, 2))
  const port = await freePort()
  const child = spawn(OPENCODE, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], { shell: true, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  started.push(child.pid)
  let log = ""
  child.stdout.on("data", (b) => (log += b))
  child.stderr.on("data", (b) => (log += b))
  const pw = () => /server password (\S+)/.exec(log)?.[1]
  for (let i = 0; i < 160 && !pw(); i++) await wait(250)
  const base = `http://127.0.0.1:${port}`
  const api = async (p, init = {}) => {
    const r = await fetch(base + p, { ...init, headers: { authorization: "Basic " + Buffer.from("opencode:" + (pw() ?? "")).toString("base64"), "content-type": "application/json", ...(init.headers ?? {}) } })
    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch {}
    return { status: r.status, text, json }
  }
  const stop = () => {
    const lp = listenerPid(port)
    if (lp) started.push(lp)
    for (const p of [lp, child.pid].filter(Boolean)) try { process.kill(p) } catch {}
    try { rmSync(root, { recursive: true, force: true }) } catch {}
  }
  // the catalog of models for a folder: {context, input, output} of provider/model
  const limitOf = async (dir, providerID, modelID) => {
    const r = await api("/api/model?" + encodeURIComponent("location[directory]") + "=" + encodeURIComponent(dir))
    const m = r.json?.data?.find((x) => x.providerID === providerID && (x.modelID === modelID || x.id === modelID))
    return m?.limit
  }
  const until = async (cond, ms = 5000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (await cond()) return Date.now() - t0
      await wait(250)
    }
    return undefined
  }
  // the first answers may precede the load of the providers: wait until the catalog of the folder lists the model
  const ready = (dir, providerID = "stub", modelID = "m1") => until(async () => !!(await limitOf(dir, providerID, modelID)), 30000)
  return { root, port, env, api, stop, limitOf, until, ready, pids: () => ({ shell: child.pid, listener: listenerPid(port) }) }
}
const stubConfig = (extra = {}) => ({
  compaction: { reserved: 12345 },
  provider: {
    stub: { name: "stub", npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "x" }, models: { m1: { name: "m1", limit: { context: 100000, output: 8000 } }, mi: { name: "mi", limit: { context: 100000, input: 90000, output: 8000 } } } },
    ...extra,
  },
})
/** A git repository with a worktree OUTSIDE its root, as the plugin makes them. */
function makeRepo(root) {
  const proj = path.join(root, "proj")
  mkdirSync(proj, { recursive: true })
  git(proj, "init", "-q", "-b", "main")
  writeFileSync(path.join(proj, "a.txt"), "a\n")
  git(proj, "add", "-A")
  git(proj, "commit", "-q", "-m", "init")
  const wt = path.join(root, "wt", "task-1")
  git(proj, "worktree", "add", "-q", "-b", "task-1", wt)
  return { proj, wt }
}
const row = (label, v) => console.log(`    ${label.padEnd(34)} ${v ? `context ${v.context}${v.input !== undefined ? `, input ${v.input}` : ""}, output ${v.output}` : "(no model)"}`)

/** A stub of the model provider (OpenAI protocol, streaming). handler(body, index) -> {text?, toolCall?: {name, args}, tokens?}. */
function startStub(port, handler) {
  const requests = []
  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (b) => (raw += b))
    req.on("end", () => {
      let body
      try { body = JSON.parse(raw) } catch {}
      const index = requests.length
      requests.push({ url: req.url, body })
      if (!String(req.url).includes("chat/completions")) { res.writeHead(404); return res.end("{}") }
      const r = handler(body, index) ?? {}
      const tokens = r.tokens ?? 100
      const chunk = (delta, finish, usage) => `data: ${JSON.stringify({ id: "c" + index, object: "chat.completion.chunk", created: 1, model: body?.model ?? "m", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
      res.writeHead(200, { "content-type": "text/event-stream" })
      if (r.toolCall) {
        res.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_" + index, type: "function", function: { name: r.toolCall.name, arguments: JSON.stringify(r.toolCall.args) } }] }, null))
        res.write(chunk({}, "tool_calls", { prompt_tokens: tokens, completion_tokens: 5, total_tokens: tokens + 5 }))
      } else {
        res.write(chunk({ role: "assistant", content: r.text ?? "ok" }, null))
        res.write(chunk({}, "stop", { prompt_tokens: tokens, completion_tokens: 5, total_tokens: tokens + 5 }))
      }
      res.write("data: [DONE]\n\n")
      res.end()
    })
  })
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ requests, close: () => server.close() })))
}
const stubProvider = (port, models) => ({ stub: { name: "stub", npm: "@ai-sdk/openai-compatible", options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "x" }, models } })
const SUMMARY = "You MUST summarize the conversation"
const isSummary = (r) => JSON.stringify(r.body?.messages?.at(-1)?.content ?? "").includes(SUMMARY)
const toolResultOf = (body) => {
  const m = (body?.messages ?? []).filter((x) => x.role === "tool").at(-1)
  return typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "")
}

// ---------------------------------------------------------------------------------------------------------------------
const sections = {
  async "AC-08"() {
    console.log("== AC-08: the window file in the worktree changes the catalog of OpenCode and the provider's threshold, no restart")
    const s = await startServer("ac08", stubConfig())
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const { proj, wt } = makeRepo(s.root)
      await s.ready(proj)
      await s.ready(wt)
      const before = { wt: await s.limitOf(wt, "stub", "m1"), wtI: await s.limitOf(wt, "stub", "mi"), root: await s.limitOf(proj, "stub", "m1") }
      console.log("  before (catalog by folder):")
      row("worktree  m1", before.wt)
      row("worktree  mi (with input)", before.wtI)
      row("main folder m1", before.root)
      const content = W.windowFileContent(new Map([["stub/m1", { context: 55000, output: 7000 }], ["stub/mi", { context: 60000, input: 50000, output: 7000 }]]))
      W.ensureExclude(wt)
      const wrote = W.writeWindowFile(wt, content)
      const ms = await s.until(async () => (await s.limitOf(wt, "stub", "m1"))?.context === 55000)
      const after = { wt: await s.limitOf(wt, "stub", "m1"), wtI: await s.limitOf(wt, "stub", "mi"), root: await s.limitOf(proj, "stub", "m1") }
      console.log("  after (the file written into the worktree; server not restarted):")
      row("worktree  m1", after.wt)
      row("worktree  mi (with input)", after.wtI)
      row("main folder m1", after.root)
      pass("AC-08 (a) the catalog for the worktree gives context, input and output of the profile within 5 s", wrote === "written" && ms !== undefined && ms <= 5000 && after.wt.context === 55000 && after.wt.output === 7000 && after.wtI.input === 50000 && after.wtI.context === 60000 && after.wtI.output === 7000, JSON.stringify({ wrote, ms, after }))
      pass("AC-08 (c) the main folder is unchanged (no file there; the window of a reviewer is not claimed as a profile window)", after.root.context === before.root.context && !existsSync(path.join(proj, ".opencode", "opencode.json")), JSON.stringify(after.root))
      pass("AC-08 the file holds context and output together (OpenCode drops a record without output)", JSON.parse(readFileSync(W.windowPath(wt), "utf8")).provider.stub.models.m1.limit.output === 7000, "no output")
      // (b) the provider's function
      if (!PROVIDER_SRC) report("AC-08 (b) opencodeWindow() of the provider", "NOT VERIFIED", "CREW_HARNESS_PROVIDER_SRC is not set (the sources of the claude-code provider)")
      else {
        const mod = await import(pathToFileURL(path.join(PROVIDER_SRC, "src", "opencode-window.js")).href)
        const cfgFile = path.join(s.env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc")
        const cfg = JSON.parse(readFileSync(cfgFile, "utf8"))
        cfg.provider["claude-code"] = { models: { opus: { limit: { context: 720000, output: 64000 } } } }
        writeFileSync(cfgFile, JSON.stringify(cfg, null, 2))
        rmSync(W.windowPath(wt))
        let now = Date.now() + 20_000
        const b = mod.opencodeWindow(wt, "opus", { XDG_CONFIG_HOME: s.env.XDG_CONFIG_HOME }, now)
        W.writeWindowFile(wt, W.windowFileContent(new Map([["claude-code/opus", { context: 300000, output: 64000 }]])))
        now += 20_000
        const a = mod.opencodeWindow(wt, "opus", { XDG_CONFIG_HOME: s.env.XDG_CONFIG_HOME }, now)
        const r = mod.opencodeWindow(proj, "opus", { XDG_CONFIG_HOME: s.env.XDG_CONFIG_HOME }, now)
        console.log(`  opencodeWindow() before: ${JSON.stringify(b)}; after, worktree: ${JSON.stringify(a)}; main folder: ${JSON.stringify(r)}`)
        pass("AC-08 (b) opencodeWindow() of the provider gives the new threshold for the worktree and the old one for the main folder, no restart", b.threshold === 720000 - 12345 && a.threshold === 300000 - 12345 && r.threshold === 720000 - 12345, JSON.stringify({ b, a, r }))
      }
    } finally {
      s.stop()
    }
  },

  async "AC-09"() {
    console.log("== AC-09: a smaller window compacts the tab on its next turn; the threshold is input - reserved for a model with input")
    const sport = await freePort()
    let tokens = 60000
    const stub = await startStub(sport, () => ({ tokens }))
    const s = await startServer("ac09", { compaction: { reserved: 12345 }, provider: stubProvider(sport, { m1: { name: "m1", limit: { context: 200000, output: 8000 } }, mi: { name: "mi", limit: { context: 200000, input: 190000, output: 8000 } } }) })
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const { proj, wt } = makeRepo(s.root)
      await s.ready(proj)
      await s.ready(wt)
      W.ensureExclude(wt)
      W.writeWindowFile(wt, W.windowFileContent(new Map([["stub/m1", { context: 66000, output: 7000 }], ["stub/mi", { context: 200000, input: 66000, output: 7000 }]])))
      await s.until(async () => (await s.limitOf(wt, "stub", "m1"))?.context === 66000)
      // one session per row: the first turn reports `tokens` of usage, the second turn shows whether the tab is compacted first
      const row9 = async (label, dir, model, usage, expectCompaction) => {
        tokens = usage
        const ses = await s.api("/api/session", { method: "POST", body: JSON.stringify({ location: { directory: dir }, model: { providerID: "stub", id: model } }) })
        const sid = ses.json?.data?.id
        const turn = async (text) => {
          await s.api(`/api/session/${sid}/prompt`, { method: "POST", body: JSON.stringify({ text }) })
          await s.api(`/api/experimental/session/${sid}/wait`, { method: "POST" })
        }
        await turn("first")
        const n0 = stub.requests.filter(isSummary).length
        await turn("second")
        const compacted = stub.requests.filter(isSummary).length - n0 > 0
        const limit = await s.limitOf(dir, "stub", model)
        const threshold = (limit.input ?? limit.context) - 12345
        console.log(`    ${label.padEnd(30)} usage ${String(usage).padEnd(6)} window ${limit.context}${limit.input !== undefined ? `/input ${limit.input}` : ""}  threshold ${threshold}  compacted: ${compacted ? "yes" : "no"}`)
        pass(`AC-09 ${label}: ${expectCompaction ? "compacted on the next turn" : "not compacted"}`, compacted === expectCompaction, JSON.stringify({ usage, threshold, compacted }))
      }
      await row9("worktree, model without input", wt, "m1", 60000, true)
      await row9("main folder, same model", proj, "m1", 60000, false)
      await row9("worktree, model with input", wt, "mi", 60000, true)
      await row9("main folder, same model", proj, "mi", 60000, false)
      await row9("worktree, usage below threshold", wt, "m1", 40000, false)
    } finally {
      stub.close()
      s.stop()
    }
  },

  async "AC-14"() {
    console.log("== AC-14: a session on a model of another family reaches the crew_* tools of the plugin loaded in a throwaway server")
    const sport = await freePort()
    const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").split(path.sep).join("/")
    const script = [
      "return tools.crew_task({ action: \"review\", n: 999 })",
      "return tools.crew_send({ to: \"integrator\", text: \"probe letter\", wake: false })",
      "return search({ query: \"watch\" }).items.map((i) => i.path)",
      "return tools.crew_watch({})",
    ]
    const stub = await startStub(sport, (body, i) => {
      if (!body?.tools?.some((t) => t.function?.name === "execute")) return { text: "title" } // a helper request (title), not the agent
      const done = stub.requests.filter((r) => r.body?.tools?.some((t) => t.function?.name === "execute")).length - 1 // agent requests before this one
      return done < script.length ? { toolCall: { name: "execute", args: { code: script[done] } } } : { text: "done" }
    })
    const s = await startServer("ac14", { plugins: [pluginDir], provider: stubProvider(sport, { m1: { name: "m1", limit: { context: 200000, output: 8000 } } }) })
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const dir = path.join(s.root, "proj")
      mkdirSync(dir, { recursive: true })
      await s.ready(dir)
      await wait(3000)
      const ses = await s.api("/api/session", { method: "POST", body: JSON.stringify({ location: { directory: dir }, model: { providerID: "stub", id: "m1" } }) })
      const sid = ses.json?.data?.id
      await s.api(`/api/session/${sid}/prompt`, { method: "POST", body: JSON.stringify({ text: "use the crew tools" }) })
      await s.api(`/api/experimental/session/${sid}/wait`, { method: "POST" })
      const agent = stub.requests.filter((r) => r.body?.tools?.some((t) => t.function?.name === "execute"))
      const system = (agent[0]?.body?.messages ?? []).filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n")
      const names = ["crew_config", "crew_doctor", "crew_help", "crew_inbox", "crew_list", "crew_role", "crew_send", "crew_spawn", "crew_task", "crew_timer", "crew_wait", "crew_watch"]
      const inCatalog = names.filter((n) => system.includes(`tools.${n}(`))
      console.log(`  (a) the catalog of the request lists: ${inCatalog.join(", ")}; the rest is found by search: ${names.filter((n) => !inCatalog.includes(n)).join(", ") || "-"}`)
      pass("AC-14 (a) the request of the other family carries the crew_* tools in the catalog (the rest through search)", inCatalog.length >= 11, JSON.stringify(inCatalog))
      const results = agent.slice(1).map((r) => toolResultOf(r.body))
      results.forEach((t, i) => console.log(`  call ${i + 1}: ${script[i]}\n    -> ${t.replace(/\s+/g, " ").slice(0, 200)}`))
      const bad = (t) => !t || /is not a function|ReferenceError|TypeError|not defined/i.test(t)
      pass("AC-14 (b) crew_task review and crew_send run from such a session (the plugin answers in words)", results.length >= 2 && !bad(results[0]) && !bad(results[1]), JSON.stringify(results.slice(0, 2)))
      pass("AC-14 (c) search «watch» returns the path of crew_watch", results.length >= 3 && /crew_watch/.test(results[2]), String(results[2]))
      pass("AC-14 (c) crew_watch without a command (the list of watches) runs", results.length >= 4 && !bad(results[3]) && /аблюден/.test(results[3]), String(results[3]))
    } finally {
      stub.close()
      s.stop()
    }
  },

  async "AC-10"() {
    console.log("== AC-10: removing the file brings the value back")
    const s = await startServer("ac10", stubConfig())
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const { wt } = makeRepo(s.root)
      await s.ready(wt)
      const v0 = await s.limitOf(wt, "stub", "m1")
      W.writeWindowFile(wt, W.windowFileContent(new Map([["stub/m1", { context: 55000, output: 7000 }]])))
      await s.until(async () => (await s.limitOf(wt, "stub", "m1"))?.context === 55000)
      const v1 = await s.limitOf(wt, "stub", "m1")
      const removed = W.removeWindowFile(wt)
      const ms = await s.until(async () => (await s.limitOf(wt, "stub", "m1"))?.context === v0.context)
      const v2 = await s.limitOf(wt, "stub", "m1")
      row("before the file", v0)
      row("with the file", v1)
      row("after removal of the file", v2)
      pass("AC-10 the file removed: the window of the model returns to the hand-written value within 5 s", removed && v1.context === 55000 && ms !== undefined && v2.context === v0.context && v2.output === v0.output, JSON.stringify({ v0, v1, v2, ms }))
    } finally {
      s.stop()
    }
  },

  async "AC-11"() {
    console.log("== AC-11: hand-written files are untouched; git sees nothing; an unmarked file is not overwritten")
    const s = await startServer("ac11", stubConfig())
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const { proj, wt } = makeRepo(s.root)
      const rootJsonc = path.join(proj, ".opencode", "opencode.jsonc")
      mkdirSync(path.dirname(rootJsonc), { recursive: true })
      writeFileSync(rootJsonc, '{ "provider": { "stub": { "models": { "m1": { "limit": { "context": 90000, "output": 8000 } } } } } }\n')
      const globalCfg = path.join(s.env.XDG_CONFIG_HOME, "opencode", "opencode.jsonc")
      const h0 = [sha(rootJsonc), sha(globalCfg)].join()
      await s.ready(wt)
      W.ensureExclude(wt)
      W.writeWindowFile(wt, W.windowFileContent(new Map([["stub/m1", { context: 55000, output: 7000 }]])))
      await s.until(async () => (await s.limitOf(wt, "stub", "m1"))?.context === 55000)
      const status = git(wt, "status", "--porcelain")
      pass("AC-11 the hand-written files are byte for byte the same; the main folder has no file; git status of the worktree is clean", [sha(rootJsonc), sha(globalCfg)].join() === h0 && !existsSync(path.join(proj, ".opencode", "opencode.json")) && status === "", JSON.stringify({ status }))
      // an unmarked file in a second worktree
      const wt2 = path.join(s.root, "wt", "task-2")
      git(proj, "worktree", "add", "-q", "-b", "task-2", wt2)
      mkdirSync(path.join(wt2, ".opencode"), { recursive: true })
      const foreign = JSON.stringify({ provider: { stub: { models: { m1: { limit: { context: 77000, output: 1 } } } } } })
      writeFileSync(W.windowPath(wt2), foreign)
      const r = W.writeWindowFile(wt2, W.windowFileContent(new Map([["stub/m1", { context: 55000, output: 7000 }]])))
      pass("AC-11 a file without the mark is not overwritten (the plugin reports it)", r === "foreign" && readFileSync(W.windowPath(wt2), "utf8") === foreign, r)
      const tracked = git(proj, "ls-files", "--", ".opencode/opencode.json")
      pass("AC-11 no tracked file was changed in the repository", tracked === "" && git(proj, "status", "--porcelain").replace(/\?\? \.opencode\/\n?/, "") === "", git(proj, "status", "--porcelain"))
    } finally {
      s.stop()
    }
  },

  async "AC-25"() {
    console.log("== AC-25: an explicit autoCompactWindow of the provider stays; opencodeWindow() and explicitSettingsFor() on throwaway files")
    if (!PROVIDER_SRC) return report("AC-25 opencodeWindow() / explicitSettingsFor()", "NOT VERIFIED", "CREW_HARNESS_PROVIDER_SRC is not set (the sources of the claude-code provider)")
    const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "probe-profiles-ac25-")))
    try {
      const win = await import(pathToFileURL(path.join(PROVIDER_SRC, "src", "opencode-window.js")).href)
      const set = await import(pathToFileURL(path.join(PROVIDER_SRC, "src", "settings.js")).href)
      const cfgDir = path.join(root, "xdg", "opencode")
      mkdirSync(cfgDir, { recursive: true })
      writeFileSync(path.join(cfgDir, "opencode.jsonc"), JSON.stringify({ compaction: { reserved: 20000 }, provider: { "claude-code": { models: { opus: { limit: { context: 720000, output: 64000 } } } } } }))
      const { proj, wt } = makeRepo(root)
      void proj
      W.writeWindowFile(wt, W.windowFileContent(new Map([["claude-code/opus", { context: 300000, output: 64000 }]])))
      const projFile = path.join(wt, ".opencode", "opencode-claude-code-provider.json")
      writeFileSync(projFile, JSON.stringify({ autoCompactWindow: { opus: 500000 } }))
      const h = sha(projFile)
      const env = { XDG_CONFIG_HOME: path.join(root, "xdg") }
      const w = win.opencodeWindow(wt, "opus", env, Date.now() + 30_000)
      const ex = set.explicitSettingsFor({}, wt)
      const plugin = W.explicitCompact(wt, "opus")
      console.log(`  opencodeWindow(): ${JSON.stringify(w)}; explicitSettingsFor(): ${JSON.stringify(ex.autoCompactWindow)}; plugin explicitCompact(): ${JSON.stringify(plugin && { value: plugin.value })}`)
      pass("AC-25 the provider takes the explicit value first (explicitSettingsFor), the window threshold of OpenCode is the second", ex.autoCompactWindow?.opus === 500000 && w.threshold === 300000 - 20000, JSON.stringify({ ex: ex.autoCompactWindow, w }))
      pass("AC-25 the plugin reads the same explicit value (named in use / check / crew_doctor) and does not touch the file", plugin?.value === 500000 && sha(projFile) === h, JSON.stringify(plugin))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },

  async "AC-40"() {
    console.log("== AC-40: hand-written windows win over the file of the plugin; the catalog shows it for both folders")
    const s = await startServer("ac40", stubConfig())
    try {
      console.log("  processes of this probe:", JSON.stringify(s.pids()))
      const { proj, wt } = makeRepo(s.root)
      // (a) a TRACKED hand-written .opencode/opencode.jsonc inside the worktree: commit it in the repository, then a new worktree carries it
      const rootJsonc = path.join(proj, ".opencode", "opencode.jsonc")
      mkdirSync(path.dirname(rootJsonc), { recursive: true })
      writeFileSync(rootJsonc, '{ "provider": { "stub": { "models": { "m1": { "limit": { "context": 90000, "output": 8000 } } } } } }\n')
      git(proj, "add", "--", ".opencode/opencode.jsonc")
      git(proj, "commit", "-q", "-m", "hand-written window")
      const wtB = path.join(s.root, "wt", "task-b")
      git(proj, "worktree", "add", "-q", "-b", "task-b", wtB)
      await s.ready(wtB)
      W.ensureExclude(wtB)
      W.writeWindowFile(wtB, W.windowFileContent(new Map([["stub/m1", { context: 55000, output: 7000 }]])))
      await s.ready(proj)
      await wait(2500)
      const inWt = await s.limitOf(wtB, "stub", "m1")
      const inMain = await s.limitOf(proj, "stub", "m1")
      row("worktree with the tracked hand-written file", inWt)
      row("main folder (hand-written file there)", inMain)
      const predicted = W.chainWindow(wtB, "stub/m1")
      const over = W.handWrittenOverrides(wtB, "stub/m1", { context: 55000, output: 7000 }).filter((o) => o.stronger)
      pass("AC-40 (a) in the worktree the hand-written window (90000) wins over the file of the plugin (55000); the plugin names the file and the value", inWt.context === 90000 && over.find((o) => o.field === "context")?.value === 90000 && over.every((o) => /opencode\.jsonc$/.test(o.file)) && predicted.context.value === 90000, JSON.stringify({ inWt, over: over.map((o) => [o.field, o.value]) }))
      pass("AC-40 (b) in the main folder the hand-written window is what the tabs and the reviewers take (set does not change it)", inMain.context === 90000 && W.chainWindow(proj, "stub/m1", { skipOurs: true }).context.value === 90000, JSON.stringify(inMain))
      void wt
    } finally {
      s.stop()
    }
  },
}

// ---------------------------------------------------------------------------------------------------------------------
const order = ["AC-08", "AC-09", "AC-10", "AC-11", "AC-14", "AC-25", "AC-40"]
const todo = wanted === "all" ? order : [wanted]
for (const name of todo) {
  if (!sections[name]) {
    report(name, "NOT VERIFIED", "section is not implemented in this probe")
    continue
  }
  try {
    await sections[name]()
  } catch (e) {
    report(name, "FAIL", String(e?.stack ?? e).split("\n").slice(0, 4).join(" | "))
  }
}
console.log(`processes started by the probe and stopped by number: ${JSON.stringify([...new Set(started)])}`)
const bad = results.filter((r) => r.status === "FAIL").length
console.log(bad ? `probe-profiles: FAIL ${bad}` : `probe-profiles ${wanted}: ${results.filter((r) => r.status === "PASS").length} PASS, ${results.filter((r) => r.status === "NOT VERIFIED").length} NOT VERIFIED`)
process.exit(bad ? 1 : 0)
