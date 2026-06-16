import { useEffect, useMemo, useState, useCallback } from "react";
import "./App.css";

/* ------------------------------------------------------------------ */
/* Backend-connected client. Talks to the local API (Express + JWT).  */
/* ------------------------------------------------------------------ */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "jt-token";

const GOOGLE_CLIENT_ID = "400407178471-aldf00pvmnsbo41lg8sfsvv1eip7mu0o.apps.googleusercontent.com";
function googleClientId() {
  return GOOGLE_CLIENT_ID || localStorage.getItem("jt-google-client-id") || "";
}

const today = () => new Date().toISOString().slice(0, 10);

const blankJob = {
  company: "", title: "", url: "", location: "", type: "Full-time", pay: "",
  status: "Applied", dateApplied: "", description: "",
  resume: "", resumeFile: null, resumeFileName: "", resumeFileType: ""
};

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------- API helper --------------------------- */
async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/* ----------------------- Google redirect flow --------------------- */
function signInWithGoogle() {
  const cid = googleClientId();
  if (!cid) { alert("Google sign-in isn't configured (missing client ID)."); return; }
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: "id_token",
    scope: "openid email profile",
    prompt: "select_account",
    nonce: Math.random().toString(36).slice(2) + Date.now()
  });
  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}
function takeGoogleCredentialFromUrl() {
  if (!window.location.hash || window.location.hash.indexOf("id_token=") === -1) return null;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const token = h.get("id_token");
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState("");

  const onAuthed = useCallback((tok, usr) => {
    localStorage.setItem(TOKEN_KEY, tok);
    setToken(tok);
    setUser(usr);
  }, []);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  // boot: handle google redirect, or validate existing token
  useEffect(() => {
    (async () => {
      const cred = takeGoogleCredentialFromUrl();
      if (cred) {
        try {
          const { token: tok, user: usr } = await api("/auth/google", { method: "POST", body: { credential: cred } });
          onAuthed(tok, usr);
        } catch (e) { setAuthError(e.message); }
        finally { setBooting(false); }
        return;
      }
      const existing = localStorage.getItem(TOKEN_KEY);
      if (existing) {
        try {
          const { user: usr } = await api("/auth/me", { token: existing });
          setUser(usr);
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      }
      setBooting(false);
    })();
  }, [onAuthed]);

  if (booting) {
    return <div className="bootWrap"><div className="spinner" /><p>Loading…</p></div>;
  }
  if (!user) {
    return <AuthScreen onAuthed={onAuthed} initialError={authError} />;
  }
  return <Tracker key={user.id} user={user} token={token} onLogout={logout} onAuthExpired={logout} />;
}

/* ------------------------------ Auth ------------------------------ */
function AuthScreen({ onAuthed, initialError }) {
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { token, user } = await api("/auth/signup", { method: "POST", body: { firstName, email, password } });
        onAuthed(token, user);
      } else {
        const { token, user } = await api("/auth/login", { method: "POST", body: { email, password } });
        onAuthed(token, user);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <div className="authWrap">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Job Application Tracker</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="authSub">Your applications are saved securely to your account.</p>

        <button type="button" className="googleBtn" onClick={signInWithGoogle}>
          <GoogleIcon /><span>Continue with Google</span>
        </button>

        <div className="authDivider"><span>or use email</span></div>

        <div className="authTabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
        </div>

        {mode === "signup" && (
          <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />

        {error && <p className="authError">{error}</p>}

        <button className="primary authSubmit" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
        <p className="authNote">Passwords are hashed on the server. Sessions use a secure token.</p>
      </form>
    </div>
  );
}

/* ---------------------------- Tracker ----------------------------- */
function Tracker({ user, token, onLogout, onAuthExpired }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blankJob);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback((path, opts = {}) => api(path, { ...opts, token }).catch(err => {
    if (/401|token/i.test(err.message)) onAuthExpired();
    throw err;
  }), [token, onAuthExpired]);

  // load jobs (with one-time migration of any old localStorage jobs for this email)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let { jobs: server } = await call("/jobs");
        if (server.length === 0) {
          const migrated = await migrateLocalJobs(user.email, call);
          if (migrated) ({ jobs: server } = await call("/jobs"));
        }
        setJobs(server);
        setSelectedId(server[0]?.id || null);
      } catch { /* handled in call */ }
      finally { setLoading(false); }
    })();
  }, [call, user.email]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter(j => {
      const textMatch =
        j.company.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) ||
        (j.description || "").toLowerCase().includes(q);
      return (statusFilter === "All" || j.status === statusFilter) && textMatch;
    });
  }, [jobs, search, statusFilter]);

  const stats = {
    total: jobs.length,
    applied: jobs.filter(j => j.status === "Applied").length,
    interviewing: jobs.filter(j => j.status === "Interviewing").length,
    offers: jobs.filter(j => j.status === "Offer").length
  };

  async function saveJob() {
    if (!draft.company.trim() || !draft.title.trim()) { alert("Company and job title are required."); return; }
    setBusy(true);
    try {
      if (editingId) {
        const { job } = await call(`/jobs/${editingId}`, { method: "PUT", body: draft });
        setJobs(prev => prev.map(j => j.id === editingId ? job : j));
        setSelectedId(job.id);
      } else {
        const { job } = await call("/jobs", { method: "POST", body: draft });
        setJobs(prev => [job, ...prev]);
        setSelectedId(job.id);
      }
      closeForm();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  function openAddForm() { setDraft({ ...blankJob }); setEditingId(null); setShowForm(true); }
  function closeForm() { setDraft({ ...blankJob }); setEditingId(null); setShowForm(false); }
  function editJob(job) { setDraft(job); setEditingId(job.id); setSelectedId(job.id); setShowForm(true); }

  async function deleteJob(id) {
    if (!confirm("Delete this job?")) return;
    try {
      await call(`/jobs/${id}`, { method: "DELETE" });
      setJobs(prev => {
        const next = prev.filter(j => j.id !== id);
        setSelectedId(s => (s === id ? next[0]?.id || null : s));
        return next;
      });
    } catch (e) { alert(e.message); }
  }

  function toggleExpand(id) { setExpandedId(prev => (prev === id ? null : id)); }
  function downloadResume(job) {
    if (!job?.resumeFile) return;
    const a = document.createElement("a");
    a.href = job.resumeFile; a.download = job.resumeFileName || "resume"; a.click();
  }
  function exportData() {
    download(`${user.firstName}-job-tracker-backup.json`, JSON.stringify(jobs, null, 2), "application/json");
  }

  function attachResume(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft(prev => ({ ...prev, resumeFile: reader.result, resumeFileName: file.name, resumeFileType: file.type || "application/octet-stream" }));
    reader.readAsDataURL(file);
  }
  function downloadAttachedResume() {
    if (!draft.resumeFile) return;
    const a = document.createElement("a");
    a.href = draft.resumeFile; a.download = draft.resumeFileName || "resume"; a.click();
  }
  function removeAttachedResume() {
    setDraft(prev => ({ ...prev, resumeFile: null, resumeFileName: "", resumeFileType: "" }));
  }
  function generateResume() {
    const resume = `YOUR NAME
Software Engineer

SUMMARY
Tailored for ${draft.company || "the company"}'s ${draft.title || "target"} role.

JOB DESCRIPTION KEYWORDS
${draft.description || "Paste the job description to customize keywords."}`;
    setDraft(prev => ({ ...prev, resume }));
  }

  const initials = (user.firstName || user.email).slice(0, 1).toUpperCase();

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal dashboard</p>
          <h1>{user.firstName}'s Jobs</h1>
          <p>Track Java/Kotlin roles, save resumes, and keep the full job description for every application.</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={openAddForm}>+ Add Job</button>
          <button onClick={exportData}>Export JSON</button>
          <div className="userChip" title={user.email}>
            <span className="avatar">{initials}</span>
            <span className="userName">{user.firstName}</span>
            <button className="logoutBtn" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </header>

      <section className="layout">
        <div className="left">
          <div className="stats">
            <Card label="Total Jobs" value={stats.total} />
            <Card label="Applied" value={stats.applied} />
            <Card label="Interviewing" value={stats.interviewing} />
            <Card label="Offers" value={stats.offers} />
          </div>

          <section className="panel">
            <div className="panelHead">
              <div>
                <h2>Applications</h2>
                <p>Use “View Description” to expand the complete job description for each role.</p>
              </div>
              <button className="primary" onClick={openAddForm}>+ Add Job</button>
            </div>

            <div className="filters">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, title, status, or description..." />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {["All", "Applied", "Interviewing", "Rejected", "Offer"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="jobList">
              {loading && <p className="emptyState">Loading your applications…</p>}
              {!loading && filtered.length === 0 && (
                <p className="emptyState">No applications yet. Click “+ Add Job” to get started.</p>
              )}

              {!loading && filtered.map(job => {
                const open = expandedId === job.id;
                return (
                  <div
                    key={job.id}
                    className={"jobCard" + (selectedId === job.id ? " selected" : "") + (open ? " expanded" : "")}
                    onClick={() => setSelectedId(job.id)}
                  >
                    <div className="jobCardHead">
                      <div className="jobCardInfo">
                        <div className="jobCardTitleRow">
                          <h3>{job.company}</h3>
                          <span className={"pill pill-" + job.status.toLowerCase()}>{job.status}</span>
                        </div>
                        <p className="jobRole">{job.title}</p>
                        <div className="jobMeta">
                          <span>📍 {job.location || "—"}</span>
                          <span>💼 {job.type}</span>
                          <span>💰 {job.pay || "—"}</span>
                          <span>🗓️ Applied {job.dateApplied || "—"}</span>
                          <span>{job.resumeFileName ? "📎 " + job.resumeFileName : "📎 No resume"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="jobCardActions">
                      <a className="btn ghost" href={job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>🔗 Open Posting</a>
                      <button className="btn" disabled={!job.resumeFile} onClick={e => { e.stopPropagation(); downloadResume(job); }}>⬇️ Download Resume</button>
                      <button className="btn" onClick={e => { e.stopPropagation(); editJob(job); }}>✏️ Edit</button>
                      <button className="btn danger" onClick={e => { e.stopPropagation(); deleteJob(job.id); }}>🗑️ Delete</button>
                      <button className={"btn expandToggle" + (open ? " active" : "")} onClick={e => { e.stopPropagation(); toggleExpand(job.id); }}>
                        {open ? "Hide Description" : "View Description"} <span className="chevron">▾</span>
                      </button>
                    </div>

                    <div className={"jobDesc" + (open ? " open" : "")}>
                      <div className="jobDescInner">
                        <h4>Full Job Description</h4>
                        <p>{job.description ? job.description : "No job description saved yet. Click Edit to paste the full JD."}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>

      {showForm && (
        <div className="modalOverlay" onClick={closeForm}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <p className="eyebrow">{editingId ? "Update application" : "New application"}</p>
                <h2>{editingId ? "Edit Job" : "Add Job"}</h2>
              </div>
              <button className="closeBtn" onClick={closeForm} aria-label="Close">×</button>
            </div>

            <div className="formGrid">
              <input placeholder="Company" value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} />
              <input placeholder="Job title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
              <input className="wide" placeholder="Job URL" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
              <input placeholder="Location" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} />
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                <option>Full-time</option>
                <option>Contract</option>
              </select>
              <input placeholder="Pay / package" value={draft.pay} onChange={e => setDraft({ ...draft, pay: e.target.value })} />
              <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
                <option>Applied</option>
                <option>Interviewing</option>
                <option>Rejected</option>
                <option>Offer</option>
              </select>
              <input type="date" value={draft.dateApplied} onChange={e => setDraft({ ...draft, dateApplied: e.target.value })} />
              <textarea className="wide bigDescription" placeholder="Paste the complete job description here..." value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            </div>

            <h3>Attached Resume File</h3>
            <div className="fileBox">
              <label className="importBtn center">
                Attach Resume
                <input type="file" hidden accept=".pdf,.doc,.docx,.txt,.md" onChange={e => attachResume(e.target.files[0])} />
              </label>
              {draft.resumeFileName ? (
                <>
                  <p className="fileName">{draft.resumeFileName}</p>
                  <button onClick={downloadAttachedResume}>Download Attached Resume</button>
                  <button className="dangerSolid" onClick={removeAttachedResume}>Remove Resume</button>
                </>
              ) : (
                <p className="fileName">No resume attached yet.</p>
              )}
            </div>

            <h3>Tailored Resume Text</h3>
            <textarea className="resumeBox" value={draft.resume} onChange={e => setDraft({ ...draft, resume: e.target.value })} placeholder="Paste or generate the tailored resume text for this job..." />
            <div className="actions wrap">
              <button onClick={generateResume}>Generate Draft</button>
              <button onClick={() => navigator.clipboard.writeText(draft.resume)}>Copy</button>
              <button onClick={() => download(`${draft.company || "resume"}-resume.txt`, draft.resume)}>TXT</button>
              <button onClick={() => download(`${draft.company || "resume"}-resume.md`, draft.resume)}>MD</button>
            </div>

            <div className="modalActions">
              <button onClick={closeForm}>Cancel</button>
              <button className="primary" onClick={saveJob} disabled={busy}>
                {busy ? "Saving…" : editingId ? "Save Changes" : "Add Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* one-time import of legacy localStorage jobs into the backend */
async function migrateLocalJobs(email, call) {
  const flagKey = "jt-migrated::" + email;
  if (localStorage.getItem(flagKey)) return false;
  let local = [];
  try { local = JSON.parse(localStorage.getItem("jt-jobs-v1::" + email) || "[]"); } catch { local = []; }
  if (!Array.isArray(local) || local.length === 0) { localStorage.setItem(flagKey, "1"); return false; }
  for (const j of local) {
    try { await call("/jobs", { method: "POST", body: j }); } catch { /* skip bad row */ }
  }
  localStorage.setItem(flagKey, "1");
  return true;
}

function Card({ label, value }) {
  return (
    <div className="statCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.6 5.6C41.9 35.8 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
