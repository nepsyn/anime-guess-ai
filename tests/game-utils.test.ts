import { describe, expect, test } from 'bun:test'
import { normalizeFilters, isCorrectGuess, pickHint, buildHintDeck, HINT_LIMIT, deductScore } from '../server/utils/game'

describe('normalizeFilters', () => {
  test('maps player filters to Bangumi search filter shape', () => {
    const result = normalizeFilters({
      yearFrom: 2014,
      yearTo: 2016,
      format: 'tv',
      country: 'japan',
      tags: '战斗, 校园 ',
      ratingMin: 7,
      ratingMax: 8.5
    })

    expect(result.type).toEqual([2])
    expect(result.meta_tags).toEqual(['TV', '日本'])
    expect(result.tag).toEqual(['战斗', '校园'])
    expect(result.air_date).toEqual(['>=2014-01-01', '<=2016-12-31'])
    expect(result.rating).toEqual(['>=7', '<=8.5'])
  })
})

describe('isCorrectGuess', () => {
  test('accepts exact subject id and related subject ids', () => {
    expect(isCorrectGuess(123, { subjectId: 123, relatedIds: [456, 789] })).toBe(true)
    expect(isCorrectGuess(456, { subjectId: 123, relatedIds: [456, 789] })).toBe(true)
    expect(isCorrectGuess(999, { subjectId: 123, relatedIds: [456, 789] })).toBe(false)
  })
})

describe('deductScore', () => {
  test('subtracts costs and never goes below zero', () => {
    expect(deductScore(20, 1)).toBe(19)
    expect(deductScore(19, 2)).toBe(17)
    expect(deductScore(1, 2)).toBe(0)
    expect(deductScore(0, 1)).toBe(0)
  })
})

const sampleSubject = {
  id: 1,
  name: 'test',
  name_cn: '测试动画',
  aliases: [{ name: '测试别名' }],
  air_date: '2014-04-06',
  meta_tags: ['TV', '日本'],
  tags: [{ name: '测试动画' }, { name: '测试别名' }, { name: '战斗' }, { name: '奇幻' }, { name: '漫画改' }, { name: '冒险' }, { name: '热血' }],
  infobox: [
    { key: '主题歌演出', value: 'Aimer' },
    { key: '动画制作', value: 'ufotable' },
    { key: '导演', value: '测试监督' },
    { key: '声优', value: [{ v: '佐仓绫音' }, { v: '花泽香菜' }] },
    { key: '音乐', value: '梶浦由记' }
  ],
  rating: { score: 7.8, total: 1234 },
  rank: 100,
  summary: '这是一段足够长的简介，用来生成逐步接近核心信息但不直接暴露标题的线索。'
}

describe('pickHint fallback', () => {
  test('generates a deterministic unrevealed fallback hint from cached subject data', () => {
    const hint = pickHint(sampleSubject, new Set(), 0)

    expect(hint).toContain('2014')
    expect(hint).not.toContain('测试动画')
  })
})

describe('buildHintDeck', () => {
  test('uses AI JSON hints directly and sanitizes title-related hints', async () => {
    const oldFetch = globalThis.fetch
    const oldProvider = process.env.AI_PROVIDER
    const oldKey = process.env.OPENAI_API_KEY
    process.env.AI_PROVIDER = 'gpt'
    process.env.OPENAI_API_KEY = 'test-key'
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            hints: [
              '这条包含测试动画标题应被过滤',
              '它是「2014年」开播的日本电视动画。',
              '故事有明显的「战斗」与奇幻要素。',
              '动画制作信息中可以关注「ufotable」。',
              '主创名单里出现过「测试监督」。',
              '音乐相关信息里出现「梶浦由记」。',
              '声演名单里可以关注「佐仓绫音」。',
              '声演名单里还可以关注「花泽香菜」。',
              'Bangumi 评分大约在「7分」以上。',
              '主题歌相关信息里出现「Aimer」。',
              '它的核心气质更接近热血冒险。'
            ]
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })

    try {
      const deck = await buildHintDeck(sampleSubject)
      expect(deck).toHaveLength(HINT_LIMIT)
      expect(deck[0]).toBe('它是「2014年」开播的日本电视动画。')
      expect(new Set(deck).size).toBe(HINT_LIMIT)
      expect(deck.join('\n')).not.toContain('测试动画')
      expect(deck.join('\n')).not.toContain('测试别名')
    } finally {
      globalThis.fetch = oldFetch
      if (oldProvider === undefined) delete process.env.AI_PROVIDER
      else process.env.AI_PROVIDER = oldProvider
      if (oldKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = oldKey
    }
  })

  test('falls back to ten non-repeating title-safe hints when AI is unavailable', async () => {
    const oldProvider = process.env.AI_PROVIDER
    const oldOpenAiKey = process.env.OPENAI_API_KEY
    const oldGeminiKey = process.env.GEMINI_API_KEY
    process.env.AI_PROVIDER = 'gpt'
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY

    try {
      const deck = await buildHintDeck(sampleSubject)
      expect(deck).toHaveLength(HINT_LIMIT)
      expect(new Set(deck).size).toBe(HINT_LIMIT)
      expect(deck.join('\n')).not.toContain('测试动画')
      expect(deck.join('\n')).not.toContain('测试别名')
    } finally {
      if (oldProvider === undefined) delete process.env.AI_PROVIDER
      else process.env.AI_PROVIDER = oldProvider
      if (oldOpenAiKey !== undefined) process.env.OPENAI_API_KEY = oldOpenAiKey
      if (oldGeminiKey !== undefined) process.env.GEMINI_API_KEY = oldGeminiKey
    }
  })
})
