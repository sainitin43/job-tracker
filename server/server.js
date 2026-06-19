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
// Allow the web app origin and the Chrome extension (chrome-extension://<id>).
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                       // curl / same-origin / service worker
    if (origin === ORIGIN || /^chrome-extension:\/\//.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: "12mb" })); // allow base64 resume files

const now = () => new Date().toISOString();
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

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
    datePosted: r.date_posted || "",
    addedAt: r.created_at || r.date_added || ""
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

/* ----------------------- applicant autofill ----------------------- */
// Best-known autofill fields derived from the user + their base resume.
function defaultApplicant(user) {
  const c = BASE_RESUME.contact || "";
  const phone = (c.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || [])[0] || "";
  const linkedin = (c.match(/linkedin\.com\/\S+/i) || [])[0] || "";
  const emailFromResume = (c.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0] || "";
  const loc = (c.split("|")[0] || "").trim();
  const [city = "", state = ""] = loc.split(",").map(s => s.trim());
  const fullName = user.name || BASE_RESUME.name || user.first_name || "";
  const tokens = fullName.split(/\s+/).filter(Boolean);
  const firstName = user.first_name || tokens[0] || "";
  const lastName = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  const recent = BASE_RESUME.experience[0] || {};
  return {
    firstName: "Sai Nithin", lastName: "P", fullName: "Sai Nithin P", preferredName: "",
    email: "mailmenithin1317@gmail.com",
    phone: phone || "(804) 484-5154",
    linkedin: "https://linkedin.com/in/nithin-1317-p",
    github: "", website: "",
    address: "2540 Baton Rogue Dr", mailingAddress: "2540 Baton Rogue Dr, San Jose, CA 95133",
    city: "San Jose", state: "CA", zip: "95133", country: "United States",
    location: "San Jose, CA",
    currentCompany: recent.company || "Walmart",
    currentTitle: recent.title || "Software Engineer III",
    yearsExperience: "5", totalExperienceYears: "5", androidExperienceYears: "2.5",
    workAuthorized: "Yes",
    requiresSponsorship: "Yes",
    willingToRelocate: "Yes",
    workArrangements: ["Onsite", "Hybrid", "Remote"],
    noticePeriod: "2 weeks",
    salaryExpectation: "$130,000",
    howHeard: "LinkedIn",
    pronoun: "He/Him",
    demographics: {
      gender: "Male", transgender: "No", sexualOrientation: "Heterosexual / Straight",
      hispanicLatino: "No", race: "Asian",
      veteranStatus: "Not a Veteran", disabilityStatus: "No, I do not have a disability",
      disability: "No"
    }
  };
}
function applicantPayload(user) {
  const { profile, answers } = store.getApplicant(user.id);
  return { profile: { ...defaultApplicant(user), ...profile }, answers: answers || {} };
}
app.get("/api/applicant", auth, (req, res) => res.json(applicantPayload(req.user)));
app.put("/api/applicant", auth, (req, res) => {
  const b = req.body || {};
  if (b.profile && typeof b.profile === "object") store.mergeApplicantProfile(req.user.id, b.profile);
  if (b.answers && typeof b.answers === "object") store.mergeApplicantAnswers(req.user.id, b.answers);
  res.json(applicantPayload(req.user));
});
// Claude agent: answer one or more unknown application questions using the
// applicant's profile + saved answer bank, and persist newly learned answers.
app.post("/api/ai/answer", auth, async (req, res) => {
  const b = req.body || {};
  const questions = Array.isArray(b.questions) ? b.questions : (b.question ? [b] : []);
  if (!questions.length) return res.status(400).json({ error: "No questions provided" });
  const { profile, answers } = applicantPayload(req.user);
  const ctx = { profile, answers, demographics: profile.demographics || {}, job: b.job || {} };

  // 1) Try the saved answer bank first (exact-ish key match).
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const bank = Object.entries(answers || {});
  function fromBank(q) {
    const nq = norm(q);
    let best = null;
    for (const [k, v] of bank) {
      const nk = norm(k);
      if (!nk) continue;
      if (nq.includes(nk) || nk.includes(nq)) { if (!best || nk.length > norm(best[0]).length) best = [k, v]; }
    }
    return best ? best[1] : null;
  }

  const out = {};
  const ask = [];
  for (const q of questions) {
    const text = q.question || q.q || "";
    const hit = fromBank(text);
    if (hit != null) out[text] = hit;
    else ask.push(q);
  }

  // 2) For the rest, ask Claude (if configured); else best-effort heuristic.
  if (ask.length && process.env.ANTHROPIC_API_KEY) {
    try {
      const prompt =
`You are filling a job application for this candidate. Use ONLY the candidate's real data; never invent employment, degrees, or numbers not supported below. For each question return the single best short answer to type or select. If the field offers options, choose the exact option text that fits. Be concise.

CANDIDATE PROFILE (JSON):
${JSON.stringify(ctx, null, 1)}

QUESTIONS (JSON array; each has question, optional type, optional options):
${JSON.stringify(ask, null, 1)}

Return ONLY a JSON object mapping each question string to its answer string. No commentary.`;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: prompt }] })
      });
      if (r.ok) {
        const data = await r.json();
        const raw = (data.content?.[0]?.text || "").trim().replace(/^```json\s*|\s*```$/g, "");
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) if (v != null && String(v).trim()) out[k] = String(v).trim();
      }
    } catch (e) { console.error("[ai/answer]", e.message); }
  }

  // 3) Persist any newly resolved answers back into the bank ("training").
  const learned = {};
  for (const [k, v] of Object.entries(out)) if (fromBank(k) == null) learned[k] = v;
  if (Object.keys(learned).length) store.mergeApplicantAnswers(req.user.id, learned);

  res.json({ answers: out, learned: Object.keys(learned) });
});

// Ad-hoc tailoring for ANY job (e.g. a random application page the extension is on,
// with no saved job). Builds a resume tailored + forced to 100% ATS for the given JD.
function jdFromBody(b) { return { title: b.title || "", company: b.company || "", description: b.description || b.jd || "" }; }
app.post("/api/ai/tailor", auth, async (req, res) => {
  const job = jdFromBody(req.body || {});
  const profile = profileFor(req.user, { searchTerm: job.title });
  const match = scoreMatch(job, profile);
  try {
    const { struct, text } = await buildTailoredResume(job, profile, match, { strong: true });
    const ats = atsScore((job.description || "") + " " + (job.title || ""), text).score;
    res.json({ ats, resume: text, resumeData: struct });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post("/api/ai/resume.pdf", auth, async (req, res) => {
  const job = jdFromBody(req.body || {});
  const profile = profileFor(req.user, { searchTerm: job.title });
  const match = scoreMatch(job, profile);
  const safe = s => (s || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "resume";
  try {
    const { struct } = await buildTailoredResume(job, profile, match, { strong: true });
    streamStructuredResumePdf(res, normalizeResume(struct), `${safe(req.user.first_name || "Nithin")}-${safe(job.company || "role")}-resume.pdf`);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// A default resume PDF for autofill before a specific job is saved.
app.get("/api/applicant/resume.pdf", auth, (req, res) => {
  const safe = s => (s || "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "resume";
  streamStructuredResumePdf(res, normalizeResume(BASE_RESUME), `${safe(req.user.first_name || BASE_RESUME.name)}-resume.pdf`);
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

// LIVE sourcing from public ATS job APIs (Greenhouse + Lever): real postings with
// full JD, the exact apply URL, and a job id. No static/mock data.
const GH_BOARDS = { xai:["xAI","x.ai"], anthropic:["Anthropic","anthropic.com"], thenewyorktimes:["The New York Times","nytimes.com"], oura:["Oura","ouraring.com"], monzo:["Monzo","monzo.com"], angi:["Angi","angi.com"], versaterm:["Versaterm","versaterm.com"], robinhood:["Robinhood","robinhood.com"], reddit:["Reddit","reddit.com"], plaid:["Plaid","plaid.com"], affirm:["Affirm","affirm.com"], lyft:["Lyft","lyft.com"], doordash:["DoorDash","doordash.com"], intercom:["Intercom","intercom.com"], coinbase:["Coinbase","coinbase.com"], dropbox:["Dropbox","dropbox.com"], gusto:["Gusto","gusto.com"], strava:["Strava","strava.com"], faire:["Faire","faire.com"] };
const LEVER_BOARDS = { matchgroup:["Match Group","matchgroup.com"], wealthfront:["Wealthfront","wealthfront.com"], bumbleinc:["Bumble","bumble.com"], finix:["Finix","finix.com"], plaid:["Plaid","plaid.com"] };
function stripHtml(s){
  return String(s||"")
    // 1) decode HTML entities FIRST (Greenhouse content is entity-encoded)
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&nbsp;/g," ")
    .replace(/&#39;|&rsquo;|&apos;/g,"'").replace(/&quot;|&ldquo;|&rdquo;/g,'"').replace(/&#8211;|&ndash;/g,"-").replace(/&#?\w+;/g," ")
    // 2) turn block tags into line breaks, then strip all remaining tags
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|br)[^>]*>/gi,"\n").replace(/<li[^>]*>/gi,"\n• ").replace(/<[^>]+>/g," ")
    .replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim();
}
function wantTitle(t, cat){ t=(t||"").toLowerCase(); if(cat==="java") return /(java|spring|backend)/.test(t) && !/(android|kotlin|ios|frontend|front-end|data|ml)/.test(t); return /(android|kotlin)/.test(t); }
async function ghJobs(slug,name,domain,cat){ try{
  const r=await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,{signal:AbortSignal.timeout(7000)});
  if(!r.ok) return []; const d=await r.json();
  return (d.jobs||[]).filter(j=>wantTitle(j.title,cat)).map(j=>({company:name,domain,title:j.title,location:(j.location&&j.location.name)||"Remote",url:j.absolute_url,jobId:String(j.id),source:"greenhouse",datePosted:(j.updated_at||"").slice(0,10),description:stripHtml(j.content).slice(0,4000)}));
}catch(e){return [];} }
async function leverJobs(slug,name,domain,cat){ try{
  const r=await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`,{signal:AbortSignal.timeout(7000)});
  if(!r.ok) return []; const d=await r.json();
  return (Array.isArray(d)?d:[]).filter(j=>wantTitle(j.text,cat)).map(j=>({company:name,domain,title:j.text,location:(j.categories&&j.categories.location)||"Remote",url:j.hostedUrl||j.applyUrl,jobId:String(j.id),source:"lever",datePosted:j.createdAt?new Date(j.createdAt).toISOString().slice(0,10):"",description:stripHtml(j.descriptionPlain||j.description).slice(0,4000)}));
}catch(e){return [];} }
function domainFromName(co){ return String(co||"").toLowerCase().replace(/[^a-z0-9]/g,"") + ".com"; }
function withTimeout(p, ms){ return Promise.race([p, new Promise(r=>setTimeout(()=>r([]), ms))]); }
// Senior-or-below only — drop Staff/Lead/Principal/Director/Manager/VP/Head/Intern.
function seniorityOk(t){ t=(t||"").toLowerCase();
  return !/\b(staff|lead|principal|director|manager|head of|vp|vice president|architect|distinguished|fellow|intern|internship|apprentice)\b/.test(t); }
// Requires sponsorship — drop US-citizen / green-card / clearance / no-sponsorship roles.
function sponsorshipOk(desc){ const d=(desc||"").toLowerCase();
  const bad=[/u\.?\s?s\.?\s*citizen/, /us citizenship/, /must be a citizen/, /green\s*card/, /permanent resident/, /\bgc holder\b/,
    /without (visa )?sponsorship/, /no (visa )?sponsorship/, /not (able to|provide|offer) sponsor/, /unable to sponsor/, /do(es)? not (provide|offer)? ?sponsor/,
    /security clearance/, /\bclearance\b/, /\bitar\b/, /public trust/, /must be authorized to work .* without/];
  return !bad.some(rx=>rx.test(d)); }
// Use Claude to analyze each role: keep only Android/Java, Senior-or-below, sponsorship-friendly.
async function analyzeRoles(list){
  if(!process.env.ANTHROPIC_API_KEY || !list.length) return list.map(j=>({...j,_keep:true}));
  const batch=list.slice(0,30);
  const compact=batch.map((j,i)=>({i,title:j.title,company:j.company,jd:(j.description||"").slice(0,700)}));
  const prompt=`Screen these software jobs for a candidate who: is an Android & Java engineer; is SENIOR level or below (NOT Staff/Lead/Principal/Director/Manager); and REQUIRES visa sponsorship (cannot take roles requiring US citizenship, a green card, or security clearance, or that explicitly offer no sponsorship).
For EACH job set keep=true ONLY if ALL hold: (1) it is an Android or Java/backend software-engineering role; (2) seniority is Senior or below; (3) it does NOT require US citizenship/green card/clearance and does not say "no sponsorship".
Return ONLY a JSON array: [{"i":<index>,"keep":true|false,"reason":"<=8 words"}]. Jobs:
${JSON.stringify(compact)}`;
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||"claude-sonnet-4-6",max_tokens:1500,messages:[{role:"user",content:prompt}]})});
    if(r.ok){const d=await r.json();const raw=(d.content?.[0]?.text||"").trim().replace(/^```json\s*|\s*```$/g,"");const arr=JSON.parse(raw);
      const map={}; arr.forEach(x=>{map[x.i]={keep:x.keep,reason:x.reason};});
      return list.map((j,idx)=>({...j,_keep: idx<30 ? !!(map[idx]&&map[idx].keep) : true, note:(map[idx]&&map[idx].reason)||j.note||""}));
    }
  }catch(e){console.error("[analyzeRoles]",e.message);}
  return list.map(j=>({...j,_keep:true}));
}
app.post("/api/discover/live", auth, async (req, res) => {
  const cat = (req.body && req.body.cat) || "android";
  const tasks = [];
  for (const [slug,[name,domain]] of Object.entries(GH_BOARDS)) tasks.push(ghJobs(slug,name,domain,cat));
  for (const [slug,[name,domain]] of Object.entries(LEVER_BOARDS)) tasks.push(leverJobs(slug,name,domain,cat));
  // LinkedIn / Indeed / Dice via Apify (capped so the request can't hang).
  if (discover.apifyEnabled && discover.apifyEnabled()) {
    tasks.push(withTimeout((async()=>{ try{
      const api=await discover.fetchJobs({ searchTerm: cat==="java"?"Java Software Engineer":"Android Engineer", location:"United States", sites:["linkedin","indeed","dice"], maxResults:40, linkedinFetchDescription:true });
      return api.map(j=>({company:j.company,domain:domainFromName(j.company),title:j.title,location:j.location||"Remote",url:j.url,jobId:String(j.id||""),source:j.source||"linkedin",datePosted:(j.datePosted||"").slice(0,10),description:j.description||""}));
    }catch(e){ console.warn("[apify]",e.message); return []; } })(), 75000));
  }
  let all=(await Promise.all(tasks)).flat();
  // hard filters: must have a JD, be Android/Java, Senior-or-below, sponsorship-friendly
  all=all.filter(j=> j.description && j.description.length>120 && wantTitle(j.title,cat) && seniorityOk(j.title) && sponsorshipOk(j.description));
  // de-dupe
  const seen=new Set(); all=all.filter(j=>{const k=(j.company+"|"+j.title).toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;});
  // Claude analysis pass
  const analyzed=await analyzeRoles(all);
  const kept=analyzed.filter(j=>j._keep).map(({_keep,...j})=>j);
  res.json({ jobs: kept.slice(0, 60) });
});

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
