// Tiny zero-dependency JSON-file persistence (no native modules).
// Data is stored in server/data.json: { users: [...], jobs: [...] }
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets a host mount a persistent disk (e.g. /data) so data survives redeploys.
const DATA_DIR = process.env.DATA_DIR || __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
const DB_FILE = path.join(DATA_DIR, "data.json");

let data = { users: [], jobs: [], discover: {}, recruiters: {} };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      data = { users: parsed.users || [], jobs: parsed.jobs || [], discover: parsed.discover || {}, recruiters: parsed.recruiters || {} };
    }
  } catch (e) {
    console.error("Failed to read data.json, starting empty:", e.message);
    data = { users: [], jobs: [], discover: {}, recruiters: {} };
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
export function updateUser(id, patch) {
  const u = getUserById(id);
  if (!u) return null;
  Object.assign(u, patch);
  save();
  return u;
}
export function allUsers() {
  return data.users.slice();
}

/* applicant autofill profile + learned answer bank (per user) */
export function getApplicant(userId) {
  const u = getUserById(userId);
  return { profile: (u && u.applicant_profile) || {}, answers: (u && u.applicant_answers) || {} };
}
export function mergeApplicantProfile(userId, fields) {
  const u = getUserById(userId);
  if (!u) return null;
  u.applicant_profile = { ...(u.applicant_profile || {}), ...fields };
  save();
  return u.applicant_profile;
}
export function mergeApplicantAnswers(userId, answers) {
  const u = getUserById(userId);
  if (!u) return null;
  u.applicant_answers = { ...(u.applicant_answers || {}), ...answers };
  save();
  return u.applicant_answers;
}

/* discover (per-user job search prefs + fetched matches) */
const DEFAULT_PREFS = {
  searchTerm: "Software Engineer",
  location: "United States",
  sites: ["linkedin", "indeed", "glassdoor"],
  maxResults: 10,
  isRemote: false,
  techs: []
};
export function getDiscover(userId) {
  if (!data.discover[userId]) {
    data.discover[userId] = { prefs: { ...DEFAULT_PREFS }, jobs: [], lastRefreshedAt: null, refreshing: false };
  }
  return data.discover[userId];
}
export function setDiscoverPrefs(userId, prefs) {
  const d = getDiscover(userId);
  d.prefs = { ...d.prefs, ...prefs };
  save();
  return d.prefs;
}
export function setDiscoverJobs(userId, jobs) {
  const d = getDiscover(userId);
  d.jobs = jobs;
  d.lastRefreshedAt = new Date().toISOString();
  save();
  return d;
}
export function setRefreshing(userId, val) {
  const d = getDiscover(userId);
  d.refreshing = !!val;
  save();
}

/* recruiter hiring posts (per-user) */
const DEFAULT_RECRUITER_PREFS = {
  jobRoles: ["Software Engineer"],
  locations: ["United States"],
  keywords: [],
  maxResults: 10
};
export function getRecruiters(userId) {
  if (!data.recruiters[userId]) {
    data.recruiters[userId] = { prefs: { ...DEFAULT_RECRUITER_PREFS }, posts: [], lastRefreshedAt: null, refreshing: false };
  }
  return data.recruiters[userId];
}
export function setRecruiterPrefs(userId, prefs) {
  const d = getRecruiters(userId);
  d.prefs = { ...d.prefs, ...prefs };
  save();
  return d.prefs;
}
export function setRecruiterPosts(userId, posts) {
  const d = getRecruiters(userId);
  d.posts = posts;
  d.lastRefreshedAt = new Date().toISOString();
  save();
  return d;
}
export function setRecruiterRefreshing(userId, val) {
  const d = getRecruiters(userId);
  d.refreshing = !!val;
  save();
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
