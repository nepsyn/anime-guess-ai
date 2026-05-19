import { describe, expect, test } from 'bun:test'
import { normalizeFilters, isCorrectGuess, pickHint } from '../server/utils/game'

describe('normalizeFilters', () => {
  test('maps player filters to Bangumi search filter shape', () => {
    const result = normalizeFilters({
      yearFrom: 2014,
      yearTo: 2016,
      format: 'tv',
      tags: '战斗, 校园 ',
      ratingMin: 7,
      ratingMax: 8.5
    })

    expect(result.type).toEqual([2])
    expect(result.meta_tags).toEqual(['TV'])
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
})
