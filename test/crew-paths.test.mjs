// Self-test of the mailbox name (plan 014; node >= 24):  node test/crew-paths.test.mjs
// The mailbox is <OpenCode data>/harness-crew. An earlier mailbox (opencode-peers, nova-peers; either may itself be a
// link) stays where it is: harness-crew becomes a junction to its real folder, so old and new code share the files.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-paths-"))
const real = (p) => realpathSync(p).toLowerCase()

// the live case: nova-peers is the real folder, opencode-peers a junction to it (plan 008)
const root = path.join(tmp, "opencode")
mkdirSync(path.join(root, "nova-peers", "tasks", "nova"), { recursive: true })
writeFileSync(path.join(root, "nova-peers", "tasks", "nova", "1.json"), '{"n":1}')
symlinkSync(path.join(root, "nova-peers"), path.join(root, "opencode-peers"), "junction")
process.env.XDG_DATA_HOME = tmp
const { BASE, crewBase } = await import("../paths.ts")
const neu = path.join(root, "harness-crew")
cell("the mailbox is harness-crew", BASE === neu, BASE)
cell("it is a link to the real old folder (not a link to a link)", lstatSync(neu).isSymbolicLink() && real(neu) === real(path.join(root, "nova-peers")), `${lstatSync(neu).isSymbolicLink()} ${real(neu)}`)
cell("the old data is seen through the new name", readFileSync(path.join(neu, "tasks", "nova", "1.json"), "utf8") === '{"n":1}', "differs")
cell("the old names stay where they were", lstatSync(path.join(root, "nova-peers")).isDirectory() && lstatSync(path.join(root, "opencode-peers")).isSymbolicLink(), "moved")
cell("a repeat changes nothing", crewBase(root) === neu, crewBase(root))

// only a real opencode-peers folder
const r2 = path.join(tmp, "r2")
mkdirSync(path.join(r2, "opencode-peers"), { recursive: true })
writeFileSync(path.join(r2, "opencode-peers", "x.json"), "{}")
const b2 = crewBase(r2)
cell("a real opencode-peers folder: harness-crew links to it", b2 === path.join(r2, "harness-crew") && existsSync(path.join(b2, "x.json")), b2)

// a new install
const fresh = path.join(tmp, "fresh")
mkdirSync(fresh)
cell("a new install: harness-crew, no old names", crewBase(fresh) === path.join(fresh, "harness-crew") && !existsSync(path.join(fresh, "opencode-peers")) && !existsSync(path.join(fresh, "nova-peers")), "old name made")

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {}
console.log(fail ? `crew-paths.test: FAIL ${fail}` : "crew-paths.test ok")
process.exit(fail ? 1 : 0)
