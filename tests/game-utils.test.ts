import { describe, expect, test } from 'bun:test';
import {
  normalizeFilters,
  isCorrectGuess,
  pickHint,
  buildHintDeck,
  HINT_LIMIT,
  deductScore,
  hintResponseFromUsedCount,
} from '../server/utils/game';
import { answerQuestion } from '../server/utils/ai';

describe('normalizeFilters', () => {
  test('maps player filters to Bangumi search filter shape', () => {
    const result = normalizeFilters({
      yearFrom: 2014,
      yearTo: 2016,
      format: 'tv',
      country: 'japan',
      tags: '战斗, 校园 ',
      ratingMin: 7,
      ratingMax: 8.5,
    });

    expect(result.type).toEqual([2]);
    expect(result.meta_tags).toEqual(['TV', '日本']);
    expect(result.tag).toEqual(['战斗', '校园']);
    expect(result.air_date).toEqual(['>=2014-01-01', '<=2016-12-31']);
    expect(result.rating).toEqual(['>=7', '<=8.5']);
  });

  test('adds domestic country meta tag for Chinese anime', () => {
    expect(normalizeFilters({ country: 'china' }).meta_tags).toEqual(['国产']);
    expect(normalizeFilters({ country: '国产' }).meta_tags).toEqual(['国产']);
  });
});

describe('isCorrectGuess', () => {
  test('accepts exact subject id and related subject ids', () => {
    expect(isCorrectGuess(123, { subjectId: 123, relatedIds: [456, 789] })).toBe(true);
    expect(isCorrectGuess(456, { subjectId: 123, relatedIds: [456, 789] })).toBe(true);
    expect(isCorrectGuess(999, { subjectId: 123, relatedIds: [456, 789] })).toBe(false);
  });
});

describe('deductScore', () => {
  test('subtracts costs and never goes below zero', () => {
    expect(deductScore(20, 1)).toBe(19);
    expect(deductScore(19, 2)).toBe(17);
    expect(deductScore(1, 2)).toBe(0);
    expect(deductScore(0, 1)).toBe(0);
  });
});

describe('hintResponseFromUsedCount', () => {
  test('keeps the final hint visible when it consumes the last remaining use', () => {
    const finalHint = hintResponseFromUsedCount('最后一条提示', HINT_LIMIT);

    expect(finalHint.hint).toBe('最后一条提示');
    expect(finalHint.remainingHints).toBe(0);
    expect(finalHint.exhausted).toBe(false);

    const noHint = hintResponseFromUsedCount('', HINT_LIMIT);
    expect(noHint.exhausted).toBe(true);
  });
});

const sampleSubject = {
  id: 1,
  name: 'test',
  name_cn: '测试动画',
  aliases: [{ name: '测试别名' }],
  air_date: '2014-04-06',
  meta_tags: ['TV', '日本'],
  tags: [
    { name: '测试动画' },
    { name: '测试别名' },
    { name: '战斗' },
    { name: '奇幻' },
    { name: '漫画改' },
    { name: '冒险' },
    { name: '热血' },
  ],
  infobox: [
    { key: '主题歌演出', value: 'Aimer' },
    { key: '动画制作', value: 'ufotable' },
    { key: '导演', value: '测试监督' },
    { key: '声优', value: [{ v: '佐仓绫音' }, { v: '花泽香菜' }] },
    { key: '音乐', value: '梶浦由记' },
  ],
  rating: { score: 7.8, total: 1234 },
  rank: 100,
  summary: '这是一段足够长的简介，用来生成逐步接近核心信息但不直接暴露标题的线索。',
};

describe('pickHint fallback', () => {
  test('generates a deterministic unrevealed fallback hint from cached subject data', () => {
    const hint = pickHint(sampleSubject, new Set(), 0);

    expect(hint).toContain('2014');
    expect(hint).not.toContain('测试动画');
  });
});

describe('buildHintDeck', () => {
  test('asks AI for the fixed ten hint categories in order and includes characters context', async () => {
    const oldFetch = globalThis.fetch;
    const oldProvider = process.env.AI_PROVIDER;
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = 'gemini';
    delete process.env.OPENAI_API_KEY;
    let authorization = '';
    let prompt = '';
    globalThis.fetch = async (_url, init) => {
      authorization = String((init?.headers as Record<string, string>)?.authorization || '');
      const body = JSON.parse(String(init?.body || '{}'));
      prompt = String(body.messages?.[0]?.content || '');
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  hints: [
                    '1. 播出时间是「2014年4月」。',
                    '2. 类型来源可关注「漫画改」。',
                    '3. Bangumi 评分约「7.8」。',
                    '4. 关键标签包括「战斗、奇幻」。',
                    '5. 制作公司是「ufotable」。',
                    '6. 动画导演是「测试监督」。',
                    '7. 关键角色声优有「佐仓绫音」。',
                    '8. 故事简介提到一段奇幻冒险。',
                    '9. 主角名字可关注「测试主角」。',
                    '10. 动画名称里带有「测」这个字。',
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const subjectWithCharacters = {
      ...sampleSubject,
      characters: [
        { id: 10, name: '测试主角', relation: '主角', actors: [{ name: '佐仓绫音' }] },
      ],
    };

    try {
      const deck = await buildHintDeck(subjectWithCharacters, { provider: 'gpt', apiKey: 'user-key' });
      expect(authorization).toBe('Bearer user-key');
      expect(prompt).toContain('1. 播出年份、月份');
      expect(prompt).toContain('2. 动画类型（漫画改、原创、游戏改等）');
      expect(prompt).toContain('9. 主角名字');
      expect(prompt).toContain('10. 动画名称中带的一个字或词');
      expect(prompt).toContain('characters');
      expect(prompt).not.toContain('persons');
      expect(prompt).toContain('测试主角');
      expect(prompt).toContain('佐仓绫音');
      expect(deck).toHaveLength(HINT_LIMIT);
      expect(deck[8]).toContain('测试主角');
      expect(deck[9]).toContain('「测」');
      expect(new Set(deck).size).toBe(HINT_LIMIT);
      expect(deck.join('\n')).not.toContain('测试动画');
      expect(deck.join('\n')).not.toContain('测试别名');
    } finally {
      globalThis.fetch = oldFetch;
      if (oldProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = oldProvider;
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldKey;
    }
  });

  test('throws an error instead of using fallback hints when AI is unavailable', async () => {
    const oldProvider = process.env.AI_PROVIDER;
    const oldOpenAiKey = process.env.OPENAI_API_KEY;
    const oldGeminiKey = process.env.GEMINI_API_KEY;
    process.env.AI_PROVIDER = 'gpt';
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await expect(buildHintDeck(sampleSubject)).rejects.toThrow('提示生成失败');
    } finally {
      if (oldProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = oldProvider;
      if (oldOpenAiKey !== undefined) process.env.OPENAI_API_KEY = oldOpenAiKey;
      if (oldGeminiKey !== undefined) process.env.GEMINI_API_KEY = oldGeminiKey;
    }
  });

  test('does not use environment API keys when no user key is provided', async () => {
    const oldFetch = globalThis.fetch;
    const oldProvider = process.env.AI_PROVIDER;
    const oldOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = 'gpt';
    process.env.OPENAI_API_KEY = 'env-key-should-not-be-used';
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      await expect(buildHintDeck(sampleSubject)).rejects.toThrow('提示生成失败');
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = oldProvider;
      if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldOpenAiKey;
    }
  });
});

describe('answerQuestion', () => {
  test('uses user-provided API key instead of environment variables', async () => {
    const oldFetch = globalThis.fetch;
    const oldProvider = process.env.AI_PROVIDER;
    const oldOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = 'gemini';
    delete process.env.OPENAI_API_KEY;
    let authorization = '';
    globalThis.fetch = async (_url, init) => {
      authorization = String((init?.headers as Record<string, string>)?.authorization || '');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '是', reason: '测试原因' }) } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    try {
      const result = await answerQuestion(sampleSubject, '它是动画吗？', { provider: 'gpt', apiKey: 'user-key' });
      expect(authorization).toBe('Bearer user-key');
      expect(result.answer).toBe('是');
      expect(result.reason).toBe('');
    } finally {
      globalThis.fetch = oldFetch;
      if (oldProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = oldProvider;
      if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldOpenAiKey;
    }
  });

  test('allows reliable internet knowledge for gaps without inventing facts', async () => {
    const oldFetch = globalThis.fetch;
    let prompt = '';
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      prompt = String(body.messages?.[0]?.content || '');
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '不确定' }) } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    try {
      await answerQuestion(sampleSubject, '它的海外流媒体平台是 Netflix 吗？', { provider: 'gpt', apiKey: 'user-key' });
      expect(prompt).toContain('Bangumi 资料不足时，可以结合你已知的可靠公开互联网资料回答');
      expect(prompt).toContain('不能编造');
      expect(prompt).toContain('没有可靠依据');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
