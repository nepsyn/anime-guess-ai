import { describe, expect, test } from 'bun:test';
import { getSubjectWithPersons } from '../server/utils/bangumi';

describe('Bangumi subject details', () => {
  test('fetches subject details together with persons for AI context', async () => {
    const oldFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = async (url) => {
      requested.push(String(url));
      if (String(url).endsWith('/v0/subjects/123')) {
        return new Response(JSON.stringify({ id: 123, name: 'sample', name_cn: '样例动画' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (String(url).endsWith('/v0/subjects/123/persons')) {
        return new Response(JSON.stringify([{ id: 9, name: '测试监督', relation: '导演' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    };

    try {
      const subject = await getSubjectWithPersons(123);
      expect(requested.some((url) => url.endsWith('/v0/subjects/123'))).toBe(true);
      expect(requested.some((url) => url.endsWith('/v0/subjects/123/persons'))).toBe(true);
      expect(subject.name_cn).toBe('样例动画');
      expect(subject.persons).toEqual([{ id: 9, name: '测试监督', relation: '导演' }]);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
