import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const target = ".dev.vars";
const backup = ".dev.vars.user-backup";
const hadFile = existsSync(target);
if (hadFile) renameSync(target, backup);
const previous = hadFile ? readFileSync(backup, "utf8").replace(/\n?SCI_BRIDGE_MOCK=.*\n?/g, "\n").replace(/\n?AUTH_DISABLED=.*\n?/g, "\n") : "";
writeFileSync(target, `${previous.trim()}\nSCI_BRIDGE_MOCK=1\nAUTH_DISABLED=true\n`);

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (hadFile) renameSync(backup, target);
  else unlinkSync(target);
}

const proc = globalThis.process;
const child = spawn("npx", ["vite", "dev", "--port", "3000"], {
  stdio: "inherit",
  shell: true,
  env: { ...proc.env, SCI_BRIDGE_LOCAL: "1" },
});
const stop = (code) => {
  restore();
  proc.exit(code ?? 0);
};
proc.on("SIGINT", () => {
  child.kill("SIGINT");
});
proc.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
child.on("exit", stop);
