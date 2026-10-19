// Checks a running ws_echo server (Node 22+, global WebSocket and fetch).
// usage: node ws_echo_check.mjs [port]   (default 18091); exit code 0 = all checks passed.
const port = process.argv[2] ?? "18091";
const base = `127.0.0.1:${port}`;
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

let page;
try { page = await fetch(`http://${base}/`); } catch (e) {
  console.log(`FAIL server not reachable at ${base} - ${e.cause?.code ?? e.message}`);
  process.exit(1); // nothing was opened yet, so the Windows exit quirk below does not apply
}
const html = await page.text();
check("GET / is 200 html", page.status === 200 && html.includes("<h1>ws_echo</h1>"),
  `status=${page.status} type=${page.headers.get("content-type")}`);

const plain = await fetch(`http://${base}/ws`);
check("GET /ws without upgrade is 4xx", plain.status >= 400 && plain.status < 500, `status=${plain.status}`);

function roundTrip(messages, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`);
    const got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error("timeout, got " + got.length)); }, timeoutMs);
    ws.onopen = () => { for (const m of messages) ws.send(m); };
    ws.onmessage = (e) => {
      got.push(e.data);
      if (got.length === messages.length) ws.close(1000, "done");
    };
    ws.onclose = (e) => { clearTimeout(timer); resolve({ got, code: e.code }); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("websocket error")); };
  });
}

try {
  const r = await roundTrip(["hello", '{"id":1,"method":"ping"}']);
  check("text echo x2", r.got[0] === "hello" && r.got[1] === '{"id":1,"method":"ping"}', JSON.stringify(r.got));
  check("clean close", r.code === 1000 || r.code === 1005, `code=${r.code}`);
  const big = "x".repeat(100000);
  const r2 = await roundTrip([big]);
  check("100 KB text echo", r2.got[0] === big, `len=${r2.got[0]?.length}`);
} catch (e) {
  check("websocket round trip", false, String(e));
}

console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
// ORACLE-WORKAROUND(7): process.exitCode, not process.exit(): on Windows Node 24 process.exit() right after closing a WebSocket can abort with a libuv assertion (UV_HANDLE_CLOSING in async.c); call process.exit() when item 7 is fixed (it is a defect of Node, not of Nova)
process.exitCode = failed === 0 ? 0 : 1;
