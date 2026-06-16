# Job Application Tracker

A local-first job application tracker built with **React + Vite**. Track roles you've applied to, keep the full job description for each, store a tailored resume per job, and stay organized with stats, search, and filters.

## Features

- **Per-account login** — email/password sign up & log in, plus **Continue with Google** (OAuth). Each account's data is isolated.
- **Personal dashboard** — header greets you by first name ("{First name}'s Jobs") with Total / Applied / Interviewing / Offers stats.
- **Job cards** — company, title, status pill, location, type, pay, applied date, and attached resume at a glance.
- **Full job descriptions** — expand any card to read the complete JD (nothing truncated).
- **Add / Edit modal** — create or update a job, including status, dates, and the full JD.
- **Resumes per job** — attach a resume file (PDF/DOC/TXT/MD), download it, plus a tailored resume-text field with TXT/MD export.
- **Top search + tech-stack filter** — a prominent search bar and tech chips (Java, Kotlin, React…) to narrow your saved jobs.
- **Inline editable status** — change a job's status (incl. *Not Applied*) right on its card; saves instantly.
- **Discover Jobs (live)** — pulls fresh matches from LinkedIn / Indeed / Google Jobs & more via an **Apify** actor, scores each against your profile, generates a **tailored ATS resume** per job, and **auto-refreshes every 2 hours** (local cron). Requires `APIFY_TOKEN` in the backend.
- **Search & filter** — by company, title, status, or description.
- **Backup** — Export / Import all jobs as JSON.
- Animated, responsive dark UI.

## Discover Jobs setup

Open the **Discover Jobs** tab. To enable live fetching, add an Apify token to `server/.env`:

```
APIFY_TOKEN=your_apify_token   # from console.apify.com/account/integrations
APIFY_ACTOR=openclawai/job-board-scraper
```

Restart the backend, set your Role/Location in the Discover tab, and click **Refresh now**. With a token present, the backend also re-fetches every 2 hours automatically (keep the server running). Each result includes a match score and a tailored resume you can copy or **Save to My Jobs**.

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
