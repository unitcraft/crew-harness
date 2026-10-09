// A child process of the question-answering tests (task 007): another process (the MCP process of a tab) runs the same decision
// over the same files at the same time as the parent.   node test/answer-child.mjs <tmp folder> <session> <now> [<start at ms>]
// It sets the data folders of the parent, loads the plugin code (CREW_PLUGIN_DIR or the folder above), waits for the start moment
// (so that both processes meet), runs answerTurn on the end of the turn of the session and prints the result as one JSON line.
import path from "node:path"
import { pathToFileURL } from "node:url"

const [tmp, session, nowArg, startArg] = process.argv.slice(2)
process.env.XDG_DATA_HOME = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "opencode.db")
process.env.CREW_HARNESS_SETTINGS_TTL_MS = "1"
delete process.env.CREW_HARNESS_PRESENCE
const plugin = process.env.CREW_PLUGIN_DIR ? path.resolve(process.env.CREW_PLUGIN_DIR) : path.join(import.meta.dirname, "..")
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href)
const core = await load("core.ts")
const A = await load("answer.ts")
const card = core.readJson(core.cardFile(session))
const end = await core.turnEnd(session)
if (startArg) while (Date.now() < Number(startArg)) await new Promise((r) => setTimeout(r, 1))
const res = await A.answerTurn({ card, key: "proj.worker", end, cfg: core.loadConfig(card.directory), now: Number(nowArg), channel: "status", deps: { ownerWordAfter: core.ownerWordAfter, lastUserAt: core.lastUserAt } })
console.log(JSON.stringify(res))
process.exit(0)
