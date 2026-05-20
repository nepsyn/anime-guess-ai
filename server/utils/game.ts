export type AiProvider = 'gpt' | 'gemini';
export type AiConfig = { provider?: string; apiKey?: string; baseUrl?: string; model?: string };

export const HINT_LIMIT = 10;
export const INITIAL_SCORE = 20;
export const QUESTION_COST = 1;
export const HINT_COST = 2;

export function deductScore(score: number, cost: number) {
  const current = Number.isFinite(Number(score)) ? Number(score) : INITIAL_SCORE;
  return Math.max(0, current - cost);
}

export type PlayerFilters = {
  yearFrom?: number | null;
  yearTo?: number | null;
  format?: 'tv' | 'movie' | 'ova' | 'web' | 'all' | string;
  country?: 'japan' | 'western' | 'china' | 'all' | string;
  tags?: string | string[];
  ratingMin?: number | null;
  ratingMax?: number | null;
};

export type BangumiFilter = {
  type: number[];
  meta_tags?: string[];
  tag?: string[];
  air_date?: [string, string];
  rating?: [string, string];
};

const FORMAT_META_TAGS: Record<string, string> = {
  tv: 'TV',
  movie: '剧场版',
  ova: 'OVA',
  web: 'WEB',
};

const COUNTRY_META_TAGS: Record<string, string> = {
  japan: '日本',
  jp: '日本',
  日本: '日本',
  western: '欧美',
  west: '欧美',
  欧美: '欧美',
  china: '中国',
  cn: '中国',
  chinese: '中国',
  中国: '中国',
};

export function normalizeFilters(filters: PlayerFilters = {}): BangumiFilter {
  const result: BangumiFilter = { type: [2] };
  const metaTags: string[] = [];
  const format = String(filters.format || 'all').toLowerCase();
  if (FORMAT_META_TAGS[format]) metaTags.push(FORMAT_META_TAGS[format]);
  const countryRaw = String(filters.country || 'all');
  const country = COUNTRY_META_TAGS[countryRaw.toLowerCase()] || COUNTRY_META_TAGS[countryRaw];
  if (country) metaTags.push(country);
  if (metaTags.length) result.meta_tags = [...new Set(metaTags)];

  const tags = Array.isArray(filters.tags)
    ? filters.tags
    : String(filters.tags || '')
        .split(/[,，\s]+/)
        .filter(Boolean);
  if (tags.length) result.tag = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  const yearFrom = Number(filters.yearFrom);
  const yearTo = Number(filters.yearTo);
  if (Number.isFinite(yearFrom) || Number.isFinite(yearTo)) {
    const from = Number.isFinite(yearFrom) ? Math.max(1900, Math.min(2100, yearFrom)) : 1900;
    const to = Number.isFinite(yearTo) ? Math.max(1900, Math.min(2100, yearTo)) : new Date().getFullYear() + 1;
    result.air_date = [`>=${from}-01-01`, `<=${to}-12-31`];
  }

  const ratingMin = Number(filters.ratingMin);
  const ratingMax = Number(filters.ratingMax);
  if (Number.isFinite(ratingMin) || Number.isFinite(ratingMax)) {
    const min = Number.isFinite(ratingMin) ? Math.max(0, Math.min(10, ratingMin)) : 0;
    const max = Number.isFinite(ratingMax) ? Math.max(0, Math.min(10, ratingMax)) : 10;
    result.rating = [`>=${min}`, `<=${max}`];
  }

  return result;
}

export function isCorrectGuess(guessSubjectId: number, answer: { subjectId: number; relatedIds?: number[] }) {
  const ids = new Set([answer.subjectId, ...(answer.relatedIds || [])].map(Number));
  return ids.has(Number(guessSubjectId));
}

export function getSubjectImage(subject: any) {
  return (
    subject?.images?.large ||
    subject?.images?.common ||
    subject?.images?.medium ||
    subject?.images?.grid ||
    subject?.images?.small ||
    ''
  );
}

export function publicAnswer(subject: any) {
  return {
    id: subject.id,
    name: subject.name,
    name_cn: subject.name_cn,
    image: getSubjectImage(subject),
    url: `https://bgm.tv/subject/${subject.id}`,
  };
}

function titleTokens(subject: any) {
  const names = [subject?.name, subject?.name_cn, ...(subject?.aliases || []).map((item: any) => item?.name || item)]
    .filter(Boolean)
    .map(String);
  const tokens = new Set<string>();
  for (const name of names) {
    tokens.add(name.toLowerCase());
    for (const part of name.split(/[\s:：!！?？~～\-_.·・、,，/（）()\[\]【】]+/)) {
      const token = part.trim().toLowerCase();
      if (token.length >= 2) tokens.add(token);
    }
  }
  return [...tokens].filter(Boolean);
}

export function hintResponseFromUsedCount(hint: string, usedCount: number, score = 0) {
  const remainingHints = Math.max(0, HINT_LIMIT - usedCount);
  return {
    hint,
    remainingHints,
    totalHints: HINT_LIMIT,
    exhausted: !hint && remainingHints === 0,
    score,
  };
}

export function pickHint(subject: any, used = new Set<string>(), index = 0) {
  const compact = compactSubjectForAi(subject);
  const candidates = [
    compact.date ? `播出时间约为「${String(compact.date).slice(0, 7)}」。` : '',
    compact.meta_tags?.length ? `类型标签包含「${compact.meta_tags.join('、')}」。` : '',
    compact.rating?.score ? `Bangumi 评分约「${compact.rating.score}」。` : '',
    compact.tags?.length ? `关键标签包括「${compact.tags.slice(0, 3).join('、')}」。` : '',
    compact.summary ? `故事简介：${String(compact.summary).slice(0, 60)}` : '',
  ].filter(Boolean);
  const safe = candidates.filter((hint) => !used.has(hint));
  return safe[index % Math.max(1, safe.length)] || '这部动画的公开资料较少。';
}

export function configuredProvider(input?: string): AiProvider {
  const p = String(input || 'gpt').toLowerCase();
  return p.includes('gemini') ? 'gemini' : 'gpt';
}

function envApiKeyFor(provider: AiProvider) {
  return String(provider === 'gemini' ? process.env.GEMINI_API_KEY || '' : process.env.OPENAI_API_KEY || '').trim();
}

function envDefaultProvider() {
  if (process.env.AI_PROVIDER) return configuredProvider(process.env.AI_PROVIDER);
  if (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return 'gemini';
  return 'gpt';
}

export function normalizeAiConfig(
  input?: string | AiConfig,
): Required<Pick<AiConfig, 'provider' | 'apiKey'>> & Pick<AiConfig, 'baseUrl' | 'model'> {
  const userApiKey = typeof input === 'string' ? '' : String(input?.apiKey || '').trim();
  let provider = configuredProvider(typeof input === 'string' ? input : input?.provider);
  let apiKey = userApiKey;

  if (!apiKey) {
    const defaultProvider = envDefaultProvider();
    const defaultKey = envApiKeyFor(defaultProvider);
    if (defaultKey) {
      provider = defaultProvider;
      apiKey = defaultKey;
    } else {
      apiKey = envApiKeyFor(provider);
    }
  }

  if (typeof input === 'string') return { provider, apiKey };
  return {
    provider,
    apiKey,
    baseUrl: input?.baseUrl,
    model: input?.model,
  };
}

async function callHintAiJson(prompt: string, config?: string | AiConfig) {
  const ai = normalizeAiConfig(config);
  if (!ai.apiKey) throw new Error('未配置提示生成模型 API Key');
  if (ai.provider === 'gemini') return callGeminiHintJson(prompt, ai);
  return callOpenAiHintJson(prompt, ai);
}

async function callOpenAiHintJson(
  prompt: string,
  config: Required<Pick<AiConfig, 'apiKey'>> & Pick<AiConfig, 'baseUrl' | 'model'>,
) {
  const base = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    }),
  });
  if (!res.ok) throw new Error(`GPT API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseHintJson(data?.choices?.[0]?.message?.content);
}

async function callGeminiHintJson(
  prompt: string,
  config: Required<Pick<AiConfig, 'apiKey'>> & Pick<AiConfig, 'model'>,
) {
  const model = config.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  url.searchParams.set('key', config.apiKey);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseHintJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

function parseHintJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}');
    return { hints: Array.isArray(parsed.hints) ? parsed.hints : [] };
  } catch {
    return { hints: [] };
  }
}

function normalizeHintArray(input: any, subject: any) {
  if (!Array.isArray(input)) return [];
  const tokens = titleTokens(subject);
  const result: string[] = [];
  for (const raw of input) {
    let hint = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!hint) continue;
    const originalLower = hint.toLowerCase();
    if (tokens.some((token) => token.length >= 2 && originalLower.includes(token))) continue;
    for (const name of [
      subject?.name,
      subject?.name_cn,
      ...(subject?.aliases || []).map((item: any) => item?.name || item),
    ]
      .filter(Boolean)
      .map(String)) {
      hint = hint.replaceAll(name, '这部动画');
    }
    const lower = hint.toLowerCase();
    if (tokens.some((token) => token.length >= 2 && lower.includes(token))) continue;
    if (!result.includes(hint)) result.push(hint.slice(0, 120));
    if (result.length >= HINT_LIMIT) break;
  }
  return result;
}

export async function buildHintDeck(subject: any, config?: string | AiConfig) {
  const prompt = `你在主持一个猜动画名游戏。请基于 Bangumi 资料，为答案动画生成 10 条中文提示。
严格规则：
- 只能输出 JSON：{"hints":["提示1",...,"提示10"]}
- 必须正好 10 条，每条 15-80 个中文字符左右，顺序和内容必须严格对应下面 10 类。
- 不要出现动画完整标题、中文名、英文名、别名或系列完整标题。
- 第 9 条允许透露主角名字；如果 Bangumi 与角色资料里没有明确主角，请用其他资料代替生成提示。
- 第 10 条允许透露动画名称中带的一个字或一个短词，但不能给出完整标题。
- 关键人名、公司、标签、年份、月份等可用「」标记，便于页面高亮。
- 不要编造 Bangumi 资料中没有的信息；资料缺失用其他可用资料代替生成提示内容。

提示必须按此顺序生成，每条提示不额外透露信息，只陈述事实不加额外的修饰：
1. 播出年份、月份
2. 动画类型（漫画改、原创、游戏改等）
3. Bangumi 评分
4. 关键标签
5. 制作公司
6. 动画导演
7. 参与配音的一个声优
8. 故事简介
9. 主角名字
10. 动画名称中带的一个字或词

Bangumi资料：${JSON.stringify(compactSubjectForAi(subject)).slice(0, 12000)}`;

  try {
    const parsed = await callHintAiJson(prompt, config);
    const hints = normalizeHintArray(parsed?.hints, subject);
    if (hints.length !== HINT_LIMIT) throw new Error(`模型返回了 ${hints.length} 条有效提示，需要 ${HINT_LIMIT} 条`);
    return hints;
  } catch (err: any) {
    throw new Error(`提示生成失败：${err?.message || '模型未返回可用提示'}`);
  }
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
    characters: (subject.characters || []).slice(0, 40).map((character: any) => ({
      id: character?.id,
      name: character?.name,
      name_cn: character?.name_cn,
      relation: character?.relation,
      actors: (character?.actors || [])
        .slice?.(0, 5)
        ?.map((actor: any) => actor?.name || actor?.name_cn || actor)
        ?.filter(Boolean),
    })),
    rating: subject.rating,
    rank: subject.rank,
  };
}
