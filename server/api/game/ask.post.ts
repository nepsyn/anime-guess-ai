import { db, initDb } from '../../utils/db'
import { answerQuestion } from '../../utils/ai'

export default defineEventHandler(async (event) => {
  await initDb()
  const body = await readBody(event)
  const sessionId = String(body?.sessionId || '')
  const question = String(body?.question || '').trim()
  if (!sessionId || !question) throw createError({ statusCode: 400, statusMessage: '缺少 sessionId 或 question' })
  const rows = await db`SELECT g.asked, s.payload FROM games g JOIN subjects s ON s.id = g.subject_id WHERE g.id = ${sessionId} LIMIT 1`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' })
  const subject = JSON.parse(rows[0].payload)
  const result = await answerQuestion(subject, question, body?.provider)
  const asked = JSON.parse(rows[0].asked || '[]')
  asked.push({ question, ...result, at: Date.now() })
  await db`UPDATE games SET asked = ${JSON.stringify(asked)}, updated_at = ${Date.now()} WHERE id = ${sessionId}`
  return result
})
