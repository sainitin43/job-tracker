# Job Tracker — Auto-Applier (Chrome Extension)

A Chrome (Manifest V3) extension that connects to your Job Tracker dashboard. On any
LinkedIn, Indeed, Greenhouse, Lever, or Workday posting it can:

- **Save & Tailor** — scrape the posting into your dashboard and auto-generate an ATS‑tailored resume.
- **Auto-Apply** — hands-off: fills each page from your details, attaches the tailored resume, clicks Next through multi-step flows, and stops at the Submit button for you to review. It **pauses** on any genuinely new required question (you answer once, it's remembered), and it **never clicks Submit**.
- **Autofill this page** — fill just the current page (one-shot) with your details and attach your tailored resume PDF.
- **Learn new questions** — any question it doesn't recognize is shown in the panel; you answer once and it's **remembered** for next time (a per‑user answer bank stored in your backend).
- **Mark Applied** — sync the job's status back to your dashboard.

> It never auto-submits. You review the filled form and click submit yourself.

## Install (load unpacked)

1. Start the backend (`cd server && npm run dev`) and the web app (`npm run dev`). The extension talks to `http://localhost:4000/api`.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension, click it, and **log in** with your Job Tracker account.

## Enable "Continue with Google" (one-time setup)

The popup has a **Continue with Google** button. For it to work, Google must trust this
extension's redirect URL:

1. After loading the extension, copy its ID from `chrome://extensions` (e.g. `inomeogfingihgjfjlpeplalcfajhgai`).
2. Your redirect URL is `https://<EXTENSION_ID>.chromiumapp.org/` (keep the trailing slash).
3. In Google Cloud Console → APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs**, add that URL and save.

If it isn't registered you'll get a `redirect_uri_mismatch` error. (The client ID is already
set in `background.js` to match the web app.) Email/password login works without this step —
but note Google-only accounts have no password, so use the Google button for those.

## Use

1. Open a job posting on a supported site. A **💼 Job Tracker** button appears bottom‑right — click it to open the panel.
2. **＋ Save & Tailor** saves the job and tailors a resume (do this on the posting so Auto-Apply uses the right resume).
3. Start the application, then click **🤖 Auto-Apply**. It fills each page, attaches your tailored resume, and advances through the steps. When it hits a new required question it pauses and shows it in the panel — answer once, hit **💾 Save & fill**, and it continues. It stops at the **Submit** button and highlights it; you review and submit.
   - Prefer manual control? Use **⚡ Autofill this page** to fill one page at a time.
   - **■ Stop** halts the autopilot anytime.
4. **🧠 Remember form** snapshots everything you've typed so it learns from your own edits.
5. After you submit, click **✓ Mark Applied** to sync status to your dashboard.

### Auto-Apply limits (by design)

- It **never submits** — the final click is always yours.
- It **pauses instead of guessing** on unknown required questions, so it never puts made-up answers on your applications.
- Multi-step flows that do full page reloads (Workday) are resumed automatically; very dynamic or CAPTCHA-gated steps may need you to finish manually.

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
