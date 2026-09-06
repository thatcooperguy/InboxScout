import Database from 'better-sqlite3'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  email TEXT NOT NULL,
  provider TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  folders TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  uid_validity INTEGER NOT NULL DEFAULT 0,
  last_uid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, folder)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_addresses TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  snippet TEXT NOT NULL,
  body_text TEXT NOT NULL,
  from_me INTEGER NOT NULL DEFAULT 0,
  list_unsubscribe TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  provider_hints TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_key, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON messages(account_id, folder, uid);

CREATE TABLE IF NOT EXISTS classifications (
  message_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  importance INTEGER NOT NULL,
  screening TEXT NOT NULL,
  is_actionable INTEGER NOT NULL,
  action_summary TEXT,
  deadline TEXT,
  topics TEXT NOT NULL,
  project_hint TEXT,
  people TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  run_id TEXT NOT NULL,
  model TEXT NOT NULL,
  corrected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status_summary TEXT NOT NULL,
  trend TEXT NOT NULL,
  state TEXT NOT NULL,
  last_activity TEXT NOT NULL,
  last_change TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  state TEXT NOT NULL,
  owner_action TEXT,
  deadline TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  messages_scanned INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  markdown TEXT NOT NULL,
  html TEXT NOT NULL,
  file_path TEXT
);

CREATE TABLE IF NOT EXISTS corrections (
  message_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_matches (
  message_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  extracted TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0,
  run_id TEXT NOT NULL,
  PRIMARY KEY (message_id, skill_id)
);

CREATE TABLE IF NOT EXISTS people (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  addresses TEXT NOT NULL,
  domain TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  replied_by_me INTEGER NOT NULL DEFAULT 0,
  replied_to_me INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  cadence_days REAL,
  accounts TEXT NOT NULL,
  role TEXT NOT NULL,
  tier TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  going_quiet INTEGER NOT NULL DEFAULT 0,
  quiet_days INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject, from_address, snippet, body_text, content='messages', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, from_address, snippet, body_text)
  VALUES (new.rowid, new.subject, new.from_address, new.snippet, new.body_text);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_address, snippet, body_text)
  VALUES ('delete', old.rowid, old.subject, old.from_address, old.snippet, old.body_text);
END;
`

// ---- Trusted helpers (v1.4): the sent log. Its own table because it grows; additive, never migrated. ----
const HELPERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS helper_sends (
  id TEXT PRIMARY KEY,
  helper_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  trigger_key TEXT,
  status TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_helper_sends_helper ON helper_sends(helper_id, sent_at);
`

export function openDatabase(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  db.exec(HELPERS_SCHEMA)
  migrate(db)
  ensureIndexes(db)
  return db
}

/** Additive column migrations for databases created by older versions. */
function migrate(db: DB): void {
  ensureColumn(db, 'messages', 'list_unsubscribe', 'TEXT')
  ensureColumn(db, 'messages', 'has_attachments', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'reports', 'brief_json', 'TEXT')
  ensureColumn(db, 'messages', 'provider_hints', 'TEXT')
}

// ---- v1.4 quality sweep (item 8): every recent-mail window filters or sorts on messages.date; deadlines join on it too. ----
const INDEXES_V14 = `
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date);
CREATE INDEX IF NOT EXISTS idx_classifications_deadline ON classifications(deadline);
`
export function ensureIndexes(db: DB): void {
  db.exec(INDEXES_V14)
}

function ensureColumn(db: DB, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
