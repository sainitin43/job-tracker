# Job Tracker — Auto-Applier (Chrome Extension)

A Chrome (Manifest V3) extension that connects to your Job Tracker dashboard. On any
LinkedIn, Greenhouse, Lever, or Workday posting it can:

- **Save & Tailor** — scrape the posting into your dashboard and auto-generate an ATS‑tailored resume.
- **Autofill** — fill the application form with your details (name, email, phone, links, work authorization, EEO, etc.) and attach your tailored resume PDF.
- **Learn new questions** — any question it doesn't recognize is shown in the panel; you answer once and it's **remembered** for next time (a per‑user answer bank stored in your backend).
- **Mark Applied** — sync the job's status back to your dashboard.

> It never auto-submits. You review the filled form and click submit yourself.

## Install (load unpacked)

1. Start the backend (`cd server && npm run dev`) and the web app (`npm run dev`). The extension talks to `http://localhost:4000/api`.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension, click it, and **log in** with your Job Tracker account.

## Use

1. Open a job posting on a supported site. A **💼 Job Tracker** button appears bottom‑right — click it to open the panel.
2. **＋ Save & Tailor** saves the job and tailors a resume.
3. On the application page, click **⚡ Autofill application**. Known fields fill instantly; new questions appear in the panel — answer them and hit **💾 Save & fill** to remember them.
4. **🧠 Remember form** snapshots everything you've typed so it learns from your own edits.
5. Review, submit yourself, then **✓ Mark Applied**.

## Your details

Autofill data comes from `GET /api/applicant` (derived from your account + base resume) plus
your learned answers. Edit/extend it anytime by answering questions in the panel, or by
`PUT /api/applicant` with `{ profile, answers }`.

## Pointing at a deployed backend

Change `API_BASE` in `background.js` and add your backend URL to `host_permissions` in `manifest.json`.

## Notes & limits

- Each board's form layout differs and changes over time; the field‑matcher is heuristic and improves as you teach it.
- Some sites block programmatic file uploads or use multi‑step flows (Workday); fill what you can, finish manually.
- Keep submissions one at a time and human‑reviewed — bulk auto‑apply violates LinkedIn's terms and risks bans.
