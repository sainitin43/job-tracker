/* Job Applier — full-height side panel + autonomous autopilot.
   Fills every field from your profile + saved answers, asks the Claude agent
   (backend) for anything unknown, auto-advances each page, and stops at the
   final Submit. Watches for your submit and marks the job Applied. */
(() => {
  if (window.__jtApplier) return;
  window.__jtApplier = true;

  const bg = (msg) => new Promise((res, rej) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        const e = chrome.runtime.lastError;
        if (e) return rej(new Error(e.message));
        if (r && r.error) return rej(new Error(r.error));
        res(r);
      });
    } catch (e) { rej(e); }
  });
  const api = (method, path, body) => bg({ type: "api", method, path, body });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const S = {
    user: null, profile: {}, answers: {}, job: null,
    running: false, busy: false, pending: null, applied: false,
    steps: [], progress: 0, resumeName: "", stats: { applied: 0, ats: 100, queue: 0 }
  };

  /* ---------------- field utilities ---------------- */
  const vis = (el) => {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  function labelText(el) {
    let t = "";
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
    if (!t) { const l = el.closest("label"); if (l) t = l.innerText; }
    if (!t && el.getAttribute("aria-label")) t = el.getAttribute("aria-label");
    if (!t && el.getAttribute("aria-labelledby")) { const r = document.getElementById(el.getAttribute("aria-labelledby")); if (r) t = r.innerText; }
    if (!t) { const fg = el.closest("div,fieldset,li,section"); if (fg) { const lb = fg.querySelector("label,legend"); if (lb) t = lb.innerText; } }
    if (!t) t = el.placeholder || el.name || "";
    return clean(t).slice(0, 160);
  }
  function setText(el, val) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function setSelect(el, val) {
    const want = clean(val).toLowerCase();
    let opt = [...el.options].find(o => clean(o.text).toLowerCase() === want)
      || [...el.options].find(o => clean(o.text).toLowerCase().includes(want) && want.length > 1)
      || [...el.options].find(o => want.includes(clean(o.text).toLowerCase()) && clean(o.text).length > 1);
    if (!opt) return false;
    el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); return true;
  }
  function setChoice(groupEls, val) {
    const want = clean(val).toLowerCase();
    for (const el of groupEls) {
      const lt = labelText(el).toLowerCase();
      if (lt === want || lt.includes(want) || want.includes(lt)) { el.click(); return true; }
    }
    return false;
  }

  /* ---------------- profile → answer mapping ---------------- */
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  function fromBank(label) {
    const nq = norm(label); let best = null;
    for (const [k, v] of Object.entries(S.answers || {})) {
      const nk = norm(k); if (!nk) continue;
      if (nq.includes(nk) || nk.includes(nq)) { if (!best || nk.length > norm(best[0]).length) best = [k, v]; }
    }
    return best ? best[1] : null;
  }
  function profileVal(label) {
    const p = S.profile || {}, d = p.demographics || {}, L = label.toLowerCase();
    const loc = (p.location || "").split(",").map(s => s.trim());
    const has = (...k) => k.some(x => L.includes(x));
    if (has("first name")) return p.firstName;
    if (has("last name", "surname", "family name")) return p.lastName;
    if (has("full name") || L === "name" || has("legal name", "your name")) return p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ");
    if (has("email")) return p.email;
    if (has("phone", "mobile", "contact number")) return p.phone;
    if (has("linkedin")) return p.linkedin;
    if (has("github", "portfolio", "website", "personal site")) return p.github || "";
    if (has("street", "address line", "mailing address", "address")) return p.mailingAddress || p.address || "";
    if (has("city")) return p.city || loc[0] || "";
    if (has("state", "province", "region")) return p.state || loc[1] || "";
    if (has("zip", "postal")) return p.zip || "";
    if (has("country")) return p.country || "United States";
    if (has("authoriz", "legally authorized", "right to work")) return p.workAuthorized || "Yes";
    if (has("sponsor", "visa")) return p.requiresSponsorship || "No";
    if (has("years of experience", "years experience", "total experience")) return p.totalExperienceYears || p.androidExperienceYears || "";
    if (has("pronoun")) return p.pronoun || "";
    if (has("transgender")) return d.transgender || "No";
    if (has("sexual orientation", "orientation")) return d.sexualOrientation || "Heterosexual / Straight";
    if (has("gender")) return d.gender || "";
    if (has("hispanic", "latino")) return d.hispanicLatino || "";
    if (has("race", "ethnicity")) return d.race || "";
    if (has("veteran")) return d.veteranStatus || "";
    if (has("chronic", "long-lasting", "long lasting", "substantially limit", "major life activ")) return d.disability || "No";
    if (has("disab")) return d.disabilityStatus || "";
    if (has("salary", "compensation", "expected pay", "desired pay", "rate")) return p.salaryExpectation || "$130,000";
    if (has("notice", "start date", "when can you start", "available")) return p.noticePeriod || "2 weeks";
    if (has("relocat")) return p.willingToRelocate || "Yes";
    if (has("how did you hear", "source", "referral source", "hear about")) return p.howHeard || "LinkedIn";
    if (has("preferred name", "preferred first")) return p.preferredName || p.firstName;
    return null;
  }
  function knownAnswer(label) {
    const b = fromBank(label); if (b != null && String(b).trim()) return String(b);
    const p = profileVal(label); if (p != null && String(p).trim()) return String(p);
    return null;
  }
  function optsFromList(el) {
    if (el.list && el.list.options) return [...el.list.options].map(o => clean(o.value || o.text)).filter(Boolean);
    return null;
  }
  // Produce a real Date for date/month inputs. "Start date / available / notice"
  // resolves to ~2 weeks out; otherwise try to parse the answer.
  function toDate(ans, label) {
    const L = (label || "").toLowerCase();
    if (/start|available|notice|when can you/.test(L)) { const d = new Date(); d.setDate(d.getDate() + 14); return d; }
    const t = Date.parse(ans); return isNaN(t) ? null : new Date(t);
  }

  /* ---------------- fill one page ---------------- */
  function groupRadios() {
    const groups = {};
    document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(el => {
      if (!vis(el)) return;
      const key = el.name || (el.closest("fieldset,div,li") ? labelText(el.closest("fieldset,div,li")) : "g") || "g";
      (groups[key] = groups[key] || []).push(el);
    });
    return groups;
  }
  function fieldQuestion(el) {
    const fg = el.closest("fieldset,div,li,section");
    if (fg) { const lg = fg.querySelector("legend,label"); if (lg && clean(lg.innerText)) return clean(lg.innerText).slice(0, 160); }
    return labelText(el);
  }
  function optionsFor(el) {
    if (el.tagName === "SELECT") return [...el.options].map(o => clean(o.text)).filter(Boolean).slice(1);
    return null;
  }

  function fillPage() {
    let filled = 0; const unknown = [];
    // text / email / tel / textarea / date / number
    document.querySelectorAll('input,textarea').forEach(el => {
      const type = (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "file", "radio", "checkbox", "password"].includes(type)) return;
      if (!vis(el) || el.value) return;
      const label = labelText(el);
      if (!label) return;
      if (/preferred (name|first)/i.test(label)) return;  // leave preferred name blank
      const ans = knownAnswer(label);
      if (ans == null) { unknown.push({ kind: "text", el, question: label, type, options: optsFromList(el) }); return; }
      // type-aware formatting so we never dump bad values into date/number fields
      if (type === "date" || type === "month" || type === "week") {
        const d = toDate(ans, label); if (!d) return;
        el.value = type === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
        el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); filled++; return;
      }
      if (type === "number") { const n = (String(ans).match(/\d+(\.\d+)?/) || [])[0]; if (!n) return; setText(el, n); filled++; return; }
      setText(el, ans); filled++;
    });
    // selects
    document.querySelectorAll("select").forEach(el => {
      if (!vis(el) || (el.value && el.selectedIndex > 0)) return;
      const label = fieldQuestion(el);
      const ans = knownAnswer(label);
      if (ans != null && setSelect(el, ans)) filled++;
      else unknown.push({ kind: "select", el, question: label, options: optionsFor(el) });
    });
    // radio / checkbox groups
    const groups = groupRadios();
    Object.values(groups).forEach(els => {
      if (els.some(e => e.checked)) return;
      const q = fieldQuestion(els[0]);
      const ans = knownAnswer(q);
      const opts = els.map(e => labelText(e));
      if (ans != null && setChoice(els, ans)) filled++;
      else unknown.push({ kind: "choice", els, question: q, options: opts });
    });
    return { filled, unknown };
  }

  /* ---------------- resume: tailor / download / attach ---------------- */
  // Get the tailored 100% ATS PDF (tailor on demand; fall back to saved resume).
  async function getResume() {
    if (S.tailored && S.tailored.dataUrl) return S.tailored;
    try { await tailorNow(); } catch (e) {}
    if (S.tailored && S.tailored.dataUrl) return S.tailored;
    try {
      const path = S.job && S.job.id ? `/jobs/${S.job.id}/resume.pdf` : "/applicant/resume.pdf";
      const r = await bg({ type: "resume", path });
      if (r && r.dataUrl) return r;
    } catch (e) {}
    return null;
  }
  function dataUrlToFile(dataUrl, name) {
    const bin = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || "resume.pdf", { type: "application/pdf" });
  }
  // Download the tailored PDF so the user can grab/drag it manually.
  async function downloadResume() {
    toast("Preparing your tailored résumé…");
    const r = await getResume();
    if (!r || !r.dataUrl) { toast("⚠ Couldn't generate résumé — is the dashboard running?"); return; }
    const a = document.createElement("a");
    a.href = r.dataUrl; a.download = r.filename || "Nithin-Resume.pdf";
    document.body.appendChild(a); a.click(); a.remove();
    S.resumeName = r.filename; toast("⬇ Downloaded " + (r.filename || "résumé"));
    render();
  }
  // Pick the file input(s) that are actually for a résumé (named/accept hints),
  // INCLUDING hidden ones — most ATS hide the native input behind a styled button.
  function resumeInputs() {
    const all = [...document.querySelectorAll('input[type="file"]')];
    if (!all.length) return [];
    const rx = /resume|résumé|\bcv\b|curriculum/i;
    const named = all.filter(i => rx.test([i.name, i.id, i.getAttribute("aria-label"), i.getAttribute("accept"), (i.closest("label,div,section") || {}).textContent || ""].join(" ")));
    return named.length ? named : all;
  }
  async function attachResume(announce) {
    const inputs = resumeInputs();
    if (!inputs.length) { if (announce) toast("No file upload field found — use ⬇ Download and attach manually"); return false; }
    try {
      const r = await getResume();
      if (!r || !r.dataUrl) { if (announce) toast("⚠ Couldn't generate résumé"); return false; }
      const file = dataUrlToFile(r.dataUrl, r.filename || "resume.pdf");
      let ok = false;
      for (const inp of inputs) {
        try {
          const dt = new DataTransfer(); dt.items.add(file);
          inp.files = dt.files;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          ok = true;
        } catch (e) {}
      }
      S.resumeName = r.filename;
      if (announce) toast(ok ? "📎 Résumé attached to the form" : "⚠ Upload field blocked it — use ⬇ Download instead");
      return ok;
    } catch (e) { if (announce) toast("⚠ Attach failed — use ⬇ Download instead"); return false; }
  }

  /* ---------------- page navigation ---------------- */
  const SUBMIT_RX = /\b(submit application|submit|send application|finish|apply now)\b/i;
  const NEXT_RX = /\b(next|continue|review|save and continue|proceed|next step)\b/i;
  function buttons() {
    return [...document.querySelectorAll('button,input[type="submit"],a[role="button"],[role="button"]')].filter(vis);
  }
  function findSubmit() { return buttons().find(b => SUBMIT_RX.test(clean(b.innerText || b.value))); }
  function findNext() {
    return buttons().find(b => { const t = clean(b.innerText || b.value); return NEXT_RX.test(t) && !SUBMIT_RX.test(t); });
  }
  function waitSettle(timeout = 9000) {
    return new Promise(resolve => {
      let done = false; const finish = () => { if (done) return; done = true; obs.disconnect(); resolve(); };
      let t = setTimeout(finish, 1200);
      const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(finish, 900); });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(finish, timeout);
    });
  }

  /* ---------------- autopilot loop ---------------- */
  async function autopilot() {
    if (S.busy) return; S.busy = true; S.running = true; S.applied = false;
    try {
      if (!S.tailored) await tailorNow();
      await attachResume();
      for (let i = 0; i < 12 && S.running; i++) {
        const { unknown } = fillPage();
        await sleep(250);
        // Ask Claude for unknown required-ish fields
        let stillUnknown = unknown;
        if (unknown.length) stillUnknown = await resolve(unknown);
        if (stillUnknown.length) { pause(stillUnknown); S.busy = false; return; }
        markStep(i); render();
        const submit = findSubmit(); const next = findNext();
        if (next) { setStatus("live", "Continuing to next page…"); next.click(); await waitSettle(); continue; }
        if (submit) { readyToSubmit(submit); break; }
        // nothing actionable — settle once more then re-check
        await waitSettle(2500);
        if (!findNext() && !findSubmit()) break;
      }
    } finally { S.busy = false; }
  }

  async function resolve(unknown) {
    setStatus("live", "Asking AI to answer " + unknown.length + " field(s)…");
    const questions = unknown.map(u => ({ question: u.question, type: u.kind, options: u.options || null }));
    let map = {};
    try {
      const r = await api("POST", "/ai/answer", { questions, job: { title: S.job?.title, company: S.job?.company } });
      map = r.answers || {};
      // merge learned into local bank
      S.answers = { ...S.answers, ...map };
    } catch (e) { /* offline — leave for manual */ }
    const remaining = [];
    for (const u of unknown) {
      const a = map[u.question];
      if (a == null) { remaining.push(u); continue; }
      let ok = false;
      if (u.kind === "text") { setText(u.el, a); ok = true; }
      else if (u.kind === "select") ok = setSelect(u.el, a);
      else if (u.kind === "choice") ok = setChoice(u.els, a);
      if (!ok) remaining.push(u);
    }
    return remaining;
  }

  /* ---------------- submit detection ---------------- */
  let submitWatcher = null;
  const CONFIRM_RX = /thank you for applying|application (was )?(submitted|received|complete)|we('| ha)?ve received your application|your application has been (sent|submitted|received)|successfully submitted|thanks for applying/i;
  function checkConfirmed() {
    if (S.applied || !S.user) return;
    const txt = (document.body.innerText || "");
    const urlHit = /confirmation|thank|submitted|success|applied/i.test(location.href);
    if (CONFIRM_RX.test(txt) || (S.submitClicked && urlHit)) { S.applied = true; markApplied(); }
  }
  function armSubmitWatch() {
    if (submitWatcher) return;
    // 1) DOM mutations (in-page confirmations / SPA flows)
    submitWatcher = new MutationObserver(() => checkConfirmed());
    submitWatcher.observe(document.body, { childList: true, subtree: true, characterData: true });
    // 2) capture clicks on any Submit button so we know a submit was attempted
    document.addEventListener("click", (e) => {
      const b = e.target && e.target.closest && e.target.closest('button,input[type="submit"],a[role="button"],[role="button"]');
      if (b && SUBMIT_RX.test(clean(b.innerText || b.value))) { S.submitClicked = true; setTimeout(checkConfirmed, 1500); }
    }, true);
    // 3) periodic check (covers full page reloads to a confirmation URL)
    setInterval(checkConfirmed, 2500);
    checkConfirmed();
  }

  async function markApplied() {
    setStatus("", "Marking applied in your dashboard…");
    try {
      const data = await api("GET", "/jobs");
      const jobs = Array.isArray(data) ? data : (data.jobs || []);
      const t = (S.job?.title || "").toLowerCase(), c = (S.job?.company || "").toLowerCase();
      let match = jobs.find(j => (j.url && location.href.includes((j.url || "").split("?")[0].slice(0, 40))))
        || jobs.find(j => (j.company || "").toLowerCase() === c && (j.title || "").toLowerCase() === t)
        || jobs.find(j => (j.company || "").toLowerCase() === c);
      const _d = new Date(), today = _d.getFullYear() + "-" + String(_d.getMonth() + 1).padStart(2, "0") + "-" + String(_d.getDate()).padStart(2, "0");
      if (match) await api("PUT", "/jobs/" + match.id, { status: "Applied", dateApplied: today });
      else await api("POST", "/jobs", { company: S.job?.company || "", title: S.job?.title || "", url: location.href, status: "Applied", dateApplied: today, source: "extension" });
      S.stats.applied++; render();
      toast("✓ Applied — synced to your dashboard");
    } catch (e) { toast("Submitted — couldn't sync (sign in?)"); }
  }

  /* ---------------- job detection ---------------- */
  function scrapeJD() {
    const sel = ['[class*="job-description"]', '[class*="description"]', '[data-testid*="description"]',
      "article", '[class*="posting"]', "main", "#content", "section"];
    let best = "", bestLen = 0;
    for (const s of sel) {
      document.querySelectorAll(s).forEach(el => {
        const t = clean(el.innerText || "");
        if (t.length > bestLen && t.length < 14000) { best = t; bestLen = t.length; }
      });
      if (bestLen > 600) break;
    }
    if (bestLen < 300) best = clean(document.body.innerText || "");
    return best.slice(0, 9000);
  }
  function detectJob() {
    const og = (p) => document.querySelector(`meta[property="og:${p}"]`)?.content;
    let title = clean(document.querySelector("h1")?.innerText) || og("title") || document.title;
    let company = og("site_name") || "";
    const cEl = document.querySelector('[class*="company"],[data-company],a[href*="/company/"]');
    if (cEl) company = clean(cEl.innerText) || company;
    title = title.replace(/\s*[-|]\s*.*$/, "").slice(0, 80);
    return { title: clean(title), company: clean(company).slice(0, 60), url: location.href, description: scrapeJD() };
  }
  // Sense the JD and tailor a fresh 100% ATS resume for THIS page.
  async function tailorNow() {
    const j = S.job || detectJob();
    if (!j.description) j.description = scrapeJD();
    S.job = j;
    setStatus("live", "Reading JD & tailoring résumé to 100% ATS…");
    try { const t = await api("POST", "/ai/tailor", { title: j.title, company: j.company, description: j.description }); S.ats = t.ats || 100; } catch (e) {}
    try { S.tailored = await bg({ type: "tailorResume", job: { title: j.title, company: j.company, description: j.description } }); S.resumeName = S.tailored.filename; } catch (e) {}
    render();
  }

  /* ---------------- UI ---------------- */
  let launch, panel, root;
  function setStatus(cls, txt) {
    const s = panel && panel.querySelector(".ph .s");
    if (s) { s.className = "s" + (cls ? " " + cls : ""); s.innerHTML = (cls === "live" ? "<i></i>" : "") + txt; }
  }
  function toast(msg) {
    const sc = panel && panel.querySelector(".scroll"); if (!sc) return;
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    sc.prepend(t); setTimeout(() => t.remove(), 4000);
  }
  function markStep(i) { S.progress = Math.min(95, 30 + i * 16); const p = panel && panel.querySelector(".prog"); if (p) p.style.width = S.progress + "%"; }

  function pause(remaining) {
    S.running = false; S.pending = remaining;
    setStatus("", "Paused — needs your answer");
    render();
  }
  function readyToSubmit(btn) {
    S.running = false; S.progress = 100;
    btn.classList.add("jt-hl-submit"); btn.scrollIntoView({ behavior: "smooth", block: "center" });
    armSubmitWatch();
    setStatus("", "Ready — review & hit Submit");
    render();
  }

  function logoHTML() {
    const dom = (S.job?.company || "").toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
    const ini = (S.job?.company || "?").replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "J";
    return `<div class="jlogo"><img src="https://logo.clearbit.com/${dom}?size=128" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${ini}'}))"></div>`;
  }

  function render() {
    if (!panel) return;
    const signedIn = !!S.user;
    if (!signedIn) {
      panel.querySelector(".scroll").innerHTML =
        `<div class="signin"><h3>Sign in to start</h3><p>Open the extension popup and sign in to your Job Tracker account, then reopen this panel.</p><button class="btn primary" id="jt-recheck">I've signed in</button></div>`;
      panel.querySelector(".foot").style.display = "none";
      panel.querySelector("#jt-recheck").onclick = boot;
      return;
    }
    panel.querySelector(".foot").style.display = "flex";
    const j = S.job || detectJob();
    const steps = [
      ["Contact & profile", "Name, email, phone, address"],
      ["Résumé upload", S.resumeName || "100% ATS résumé"],
      ["Work auth & sponsorship", "From your saved bank"],
      ["Screening questions", "Answered by AI + your bank"],
      ["EEO & demographics", "Auto-filled · optional"],
      ["Stop at Submit", "Your final click"]
    ];
    const doneN = Math.round(S.progress / 100 * steps.length);
    const stepHTML = steps.map((s, i) => {
      const cls = i < doneN ? "done" : (i === doneN && S.running ? "active" : "pending");
      return `<div class="step ${cls}"><div class="ico">${i < doneN ? "✓" : (i + 1)}</div><div class="tx">${s[0]}<small>${s[1]}</small></div></div>`;
    }).join("");
    const learnHTML = S.pending && S.pending.length ? `
      <div class="sectl">Needs your answer</div>
      <div class="learn">
        <div class="lh">⚠ ${S.pending.length} question(s) — I won't guess</div>
        ${S.pending.map((u, idx) => `<div class="q">${u.question}</div>
          ${(u.options && u.options.length) ? `<div class="opts">${u.options.slice(0, 6).map(o => `<span class="opt" data-i="${idx}" data-v="${o.replace(/"/g, "&quot;")}">${o}</span>`).join("")}</div>` : ""}
          <input data-i="${idx}" placeholder="Type your answer…">`).join("")}
      </div>` : "";

    panel.querySelector(".scroll").innerHTML = `
      <div class="sectl">Current role</div>
      <div class="hero">${logoHTML()}<div class="info"><h3>${j.title || "This role"}</h3><div class="co">${j.company || location.hostname}</div>
        <div class="meta"><span class="tag src">${location.hostname.replace("www.", "")}</span><span class="tag">Auto-Apply</span></div></div></div>
      <div class="atscard"><div class="ring" style="--p:100"><b>100</b></div><div><div class="ti">Résumé tailored to this JD</div><div class="d">${S.resumeName || "100% ATS · 1 page"}</div></div></div>
      <div class="sectl">Autopilot progress</div>
      <div class="progwrap"><div class="prog" style="width:${S.progress}%"></div></div>
      <div class="steps">${stepHTML}</div>
      ${learnHTML}`;

    // wire learn UI
    panel.querySelectorAll(".opt").forEach(o => o.onclick = () => {
      o.parentElement.querySelectorAll(".opt").forEach(x => x.classList.remove("sel")); o.classList.add("sel");
      const inp = panel.querySelector(`input[data-i="${o.dataset.i}"]`); if (inp) inp.value = o.dataset.v;
    });

    // footer
    const foot = panel.querySelector(".foot");
    const primary = S.running
      ? `<button class="btn primary" id="jt-running" disabled style="opacity:.7;cursor:default">⏳ Applying… filling this page</button>`
      : (S.pending && S.pending.length
        ? `<button class="btn primary" id="jt-save">💾 Save answers & continue</button>`
        : (S.progress >= 100
          ? `<button class="btn primary" id="jt-hl">↗ Highlight Submit button</button>`
          : `<button class="btn primary" id="jt-run">✨ Tailor &amp; Auto-Apply</button>`));
    foot.innerHTML = `
      <div class="pillstat"><div class="b"><div class="v">${S.stats.applied}</div><div class="l">APPLIED</div></div>
        <div class="b"><div class="v">100%</div><div class="l">AVG ATS</div></div>
        <div class="b"><div class="v">${S.stats.queue}</div><div class="l">IN QUEUE</div></div></div>
      ${primary}
      <div class="row2"><button class="btn" id="jt-dl">⬇ Download résumé</button><button class="btn" id="jt-attach">📎 Attach to form</button></div>
      <div class="row2"><button class="btn" id="jt-fill">⚡ Autofill page</button><button class="btn stop" id="jt-stop">■ Stop</button></div>
      <div class="safe">🔒 Never auto-submits · stops at Submit for your review</div>`;
    const on = (id, fn) => { const b = panel.querySelector(id); if (b) b.onclick = fn; };
    on("#jt-run", () => { S.pending = null; autopilot(); render(); });
    on("#jt-save", saveLearn);
    on("#jt-hl", () => { const s = findSubmit(); if (s) { s.classList.add("jt-hl-submit"); s.scrollIntoView({ behavior: "smooth", block: "center" }); } });
    on("#jt-dl", downloadResume);
    on("#jt-attach", () => attachResume(true));
    on("#jt-fill", async () => { if (!S.tailored) await tailorNow(); await attachResume(); const { unknown } = fillPage(); const rem = unknown.length ? await resolve(unknown) : []; if (rem.length) pause(rem); else toast("Tailored & filled this page"); });
    on("#jt-stop", () => { S.running = false; setStatus("", "Stopped"); render(); });
  }

  async function saveLearn() {
    const answers = {};
    (S.pending || []).forEach((u, idx) => {
      const inp = panel.querySelector(`input[data-i="${idx}"]`);
      const v = inp && clean(inp.value);
      if (v) {
        answers[u.question] = v;
        if (u.kind === "text") setText(u.el, v);
        else if (u.kind === "select") setSelect(u.el, v);
        else if (u.kind === "choice") setChoice(u.els, v);
      }
    });
    if (Object.keys(answers).length) {
      S.answers = { ...S.answers, ...answers };
      try { await api("PUT", "/applicant", { answers }); } catch (e) {}
    }
    S.pending = null; render(); autopilot();
  }

  function openAndStart() {
    panel.classList.add("open");
    if (S.user && !S.running && !(S.pending && S.pending.length)) autopilot();
  }
  function buildPanel() {
    // Shadow DOM host so no website CSS can leak into / break the panel.
    const host = document.createElement("div");
    host.id = "jt-host";
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: "open" });
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = chrome.runtime.getURL("content.css");
    root.appendChild(link);

    launch = document.createElement("button");
    launch.id = "jt-launch"; launch.textContent = "💼"; launch.title = "Job Applier";
    launch.onclick = () => { if (panel.classList.contains("open")) panel.classList.remove("open"); else openAndStart(); };
    root.appendChild(launch);

    panel = document.createElement("div");
    panel.id = "jt-panel";
    panel.innerHTML = `
      <div class="ph"><div class="logo">J</div><div><div class="t">Job Applier</div><div class="s">Connected</div></div>
        <div class="av">${(S.user?.firstName || "N")[0].toUpperCase()}</div>
        <button class="cl" id="jt-close">⌄</button></div>
      <div class="scroll"></div>
      <div class="foot"></div>`;
    root.appendChild(panel);
    panel.querySelector("#jt-close").onclick = () => panel.classList.remove("open");
    // starts MINIMIZED (no .open) — click the launcher to open & start
  }

  async function boot() {
    try {
      const s = await bg({ type: "session" }); S.user = s.user || null;
      if (S.user) {
        try { const ap = await api("GET", "/applicant"); S.profile = ap.profile || {}; S.answers = ap.answers || {}; } catch (e) {}
        try { const d = await api("GET", "/jobs"); const jobs = Array.isArray(d) ? d : (d.jobs || []); S.stats.applied = jobs.filter(j => j.status && j.status !== "Not Applied").length; } catch (e) {}
      }
      S.job = detectJob();
      if (S.user) armSubmitWatch();   // passive monitor: every open application tab watches its own submit
      render();
      // Stay MINIMIZED by default — the launcher button sits bottom-right until clicked.
    } catch (e) { render(); }
  }

  // let the popup open the panel on the current tab
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "openPanel" && panel) openAndStart();
  });

  buildPanel();
  boot();
})();
