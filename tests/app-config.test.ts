import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8');
const readBytes = (path: string) => readFileSync(join(import.meta.dir, '..', path));

describe('app shell metadata', () => {
  test('uses the new game title and favicon asset', () => {
    const config = read('nuxt.config.ts');
    const favicon = readBytes('public/favicon.ico');

    expect(config).toContain("appName: '二次元婆罗门猜猜乐'");
    expect(config).toContain("title: '二次元婆罗门猜猜乐'");
    expect(config).toContain("href: '/favicon.ico'");
    expect(favicon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(favicon.length).toBeGreaterThan(100);
  });
});
