// Self-test: races and restart (task 005, AC-16, AC-18, AC-19, Г-7; node >= 24):  node test/crew-landing-race.test.mjs
// Heavy: child processes (test/landing-child.mjs), each with its own plugin instance on the same folders; run it alone, after the others.
//   AC-16: 8 processes with live holders call merge at the same moment on green records — exactly one gets the lock (5 rounds);
//   AC-18: the lock is older than MERGE_STALE_MS, 7 processes call merge — one winner (5 rounds); a second winner is a finding
//          outside this task (the lock itself is task 006), the cell then fails and the finding goes to result.md;
//   AC-19: the record is green and the lock was taken by one process; another process (a new start of the modules) continues:
//          accept passes, a merge on a shifted tip is refused.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-race.test")
const SIDS = Array.from({ length: 8 }, (_, i) => `sesR${i + 1}`)
const H = await harness("crew-landing-race", { tabs: SIDS })
const { call, git, proj, task: T, tasks, precheck } = H
const CHILD = path.join(import.meta.dirname, "landing-child.mjs")
const input = (o) => JSON.stringify(o)

/** run the children (one per [session, input]); resolves with their answers after all of them started the call together */
async function runChildren(jobs) {
  const sync = path.join(H.tmp, `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(sync, { recursive: true })
  const procs = jobs.map(([sid, inp], k) => {
    let out = ""
    let err = ""
    const p = spawn(process.execPath, [CHILD, H.tmp, sync, String(k), sid, JSON.stringify(SIDS), JSON.stringify(inp)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: process.env })
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (err += d))
    const done = new Promise((resolve) => p.on("close", (code) => resolve({ sid, code, out, err })))
    return done
  })
  for (const end = Date.now() + 120_000; jobs.some((_, k) => !existsSync(path.join(sync, `ready-${k}`))) && Date.now() < end; ) await H.wait(50)
  writeFileSync(path.join(sync, "go"), "1")
  const res = await Promise.all(procs)
  rmSync(sync, { recursive: true, force: true })
  return res.map((r) => ({ sid: r.sid, code: r.code, text: /^RESULT (.*)$/m.exec(r.out)?.[1] ? JSON.parse(/^RESULT (.*)$/m.exec(r.out)[1]) : `NO RESULT: ${r.out.slice(-200)} ${r.err.slice(-300)}` }))
}
const granted = (r) => /выдан на вершину/.test(r.text)
const greenAt = (t, sid, tip) => {
  const x = T(t.n)
  x.precheck = { state: "green", base: tip, at: Date.now() - 2000, by: sid, round: precheck.roundOf(x), candidate: tip, result: "CI зелёный", green_at: Date.now() - 1000 }
  x.history = []
  tasks.saveTask(x)
}
const clearLock = () => rmSync(H.lockFile(), { force: true })

// 8 tasks on review, one per reviewer session, no branches (the race is about the lock and the tip, not about the landing)
const mine = SIDS.map((sid) => H.reviewing({ reviewer: sid, branch: false }))

// ---- AC-16: the holders are alive (otherwise every process would take the lock as an abandoned one and the test would prove nothing)
{
  let alive = true
  const detail = []
  for (let i = 0; i < SIDS.length; i++) {
    clearLock()
    H.take(SIDS[i], mine[i].n)
    const other = H.take(SIDS[(i + 1) % SIDS.length], mine[(i + 1) % SIDS.length].n)
    if (other.ok) alive = false
    detail.push([SIDS[i], other.ok])
  }
  clearLock()
  cell("AC-16 держатели живые: a lock held by each of the 8 sessions is not taken as abandoned by another session", alive, JSON.stringify(detail))
}
for (let round = 1; round <= 5; round++) {
  clearLock()
  const tip = H.originTip()
  mine.forEach((t, i) => greenAt(t, SIDS[i], tip))
  const res = await runChildren(SIDS.map((sid, i) => [sid, { action: "merge", n: mine[i].n }]))
  const winners = res.filter(granted)
  const losers = res.filter((r) => !granted(r))
  const holder = H.holder()
  cell(
    `AC-16 раунд ${round}: of 8 processes exactly one got the lock, the others were refused naming the holder`,
    winners.length === 1 && holder?.session === winners[0].sid && losers.length === 7 && losers.every((r) => /Замок вливания проекта proj у приёмщика задачи #\d+ \(сессия sesR\d\)/.test(r.text)),
    JSON.stringify(res.map((r) => [r.sid, r.code, String(r.text).slice(0, String(r.text).startsWith("NO RESULT") ? 900 : 90)])),
  )
}

// ---- AC-18: the lock is older than MERGE_STALE_MS, 7 processes
for (let round = 1; round <= 5; round++) {
  clearLock()
  const tip = H.originTip()
  mine.forEach((t, i) => greenAt(t, SIDS[i], tip))
  writeFileSync(H.lockFile(), JSON.stringify({ session: "sesGhost", n: 9999, at: Date.now() - 3 * 3600_000 }))
  const res = await runChildren(SIDS.slice(0, 7).map((sid, i) => [sid, { action: "merge", n: mine[i].n }]))
  const winners = res.filter(granted)
  cell(
    `AC-18 раунд ${round}: the lock older than 2 h is taken by exactly one of 7 processes`,
    winners.length === 1 && H.holder()?.session === winners[0].sid,
    `winners ${winners.length}: ${JSON.stringify(res.map((r) => [r.sid, r.code, String(r.text).slice(0, String(r.text).startsWith("NO RESULT") ? 900 : 90)]))} holder ${JSON.stringify(H.holder())}`,
  )
}
clearLock()

// ---- AC-19: restart — the record is green and the lock is taken by one process, another process continues
{
  const t = H.reviewing({ reviewer: "sesR1" })
  await call("crew_task", "sesR1", { action: "precheck", n: t.n })
  git(proj, "fetch", "-q", "origin")
  H.candidate(`integrate/t${t.n}`, { merge: t.branch })
  await call("crew_task", "sesR1", { action: "precheck", n: t.n, candidate: `integrate/t${t.n}`, result: "CI зелёный" })
  const [a] = await runChildren([["sesR1", { action: "merge", n: t.n }]])
  const lockOn = T(t.n).precheck.lock_on
  H.land(`integrate/t${t.n}`)
  const [b] = await runChildren([["sesR1", { action: "accept", n: t.n }]])
  cell("AC-19 accept: the lock was taken by one process, accept is made by another (a new start of the modules) and passes", granted(a) && lockOn?.tip && /принята/.test(b.text) && T(t.n).status === "accepted" && !H.holder(), `${a.text} | ${b.text}`)
  const u = H.reviewing({ reviewer: "sesR2" })
  await call("crew_task", "sesR2", { action: "precheck", n: u.n })
  git(proj, "fetch", "-q", "origin")
  H.candidate(`integrate/t${u.n}`, { merge: u.branch })
  await call("crew_task", "sesR2", { action: "precheck", n: u.n, candidate: `integrate/t${u.n}`, result: "CI зелёный" })
  const [c] = await runChildren([["sesR2", { action: "merge", n: u.n }]])
  H.moveOrigin()
  const [d] = await runChildren([["sesR2", { action: "merge", n: u.n }]])
  cell("AC-19 merge: after the restart a repeat of merge on a shifted tip is refused, the lock is free, the record is stale", granted(c) && /сдвинулась/.test(d.text) && !H.holder() && T(u.n).precheck.state === "stale", `${c.text} | ${d.text}`)
}

// ---- Г-7: an empty record of the task is a refusal, the lock is not issued
{
  const n = 777
  const dir = path.dirname(tasks.taskFile("proj", n))
  mkdirSync(dir, { recursive: true })
  writeFileSync(tasks.taskFile("proj", n), "")
  const r = await call("crew_task", "sesR1", { action: "merge", n })
  cell("Г-7: an empty task record is a refusal, the lock is not issued", /Задачи #777 в проекте proj нет/.test(r) && !H.holder(), r)
}

done(H)
