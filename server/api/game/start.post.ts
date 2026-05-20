import { db, initDb, cleanupExpiredSubjects } from '../../utils/db'
import { findRandomSubject, getRelatedSubjectIds, getSubject } from '../../utils/bangumi'
import { buildHintDeck, HINT_LIMIT, INITIAL_SCORE } from '../../utils/game'

const TTL_MS = Number(process.env.SUBJECT_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000)

export default defineEventHandler(async (event) => {
  await initDb()
  await cleanupExpiredSubjects()
  const body = await readBody(event)
  const filters = body?.filters || {}
  const random = await findRandomSubject(filters)
  const subjectId = Number(random.id)
  let subject: any | null = null
  const cached = await db`SELECT payload FROM subjects WHERE id = ${subjectId} AND expires_at > ${Date.now()} LIMIT 1`
  if (!cached.length) {
    const [freshSubject, relatedIds] = await Promise.all([getSubject(subjectId), getRelatedSubjectIds(subjectId)])
    subject = freshSubject
    await db`INSERT INTO subjects (id, payload, related_ids, fetched_at, expires_at)
      VALUES (${subjectId}, ${JSON.stringify(freshSubject)}, ${JSON.stringify(relatedIds)}, ${Date.now()}, ${Date.now() + TTL_MS})
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, related_ids = excluded.related_ids, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`
  } else {
    subject = JSON.parse(cached[0].payload)
  }
  const aiConfig = { provider: body?.provider, ...(body?.aiConfig || {}) }
  const hintDeck = await buildHintDeck(subject, aiConfig)
  const initialHint = hintDeck[0]
  const sessionId = crypto.randomUUID()
  await db`INSERT INTO games (id, subject_id, filters, used_hints, hint_deck, asked, score, created_at, updated_at)
    VALUES (${sessionId}, ${subjectId}, ${JSON.stringify(filters)}, ${JSON.stringify([initialHint])}, ${JSON.stringify(hintDeck)}, '[]', ${INITIAL_SCORE}, ${Date.now()}, ${Date.now()})`
  return { sessionId, message: '新游戏已开始。你可以继续提问、要提示，或直接搜索并提交答案。', initialHint, remainingHints: HINT_LIMIT - 1, totalHints: HINT_LIMIT, score: INITIAL_SCORE }
})
