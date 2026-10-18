// The child side of child_echo: reads lines from stdin, writes each back to stdout
// with the prefix "echo:". Ends (exit code 0) when stdin is closed.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  process.stdout.write("echo:" + line + "\n");
});
rl.on("close", () => {
  process.exit(0);
});
