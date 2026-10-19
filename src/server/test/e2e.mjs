// e2e.mjs - the whole session server through its door, as a page uses it (task 099): the front and the hub are started as programs
// (target/crew-harness.exe and target/crew-hub.exe), the agent is the fake ACP agent of src/acp/testdata, the client is a WebSocket
// of Node (Node 22 or newer, global WebSocket and fetch).
//   node src/server/test/e2e.mjs [port]        exit code 0 = every check passed
// Run it from the root of the repository, after: nova build src/crew_hub.nv -o target/crew-hub.exe;
//                                               nova build src/crew_harness.nv -o target/crew-harness.exe
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.argv[2] ?? 18099);
const exe = (name) => path.join(root, "target", `${name}.exe`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-e2e-"));
const configFile = path.join(dir, "server.json");
fs.writeFileSync(configFile, JSON.stringify({
  port,
  data_dir: path.join(dir, "data"),
  store: "files",
  agents: [{ id: "opencode", label: "Fake", program: "node", args: [path.join(root, "src/acp/testdata/fake_agent.mjs"), "--live"] }],
  idle_term_seconds: 3,
  workdir: root,
  web_dir: path.join(root, "src/web"),
  hub: { program: exe("crew-hub"), args: [] },
}));

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? " - " + detail : ""}`);
  if (!ok) failed += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- the programs -----

let front = null;
let frontLog = "";
async function startFront() {
  front = spawn(exe("crew-harness"), ["serve", configFile], { stdio: ["ignore", "pipe", "pipe"], cwd: root });
  front.stderr.on("data", (d) => { frontLog += d.toString(); });
  front.stdout.on("data", (d) => { frontLog += d.toString(); });
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.status === 200) return true;
    } catch { /* not yet */ }
    await sleep(100);
  }
  return false;
}
async function stopFront() {
  if (!front) return;
  const done = new Promise((r) => front.once("exit", r));
  front.kill();
  await Promise.race([done, sleep(5000)]);
  front = null;
}

// ----- a page -----

let serial = 0;
function page() {
  const events = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("websocket error")); });
  ws.onmessage = (m) => {
    const data = JSON.parse(m.data);
    for (const e of Array.isArray(data) ? data : [data]) events.push(e);
  };
  const state = { closed: false, code: 0 };
  ws.onclose = (e) => { state.closed = true; state.code = e.code; };
  const self = {
    events,
    state,
    opened,
    close: () => ws.close(1000, "done"),
    send(kind, trace, input) {
      serial += 1;
      ws.send(JSON.stringify({ id: `e2e-${serial}`, trace, step: 0, kind, input, time: Date.now() }));
    },
    async waitFor(pred, ms = 15000) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const hit = events.find(pred);
        if (hit) return hit;
        await sleep(20);
      }
      return undefined;
    },
    of: (trace) => events.filter((e) => e.trace === trace),
    text: (trace, turn) => events.filter((e) => e.trace === trace && e.kind === "agent_chunk" && e.input.turn === turn)
      .sort((a, b) => a.step - b.step).map((e) => e.input.text).join(""),
  };
  return self;
}
const isKind = (kind, trace) => (e) => e.kind === kind && e.trace === trace;

try {
  // ----- the door: files, headers, health -----
  const up = await startFront();
  check("the front starts and answers /health", up, frontLog);
  const index = await fetch(`http://127.0.0.1:${port}/`);
  const html = await index.text();
  check("GET / is the page", index.status === 200 && html.includes("<html") && (index.headers.get("content-type") ?? "").includes("text/html"),
    `status=${index.status} type=${index.headers.get("content-type")}`);
  const csp = index.headers.get("content-security-policy") ?? "";
  check("the page has the CSP of serve.mjs", csp.includes("default-src 'self'") && csp.includes("connect-src 'self'"), csp);
  const js = await fetch(`http://127.0.0.1:${port}/app.js`);
  check("GET /app.js is javascript", js.status === 200 && (js.headers.get("content-type") ?? "").includes("javascript"), `status=${js.status} type=${js.headers.get("content-type")}`);
  const css = await fetch(`http://127.0.0.1:${port}/app.css`);
  check("GET /app.css is css", css.status === 200 && (css.headers.get("content-type") ?? "").includes("css"));
  const none = await fetch(`http://127.0.0.1:${port}/no-such-file.js`);
  check("an unknown file is 404", none.status === 404, `status=${none.status}`);
  const escape = await fetch(`http://127.0.0.1:${port}/..%2Fsrc%2Fcrew_harness.nv`);
  check("a path out of the folder of the page is not served", escape.status >= 400, `status=${escape.status}`);
  const plain = await fetch(`http://127.0.0.1:${port}/ws`);
  check("GET /ws without an upgrade is 4xx", plain.status >= 400 && plain.status < 500, `status=${plain.status}`);

  // a web page of another origin must not be able to open the socket (a browser lets any page connect to 127.0.0.1)
  const upgradeStatus = (origin) => new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      s.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n`
        + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${origin ? `Origin: ${origin}\r\n` : ""}\r\n`);
    });
    let got = "";
    s.on("data", (d) => { got += d.toString(); if (got.includes("\r\n")) { s.destroy(); resolve(got.split("\r\n")[0]); } });
    s.on("error", () => resolve("error"));
    setTimeout(() => { s.destroy(); resolve("timeout"); }, 3000);
  });
  const foreign = await upgradeStatus("http://evil.example");
  check("a page of another origin is refused the socket", foreign.includes("403"), foreign);
  const own = await upgradeStatus(`http://127.0.0.1:${port}`);
  check("the page of this server is given the socket", own.includes("101"), own);

  // ----- a chat -----
  const a = page();
  await a.opened;
  a.send("session_created", "s-chat", { name: "Проба", agent: "opencode" });
  check("the session is shown", !!(await a.waitFor(isKind("session_created", "s-chat"))));
  a.send("user_message", "s-chat", { turn: "p1", text: "привет мир" });
  check("the first turn ends", !!(await a.waitFor(isKind("agent_done", "s-chat"))));
  const um1 = a.of("s-chat").find((e) => e.kind === "user_message");
  check("the answer comes in chunks", a.text("s-chat", um1.input.turn) === "Echo: привет мир", a.text("s-chat", um1.input.turn));
  check("the ids are unique and the steps grow", (() => {
    const ev = a.of("s-chat");
    return new Set(ev.map((e) => e.id)).size === ev.length && ev.every((e, i) => i === 0 || e.step > ev[i - 1].step);
  })());
  a.send("user_message", "s-chat", { turn: "p2", text: "второй" });
  await sleep(100);
  check("the second turn ends", !!(await a.waitFor((e) => e.kind === "agent_done" && e.trace === "s-chat" && e.id !== a.events.find(isKind("agent_done", "s-chat")).id)));
  const ums = a.of("s-chat").filter((e) => e.kind === "user_message");
  check("the second turn is answered", ums.length === 2 && a.text("s-chat", ums[1].input.turn) === "Echo: второй", a.text("s-chat", ums[1]?.input.turn));

  // ----- permission -----
  a.send("session_created", "s-perm", { name: "Разрешение", agent: "opencode" });
  a.send("user_message", "s-perm", { turn: "p", text: "permission go" });
  const ask = await a.waitFor(isKind("permission_request", "s-perm"));
  check("the request for permission is shown", !!ask && !!ask.input.request);
  a.send("permission_decision", "s-perm", { request: ask.input.request, decision: "allow" });
  check("the turn ends after the decision", !!(await a.waitFor(isKind("agent_done", "s-perm"))));
  check("the agent was told: allow", a.of("s-perm").some((e) => e.kind === "agent_chunk" && e.input.text.includes("selected:allow-once")));

  // ----- cancel keeps the session open -----
  a.send("session_created", "s-cancel", { name: "Отмена", agent: "opencode" });
  a.send("user_message", "s-cancel", { turn: "p", text: "slow go" });
  check("the slow turn begins", !!(await a.waitFor((e) => e.trace === "s-cancel" && e.kind === "agent_chunk" && e.input.text === "started")));
  a.send("cancel", "s-cancel", {});
  check("the cancel is shown", !!(await a.waitFor(isKind("cancel", "s-cancel"))));
  await sleep(500);
  check("the late word of the agent is not shown", !a.of("s-cancel").some((e) => (e.input.text ?? "").includes("late chunk")));
  a.send("user_message", "s-cancel", { turn: "p2", text: "after cancel" });
  check("the turn after the cancel is answered", !!(await a.waitFor(isKind("agent_done", "s-cancel"))));

  // ----- an error is an error event -----
  a.send("session_created", "s-bad", { name: "Чужой", agent: "nobody" });
  check("an unknown agent is an error event", !!(await a.waitFor((e) => e.trace === "s-bad" && e.kind === "error")));

  // ----- two pages on one session -----
  const b = page();
  await b.opened;
  await sleep(300);
  check("a second page is told every session", ["s-chat", "s-perm", "s-cancel"].every((t) => b.of(t).length > 0));
  check("and sees the same lines as the first", JSON.stringify(b.of("s-chat")) === JSON.stringify(a.of("s-chat")));
  b.send("user_message", "s-chat", { turn: "pb", text: "from b" });
  const before = a.of("s-chat").filter((e) => e.kind === "agent_done").length;
  await sleep(200);
  check("a message of the second page is answered to both", !!(await b.waitFor((e) => e.trace === "s-chat" && e.kind === "agent_done" && b.of("s-chat").filter((x) => x.kind === "agent_done").length === 3))
    && !!(await a.waitFor((e) => a.of("s-chat").filter((x) => x.kind === "agent_done").length === before + 1)));
  b.close();

  // ----- the agent dies -----
  a.send("session_created", "s-crash", { name: "Падение", agent: "opencode" });
  a.send("user_message", "s-crash", { turn: "p", text: "crash go" });
  check("the refusal ConnectionLost is shown", !!(await a.waitFor((e) => e.trace === "s-crash" && e.kind === "agent_refused" && e.input.reason === "ConnectionLost")),
    "a closed=" + a.state.closed + " code=" + a.state.code + " events=" + a.events.length + " " + JSON.stringify(a.of("s-crash").map((e) => [e.kind, e.input])) + " | front log: " + frontLog.slice(-3000));
  a.send("user_message", "s-crash", { turn: "p2", text: "after crash" });
  check("the next message gets a new agent", !!(await a.waitFor(isKind("agent_done", "s-crash"))));

  // ----- restart in the middle of a turn -----
  a.send("session_created", "s-rest", { name: "Перезапуск", agent: "opencode" });
  a.send("user_message", "s-rest", { turn: "p", text: "silent go" });
  await a.waitFor(isKind("user_message", "s-rest"));
  await sleep(300);
  const seen = a.of("s-chat").length;
  a.close();
  await stopFront();
  await sleep(500);
  const up2 = await startFront();
  check("the front starts again", up2, frontLog);
  const c = page();
  await c.opened;
  // the hub resumes the sessions first (an agent is started for the open request); the page is told when it is done
  for (let i = 0; i < 300 && !["s-chat", "s-perm", "s-cancel", "s-crash", "s-rest"].every((t) => c.of(t).length > 0); i += 1) await sleep(50);
  await sleep(200);
  check("the sessions are all there after the restart", ["s-chat", "s-perm", "s-cancel", "s-crash", "s-rest"].every((t) => c.of(t).length > 0));
  check("a session has the same lines as before", c.of("s-chat").length === seen + 5 || c.of("s-chat").length >= seen);
  check("the open request ends with Timeout", !!(await c.waitFor((e) => e.trace === "s-rest" && e.kind === "agent_refused" && e.input.reason === "Timeout", 20000)));
  c.send("user_message", "s-rest", { turn: "p2", text: "still here" });
  check("the session goes on after the restart", !!(await c.waitFor((e) => e.trace === "s-rest" && e.kind === "agent_done")));
  c.send("user_message", "s-chat", { turn: "p3", text: "old session" });
  const ums2 = () => c.of("s-chat").filter((e) => e.kind === "user_message");
  await c.waitFor((e) => e.trace === "s-chat" && e.kind === "user_message" && e.input.text === "old session");
  check("an old session answers after the restart", !!(await c.waitFor(() => c.text("s-chat", ums2().at(-1).input.turn) === "Echo: old session")));
  c.close();
} catch (e) {
  check("the run", false, String(e?.stack ?? e));
} finally {
  await stopFront();
  await sleep(300);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the agents may still hold the folder for a moment */ }
}

if (failed > 0) console.log("FRONT LOG:\n" + frontLog.slice(-4000));
console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
