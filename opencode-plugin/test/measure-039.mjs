// Measurement for task 039 (not a test): characters of the system block and of the tool descriptions + schemas.  node test/measure-039.mjs
import { harness } from "./landing-harness.mjs"
const H = await harness("measure-039")
const ev = { sessionID: "sesINTEG1", system: [] }
await H.hooks.context(ev)
const sys = ev.system.map((x) => x.text).join("\n")
console.log("system block chars:", sys.length)
let d = 0, s = 0
for (const [name, t] of Object.entries(H.tools)) {
  if (!name.startsWith("crew_")) continue
  const dl = t.description.length, sl = JSON.stringify(t.input).length
  d += dl; s += sl
  console.log(name.padEnd(14), "desc", dl, "schema", sl)
}
console.log("tools desc total:", d, "schema total:", s, "sum:", d + s)
H.close()
process.exit(0)
