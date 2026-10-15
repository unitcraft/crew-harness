// Self-test of the plugin border with research code (node >= 24):  node test/crew-no-research.test.mjs
// Task 046 (owner, 2026-10-15): the unfinished transport of letters between machines (ntfy, GitHub, tailnet, the
// bridge) lives in doc/research/remote-transport/ and is not part of the plugin. The plugin imports nothing from
// doc/research, every relative import of its sources stays inside opencode-plugin/, no source creates the bridge or
// routes a letter to another machine, the prototype files are gone from the plugin folder, and every test of the
// npm test chain exists in test/. Static: the sources are read as text, nothing is imported.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const sources = readdirSync(plugin).filter((f) => /\.tsx?$/.test(f))
const SPEC = /(?:^|[\s;])(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm
const specs = []
for (const f of sources) {
  const text = readFileSync(path.join(plugin, f), "utf8")
  for (const m of text.matchAll(SPEC)) specs.push({ file: f, spec: m[1] ?? m[2] ?? m[3] })
}

cell("the plugin sources are found and have imports", sources.includes("index.ts") && sources.includes("core.ts") && specs.length > 20, `${sources.length} files, ${specs.length} imports`)
const research = specs.filter((s) => /doc[\\/]+research|remote-transport/.test(s.spec))
cell("no source imports from doc/research", research.length === 0, research.map((s) => `${s.file}: ${s.spec}`).join("; "))
const outside = specs.filter((s) => s.spec.startsWith(".")).filter((s) => {
  const target = path.resolve(plugin, s.spec)
  return path.relative(plugin, target).startsWith("..") || !existsSync(target)
})
cell("every relative import stays inside opencode-plugin/ and exists", outside.length === 0, outside.map((s) => `${s.file}: ${s.spec}`).join("; "))

const PROTOTYPE = ["remote.ts", "ntfy.ts", "tailnet.ts", "github.ts"]
const leftFiles = PROTOTYPE.filter((f) => existsSync(path.join(plugin, f)))
cell("the prototype files are not in the plugin folder", leftFiles.length === 0, leftFiles.join(", "))
const protoImports = specs.filter((s) => PROTOTYPE.some((p) => s.spec === `./${p}`))
cell("no source imports a prototype module", protoImports.length === 0, protoImports.map((s) => `${s.file}: ${s.spec}`).join("; "))

const BRIDGE = /\b(createRemoteBridge|remoteBridge|queueRemote|remoteRoute|loadRemote|REMOTE_FILE)\b/
const bridged = sources.filter((f) => BRIDGE.test(readFileSync(path.join(plugin, f), "utf8")))
cell("no source creates the bridge or routes a letter to another machine", bridged.length === 0, bridged.join(", "))

const script = JSON.parse(readFileSync(path.join(plugin, "package.json"), "utf8")).scripts?.test ?? ""
const chain = [...script.matchAll(/node (test\/[^\s&]+)/g)].map((m) => m[1])
const missing = chain.filter((t) => !existsSync(path.join(plugin, t)))
cell("every file of the npm test chain exists", chain.length > 10 && missing.length === 0, missing.join(", ") || `${chain.length} entries`)
const protoTests = chain.filter((t) => /crew-(ntfy|github|tailnet|remote)\.test|latency/.test(t))
cell("the prototype tests are out of npm test", protoTests.length === 0, protoTests.join(", "))
cell("this test is in the npm test chain", chain.includes("test/crew-no-research.test.mjs"), "missing")

console.log(fail ? `crew-no-research.test: FAIL ${fail}` : "crew-no-research.test ok")
process.exit(fail ? 1 : 0)
