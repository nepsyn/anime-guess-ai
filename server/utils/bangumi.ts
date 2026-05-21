import { normalizeFilters, type PlayerFilters } from './game';

const API = 'https://api.bgm.tv';
const UA = process.env.BANGUMI_USER_AGENT || 'anime-guess-ai/0.1 (https://github.com/nepsyn/anime-guess-ai)';

function headers() {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': UA,
    accept: 'application/json',
  };
  if (process.env.BANGUMI_TOKEN) h.authorization = `Bearer ${process.env.BANGUMI_TOKEN}`;
  return h;
}

async function bgmFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Bangumi API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function searchSubjects(keyword: string, limit = 10) {
  const data = await bgmFetch(`/v0/search/subjects?limit=${limit}&offset=0`, {
    method: 'POST',
    body: JSON.stringify({ keyword, sort: 'match', filter: { type: [2] } }),
  });
  return (data?.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    name_cn: item.name_cn,
    date: item.date,
    image: item.images?.grid || item.images?.small || '',
    score: item.rating?.score,
    rank: item.rank,
  }));
}

export async function findRandomSubject(filters: PlayerFilters) {
  const filter = normalizeFilters(filters);
  const first = await bgmFetch('/v0/search/subjects?limit=1&offset=0', {
    method: 'POST',
    body: JSON.stringify({ keyword: '', sort: 'rank', filter }),
  });
  const total = Math.min(Number(first?.total || 0), 1000);
  if (!total) throw new Error('没有找到符合筛选条件的动画，请放宽条件。');
  const offset = Math.floor(Math.random() * total);
  const pageOffset = Math.max(0, Math.min(offset, Math.max(0, total - 20)));
  const page = await bgmFetch(`/v0/search/subjects?limit=20&offset=${pageOffset}`, {
    method: 'POST',
    body: JSON.stringify({ keyword: '', sort: 'rank', filter }),
  });
  const candidates = (page?.data || []).filter((item: any) => item?.id);
  if (!candidates.length) throw new Error('Bangumi 返回了空结果，请稍后再试。');
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function findRandomCollectedSubject(uid: string) {
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) throw new Error('请先填写 Bangumi UID。');
  const collectionPath = (offset: number) =>
    `/v0/users/${encodeURIComponent(normalizedUid)}/collections?subject_type=2&type=2&limit=1&offset=${offset}`;
  const first = await bgmFetch(collectionPath(0));
  const total = Number(first?.total || 0);
  if (!total) throw new Error('这个 Bangumi 用户没有公开的“看过”动画收藏。');
  const offset = Math.floor(Math.random() * total);
  const page = await bgmFetch(collectionPath(offset));
  const item = (page?.data || [])[0];
  const subject = item?.subject || item;
  if (!subject?.id) throw new Error('Bangumi 收藏接口没有返回可用动画，请稍后再试。');
  return subject;
}

export async function getSubject(id: number) {
  return bgmFetch(`/v0/subjects/${id}`);
}

export async function getSubjectCharacters(id: number) {
  try {
    const characters = await bgmFetch(`/v0/subjects/${id}/characters`);
    return Array.isArray(characters) ? characters : [];
  } catch {
    return [];
  }
}

export async function getSubjectWithCharacters(id: number) {
  const [subject, characters] = await Promise.all([getSubject(id), getSubjectCharacters(id)]);
  return { ...subject, characters };
}

export async function getRelatedSubjectIds(id: number) {
  try {
    const rels = await bgmFetch(`/v0/subjects/${id}/subjects`);
    const useful = ['续集', '前传', '番外篇', '相同世界观', '不同演绎', '主线故事', '其他'];
    return (Array.isArray(rels) ? rels : [])
      .filter((rel: any) => rel?.type === 2 && (!rel.relation || useful.includes(rel.relation)))
      .map((rel: any) => Number(rel.id))
      .filter(Boolean);
  } catch {
    return [];
  }
}
