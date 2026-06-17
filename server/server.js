import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import * as store from "./store.js";
import * as discover from "./discover.js";
import { scoreMatch, buildTailoredResume, atsScore, coldOutreach, analyzeGap, fillGap, normalizeResume, coverLetter } from "./tailor.js";
import { streamStructuredResumePdf, resumePdfBuffer, coverLetterPdfBuffer } from "./resumePdf.js";
import { makeZip } from "./zip.js";
import { BASE_RESUME, resumeToText } from "./resumeTemplate.js";
import * as recruiters from "./recruiters.js";

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
  // Single source of truth: when a structured resume exists, the on-screen
  // text, the PDF, and the ATS score all derive from the same normalized
  // struct, so they can never disagree.
  const normalized = r.resume_data ? normalizeResume(r.resume_data) : null;
  const resumeText = normalized ? resumeToText(normalized) : (r.resume || "");
  const ats = normalized
    ? atsScore(`${r.description || ""} ${r.title || ""}`, resumeText).score
    : (typeof r.ats === "number" ? r.ats : null);
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
    resume: resumeText,
    resumeData: normalized,
    resumeFile: r.resume_file || null,
    resumeFileName: r.resume_name || "",
    resumeFileType: r.resume_type || "",
    favourite: !!r.favourite,
    score: typeof r.score === "number" ? r.score : null,
    ats,
    source: r.source || "",
    datePosted: r.date_posted || ""
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
    resume_data: b.resumeData || null,
    resume_file: b.resumeFile || null,
    resume_name: b.resumeFileName || "",
    resume_type: b.resumeFileType || "",
    favourite: !!b.favourite,
    score: typeof b.score === "number" ? b.score : null,
    ats: typeof b.ats === "number" ? b.ats : null,
    source: b.source || "",
    date_posted: b.datePosted || "",
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
    resume_data: b.resumeData !== undefined ? b.resumeData : existing.resume_data,
    ats: b.ats !== undefined ? b.ats : existing.ats,
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

// Re-tailor: generate a fresh, stronger resume for this job WITHOUT saving.
// The client previews it and confirms (PUT) to persist, or discards.
app.post("/api/jobs/:id/retailor", auth, async (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const jobLike = { title: job.title, company: job.company, description: job.description || "" };
  const profile = profileFor(req.user, { searchTerm: job.title });
  const match = scoreMatch(jobLike, profile);
  try {
    const { struct, text } = await buildTailoredResume(jobLike, profile, match, { strong: true });
    const ats = atsScore(jobLike.description + " " + jobLike.title, text).score;
    res.json({ resume: text, resumeData: struct, ats, llm: !!process.env.ANTHROPIC_API_KEY });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ATS gap analysis: which JD keywords the current resume is missing / has.
app.post("/api/jobs/:id/atsgap", auth, (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const jobLike = { title: job.title, company: job.company, description: job.description || "" };
  const resumeText = resumeToText(normalizeResume(job.resume_data || BASE_RESUME));
  const gap = analyzeGap(jobLike, resumeText);
  res.json(gap); // { ats, present, missing }
});

// Fix ATS gaps: weave the missing keywords in and re-score (WITHOUT saving).
// Client previews before/after and confirms via PUT to persist.
app.post("/api/jobs/:id/atsfix", auth, async (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const jobLike = { title: job.title, company: job.company, description: job.description || "" };
  try {
    const r = await fillGap(jobLike, job.resume_data || BASE_RESUME);
    res.json({ resume: r.text, resumeData: r.struct, before: r.before, ats: r.ats, missingRemaining: r.missingRemaining, llm: r.llm });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Download the tailored resume as a formatted PDF (always in the base layout)
app.get("/api/jobs/:id/resume.pdf", auth, (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const safe = s => (s || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "resume";
  const resume = normalizeResume(job.resume_data || BASE_RESUME); // structured tailored, else base template
  streamStructuredResumePdf(res, resume, `${safe(job.company)}-${safe(job.title)}-resume.pdf`);
});

// Generate a tailored cover letter (does not persist).
app.post("/api/jobs/:id/coverletter", auth, async (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const jobLike = { title: job.title, company: job.company, location: job.location || "", description: job.description || "" };
  const profile = profileFor(req.user, { searchTerm: job.title });
  try {
    const r = await coverLetter(jobLike, profile);
    res.json(r); // { text, llm }
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Apply Kit: one zip with the tailored resume PDF, cover-letter PDF, and cold email.
app.get("/api/jobs/:id/applykit.zip", auth, async (req, res) => {
  const job = store.getJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const safe = s => (s || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "job";
  const base = `${safe(job.company)}-${safe(job.title)}`;
  const jobLike = { title: job.title, company: job.company, location: job.location || "", description: job.description || "" };
  const profile = profileFor(req.user, { searchTerm: job.title });
  try {
    const resumeStruct = normalizeResume(job.resume_data || BASE_RESUME);
    const [resumePdf, cl] = await Promise.all([
      resumePdfBuffer(resumeStruct),
      coverLetter(jobLike, profile)
    ]);
    const clPdf = await coverLetterPdfBuffer({ name: resumeStruct.name, contact: resumeStruct.contact, company: job.company, title: job.title, body: cl.text });
    const email = await coldOutreach({ company: job.company, role: job.title, text: job.description || "" }, profile, "email");

    const zip = makeZip([
      { name: `${base}-Resume.pdf`, data: resumePdf },
      { name: `${base}-Cover-Letter.pdf`, data: clPdf },
      { name: `${base}-Cold-Email.txt`, data: email }
    ]);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${base}-ApplyKit.zip"`);
    res.send(zip);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
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
      const { struct, text } = await buildTailoredResume(job, profile, match);
      const ats = atsScore(job.description, text).score;
      store.addJob(makeJobRow({
        company: job.company, title: job.title, url: job.url, location: job.location,
        type: job.type, pay: job.pay, status: "Not Applied", description: job.description,
        resume: text, resumeData: struct, favourite: false, score: match.score, ats, source: job.source, datePosted: job.datePosted
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

/* ----------------------- recruiter hiring posts ----------------------- */
async function refreshRecruiterPosts(user) {
  const d = store.getRecruiters(user.id);
  store.setRecruiterRefreshing(user.id, true);
  try {
    const raw = await recruiters.fetchRecruiterPosts(d.prefs);
    const baseProfile = { name: BASE_RESUME.name, baseResume: resumeToText(BASE_RESUME), skills: (user.skills || []) };
    const enriched = [];
    for (const post of raw) {
      const jobLike = { title: post.role || (d.prefs.jobRoles || [])[0] || "Software Engineer", company: post.company, description: post.text || "", location: post.location };
      const profile = { ...baseProfile, searchTerm: jobLike.title };
      const match = scoreMatch(jobLike, profile);
      const { struct, text } = await buildTailoredResume(jobLike, profile, match);
      const ats = atsScore(jobLike.description + " " + jobLike.title, text).score;
      const ctx = { recruiter: post.recruiter, company: post.company, role: jobLike.title, text: post.text };
      const emailDraft = await coldOutreach(ctx, profile, "email");
      const linkedinDraft = await coldOutreach(ctx, profile, "linkedin");
      enriched.push({ ...post, role: jobLike.title, resume: text, resumeData: struct, ats, emailDraft, linkedinDraft });
    }
    store.setRecruiterPosts(user.id, enriched);
    return enriched;
  } finally {
    store.setRecruiterRefreshing(user.id, false);
  }
}

app.get("/api/recruiters", auth, (req, res) => {
  const d = store.getRecruiters(req.user.id);
  res.json({ enabled: recruiters.recruitersEnabled(), prefs: d.prefs, posts: d.posts, lastRefreshedAt: d.lastRefreshedAt, refreshing: d.refreshing });
});
app.put("/api/recruiters/prefs", auth, (req, res) => {
  res.json({ prefs: store.setRecruiterPrefs(req.user.id, req.body || {}) });
});
app.post("/api/recruiters/refresh", auth, async (req, res) => {
  if (!recruiters.recruitersEnabled()) return res.status(400).json({ error: "Add APIFY_TOKEN to the server .env to fetch recruiter posts." });
  if (req.body && Object.keys(req.body).length) store.setRecruiterPrefs(req.user.id, req.body);
  try {
    const posts = await refreshRecruiterPosts(req.user);
    res.json({ posts, lastRefreshedAt: store.getRecruiters(req.user.id).lastRefreshedAt });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Download a recruiter-post tailored resume as PDF
app.get("/api/recruiters/:id/resume.pdf", auth, (req, res) => {
  const d = store.getRecruiters(req.user.id);
  const post = (d.posts || []).find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  const safe = s => (s || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "resume";
  streamStructuredResumePdf(res, post.resumeData || BASE_RESUME, `${safe(post.company || "recruiter")}-${safe(post.role)}-resume.pdf`);
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
