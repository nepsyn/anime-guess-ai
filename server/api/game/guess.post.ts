import { db, initDb } from '../../utils/db'
import { isCorrectGuess, publicAnswer } from '../../utils/game'

export default defineEventHandler(async (event) => {
  await initDb()
  const body = await readBody(event)
  const sessionId = String(body?.sessionId || '')
  const guessId = Number(body?.subjectId)
  if (!sessionId || !Number.isFinite(guessId)) throw createError({ statusCode: 400, statusMessage: '缺少 sessionId 或 subjectId' })
  const rows = await db`SELECT g.subject_id, g.score, s.payload, s.related_ids FROM games g JOIN subjects s ON s.id = g.subject_id WHERE g.id = ${sessionId} LIMIT 1`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' })
  const subjectId = Number(rows[0].subject_id)
  const correct = isCorrectGuess(guessId, { subjectId, relatedIds: JSON.parse(rows[0].related_ids || '[]') })
  const sameSeries = correct && guessId !== subjectId
  const subject = JSON.parse(rows[0].payload)
  const score = Number(rows[0].score) || 0
  return {
    correct,
    sameSeries,
    score,
    answer: correct ? publicAnswer(subject) : undefined,
    message: correct ? (sameSeries ? '你猜的是同一动画的不同季度/关联条目，也算答对啦！' : '答对了！') : '不是这部动画哦，请再接再厉~'
  }
})
