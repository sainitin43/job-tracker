import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* ------------------------------------------------------------------ */
/* Local, basic auth (no backend). Data is partitioned per account so  */
/* two accounts on the same browser never see each other's jobs.       */
/* NOTE: this is a lightweight local login, not real security.         */
/* ------------------------------------------------------------------ */
const USERS_KEY = "jt-users-v1";
const SESSION_KEY = "jt-session-v1";
const jobsKey = email => `jt-jobs-v1::${email}`;

/* Google Sign-In ---------------------------------------------------- */
/* Paste your Google OAuth Client ID below (from Google Cloud Console), */
/* or set it at runtime:                                               */
/*   localStorage.setItem("jt-google-client-id","XXX.apps.googleusercontent.com") */
const GOOGLE_CLIENT_ID = "400407178471-aldf00pvmnsbo41lg8sfsvv1eip7mu0o.apps.googleusercontent.com";
function googleClientId() {
  return GOOGLE_CLIENT_ID || localStorage.getItem("jt-google-client-id") || "";
}
function parseJwt(token) {
  try {
    const base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(json);
  } catch { return null; }
}
function signInWithGoogle() {
  const cid = googleClientId();
  if (!cid) {
    alert(
      "Google sign-in isn't configured yet.\n\n" +
      "1) Create an OAuth Client ID in Google Cloud Console.\n" +
      "2) Add this page's URL as an Authorized JavaScript origin AND redirect URI.\n" +
      "3) In the browser console run:\n" +
      "   localStorage.setItem('jt-google-client-id','YOUR_ID.apps.googleusercontent.com')\n" +
      "then click the button again."
    );
    return;
  }
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
function consumeGoogleRedirect() {
  if (!window.location.hash || window.location.hash.indexOf("id_token=") === -1) return null;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const token = h.get("id_token");
  history.replaceState(null, "", window.location.pathname + window.location.search);
  const claims = token && parseJwt(token);
  if (!claims || !claims.email) return null;
  const email = claims.email.toLowerCase();
  const users = loadUsers();
  if (!users[email]) {
    users[email] = {
      firstName: claims.given_name || (claims.name || email).split(" ")[0] || email,
      email,
      google: true
    };
    saveUsers(users);
  }
  if (!localStorage.getItem(jobsKey(email))) {
    localStorage.setItem(jobsKey(email), JSON.stringify(demoJobs()));
  }
  return email;
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

const today = () => new Date().toISOString().slice(0, 10);

const blankJob = {
  company: "",
  title: "",
  url: "",
  location: "",
  type: "Full-time",
  pay: "",
  status: "Applied",
  dateAdded: today(),
  dateApplied: "",
  description: "",
  resume: "",
  resumeFile: null,
  resumeFileName: "",
  resumeFileType: ""
};

const demoJobs = () => [
  {
    id: crypto.randomUUID(),
    company: "Sample Company",
    title: "Software Engineer — Java / Kotlin",
    url: "https://boards.greenhouse.io/",
    location: "Remote",
    type: "Full-time",
    pay: "$120k - $180k",
    status: "Applied",
    dateAdded: today(),
    dateApplied: today(),
    description: "Backend role using Java, Kotlin, Spring Boot, APIs, SQL, cloud, and microservices. Click Edit to paste the full job description.",
    resume: "YOUR NAME\nSoftware Engineer — Java / Kotlin",
    resumeFile: null,
    resumeFileName: "",
    resumeFileType: ""
  }
];

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch { return {}; }
}
function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
function loadJobsFor(email) {
  try {
    const v = localStorage.getItem(jobsKey(email));
    if (v) return JSON.parse(v);
  } catch { /* ignore */ }
  return demoJobs();
}

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [session, setSession] = useState(() => localStorage.getItem(SESSION_KEY) || null);

  useEffect(() => {
    const email = consumeGoogleRedirect();
    if (email) {
      localStorage.setItem(SESSION_KEY, email);
      setSession(email);
    }
  }, []);

  const users = loadUsers();
  const user = session ? users[session] : null;

  if (!user) {
    return (
      <AuthScreen
        onAuth={email => {
          localStorage.setItem(SESSION_KEY, email);
          setSession(email);
        }}
      />
    );
  }

  return (
    <Tracker
      key={user.email}
      user={user}
      onLogout={() => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
      }}
    />
  );
}

/* ------------------------------ Auth ------------------------------ */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    setError("");
    const mail = email.trim().toLowerCase();
    if (!mail || !password) { setError("Email and password are required."); return; }
    const users = loadUsers();

    if (mode === "signup") {
      if (!firstName.trim()) { setError("Please enter your first name."); return; }
      if (users[mail]) { setError("An account with this email already exists. Try logging in."); return; }
      users[mail] = { firstName: firstName.trim(), email: mail, password };
      saveUsers(users);
      // keep existing jobs for this email if present, else start with a demo job
      if (!localStorage.getItem(jobsKey(mail))) {
        localStorage.setItem(jobsKey(mail), JSON.stringify(demoJobs()));
      }
      onAuth(mail);
    } else {
      const u = users[mail];
      if (!u || u.password !== password) { setError("Invalid email or password."); return; }
      onAuth(mail);
    }
  }

  return (
    <div className="authWrap">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Job Application Tracker</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="authSub">Your applications are saved privately to your account on this device.</p>

        <button type="button" className="googleBtn" onClick={signInWithGoogle}>
          <GoogleIcon />
          <span>Continue with Google</span>
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

        <button className="primary authSubmit" type="submit">
          {mode === "login" ? "Log in" : "Create account"}
        </button>

        <p className="authNote">Local, basic login — please don't reuse a sensitive password.</p>
      </form>
    </div>
  );
}

/* ---------------------------- Tracker ----------------------------- */
function Tracker({ user, onLogout }) {
  const STORE = jobsKey(user.email);

  const [jobs, setJobs] = useState(() => loadJobsFor(user.email));
  const [draft, setDraft] = useState(blankJob);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(jobs[0]?.id || null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify(jobs));
  }, [jobs, STORE]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter(j => {
      const textMatch =
        j.company.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) ||
        (j.description || "").toLowerCase().includes(q);
      const statusMatch = statusFilter === "All" || j.status === statusFilter;
      return textMatch && statusMatch;
    });
  }, [jobs, search, statusFilter]);

  const stats = {
    total: jobs.length,
    applied: jobs.filter(j => j.status === "Applied").length,
    interviewing: jobs.filter(j => j.status === "Interviewing").length,
    offers: jobs.filter(j => j.status === "Offer").length
  };

  function saveJob() {
    if (!draft.company.trim() || !draft.title.trim()) {
      alert("Company and job title are required.");
      return;
    }
    if (editingId) {
      setJobs(prev => prev.map(j => j.id === editingId ? { ...draft, id: editingId } : j));
      setSelectedId(editingId);
    } else {
      const job = { ...draft, id: crypto.randomUUID(), dateAdded: today() };
      setJobs(prev => [job, ...prev]);
      setSelectedId(job.id);
    }
    setDraft({ ...blankJob, dateAdded: today() });
    setEditingId(null);
    setShowForm(false);
  }

  function openAddForm() {
    setDraft({ ...blankJob, dateAdded: today() });
    setEditingId(null);
    setShowForm(true);
  }
  function closeForm() {
    setDraft({ ...blankJob, dateAdded: today() });
    setEditingId(null);
    setShowForm(false);
  }
  function editJob(job) {
    setDraft(job);
    setEditingId(job.id);
    setSelectedId(job.id);
    setShowForm(true);
  }
  function deleteJob(id) {
    if (!confirm("Delete this job?")) return;
    const next = jobs.filter(j => j.id !== id);
    setJobs(next);
    setSelectedId(next[0]?.id || null);
  }
  function toggleExpand(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }
  function downloadResume(job) {
    if (!job?.resumeFile) return;
    const a = document.createElement("a");
    a.href = job.resumeFile;
    a.download = job.resumeFileName || "resume";
    a.click();
  }
  function exportData() {
    download(`${user.firstName}-job-tracker-backup.json`, JSON.stringify(jobs, null, 2), "application/json");
  }
  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error();
        setJobs(parsed);
        setSelectedId(parsed[0]?.id || null);
      } catch {
        alert("Invalid JSON backup.");
      }
    };
    reader.readAsText(file);
  }
  function attachResume(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft(prev => ({
        ...prev,
        resumeFile: reader.result,
        resumeFileName: file.name,
        resumeFileType: file.type || "application/octet-stream"
      }));
    };
    reader.readAsDataURL(file);
  }
  function downloadAttachedResume() {
    if (!draft.resumeFile) return;
    const a = document.createElement("a");
    a.href = draft.resumeFile;
    a.download = draft.resumeFileName || "resume";
    a.click();
  }
  function removeAttachedResume() {
    setDraft(prev => ({ ...prev, resumeFile: null, resumeFileName: "", resumeFileType: "" }));
  }
  function generateResume() {
    const resume = `YOUR NAME
Software Engineer — Java / Kotlin

SUMMARY
Software Engineer specializing in Java, Kotlin, backend services, REST APIs, distributed systems, SQL, and cloud-native development. Tailored for ${draft.company || "the company"}'s ${draft.title || "target"} role.

CORE SKILLS
Java, Kotlin, Spring Boot, REST APIs, Microservices, SQL, PostgreSQL, AWS, Docker, Kubernetes, CI/CD, Git, Agile

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
          <label className="importBtn">
            Import JSON
            <input type="file" accept=".json" hidden onChange={e => importData(e.target.files[0])} />
          </label>
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
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search company, title, status, or description..."
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                {["All", "Applied", "Interviewing", "Rejected", "Offer"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="jobList">
              {filtered.length === 0 && (
                <p className="emptyState">No applications yet. Click “+ Add Job” to get started.</p>
              )}

              {filtered.map(job => {
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
                      <a className="btn ghost" href={job.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        🔗 Open Posting
                      </a>
                      <button
                        className="btn"
                        disabled={!job.resumeFile}
                        onClick={e => { e.stopPropagation(); downloadResume(job); }}
                      >
                        ⬇️ Download Resume
                      </button>
                      <button className="btn" onClick={e => { e.stopPropagation(); editJob(job); }}>✏️ Edit</button>
                      <button className="btn danger" onClick={e => { e.stopPropagation(); deleteJob(job.id); }}>🗑️ Delete</button>
                      <button
                        className={"btn expandToggle" + (open ? " active" : "")}
                        onClick={e => { e.stopPropagation(); toggleExpand(job.id); }}
                      >
                        {open ? "Hide Description" : "View Description"}
                        <span className="chevron">▾</span>
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
              <textarea
                className="wide bigDescription"
                placeholder="Paste the complete job description here..."
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
              />
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
            <textarea
              className="resumeBox"
              value={draft.resume}
              onChange={e => setDraft({ ...draft, resume: e.target.value })}
              placeholder="Paste or generate the tailored resume text for this job..."
            />
            <div className="actions wrap">
              <button onClick={generateResume}>Generate Draft</button>
              <button onClick={() => navigator.clipboard.writeText(draft.resume)}>Copy</button>
              <button onClick={() => download(`${draft.company || "resume"}-resume.txt`, draft.resume)}>TXT</button>
              <button onClick={() => download(`${draft.company || "resume"}-resume.md`, draft.resume)}>MD</button>
            </div>

            <div className="modalActions">
              <button onClick={closeForm}>Cancel</button>
              <button className="primary" onClick={saveJob}>
                {editingId ? "Save Changes" : "Add Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ label, value }) {
  return (
    <div className="statCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
