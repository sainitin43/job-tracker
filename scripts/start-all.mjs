// Runs the backend (Express, :4000) and the frontend (Vite, :5173) together.
// Cross-platform, zero extra dependencies. Ctrl+C stops both.
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, args, cwd, color) {
  const p = spawn(npm, args, { cwd, shell: process.platform === "win32" });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (src) => src.on("data", (d) => process.stdout.write(d.toString().split("\n").map(l => l ? tag + l : l).join("\n")));
  pipe(p.stdout); pipe(p.stderr);
  p.on("exit", (code) => { console.log(tag + "exited (" + code + ")"); shutdown(); });
  return p;
}
const procs = [];
function shutdown() { procs.forEach(p => { try { p.kill(); } catch (e) {} }); process.exit(0); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Starting Job Tracker — backend :4000, frontend :5173 (Ctrl+C to stop)\n");
procs.push(run("api", ["run", "dev"], path.join(root, "server"), 36));   // cyan
procs.push(run("web", ["run", "dev"], root, 35));                          // magenta
