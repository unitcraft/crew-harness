// Manual latency check of the ntfy transport against a real server (not part of npm test; publishes messages):
//   node test/ntfy-latency.mjs [count=5] [server=https://ntfy.sh]
// A fresh random secret per run, so the topic is new and nobody else reads it. Two nodes in one process: B subscribes,
// A sends; prints the time from "send" to "B has it" for each letter.
const nt = await import("../ntfy.ts")
const count = Number(process.argv[2]) || 5
const server = process.argv[3] || "https://ntfy.sh"
const secret = nt.ntfySecret()
const log = (l) => console.log(`  ${l}`)
const a = nt.createNtfyTransport({ secret, server, node: "lat-A", log })
const b = nt.createNtfyTransport({ secret, server, node: "lat-B", log })
console.log(`topic ${a.topic} on ${server}`)

const sentAt = new Map()
const postedAt = new Map()
const lat = []
let done
const finished = new Promise((r) => (done = r))
b.start((letters) => {
  for (const l of letters) {
    if (!sentAt.has(l.id)) continue
    const total = Date.now() - sentAt.get(l.id)
    lat.push(total)
    console.log(`${l.id}: post ${(postedAt.get(l.id) ?? Date.now()) - sentAt.get(l.id)} ms, delivered after ${total} ms`)
    if (lat.length === count) done()
  }
})
await new Promise((r) => setTimeout(r, 1500)) // the subscription is open
a.start(() => {})
for (let i = 1; i <= count; i++) {
  const id = `ping-${i}`
  sentAt.set(id, Date.now())
  a.send({ id, from_role: "latency", to: "latency", text: `ping ${i}/${count}`, time: Date.now() }).then(() => postedAt.set(id, Date.now()))
  await new Promise((r) => setTimeout(r, 6000)) // anonymous ntfy.sh: about one request per 5 s after the burst
}
await Promise.race([finished, new Promise((r) => setTimeout(r, 30_000))])
a.stop()
b.stop()
lat.sort((x, y) => x - y)
console.log(`received ${lat.length}/${count}; median ${lat[Math.floor(lat.length / 2)] ?? "-"} ms, max ${lat.at(-1) ?? "-"} ms`)
console.log(`B connects: ${b.stats.connects}, rejected: ${b.stats.rejected}, errors: ${a.stats.errors + b.stats.errors}`)
