import { db, initDb } from '../../utils/db';
import { deductScore, HINT_COST, HINT_LIMIT, hintResponseFromUsedCount } from '../../utils/game';

export default defineEventHandler(async (event) => {
  await initDb();
  const body = await readBody(event);
  const sessionId = String(body?.sessionId || '');
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: '缺少 sessionId' });
  const rows = await db`SELECT g.used_hints, g.hint_deck, g.score FROM games g WHERE g.id = ${sessionId} LIMIT 1`;
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' });
  const used = JSON.parse(rows[0].used_hints || '[]');
  if (used.length >= HINT_LIMIT) {
    return {
      hint: '',
      remainingHints: 0,
      totalHints: HINT_LIMIT,
      exhausted: true,
      message: '提示次数已用完。',
      score: Number(rows[0].score) || 0,
    };
  }
  const deck = JSON.parse(rows[0].hint_deck || '[]');
  const hint = Array.isArray(deck) && deck[used.length] ? deck[used.length] : '无提示';
  used.push(hint);
  const score = deductScore(Number(rows[0].score), HINT_COST);
  await db`UPDATE games SET used_hints = ${JSON.stringify(used)}, score = ${score}, updated_at = ${Date.now()} WHERE id = ${sessionId}`;
  return hintResponseFromUsedCount(hint, used.length, score);
});
