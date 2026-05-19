import { db, initDb } from '../../utils/db'
import { HINT_LIMIT, pickHint } from '../../utils/game'

export default defineEventHandler(async (event) => {
  await initDb()
  const body = await readBody(event)
  const sessionId = String(body?.sessionId || '')
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: '缺少 sessionId' })
  const rows = await db`SELECT g.used_hints, s.payload FROM games g JOIN subjects s ON s.id = g.subject_id WHERE g.id = ${sessionId} LIMIT 1`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' })
  const subject = JSON.parse(rows[0].payload)
  const used = JSON.parse(rows[0].used_hints || '[]')
  if (used.length >= HINT_LIMIT) {
    return { hint: '', remainingHints: 0, totalHints: HINT_LIMIT, exhausted: true, message: '提示次数已用完。' }
  }
  const hint = pickHint(subject, new Set(used), used.length)
  used.push(hint)
  await db`UPDATE games SET used_hints = ${JSON.stringify(used)}, updated_at = ${Date.now()} WHERE id = ${sessionId}`
  return { hint, remainingHints: Math.max(0, HINT_LIMIT - used.length), totalHints: HINT_LIMIT, exhausted: used.length >= HINT_LIMIT }
})
