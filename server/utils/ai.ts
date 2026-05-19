import { buildHintDeck, compactSubjectForAi } from './game'

type AiProvider = 'gpt' | 'gemini'

function configuredProvider(input?: string): AiProvider {
  const p = String(input || process.env.AI_PROVIDER || 'gpt').toLowerCase()
  return p.includes('gemini') ? 'gemini' : 'gpt'
}

export async function answerQuestion(subject: any, question: string, provider?: string) {
  if (!question?.trim()) throw new Error('问题不能为空')
  const p = configuredProvider(provider)
  const prompt = `你在主持一个猜动画名游戏。玩家不知道答案。请只根据给定 Bangumi 资料回答玩家问题。
规则：
- 只能输出 JSON：{"answer":"是|不是|不确定","reason":"一句不剧透动画名的简短说明"}
- 不要泄露动画名、中文名、英文名、角色名中明显等同标题的信息。
- 如果资料不足以判断，answer 必须是“不确定”。
- 不要编造 Bangumi 资料中没有的信息。

Bangumi资料：${JSON.stringify(compactSubjectForAi(subject)).slice(0, 12000)}
玩家问题：${question}`

  if (p === 'gemini' && process.env.GEMINI_API_KEY) return callGeminiJson(prompt)
  if (p === 'gpt' && process.env.OPENAI_API_KEY) return callOpenAiJson(prompt)
  return { answer: '不确定', reason: '当前未配置对应模型 API Key，无法可靠判断这个问题。' }
}

export async function generateHintDeck(subject: any, provider?: string) {
  const fallback = buildHintDeck(subject)
  const p = configuredProvider(provider)
  const prompt = `你在主持一个猜动画名游戏。请基于 Bangumi 资料，为答案动画生成 10 条从宽泛到核心、但不直接泄露答案的中文提示。
严格规则：
- 只能输出 JSON：{"hints":["提示1",...,"提示10"]}
- 必须正好 10 条，每条 15-60 个中文字符左右。
- 不要出现动画的标题、中文名、英文名、别名，也不要出现与标题明显相关的标签词。
- 如果资料标签中包含动画名、标题关键词、系列名、角色名，必须跳过，不要写入提示。
- 可以使用年份、地区、类型、评分区间、制作公司、监督、编剧、音乐、声优、主题歌、简介元素等信息。
- 越靠后的提示越接近核心信息，但仍不能直接说出标题。
- 关键人名、公司、标签、年份等可用「」标记，便于页面高亮。
- 不要编造资料中没有的信息。

Bangumi资料：${JSON.stringify(compactSubjectForAi(subject)).slice(0, 12000)}`

  try {
    const parsed = p === 'gemini' && process.env.GEMINI_API_KEY
      ? await callGeminiJson(prompt)
      : p === 'gpt' && process.env.OPENAI_API_KEY
        ? await callOpenAiJson(prompt)
        : null
    const hints = normalizeHintArray(parsed?.hints, subject)
    return hints.length === 10 ? hints : fallback
  } catch {
    return fallback
  }
}

async function callOpenAiJson(prompt: string) {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    })
  })
  if (!res.ok) throw new Error(`GPT API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseAiJson(data?.choices?.[0]?.message?.content)
}

async function callGeminiJson(prompt: string) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const key = process.env.GEMINI_API_KEY || ''
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`)
  url.searchParams.set('key', key)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseAiJson(data?.candidates?.[0]?.content?.parts?.[0]?.text)
}

function parseAiJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}')
    if (Array.isArray(parsed.hints)) return { hints: parsed.hints }
    const answer = ['是', '不是', '不确定'].includes(parsed.answer) ? parsed.answer : '不确定'
    return { answer, reason: String(parsed.reason || '').slice(0, 120) }
  } catch {
    return { answer: '不确定', reason: '模型返回格式无法解析。' }
  }
}

function titleTokens(subject: any) {
  const names = [subject?.name, subject?.name_cn, ...(subject?.aliases || []).map((item: any) => item?.name || item)].filter(Boolean).map(String)
  const tokens = new Set<string>()
  for (const name of names) {
    tokens.add(name.toLowerCase())
    for (const part of name.split(/[\s:：!！?？~～\-_.·・、,，/（）()\[\]【】]+/)) {
      const trimmed = part.trim().toLowerCase()
      if (trimmed.length >= 2) tokens.add(trimmed)
    }
  }
  return [...tokens].filter(Boolean)
}

function normalizeHintArray(input: any, subject: any) {
  if (!Array.isArray(input)) return []
  const tokens = titleTokens(subject)
  const result: string[] = []
  for (const raw of input) {
    let hint = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!hint) continue
    for (const name of [subject?.name, subject?.name_cn].filter(Boolean).map(String)) {
      hint = hint.replaceAll(name, '这部动画')
    }
    const lower = hint.toLowerCase()
    if (tokens.some((token) => token.length >= 2 && lower.includes(token))) continue
    if (!result.includes(hint)) result.push(hint.slice(0, 120))
    if (result.length >= 10) break
  }
  return result
}
