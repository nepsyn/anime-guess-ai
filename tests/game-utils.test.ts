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

describe('pickHint', () => {
  test('generates a deterministic unrevealed hint from cached subject data', () => {
    const hint = pickHint({
      id: 1,
      name: 'test',
      name_cn: '测试动画',
      air_date: '2014-04-06',
      meta_tags: ['TV'],
      tags: [{ name: '战斗' }, { name: '奇幻' }],
      infobox: [{ key: '主题歌演出', value: 'Aimer' }, { key: '动画制作', value: 'ufotable' }],
      rating: { score: 7.8 },
      summary: '这是一段简介'
    }, new Set(), 0)

    expect(hint).toContain('2014')
    expect(hint).not.toContain('测试动画')
  })

  test('prepares ten non-repeating hints per subject and removes title-related tags', () => {
    const deck = buildHintDeck({
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
    })

    expect(deck).toHaveLength(HINT_LIMIT)
    expect(new Set(deck).size).toBe(HINT_LIMIT)
    expect(deck.join('\n')).not.toContain('测试动画')
    expect(deck.join('\n')).not.toContain('测试别名')
  })
})
