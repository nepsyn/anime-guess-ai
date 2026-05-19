export type PlayerFilters = {
  yearFrom?: number | null
  yearTo?: number | null
  format?: 'tv' | 'movie' | 'ova' | 'web' | 'all' | string
  tags?: string | string[]
  ratingMin?: number | null
  ratingMax?: number | null
}

export type BangumiFilter = {
  type: number[]
  meta_tags?: string[]
  tag?: string[]
  air_date?: [string, string]
  rating?: [string, string]
}

const FORMAT_META_TAGS: Record<string, string> = {
  tv: 'TV',
  movie: '剧场版',
  ova: 'OVA',
  web: 'WEB'
}

export function normalizeFilters(filters: PlayerFilters = {}): BangumiFilter {
  const result: BangumiFilter = { type: [2] }
  const format = String(filters.format || 'all').toLowerCase()
  if (FORMAT_META_TAGS[format]) result.meta_tags = [FORMAT_META_TAGS[format]]

  const tags = Array.isArray(filters.tags)
    ? filters.tags
    : String(filters.tags || '')
        .split(/[,，\s]+/)
        .filter(Boolean)
  if (tags.length) result.tag = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]

  const yearFrom = Number(filters.yearFrom)
  const yearTo = Number(filters.yearTo)
  if (Number.isFinite(yearFrom) || Number.isFinite(yearTo)) {
    const from = Number.isFinite(yearFrom) ? Math.max(1900, Math.min(2100, yearFrom)) : 1900
    const to = Number.isFinite(yearTo) ? Math.max(1900, Math.min(2100, yearTo)) : new Date().getFullYear() + 1
    result.air_date = [`>=${from}-01-01`, `<=${to}-12-31`]
  }

  const ratingMin = Number(filters.ratingMin)
  const ratingMax = Number(filters.ratingMax)
  if (Number.isFinite(ratingMin) || Number.isFinite(ratingMax)) {
    const min = Number.isFinite(ratingMin) ? Math.max(0, Math.min(10, ratingMin)) : 0
    const max = Number.isFinite(ratingMax) ? Math.max(0, Math.min(10, ratingMax)) : 10
    result.rating = [`>=${min}`, `<=${max}`]
  }

  return result
}

export function isCorrectGuess(guessSubjectId: number, answer: { subjectId: number; relatedIds?: number[] }) {
  const ids = new Set([answer.subjectId, ...(answer.relatedIds || [])].map(Number))
  return ids.has(Number(guessSubjectId))
}

export function extractInfoboxValue(subject: any, keys: string[]) {
  const info = Array.isArray(subject?.infobox) ? subject.infobox : []
  const keySet = new Set(keys)
  for (const row of info) {
    if (!row || !keySet.has(row.key)) continue
    if (typeof row.value === 'string') return row.value
    if (Array.isArray(row.value)) return row.value.map((item) => item?.v || item?.value || item).filter(Boolean).join('、')
    if (row.value?.v) return row.value.v
  }
  return ''
}

function safeTitleFree(text: string, subject: any) {
  const names = [subject?.name, subject?.name_cn].filter(Boolean)
  return names.reduce((acc, name) => acc.replaceAll(String(name), '这部动画'), text)
}

export function pickHint(subject: any, usedHints = new Set<string>(), turn = 0) {
  const year = String(subject?.air_date || subject?.date || '').slice(0, 4)
  const tags = (subject?.tags || [])
    .map((tag: any) => tag.name)
    .filter((name: string) => name && !/^\d{4}(年|$)/.test(name) && !['TV', '剧场版', 'OVA', 'WEB'].includes(name))
    .slice(0, 3)
    .join('、')
  const meta = (subject?.meta_tags || []).find((tag: string) => ['TV', '剧场版', 'OVA', 'WEB'].includes(tag)) || subject?.platform || ''
  const staff = extractInfoboxValue(subject, ['动画制作', '制作', '导演', '监督'])
  const cast = extractInfoboxValue(subject, ['主演', '声优', '配音'])
  const score = subject?.rating?.score ? Number(subject.rating.score).toFixed(1) : ''

  const candidates = [
    year || tags ? `它是一部${year ? `${year}年` : ''}${tags ? `带有「${tags}」标签` : ''}的动画。` : '',
    meta ? `Bangumi 上它的条目类型/标记包含「${meta}」。` : '',
    staff ? `它的制作相关信息里出现了：${staff}。` : '',
    cast ? `它的配音/主演相关信息里出现了：${cast}。` : '',
    score ? `它在 Bangumi 的当前评分约为 ${score} 分。` : '',
    subject?.summary ? `简介线索：${String(subject.summary).slice(0, 80)}……` : ''
  ]
    .map((hint) => safeTitleFree(hint, subject))
    .filter(Boolean)

  const available = candidates.filter((hint) => !usedHints.has(hint))
  return available[turn % Math.max(available.length, 1)] || '暂时没有更多可靠提示了。'
}

export function compactSubjectForAi(subject: any) {
  return {
    id: subject.id,
    name: subject.name,
    name_cn: subject.name_cn,
    type: subject.type,
    date: subject.date || subject.air_date,
    summary: subject.summary,
    tags: (subject.tags || []).slice(0, 20).map((tag: any) => tag.name),
    meta_tags: subject.meta_tags || [],
    infobox: subject.infobox || [],
    rating: subject.rating
  }
}
