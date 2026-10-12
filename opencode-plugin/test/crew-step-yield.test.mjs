// Self-test (task 034): git of the plugin does not block the service loop; a step yields after its time budget (node >= 24):
//   node test/crew-step-yield.test.mjs
// (a) an async command does not stop a parallel timer; CREW_TEST_SYNC=1 runs the old sync way (red probe: this case must fail);
// (b) the timeout kills the process; (c) at most 2 processes at once; (d) a loop over many items yields and resumes later.
import { execFileSync } from "node:child_process"
import { execQueued, gitqStats, forEachBudget, stepBudget } from "../async-git.ts"

let fails = 0
const cell = (name, cond, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`)
  if (!cond) fails++
}
const SLEEP = (ms) => ["-e", `setTimeout(()=>{},${ms})`]
const run = process.env.CREW_TEST_SYNC === "1" ? async (f, a) => execFileSync(f, a, { windowsHide: true }) : (f, a, t) => execQueued(f, a, t)

// (a)
{
  let last = Date.now()
  let maxGap = 0
  const iv = setInterval(() => {
    const n = Date.now()
    maxGap = Math.max(maxGap, n - last)
    last = n
  }, 50)
  await run("node", SLEEP(2000), 8000)
  maxGap = Math.max(maxGap, Date.now() - last) // a blocked loop never got to tick: the gap is still open
  clearInterval(iv)
  cell("a: loop is not blocked by a 2 s command", maxGap < 300, `max gap ${maxGap} ms`)
}
// (b)
{
  const t0 = Date.now()
  let err
  try {
    await execQueued("node", SLEEP(5000), 500)
  } catch (e) {
    err = e
  }
  const took = Date.now() - t0
  cell("b: timeout turns into an error quickly and kills the process", !!err && took < 1500 && (err.killed === true || err.signal), `${took} ms, killed=${err?.killed}`)
}
// (c)
{
  gitqStats.peak = 0
  await Promise.all([1, 2, 3, 4, 5].map(() => execQueued("node", SLEEP(300), 8000)))
  cell("c: at most 2 processes at once", gitqStats.peak === 2, `peak ${gitqStats.peak}`)
}
// (d)
{
  const logs = []
  const log = (s) => logs.push(s)
  const items = Array.from({ length: 30 }, (_, i) => i)
  const seen = []
  const work = async (x) => {
    seen.push(x)
    await new Promise((r) => setTimeout(r, 20))
  }
  let ticks = 0
  const iv = setInterval(() => ticks++, 10)
  const first = await forEachBudget("t-step", items, work, log, 100)
  cell("d: a loop over many items yields", first === false && seen.length > 0 && seen.length < 30 && logs.length === 1 && /^step t-step yielded after \d+ ms \(done \d+ of 30\)$/.test(logs[0]), logs[0])
  const before = seen.length
  let rounds = 0
  while (!(await forEachBudget("t-step", items, work, log, 100)) && rounds++ < 20);
  clearInterval(iv)
  cell("d: the next passes continue from the saved place and finish, each item once", seen.length === 30 && new Set(seen).size === 30 && seen[before] === before, `first run ${before}, rounds ${rounds}`)
  cell("d: the timer ran in between", ticks > 10, `${ticks} ticks`)
  const l2 = []
  const bud = stepBudget("t2", (s) => l2.push(s), 30)
  let i = 0
  while (!(await bud.stop(i, 100))) await new Promise((r) => setTimeout(r, 15)), i++
  cell("d: stepBudget stops with one line", l2.length === 1 && /step t2 yielded after/.test(l2[0]), l2[0])
}
console.log(fails ? `${fails} FAILED` : "all ok")
process.exit(fails ? 1 : 0)
