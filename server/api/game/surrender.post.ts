import { db, initDb } from '../../utils/db';
import { publicAnswer } from '../../utils/game';

export default defineEventHandler(async (event) => {
  await initDb();
  const body = await readBody(event);
  const sessionId = String(body?.sessionId || '');
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: '缺少 sessionId' });

  const rows =
    await db`SELECT s.payload FROM games g JOIN subjects s ON s.id = g.subject_id WHERE g.id = ${sessionId} LIMIT 1`;
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' });

  const subject = JSON.parse(rows[0].payload);
  await db`UPDATE games SET score = 0, updated_at = ${Date.now()} WHERE id = ${sessionId}`;
  return {
    answer: publicAnswer(subject),
    score: 0,
    message: '答案揭晓。',
  };
});
