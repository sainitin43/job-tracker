# Job Application Tracker

A local-first job application tracker built with **React + Vite**. Track roles you've applied to, keep the full job description for each, store a tailored resume per job, and stay organized with stats, search, and filters.

## Features

- **Per-account login** — email/password sign up & log in, plus **Continue with Google** (OAuth). Each account's data is isolated.
- **Personal dashboard** — header greets you by first name ("{First name}'s Jobs") with Total / Applied / Interviewing / Offers stats.
- **Job cards** — company, title, status pill, location, type, pay, applied date, and attached resume at a glance.
- **Full job descriptions** — expand any card to read the complete JD (nothing truncated).
- **Add / Edit modal** — create or update a job, including status, dates, and the full JD.
- **Resumes per job** — attach a resume file (PDF/DOC/TXT/MD), download it, plus a tailored resume-text field with TXT/MD export.
- **Status-tab board** — top tabs **Not Applied · Applied · ⭐ Favourite**; change a job's status inline on its card and it moves tabs instantly.
- **Find Jobs (auto)** — pulls fresh matches from LinkedIn / Indeed / Glassdoor via an **Apify** actor, keeps good fits, generates a **tailored ATS resume** for each (Claude LLM, with template fallback), and drops them into **Not Applied**. Also **auto-refreshes every 2 hours** (local cron). Requires `APIFY_TOKEN`.
- **Apply-on-return prompt** — click **Open & Apply** on a job; when you switch back to the app it asks "Did you apply?" — **Yes** moves it to **Applied**.
- **Top search + tech-stack filter** — search bar + tech chips (Java, Kotlin, React…) to narrow the current tab.
- **Favourites** — ⭐ any job to find it in the Favourite tab.
- **Search & filter** — by company, title, status, or description.
- **Backup** — Export / Import all jobs as JSON.
- Animated, responsive dark UI.

## Find Jobs setup

To enable auto job-finding, add keys to `server/.env`:

```
APIFY_TOKEN=your_apify_token              # console.apify.com/account/integrations  (required)
APIFY_ACTOR=openclawai/job-board-scraper
ANTHROPIC_API_KEY=sk-ant-api03-...        # console.anthropic.com/settings/keys  (optional; LLM resumes)
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

Restart the backend, then on the **Not Applied** tab set your Role/Location and click **Find & tailor jobs**. Matches are scored, given a tailored resume, and added to Not Applied; the backend also re-fetches every 2 hours (keep the server running).

- Apify is pay-per-result (~$0.005/job) — keep "Per board" modest.
- Without `ANTHROPIC_API_KEY` (or if the account has no credits), resumes use a built-in template; add a funded key to switch to Claude automatically.

## Tech stack

- React 18 + Vite
- Plain CSS (no UI framework)
- Browser `localStorage` for persistence (no backend)

## Getting started

```bash
npm install
npm run dev      # start dev server at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Google Sign-In setup

1. In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth client ID** (type: *Web application*).
2. Add your app URL to both **Authorized JavaScript origins** and **Authorized redirect URIs**:
   - Local dev: origin `http://localhost:5173`, redirect URI `http://localhost:5173/`
   - Production: your deployed URL (origin without trailing slash, redirect URI with trailing slash)
3. Put the Client ID in `src/App.jsx` (`GOOGLE_CLIENT_ID`), or set it at runtime in the browser console:
   ```js
   localStorage.setItem('jt-google-client-id', 'YOUR_ID.apps.googleusercontent.com')
   ```

## Data & privacy

Accounts and job data are stored in the browser's `localStorage`, keyed by email. This means:

- Data lives only in the browser/device where it was created (no cloud sync).
- Each account sees only its own jobs.
- The email/password login is a lightweight local mechanism (passwords are stored locally in plain text) — **not** production-grade security.

For real multi-user, cross-device, secure accounts, pair the app with a backend such as **Supabase** or **Firebase Auth + Firestore**.

## Roadmap ideas

- Supabase/Firebase backend for synced, secure accounts
- Password reset flow
- Server-side resume storage
- Deploy to Vercel/Netlify with auto-deploy on push
