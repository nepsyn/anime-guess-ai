import { db, initDb, cleanupExpiredSubjects } from '../../utils/db'
import { findRandomSubject, getRelatedSubjectIds, getSubject } from '../../utils/bangumi'

const TTL_MS = Number(process.env.SUBJECT_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000)

export default defineEventHandler(async (event) => {
  await initDb()
  await cleanupExpiredSubjects()
  const body = await readBody(event)
  const filters = body?.filters || {}
  const random = await findRandomSubject(filters)
  const subjectId = Number(random.id)
  const cached = await db`SELECT id FROM subjects WHERE id = ${subjectId} AND expires_at > ${Date.now()} LIMIT 1`
  if (!cached.length) {
    const [subject, relatedIds] = await Promise.all([getSubject(subjectId), getRelatedSubjectIds(subjectId)])
    await db`INSERT INTO subjects (id, payload, related_ids, fetched_at, expires_at)
      VALUES (${subjectId}, ${JSON.stringify(subject)}, ${JSON.stringify(relatedIds)}, ${Date.now()}, ${Date.now() + TTL_MS})
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, related_ids = excluded.related_ids, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`
  }
  const sessionId = crypto.randomUUID()
  await db`INSERT INTO games (id, subject_id, filters, used_hints, asked, created_at, updated_at)
    VALUES (${sessionId}, ${subjectId}, ${JSON.stringify(filters)}, '[]', '[]', ${Date.now()}, ${Date.now()})`
  return { sessionId, message: '新游戏已开始。你可以开始提问，或直接搜索并提交答案。' }
})
