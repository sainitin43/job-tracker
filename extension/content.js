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
  function setSelect(el, val, label) {
    let best = null, bs = 39;
    [...el.options].forEach((o, i) => { if (i === 0 && !o.value) return; const sc = scoreOption(val, o.text, label || ""); if (sc > bs) { bs = sc; best = o; } });
    if (!best) return false;
    el.value = best.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function setChoice(groupEls, val, label) {
    // Pick the BEST-scoring option (never the first loose substring match), so
    // "Male" never selects "Female" and "No" never selects "I prefer not to say".
    let best = null, bs = 39;
    for (const el of groupEls) { const sc = scoreOption(val, labelText(el), label || ""); if (sc > bs) { bs = sc; best = el; } }
    if (!best) return null;
    best.click();
    best.dispatchEvent(new Event("change", { bubbles: true }));
    return best;
  }
  /* ---------------- live highlight + filled-field log ---------------- */
  function highlightField(el, ok) {
    if (!el || !el.classList) return;
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    el.classList.remove("jt-fill-done", "jt-fill-err");
    el.classList.add(ok === false ? "jt-fill-err" : "jt-fill-active");
    setTimeout(() => {
      el.classList.remove("jt-fill-active");
      if (ok !== false) { el.classList.add("jt-fill-done"); setTimeout(() => el.classList.remove("jt-fill-done"), 2600); }
      else setTimeout(() => el.classList.remove("jt-fill-err"), 2600);
    }, 700);
  }
  function logFill(label, value, kind, via) {
    S.filledLog = S.filledLog || [];
    const key = (label || "").toLowerCase().slice(0, 70);
    const entry = { key, label: clean(label).slice(0, 70), value: String(value == null ? "" : value).slice(0, 160), kind, via: via || "profile" };
    const ex = S.filledLog.find(x => x.key === key);
    if (ex) Object.assign(ex, entry); else S.filledLog.push(entry);
    render();
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
    if (has("willing to work", "work from the office", "office(s) listed", "work onsite", "in-office", "commute")) return "Yes";
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

  // Fill native fields ONE BY ONE, highlighting and logging each as it goes.
  async function fillPage() {
    let filled = 0; const unknown = [];
    // 1) text / email / tel / textarea / date / number (in DOM order)
    for (const el of [...document.querySelectorAll("input,textarea")]) {
      if (!S.running && S.autopilotMode) break;
      const type = (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "file", "radio", "checkbox", "password"].includes(type)) continue;
      if (!vis(el) || el.value) continue;
      if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") || el.closest('[class*="select__control"],[class*="-control"],[class*="select__"]')) continue;
      const label = labelText(el);
      if (!label) continue;
      if (/preferred (name|first)/i.test(label)) continue;
      const ans = knownAnswer(label);
      const long = type === "textarea" || /describe|explain|tell us|why (do|are|should)|how (would|do) you|give an example|provide an example|\bexample\b|\d+\s*[-–]?\s*\d*\s*(sentence|word|paragraph)|cover letter|what (interests|excites|motivat)|in your own words/i.test(label);
      if (ans == null) { unknown.push({ kind: "text", el, question: label, type, long, options: optsFromList(el) }); continue; }
      let val = ans;
      if (type === "date" || type === "month" || type === "week") {
        const d = toDate(ans, label); if (!d) continue;
        val = type === "month" ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10);
        el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (type === "number") { const n = (String(ans).match(/\d+(\.\d+)?/) || [])[0]; if (!n) continue; val = n; setText(el, n); }
      else setText(el, ans);
      highlightField(el, true); logFill(label, val, "text"); filled++;
      await sleep(190);
    }
    // 2) native selects
    for (const el of [...document.querySelectorAll("select")]) {
      if (!vis(el) || (el.value && el.selectedIndex > 0)) continue;
      const label = fieldQuestion(el);
      const ans = knownAnswer(label);
      if (ans != null && setSelect(el, ans, label)) { highlightField(el, true); logFill(label, (el.options[el.selectedIndex] || {}).text, "select"); filled++; await sleep(190); }
      else unknown.push({ kind: "select", el, question: label, options: optionsFor(el) });
    }
    // 3) radio / checkbox groups
    for (const els of Object.values(groupRadios())) {
      if (els.some(e => e.checked)) continue;
      const q = fieldQuestion(els[0]);
      const ans = knownAnswer(q);
      const picked = ans != null ? setChoice(els, ans, q) : null;
      if (picked) { highlightField(picked, true); logFill(q, labelText(picked), "choice"); filled++; await sleep(190); }
      else unknown.push({ kind: "choice", els, question: q, options: els.map(e => labelText(e)) });
    }
    return { filled, unknown };
  }

  /* ---------------- custom dropdowns / comboboxes (React-Select, ARIA) ----------------
     Greenhouse/Workday/Lever render Country, Location (typeahead), gender, race, etc.
     as custom widgets — not native <select>. We open, optionally type to filter,
     wait for the option list, then click the best-matching option. */
  const US_STATE_NAMES = { ca:"california", ny:"new york", tx:"texas", wa:"washington", va:"virginia", il:"illinois", ma:"massachusetts", ga:"georgia", nj:"new jersey", pa:"pennsylvania", co:"colorado", fl:"florida", nc:"north carolina", az:"arizona", or:"oregon", mn:"minnesota", oh:"ohio", mi:"michigan" };
  function comboValueText(ctrl) {
    const sv = ctrl.querySelector('[class*="singleValue"],[class*="single-value"],[class*="multiValue"]');
    if (sv && clean(sv.innerText)) return clean(sv.innerText);
    const inp = ctrl.querySelector("input");
    return inp && inp.value ? clean(inp.value) : "";
  }
  function findCombos() {
    const out = [], seen = new Set();
    const ctrls = [
      ...document.querySelectorAll('[class*="select__control"],[class*="-control"]'),
      ...document.querySelectorAll('[role="combobox"]'),
      ...document.querySelectorAll('[aria-haspopup="listbox"]')
    ];
    for (const c of ctrls) {
      if (c.tagName === "SELECT") continue;
      const ctrl = c.closest('[class*="select__control"],[class*="-control"]') || c;
      if (seen.has(ctrl) || !vis(ctrl)) continue; seen.add(ctrl);
      out.push(ctrl);
    }
    return out;
  }
  // Score how well an option text matches the desired value for this question.
  function scoreOption(desired, optText, label) {
    const d = clean(desired).toLowerCase(), o = clean(optText).toLowerCase(), L = (label || "").toLowerCase();
    if (!o) return -1;
    let s = 0;
    if (o === d) s = 100;
    else if (o.includes(d) || d.includes(o)) s = 72;
    else { const dt = d.split(/[^a-z0-9]+/).filter(Boolean), ot = new Set(o.split(/[^a-z0-9]+/).filter(Boolean)); const ov = dt.filter(t => ot.has(t)).length; s = ov ? 40 + ov * 6 : 0; }
    if (/gender/.test(L) && !/pronoun/.test(L)) {
      const dMale = /^(male|man|cis(gender)? man)/.test(d), dFemale = /^(female|woman|cis(gender)? woman)/.test(d);
      const oMale = /\b(man|male)\b/.test(o), oFemale = /\b(woman|female)\b/.test(o);
      if (dMale) { if (oFemale) return -1; if (oMale && !/non-?binary|trans/.test(o)) s = Math.max(s, 96); }
      if (dFemale) { if (oMale && !oFemale) return -1; if (oFemale) s = Math.max(s, 96); }
    }
    // never let a substring like "feMALE"⊃"male" or "Not to say"⊃"no" win a vote
    if (s === 72 && d.length <= 3 && !new RegExp("\\b" + d.replace(/[^a-z0-9]/g, "") + "\\b").test(o)) s = 0;
    if (/pronoun/.test(L)) { if (/he/.test(d) && /\bhe\b/.test(o) && !/she|they/.test(o)) s = Math.max(s, 94); }
    if (/military|veteran/.test(L)) { if (/not|never|no\b/.test(d) && /(never served|not a veteran|no, i)/.test(o)) s = Math.max(s, 94); }
    if (/disab|chronic|long-?lasting|condition/.test(L)) { if (/^no|do not|don'?t|^no,/.test(d) && /(do not have a disabil|don'?t have a disabil|no disab|^no\b|never had)/.test(o)) s = Math.max(s, 92); }
    if (/city|location/.test(L)) {
      if (/united states|, us\b|\busa\b/.test(o)) s += 16;
      const st = (S.profile && S.profile.state || "").toLowerCase();
      const stn = US_STATE_NAMES[st];
      if (st && (new RegExp(",\\s*" + st + "\\b").test(o) || (stn && o.includes(stn)))) s += 10;
    }
    return s;
  }
  function currentOptions() {
    return [...document.querySelectorAll('[role="option"],[class*="select__option"],[class*="-option"],[class*="menu"] [id*="option"]')].filter(vis);
  }
  function waitOptions(timeout) {
    return new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { const o = currentOptions(); if (o.length || Date.now() - t0 > timeout) { clearInterval(iv); res(o); } }, 80); });
  }
  function typeQuery(desired, label) {
    const L = (label || "").toLowerCase();
    if (/city|location/.test(L)) return (S.profile && S.profile.city) || desired.split(",")[0];
    return desired.split(",")[0].slice(0, 24);
  }
  async function selectCombo(ctrl, desired, label) {
    try {
      ctrl.scrollIntoView({ block: "center" });
      const input = ctrl.querySelector("input");
      (input || ctrl).focus();
      ctrl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      ctrl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      if (ctrl.click) ctrl.click();
      // 1) try options already shown (static dropdowns: gender, race, yes/no)
      let opts = await waitOptions(900);
      let pick = bestPick(desired, label, opts);
      // 2) typeahead (City, Country) — type to filter / trigger async options
      if (!pick && input) {
        setText(input, typeQuery(desired, label));
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
        opts = await waitOptions(2600);
        pick = bestPick(desired, label, opts);
      }
      if (pick) {
        pick.scrollIntoView({ block: "center" });
        pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        pick.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        pick.click();
        await sleep(140);
        return true;
      }
      (input || ctrl).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      return false;
    } catch (e) { return false; }
  }
  function bestPick(desired, label, opts) {
    let best = null, bestScore = 39; // require a real match
    for (const o of opts) { const sc = scoreOption(desired, o.innerText || o.textContent, label); if (sc > bestScore) { bestScore = sc; best = o; } }
    return best;
  }
  async function fillCombos() {
    let filled = 0; const unknown = [];
    for (const ctrl of findCombos()) {
      if (comboValueText(ctrl)) continue;                 // already has a value
      const label = fieldQuestion(ctrl) || labelText(ctrl);
      if (!label || /preferred (name|first)/i.test(label)) continue;
      const ans = knownAnswer(label);
      if (ans == null) { unknown.push({ kind: "combo", ctrl, question: label, options: [] }); continue; }
      highlightField(ctrl, true);
      const ok = await selectCombo(ctrl, ans, label);
      if (ok) { logFill(label, comboValueText(ctrl) || ans, "combo"); filled++; }
      else { highlightField(ctrl, false); unknown.push({ kind: "combo", ctrl, question: label, options: [] }); }
      await sleep(190);
    }
    return { filled, unknown };
  }
  // Full page fill = native fields + custom dropdowns, each highlighted one by one.
  async function fillAll() {
    const a = await fillPage();
    const b = await fillCombos();
    return { filled: a.filled + b.filled, unknown: a.unknown.concat(b.unknown) };
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
    if (S.busy) return; S.busy = true; S.running = true; S.applied = false; S.autopilotMode = true; S.filledLog = []; render();
    try {
      if (!S.tailored) await tailorNow();
      await attachResume();
      for (let i = 0; i < 12 && S.running; i++) {
        const { unknown } = await fillAll();
        await sleep(250);
        // Ask Claude for unknown required-ish fields
        let stillUnknown = unknown;
        if (unknown.length) stillUnknown = await resolve(unknown);
        if (stillUnknown.length) { pause(stillUnknown); S.busy = false; S.autopilotMode = false; return; }
        markStep(i); render();
        const submit = findSubmit(); const next = findNext();
        if (next) { setStatus("live", "Continuing to next page…"); next.click(); await waitSettle(); continue; }
        if (submit) { readyToSubmit(submit); break; }
        // nothing actionable — settle once more then re-check
        await waitSettle(2500);
        if (!findNext() && !findSubmit()) break;
      }
    } finally { S.busy = false; S.autopilotMode = false; render(); }
  }

  async function resolve(unknown) {
    setStatus("live", "Asking AI to answer " + unknown.length + " field(s)…");
    const questions = unknown.map(u => ({ question: u.question, type: u.kind, long: !!u.long, options: u.options || null }));
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
      let ok = false, target = u.el;
      if (u.kind === "text") { setText(u.el, a); ok = true; }
      else if (u.kind === "select") ok = setSelect(u.el, a, u.question);
      else if (u.kind === "choice") { const p = setChoice(u.els, a, u.question); ok = !!p; target = p || u.els[0]; }
      else if (u.kind === "combo") { ok = await selectCombo(u.ctrl, a, u.question); target = u.ctrl; }
      if (ok) { highlightField(target, true); logFill(u.question, a, u.kind, "AI"); await sleep(160); }
      else remaining.push(u);
    }
    return remaining;
  }

  /* ---------------- submit detection ---------------- */
  let submitWatcher = null, syncing = false;
  const CONFIRM_RX = /thank you for applying|application (was )?(submitted|received|complete)|we('| ha)?ve received your application|your application (has been|was) (sent|submitted|received)|successfully (submitted|applied)|thanks for applying|application complete|you('| ha)?ve (successfully )?applied/i;
  function onSubmitAttempt() {
    S.submitClicked = true;
    S.submitUrl = location.href;
    setStatus("live", "Submit detected — watching for confirmation…");
    [700, 1600, 3200, 6000, 9000].forEach(ms => setTimeout(checkConfirmed, ms));
  }
  function checkConfirmed() {
    if (S.applied || !S.user) return;
    const txt = (document.body.innerText || "");
    const confirmText = CONFIRM_RX.test(txt);
    const urlHit = /confirmation|thank|submitted|success|applied|complete/i.test(location.href);
    const navigated = S.submitClicked && S.submitUrl && location.href !== S.submitUrl;
    // Apply form is gone after a submit click → treat as submitted.
    const formGone = S.submitClicked && !findSubmit() && [...document.querySelectorAll('input[type="file"]')].length === 0;
    if (confirmText || (S.submitClicked && (urlHit || navigated || formGone))) markApplied();
  }
  function armSubmitWatch() {
    if (submitWatcher) return;
    // 1) DOM mutations (in-page confirmations / SPA flows)
    submitWatcher = new MutationObserver(() => checkConfirmed());
    submitWatcher.observe(document.body, { childList: true, subtree: true, characterData: true });
    // 2) capture clicks on any Submit button — and native form submits
    document.addEventListener("click", (e) => {
      const b = e.target && e.target.closest && e.target.closest('button,input[type="submit"],a[role="button"],[role="button"]');
      if (b && SUBMIT_RX.test(clean(b.innerText || b.value))) onSubmitAttempt();
    }, true);
    document.addEventListener("submit", onSubmitAttempt, true);
    // 3) periodic check (covers full page reloads to a confirmation URL)
    setInterval(checkConfirmed, 2500);
    checkConfirmed();
  }

  // Mark this job Applied in the dashboard. `manual` = user pressed the button.
  async function markApplied(manual) {
    if ((S.applied && !manual) || syncing) return;
    if (!S.user) { toast("Sign in to sync — open the popup and log in"); return; }
    syncing = true; S.applied = true; render();
    setStatus("", "Marking applied in your dashboard…");
    try {
      const data = await api("GET", "/jobs");
      const jobs = Array.isArray(data) ? data : (data.jobs || []);
      const here = (location.href || "").split("?")[0];
      const t = (S.job?.title || "").toLowerCase(), c = (S.job?.company || "").toLowerCase();
      let match = jobs.find(j => j.url && here && (j.url.split("?")[0] === here || here.includes(j.url.split("?")[0].slice(0, 40))))
        || jobs.find(j => c && (j.company || "").toLowerCase() === c && (j.title || "").toLowerCase() === t)
        || jobs.find(j => c && (j.company || "").toLowerCase() === c && !["Applied", "Interviewing", "Offer"].includes(j.status));
      const _d = new Date(), today = _d.getFullYear() + "-" + String(_d.getMonth() + 1).padStart(2, "0") + "-" + String(_d.getDate()).padStart(2, "0");
      if (match) await api("PUT", "/jobs/" + match.id, { status: "Applied", dateApplied: today });
      else await api("POST", "/jobs", { company: S.job?.company || detectJob().company || "", title: S.job?.title || detectJob().title || "", url: location.href, status: "Applied", dateApplied: today, source: "extension", description: (S.job && S.job.description) || "" });
      S.stats.applied = (S.stats.applied || 0) + (match ? 0 : 1);
      setStatus("", "✓ Applied — synced to your dashboard");
      toast("✓ Applied to " + (S.job?.company || "this role") + " — dashboard updated");
    } catch (e) { S.applied = false; toast("⚠ Couldn't sync to dashboard — is it signed in?"); }
    finally { syncing = false; render(); }
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
  function titleCase(s) { return clean(decodeURIComponent(s || "").replace(/[-_]+/g, " ")).replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60); }
  // Derive the company from the application URL — the most reliable signal on ATS pages.
  function companyFromUrl() {
    const h = location.hostname, p = location.pathname;
    let slug = "";
    if (/greenhouse\.io/.test(h)) { const m = p.match(/\/([^\/]+)\/jobs\b/) || p.match(/^\/([^\/]+)\//); slug = m && m[1]; }
    else if (/lever\.co/.test(h)) { const m = p.match(/^\/([^\/]+)\//); slug = m && m[1]; }
    else if (/ashbyhq\.com/.test(h)) { const m = p.match(/^\/([^\/]+)\//); slug = m && m[1]; }
    else if (/smartrecruiters\.com/.test(h)) { const m = p.match(/^\/([^\/]+)\//); slug = m && m[1]; }
    else if (/myworkdayjobs\.com|workday/.test(h)) { slug = h.split(".")[0]; }
    else if (/icims\.com|jobvite\.com|breezy\.hr|bamboohr\.com|workable\.com|recruitee\.com|teamtailor\.com|jobs\.|careers\./.test(h)) {
      const parts = h.replace(/^www\./, "").split("."); slug = parts.length > 2 ? parts[parts.length - 3] : parts[0];
      if (/jobs|careers|boards|apply|job-boards/.test(slug)) slug = parts.length > 2 ? parts[parts.length - 2] : "";
    }
    const bad = /^(jobs|careers|boards|apply|www|job-boards|secure|app|api|recruiting|talent|workforcenow)$/i;
    if (slug && !bad.test(slug) && slug.length > 1) return titleCase(slug);
    return "";
  }
  function detectJob() {
    const og = (p) => document.querySelector(`meta[property="og:${p}"]`)?.content;
    let title = clean(document.querySelector("h1")?.innerText) || og("title") || document.title;
    // company: explicit element → og:site_name → URL slug → registrable domain
    let company = "";
    const cEl = document.querySelector('[class*="company-name"],[data-company],[itemprop="hiringOrganization"]');
    if (cEl) company = clean(cEl.innerText);
    if (!company) company = clean(og("site_name") || "");
    if (!company || /greenhouse|lever|ashby|workday|smartrecruiters|icims|jobs|careers/i.test(company)) {
      const fromUrl = companyFromUrl(); if (fromUrl) company = fromUrl;
    }
    title = title.replace(/\s*[-|–—]\s*.*$/, "").slice(0, 80);
    return { title: clean(title), company: clean(company).slice(0, 60), url: location.href, description: scrapeJD() };
  }
  // Sense the JD and tailor a fresh 100% ATS resume for THIS page.
  async function tailorNow() {
    const j = S.job || detectJob();
    if (!j.description) j.description = scrapeJD();
    S.job = j;
    setStatus("live", "Reading JD & tailoring résumé to 100% ATS…");
    try { const t = await api("POST", "/ai/tailor", { title: j.title, company: j.company, description: j.description }); S.ats = t.ats || 100; S.changes = t.changes || []; S.keywords = t.keywords || []; S.tailoredStruct = t.resumeData || S.tailoredStruct; } catch (e) {}
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
    return `<div class="jlogo"><img src="https://www.google.com/s2/favicons?domain=${dom}&sz=128" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${ini}'}))"></div>`;
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
    const tabsHTML = `<div class="tabs">
      <button class="tab ${S.tab === "rewrite" ? "" : "on"}" data-tab="apply">⚡ Auto-Apply</button>
      <button class="tab ${S.tab === "rewrite" ? "on" : ""}" data-tab="rewrite">✦ AI Rewrite</button></div>`;
    if (S.tab === "rewrite") { renderRewrite(tabsHTML, j); return; }
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

    const fl = S.filledLog || [];
    const filledHTML = fl.length ? `<div class="sectl">Fields filled (${fl.length})</div>
      <div class="filled">${fl.slice(-50).map(f => `<div class="frow"><div class="fq">${f.label}</div><div class="fa">${f.value || "—"}${f.via === "AI" ? '<span class="aitag">AI</span>' : ""}</div></div>`).join("")}</div>` : "";
    panel.querySelector(".scroll").innerHTML = `
      ${tabsHTML}
      ${S.applied ? `<div class="appliedbanner">✓ Applied — synced to your dashboard</div>` : ""}
      <div class="sectl">Current role</div>
      <div class="hero">${logoHTML()}<div class="info"><h3>${j.title || "This role"}</h3><div class="co">${j.company || location.hostname}</div>
        <div class="meta"><span class="tag src">${location.hostname.replace("www.", "")}</span><span class="tag">Auto-Apply</span></div></div></div>
      <div class="atscard"><div class="ring" style="--p:${S.ats || 100}"><b>${S.ats || 100}</b></div><div><div class="ti">Résumé tailored to this JD</div><div class="d">${S.resumeName || "100% ATS · 1 page"}</div></div></div>
      ${(S.keywords && S.keywords.length) ? `<div class="sectl">ATS keywords matched (${S.keywords.length})</div><div class="kwwrap">${S.keywords.slice(0, 24).map(k => `<span class="kw">${k}</span>`).join("")}</div>` : ""}
      ${(S.changes && S.changes.length) ? `<div class="sectl">Résumé points rewritten for this JD (${S.changes.length})</div>
        <div class="diffs">${S.changes.slice(0, 8).map(c => `<div class="diff"><div class="dco">${c.company}</div><div class="dnew">${(c.after || "").slice(0, 240)}</div></div>`).join("")}</div>` : ""}
      <div class="sectl">Autopilot progress</div>
      <div class="progwrap"><div class="prog" style="width:${S.progress}%"></div></div>
      <div class="steps">${stepHTML}</div>
      ${filledHTML}
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
      <button class="btn ${S.applied ? "applied" : "markbtn"}" id="jt-applied">${S.applied ? "✓ Marked as applied" : "✓ I submitted — mark as applied"}</button>
      <div class="safe">🔒 Never auto-submits · stops at Submit for your review · auto-detects your submit</div>`;
    const on = (id, fn) => { const b = panel.querySelector(id); if (b) b.onclick = fn; };
    on("#jt-run", () => { S.pending = null; autopilot(); render(); });
    on("#jt-save", saveLearn);
    on("#jt-hl", () => { const s = findSubmit(); if (s) { s.classList.add("jt-hl-submit"); s.scrollIntoView({ behavior: "smooth", block: "center" }); } });
    on("#jt-dl", downloadResume);
    on("#jt-attach", () => attachResume(true));
    on("#jt-fill", async () => { S.filledLog = []; if (!S.tailored) await tailorNow(); await attachResume(); const { unknown } = await fillAll(); const rem = unknown.length ? await resolve(unknown) : []; if (rem.length) pause(rem); else toast("Tailored & filled this page"); });
    on("#jt-stop", () => { S.running = false; setStatus("", "Stopped"); render(); });
    on("#jt-applied", () => markApplied(true));
    wireTabs();
  }

  function wireTabs() {
    panel.querySelectorAll(".tab").forEach(t => t.onclick = () => { S.tab = t.dataset.tab; render(); });
  }

  /* ---------------- AI Rewrite chat tab ---------------- */
  const RW_CHIPS = [
    "Use stronger action verbs in my latest experience",
    "Shorten my summary to remove filler words",
    "Remove skills not related to this job",
    "Emphasize the keywords from this job description",
    "Make my bullets more quantified and impact-focused"
  ];
  function renderRewrite(tabsHTML, j) {
    const chat = S.chat || [];
    panel.querySelector(".scroll").innerHTML = `
      ${tabsHTML}
      <div class="rwcard">
        <div class="rwleft"><div class="rwspark">✦</div><div><div class="rwbig">Tailor with Claude</div>
          <div class="rwsub">${j.company || "this role"} · ${S.resumeName || "100% ATS résumé"}</div></div></div>
        <div class="ring" style="--p:${S.ats || 100}"><b>${S.ats || 100}</b></div></div>
      <div class="sectl">Quick edits</div>
      <div class="chips">${RW_CHIPS.map(c => `<button class="chip" data-q="${c.replace(/"/g, "&quot;")}">${c} <span>↑</span></button>`).join("")}</div>
      ${chat.length ? `<div class="sectl">Conversation</div><div class="chat">${chat.map(m => `<div class="msg ${m.role}${m.pending ? " pending" : ""}">${(m.text || "").replace(/</g, "&lt;")}</div>`).join("")}</div>` : ""}`;
    const foot = panel.querySelector(".foot");
    foot.innerHTML = `
      <div class="composer">
        <textarea id="jt-rw-input" placeholder="Tell me how you'd like to tweak your résumé…" rows="2"></textarea>
        <button class="btn primary" id="jt-rw-send">✦ Edit With AI</button>
      </div>
      <div class="safe">Edits stay truthful · one page · re-scored for ATS</div>`;
    const input = panel.querySelector("#jt-rw-input");
    const send = () => { const v = (input.value || "").trim(); if (v) { input.value = ""; rewriteResume(v); } };
    panel.querySelector("#jt-rw-send").onclick = send;
    input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    panel.querySelectorAll(".chip").forEach(c => c.onclick = () => rewriteResume(c.dataset.q));
    const chatEl = panel.querySelector(".chat"); if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    wireTabs();
  }
  // Fill a specific field on the page by matching its label, then set the value.
  async function fillNamedField(name, value) {
    const els = [...document.querySelectorAll("input,textarea,select")].filter(vis);
    let target = null, best = 0;
    for (const el of els) {
      const l = labelText(el).toLowerCase(); if (!l) continue;
      const score = l.includes(name.toLowerCase()) ? name.length : (name.toLowerCase().includes(l) ? l.length : 0);
      if (score > best) { best = score; target = el; }
    }
    if (!target) return null;
    const lbl = labelText(target);
    if (value == null) { // no explicit value → ask Claude for the answer
      try { const r = await api("POST", "/ai/answer", { questions: [{ question: lbl, long: /describe|explain|why|example|cover/i.test(lbl) }], job: { title: S.job?.title, company: S.job?.company } }); value = (r.answers || {})[lbl]; } catch (e) {}
    }
    if (value == null) value = "";
    if (target.tagName === "SELECT") setSelect(target, value, lbl);
    else setText(target, value);
    highlightField(target, true); logFill(lbl, value, "text", "AI");
    return lbl;
  }
  // Route a chat message: a fill/answer command acts on the page; anything else
  // edits the résumé. Either way Claude responds in the conversation.
  async function rewriteResume(instruction) {
    if (!instruction || S.rwBusy) return;
    S.rwBusy = true;
    S.chat = S.chat || [];
    S.chat.push({ role: "me", text: instruction });
    S.chat.push({ role: "ai", text: "Working on it…", pending: true });
    render();
    const reply = (t) => { S.chat.pop(); S.chat.push({ role: "ai", text: t }); };
    try {
      const jb = S.job || detectJob();
      const lc = instruction.toLowerCase();
      const isFill = (/\b(fill|autofill|auto-fill|complete|enter|put|type|answer|select)\b/.test(lc) && /\b(fields?|form|page|questions?|application|input|box|dropdown|this|that|all|everything|out)\b/.test(lc)) || /^(autofill|auto-fill|fill|fill it|fill in|complete it)\b/.test(lc.trim());
      if (isFill) {
        // (a) target a named field: "fill the <name> field with <value>"
        const m = instruction.match(/\b(?:fill|enter|put|type|set|answer|select)\b(?:\s+(?:in|out|the|my|this|that))?\s+(.+?)(?:\s+(?:field|question|box|dropdown))?(?:\s+(?:with|to|as|=)\s+(.+?))?\s*$/i);
        const cleaned = m && m[1] ? m[1].trim().toLowerCase().replace(/\b(the|my|this|that|a|out|in|all|every|everything|fields?|forms?|pages?|applications?|stuff|questions?)\b/g, "").replace(/\s+/g, " ").trim() : "";
        const named = m && (m[2] || cleaned.length > 1);
        if (named) {
          const lbl = await fillNamedField(m[1].trim(), m[2] ? m[2].trim() : null);
          reply(lbl ? `Filled "${lbl}" for you. Switch to Auto-Apply to review.` : `I couldn't find a field matching "${m[1].trim()}" on this page.`);
        } else {
          S.filledLog = []; if (!S.tailored) await tailorNow(); await attachResume();
          const { unknown } = await fillAll();
          const rem = unknown.length ? await resolve(unknown) : [];
          const total = (S.filledLog || []).length;
          reply(`Filled ${total} field${total === 1 ? "" : "s"} on this page${rem.length ? `, ${rem.length} still need your input` : ""}. See the Auto-Apply tab to review each one.`);
        }
      } else {
        // résumé edit
        const r = await api("POST", "/ai/rewrite", { title: jb.title, company: jb.company, description: jb.description, instruction, resumeData: S.tailoredStruct || null });
        reply((r.reply || "Updated your résumé.") + `  (ATS ${r.ats || 100}%)`);
        S.ats = r.ats || S.ats; S.changes = r.changes || S.changes; S.keywords = r.keywords || S.keywords; S.tailoredStruct = r.resumeData || S.tailoredStruct;
        try { S.tailored = await bg({ type: "tailorResume", job: { title: jb.title, company: jb.company, description: jb.description, resumeData: S.tailoredStruct } }); S.resumeName = S.tailored.filename; } catch (e) {}
      }
    } catch (e) {
      reply("⚠ Couldn't do that — make sure the dashboard backend is running and you're signed in.");
    }
    S.rwBusy = false; render();
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
