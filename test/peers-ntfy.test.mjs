// Self-test of the ntfy transport (node >= 24):  node test/peers-ntfy.test.mjs
// A fake ntfy in memory: the topic and key come from the secret, letters are encrypted and cut into parts, a long
// letter is reassembled, a forged or replayed message is dropped, own messages are skipped, a 429 pauses sending,
// the subscription delivers within the stream and resumes from the last id after a break.
const nt = await import("../ntfy.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

let clock = Date.parse("2026-10-06T12:00:00Z")
const now = () => clock
const topics = new Map() // topic -> messages
const subs = new Set() // { topic, push, close }
let seq = 0
let failNext
const posted = []
const after = (list, since) => {
  if (!since || since === "all") return list
  if (/^\d+$/.test(since)) return list.filter((m) => m.time >= Number(since))
  const i = list.findIndex((m) => m.id === since)
  return i < 0 ? list : list.slice(i + 1)
}
const line = (m) => new TextEncoder().encode(JSON.stringify(m) + "\n")
async function fakeFetch(url, init = {}) {
  const u = new URL(url)
  const parts = u.pathname.split("/").filter(Boolean)
  const topic = parts[0]
  if (failNext) {
    const f = failNext
    failNext = undefined
    return new Response("{}", { status: f.status, headers: f.headers })
  }
  const list = topics.get(topic) ?? []
  topics.set(topic, list)
  if ((init.method ?? "GET") === "POST") {
    posted.push({ topic, body: init.body, firebase: init.headers?.Firebase })
    const m = { id: `msg${String(++seq).padStart(5, "0")}`, time: Math.floor(clock / 1000), event: "message", topic, message: init.body }
    list.push(m)
    for (const s of subs) if (s.topic === topic) s.push(m)
    return Response.json(m)
  }
  const since = u.searchParams.get("since")
  if (u.searchParams.get("poll") === "1") return new Response(after(list, since).map((m) => JSON.stringify(m)).join("\n") + "\n")
  let sub
  const body = new ReadableStream({
    start(c) {
      sub = { topic, push: (m) => c.enqueue(line(m)), close: () => (subs.delete(sub), c.close()) }
      subs.add(sub)
      c.enqueue(line({ id: "open", time: 0, event: "open", topic }))
      for (const m of after(list, since)) c.enqueue(line(m))
      init.signal?.addEventListener("abort", () => {
        subs.delete(sub)
        try {
          c.error(new DOMException("aborted", "AbortError"))
        } catch {}
      })
    },
    cancel() {
      subs.delete(sub)
    },
  })
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } })
}
const secret = "test-secret-0123456789abcdef"
const letter = (id, to, text) => ({ id, from_role: "dev", to, text, time: clock })
const mk = (node, extra = {}) => nt.createNtfyTransport({ secret, node, fetch: fakeFetch, now, sendGapMs: 1000, ...extra })
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

const k1 = nt.ntfyKeys(secret)
cell("the topic comes from the secret", k1.topic === nt.ntfyKeys(secret).topic && k1.topic !== nt.ntfyKeys("other").topic && !k1.topic.includes(secret), k1.topic)
const sealed = nt.seal(k1.key, { v: 1, node: "A", at: clock, letters: [letter("x", "y", "привет")] })
cell("seal / unseal round-trips", nt.unseal(k1.key, sealed)?.letters[0].text === "привет", "differs")
cell("a wrong key does not open it", nt.unseal(nt.ntfyKeys("other").key, sealed) === undefined, "opened")
cell("the secret is long and random", nt.ntfySecret().length >= 32 && nt.ntfySecret() !== nt.ntfySecret(), "")

const a = mk("A")
const b = mk("B")
clock += 1000
const p = [a.send(letter("l1", "nova.lead", "one")), a.send(letter("l2", "nova.qa", "two"))]
cell("pending letters leave as one message", (await a.flushOnce()) === 2 && a.stats.posts === 1, JSON.stringify(a.stats))
await Promise.all(p)
cell("the message body is not readable", !posted.at(-1).body.includes("one") && posted.at(-1).body.startsWith("peers1 "), posted.at(-1).body.slice(0, 40))
cell("Firebase forwarding is off", posted.at(-1).firebase === "no", posted.at(-1).firebase)
const got = await b.pollOnce()
cell("the other node receives them", got.map((l) => l.id).join() === "l1,l2", got.map((l) => l.id).join())
cell("own messages are skipped", (await a.pollOnce()).length === 0, "read own")
cell("a repeat poll brings nothing", (await b.pollOnce()).length === 0, "duplicate")

clock += 2000
a.send(letter("long", "nova.lead", "ё".repeat(6000)))
const before = a.stats.posts
await a.flushOnce()
const partsUsed = a.stats.posts - before
cell("a long letter is cut into parts", partsUsed > 1 && posted.slice(-partsUsed).every((x) => new TextEncoder().encode(x.body).length < 4096), String(partsUsed))
cell("and reassembled", (await b.pollOnce()).map((l) => l.text.length).join() === "6000", "lost")

clock += 2000
const big = a.send(letter("huge", "nova.lead", "x".repeat(nt.CHUNK * 10)))
await a.flushOnce()
cell("a letter longer than maxParts is refused", await big.then(() => false, () => true), "sent")

// forged: the right format, a wrong key
const list = topics.get(k1.topic)
const forged = nt.frame(nt.ntfyKeys("other").key, { v: 1, node: "X", at: clock, letters: [letter("evil", "nova.lead", "rm -rf")] })
list.push({ id: "forged1", time: Math.floor(clock / 1000), event: "message", message: forged[0] })
cell("a forged message is dropped", (await b.pollOnce()).length === 0 && b.stats.rejected === 1, JSON.stringify(b.stats))
// replayed: an old envelope of the right key published again
const old = nt.frame(k1.key, { v: 1, node: "A", at: clock - nt.REPLAY_MS - 1, letters: [letter("old", "nova.lead", "again")] })
list.push({ id: "replay1", time: Math.floor(clock / 1000), event: "message", message: old[0] })
cell("a stale envelope is dropped", (await b.pollOnce()).length === 0 && b.stats.rejected === 2, JSON.stringify(b.stats))
// the same message republished
const dup = list.find((m) => m.message?.includes(" 1/1 "))
list.push({ ...dup, id: "dup1" })
cell("a repeated mid is dropped", (await b.pollOnce()).length === 0, "delivered twice")

clock += 2000
failNext = { status: 429, headers: { "retry-after": "20" } }
a.send(letter("l3", "nova.lead", "three"))
cell("429: nothing sent, the letter stays", (await a.flushOnce()) === 0 && a.pending() === 1, String(a.pending()))
cell("429: paused for retry-after", a.stats.blockedUntil === clock + 20_000, String(a.stats.blockedUntil - clock))
clock += 21_000
cell("after the pause the letter leaves", (await a.flushOnce()) === 1, JSON.stringify(a.stats))
await b.pollOnce()

// subscription
const c = mk("C", { since: b.cursor() })
const delivered = []
c.start((ls) => {
  delivered.push(...ls.map((l) => l.id))
})
await tick()
clock += 2000
b.send(letter("s1", "dev", "stream"))
await b.flushOnce()
await tick()
cell("the subscription delivers within the stream", delivered.join() === "s1", delivered.join())
for (const s of [...subs]) s.close() // the server drops the stream
clock += 2000
b.send(letter("s2", "dev", "while away"))
await b.flushOnce()
await new Promise((r) => setTimeout(r, 1300)) // reconnect after a 1 s pause
cell("after a break it resumes from the last id", delivered.join() === "s1,s2", delivered.join())
cell("and reconnected once", c.stats.connects === 2, String(c.stats.connects))
c.stop()
await tick()
cell("stop closes the subscription", subs.size === 0, String(subs.size))

console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
