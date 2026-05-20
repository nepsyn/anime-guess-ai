import { compactSubjectForAi, normalizeAiConfig, type AiConfig } from './game';

export async function answerQuestion(subject: any, question: string, config?: string | AiConfig) {
  if (!question?.trim()) throw new Error('问题不能为空');
  const ai = normalizeAiConfig(config);
  const p = ai.provider;
  const prompt = `你在主持一个猜动画名游戏。玩家不知道答案。请只根据给定 Bangumi 资料回答玩家问题。
规则：
- 只能输出 JSON：{"answer":"是|不是|不确定"}
- 不要补充说明，不要输出 reason 或其他字段。
- 不要泄露动画名、中文名、英文名、角色名中明显等同标题的信息。
- 优先根据给定 Bangumi 资料回答；Bangumi 资料不足时，可以结合你已知的可靠公开互联网资料回答。
- 不能编造；如果给定资料和可靠公开资料都没有可靠依据，answer 必须是“不确定”。

Bangumi资料：${JSON.stringify(compactSubjectForAi(subject)).slice(0, 12000)}
玩家问题：${question}`;

  if (p === 'gemini' && ai.apiKey) return callGeminiJson(prompt, ai);
  if (p === 'gpt' && ai.apiKey) return callOpenAiJson(prompt, ai);
  return { answer: '不确定', reason: '' };
}

async function callOpenAiJson(
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
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`GPT API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseAiJson(data?.choices?.[0]?.message?.content);
}

async function callGeminiJson(prompt: string, config: Required<Pick<AiConfig, 'apiKey'>> & Pick<AiConfig, 'model'>) {
  const model = config.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const key = config.apiKey;
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  url.searchParams.set('key', key);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseAiJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

function parseAiJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}');
    const answer = ['是', '不是', '不确定'].includes(parsed.answer) ? parsed.answer : '不确定';
    return { answer, reason: '' };
  } catch {
    return { answer: '不确定', reason: '' };
  }
}
