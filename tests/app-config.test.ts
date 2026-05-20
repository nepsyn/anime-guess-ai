import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8');
const readBytes = (path: string) => readFileSync(join(import.meta.dir, '..', path));

const exists = (path: string) => existsSync(join(import.meta.dir, '..', path));

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

  test('loads Umami through @nuxt/scripts using configurable environment variables', () => {
    const config = read('nuxt.config.ts');
    const pkg = JSON.parse(read('package.json'));
    const envExample = read('.env.example');

    expect(pkg.dependencies).toHaveProperty('@nuxt/scripts');
    expect(config).toContain("'@nuxt/scripts'");
    expect(config).toContain('umami: {');
    expect(config).toContain('process.env.UMAMI_WEBSITE_ID || process.env.NUXT_PUBLIC_UMAMI_WEBSITE_ID ||');
    expect(config).toContain('process.env.UMAMI_HOST_URL || process.env.NUXT_PUBLIC_UMAMI_HOST_URL ||');

    expect(exists('app/plugins/umami.client.ts')).toBe(true);
    expect(exists('plugins/umami.client.ts')).toBe(false);
    const plugin = read('app/plugins/umami.client.ts');
    expect(plugin).toContain('useScriptUmamiAnalytics');
    expect(plugin).toContain('config.public.umami.websiteId');
    expect(plugin).toContain('config.public.umami.hostUrl');
    expect(plugin).toContain("trigger: 'onNuxtReady'");

    expect(envExample).toContain('UMAMI_HOST_URL=');
    expect(envExample).toContain('UMAMI_WEBSITE_ID=');
    expect(envExample).toContain('NUXT_PUBLIC_UMAMI_HOST_URL=');
    expect(envExample).toContain('NUXT_PUBLIC_UMAMI_WEBSITE_ID=');
  });
});
