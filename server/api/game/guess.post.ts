import { db, initDb } from '../../utils/db';
import { getRelatedSubjectIds, getSubject } from '../../utils/bangumi';
import { compareGuessOverlap, deductScore, isCorrectGuess, publicAnswer, WRONG_GUESS_COST } from '../../utils/game';

export default defineEventHandler(async (event) => {
  await initDb();
  const body = await readBody(event);
  const sessionId = String(body?.sessionId || '');
  const guessId = Number(body?.subjectId);
  if (!sessionId || !Number.isFinite(guessId))
    throw createError({ statusCode: 400, statusMessage: '缺少 sessionId 或 subjectId' });
  const rows =
    await db`SELECT g.subject_id, g.score, s.payload, s.related_ids FROM games g JOIN subjects s ON s.id = g.subject_id WHERE g.id = ${sessionId} LIMIT 1`;
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: '游戏不存在或已过期' });
  const subjectId = Number(rows[0].subject_id);
  const storedRelatedIds = JSON.parse(rows[0].related_ids || '[]');
  let relatedIds = Array.isArray(storedRelatedIds) ? storedRelatedIds.map(Number).filter(Boolean) : [];
  let correct = isCorrectGuess(guessId, { subjectId, relatedIds });

  if (!correct) {
    const freshRelatedIds = await getRelatedSubjectIds(subjectId);
    relatedIds = [...new Set([...relatedIds, ...freshRelatedIds])];
    correct = isCorrectGuess(guessId, { subjectId, relatedIds });
    if (freshRelatedIds.length) {
      await db`UPDATE subjects SET related_ids = ${JSON.stringify(relatedIds)}, fetched_at = ${Date.now()} WHERE id = ${subjectId}`;
    }
  }

  if (!correct) {
    const guessedRelatedIds = await getRelatedSubjectIds(guessId);
    correct = guessedRelatedIds.map(Number).includes(subjectId);
  }

  const sameSeries = correct && guessId !== subjectId;
  const subject = JSON.parse(rows[0].payload);
  const currentScore = Number(rows[0].score) || 0;
  const score = correct ? currentScore : deductScore(currentScore, WRONG_GUESS_COST);
  let similarities: ReturnType<typeof compareGuessOverlap> = [];
  if (!correct) {
    const guessedSubject = await getSubject(guessId);
    similarities = compareGuessOverlap(guessedSubject, subject);
    await db`UPDATE games SET score = ${score}, updated_at = ${Date.now()} WHERE id = ${sessionId}`;
  }
  return {
    correct,
    sameSeries,
    score,
    similarities,
    answer: correct ? publicAnswer(subject) : undefined,
    message: correct
      ? sameSeries
        ? '你猜的是同一动画的不同季度/关联条目，也算答对啦！'
        : '答对了！'
      : '不是这部动画哦，请再接再厉~',
  };
});
