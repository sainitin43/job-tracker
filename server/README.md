# Job Tracker — Local Backend

A small **Express + SQLite** API with secure auth for the Job Application Tracker.

## Security

- Passwords hashed with **bcrypt** (never stored in plain text).
- **JWT** bearer tokens (30-day expiry), verified on every protected route.
- Per-user data isolation — every job is scoped to the authenticated user's id.
- CORS locked to the frontend origin (default `http://localhost:5173`).

## Run

```bash
cd server
npm install
cp .env.example .env      # then edit JWT_SECRET
npm run dev               # http://localhost:4000  (auto-restarts on change)
# or: npm start
```

SQLite data is stored in `server/data.db` (gitignored). Delete it to reset all accounts/jobs.

## Environment (`.env`)

| Var             | Default                  | Notes                                   |
| --------------- | ------------------------ | --------------------------------------- |
| `PORT`          | `4000`                   | API port                                |
| `CLIENT_ORIGIN` | `http://localhost:5173`  | Allowed CORS origin (the frontend)      |
| `JWT_SECRET`    | (dev fallback)           | **Set a long random value** in real use |

## API

| Method | Route               | Auth | Body / Notes                                            |
| ------ | ------------------- | ---- | ------------------------------------------------------- |
| POST   | `/api/auth/signup`  | —    | `{ firstName, email, password }` → `{ token, user }`    |
| POST   | `/api/auth/login`   | —    | `{ email, password }` → `{ token, user }`               |
| GET    | `/api/auth/me`      | ✅   | Returns the current user                                |
| GET    | `/api/jobs`         | ✅   | List the user's jobs                                    |
| POST   | `/api/jobs`         | ✅   | Create a job (`company`, `title` required)              |
| PUT    | `/api/jobs/:id`     | ✅   | Update a job                                            |
| DELETE | `/api/jobs/:id`     | ✅   | Delete a job                                            |
| GET    | `/api/health`       | —    | Health check                                            |

Authenticated requests send `Authorization: Bearer <token>`.

## Connecting the frontend

The React app currently stores data in `localStorage`. To use this backend instead, point its auth/job calls at `http://localhost:4000/api/...`, store the returned JWT, and send it as a Bearer token. (Ask and this can be wired up.)
