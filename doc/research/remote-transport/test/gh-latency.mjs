// Manual latency check of the GitHub issue transport against a real issue (not part of npm test; posts comments):
//   node test/gh-latency.mjs <owner/repo> <issue> [count=5] [pollMs=1000]
// Token: GITHUB_TOKEN / GH_TOKEN or `gh auth token`. Two nodes in one process ping-pong; prints the time from
// "send" to "the other node has it" for each letter.
const gh = await import("../github.ts")
const [repo, issueArg, countArg, pollArg] = process.argv.slice(2)
if (!repo || !issueArg) {
  console.log("usage: node test/gh-latency.mjs <owner/repo> <issue> [count=5] [pollMs=1000]")
  process.exit(2)
}
const token = gh.ghToken()
if (!token) {
  console.log("no token: set GITHUB_TOKEN or run `gh auth login`")
  process.exit(2)
}
const count = Number(countArg) || 5
const pollMs = Number(pollArg) || 1000
const log = (l) => console.log(`  ${l}`)
const a = gh.createGhTransport({ repo, issue: Number(issueArg), token, node: `lat-A-${process.pid}`, pollMs, log })
const b = gh.createGhTransport({ repo, issue: Number(issueArg), token, node: `lat-B-${process.pid}`, pollMs, log })

const sentAt = new Map()
const postedAt = new Map()
const lat = []
let done
const finished = new Promise((r) => (done = r))
b.start((letters) => {
  for (const l of letters) {
    if (!sentAt.has(l.id)) continue
    const total = Date.now() - sentAt.get(l.id)
    const post = postedAt.get(l.id) - sentAt.get(l.id)
    lat.push(total)
    console.log(`${l.id}: post ${post} ms, delivered after ${total} ms`)
    if (lat.length === count) done()
  }
})
a.start(() => {})
for (let i = 1; i <= count; i++) {
  const id = `ping-${process.pid}-${i}`
  sentAt.set(id, Date.now())
  a.send({ id, from_role: "latency", to: "latency", text: `ping ${i}/${count}`, time: Date.now() }).then(() => postedAt.set(id, Date.now()))
  await new Promise((r) => setTimeout(r, 3000))
}
await Promise.race([finished, new Promise((r) => setTimeout(r, 60_000))])
a.stop()
b.stop()
lat.sort((x, y) => x - y)
console.log(`received ${lat.length}/${count}; median ${lat[Math.floor(lat.length / 2)] ?? "-"} ms, max ${lat.at(-1) ?? "-"} ms`)
console.log(`polls B: ${b.stats.polls}, 304: ${b.stats.notModified}, errors: ${a.stats.errors + b.stats.errors}`)
