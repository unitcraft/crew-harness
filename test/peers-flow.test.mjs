// Self-test of the turn economy and the integrator's tasks (node >= 24):  node test/peers-flow.test.mjs
// - an ack-only letter ("спасибо") is not sent: it would wake the recipient for nothing;
// - a question (expect_reply) gives a qid; the asker waits with peer_wait in the same turn and gets the answer there,
//   the answer is NOT delivered as a separate wake;
// - a question is an obligation: the recipient stopped without answering -> a reminder letter, after NUDGE_MAX the
//   asker is told the tab is stuck;
// - the exclusive role is held by a lock: refused while the holder's tab is open, free at once when it closes;
// - peer_spawn: integrator only, model by tier, limit per role; the task session gets the task without a window,
//   its report (reply_to the task qid) closes it: a final line in its history (resume: false), a notice to the
//   integrator's window, no more letters;
// - peer_doctor reports a tab no window shows.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "peers-flow-"))
process.env.XDG_DATA_HOME = tmp
process.env.NOVA_PEERS_POLL_MS = "100"
process.env.NOVA_PEERS_DB = path.join(tmp, "absent.db")
delete process.env.NOVA_PEERS_PRESENCE
const proj = path.join(tmp, "proj")
mkdirSync(path.join(proj, ".opencode"), { recursive: true })
writeFileSync(path.join(proj, ".opencode", "opencode-peers.json"), JSON.stringify({ spawn_limits: { worker: 1 }, spawn_models: { light: "kimi/k3" } }))

const mod = await import(process.env.PEERS_MODULE ?? "../index.ts")
const core = await import(process.env.PEERS_CORE ?? "../core.ts")
const hooks = {}
const tools = {}
const events = {}
const delivered = []
const created = []
const updates = []
let nextId = 1
const ctx = {
  location: { directory: proj },
  session: {
    get: async ({ sessionID }) => ({ id: sessionID, title: sessionID, location: { directory: proj }, time: {} }),
    prompt: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume }),
    synthetic: async ({ sessionID, text, resume }) => delivered.push({ sessionID, text, resume, synthetic: true }),
    create: async (req) => {
      created.push(req)
      return { id: `sesTASK0${nextId++}` }
    },
    update: async (req) => updates.push(req),
    hook: async (name, cb) => (hooks[name] = cb),
  },
  tool: { transform: async (fn) => fn({ add: (t) => (tools[t.name] = t) }) },
  events: { on: async (name, cb) => (events[name] = cb) },
}
const stop = await mod.default.setup(ctx)
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const got = (s, t) => delivered.filter((d) => d.sessionID === s && d.text.includes(t))
const call = async (name, sid, input = {}) => (await tools[name].execute(input, { sessionID: sid })).content
const turnEnds = async (sid) => {
  await hooks.context({ sessionID: sid, system: [], model: { id: "x", providerID: "y" } })
  await events["session.idle"]({ properties: { sessionID: sid } })
}

// one live window with three tabs
const WPID = 515151
const tabs = ["sesASKER1", "sesANSWR1", "sesOTHER1"].map((sessionID, i) => ({ sessionID, active: i === 0, busy: false }))
mkdirSync(core.WINDOWS, { recursive: true })
const beat = () => writeFileSync(path.join(core.WINDOWS, `${WPID}.json`), JSON.stringify({ pid: WPID, beat: Date.now(), tabs }))
beat()
const heart = setInterval(beat, 300)
for (const t of tabs) await turnEnds(t.sessionID)

// 1. ack suppression
const ack = await call("peer_send", "sesASKER1", { to: "sesANSWR1", text: "Спасибо!" })
cell("an ack-only letter is not sent", /Не отправлено/.test(ack), ack)
await wait()
cell("nothing reached the recipient", got("sesANSWR1", "Спасибо").length === 0, JSON.stringify(delivered))

// 2. question and answer in the same turn
const asked = await call("peer_send", "sesASKER1", { to: "sesANSWR1", text: "сколько тестов?", expect_reply: true })
const qid = asked.match(/qid: "([^"]+)"/)?.[1]
cell("a question gives a qid", !!qid, asked)
await wait()
const q = got("sesANSWR1", "сколько тестов?")
cell("the recipient gets the question with the qid and how to answer", q.length === 1 && q[0].text.includes(`reply_to: "${qid}"`), JSON.stringify(q))
cell("the question is an obligation of the recipient", core.obligationsOf("sesANSWR1").some((o) => o.qid === qid), JSON.stringify(core.obligationsOf("sesANSWR1")))
const waiting = call("peer_wait", "sesASKER1", { qid, seconds: 10 })
await wait(300)
await call("peer_send", "sesANSWR1", { to: "sesASKER1", text: "тестов 42", reply_to: qid })
const answer = await waiting
cell("peer_wait returns the answer", /тестов 42/.test(answer), answer)
await wait()
cell("the answer is not delivered again as a wake", got("sesASKER1", "тестов 42").length === 0, JSON.stringify(got("sesASKER1", "тестов 42")))
cell("the answer settles the obligation", !core.obligationsOf("sesANSWR1").some((o) => o.qid === qid), JSON.stringify(core.obligationsOf("sesANSWR1")))

// 3. reminders: the recipient stops without answering
const asked2 = await call("peer_send", "sesASKER1", { to: "sesANSWR1", text: "проверь сборку", expect_reply: true })
const qid2 = asked2.match(/qid: "([^"]+)"/)?.[1]
await wait()
for (let i = 1; i <= core.NUDGE_MAX; i++) {
  await turnEnds("sesANSWR1")
  await wait()
}
const nudges = delivered.filter((d) => d.sessionID === "sesANSWR1" && d.text.includes("Задача не завершена") && d.text.includes(qid2))
cell(`the silent recipient got ${core.NUDGE_MAX} reminders`, nudges.length === core.NUDGE_MAX, nudges.length)
await turnEnds("sesANSWR1")
await wait()
cell("no reminder beyond the limit", delivered.filter((d) => d.sessionID === "sesANSWR1" && d.text.includes("Задача не завершена") && d.text.includes(qid2)).length === core.NUDGE_MAX, "more")
cell("the asker is told the tab is stuck", got("sesASKER1", "останавливалась").length === 1, JSON.stringify(delivered.filter((d) => d.sessionID === "sesASKER1")))

// 4. the exclusive role lock
const take = await call("peer_role", "sesASKER1", { role: "integrator" })
cell("the first tab takes integrator", /теперь «integrator»/.test(take), take)
const refused = await call("peer_role", "sesOTHER1", { role: "integrator" })
cell("another tab is refused while the holder is open", /занята открытой вкладкой/.test(refused), refused)
const noSpawn = await call("peer_spawn", "sesOTHER1", { task: "x" })
cell("a worker may not spawn", /только интегратор/.test(noSpawn), noSpawn)

// 5. spawn
const sp = await call("peer_spawn", "sesASKER1", { task: "почини тест X\nподробности", tier: "light" })
const tqid = sp.match(/peer_wait \{qid: "([^"]+)"/)?.[1]
cell("the integrator spawns a task session", /Запущено/.test(sp) && /sesTASK01/.test(sp) && !!tqid, sp)
cell("the model comes from the project's spawn_models", created[0]?.model?.providerID === "kimi" && created[0]?.model?.id === "k3", JSON.stringify(created[0]))
cell("the title is the first line of the task", created[0]?.title === "почини тест X", JSON.stringify(created[0]))
await wait()
const task = got("sesTASK01", "почини тест X")
cell("the task session gets the task without any window", task.length === 1 && task[0].text.includes(tqid), JSON.stringify(task))
const limit = await call("peer_spawn", "sesASKER1", { task: "вторая задача" })
cell("the project's limit per role holds", /Лимит задач роли worker/.test(limit), limit)
const list = await call("peer_list", "sesASKER1")
cell("peer_list shows the running task", /sesTASK01/.test(list) &&/под задачу \(работает\)/.test(list), list)
await hooks.context({ sessionID: "sesTASK01", system: [], model: { id: "x", providerID: "y" } }) // its turn is running
await call("peer_send", "sesTASK01", { to: "sesASKER1", text: "готово: тест X зелёный", reply_to: tqid })
await wait(600)
cell("no final line while the task session's turn is running", got("sesTASK01", "Задача выполнена").length === 0, "written mid-turn")
const dup = await call("peer_send", "sesTASK01", { to: "sesASKER1", text: "готово ещё раз", reply_to: tqid })
cell("a second report for a finished task is refused", /уже отправлен/.test(dup), dup)
await events["session.idle"]({ properties: { sessionID: "sesTASK01" } })
await wait(600)
const final = got("sesTASK01", "Задача выполнена")
cell("the task session gets a final line without a turn", final.length === 1 && final[0].synthetic && final[0].resume === false, JSON.stringify(final))
cell("the task session's title is marked done", updates.some((u) => u.sessionID === "sesTASK01" && u.title === "✓ почини тест X"), JSON.stringify(updates))
const card = core.allCards().find((c) => c.session === "sesTASK01")
cell("the task is closed", card?.spawned?.status === "closed", JSON.stringify(card?.spawned))
const ndir = path.join(core.NOTICES, String(WPID))
const notices = existsSync(ndir) ? readdirSync(ndir) : []
cell("the integrator's window gets notices", notices.length >= 2, JSON.stringify(notices))
await call("peer_send", "sesASKER1", { to: "sesTASK01", text: "after-close" })
await wait()
cell("a closed task session gets no letters", got("sesTASK01", "after-close").length === 0, "delivered")
const list2 = await call("peer_list", "sesASKER1")
cell("a closed task leaves peer_list", !/sesTASK01/.test(list2), list2)

// 6. the holder's tab closes -> the role is free at once; doctor sees a tab no window shows
tabs.splice(0, 1)
await wait(200)
const take2 = await call("peer_role", "sesOTHER1", { role: "integrator" })
cell("the holder's tab closed -> another tab takes the role without force", /теперь «integrator»/.test(take2), take2)
cell("the lock now names the new holder", core.holdsExclusive("proj.integrator", "sesOTHER1"), "no")
const doc = await call("peer_doctor", "sesASKER1")
cell("peer_doctor reports a tab no window shows", /не видна ни одному окну/.test(doc), doc)
const docOk = await call("peer_doctor", "sesOTHER1")
cell("peer_doctor does not flag a visible tab", !/не видна ни одному окну/.test(docOk) && !/ни одно окно/.test(docOk), docOk)

clearInterval(heart)
stop?.()
rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `peers-flow.test: FAIL ${fail}` : "peers-flow.test ok")
process.exit(fail ? 1 : 0)
