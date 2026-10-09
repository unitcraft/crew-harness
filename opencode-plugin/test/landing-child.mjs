// Child process of the landing race tests (task 005): the same plugin modules on the same folders as the parent test, a second
// plugin instance in its own process. Not a test itself (no `.test.` in the name).
//   node test/landing-child.mjs <harness folder> <sync folder> <k> <session> <tabs json> <crew_task input json>
// It starts the plugin, writes <sync>/ready-<k>, waits for <sync>/go (all children start the call at the same moment), calls
// crew_task as <session> and prints one line `RESULT <json string>`.
import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"
import { harness } from "./landing-harness.mjs"

const [tmp, sync, k, sid, tabsJson, inputJson] = process.argv.slice(2)
const H = await harness("child", { attach: tmp, tabs: JSON.parse(tabsJson), only: sid })
writeFileSync(path.join(sync, `ready-${k}`), "1")
while (!existsSync(path.join(sync, "go"))) await new Promise((r) => setTimeout(r, 2))
let out
try {
  out = await H.call("crew_task", sid, JSON.parse(inputJson))
} catch (e) {
  out = `ERROR ${e?.stack ?? e}`
}
console.log(`RESULT ${JSON.stringify(out)}`)
H.close()
process.exit(0)
