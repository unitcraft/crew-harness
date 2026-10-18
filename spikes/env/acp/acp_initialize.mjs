// Sends one ACP `initialize` request to `opencode acp` over stdio and prints the reply.
// No login, no session, no model call. Run from any directory:
//   node acp_initialize.mjs [command] [args...]      (default command: opencode acp)
// Exit code 0 = a JSON-RPC result with protocolVersion came back; 1 = anything else.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [cmd, ...cmdArgs] = process.argv.length > 2 ? process.argv.slice(2) : ["opencode", "acp"];
const cwd = mkdtempSync(join(tmpdir(), "acp-init-")); // an empty directory: the agent sees no project
// shell: true so that Windows resolves the npm shim opencode.cmd.
const child = spawn([cmd, ...cmdArgs].join(" "), { cwd, shell: true, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

let stdoutBuf = "";
let stderrBuf = "";
let finished = false;
const started = Date.now();

function finish(code, text) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(text);
  // Windows: kill the whole tree (shell: true starts cmd.exe first).
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill("SIGKILL");
  setTimeout(() => { try { rmSync(cwd, { recursive: true, force: true }); } catch {} process.exitCode = code; }, 500);
}

const timer = setTimeout(() => finish(1, `FAIL timeout after 30 s; stdout=${JSON.stringify(stdoutBuf)} stderr=${JSON.stringify(stderrBuf.slice(0, 500))}`), 30000);

child.stderr.on("data", (d) => { stderrBuf += d; });
child.stdout.on("data", (d) => {
  stdoutBuf += d;
  let nl;
  while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { finish(1, `FAIL non-JSON line on stdout: ${line.slice(0, 200)}`); return; }
    if (msg.id === 0 && msg.result) {
      const r = msg.result;
      console.log(`reply in ${Date.now() - started} ms`);
      console.log(`protocolVersion: ${r.protocolVersion}`);
      console.log(`agentInfo: ${JSON.stringify(r.agentInfo)}`);
      console.log(`agentCapabilities: ${JSON.stringify(r.agentCapabilities)}`);
      console.log(`authMethods: ${JSON.stringify((r.authMethods ?? []).map((m) => ({ id: m.id, name: m.name })))}`);
      finish(typeof r.protocolVersion === "number" ? 0 : 1, "PASS initialize");
    } else if (msg.id === 0 && msg.error) {
      finish(1, `FAIL error: ${JSON.stringify(msg.error)}`);
    }
  }
});
child.on("error", (e) => finish(1, `FAIL spawn error: ${e.message}`));
child.on("exit", (code) => { if (!finished) finish(1, `FAIL agent exited early with code ${code}; stderr=${JSON.stringify(stderrBuf.slice(0, 500))}`); });

child.stdin.write(JSON.stringify({
  jsonrpc: "2.0", id: 0, method: "initialize",
  params: { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "crew-harness-spike", title: "CrewHarness spike", version: "0.0.1" } },
}) + "\n");
