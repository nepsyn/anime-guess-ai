import { describe, expect, test } from 'bun:test';
import { findRandomCollectedSubject } from '../server/utils/bangumi';

describe('findRandomCollectedSubject', () => {
  test('uses public Bangumi collections total to fetch one watched anime at a random offset', async () => {
    const oldFetch = globalThis.fetch;
    const oldRandom = Math.random;
    const urls: string[] = [];
    Math.random = () => 0.5;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (urls.length === 1) {
        return new Response(JSON.stringify({ total: 10, data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ total: 10, data: [{ subject: { id: 123, name: 'test', type: 2 } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    try {
      const subject = await findRandomCollectedSubject('nepsyn');

      expect(subject.id).toBe(123);
      expect(urls[0]).toContain('/v0/users/nepsyn/collections?');
      expect(urls[0]).toContain('subject_type=2');
      expect(urls[0]).toContain('type=2');
      expect(urls[0]).toContain('limit=1');
      expect(urls[0]).toContain('offset=0');
      expect(urls[1]).toContain('offset=5');
    } finally {
      globalThis.fetch = oldFetch;
      Math.random = oldRandom;
    }
  });
});
