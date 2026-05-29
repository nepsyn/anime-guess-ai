import { SQL } from 'bun';

let sqlClient: any | null = null;
let initialized = false;

export function getDatabaseUrl() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) throw new Error('DATABASE_URL is required for PostgreSQL database connection');
  return url;
}

function getDb() {
  if (!sqlClient) sqlClient = new SQL(getDatabaseUrl());
  return sqlClient;
}

export const db = new Proxy(function sqlTag() {}, {
  apply(_target, _thisArg, args) {
    return Reflect.apply(getDb(), undefined, args);
  },
  get(_target, prop) {
    const value = getDb()[prop];
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
}) as any;

export async function initDb() {
  if (initialized) return;
  await db`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    related_ids TEXT NOT NULL DEFAULT '[]',
    fetched_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  )`;
  await db`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    filters TEXT NOT NULL,
    used_hints TEXT NOT NULL DEFAULT '[]',
    hint_deck TEXT NOT NULL DEFAULT '[]',
    asked TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 20,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`;
  try {
    await db`ALTER TABLE subjects ALTER COLUMN fetched_at TYPE BIGINT`;
  } catch {}
  try {
    await db`ALTER TABLE subjects ALTER COLUMN expires_at TYPE BIGINT`;
  } catch {}
  try {
    await db`ALTER TABLE games ADD COLUMN hint_deck TEXT NOT NULL DEFAULT '[]'`;
  } catch {}
  try {
    await db`ALTER TABLE games ADD COLUMN score INTEGER NOT NULL DEFAULT 20`;
  } catch {}
  try {
    await db`ALTER TABLE games ALTER COLUMN created_at TYPE BIGINT`;
  } catch {}
  try {
    await db`ALTER TABLE games ALTER COLUMN updated_at TYPE BIGINT`;
  } catch {}
  await db`CREATE INDEX IF NOT EXISTS subjects_expires_at_idx ON subjects(expires_at)`;
  await db`CREATE INDEX IF NOT EXISTS games_subject_id_idx ON games(subject_id)`;
  initialized = true;
}

export async function cleanupExpiredSubjects(now = Date.now()) {
  await initDb();
  await db`DELETE FROM subjects s
    WHERE s.expires_at < ${now}
      AND NOT EXISTS (
        SELECT 1 FROM games g WHERE g.subject_id = s.id
      )`;
}
