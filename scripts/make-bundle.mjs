// Creates a portable zip of the whole project INCLUDING server/.env (your keys)
// for moving your exact working setup to another machine you own.
// DO NOT upload this zip anywhere public — it contains your secrets.
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "..", "job-tracker-bundle.zip");
if (fs.existsSync(out)) fs.rmSync(out);

// Exclude heavy/regenerable dirs; KEEP server/.env and data.json.
const excludes = ["node_modules/*", "*/node_modules/*", "dist/*", ".git/*", "*.log"];
const exArgs = excludes.map(e => `-x '${e}'`).join(" ");
console.log("Zipping project (with server/.env) → " + out);
execSync(`cd '${root}' && zip -r '${out}' . ${exArgs}`, { stdio: "inherit" });
console.log("\n✓ Bundle ready: " + out);
console.log("  Move it to the other machine (AirDrop/USB/scp — NOT a public site),");
console.log("  unzip, then run:  npm run setup && npm start");
console.log("  ⚠ This zip contains your API keys — keep it private.");
