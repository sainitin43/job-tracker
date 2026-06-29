# Deploying Job Tracker as a website

The app deploys as **one service**: after `npm run build`, the backend serves the
built frontend from `dist/`, so the whole app runs on a single origin (no CORS or
API-URL config). User data stays in `data.json` on a **persistent disk**.

## How it works
- `npm run build` → Vite outputs `dist/`.
- The backend (`server/server.js`) detects `dist/` and serves it + an SPA fallback.
- The frontend auto-uses the same origin for `/api` in production, so nothing to configure.
- `DATA_DIR` points `data.json` at a mounted disk so data survives redeploys.

## Required env vars (set in your host's dashboard — never commit them)
| Var | Value |
|-----|-------|
| `DATA_DIR` | Mounted disk path, e.g. `/data` |
| `CLIENT_ORIGIN` | Your site URL, e.g. `https://jobs.example.com` (comma-separated for multiple) |
| `JWT_SECRET` | Long random string (`openssl rand -hex 32`) |
| `ANTHROPIC_API_KEY` | Claude key (optional) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `APIFY_TOKEN` | Apify token (optional) |
| `APIFY_ACTOR` | `openclawai/job-board-scraper` |
| `GOOGLE_CLIENT_ID` | OAuth client ID (optional) |

## Render (recommended, blueprint included)
1. Push the repo to GitHub.
2. Render → **New → Blueprint**, pick the repo (uses `render.yaml`).
3. Paste the secret env vars (`ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `GOOGLE_CLIENT_ID`).
4. Render attaches a 1 GB disk at `/data` (set as `DATA_DIR`). Deploy.
5. Update `CLIENT_ORIGIN` to your real Render URL and redeploy.

Build: `npm install && npm run build && npm install --prefix server`
Start: `cd server && npm start`

## Railway / Fly.io
- Same build/start commands. Add a **volume** mounted at `/data` and set `DATA_DIR=/data`.
- Set the env vars above. Expose the port the app reads from `PORT`.

## Any VPS (DigitalOcean/EC2/etc.)
```bash
git clone https://github.com/sainitin43/job-tracker.git && cd job-tracker
npm run setup                 # then paste keys into server/.env
npm run build
DATA_DIR=/var/lib/jobtracker CLIENT_ORIGIN=https://your-domain cd server && npm start
```
Put it behind nginx/Caddy for TLS, and run it under `pm2` or a systemd service to keep it alive.

## Point the Chrome extension at your deployed backend
In the extension's service-worker console (`chrome://extensions` → your extension → "service worker"):
```js
chrome.storage.local.set({ jt_api_base: "https://YOUR-BACKEND/api" })
```
Also add your backend host to `host_permissions` in `extension/manifest.json` and reload the extension.

## Google Sign-In on a domain
Add your deployed origin to the OAuth client's **Authorized JavaScript origins** in Google Cloud Console, and set `GOOGLE_CLIENT_ID`.
