// Self-test of moving the mailbox nova-peers -> opencode-peers (node >= 24):  node test/peers-paths.test.mjs
// The first process of the new code renames the old folder and leaves a junction nova-peers -> opencode-peers, so
// processes of the old code land in the same folder. A new install gets opencode-peers only; a repeat changes nothing.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-paths-"))
const root = path.join(tmp, "opencode")
mkdirSync(path.join(root, "nova-peers", "tasks", "nova"), { recursive: true })
writeFileSync(path.join(root, "nova-peers", "tasks", "nova", "1.json"), "{\"n\":1}")
process.env.XDG_DATA_HOME = tmp
const { BASE, peersBase } = await import("../paths.ts")

cell("the mailbox is opencode-peers", BASE === path.join(root, "opencode-peers"), BASE)
cell("the old data moved with it", existsSync(path.join(root, "opencode-peers", "tasks", "nova", "1.json")), "missing")
const old = path.join(root, "nova-peers")
cell("nova-peers is left as a link to the new folder", lstatSync(old).isSymbolicLink() && realpathSync(old) === realpathSync(path.join(root, "opencode-peers")), String(lstatSync(old).isSymbolicLink()))
cell("old code reading the old path sees the same data", readFileSync(path.join(old, "tasks", "nova", "1.json"), "utf8") === "{\"n\":1}", "differs")
cell("a repeat changes nothing", peersBase(root) === BASE && lstatSync(old).isSymbolicLink(), "changed")
const fresh = path.join(tmp, "fresh")
mkdirSync(fresh)
cell("a new install: opencode-peers, no nova-peers", peersBase(fresh) === path.join(fresh, "opencode-peers") && !existsSync(path.join(fresh, "nova-peers")), "nova-peers made")

// the old folder is held (Windows: open files inside it; windows and MCP processes keep them): the new name becomes a
// link to it, the data stays where it is
{
  const { openSync, closeSync } = await import("node:fs")
  const held = path.join(tmp, "held")
  mkdirSync(path.join(held, "nova-peers"), { recursive: true })
  writeFileSync(path.join(held, "nova-peers", "x.json"), "{}")
  const fd = openSync(path.join(held, "nova-peers", "x.json"), "r")
  const base = peersBase(held)
  closeSync(fd)
  const neu = path.join(held, "opencode-peers")
  if (lstatSync(path.join(held, "nova-peers")).isSymbolicLink()) console.log("ok   (the held folder was renamed anyway on this platform)")
  else cell("a held old folder: opencode-peers is a link to it", base === neu && lstatSync(neu).isSymbolicLink() && readFileSync(path.join(neu, "x.json"), "utf8") === "{}", JSON.stringify({ base, link: existsSync(neu) && lstatSync(neu).isSymbolicLink() }))
  cell("next start: opencode-peers", peersBase(held) === neu, peersBase(held))
}

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `peers-paths.test: FAIL ${fail}` : "peers-paths.test ok")
process.exit(fail ? 1 : 0)
