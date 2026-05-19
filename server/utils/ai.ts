import { compactSubjectForAi } from './game'

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

  if (p === 'gemini' && process.env.GEMINI_API_KEY) return callGemini(prompt)
  if (p === 'gpt' && process.env.OPENAI_API_KEY) return callOpenAi(prompt)
  return { answer: '不确定', reason: '当前未配置对应模型 API Key，无法可靠判断这个问题。' }
}

async function callOpenAi(prompt: string) {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    })
  })
  if (!res.ok) throw new Error(`GPT API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseAiJson(data?.choices?.[0]?.message?.content)
}

async function callGemini(prompt: string) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseAiJson(data?.candidates?.[0]?.content?.parts?.[0]?.text)
}

function parseAiJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}')
    const answer = ['是', '不是', '不确定'].includes(parsed.answer) ? parsed.answer : '不确定'
    return { answer, reason: String(parsed.reason || '').slice(0, 120) }
  } catch {
    return { answer: '不确定', reason: '模型返回格式无法解析。' }
  }
}
