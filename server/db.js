import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, 'influencer.sqlite');

let db = null;
let saveTimer = null;
let SQL = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  connection_type TEXT NOT NULL DEFAULT 'manual',
  followers INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  filename TEXT NOT NULL,
  original_name TEXT,
  mime TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  thumb_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  context_json TEXT,
  reported_views INTEGER NOT NULL DEFAULT 0,
  reported_likes INTEGER NOT NULL DEFAULT 0,
  reported_comments INTEGER NOT NULL DEFAULT 0,
  reported_shares INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'media-heuristics',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  date TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  niche TEXT,
  notes TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_posts (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  format TEXT,
  topic TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  prompt_json TEXT,
  output TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'rules',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_user ON videos(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_user ON metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_competitor ON competitor_posts(competitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
`;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 120);
}

export function persist() {
  if (!db) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = Buffer.from(db.export());
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[db] persist failed:', err.message);
  }
}

export async function initDb() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  SQL = await initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
  });
  const existing = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE) : null;
  db = existing && existing.length ? new SQL.Database(existing) : new SQL.Database();
  db.exec(SCHEMA);
  persist();
  return db;
}

export function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

export function transaction(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    scheduleSave();
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

export function closeDb() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persist();
}
