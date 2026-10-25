// A fake ACP agent for the tests of src/acp (task 095): JSON-RPC 2.0 over stdio, one message per line.
//   node fake_agent.mjs [--no-initialize] [--no-session] [--auth-error] [--live] [--ask]
// `--ask`: the agent says in its capabilities that it takes an HTTP MCP server (mcpCapabilities.http) and keeps the servers of session/new.
// Answers `initialize` and `session/new`; what a `session/prompt` does depends on the first word of the prompt text:
//   (anything else)  an echo in three chunks, then end_turn
//   tools            unknown update, tool_call, tool_call_update, plan, usage_update, thought, a chunk, end_turn
//   permission       a tool_call, then session/request_permission; the chunk tells what the client decided
//   fs               asks the client for fs/read_text_file and terminal/create; the chunk tells the error codes
//   slow             a chunk, then waits for session/cancel and answers stopReason cancelled (a late chunk first)
//   crash            a chunk, then exits with code 3
//   silent           says nothing at all for this prompt (the process stays alive)
//   dup              a chunk twice, the final answer twice, a chunk after the answer
//   refuse | maxtokens | maxrequests   the stop reason refusal | max_tokens | max_turn_requests
//   error            a JSON-RPC error instead of the answer
//   fragment         Cyrillic and an emoji; one line is written in two pieces cut inside a letter, two lines in one write
//   noeol            a chunk, then the final answer WITHOUT a line break, then the process exits
//   (pictures)       a prompt with `image` blocks is echoed with a tail "[blocks:text,image; image/png:<length of data>:<first 8 characters>]"
//   caps             a chunk with the clientCapabilities that came with initialize
//   cancelcount      a chunk with the number of session/cancel notifications received so far
//   ask              asks the client a question by `elicitation/create` (a form, as claude-agent-acp writes it) when the client said at initialize
//                    that it shows forms; the chunk tells the answer ("ask: no-form" when it did not). Two questions with `ask2`.
//   askmcp           (with `--ask`) calls the tool ask_user_question of the MCP server that came in session/new: initialize, tools/list, tools/call;
//                    the chunk tells the result ("askmcp: no-server" when the client gave no server)
//   burst            256 chunks over a marked 512ms stream, then end_turn (server pump fairness probe)
// The process writes `fake-agent: ready` to stderr when it starts.
import { createInterface } from "node:readline";
import fs from "node:fs";

// A guard for the tests: a test that fails before it closes its client would leave this process alive, and the test
// binary (which waits for the pipes of the process) with it; the process ends by itself after 25 seconds (a test takes
// a few seconds at most, and `nova test` stops a binary that runs for a minute).
// (`--live`, for the session server: no guard, the server closes the agent itself.)
const args = process.argv.slice(2);
if (!args.includes("--live")) setTimeout(() => process.exit(0), 25000);

const noInitialize = args.includes("--no-initialize");
// `--images`: the agent says at `initialize` that it takes pictures in a prompt (promptCapabilities.image)
const takesImages = args.includes("--images");
const noSession = args.includes("--no-session");
const authError = args.includes("--auth-error");
const askFlag = args.includes("--ask");
let mcpServers = [];
const streamMarkerArg = args.find((arg) => arg.startsWith("--stream-marker="));
const streamMarker = streamMarkerArg ? streamMarkerArg.slice("--stream-marker=".length) : "";

const SESSION = "sess_fake_1";
let clientCaps = null;
let cancels = 0;
let cancelWaiter = null;
let nextAgentId = 100;
const pendingAgentCalls = new Map(); // id -> resolve

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function update(update, sessionId = SESSION) {
  write({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
}
function chunk(text) {
  update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
}
function respond(id, result) {
  write({ jsonrpc: "2.0", id, result });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function callClient(method, params) {
  const id = nextAgentId++;
  return new Promise((resolve) => {
    pendingAgentCalls.set(id, resolve);
    write({ jsonrpc: "2.0", id, method, params });
  });
}

async function prompt(id, params) {
  const first = params.prompt && params.prompt[0];
  const text = first && first.type === "text" ? first.text : "";
  const word = text.split(" ")[0];
  switch (word) {
    case "model-change": {
      update({ sessionUpdate: "config_option_update", configOptions: [{ id: "model", category: "model", type: "select", currentValue: "fake-model-2", options: [{ value: "fake-model-2", name: "Second Model" }] }] });
      chunk("model changed");
      return respond(id, { stopReason: "end_turn" });
    }
    case "foreign-model": {
      update({ sessionUpdate: "config_option_update", configOptions: [{ id: "model", category: "model", type: "select", currentValue: "intruder", options: [{ value: "intruder", name: "Foreign Model" }] }] }, "foreign-session");
      chunk("foreign event ignored");
      return respond(id, { stopReason: "end_turn" });
    }
    case "tools": {
      update({ sessionUpdate: "available_commands_update", availableCommands: [] });
      update({ sessionUpdate: "tool_call", toolCallId: "call_001", title: "Чтение src/main.nv", kind: "read", status: "pending" });
      update({ sessionUpdate: "tool_call_update", toolCallId: "call_001", status: "completed", content: [{ type: "content", content: { type: "text", text: "файл прочитан" } }] });
      update({ sessionUpdate: "plan", entries: [{ content: "Проверить", priority: "high", status: "pending" }] });
      update({ sessionUpdate: "usage_update", used: 53000, size: 200000, cost: { amount: 0.045, currency: "USD" } });
      update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "думаю" } });
      update({ sessionUpdate: "hologram_chunk", x: 1 });
      chunk("Готово");
      return respond(id, { stopReason: "end_turn" });
    }
    case "permission": {
      update({ sessionUpdate: "tool_call", toolCallId: "call_p1", title: "Записать result.md", kind: "edit", status: "pending" });
      const answer = await callClient("session/request_permission", {
        sessionId: SESSION,
        toolCall: { toolCallId: "call_p1", title: "Записать result.md", kind: "edit" },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      });
      const outcome = answer && answer.result && answer.result.outcome;
      const told = outcome ? (outcome.outcome === "selected" ? "selected:" + outcome.optionId : outcome.outcome) : "no-answer";
      chunk("permission: " + told);
      return respond(id, { stopReason: told === "cancelled" ? "cancelled" : "end_turn" });
    }
    case "ask":
    case "ask2": {
      if (!(clientCaps && clientCaps.elicitation && clientCaps.elicitation.form)) {
        chunk("ask: no-form");
        return respond(id, { stopReason: "end_turn" });
      }
      const properties = {
        question_0: { type: "string", title: "Формат", oneOf: [{ const: "JSON", title: "JSON", description: "машинный" }, { const: "YAML", title: "YAML" }] },
        question_0_custom: { type: "string", title: "Other" },
      };
      let message = "Какой формат?";
      if (word === "ask2") {
        message = "Please answer the following questions.";
        properties.question_0.description = "Какой формат?";
        properties.question_1 = { type: "array", title: "Части", description: "Что делать?", items: { anyOf: [{ const: "A", title: "A" }, { const: "B", title: "B" }] } };
        properties.question_1_custom = { type: "string", title: "Other" };
      }
      const answer = await callClient("elicitation/create", {
        mode: "form",
        sessionId: SESSION,
        toolCallId: "call_q1",
        message,
        requestedSchema: { type: "object", properties },
      });
      const told = answer && answer.result ? JSON.stringify(answer.result) : "no-answer";
      chunk("ask: " + told);
      return respond(id, { stopReason: answer && answer.result && answer.result.action === "cancel" ? "cancelled" : "end_turn" });
    }
    case "askmcp": {
      if (mcpServers.length === 0) {
        chunk("askmcp: no-server");
        return respond(id, { stopReason: "end_turn" });
      }
      const server = mcpServers[0];
      const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
      for (const h of server.headers || []) headers[h.name] = h.value;
      const post = async (body) => {
        const res = await fetch(server.url, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
      };
      try {
      const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake-agent", version: "0" } } });
      await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      const tools = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const names = ((tools.body && tools.body.result && tools.body.result.tools) || []).map((t) => t.name).join(",");
      const called = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ask_user_question", arguments: { questions: [{ question: "Какой формат?", header: "Формат", multiSelect: false, options: [{ label: "JSON", description: "машинный" }, { label: "YAML", description: "" }] }] } } });
      const content = called.body && called.body.result && called.body.result.content;
      const textOut = content && content[0] ? content[0].text : JSON.stringify(called.body);
      chunk("askmcp: " + init.status + " " + names + " | " + textOut);
      } catch (e) {
        chunk("askmcp: error " + (e && e.message));
      }
      return respond(id, { stopReason: "end_turn" });
    }
    case "fs": {
      const a = await callClient("fs/read_text_file", { sessionId: SESSION, path: "C:/work/x.txt" });
      const b = await callClient("terminal/create", { sessionId: SESSION, command: "echo" });
      chunk("fs: " + (a.error ? a.error.code : "ok") + " terminal: " + (b.error ? b.error.code : "ok"));
      return respond(id, { stopReason: "end_turn" });
    }
    case "slow": {
      chunk("started");
      await new Promise((resolve) => { cancelWaiter = resolve; setTimeout(resolve, 15000); });
      chunk("late chunk after cancel");
      return respond(id, { stopReason: "cancelled" });
    }
    case "crash": {
      chunk("about to crash");
      setTimeout(() => process.exit(3), 30);
      return;
    }
    case "silent":
      return;
    case "dup": {
      chunk("once");
      chunk("once");
      respond(id, { stopReason: "end_turn" });
      respond(id, { stopReason: "end_turn" });
      chunk("after the end");
      return;
    }
    case "refuse":
      return respond(id, { stopReason: "refusal" });
    case "maxtokens":
      return respond(id, { stopReason: "max_tokens" });
    case "maxrequests":
      return respond(id, { stopReason: "max_turn_requests" });
    case "error":
      return write({ jsonrpc: "2.0", id, error: { code: -32603, message: "internal failure of the fake agent" } });
    case "fragment": {
      const line = JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Привет, мир 🙂" } } } }) + "\n";
      const bytes = Buffer.from(line, "utf8");
      const cut = bytes.indexOf(0xd0) + 1; // inside the first Cyrillic letter (its lead byte and its second byte)
      process.stdout.write(bytes.subarray(0, cut));
      await sleep(60);
      process.stdout.write(bytes.subarray(cut));
      await sleep(30);
      // two messages in one write
      const two = JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " раз" } } } }) + "\n" +
        JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " два" } } } }) + "\n";
      process.stdout.write(two);
      await sleep(30);
      return respond(id, { stopReason: "end_turn" });
    }
    case "noeol": {
      chunk("last words");
      await sleep(30);
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } }), () => process.exit(0));
      return;
    }
    case "caps":
      chunk("caps: " + JSON.stringify(clientCaps));
      return respond(id, { stopReason: "end_turn" });
    case "cancelcount":
      chunk("cancels: " + cancels);
      return respond(id, { stopReason: "end_turn" });
    case "burst": {
      const producerStartedAt = Date.now();
      if (streamMarker) fs.writeFileSync(streamMarker, JSON.stringify({ producerStartedAt }));
      try {
        // Produce faster than the isolated PG store commits each incoming event, keeping a real
        // backlog while making the producer's unfinished state externally observable to tests.
        for (let i = 0; i < 256; i++) {
          chunk(`b${i};`);
          await sleep(2);
        }
        return respond(id, { stopReason: "end_turn" });
      } finally {
        if (streamMarker) fs.rmSync(streamMarker, { force: true });
      }
    }
    default: {
      const words = ("Echo: " + text).split(" ");
      for (let i = 0; i < words.length; i++) {
        chunk((i === 0 ? "" : " ") + words[i]);
        await sleep(5);
      }
      const blocks = params.prompt || [];
      const pictures = blocks.filter((b) => b.type === "image");
      if (pictures.length > 0) {
        chunk(" [blocks:" + blocks.map((b) => b.type).join(",") + "; " + pictures.map((b) => b.mimeType + ":" + String(b.data).length + ":" + String(b.data).slice(0, 8)).join(" ") + "]");
      }
      return respond(id, { stopReason: "end_turn" });
    }
  }
}

function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // an answer to a call of the agent
  if (msg.id !== undefined && msg.method === undefined) {
    const resolve = pendingAgentCalls.get(msg.id);
    if (resolve) {
      pendingAgentCalls.delete(msg.id);
      resolve(msg);
    }
    return;
  }
  if (msg.method === "session/cancel") {
    cancels++;
    if (cancelWaiter) cancelWaiter();
    return;
  }
  switch (msg.method) {
    case "initialize":
      clientCaps = msg.params && msg.params.clientCapabilities;
      if (noInitialize) return;
      if (authError) return write({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "Authentication required" } });
      return respond(msg.id, {
        protocolVersion: 1,
        agentCapabilities: { loadSession: false, promptCapabilities: { image: takesImages, audio: false, embeddedContext: false }, ...(askFlag ? { mcpCapabilities: { http: true, sse: false } } : {}) },
        agentInfo: { name: "fake-agent", title: "Fake ACP agent", version: "0.0.1" },
        authMethods: [],
      });
    case "session/new":
      if (noSession) return;
      mcpServers = (msg.params && msg.params.mcpServers) || [];
      return respond(msg.id, { sessionId: SESSION, modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default", description: "Asks before changes" }, { id: "plan", name: "Plan", description: "Plans first" }] }, configOptions: [{ id: "model", category: "model", type: "select", currentValue: "fake-model", options: [{ value: "fake-model", name: "Fake Model" }] }] });
    case "session/set_mode":
      return respond(msg.id, {});
    case "session/prompt":
      if (!msg.params || msg.params.sessionId !== SESSION) {
        return write({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "unknown session" } });
      }
      prompt(msg.id, msg.params);
      return;
    default:
      if (msg.id !== undefined) write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found: " + msg.method } });
  }
}

process.stderr.write("fake-agent: ready\n");
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", handle);
rl.on("close", () => process.exit(0));
