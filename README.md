# Job Tracker — AI Job Applier

A self-hosted job tracker with a live job-discovery feed, 100% ATS résumé
tailoring (Claude), and a Chrome extension that auto-fills applications and
syncs "Applied" back to your dashboard.

- **Frontend:** static Vite app (`index.html`) — the dashboard (Discover, Pipeline, Résumé, Insights).
- **Backend:** Node/Express (`server/`) — auth, job store, Claude tailoring, Apify job fetching. Stores data in `server/data.json`.
- **Extension:** Chrome MV3 (`extension/`) — the side-panel auto-applier + AI Rewrite chat.

## Quick start (clone → run)

Requires **Node 18+** and Chrome.

```bash
git clone https://github.com/sainitin43/job-tracker.git
cd job-tracker
npm run setup     # installs deps (root + server) and creates server/.env with a random JWT
npm start         # runs backend (:4000) and frontend (:5173) together
```

Open **http://localhost:5173**, sign up with an email/password, and you're in.

It works out of the box: **free job discovery** (Greenhouse, Lever, Ashby,
SmartRecruiters — no keys needed) and **heuristic résumé tailoring**.

### Unlock the premium features (optional)

Paste your keys into `server/.env`, then restart (`npm start`):

| Key | Unlocks | Get it |
|-----|---------|--------|
| `ANTHROPIC_API_KEY` | Claude AI résumé tailoring, screening answers, AI Rewrite chat | console.anthropic.com/settings/keys |
| `APIFY_TOKEN` | Live LinkedIn / Indeed / Dice jobs | console.apify.com/account/integrations |
| `GOOGLE_CLIENT_ID` | "Sign in with Google" | Google Cloud Console |

### Load the Chrome extension

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Sign in via the extension popup. The side panel auto-fills applications and
   marks jobs Applied on your dashboard.

(For a deployed backend, point the extension at it without editing code — in the
extension's service-worker console: `chrome.storage.local.set({ jt_api_base: "https://YOUR-BACKEND/api" })`.)

## Moving your exact setup (with keys) to another machine

Your keys live in `server/.env`, which is **git-ignored** and never pushed — so a
fresh `git clone` won't include them. To move your full working setup:

- **Option A:** copy `server/.env` to the new machine (AirDrop / USB / scp) after cloning.
- **Option B:** run `npm run bundle` to make a `job-tracker-bundle.zip` that
  includes `.env` and `data.json`; move it privately, unzip, then `npm run setup && npm start`.

> ⚠ Never commit `server/.env` or upload the bundle anywhere public — it contains
> your paid API keys.

## Deploying as a website

See **[DEPLOY.md](DEPLOY.md)** — one-service deploy (the backend serves the built
frontend) with a persistent disk for `data.json`. A `render.yaml` blueprint is included.

## Scripts

| Command | Does |
|---------|------|
| `npm run setup` | Install deps + create `server/.env` |
| `npm start` | Run backend + frontend together (dev) |
| `npm run build` | Build the frontend to `dist/` |
| `npm run start:prod` | Build, then serve everything from the backend (one service) |
| `npm run bundle` | Zip the project (with keys) for personal transfer |
