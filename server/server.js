import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import * as store from "./store.js";
import * as discover from "./discover.js";
import { scoreMatch, tailorResumeSmart } from "./tailor.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: "12mb" })); // allow base64 resume files

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}
function publicUser(u) {
  return { id: u.id, email: u.email, firstName: u.first_name, provider: u.provider };
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = store.getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
const isEmail = e => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function rowToJob(r) {
  return {
    id: r.id,
    company: r.company,
    title: r.title,
    url: r.url || "",
    location: r.location || "",
    type: r.type || "Full-time",
    pay: r.pay || "",
    status: r.status || "Applied",
    dateAdded: r.date_added || "",
    dateApplied: r.date_applied || "",
    description: r.description || "",
    resume: r.resume || "",
    resumeFile: r.resume_file || null,
    resumeFileName: r.resume_name || "",
    resumeFileType: r.resume_type || "",
    favourite: !!r.favourite,
    score: typeof r.score === "number" ? r.score : null,
    source: r.source || ""
  };
}

function makeJobRow(b, userId) {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    company: (b.company || "").trim(),
    title: (b.title || "").trim(),
    url: b.url || "",
    location: b.location || "",
    type: b.type || "Full-time",
    pay: b.pay || "",
    status: b.status || "Applied",
    date_added: b.dateAdded || today(),
    date_applied: b.dateApplied || "",
    description: b.description || "",
    resume: b.resume || "",
    resume_file: b.resumeFile || null,
    resume_name: b.resumeFileName || "",
    resume_type: b.resumeFileType || "",
    favourite: !!b.favourite,
    score: typeof b.score === "number" ? b.score : null,
    source: b.source || "",
    created_at: now()
  };
}

/* ------------------------------ auth ------------------------------- */
app.post("/api/auth/signup", (req, res) => {
  const { firstName, email, password } = req.body || {};
  if (!firstName?.trim()) return res.status(400).json({ error: "First name is required" });
  if (!isEmail(email)) return res.status(400).json({ error: "Valid email is required" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const mail = email.trim().toLowerCase();
  if (store.getUserByEmail(mail)) return res.status(409).json({ error: "An account with this email already exists" });

  const user = {
    id: crypto.randomUUID(),
    email: mail,
    first_name: firstName.trim(),
    password: bcrypt.hashSync(password, 10),
    provider: "local",
    created_at: now()
  };
  store.addUser(user);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!isEmail(email) || !password) return res.status(400).json({ error: "Email and password are required" });
  const user = store.getUserByEmail(email.trim().toLowerCase());
  if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: "Missing Google credential" });
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!r.ok) return res.status(401).json({ error: "Invalid Google token" });
    const info = await r.json();
    if (process.env.GOOGLE_CLIENT_ID && info.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: "Google token audience mismatch" });
    }
    const mail = (info.email || "").toLowerCase();
    if (!mail) return res.status(401).json({ error: "No email in Google token" });
    let user = store.getUserByEmail(mail);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: mail,
        first_name: info.given_name || (info.name || mail).split(" ")[0] || mail,
        password: null,
        provider: "google",
        created_at: now()
      };
      store.addUser(user);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Google verification failed" });
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------ jobs ------------------------------- */
app.get("/api/jobs", auth, (req, res) => {
  res.json({ jobs: store.getJobsByUser(req.user.id).map(rowToJob) });
});

app.post("/api/jobs", auth, (req, res) => {
  const b = req.body || {};
  if (!b.company?.trim() || !b.title?.trim()) {
    return res.status(400).json({ error: "Company and job title are required" });
  }
  const job = makeJobRow(b, req.user.id);
  store.addJob(job);
  res.status(201).json({ job: rowToJob(job) });
});

app.put("/api/jobs/:id", auth, (req, res) => {
  const existing = store.getJob(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const b = req.body || {};
  const patch = {
    company: b.company ?? existing.company,
    title: b.title ?? existing.title,
    url: b.url ?? existing.url,
    location: b.location ?? existing.location,
    type: b.type ?? existing.type,
    pay: b.pay ?? existing.pay,
    status: b.status ?? existing.status,
    date_applied: b.dateApplied ?? existing.date_applied,
    description: b.description ?? existing.description,
    resume: b.resume ?? existing.resume,
    resume_file: b.resumeFile !== undefined ? b.resumeFile : existing.resume_file,
    resume_name: b.resumeFileName ?? existing.resume_name,
    resume_type: b.resumeFileType ?? existing.resume_type,
    favourite: b.favourite !== undefined ? !!b.favourite : existing.favourite,
    score: b.score !== undefined ? b.score : existing.score,
    source: b.source ?? existing.source
  };
  const updated = store.updateJob(req.params.id, req.user.id, patch);
  res.json({ job: rowToJob(updated) });
});

app.delete("/api/jobs/:id", auth, (req, res) => {
  const ok = store.deleteJob(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: "Job not found" });
  res.json({ ok: true });
});

/* ---------------------------- profile ----------------------------- */
app.get("/api/profile", auth, (req, res) => {
  const u = req.user;
  res.json({ profile: { name: u.name || u.first_name, baseResume: u.base_resume || "", skills: u.skills || [] } });
});
app.put("/api/profile", auth, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.baseResume !== undefined) patch.base_resume = b.baseResume;
  if (b.skills !== undefined) patch.skills = Array.isArray(b.skills) ? b.skills : [];
  store.updateUser(req.user.id, patch);
  res.json({ ok: true });
});

/* --------------------------- discover ----------------------------- */
function profileFor(user, prefs) {
  return {
    name: user.name || user.first_name,
    baseResume: user.base_resume || "",
    skills: user.skills || [],
    searchTerm: prefs.searchTerm
  };
}

// Fetch fresh jobs, keep good fits, tailor a resume (LLM), and add them as
// "Not Applied" jobs for the user. Dedupes by URL. Returns count added.
const MIN_SCORE = 35;     // a job must score at least this to be added
const MAX_NEW = 8;        // cap new jobs per run (controls Apify + LLM cost)

async function findAndCreateJobs(user) {
  const d = store.getDiscover(user.id);
  store.setRefreshing(user.id, true);
  try {
    const raw = await discover.fetchJobs(d.prefs);
    const profile = profileFor(user, d.prefs);
    const existingUrls = new Set(
      store.getJobsByUser(user.id).map(j => (j.url || "").toLowerCase()).filter(Boolean)
    );
    const scored = raw
      .map(job => ({ job, match: scoreMatch(job, profile) }))
      .filter(x => x.match.score >= MIN_SCORE)
      .sort((a, b) => b.match.score - a.match.score);

    let added = 0;
    for (const { job, match } of scored) {
      if (added >= MAX_NEW) break;
      const u = (job.url || "").toLowerCase();
      if (u && existingUrls.has(u)) continue;
      const resume = await tailorResumeSmart(job, profile, match);
      store.addJob(makeJobRow({
        company: job.company, title: job.title, url: job.url, location: job.location,
        type: job.type, pay: job.pay, status: "Not Applied", description: job.description,
        resume, favourite: false, score: match.score, source: job.source
      }, user.id));
      if (u) existingUrls.add(u);
      added++;
    }
    store.setDiscoverJobs(user.id, []); // we now store fits as real jobs, not a separate list
    return added;
  } finally {
    store.setRefreshing(user.id, false);
  }
}

app.get("/api/discover", auth, (req, res) => {
  const d = store.getDiscover(req.user.id);
  res.json({ enabled: discover.apifyEnabled(), prefs: d.prefs, lastRefreshedAt: d.lastRefreshedAt, refreshing: d.refreshing });
});

app.put("/api/discover/prefs", auth, (req, res) => {
  res.json({ prefs: store.setDiscoverPrefs(req.user.id, req.body || {}) });
});

app.post("/api/discover/refresh", auth, async (req, res) => {
  if (!discover.apifyEnabled()) {
    return res.status(400).json({ error: "Job fetching isn't configured. Add APIFY_TOKEN to the server .env." });
  }
  if (req.body && Object.keys(req.body).length) store.setDiscoverPrefs(req.user.id, req.body);
  try {
    const added = await findAndCreateJobs(req.user);
    res.json({ added, jobs: store.getJobsByUser(req.user.id).map(rowToJob), lastRefreshedAt: store.getDiscover(req.user.id).lastRefreshedAt });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, apify: discover.apifyEnabled() }));

app.listen(PORT, () => {
  console.log(`Job Tracker API running on http://localhost:${PORT} (CORS origin: ${ORIGIN})`);
  console.log(`Apify job fetching: ${discover.apifyEnabled() ? "enabled" : "disabled (set APIFY_TOKEN to enable)"}`);
});

/* ---------------- 2-hour auto-refresh (local cron) ---------------- */
const TWO_HOURS = 2 * 60 * 60 * 1000;
async function refreshAllUsers() {
  if (!discover.apifyEnabled()) return;
  for (const u of store.allUsers()) {
    const d = store.getDiscover(u.id);
    if (!d.lastRefreshedAt) continue; // only users who've run a search at least once
    try {
      const added = await findAndCreateJobs(u);
      console.log(`[cron] ${u.email}: added ${added} new tailored jobs`);
    } catch (e) {
      console.error(`[cron] failed for ${u.email}:`, e.message);
    }
  }
}
if (discover.apifyEnabled()) {
  setInterval(refreshAllUsers, TWO_HOURS);
  console.log("[cron] auto-refresh scheduled every 2 hours");
}
