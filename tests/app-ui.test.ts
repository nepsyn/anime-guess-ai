import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appVue = () => readFileSync(join(import.meta.dir, '..', 'app', 'app.vue'), 'utf8');

describe('app layout controls', () => {
  test('places the settings button next to the start-new-game button', () => {
    const source = appVue();
    const heroControls = source.match(/<div class="mt-3 flex flex-wrap items-center gap-2[\s\S]*?<\/div>/)?.[0] || '';

    expect(heroControls).toContain('@click="startGame"');
    expect(heroControls).toContain('@click="settingsOpen = true"');
    expect(heroControls.indexOf('@click="settingsOpen = true"')).toBeGreaterThan(
      heroControls.indexOf('@click="startGame"'),
    );
  });

  test('keeps question action buttons compact and side-by-side on small screens', () => {
    const source = appVue();

    expect(source).toContain('<div class="mt-3 flex flex-wrap gap-2">');
    expect(source).not.toContain('<div class="mt-3 grid gap-2 sm:flex sm:flex-wrap">');
    expect(source).toMatch(/@click="ask"[\s\S]*?>\s*提问\s*<\/button>/);
    expect(source).toContain('px-4 py-2');
    expect(source).not.toContain('min-h-12 rounded-2xl bg-emerald-500 px-5 py-3');
  });

  test('uses abandon wording and records the revealed cover image', () => {
    const source = appVue();

    expect(source).toContain('放弃');
    expect(source).toContain('确定要放弃并直接揭晓正确答案吗？');
    expect(source).toContain("reveal(res.answer, '放弃成功，正确答案')");
    expect(source).toContain('image: answer.image');
    expect(source).not.toContain('投降');
  });

  test('uses compact mobile layout, new title, domestic filter, and disables play controls after reveal', () => {
    const source = appVue();

    expect(source).toContain('婆罗门猜猜乐');
    expect(source).not.toContain('AI 辅助猜动画名');
    expect(source).toContain('const gameEnded = computed(() => Boolean(revealedAnswer.value));');
    expect(source).toContain('const canPlay = computed(() => Boolean(sessionId.value) && !gameEnded.value);');
    expect(source).toContain('<option value="china">中国</option>');
    expect(source).toContain('max-w-4xl space-y-3');
    expect(source).toContain('px-3 py-4 sm:px-4');
  });

  test('keeps start buttons text stable while loading and gives hero actions consistent sizing', () => {
    const source = appVue();
    const heroControls = source.match(/<div class="mt-3 flex flex-wrap items-center gap-2[\s\S]*?<\/div>/)?.[0] || '';

    expect(source).not.toContain("{{ loading ? '准备游戏中…' : '开始新游戏' }}");
    expect(source).not.toContain("{{ loading ? '准备游戏中…' : '按当前设置开始新游戏' }}");
    expect(source).toMatch(/>\s*开始新游戏\s*<\/button>/);
    expect(source).toMatch(/>\s*按当前设置开始新游戏\s*<\/button>/);
    expect(heroControls).toContain('h-10');
    expect(heroControls).toContain('min-w-[96px]');
    expect(heroControls).toContain('当前得分：');
  });

  test('supports rating count filter and links revealed titles in the log to Bangumi', () => {
    const source = appVue();

    expect(source).toContain('ratingCountMin');
    expect(source).toContain('ratingCountMax');
    expect(source).toContain('评分人数下限');
    expect(source).toContain('评分人数上限');
    expect(source).toContain('link?: string;');
    expect(source).toContain('link: answer.url');
    expect(source).toContain('v-if="item.link"');
    expect(source).toContain(':href="item.link"');
  });

  test('shows the answer dialog with abandon-specific text after surrender', () => {
    const source = appVue();

    expect(source).toContain("showCorrectDialog(res.answer, res.message, '放弃成功')");
    expect(source).toContain("title = '回答正确！'");
    expect(source).toContain("'放弃成功'");
    expect(source).toContain('{{ correctDialog.title }}');
  });
});
