// Runs stdin_read.exe in both modes with a stdin that stays open and silent; prints what the program prints.
//   node run.mjs        (after: nova build stdin_read.nv)
import { spawn } from "node:child_process";
for (const mode of ["plain", "blocking"]) {
  await new Promise((resolve) => {
    const p = spawn("./stdin_read.exe", [mode], { stdio: ["pipe", "pipe", "inherit"] });
    p.stdout.on("data", (d) => process.stdout.write(d));
    p.on("exit", () => resolve());
    setTimeout(() => p.kill(), 20000);
  });
}
