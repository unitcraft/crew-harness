// Self-test of the GitHub issue transport (node >= 24):  node test/crew-github.test.mjs
// A fake GitHub in memory: letters go one way and back, a quiet issue answers 304, pending letters leave as one
// comment, own comments are skipped, a 429 pauses the transport, history before the start is not replayed.
const gh = await import("../github.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

let clock = Date.parse("2026-10-06T12:00:00Z")
const now = () => clock
const comments = []
let nextId = 1
let failNext // { status, headers }
const calls = []
const etagOf = (items) => `W/"${items.map((c) => `${c.id}@${c.updated_at}`).join(",")}"`
async function fakeFetch(url, init) {
  const u = new URL(url)
  calls.push({ method: init.method, url: u.pathname + u.search, inm: init.headers["If-None-Match"] })
  if (failNext) {
    const f = failNext
    failNext = undefined
    return new Response("{}", { status: f.status, headers: f.headers })
  }
  if (init.method === "POST") {
    const at = new Date(clock).toISOString()
    const c = { id: nextId++, body: JSON.parse(init.body).body, created_at: at, updated_at: at }
    comments.push(c)
    return Response.json(c, { status: 201 })
  }
  const since = u.searchParams.get("since")
  const items = comments.filter((c) => !since || c.updated_at >= since)
  const etag = etagOf(items)
  if (init.headers["If-None-Match"] === etag) return new Response(null, { status: 304 })
  return Response.json(items, { headers: { etag } })
}
const letter = (id, from, to, text) => ({ id, from_role: from, to, text, time: clock })
const mk = (node) => gh.createGhTransport({ repo: "o/r", issue: 1, token: "t", node, fetch: fakeFetch, now, sendGapMs: 1000 })

// history before the start
comments.push({ id: nextId++, body: gh.encodeComment("old", [letter("h1", "x", "y", "old")]), created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" })

const a = mk("A")
const b = mk("B")
const enc = gh.encodeComment("A", [letter("e1", "dev", "nova.lead", "привет <!-- x -->")])
cell("a comment round-trips", gh.decodeComment(enc)?.letters[0].text === "привет <!-- x -->", enc)
cell("a comment without a marker is not a letter", gh.decodeComment("just a human comment") === undefined, "decoded")

cell("history before the start is not replayed", (await b.pollOnce()).length === 0, "replayed")
await b.pollOnce()
cell("a quiet issue answers 304", b.stats.notModified === 1, JSON.stringify(b.stats))

clock += 1000
const p1 = a.send(letter("l1", "dev", "nova.lead", "one"))
const p2 = a.send(letter("l2", "dev", "nova.lead", "two"))
const p3 = a.send(letter("l3", "dev", "nova.qa", "three"))
cell("pending letters leave as one comment", (await a.flushOnce()) === 3 && a.stats.posts === 1, JSON.stringify(a.stats))
await Promise.all([p1, p2, p3])
cell("send resolves once the comment exists", true, "")

const got = await b.pollOnce()
cell("the other node receives them in order", got.map((l) => l.id).join() === "l1,l2,l3", got.map((l) => l.id).join())
cell("own comments are skipped", (await a.pollOnce()).length === 0, "read own")
cell("a repeat poll brings nothing new", (await b.pollOnce()).length === 0, "duplicate")
await b.pollOnce()
cell("after the boundary comment the poll is 304 again", calls.at(-1).inm && b.stats.notModified >= 2, JSON.stringify(calls.at(-1)))

const before = a.stats.posts
a.send(letter("l4", "dev", "nova.lead", "four"))
cell("the send gap holds the next comment", (await a.flushOnce()) === 0 && a.stats.posts === before, JSON.stringify(a.stats))
clock += 1000
failNext = { status: 429, headers: { "retry-after": "30" } }
cell("429: nothing sent, the letter stays", (await a.flushOnce()) === 0 && a.pending() === 1, String(a.pending()))
cell("429: paused for retry-after", a.stats.blockedUntil === clock + 30_000, String(a.stats.blockedUntil - clock))
clock += 10_000
const n0 = calls.length
cell("paused: neither send nor poll", (await a.flushOnce()) === 0 && (await a.pollOnce()).length === 0 && calls.length === n0, String(calls.length - n0))
clock += 21_000
cell("after the pause the letter leaves", (await a.flushOnce()) === 1, JSON.stringify(a.stats))
cell("and arrives", (await b.pollOnce()).map((l) => l.id).join() === "l4", "lost")

const big = a.send(letter("big", "dev", "nova.lead", "x".repeat(gh.MAX_BODY)))
clock += 2000
await a.flushOnce()
cell("a letter larger than a comment is refused", await big.then(() => false, () => true), "sent")

const loop = mk("C")
let delivered = []
clock += 2000
b.send(letter("l5", "lead", "dev", "loop"))
await b.flushOnce()
loop.start((ls) => {
  delivered.push(...ls)
})
await new Promise((r) => setTimeout(r, 50))
loop.stop()
cell("start: the loop delivers letters to the callback", delivered.map((l) => l.id).join() === "l5", delivered.map((l) => l.id).join())

console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
