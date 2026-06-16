import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    first_name  TEXT NOT NULL,
    password    TEXT,                 -- bcrypt hash (null for Google-only accounts)
    provider    TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'google'
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    company       TEXT NOT NULL,
    title         TEXT NOT NULL,
    url           TEXT,
    location      TEXT,
    type          TEXT,
    pay           TEXT,
    status        TEXT,
    date_added    TEXT,
    date_applied  TEXT,
    description   TEXT,
    resume        TEXT,
    resume_file   TEXT,
    resume_name   TEXT,
    resume_type   TEXT,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
`);

export default db;
