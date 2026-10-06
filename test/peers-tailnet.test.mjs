// Self-test of the Tailscale transport (node >= 24):  node test/peers-tailnet.test.mjs
// Two transports on 127.0.0.1 talk over real HTTP; `whois` is faked. A letter arrives with the sender's verdicts;
// a refusal comes back; an unknown machine or a mismatched name gets 403; an unreachable machine keeps the letter
// and retries; too old a letter fails.
const tn = await import("../tailnet.ts")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms))

let whoIsCaller = "home" // what the network says about whoever connects to vps-1
const got = []
const vps = tn.createTailnetTransport({ node: "vps-1", peers: { home: {} }, listenHost: "127.0.0.1", port: 0, whois: async () => whoIsCaller })
await vps.start((letters, from) => {
  got.push(...letters.map((l) => ({ ...l, from })))
  return letters.map((l) => (l.to === "nope.dev" ? { id: l.id, why: "проекта nope нет" } : { id: l.id }))
})
const port = vps.address().port
let clock = Date.now()
const home = tn.createTailnetTransport({ node: "home", peers: { "vps-1": { host: "127.0.0.1", port } }, listenHost: "127.0.0.1", port: 0, whois: async () => "vps-1", now: () => clock, timeoutMs: 2000 })
const letter = (id, to, extra = {}) => ({ id, from_role: "nova.dev", from_session: "ses_a", to, to_node: "vps-1", text: "hi", time: Date.now(), ...extra })

const v1 = await home.send(letter("l1", "site.lead"))
cell("a letter arrives", got.some((l) => l.id === "l1"), JSON.stringify(got))
cell("the receiver knows the sender from the network", got.find((l) => l.id === "l1")?.from === "home", got[0]?.from)
cell("the sender gets an accepting verdict", v1.id === "l1" && !v1.why, JSON.stringify(v1))
const v2 = await home.send(letter("l2", "nope.dev"))
cell("a refusal comes back", v2.why === "проекта nope нет", JSON.stringify(v2))
const [v3, v4] = await Promise.all([home.send(letter("l3", "a.b")), home.send(letter("l4", "a.b"))])
cell("letters sent together both arrive", !v3.why && !v4.why && got.filter((l) => l.id === "l3" || l.id === "l4").length === 2, "")
cell("unknown machine name in to_node is an error", await home.send(letter("x", "a.b", { to_node: "vps-9" })).then(() => false, () => true), "sent")

whoIsCaller = "stranger"
const e1 = await home.send(letter("l5", "a.b")).then(() => "", (e) => e.message)
cell("a machine not in nodes gets 403", /не названа в nodes/.test(e1), e1)
whoIsCaller = "home"
const liar = tn.createTailnetTransport({ node: "vps-2", peers: { "vps-1": { host: "127.0.0.1", port } }, whois: async () => undefined })
const e2 = await liar.send(letter("l6", "a.b")).then(() => "", (e) => e.message)
cell("a name that does not match the network gets 403", /не совпадает/.test(e2), e2)
cell("refused senders are counted", vps.stats.rejected === 2, String(vps.stats.rejected))

// an unreachable machine: the letter waits and retries
vps.stop()
let settled = false
const p = home.send(letter("l7", "a.b")).then(
  (v) => ((settled = true), v),
  (e) => ((settled = true), e),
)
await tick(300)
cell("unreachable: the letter waits", !settled && home.pending() === 1 && home.stats.errors >= 1, `${settled} ${home.pending()} ${home.stats.errors}`)
const vps2 = tn.createTailnetTransport({ node: "vps-1", peers: { home: {} }, listenHost: "127.0.0.1", port, whois: async () => "home" })
await vps2.start((letters) => letters.map((l) => ({ id: l.id })))
clock += 120_000 // past any pause
await home.flushAll()
const v7 = await p
cell("when it is back the letter leaves", settled && !v7?.why && v7?.id === "l7", JSON.stringify(v7))
vps2.stop()

const p8 = home.send(letter("l8", "a.b")).then(() => "", (e) => e.message)
await tick(300)
clock += 25 * 3_600_000
await home.flushAll()
const e8 = await p8
cell("a letter older than maxAge fails", /недоступна дольше/.test(e8), e8)

home.stop()
liar.stop()
console.log(fail ? `${fail} FAIL` : "all ok")
process.exit(fail ? 1 : 0)
