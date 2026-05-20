import { describe, expect, test } from 'bun:test'
import { db, getDatabaseUrl, initDb } from '../server/utils/db'

describe('database configuration', () => {
  test('uses PostgreSQL connection string from DATABASE_URL', () => {
    const oldDatabaseUrl = process.env.DATABASE_URL
    const oldDbPath = process.env.DB_PATH
    process.env.DATABASE_URL = 'postgres://anime_user:secret@example.com:5432/anime_guess'
    process.env.DB_PATH = '/tmp/should-not-be-used.sqlite'

    try {
      expect(getDatabaseUrl()).toBe('postgres://anime_user:secret@example.com:5432/anime_guess')
    } finally {
      if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = oldDatabaseUrl
      if (oldDbPath === undefined) delete process.env.DB_PATH
      else process.env.DB_PATH = oldDbPath
    }
  })

  test('requires DATABASE_URL instead of falling back to a local database', () => {
    const oldDatabaseUrl = process.env.DATABASE_URL
    const oldDbPath = process.env.DB_PATH
    delete process.env.DATABASE_URL
    process.env.DB_PATH = '/tmp/legacy-local.sqlite'

    try {
      expect(() => getDatabaseUrl()).toThrow('DATABASE_URL')
    } finally {
      if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = oldDatabaseUrl
      if (oldDbPath === undefined) delete process.env.DB_PATH
      else process.env.DB_PATH = oldDbPath
    }
  })

  const pgTest = process.env.DATABASE_URL ? test : test.skip

  pgTest('stores millisecond timestamps in PostgreSQL without integer overflow', async () => {
    await initDb()
    const id = 900_000_000 + Math.floor(Math.random() * 10_000_000)
    const now = Date.now()

    await db`INSERT INTO subjects (id, payload, related_ids, fetched_at, expires_at)
      VALUES (${id}, ${JSON.stringify({ id, name: 'timestamp-test' })}, '[]', ${now}, ${now + 1000})
      ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`
    const rows = await db`SELECT fetched_at, expires_at FROM subjects WHERE id = ${id} LIMIT 1`
    await db`DELETE FROM subjects WHERE id = ${id}`

    expect(Number(rows[0].fetched_at)).toBe(now)
    expect(Number(rows[0].expires_at)).toBe(now + 1000)
  })
})
