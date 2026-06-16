import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import db from "./db.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: "12mb" })); // allow base64 resume files

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/* ----------------------------- helpers ----------------------------- */
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
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
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
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(mail);
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const user = {
    id: crypto.randomUUID(),
    email: mail,
    first_name: firstName.trim(),
    password: bcrypt.hashSync(password, 10),
    provider: "local",
    created_at: now()
  };
  db.prepare(
    "INSERT INTO users (id, email, first_name, password, provider, created_at) VALUES (@id,@email,@first_name,@password,@provider,@created_at)"
  ).run(user);

  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!isEmail(email) || !password) return res.status(400).json({ error: "Email and password are required" });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------ jobs ------------------------------- */
app.get("/api/jobs", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json({ jobs: rows.map(rowToJob) });
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
  db.prepare(`INSERT INTO jobs
    (id,user_id,company,title,url,location,type,pay,status,date_added,date_applied,description,resume,resume_file,resume_name,resume_type,created_at)
    VALUES (@id,@user_id,@company,@title,@url,@location,@type,@pay,@status,@date_added,@date_applied,@description,@resume,@resume_file,@resume_name,@resume_type,@created_at)`
  ).run(job);
  res.status(201).json({ job: rowToJob(job) });
});

app.put("/api/jobs/:id", auth, (req, res) => {
  const existing = db.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const b = req.body || {};
  const merged = {
    ...existing,
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
  db.prepare(`UPDATE jobs SET
    company=@company,title=@title,url=@url,location=@location,type=@type,pay=@pay,status=@status,
    date_applied=@date_applied,description=@description,resume=@resume,resume_file=@resume_file,
    resume_name=@resume_name,resume_type=@resume_type
    WHERE id=@id AND user_id=@user_id`
  ).run(merged);
  res.json({ job: rowToJob(merged) });
});

app.delete("/api/jobs/:id", auth, (req, res) => {
  const info = db.prepare("DELETE FROM jobs WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Job not found" });
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Job Tracker API running on http://localhost:${PORT} (CORS origin: ${ORIGIN})`);
});
