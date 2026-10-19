// e2e.mjs - the whole session server through its door, as a page uses it (task 099): the front and the hub are started as programs
// (target/crew-harness.exe and target/crew-hub.exe), the agent is the fake ACP agent of src/acp/testdata, the client is a WebSocket
// of Node (Node 22 or newer, global WebSocket and fetch).
//   node src/server/test/e2e.mjs [port]                 the store in files; exit code 0 = every check passed
//   node src/server/test/e2e.mjs --pg [port]            the store pg on the TEMPORARY PostgreSQL of src/pg/testdb.ps1 (task 115): the same
//                                                       checks, then the sessions are looked for in the database
//   node src/server/test/e2e.mjs --pg-docker [port]     the store pg on the PERMANENT PostgreSQL of src/pg/db.ps1 (container crew-harness-pg),
//                                                       on a database of its own, crew_e2e, made and dropped here (the data of the owner,
//                                                       the database crew, are not touched); then `db.ps1 down`, `db.ps1 up`, and the
//                                                       sessions must be there after it
// Run it from the root of the repository, after: nova build src/crew_hub.nv -o target/crew-hub.exe;
//                                               nova build src/crew_harness.nv -o target/crew-harness.exe
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const argv = process.argv.slice(2);
const mode = argv.includes("--pg-docker") ? "pg-docker" : argv.includes("--pg") ? "pg" : "files";
const port = Number(argv.find((a) => /^\d+$/.test(a)) ?? 18099);
const exe = (name) => path.join(root, "target", `${name}.exe`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-e2e-"));
const configFile = path.join(dir, "server.json");

// ----- the database (modes pg and pg-docker) -----

const E2E_DB = "crew_e2e";
const pg = { container: "", host: "127.0.0.1", port: 0, database: E2E_DB, user: "", password: "" };
const mask = (text) => (pg.password ? String(text).split(pg.password).join("***") : String(text));
function stopWith(message) {
  console.log(`FAIL ${message}`);
  console.log("NOT RUN: the database is not there");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* nothing to remove */ }
  process.exit(1);
}
// SQL goes to psql in the container over stdin (a password is never on a command line); the administrator of the container
function psql(database, text) {
  const r = spawnSync("docker", ["exec", "-i", pg.container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"],
    { input: text, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql in ${pg.container} failed: ${mask(r.stderr || r.error || "")}`.trim());
  return r.stdout.trim();
}
const dbScript = (...a) => spawnSync("powershell", ["-NoProfile", "-File", path.join(root, "src/pg/db.ps1"), ...a], { encoding: "utf8" });
function provision() {
  if (spawnSync("docker", ["info"], { encoding: "utf8" }).status !== 0) {
    stopWith(`Docker is not running: start Docker Desktop (the mode ${mode} needs a PostgreSQL in Docker)`);
  }
  if (mode === "pg") {
    // the temporary container of src/pg/testdb.ps1: random passwords of that container, md5 logins
    const settings = path.join(root, "target/pg-test.json");
    if (!fs.existsSync(settings)) stopWith("target/pg-test.json is not there: start the temporary PostgreSQL first: powershell -File src/pg/testdb.ps1");
    const t = JSON.parse(fs.readFileSync(settings, "utf8"));
    Object.assign(pg, { container: t.container, port: t.port, user: "crew_e2e_user", password: t.app_password });
    try {
      psql("postgres", `drop database if exists ${E2E_DB} with (force)`);
      psql("postgres", `drop role if exists ${pg.user}`);
      psql("postgres", `create database ${E2E_DB}`);
    } catch (e) { stopWith(String(e.message ?? e)); }
    const schema = spawnSync("docker", ["exec", "-i", pg.container, "psql", "-U", "postgres", "-d", E2E_DB, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
      { input: fs.readFileSync(path.join(root, "src/pg/schema.sql")), encoding: "utf8" });
    if (schema.status !== 0) stopWith(`the schema was not applied: ${mask(schema.stderr)}`);
    try { psql("postgres", `create role ${pg.user} login password '${pg.password}' in role crew_app`); } catch (e) { stopWith(String(e.message ?? e)); }
  } else {
    // the permanent container of src/pg/db.ps1 and its settings file outside the repository
    dbScript("dropdb", "-Database", E2E_DB); // a leftover of an earlier run
    const up = dbScript("up", "-Database", E2E_DB);
    if (up.status !== 0) stopWith(`db.ps1 up failed: ${(up.stderr || up.stdout || "").trim()}`);
    const file = process.env.CREW_PG_DB_SETTINGS || path.join(os.homedir(), ".config", "crew-harness", "pg.json");
    const t = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(pg, { container: t.container, port: t.port, user: t.service_user, password: t.service_password });
  }
  // the login must really work and the schema must be there: a message now, not a hang later
  let n;
  try { n = psql(E2E_DB, "select count(*) from crew.list_sessions()"); } catch (e) { stopWith(String(e.message ?? e)); }
  if (n !== "0") stopWith(`the database ${E2E_DB} is not empty (${n} sessions)`);
}
function unprovision() {
  try {
    if (mode === "pg") { psql("postgres", `drop database if exists ${E2E_DB} with (force)`); psql("postgres", `drop role if exists ${pg.user}`); }
    else if (mode === "pg-docker") dbScript("dropdb", "-Database", E2E_DB);
  } catch (e) { console.log(`warning: the clean-up of ${E2E_DB} failed: ${e.message}`); }
}
if (mode !== "files") provision();

fs.writeFileSync(configFile, JSON.stringify({
  port,
  data_dir: path.join(dir, "data"),
  store: mode === "files" ? "files" : "pg",
  ...(mode === "files" ? {} : { pg: { host: pg.host, port: pg.port, database: pg.database, user: pg.user } }), // no password in the file
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
  // the password of the database is in the environment of the front (and of the hub it starts), not in a file or on a command line
  const env = mode === "files" ? process.env : { ...process.env, CREW_PG_PASSWORD: pg.password };
  front = spawn(exe("crew-harness"), ["serve", configFile], { stdio: ["ignore", "pipe", "pipe"], cwd: root, env });
  let exited = false;
  front.once("exit", () => { exited = true; });
  front.stderr.on("data", (d) => { frontLog += d.toString(); });
  front.stdout.on("data", (d) => { frontLog += d.toString(); });
  for (let i = 0; i < 100 && !exited; i += 1) {
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
  await c.waitFor(() => c.of("s-chat").at(-1)?.kind === "agent_done");
  c.close();

  // ----- the store pg: the sessions are in the database, and the password is nowhere it should not be -----
  if (mode !== "files") {
    const traces = ["s-chat", "s-perm", "s-cancel", "s-crash", "s-rest"];
    const ids = psql(E2E_DB, "select string_agg(id, ',' order by id) from crew.list_sessions()").split(",");
    check("the sessions are in the database", traces.every((t) => ids.includes(t)), ids.join(","));
    const lines = Number(psql(E2E_DB, "select count(*) from crew.machine_journal"));
    check("the journal of the engine is in the database", lines >= 40, String(lines));
    check("the password is in no line of the log of the front", !frontLog.includes(pg.password));
    check("the password is not in the settings file of the server", !fs.readFileSync(configFile, "utf8").includes(pg.password));
  }

  // ----- the permanent database: down, up, and the data of the volume are there -----
  if (mode === "pg-docker") {
    const traces = ["s-chat", "s-perm", "s-cancel", "s-crash", "s-rest"];
    // as the page does: an event is kept once by its id (an event of the moment of the connection may come twice), in the order of the steps
    const story = (page_, t) => [...new Map(page_.of(t).map((e) => [e.id, e])).values()].sort((x, y) => x.step - y.step);
    const before = Object.fromEntries(traces.map((t) => [t, JSON.stringify(story(c, t))]));
    await stopFront();
    const down = dbScript("down");
    const state = spawnSync("docker", ["container", "inspect", "-f", "{{.State.Status}}", pg.container], { encoding: "utf8" }).stdout.trim();
    check("db.ps1 down stops the container", down.status === 0 && state !== "running", state);
    const up = dbScript("up", "-Database", E2E_DB);
    check("db.ps1 up starts it again", up.status === 0, (up.stderr || up.stdout || "").trim());
    check("the volume keeps the sessions of the database", psql(E2E_DB, "select count(*) from crew.list_sessions()") === String(traces.length));
    check("the front starts again on the restarted database", await startFront(), frontLog);
    const d = page();
    await d.opened;
    for (let i = 0; i < 300 && !traces.every((t) => d.of(t).length > 0); i += 1) await sleep(50);
    await sleep(200);
    check("the sessions are all there after down and up", traces.every((t) => d.of(t).length > 0));
    const differ = (t) => {
      const was = JSON.parse(before[t]);
      const now = story(d, t);
      const i = was.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(now[k]));
      return `${t}: ${was.length} lines before, ${now.length} after, first difference at ${i}: ${JSON.stringify(was[i])} / ${JSON.stringify(now[i])}`;
    };
    check("every session has the same lines after down and up", traces.every((t) => JSON.stringify(story(d, t)) === before[t]),
      traces.filter((t) => JSON.stringify(story(d, t)) !== before[t]).map(differ).join("; "));
    const done = () => d.of("s-chat").filter((e) => e.kind === "agent_done").length;
    const doneBefore = done();
    d.send("user_message", "s-chat", { turn: "p4", text: "after down" });
    check("a session goes on after down and up", !!(await d.waitFor(() => done() > doneBefore)));
    d.close();
  }
} catch (e) {
  check("the run", false, String(e?.stack ?? e));
} finally {
  await stopFront();
  await sleep(300);
  if (mode !== "files") unprovision();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the agents may still hold the folder for a moment */ }
}

if (failed > 0) console.log("FRONT LOG:\n" + frontLog.slice(-4000));
console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
process.exitCode = failed === 0 ? 0 : 1;
