// Tiny zero-dependency JSON-file persistence (no native modules).
// Data is stored in server/data.json: { users: [...], jobs: [...] }
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, "data.json");

let data = { users: [], jobs: [] };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      data = { users: parsed.users || [], jobs: parsed.jobs || [] };
    }
  } catch (e) {
    console.error("Failed to read data.json, starting empty:", e.message);
    data = { users: [], jobs: [] };
  }
}
function save() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic write
}
load();

/* users */
export function getUserByEmail(email) {
  return data.users.find(u => u.email === email) || null;
}
export function getUserById(id) {
  return data.users.find(u => u.id === id) || null;
}
export function addUser(user) {
  data.users.push(user);
  save();
  return user;
}

/* jobs */
export function getJobsByUser(userId) {
  return data.jobs
    .filter(j => j.user_id === userId)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}
export function getJob(id, userId) {
  return data.jobs.find(j => j.id === id && j.user_id === userId) || null;
}
export function addJob(job) {
  data.jobs.push(job);
  save();
  return job;
}
export function updateJob(id, userId, patch) {
  const job = getJob(id, userId);
  if (!job) return null;
  Object.assign(job, patch);
  save();
  return job;
}
export function deleteJob(id, userId) {
  const before = data.jobs.length;
  data.jobs = data.jobs.filter(j => !(j.id === id && j.user_id === userId));
  const changed = data.jobs.length !== before;
  if (changed) save();
  return changed;
}
