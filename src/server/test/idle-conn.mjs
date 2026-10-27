// idle-conn.mjs - a connection that sat idle longer than the old idle deadline (60 s) of the front (task 192): the next request must not hit a dead socket.
//   node src/server/test/idle-conn.mjs [port] [pause_seconds]     against a running front (default 8100, pause 66 s); exit code 0 = ok
// Checks: the response says `Connection: close` and has no `Keep-Alive`; the server closes the socket with a FIN (no reset) before the pause is over, or the second
// request on the same socket is answered; a request on a NEW connection after the pause is answered 200 (this is what the browser does after a clean close).
import net from "node:net";

const port = Number(process.argv[2] ?? 8100);
const pause = Number(process.argv[3] ?? 66) * 1000;
const req = "GET /api/fs/list?path=D:/ HTTP/1.1\r\nHost: localhost\r\n\r\n";

function exchange(sock) {
  return new Promise((resolve, reject) => {
    let got = "";
    const onData = (d) => { got += d.toString("latin1"); if (/\r\n\r\n/.test(got)) { sock.off("data", onData); resolve(got); } };
    sock.on("data", onData);
    sock.once("error", reject);
    sock.write(req);
  });
}

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed += 1; };

const sock = net.connect(port, "127.0.0.1");
await new Promise((r) => sock.once("connect", r));
let state = "open";
sock.on("end", () => { if (state === "open") state = "fin"; });
sock.on("error", (e) => { state = `error ${e.code}`; });
sock.on("close", () => { if (state === "open") state = "closed"; });
const first = await exchange(sock);
check(/^HTTP\/1\.1 200/.test(first), "first request on a fresh connection: 200");
check(/connection: close/i.test(first), "the response says Connection: close");
check(!/keep-alive:/i.test(first), "no Keep-Alive header");
await new Promise((r) => setTimeout(r, pause));
check(state === "fin" || state === "closed", `the server closed the idle socket cleanly (state: ${state})`);
sock.destroy();
const again = net.connect(port, "127.0.0.1");
await new Promise((r) => again.once("connect", r));
const second = await exchange(again);
check(/^HTTP\/1\.1 200/.test(second), "request on a new connection after the pause: 200");
again.destroy();
process.exit(failed === 0 ? 0 : 1);
