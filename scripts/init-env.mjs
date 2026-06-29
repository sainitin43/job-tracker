// Creates server/.env from server/.env.example on first run, injecting a random
// JWT_SECRET so the app works immediately. Never overwrites an existing .env.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "server", ".env");
const examplePath = path.join(root, "server", ".env.example");

if (fs.existsSync(envPath)) {
  console.log("✓ server/.env already exists — keeping your keys untouched.");
  process.exit(0);
}
let tpl = fs.readFileSync(examplePath, "utf8");
tpl = tpl.replace(/^JWT_SECRET=.*$/m, "JWT_SECRET=" + crypto.randomBytes(32).toString("hex"));
fs.writeFileSync(envPath, tpl);
console.log("✓ Created server/.env with a random JWT_SECRET.");
console.log("  The app runs now with FREE job discovery + heuristic résumés.");
console.log("  To unlock Claude AI tailoring and LinkedIn/Indeed jobs, paste your");
console.log("  ANTHROPIC_API_KEY and APIFY_TOKEN into server/.env, then restart.");
