import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8');

describe('app shell metadata', () => {
  test('uses the new game title and favicon asset', () => {
    const config = read('nuxt.config.ts');
    const favicon = read('public/favicon.ico');

    expect(config).toContain("appName: '婆罗门猜猜乐'");
    expect(config).toContain("title: '婆罗门猜猜乐'");
    expect(config).toContain("href: '/favicon.ico'");
    expect(favicon).toContain('<svg');
    expect(favicon).toContain('婆');
  });
});
