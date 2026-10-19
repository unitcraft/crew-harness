// real-agent.mjs - the session server with the REAL `opencode acp`, as far as it goes without a model: a session is created, the
// hub starts the agent, the handshake (initialize and session/new) is done. No message is sent, so no model is called and no key or
// login is needed (task 099; the conversation with the real model is the owner's step after the hand-over).
//   node src/server/test/real-agent.mjs [port]        exit code 0 = the agent was started and answered the handshake
// Run it from the root of the repository, after building target/crew-hub.exe and target/crew-harness.exe (see e2e.mjs).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.argv[2] ?? 18098);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-real-"));
const configFile = path.join(dir, "server.json");
fs.writeFileSync(configFile, JSON.stringify({
  port,
  data_dir: path.join(dir, "data"),
  agents: [{ id: "opencode", label: "OpenCode", program: process.platform === "win32" ? "opencode.cmd" : "opencode", args: ["acp"] }],
  workdir: dir,
  web_dir: path.join(root, "src/web"),
  hub: { program: path.join(root, "target", "crew-hub.exe"), args: [] },
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let log = "";
const front = spawn(path.join(root, "target", "crew-harness.exe"), ["serve", configFile], { stdio: ["ignore", "pipe", "pipe"], cwd: root });
front.stderr.on("data", (d) => { log += d.toString(); });
front.stdout.on("data", (d) => { log += d.toString(); });

let ok = false;
let detail = "";
try {
  for (let i = 0; i < 100 && !log.includes("listening"); i += 1) await sleep(100);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); for (const e of Array.isArray(d) ? d : [d]) events.push(e); };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("websocket error")); });
  ws.send(JSON.stringify({ id: "r1", trace: "s-real", step: 0, kind: "session_created", input: { name: "Настоящий агент", agent: "opencode" }, time: Date.now() }));
  for (let i = 0; i < 600 && !/the agent of s-real (is ready|refused)/.test(log); i += 1) await sleep(100);
  ok = log.includes("the agent of s-real is ready");
  detail = (log.match(/hub: the agent of s-real[^\n]*/) ?? ["no word from the agent in 60 s"])[0];
  const shown = events.filter((e) => e.trace === "s-real").map((e) => e.kind).join(",");
  console.log(`${ok ? "PASS" : "FAIL"} the real agent answered initialize and session/new - ${detail}`);
  console.log(`page events of the session: ${shown}`);
  if (!ok) console.log("front log:\n" + log.slice(-2000));
  ws.close(1000, "done");
} catch (e) {
  console.log(`FAIL the run - ${e}`);
} finally {
  front.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the agent may still hold the folder for a moment */ }
}
process.exitCode = ok ? 0 : 1;
