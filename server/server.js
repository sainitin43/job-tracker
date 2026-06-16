import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import * as store from "./store.js";
import * as discover from "./discover.js";
import { scoreMatch, tailorResume } from "./tailor.js";

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
    resumeFileType: r.resume_type || ""
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
  const job = {
    id: crypto.randomUUID(),
    user_id: req.user.id,
    company: b.company.trim(),
    title: b.title.trim(),
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
    created_at: now()
  };
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
    resume_type: b.resumeFileType ?? existing.resume_type
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

async function refreshDiscover(user) {
  const d = store.getDiscover(user.id);
  store.setRefreshing(user.id, true);
  try {
    const raw = await discover.fetchJobs(d.prefs);
    const profile = profileFor(user, d.prefs);
    const enriched = raw
      .map(job => {
        const match = scoreMatch(job, profile);
        return { ...job, score: match.score, matched: match.matched, resume: tailorResume(job, profile, match) };
      })
      .sort((a, b) => b.score - a.score);
    store.setDiscoverJobs(user.id, enriched);
    return enriched;
  } finally {
    store.setRefreshing(user.id, false);
  }
}

app.get("/api/discover", auth, (req, res) => {
  const d = store.getDiscover(req.user.id);
  res.json({
    enabled: discover.apifyEnabled(),
    prefs: d.prefs,
    jobs: d.jobs,
    lastRefreshedAt: d.lastRefreshedAt,
    refreshing: d.refreshing
  });
});

app.put("/api/discover/prefs", auth, (req, res) => {
  const prefs = store.setDiscoverPrefs(req.user.id, req.body || {});
  res.json({ prefs });
});

app.post("/api/discover/refresh", auth, async (req, res) => {
  if (!discover.apifyEnabled()) {
    return res.status(400).json({ error: "Job fetching isn't configured. Add APIFY_TOKEN to the server .env." });
  }
  if (req.body && Object.keys(req.body).length) store.setDiscoverPrefs(req.user.id, req.body);
  try {
    const jobs = await refreshDiscover(req.user);
    res.json({ jobs, lastRefreshedAt: store.getDiscover(req.user.id).lastRefreshedAt });
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
    if (!d.lastRefreshedAt && !d.prefs) continue; // only users who've set up discover
    try {
      console.log(`[cron] refreshing discover for ${u.email}…`);
      await refreshDiscover(u);
    } catch (e) {
      console.error(`[cron] refresh failed for ${u.email}:`, e.message);
    }
  }
}
if (discover.apifyEnabled()) {
  setInterval(refreshAllUsers, TWO_HOURS);
  console.log("[cron] auto-refresh scheduled every 2 hours");
}
