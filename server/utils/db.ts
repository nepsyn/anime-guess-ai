import { SQL } from 'bun'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'anime-guess.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new SQL({ adapter: 'sqlite', filename: dbPath })

let initialized = false

export async function initDb() {
  if (initialized) return
  await db`PRAGMA journal_mode = WAL`
  await db`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    related_ids TEXT NOT NULL DEFAULT '[]',
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`
  await db`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    subject_id INTEGER NOT NULL,
    filters TEXT NOT NULL,
    used_hints TEXT NOT NULL DEFAULT '[]',
    hint_deck TEXT NOT NULL DEFAULT '[]',
    asked TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 20,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(subject_id) REFERENCES subjects(id)
  )`
  try { await db`ALTER TABLE games ADD COLUMN hint_deck TEXT NOT NULL DEFAULT '[]'` } catch {}
  try { await db`ALTER TABLE games ADD COLUMN score INTEGER NOT NULL DEFAULT 20` } catch {}
  initialized = true
}

export async function cleanupExpiredSubjects(now = Date.now()) {
  await initDb()
  await db`DELETE FROM subjects WHERE expires_at < ${now}`
}
