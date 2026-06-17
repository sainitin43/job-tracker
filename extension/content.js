(() => {
  if (window.__jtLoaded) return;
  window.__jtLoaded = true;

  const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, res));
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const pick = sels => { for (const s of sels) { const el = document.querySelector(s); if (el && txt(el)) return el; } return null; };

  /* ------------------------- per-board scraping ------------------------- */
  const host = location.host;
  function board() {
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("myworkdayjobs.com")) return "workday";
    return "generic";
  }

  function scrape() {
    const b = board();
    let title = "", company = "", description = "", jobLoc = "";
    try {
      if (b === "greenhouse") {
        title = txt(pick([".app-title", ".job__title h1", "h1.section-header", "h1"]));
        company = txt(pick([".company-name", ".company-name b"])) || (document.title.split("-").pop() || "").trim();
        description = txt(pick(["#content", ".job__description", ".body"]));
        jobLoc = txt(pick([".location", ".job__location"]));
      } else if (b === "lever") {
        title = txt(pick([".posting-headline h2", "h2"]));
        company = (location.host.split(".")[0] || "").replace(/^jobs$/, "") || txt(pick([".main-header-logo img"]));
        description = txt(pick([".section-wrapper.page-full-width", ".posting-page", ".content", '[data-qa="job-description"]']));
        jobLoc = txt(pick([".posting-categories .location", ".location"]));
      } else if (b === "workday") {
        title = txt(pick(['[data-automation-id="jobPostingHeader"]', "h1", "h2"]));
        description = txt(pick(['[data-automation-id="jobPostingDescription"]', '[data-automation-id="job-posting-details"]']));
        company = (location.host.split(".")[0] || "").replace(/^[a-z]+$/, m => m) || "";
        jobLoc = txt(pick(['[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]']));
      } else if (b === "linkedin") {
        title = txt(pick([".job-details-jobs-unified-top-card__job-title", ".top-card-layout__title", ".topcard__title", "h1"]));
        company = txt(pick([".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link", ".topcard__flavor a", ".jobs-unified-top-card__company-name"]));
        description = txt(pick([".jobs-description__content", ".show-more-less-html__markup", "#job-details", ".description__text"]));
        jobLoc = txt(pick([".job-details-jobs-unified-top-card__primary-description-container", ".topcard__flavor--bullet"]));
      }
    } catch { /* ignore */ }

    // fallbacks
    if (!title) title = txt(document.querySelector("h1")) || (document.title || "").split(/[-|]/)[0].trim();
    if (!company) company = (document.querySelector('meta[property="og:site_name"]') || {}).content || host.split(".")[0];
    if (!description) {
      const main = document.querySelector("main") || document.body;
      description = txt(main).slice(0, 6000);
    }
    return {
      title: title.slice(0, 200),
      company: (company || "").slice(0, 120),
      location: (jobLoc || "").slice(0, 120),
      description: (description || "").slice(0, 12000),
      url: location.href.split("#")[0]
    };
  }

  /* ------------------------- field label + matching ------------------------- */
  function labelFor(el) {
    let parts = [];
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(txt(l)); }
    const wrapLabel = el.closest("label"); if (wrapLabel) parts.push(txt(wrapLabel));
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.getAttribute("aria-labelledby")) {
      el.getAttribute("aria-labelledby").split(/\s+/).forEach(id => { const n = document.getElementById(id); if (n) parts.push(txt(n)); });
    }
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name.replace(/[_\-.]+/g, " "));
    // nearby question text (Greenhouse/Workday wrap questions in a container)
    const grp = el.closest('[class*="field"], [data-automation-id], .application-question, fieldset, .form-group');
    if (grp) { const lg = grp.querySelector("label, legend, .label, [class*='label']"); if (lg) parts.push(txt(lg)); }
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  const norm = s => (s || "").toLowerCase().replace(/\*|\(required\)|:|\s+/g, " ").replace(/\s+/g, " ").trim();

  // profile-field synonyms (regex on normalized label -> profile key)
  const SYN = [
    [/first name|given name|legal first/, "firstName"],
    [/last name|surname|family name|legal last/, "lastName"],
    [/full name|^name$|your name|legal name/, "fullName"],
    [/e[- ]?mail/, "email"],
    [/phone|mobile|cell|telephone/, "phone"],
    [/linkedin/, "linkedin"],
    [/github/, "github"],
    [/portfolio|personal (site|website)|website|web site/, "website"],
    [/street|address line|^address/, "address"],
    [/city|town/, "city"],
    [/state|province|region/, "state"],
    [/zip|postal/, "zip"],
    [/country/, "country"],
    [/current company|current employer|present employer/, "currentCompany"],
    [/current title|current role|job title|present title/, "currentTitle"],
    [/years.*(experience)|experience.*years|yoe/, "yearsExperience"],
    [/authorized to work|work authorization|legally authorized|eligible to work/, "workAuthorized"],
    [/sponsor|visa/, "requiresSponsorship"],
    [/relocat/, "willingToRelocate"],
    [/notice period|availability to start|how soon/, "noticePeriod"],
    [/salary|compensation|expected pay|desired pay/, "salaryExpectation"],
    [/gender/, "gender"],
    [/race|ethnic/, "ethnicity"],
    [/veteran/, "veteranStatus"],
    [/disab/, "disabilityStatus"],
    [/pronoun/, "pronouns"]
  ];
  function resolveValue(label, applicant) {
    const n = norm(label);
    if (!n) return null;
    for (const [re, key] of SYN) if (re.test(n) && applicant.profile[key]) return applicant.profile[key];
    if (applicant.answers[n] != null && applicant.answers[n] !== "") return applicant.answers[n];
    return null;
  }

  /* ------------------------- fill helpers ------------------------- */
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.classList.add("jt-filled-flash");
    setTimeout(() => el.classList.remove("jt-filled-flash"), 600);
  }
  function fillText(el, value) { if (value == null || value === "") return false; setNativeValue(el, String(value)); return true; }
  function fillSelect(el, value) {
    if (value == null || value === "") return false;
    const v = String(value).toLowerCase();
    const opt = Array.from(el.options).find(o => o.value.toLowerCase() === v || txt(o).toLowerCase() === v)
      || Array.from(el.options).find(o => txt(o).toLowerCase().includes(v) || v.includes(txt(o).toLowerCase()) && txt(o));
    if (!opt) return false;
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  function fillRadioOrCheck(groupEls, value) {
    if (value == null || value === "") return false;
    const v = String(value).toLowerCase();
    for (const el of groupEls) {
      const lbl = norm(labelFor(el)) || norm(el.value);
      if (lbl === v || lbl.includes(v) || v.includes(lbl) && lbl) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("click", { bubbles: true }));
        return true;
      }
    }
    return false;
  }
  async function attachResume(input, resumePath) {
    try {
      const r = await send({ type: "resume", path: resumePath });
      if (r.error) return false;
      const bin = atob(r.dataUrl.split(",")[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], r.filename, { type: "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch { return false; }
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  }

  /* ------------------------- autofill ------------------------- */
  // Returns { filled, unknown:[{label, el, type}] }
  async function autofill(applicant, resumePath) {
    let filled = 0;
    const unknown = [];
    const radgroups = {};

    const controls = Array.from(document.querySelectorAll("input, select, textarea")).filter(visible);
    for (const el of controls) {
      const type = (el.type || el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "search", "password"].includes(type)) continue;

      if (type === "file") {
        const accept = (el.accept || "").toLowerCase();
        if (accept === "" || /pdf|doc|application|\.pdf|\.doc/.test(accept)) { if (await attachResume(el, resumePath)) filled++; }
        continue;
      }
      if (type === "radio" || type === "checkbox") {
        const key = el.name || labelFor(el.closest("fieldset, [role=radiogroup]") || el);
        if (!radgroups[key]) radgroups[key] = [];
        radgroups[key].push(el);
        continue;
      }
      const label = labelFor(el);
      const val = resolveValue(label, applicant);
      if (val != null) {
        const ok = type === "select-one" || el.tagName === "SELECT" ? fillSelect(el, val) : fillText(el, val);
        if (ok) { filled++; continue; }
      }
      if (!el.value && label) unknown.push({ label, el, type: el.tagName === "SELECT" ? "select" : type });
    }

    // radio/checkbox groups
    for (const [name, els] of Object.entries(radgroups)) {
      const label = labelFor(els[0].closest("fieldset, [role=radiogroup]") || els[0]) || name;
      const val = resolveValue(label, applicant);
      if (val != null && fillRadioOrCheck(els, val)) { filled++; }
      else if (!els.some(e => e.checked) && label) unknown.push({ label, el: els[0], els, type: els[0].type });
    }
    return { filled, unknown };
  }

  /* ------------------------- panel UI ------------------------- */
  let JOB = scrape();
  let savedJobId = null;
  let applicant = null;
  let lastUnknown = [];

  function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

  const fab = el("button", "jt-fab", "💼 Job Tracker");
  fab.addEventListener("click", () => { panel.classList.remove("jt-hidden"); fab.classList.add("jt-hidden"); });
  document.body.appendChild(fab);

  const panel = el("div"); panel.id = "jt-panel"; panel.classList.add("jt-hidden");
  panel.innerHTML = `
    <div class="jt-head"><span class="jt-title">JOB TRACKER · AUTO-APPLIER</span><button class="jt-x" title="Hide">×</button></div>
    <div class="jt-body">
      <div class="jt-job" id="jtJob"></div>
      <div class="jt-sub" id="jtSub"></div>
      <div class="jt-row">
        <button class="jt-btn primary" id="jtSave">＋ Save &amp; Tailor</button>
        <button class="jt-btn" id="jtRescrape" title="Re-read this page">⟳</button>
      </div>
      <div class="jt-row">
        <button class="jt-btn kit" id="jtFill">⚡ Autofill application</button>
        <button class="jt-btn" id="jtRemember" title="Save every answer on this form to reuse later">🧠 Remember form</button>
      </div>
      <div class="jt-row">
        <button class="jt-btn" id="jtApplied" title="Mark this job Applied in your dashboard">✓ Mark Applied</button>
      </div>
      <p class="jt-status" id="jtStatus"></p>
      <div class="jt-learn jt-hidden" id="jtLearn"></div>
    </div>`;
  document.body.appendChild(panel);

  const $ = id => panel.querySelector(id);
  function renderJob() { $("#jtJob").textContent = JOB.title || "(no title found)"; $("#jtSub").textContent = [JOB.company, JOB.location].filter(Boolean).join(" · "); }
  function status(msg, kind) { const s = $("#jtStatus"); s.textContent = msg || ""; s.className = "jt-status" + (kind ? " " + kind : ""); }
  renderJob();

  panel.querySelector(".jt-x").addEventListener("click", () => { panel.classList.add("jt-hidden"); fab.classList.remove("jt-hidden"); });
  $("#jtRescrape").addEventListener("click", () => { JOB = scrape(); renderJob(); status("Re-read the page.", "ok"); });

  async function ensureApplicant() {
    if (applicant) return applicant;
    const r = await send({ type: "api", method: "GET", path: "/applicant" });
    if (r.error) throw new Error(r.error);
    applicant = r;
    return applicant;
  }

  $("#jtSave").addEventListener("click", async () => {
    status("Saving & tailoring…");
    JOB = scrape();
    const r = await send({ type: "api", method: "POST", path: "/jobs", body: { ...JOB, status: "Not Applied" } });
    if (r.error) { status(r.error, "err"); return; }
    savedJobId = r.job.id;
    status(`Saved · ATS ${r.job.ats != null ? r.job.ats + "%" : "—"} · resume tailored ✓`, "ok");
  });

  $("#jtFill").addEventListener("click", async () => {
    try {
      status("Reading your details…");
      await ensureApplicant();
      const resumePath = savedJobId ? `/jobs/${savedJobId}/resume.pdf` : "/applicant/resume.pdf";
      status("Filling the form…");
      const { filled, unknown } = await autofill(applicant, resumePath);
      lastUnknown = unknown;
      status(`Filled ${filled} field${filled === 1 ? "" : "s"}.` + (unknown.length ? ` ${unknown.length} new question${unknown.length === 1 ? "" : "s"} below.` : " ✓"), "ok");
      renderLearn(unknown);
    } catch (e) { status(e.message, "err"); }
  });

  // Learn new questions: user answers once, we save them for next time.
  function renderLearn(unknown) {
    const box = $("#jtLearn");
    if (!unknown.length) { box.classList.add("jt-hidden"); box.innerHTML = ""; return; }
    box.classList.remove("jt-hidden");
    box.innerHTML = `<h4>New questions</h4><p class="note">Answer once — I'll remember and autofill these next time.</p>`;
    unknown.forEach((u, i) => {
      const wrap = el("div", "jt-q");
      const id = "jtq" + i;
      wrap.appendChild(el("label", null, u.label));
      let field;
      if (u.type === "select" && u.el.options) {
        field = el("select");
        field.appendChild(el("option", null, ""));
        Array.from(u.el.options).forEach(o => { if (txt(o)) { const op = el("option", null, txt(o)); op.value = o.value; field.appendChild(op); } });
      } else {
        field = el("input"); field.type = "text";
      }
      field.id = id; field.dataset.idx = i;
      wrap.appendChild(field);
      box.appendChild(wrap);
    });
    const saveBtn = el("button", "jt-btn primary", "💾 Save &amp; fill these");
    saveBtn.style.width = "100%"; saveBtn.style.marginTop = "6px";
    saveBtn.addEventListener("click", saveLearned);
    box.appendChild(saveBtn);
  }

  async function saveLearned() {
    const answers = {};
    panel.querySelectorAll("#jtLearn .jt-q").forEach((q, i) => {
      const field = q.querySelector("input, select");
      const val = field && field.value.trim();
      if (!val) return;
      const u = lastUnknown[i];
      answers[norm(u.label)] = val;
      // fill the page field too
      if (u.els) fillRadioOrCheck(u.els, val);
      else if (u.el.tagName === "SELECT") fillSelect(u.el, val);
      else fillText(u.el, val);
    });
    if (!Object.keys(answers).length) { status("Nothing to save.", "err"); return; }
    const r = await send({ type: "api", method: "PUT", path: "/applicant", body: { answers } });
    if (r.error) { status(r.error, "err"); return; }
    applicant = r;
    status(`Learned ${Object.keys(answers).length} answer(s) ✓ filled on page.`, "ok");
    $("#jtLearn").classList.add("jt-hidden");
  }

  $("#jtApplied").addEventListener("click", async () => {
    if (!savedJobId) {
      // save first, then mark applied
      JOB = scrape();
      const s = await send({ type: "api", method: "POST", path: "/jobs", body: { ...JOB, status: "Applied" } });
      if (s.error) { status(s.error, "err"); return; }
      savedJobId = s.job.id;
      status("Saved & marked Applied ✓", "ok");
      return;
    }
    const r = await send({ type: "api", method: "PUT", path: `/jobs/${savedJobId}`, body: { status: "Applied", dateApplied: new Date().toISOString().slice(0, 10) } });
    if (r.error) { status(r.error, "err"); return; }
    status("Marked Applied ✓", "ok");
  });

  // Remember everything currently on the form (learn from the user's own edits).
  $("#jtRemember").addEventListener("click", async () => {
    const answers = {};
    Array.from(document.querySelectorAll("input, select, textarea")).filter(visible).forEach(elm => {
      const type = (elm.type || "").toLowerCase();
      if (["file", "password", "hidden", "submit", "button"].includes(type)) return;
      let val = "";
      if (type === "radio" || type === "checkbox") { if (elm.checked) val = norm(labelFor(elm) || elm.value); }
      else val = (elm.value || "").trim();
      const label = labelFor(elm);
      if (val && label) answers[norm(label)] = val;
    });
    if (!Object.keys(answers).length) { status("No filled fields to remember.", "err"); return; }
    const r = await send({ type: "api", method: "PUT", path: "/applicant", body: { answers } });
    if (r.error) { status(r.error, "err"); return; }
    applicant = r;
    status(`Remembered ${Object.keys(answers).length} answer(s) for next time ✓`, "ok");
  });

  // Re-scrape when SPA navigations change the URL (LinkedIn/Workday).
  let lastUrl = location.href;
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(() => { JOB = scrape(); renderJob(); savedJobId = null; }, 800); } }, 1200);
})();
