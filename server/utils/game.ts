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

export function getSubjectImage(subject: any) {
  return subject?.images?.large || subject?.images?.common || subject?.images?.medium || subject?.images?.grid || subject?.images?.small || ''
}

export function publicAnswer(subject: any) {
  return {
    id: subject.id,
    name: subject.name,
    name_cn: subject.name_cn,
    image: getSubjectImage(subject),
    url: `https://bgm.tv/subject/${subject.id}`
  }
}

function getInfoboxList(subject: any, keys: string[]) {
  const info = Array.isArray(subject?.infobox) ? subject.infobox : []
  const keySet = new Set(keys)
  for (const row of info) {
    if (!row || !keySet.has(row.key)) continue
    if (Array.isArray(row.value)) return row.value.map((item) => item?.v || item?.value || item).filter(Boolean).map(String)
    if (typeof row.value === 'string') return row.value.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean)
    if (row.value?.v) return [String(row.value.v)]
  }
  return []
}

function titleShape(subject: any) {
  const title = String(subject?.name_cn || subject?.name || '')
  if (!title) return ''
  return `标题长度约 ${title.length} 个字符，首字符是「${title[0]}」。`
}

export function pickHint(subject: any, usedHints = new Set<string>(), turn = 0) {
  const year = String(subject?.air_date || subject?.date || '').slice(0, 4)
  const tags = (subject?.tags || [])
    .map((tag: any) => tag.name)
    .filter((name: string) => name && !/^\d{4}(年|$)/.test(name) && !['TV', '剧场版', 'OVA', 'WEB'].includes(name))
    .slice(0, 5)
  const broadTags = tags.slice(0, 2).join('、')
  const coreTags = tags.slice(0, 4).join('、')
  const meta = (subject?.meta_tags || []).find((tag: string) => ['TV', '剧场版', 'OVA', 'WEB'].includes(tag)) || subject?.platform || ''
  const studio = extractInfoboxValue(subject, ['动画制作', '制作'])
  const director = extractInfoboxValue(subject, ['导演', '监督'])
  const cast = getInfoboxList(subject, ['主演', '声优', '配音']).slice(0, Math.min(4, 1 + Math.floor(turn / 2))).join('、')
  const score = subject?.rating?.score ? Number(subject.rating.score).toFixed(1) : ''
  const summary = String(subject?.summary || '').replace(/\s+/g, ' ').trim()
  const summaryLength = Math.min(180, 60 + turn * 18)

  const staged = [
    year || broadTags ? `它是一部${year ? `${year}年` : ''}${broadTags ? `带有「${broadTags}」标签` : ''}的动画。` : '',
    meta || score ? `Bangumi 上它的条目类型/标记${meta ? `包含「${meta}」` : '未知'}${score ? `，当前评分约为 ${score} 分` : ''}。` : '',
    studio ? `它的动画制作相关信息里出现了：${studio}。` : '',
    director ? `它的导演/监督相关信息里出现了：${director}。` : '',
    cast ? `它的配音/主演相关信息里出现了：${cast}。` : '',
    coreTags ? `更接近核心的标签线索：${coreTags}。` : '',
    summary ? `简介线索：${summary.slice(0, summaryLength)}${summary.length > summaryLength ? '……' : ''}` : '',
    titleShape(subject)
  ]
    .map((hint) => safeTitleFree(hint, subject))
    .filter(Boolean)

  const available = staged.filter((hint) => !usedHints.has(hint))
  if (available.length) return available[0]

  const fallback = [
    coreTags ? `追加线索：它的高频标签仍然包括「${coreTags}」。` : '',
    cast ? `追加线索：参与配音/主演的信息中可以关注「${cast}」。` : '',
    summary ? `追加简介线索：${summary.slice(0, Math.min(summary.length, summaryLength + 40))}${summary.length > summaryLength + 40 ? '……' : ''}` : '',
    titleShape(subject)
  ]
    .map((hint) => safeTitleFree(hint, subject))
    .filter(Boolean)
  return fallback[turn % Math.max(fallback.length, 1)] || '追加线索：这部动画的资料较少，可以尝试缩小年份、类型、制作人员或声优范围。'
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
