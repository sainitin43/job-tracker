import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const TOKEN_KEY = "jt-token";

const GOOGLE_CLIENT_ID = "400407178471-aldf00pvmnsbo41lg8sfsvv1eip7mu0o.apps.googleusercontent.com";
function googleClientId() { return GOOGLE_CLIENT_ID || localStorage.getItem("jt-google-client-id") || ""; }

const STATUSES = ["Not Applied", "Applied", "Interviewing", "Rejected", "Offer"];
const statusSlug = s => (s || "").toLowerCase().replace(/\s+/g, "-");
const TABS = ["Not Applied", "Applied", "Favourite", "Recruiter Posts"];

const TECH_STACKS = [
  "Java", "Kotlin", "Android", "Jetpack Compose", "Swift", "iOS",
  "JavaScript", "TypeScript", "React", "Node", "Python", "Go", "C++", "C#",
  "Spring Boot", "GraphQL", "REST", "SQL", "PostgreSQL", "MongoDB",
  "AWS", "GCP", "Docker", "Kubernetes", "Kafka", "Redis", "CI/CD"
];
function jobMatchesTech(job, techs) {
  if (!techs.length) return true;
  const hay = `${job.title} ${job.description} ${job.company} ${job.pay}`.toLowerCase();
  return techs.some(t => hay.includes(t.toLowerCase()));
}

const blankJob = {
  company: "", title: "", url: "", location: "", type: "Full-time", pay: "",
  status: "Not Applied", dateApplied: "", description: "",
  resume: "", resumeFile: null, resumeFileName: "", resumeFileType: "", favourite: false
};

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function signInWithGoogle() {
  const cid = googleClientId();
  if (!cid) { alert("Google sign-in isn't configured (missing client ID)."); return; }
  const params = new URLSearchParams({
    client_id: cid, redirect_uri: window.location.origin + window.location.pathname,
    response_type: "id_token", scope: "openid email profile", prompt: "select_account",
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
    localStorage.setItem(TOKEN_KEY, tok); setToken(tok); setUser(usr);
  }, []);
  function logout() { localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); }

  useEffect(() => {
    (async () => {
      const cred = takeGoogleCredentialFromUrl();
      if (cred) {
        try { const { token: tok, user: usr } = await api("/auth/google", { method: "POST", body: { credential: cred } }); onAuthed(tok, usr); }
        catch (e) { setAuthError(e.message); }
        finally { setBooting(false); }
        return;
      }
      const existing = localStorage.getItem(TOKEN_KEY);
      if (existing) {
        try { const { user: usr } = await api("/auth/me", { token: existing }); setUser(usr); }
        catch { localStorage.removeItem(TOKEN_KEY); setToken(null); }
      }
      setBooting(false);
    })();
  }, [onAuthed]);

  if (booting) return <div className="bootWrap"><div className="spinner" /><p>Loading…</p></div>;
  if (!user) return <AuthScreen onAuthed={onAuthed} initialError={authError} />;
  return <Tracker key={user.id} user={user} token={token} onLogout={logout} onAuthExpired={logout} />;
}

function AuthScreen({ onAuthed, initialError }) {
  const [mode, setMode] = useState("login");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const body = mode === "signup" ? { firstName, email, password } : { email, password };
      const { token, user } = await api(path, { method: "POST", body });
      onAuthed(token, user);
    } catch (err) { setError(err.message || "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <div className="authWrap">
      <form className="authCard" onSubmit={submit}>
        <p className="eyebrow">Job Application Tracker</p>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="authSub">Your applications are saved securely to your account.</p>
        <button type="button" className="googleBtn" onClick={signInWithGoogle}><GoogleIcon /><span>Continue with Google</span></button>
        <div className="authDivider"><span>or use email</span></div>
        <div className="authTabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
        </div>
        {mode === "signup" && <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="authError">{error}</p>}
        <button className="primary authSubmit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
        <p className="authNote">Passwords are hashed on the server. Sessions use a secure token.</p>
      </form>
    </div>
  );
}

function Tracker({ user, token, onLogout, onAuthExpired }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blankJob);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState("Not Applied");
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState([]);
  const [expanded, setExpanded] = useState(null); // { id, tab:'jd'|'resume' }

  const [prefs, setPrefs] = useState({ searchTerm: "Software Engineer", location: "United States", isRemote: false, maxResults: 10 });
  const [apifyEnabled, setApifyEnabled] = useState(false);
  const [finding, setFinding] = useState(false);

  const [applyJob, setApplyJob] = useState(null);
  const pendingRef = useRef(null);

  const [retailorJob, setRetailorJob] = useState(null);
  const [retailorResult, setRetailorResult] = useState(null);
  const [retailorBusy, setRetailorBusy] = useState(false);

  const [gapJob, setGapJob] = useState(null);
  const [gapData, setGapData] = useState(null);     // { ats, present[], missing[] }
  const [gapFix, setGapFix] = useState(null);        // { resume, resumeData, before, ats, missingRemaining[], llm }
  const [gapBusy, setGapBusy] = useState(false);     // fixing in progress

  const [clJob, setClJob] = useState(null);          // cover-letter modal target
  const [clData, setClData] = useState(null);        // { text, llm }
  const [clBusy, setClBusy] = useState(false);
  const [kitBusy, setKitBusy] = useState(null);      // job id currently building an Apply Kit

  const [rec, setRec] = useState(null);          // { enabled, prefs, posts, lastRefreshedAt }
  const [recLoading, setRecLoading] = useState(false);
  const [recRefreshing, setRecRefreshing] = useState(false);
  const [recExpanded, setRecExpanded] = useState(null); // { id, tab:'email'|'linkedin'|'resume'|'post' }

  const call = useCallback((path, opts = {}) => api(path, { ...opts, token }).catch(err => {
    if (/401|token/i.test(err.message)) onAuthExpired();
    throw err;
  }), [token, onAuthExpired]);

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
        try { const d = await call("/discover"); setPrefs(p => ({ ...p, ...d.prefs })); setApifyEnabled(d.enabled); } catch { /* */ }
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, [call, user.email]);

  // "Did you apply?" — when the window regains focus after opening a posting
  useEffect(() => {
    function check() {
      const id = pendingRef.current;
      if (!id) return;
      pendingRef.current = null;
      const job = jobs.find(j => j.id === id);
      if (job && job.status === "Not Applied") setApplyJob(job);
    }
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [jobs]);

  function toggleTech(t) { setTechFilter(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])); }
  function setPref(key, value) { setPrefs(p => ({ ...p, [key]: value })); }

  const counts = useMemo(() => ({
    "Not Applied": jobs.filter(j => j.status === "Not Applied").length,
    "Applied": jobs.filter(j => j.status !== "Not Applied").length,
    "Favourite": jobs.filter(j => j.favourite).length
  }), [jobs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return jobs.filter(j => {
      const inTab = tab === "Favourite" ? j.favourite : tab === "Applied" ? j.status !== "Not Applied" : j.status === "Not Applied";
      if (!inTab) return false;
      const textMatch =
        j.company.toLowerCase().includes(q) || j.title.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) || (j.description || "").toLowerCase().includes(q);
      return textMatch && jobMatchesTech(j, techFilter);
    });
  }, [jobs, tab, search, techFilter]);

  async function saveJob() {
    if (!draft.company.trim() || !draft.title.trim()) { alert("Company and job title are required."); return; }
    setBusy(true);
    try {
      if (editingId) {
        const { job } = await call(`/jobs/${editingId}`, { method: "PUT", body: draft });
        setJobs(prev => prev.map(j => j.id === editingId ? job : j));
      } else {
        const { job } = await call("/jobs", { method: "POST", body: draft });
        setJobs(prev => [job, ...prev]);
      }
      closeForm();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  function openAddForm() { setDraft({ ...blankJob }); setEditingId(null); setShowForm(true); }
  function closeForm() { setDraft({ ...blankJob }); setEditingId(null); setShowForm(false); }
  function editJob(job) { setDraft(job); setEditingId(job.id); setShowForm(true); }

  async function deleteJob(id) {
    if (!confirm("Delete this job?")) return;
    try { await call(`/jobs/${id}`, { method: "DELETE" }); setJobs(prev => prev.filter(j => j.id !== id)); }
    catch (e) { alert(e.message); }
  }
  async function updateStatus(job, status) {
    if (status === job.status) return;
    const prev = job.status;
    setJobs(p => p.map(j => (j.id === job.id ? { ...j, status } : j)));
    try { await call(`/jobs/${job.id}`, { method: "PUT", body: { status } }); }
    catch (e) { setJobs(p => p.map(j => (j.id === job.id ? { ...j, status: prev } : j))); alert(e.message); }
  }
  async function toggleFavourite(job) {
    const next = !job.favourite;
    setJobs(p => p.map(j => (j.id === job.id ? { ...j, favourite: next } : j)));
    try { await call(`/jobs/${job.id}`, { method: "PUT", body: { favourite: next } }); }
    catch (e) { setJobs(p => p.map(j => (j.id === job.id ? { ...j, favourite: !next } : j))); alert(e.message); }
  }
  function toggleExpand(id, t) { setExpanded(prev => (prev && prev.id === id && prev.tab === t ? null : { id, tab: t })); }

  function openPosting(job) {
    if (job.url) window.open(job.url, "_blank", "noopener");
    if (job.status === "Not Applied") pendingRef.current = job.id;
  }
  async function confirmApplied(job, yes) {
    setApplyJob(null);
    if (yes) await updateStatus(job, "Applied");
  }

  async function findJobs() {
    if (!apifyEnabled) { alert("Add APIFY_TOKEN to the backend .env to enable job finding."); return; }
    setFinding(true);
    try {
      const { added, jobs: all } = await call("/discover/refresh", { method: "POST", body: prefs });
      if (all) setJobs(all);
      setTab("Not Applied");
      alert(added ? `Added ${added} new tailored ${added === 1 ? "job" : "jobs"} to Not Applied.` : "No new matching jobs found right now — try a broader role/location.");
    } catch (e) { alert(e.message); }
    finally { setFinding(false); }
  }

  // ---- Recruiter posts ----
  const loadRecruiters = useCallback(async () => {
    setRecLoading(true);
    try { setRec(await call("/recruiters")); } catch { /* */ }
    finally { setRecLoading(false); }
  }, [call]);

  async function refreshRecruiters() {
    setRecRefreshing(true);
    try {
      const body = rec?.prefs || {};
      const { posts, lastRefreshedAt } = await call("/recruiters/refresh", { method: "POST", body });
      setRec(d => ({ ...d, posts, lastRefreshedAt }));
    } catch (e) { alert(e.message); }
    finally { setRecRefreshing(false); }
  }
  function setRPref(key, value) { setRec(d => ({ ...d, prefs: { ...d.prefs, [key]: value } })); }
  function toggleRecExpand(id, t) { setRecExpanded(p => (p && p.id === id && p.tab === t ? null : { id, tab: t })); }
  async function downloadRecruiterPdf(post) {
    try {
      const res = await fetch(`${API_BASE}/recruiters/${post.id}/resume.pdf`, { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) throw new Error("Couldn't generate the PDF.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${post.company || "recruiter"}-${post.role}-resume.pdf`.replace(/[^\w.\- ]+/g, "_"); a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  }
  async function saveRecruiterPost(post) {
    try {
      const body = { company: post.company || post.recruiter, title: post.role, url: post.url, location: post.location, status: "Not Applied", description: post.text, resume: post.resume || "", resumeData: post.resumeData || null, ats: post.ats, source: "recruiter post" };
      const { job } = await call("/jobs", { method: "POST", body });
      setJobs(prev => [job, ...prev]);
      alert(`Saved “${post.role}” to your jobs.`);
    } catch (e) { alert(e.message); }
  }

  useEffect(() => {
    if (tab === "Recruiter Posts" && rec === null) loadRecruiters();
  }, [tab, rec, loadRecruiters]);

  async function reTailor(job) {
    setRetailorJob(job); setRetailorResult(null); setRetailorBusy(true);
    try {
      const r = await call(`/jobs/${job.id}/retailor`, { method: "POST" });
      setRetailorResult(r);
    } catch (e) { alert(e.message); setRetailorJob(null); }
    finally { setRetailorBusy(false); }
  }
  async function applyRetailor() {
    if (!retailorJob || !retailorResult) return;
    const id = retailorJob.id;
    try {
      const { job } = await call(`/jobs/${id}`, { method: "PUT", body: { resume: retailorResult.resume, resumeData: retailorResult.resumeData, ats: retailorResult.ats } });
      setJobs(prev => prev.map(j => (j.id === id ? job : j)));
    } catch (e) { alert(e.message); }
    setRetailorJob(null); setRetailorResult(null);
  }
  function discardRetailor() { setRetailorJob(null); setRetailorResult(null); }

  async function openGap(job) {
    setGapJob(job); setGapData(null); setGapFix(null); setGapBusy(false);
    try {
      const g = await call(`/jobs/${job.id}/atsgap`, { method: "POST" });
      setGapData(g);
    } catch (e) { alert(e.message); setGapJob(null); }
  }
  async function fixGap() {
    if (!gapJob) return;
    setGapBusy(true);
    try {
      const r = await call(`/jobs/${gapJob.id}/atsfix`, { method: "POST" });
      setGapFix(r);
    } catch (e) { alert(e.message); }
    finally { setGapBusy(false); }
  }
  async function applyGapFix() {
    if (!gapJob || !gapFix) return;
    const id = gapJob.id;
    try {
      const { job } = await call(`/jobs/${id}`, { method: "PUT", body: { resume: gapFix.resume, resumeData: gapFix.resumeData, ats: gapFix.ats } });
      setJobs(prev => prev.map(j => (j.id === id ? job : j)));
    } catch (e) { alert(e.message); }
    setGapJob(null); setGapData(null); setGapFix(null);
  }
  function closeGap() { setGapJob(null); setGapData(null); setGapFix(null); setGapBusy(false); }

  async function openCoverLetter(job) {
    setClJob(job); setClData(null); setClBusy(true);
    try {
      const r = await call(`/jobs/${job.id}/coverletter`, { method: "POST" });
      setClData(r);
    } catch (e) { alert(e.message); setClJob(null); }
    finally { setClBusy(false); }
  }
  async function regenCoverLetter() {
    if (!clJob) return;
    setClBusy(true);
    try { setClData(await call(`/jobs/${clJob.id}/coverletter`, { method: "POST" })); }
    catch (e) { alert(e.message); }
    finally { setClBusy(false); }
  }
  function closeCoverLetter() { setClJob(null); setClData(null); setClBusy(false); }
  function copyCoverLetter() { if (clData?.text) navigator.clipboard?.writeText(clData.text); }
  function downloadCoverLetterTxt() { if (clJob && clData?.text) download(`${clJob.company}-${clJob.title}-cover-letter.txt`, clData.text); }

  async function downloadApplyKit(job) {
    setKitBusy(job.id);
    try {
      const res = await fetch(`${API_BASE}/jobs/${job.id}/applykit.zip`, { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) throw new Error("Couldn't build the Apply Kit.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${job.company}-${job.title}-ApplyKit.zip`.replace(/[^\w.\- ]+/g, "_"); a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
    finally { setKitBusy(null); }
  }

  function exportData() { download(`${user.firstName}-jobs.json`, JSON.stringify(jobs, null, 2), "application/json"); }
  function downloadResume(job) { if (!job?.resume) return; download(`${job.company}-${job.title}-resume.txt`, job.resume); }
  async function downloadResumePdf(job) {
    try {
      const res = await fetch(`${API_BASE}/jobs/${job.id}/resume.pdf`, { headers: { Authorization: "Bearer " + token } });
      if (!res.ok) throw new Error("Couldn't generate the PDF.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${job.company}-${job.title}-resume.pdf`.replace(/[^\w.\- ]+/g, "_"); a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  }

  function attachResume(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft(prev => ({ ...prev, resumeFile: reader.result, resumeFileName: file.name, resumeFileType: file.type || "application/octet-stream" }));
    reader.readAsDataURL(file);
  }
  function removeAttachedResume() { setDraft(prev => ({ ...prev, resumeFile: null, resumeFileName: "", resumeFileType: "" })); }

  const initials = (user.firstName || user.email).slice(0, 1).toUpperCase();

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal dashboard</p>
          <h1>{user.firstName}'s Jobs</h1>
          <p>Auto-finds matching roles, tailors an ATS resume for each, and tracks them Not Applied → Applied.</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={findJobs} disabled={finding}>{finding ? "Finding…" : "✨ Find Jobs"}</button>
          <button onClick={openAddForm}>+ Add Job</button>
          <button onClick={exportData}>Export</button>
          <div className="userChip" title={user.email}>
            <span className="avatar">{initials}</span>
            <span className="userName">{user.firstName}</span>
            <button className="logoutBtn" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </header>

      <section className="searchHero">
        <div className="searchBarWrap">
          <span className="searchIcon">🔍</span>
          <input className="searchBar" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search — try “Java”, “Software Engineer”, a company…" />
          {search && <button className="clearSearch" onClick={() => setSearch("")} aria-label="Clear">×</button>}
        </div>
        <div className="techChips">
          <span className="techChipsLabel">Tech stack:</span>
          {TECH_STACKS.map(t => (
            <button key={t} className={"techChip" + (techFilter.includes(t) ? " on" : "")} onClick={() => toggleTech(t)}>{t}</button>
          ))}
          {techFilter.length > 0 && <button className="techChip clear" onClick={() => setTechFilter([])}>Clear ×</button>}
        </div>
      </section>

      <nav className="viewTabs">
        {TABS.map(t => (
          <button key={t} className={"viewTab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t === "Favourite" ? "⭐ Favourite" : t === "Recruiter Posts" ? "📣 Recruiter Posts" : t}
            <span className="tabCount">{t === "Recruiter Posts" ? (rec?.posts?.length || 0) : counts[t]}</span>
          </button>
        ))}
      </nav>

      <section className="layout">
        <div className="left">
          {tab === "Not Applied" && (
            <div className="findBar">
              <label>Role<input value={prefs.searchTerm || ""} onChange={e => setPref("searchTerm", e.target.value)} placeholder="e.g. Android Engineer" /></label>
              <label>Location<input value={prefs.location || ""} onChange={e => setPref("location", e.target.value)} placeholder="e.g. Remote, San Jose, CA" /></label>
              <label className="checkRow"><input type="checkbox" checked={!!prefs.isRemote} onChange={e => setPref("isRemote", e.target.checked)} /> Remote only</label>
              <button className="primary" onClick={findJobs} disabled={finding || !apifyEnabled}>{finding ? "Searching…" : "✨ Find & tailor jobs"}</button>
              {!apifyEnabled && <span className="findHint">Add APIFY_TOKEN to enable auto-find</span>}
            </div>
          )}

          {tab !== "Recruiter Posts" && (
          <section className="panel">
            <div className="jobList">
              {loading && <p className="emptyState">Loading…</p>}
              {!loading && filtered.length === 0 && (
                <p className="emptyState">
                  {tab === "Not Applied" ? "No pending jobs. Click “Find Jobs” to auto-fetch matches with tailored resumes." :
                    tab === "Applied" ? "Nothing applied yet. Open a job and mark it applied when you do." :
                      "No favourites yet — tap the ⭐ on any job."}
                </p>
              )}

              {!loading && filtered.map(job => {
                const showJD = expanded && expanded.id === job.id && expanded.tab === "jd";
                const showResume = expanded && expanded.id === job.id && expanded.tab === "resume";
                return (
                  <div key={job.id} className="jobCard">
                    <div className="jobCardTitleRow">
                      <h3>{job.company}</h3>
                      <span className={"statusPill pill-" + statusSlug(job.status)} onClick={e => e.stopPropagation()}>
                        <select value={job.status} onChange={e => updateStatus(job, e.target.value)} aria-label="Status">
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </span>
                      {typeof job.score === "number" && <span className={"scorePill " + scoreClass(job.score)}>{job.score}% match</span>}
                      {typeof job.ats === "number" && <span className={"scorePill ats " + scoreClass(job.ats)}>ATS {job.ats}%</span>}
                      <button className={"starBtn" + (job.favourite ? " on" : "")} onClick={() => toggleFavourite(job)} title="Favourite" aria-label="Favourite">
                        {job.favourite ? "★" : "☆"}
                      </button>
                    </div>
                    <p className="jobRole">{job.title}</p>
                    <div className="jobMeta">
                      <span>📍 {job.location || "—"}</span>
                      <span>💼 {job.type || "—"}</span>
                      <span>💰 {job.pay || "—"}</span>
                      {job.datePosted && <span>🗓️ Posted {job.datePosted}{relativeDays(job.datePosted) ? ` (${relativeDays(job.datePosted)})` : ""}</span>}
                      {job.source && <span>🌐 {job.source}</span>}
                      <span>{job.resume ? "📝 Resume ready" : "📝 No resume"}</span>
                    </div>

                    <div className="jobCardActions">
                      <button className="btn primary" onClick={() => openPosting(job)} disabled={!job.url}>🔗 Open & Apply</button>
                      <button className="btn" onClick={() => downloadResumePdf(job)}>⬇️ Resume PDF</button>
                      <button className="btn" onClick={() => toggleExpand(job.id, "resume")} disabled={!job.resume}>{showResume ? "Hide Resume" : "📝 Tailored Resume"}</button>
                      <button className="btn" onClick={() => reTailor(job)}>♻️ Re-tailor</button>
                      <button className="btn" onClick={() => openGap(job)}>🎯 ATS Gaps</button>
                      <button className="btn kit" onClick={() => openCoverLetter(job)}>✉️ Cover Letter</button>
                      <button className="btn kit" onClick={() => downloadApplyKit(job)} disabled={kitBusy === job.id}>{kitBusy === job.id ? "📦 Building…" : "📦 Apply Kit"}</button>
                      <button className="btn" onClick={() => toggleExpand(job.id, "jd")}>{showJD ? "Hide JD" : "📄 View JD"}</button>
                      <button className="btn" onClick={() => editJob(job)}>✏️ Edit</button>
                      <button className="btn danger" onClick={() => deleteJob(job.id)}>🗑️ Delete</button>
                    </div>

                    {showJD && (
                      <div className="jobDesc open"><div className="jobDescInner">
                        <h4>Full Job Description</h4>
                        <p>{job.description || "No description saved."}</p>
                      </div></div>
                    )}
                    {showResume && (
                      <div className="jobDesc open"><div className="jobDescInner">
                        <h4>Tailored ATS Resume</h4>
                        <textarea className="resumeBox" readOnly value={job.resume || ""} />
                        <div className="actions wrap">
                          <button className="primary" onClick={() => downloadResumePdf(job)}>⬇️ Download PDF</button>
                          <button onClick={() => navigator.clipboard.writeText(job.resume || "")}>Copy</button>
                          <button onClick={() => downloadResume(job)}>Download TXT</button>
                        </div>
                      </div></div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {tab === "Recruiter Posts" && (
            <RecruiterPanel
              rec={rec} loading={recLoading} refreshing={recRefreshing}
              onRefresh={refreshRecruiters} setRPref={setRPref}
              expanded={recExpanded} setExpanded={toggleRecExpand}
              onSave={saveRecruiterPost} onPdf={downloadRecruiterPdf}
            />
          )}
        </div>
      </section>

      {showForm && (
        <div className="modalOverlay" onClick={closeForm}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalHead">
              <div><p className="eyebrow">{editingId ? "Update application" : "New application"}</p><h2>{editingId ? "Edit Job" : "Add Job"}</h2></div>
              <button className="closeBtn" onClick={closeForm} aria-label="Close">×</button>
            </div>
            <div className="formGrid">
              <input placeholder="Company" value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} />
              <input placeholder="Job title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
              <input className="wide" placeholder="Job URL" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />
              <input placeholder="Location" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} />
              <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option>Full-time</option><option>Contract</option></select>
              <input placeholder="Pay / package" value={draft.pay} onChange={e => setDraft({ ...draft, pay: e.target.value })} />
              <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
              <input type="date" value={draft.dateApplied} onChange={e => setDraft({ ...draft, dateApplied: e.target.value })} />
              <textarea className="wide bigDescription" placeholder="Paste the complete job description here..." value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <h3>Attached Resume File</h3>
            <div className="fileBox">
              <label className="importBtn center">Attach Resume<input type="file" hidden accept=".pdf,.doc,.docx,.txt,.md" onChange={e => attachResume(e.target.files[0])} /></label>
              {draft.resumeFileName ? (<><p className="fileName">{draft.resumeFileName}</p><button className="dangerSolid" onClick={removeAttachedResume}>Remove Resume</button></>) : <p className="fileName">No resume attached yet.</p>}
            </div>
            <h3>Tailored Resume Text</h3>
            <textarea className="resumeBox" value={draft.resume} onChange={e => setDraft({ ...draft, resume: e.target.value })} placeholder="Paste or generate the tailored resume text for this job..." />
            <div className="modalActions">
              <button onClick={closeForm}>Cancel</button>
              <button className="primary" onClick={saveJob} disabled={busy}>{busy ? "Saving…" : editingId ? "Save Changes" : "Add Job"}</button>
            </div>
          </div>
        </div>
      )}

      {retailorJob && (
        <div className="modalOverlay" onClick={discardRetailor}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <p className="eyebrow">Re-tailored · stronger & more technical</p>
                <h2>{retailorJob.company} — {retailorJob.title}</h2>
              </div>
              <button className="closeBtn" onClick={discardRetailor} aria-label="Close">×</button>
            </div>
            {retailorBusy && <p className="emptyState">Generating a stronger, ATS-optimized resume…</p>}
            {!retailorBusy && retailorResult && (
              <>
                <p className="applyQ">
                  New ATS match: <strong>{retailorResult.ats}%</strong>
                  {retailorResult.llm === false && <span className="findHint"> · add Anthropic credits for a full LLM rewrite</span>}
                </p>
                <ResumeDiff oldText={retailorJob.resume} newText={retailorResult.resume} />
                <p className="applyQ">Do you want to update this job's resume with this version?</p>
                <div className="modalActions">
                  <button onClick={discardRetailor}>No, keep current</button>
                  <button className="primary" onClick={applyRetailor}>Yes, update resume</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {applyJob && (
        <div className="modalOverlay" onClick={() => setApplyJob(null)}>
          <div className="modalCard small" onClick={e => e.stopPropagation()}>
            <h2>Did you apply?</h2>
            <p className="applyQ">Did you submit your application to <b>{applyJob.company}</b> — {applyJob.title}?</p>
            <div className="modalActions">
              <button onClick={() => confirmApplied(applyJob, false)}>Not yet</button>
              <button className="primary" onClick={() => confirmApplied(applyJob, true)}>✅ Yes, mark Applied</button>
            </div>
          </div>
        </div>
      )}

      {gapJob && (
        <div className="modalOverlay" onClick={closeGap}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <p className="eyebrow">ATS gap analysis</p>
                <h2>{gapJob.company} — {gapJob.title}</h2>
              </div>
              <button className="closeBtn" onClick={closeGap} aria-label="Close">×</button>
            </div>

            {!gapData && <p className="emptyState">Scanning the job description against your resume…</p>}

            {gapData && !gapFix && (
              <>
                <p className="applyQ">
                  Current ATS match: <strong className={scoreClass(gapData.ats || 0)}>{gapData.ats == null ? "—" : gapData.ats + "%"}</strong>
                  {"  "}<span className="findHint">· {gapData.present.length} present · {gapData.missing.length} missing</span>
                </p>
                {gapData.missing.length > 0 ? (
                  <>
                    <p className="gapLabel">Missing keywords from this job description:</p>
                    <div className="gapChips">
                      {gapData.missing.map(k => <span key={k} className="gapChip missing">{k}</span>)}
                    </div>
                    {gapData.present.length > 0 && (
                      <>
                        <p className="gapLabel">Already covered:</p>
                        <div className="gapChips">
                          {gapData.present.map(k => <span key={k} className="gapChip present">{k}</span>)}
                        </div>
                      </>
                    )}
                    <div className="modalActions">
                      <button onClick={closeGap}>Close</button>
                      <button className="primary" onClick={fixGap} disabled={gapBusy}>
                        {gapBusy ? "Optimizing…" : "⚡ Fix to 90%+"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="applyQ">🎉 No gaps — your resume already covers every keyword this job asks for.</p>
                    <div className="modalActions"><button className="primary" onClick={closeGap}>Great</button></div>
                  </>
                )}
              </>
            )}

            {gapFix && (
              <>
                <p className="applyQ">
                  ATS match: <strong className={scoreClass(gapFix.before || 0)}>{gapFix.before}%</strong>
                  {"  →  "}
                  <strong className={scoreClass(gapFix.ats || 0)}>{gapFix.ats}%</strong>
                  {gapFix.llm === false && <span className="findHint"> · keywords woven into your skills; add Anthropic credits for a full bullet rewrite</span>}
                </p>
                {gapFix.missingRemaining.length > 0 && (
                  <div className="gapChips">
                    {gapFix.missingRemaining.map(k => <span key={k} className="gapChip missing">{k}</span>)}
                  </div>
                )}
                <ResumeDiff oldText={gapJob.resume} newText={gapFix.resume} />
                <p className="applyQ">Update this job's resume with the gap-fixed version?</p>
                <div className="modalActions">
                  <button onClick={closeGap}>No, keep current</button>
                  <button className="primary" onClick={applyGapFix}>Yes, update resume</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {clJob && (
        <div className="modalOverlay" onClick={closeCoverLetter}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <p className="eyebrow">Cover letter</p>
                <h2>{clJob.company} — {clJob.title}</h2>
              </div>
              <button className="closeBtn" onClick={closeCoverLetter} aria-label="Close">×</button>
            </div>
            {clBusy && <p className="emptyState">Writing a tailored cover letter…</p>}
            {!clBusy && clData && (
              <>
                {clData.llm === false && <p className="findHint">Template draft · add Anthropic credits for a fully AI-written letter.</p>}
                <textarea className="resumeBox" readOnly value={clData.text} />
                <div className="modalActions">
                  <button onClick={copyCoverLetter}>📋 Copy</button>
                  <button onClick={downloadCoverLetterTxt}>⬇️ Download .txt</button>
                  <button className="primary" onClick={regenCoverLetter}>♻️ Regenerate</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

async function migrateLocalJobs(email, call) {
  const flagKey = "jt-migrated::" + email;
  if (localStorage.getItem(flagKey)) return false;
  let local = [];
  try { local = JSON.parse(localStorage.getItem("jt-jobs-v1::" + email) || "[]"); } catch { local = []; }
  if (!Array.isArray(local) || local.length === 0) { localStorage.setItem(flagKey, "1"); return false; }
  for (const j of local) { try { await call("/jobs", { method: "POST", body: j }); } catch { /* */ } }
  localStorage.setItem(flagKey, "1");
  return true;
}

function scoreClass(s) { return s >= 75 ? "score-high" : s >= 50 ? "score-mid" : "score-low"; }

// Read-only resume preview that highlights lines added/changed vs the current resume in green.
function ResumeDiff({ oldText, newText }) {
  const norm = s => s.replace(/\s+/g, " ").trim().toLowerCase();
  const oldSet = new Set((oldText || "").split("\n").map(norm).filter(Boolean));
  const lines = (newText || "").split("\n");
  return (
    <div className="resumeDiff">
      <p className="diffLegend"><span className="diffSwatch" /> green = new or changed for this job</p>
      <pre className="diffBody">
        {lines.map((ln, i) => {
          const changed = ln.trim() && !oldSet.has(norm(ln));
          return <div key={i} className={changed ? "diffAdd" : ""}>{ln || " "}</div>;
        })}
      </pre>
    </div>
  );
}

// "3 days ago" / "today" / "yesterday" from a posted date string.
function relativeDays(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function RecruiterPanel({ rec, loading, refreshing, onRefresh, setRPref, expanded, setExpanded, onSave, onPdf }) {
  if (loading || rec === null) return <section className="panel"><p className="emptyState">Loading recruiter posts…</p></section>;
  const prefs = rec.prefs || {};
  const posts = rec.posts || [];
  const exp = expanded || {};
  const csv = arr => (arr || []).join(", ");
  return (
    <section className="panel">
      <div className="panelHead">
        <div>
          <h2>Recruiter Posts</h2>
          <p>Live "we're hiring" posts from recruiters — each with a tailored resume, an ATS score, and a ready cold email / LinkedIn message.</p>
        </div>
        <button className="primary" onClick={onRefresh} disabled={refreshing || !rec.enabled}>{refreshing ? "Searching…" : "🔄 Find recruiter posts"}</button>
      </div>

      {!rec.enabled && (
        <div className="setupNote"><strong>Add APIFY_TOKEN to the server .env</strong><p>to pull recruiter hiring posts.</p></div>
      )}

      <div className="findBar">
        <label>Role<input value={csv(prefs.jobRoles)} onChange={e => setRPref("jobRoles", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="e.g. Android Engineer" /></label>
        <label>Location<input value={csv(prefs.locations)} onChange={e => setRPref("locations", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="e.g. United States, Remote" /></label>
        <label>Tech<input value={csv(prefs.keywords)} onChange={e => setRPref("keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="e.g. Kotlin, React" /></label>
      </div>

      <p className="discMeta">{rec.lastRefreshedAt ? `Last updated ${new Date(rec.lastRefreshedAt).toLocaleString()}` : "Not fetched yet."}{posts.length ? ` · ${posts.length} posts` : ""}</p>

      <div className="jobList">
        {posts.length === 0 && <p className="emptyState">{rec.enabled ? "No posts yet — set your role and click “Find recruiter posts”." : "Enable fetching to see recruiter posts."}</p>}
        {posts.map(post => {
          const show = t => exp.id === post.id && exp.tab === t;
          const channel = show("email") ? "email" : show("linkedin") ? "linkedin" : null;
          return (
            <div key={post.id} className="jobCard">
              <div className="jobCardTitleRow">
                <h3>{post.recruiter}{post.company ? ` · ${post.company}` : ""}</h3>
                {typeof post.score === "number" && <span className="scorePill score-mid">🔥 {post.score}</span>}
                {typeof post.ats === "number" && <span className={"scorePill ats " + scoreClass(post.ats)}>ATS {post.ats}%</span>}
              </div>
              <p className="jobRole">{post.role || "Hiring"}</p>
              <div className="jobMeta">
                <span>📍 {post.location || "—"}</span>
                {post.postedDate && <span>🗓️ {post.postedDate}</span>}
                <span>📣 recruiter post</span>
              </div>

              <div className="jobCardActions">
                <a className="btn ghost" href={post.url} target="_blank" rel="noreferrer">🔗 Open Post</a>
                <select className="outreachSelect" value={channel || ""} onChange={e => setExpanded(post.id, e.target.value)}>
                  <option value="">✉️ Cold outreach…</option>
                  <option value="email">Cold Email</option>
                  <option value="linkedin">LinkedIn Message</option>
                </select>
                <button className="btn" onClick={() => setExpanded(post.id, "resume")}>📝 Tailored Resume</button>
                <button className="btn" onClick={() => onPdf(post)}>⬇️ Resume PDF</button>
                <button className="btn primary" onClick={() => onSave(post)}>➕ Save to My Jobs</button>
              </div>

              {channel && (
                <div className="jobDesc open"><div className="jobDescInner">
                  <h4>{channel === "email" ? "Cold Email" : "LinkedIn Message"}</h4>
                  <textarea className="resumeBox" readOnly value={channel === "email" ? post.emailDraft : post.linkedinDraft} />
                  <div className="actions wrap">
                    <button className="primary" onClick={() => navigator.clipboard.writeText((channel === "email" ? post.emailDraft : post.linkedinDraft) || "")}>Copy</button>
                  </div>
                </div></div>
              )}
              {show("resume") && (
                <div className="jobDesc open"><div className="jobDescInner">
                  <h4>Tailored ATS Resume</h4>
                  <textarea className="resumeBox" readOnly value={post.resume || ""} />
                  <div className="actions wrap">
                    <button className="primary" onClick={() => onPdf(post)}>⬇️ Download PDF</button>
                    <button onClick={() => navigator.clipboard.writeText(post.resume || "")}>Copy</button>
                  </div>
                </div></div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
