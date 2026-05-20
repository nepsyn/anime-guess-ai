export type AiProvider = 'gpt' | 'gemini'
export type AiConfig = { provider?: string; apiKey?: string; baseUrl?: string; model?: string }

export const HINT_LIMIT = 10
export const INITIAL_SCORE = 20
export const QUESTION_COST = 1
export const HINT_COST = 2

export function deductScore(score: number, cost: number) {
  const current = Number.isFinite(Number(score)) ? Number(score) : INITIAL_SCORE
  return Math.max(0, current - cost)
}

export type PlayerFilters = {
  yearFrom?: number | null
  yearTo?: number | null
  format?: 'tv' | 'movie' | 'ova' | 'web' | 'all' | string
  country?: 'japan' | 'western' | 'all' | string
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

const COUNTRY_META_TAGS: Record<string, string> = {
  japan: '日本',
  jp: '日本',
  日本: '日本',
  western: '欧美',
  west: '欧美',
  欧美: '欧美'
}

export function normalizeFilters(filters: PlayerFilters = {}): BangumiFilter {
  const result: BangumiFilter = { type: [2] }
  const metaTags: string[] = []
  const format = String(filters.format || 'all').toLowerCase()
  if (FORMAT_META_TAGS[format]) metaTags.push(FORMAT_META_TAGS[format])
  const countryRaw = String(filters.country || 'all')
  const country = COUNTRY_META_TAGS[countryRaw.toLowerCase()] || COUNTRY_META_TAGS[countryRaw]
  if (country) metaTags.push(country)
  if (metaTags.length) result.meta_tags = [...new Set(metaTags)]

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

function titleTokens(subject: any) {
  const names = [subject?.name, subject?.name_cn, ...(subject?.aliases || []).map((item: any) => item?.name || item)].filter(Boolean).map(String)
  const tokens = new Set<string>()
  for (const name of names) {
    tokens.add(name.toLowerCase())
    for (const part of name.split(/[\s:：!！?？~～\-_.·・、,，/（）()\[\]【】]+/)) {
      const token = part.trim().toLowerCase()
      if (token.length >= 2) tokens.add(token)
    }
  }
  return [...tokens].filter(Boolean)
}

function isTitleRelated(value: string, subject: any) {
  const lower = String(value || '').toLowerCase()
  if (!lower) return false
  return titleTokens(subject).some((token) => token.length >= 2 && (lower.includes(token) || token.includes(lower)))
}

function getTagNames(subject: any) {
  return (subject?.tags || [])
    .map((tag: any) => tag.name)
    .filter((name: string) => name && !/^\d{4}(年|$)/.test(name) && !['TV', '剧场版', 'OVA', 'WEB', '日本', '欧美'].includes(name) && !isTitleRelated(name, subject))
}

function titleShape(subject: any, level = 0) {
  const title = String(subject?.name_cn || subject?.name || '')
  if (!title) return ''
  const parts = [`中文/常用标题长度约 ${title.length} 个字符`]
  if (level >= 1) parts.push(`首字符是「${title[0]}」`)
  if (level >= 2 && title.length > 1) parts.push(`末字符是「${title[title.length - 1]}」`)
  return `${parts.join('，')}。`
}

export function buildFallbackHintDeck(subject: any) {
  const year = String(subject?.air_date || subject?.date || '').slice(0, 4)
  const tags = getTagNames(subject).slice(0, 8)
  const metaTags = subject?.meta_tags || []
  const format = metaTags.find((tag: string) => ['TV', '剧场版', 'OVA', 'WEB'].includes(tag)) || subject?.platform || ''
  const country = metaTags.find((tag: string) => ['日本', '欧美'].includes(tag)) || ''
  const studio = extractInfoboxValue(subject, ['动画制作', '制作'])
  const director = extractInfoboxValue(subject, ['导演', '监督'])
  const original = extractInfoboxValue(subject, ['原作', '原案'])
  const series = extractInfoboxValue(subject, ['系列构成', '脚本'])
  const music = extractInfoboxValue(subject, ['音乐'])
  const theme = extractInfoboxValue(subject, ['主题歌演出', '片头歌演出', '片尾歌演出'])
  const castList = getInfoboxList(subject, ['主演', '声优', '配音']).slice(0, 6)
  const score = subject?.rating?.score ? Number(subject.rating.score).toFixed(1) : ''
  const rank = subject?.rank ? `排名约 #${subject.rank}` : ''
  const ratingTotal = subject?.rating?.total ? `评分人数约 ${subject.rating.total}` : ''
  const summary = String(subject?.summary || '').replace(/\s+/g, ' ').trim()
  const originalTitle = String(subject?.name || '')

  const candidates = [
    year || country || format || tags.length ? `基础线索：它是${year ? `${year}年` : '某一年'}开播的${country ? `${country}` : ''}${format ? `${format}` : ''}动画${tags[0] ? `，早期标签包括「${tags.slice(0, 2).join('、')}」` : ''}。` : '',
    score || rank || ratingTotal ? `Bangumi 数据线索：当前评分约 ${score || '未知'} 分${rank ? `，${rank}` : ''}${ratingTotal ? `，${ratingTotal}` : ''}。` : '',
    studio ? `制作线索：动画制作相关信息里出现了「${studio}」。` : '',
    director || original ? `主创线索：${director ? `导演/监督信息里出现「${director}」` : ''}${director && original ? '，' : ''}${original ? `原作/原案信息里出现「${original}」` : ''}。` : '',
    series || music ? `幕后线索：${series ? `系列构成/脚本信息里出现「${series}」` : ''}${series && music ? '，' : ''}${music ? `音乐信息里出现「${music}」` : ''}。` : '',
    castList.length ? `声演线索：配音/主演相关信息里可以关注「${castList.slice(0, 2).join('、')}」。` : '',
    tags.length ? `标签线索：更核心的 Bangumi 标签包括「${tags.slice(0, 5).join('、')}」。` : '',
    theme ? `歌曲线索：主题歌相关信息里出现了「${theme}」。` : '',
    summary ? `简介线索：${summary.slice(0, 120)}${summary.length > 120 ? '……' : ''}` : '',
    titleShape(subject, 1),
    originalTitle ? `标题线索：原名长度约 ${originalTitle.length} 个字符${originalTitle[0] ? `，首字符是「${originalTitle[0]}」` : ''}。` : '',
    titleShape(subject, 2)
  ]
    .map((hint) => safeTitleFree(hint, subject))
    .filter(Boolean)

  const unique: string[] = []
  for (const hint of candidates) {
    if (!unique.includes(hint)) unique.push(hint)
    if (unique.length >= HINT_LIMIT) break
  }

  const fallbackFacts = [
    year ? `补充线索：开播年份可以锁定在 ${year} 年。` : '补充线索：Bangumi 对这部动画的年份资料不完整。',
    country ? `补充线索：国家/地区标记是「${country}」。` : '补充线索：国家/地区标记不明显。',
    format ? `补充线索：条目标记里包含「${format}」。` : '补充线索：条目类型标记不明显。',
    tags[0] ? `补充线索：最靠前的标签之一是「${tags[0]}」。` : '补充线索：标签资料较少。',
    score ? `补充线索：评分大约在 ${score} 分附近。` : '补充线索：评分资料较少。',
    castList[0] ? `补充线索：声演名单里可以优先关注「${castList[0]}」。` : '补充线索：声演资料较少。',
    studio ? `补充线索：制作公司/制作信息仍可关注「${studio}」。` : '补充线索：制作公司资料较少。',
    titleShape(subject, 0),
    titleShape(subject, 1),
    titleShape(subject, 2)
  ]
    .map((hint) => safeTitleFree(hint, subject))
    .filter(Boolean)

  let i = 0
  while (unique.length < HINT_LIMIT) {
    const hint = fallbackFacts[i % fallbackFacts.length] || `补充线索：这是第 ${unique.length + 1} 条可用提示。`
    const normalized = unique.includes(hint) ? `${hint.replace(/。$/, '')}（提示 ${unique.length + 1}）。` : hint
    unique.push(normalized)
    i += 1
  }

  return unique.slice(0, HINT_LIMIT)
}

export function hintResponseFromUsedCount(hint: string, usedCount: number, score = 0) {
  const remainingHints = Math.max(0, HINT_LIMIT - usedCount)
  return {
    hint,
    remainingHints,
    totalHints: HINT_LIMIT,
    exhausted: !hint && remainingHints === 0,
    score
  }
}

function configuredProvider(input?: string): AiProvider {
  const p = String(input || 'gpt').toLowerCase()
  return p.includes('gemini') ? 'gemini' : 'gpt'
}

function normalizeAiConfig(input?: string | AiConfig): Required<Pick<AiConfig, 'provider' | 'apiKey'>> & Pick<AiConfig, 'baseUrl' | 'model'> {
  if (typeof input === 'string') return { provider: configuredProvider(input), apiKey: '' }
  return {
    provider: configuredProvider(input?.provider),
    apiKey: String(input?.apiKey || '').trim(),
    baseUrl: input?.baseUrl,
    model: input?.model
  }
}

async function callHintAiJson(prompt: string, config?: string | AiConfig) {
  const ai = normalizeAiConfig(config)
  if (!ai.apiKey) throw new Error('未配置提示生成模型 API Key')
  if (ai.provider === 'gemini') return callGeminiHintJson(prompt, ai)
  return callOpenAiHintJson(prompt, ai)
}

async function callOpenAiHintJson(prompt: string, config: Required<Pick<AiConfig, 'apiKey'>> & Pick<AiConfig, 'baseUrl' | 'model'>) {
  const base = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5
    })
  })
  if (!res.ok) throw new Error(`GPT API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseHintJson(data?.choices?.[0]?.message?.content)
}

async function callGeminiHintJson(prompt: string, config: Required<Pick<AiConfig, 'apiKey'>> & Pick<AiConfig, 'model'>) {
  const model = config.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`)
  url.searchParams.set('key', config.apiKey)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseHintJson(data?.candidates?.[0]?.content?.parts?.[0]?.text)
}

function parseHintJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}')
    return { hints: Array.isArray(parsed.hints) ? parsed.hints : [] }
  } catch {
    return { hints: [] }
  }
}

function normalizeHintArray(input: any, subject: any) {
  if (!Array.isArray(input)) return []
  const tokens = titleTokens(subject)
  const result: string[] = []
  for (const raw of input) {
    let hint = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!hint) continue
    const originalLower = hint.toLowerCase()
    if (tokens.some((token) => token.length >= 2 && originalLower.includes(token))) continue
    for (const name of [subject?.name, subject?.name_cn, ...(subject?.aliases || []).map((item: any) => item?.name || item)].filter(Boolean).map(String)) {
      hint = hint.replaceAll(name, '这部动画')
    }
    const lower = hint.toLowerCase()
    if (tokens.some((token) => token.length >= 2 && lower.includes(token))) continue
    if (!result.includes(hint)) result.push(hint.slice(0, 120))
    if (result.length >= HINT_LIMIT) break
  }
  return result
}

export async function buildHintDeck(subject: any, config?: string | AiConfig) {
  const prompt = `你在主持一个猜动画名游戏。请基于 Bangumi 资料，为答案动画生成 10 条从宽泛到核心、但不直接泄露答案的中文提示。
严格规则：
- 只能输出 JSON：{"hints":["提示1",...,"提示10"]}
- 必须正好 10 条，每条 15-60 个中文字符左右。
- 不要出现动画的标题、中文名、英文名、别名、系列标题，也不要出现与标题明显相关的标签词。
- 如果 Bangumi 标签、简介、人名或条目名中包含标题关键词、系列名、角色名等明显指向答案的信息，必须跳过，不要写入提示。
- 可以使用年份、地区、类型、评分区间、制作公司、监督、编剧、音乐、声优、主题歌、非标题类标签、简介氛围等信息。
- 越靠后的提示越接近核心信息，但仍不能直接说出标题或标题形状。
- 关键人名、公司、标签、年份等可用「」标记，便于页面高亮。
- 不要编造资料中没有的信息。

Bangumi资料：${JSON.stringify(compactSubjectForAi(subject)).slice(0, 12000)}`

  try {
    const parsed = await callHintAiJson(prompt, config)
    const hints = normalizeHintArray(parsed?.hints, subject)
    if (hints.length === HINT_LIMIT) return hints
  } catch {
    // fall through to deterministic safe fallback
  }
  return buildFallbackHintDeck(subject)
}

export function pickHint(subject: any, usedHints = new Set<string>(), turn = 0) {
  const deck = buildFallbackHintDeck(subject)
  const available = deck.filter((hint) => !usedHints.has(hint))
  return available[0] || deck[Math.min(turn, deck.length - 1)]
}

export function compactSubjectForAi(subject: any) {
  return {
    id: subject.id,
    name: subject.name,
    name_cn: subject.name_cn,
    aliases: subject.aliases || [],
    type: subject.type,
    date: subject.date || subject.air_date,
    summary: subject.summary,
    tags: (subject.tags || []).slice(0, 20).map((tag: any) => tag.name),
    meta_tags: subject.meta_tags || [],
    infobox: subject.infobox || [],
    rating: subject.rating,
    rank: subject.rank
  }
}
