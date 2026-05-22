import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appVue = () => readFileSync(join(import.meta.dir, '..', 'app', 'app.vue'), 'utf8');

describe('app layout controls', () => {
  test('places the settings button next to the start-new-game button', () => {
    const source = appVue();
    const heroControls = source.match(/<div class="mt-3 flex flex-wrap items-center gap-2[\s\S]*?<\/div>/)?.[0] || '';

    expect(heroControls).toContain('@click="startGame"');
    expect(heroControls).toContain('@click="openSettings"');
    expect(heroControls.indexOf('@click="openSettings"')).toBeGreaterThan(
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

  test('shows spinner inside start-game buttons while loading and gives hero actions consistent sizing', () => {
    const source = appVue();
    const heroControls = source.match(/<div class="mt-3 flex flex-wrap items-center gap-2[\s\S]*?<\/div>/)?.[0] || '';

    expect(source).not.toContain("{{ loading ? '准备游戏中…' : '开始新游戏' }}");
    expect(source).not.toContain("{{ loading ? '准备游戏中…' : '按当前设置开始新游戏' }}");
    expect(source).toMatch(/v-if="loading"[\s\S]*animate-spin[\s\S]*sr-only[\s\S]*加载中/);
    expect(source).toMatch(/v-else>\s*开始新游戏\s*<\/template>/);
    expect(source).toMatch(/v-else>\s*按当前设置开始新游戏\s*<\/template>/);
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

  test('uses the requested default filters with open-ended upper bounds', () => {
    const source = appVue();

    expect(source).toContain("format: 'tv'");
    expect(source).toContain("country: 'japan'");
    expect(source).toContain('ratingMin: 7');
    expect(source).toContain('ratingMax: null as number | null');
    expect(source).toContain('ratingCountMin: 500');
    expect(source).toContain('ratingCountMax: null as number | null');
  });

  test('shows concrete server error messages and stores history in browser localStorage next to settings', () => {
    const source = appVue();
    const heroControls = source.match(/<div class="mt-3 flex flex-wrap items-center gap-2[\s\S]*?<\/div>/)?.[0] || '';

    expect(source).toContain('function errorMessage(err: any, fallback: string)');
    expect(source).toContain('err?.data?.statusMessage');
    expect(source).toContain('err?.statusMessage');
    expect(heroControls).toContain('@click="openHistory"');
    expect(heroControls).toContain('fa-clock-rotate-left');
    expect(source).toContain('HISTORY_STORAGE_KEY');
    expect(source).toContain('localStorage.getItem(HISTORY_STORAGE_KEY)');
    expect(source).toContain('localStorage.setItem(HISTORY_STORAGE_KEY');
    expect(source).toContain('saveHistory(answer)');
    expect(source).not.toContain('/api/game/history');
    expect(source).toContain('历史题目');
    expect(source).toContain('v-for="item in historyItems"');
  });

  test('persists settings immediately on input/change so refresh keeps the latest values', () => {
    const source = appVue();
    const settingsForm = source.match(/<div\s+[\s\S]*?class="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700"[\s\S]*?>/)?.[0] || '';

    expect(source).toContain("const SETTINGS_STORAGE_KEY = 'anime-guess-ai:game-settings'");
    expect(source).toContain('localStorage.getItem(SETTINGS_STORAGE_KEY)');
    expect(source).toContain('localStorage.setItem(SETTINGS_STORAGE_KEY');
    expect(source).toContain('onMounted(loadSettings)');
    expect(settingsForm).toContain('@input="saveSettings"');
    expect(settingsForm).toContain('@change="saveSettings"');
  });

  test('supports source mode settings for Bangumi watched collections', () => {
    const source = appVue();

    expect(source).toContain("sourceMode: 'filters'");
    expect(source).toContain('bangumiUid');
    expect(source).toContain('出题模式');
    expect(source).toContain('<option value="filters">按筛选条件随机</option>');
    expect(source).toContain('<option value="collections">从 Bangumi 看过收藏随机</option>');
    expect(source).toContain('Bangumi UID');
    expect(source).toContain('sourceMode: filters.sourceMode');
    expect(source).toContain('bangumiUid: filters.bangumiUid');
  });

  test('shows wrong-guess overlap tags on the player guess record without revealing the answer', () => {
    const source = appVue();

    expect(source).toContain('type SimilarityHint');
    expect(source).toContain('similarities?: SimilarityHint[];');
    expect(source).toContain('res.similarities?.length');
    expect(source).toContain('相同标签');
    expect(source).toContain('相同原作者');
    expect(source).toContain('相同导演');
    expect(source).toContain('共同参与配音的声优');
    expect(source).toContain('相同制作公司');
    expect(source).toContain('v-if="item.similarities?.length"');
    expect(source).toContain('v-for="value in hint.values"');
    expect(source).toContain('{{ value }}');
    expect(source).toContain('rounded-md bg-emerald-50');
    expect(source).not.toContain("{{ hint.label }}：{{ hint.values.join('、') }}");
    expect(source).not.toContain("hint.values.join('、')");
    expect(source).toContain("push({ role: 'player', text: '我猜是：', boldText: guessedTitle, image: item.image, link: `https://bgm.tv/subject/${item.id}`, similarities: res.similarities?.length ? res.similarities : undefined })");
    expect(source).toContain("push({ role: 'system', text: res.message, tone: 'bad' })");
    expect(source).not.toContain("push({ role: 'system', text: res.message, tone: 'bad', similarities:");
    expect(source).not.toContain('猜错后会显示：相同标签、共同参与配音的声优、相同制作公司');
    expect(source).not.toContain('暂无相同信息');
  });

  test('uses requested scoring wording and supports recent question shortcuts', () => {
    const source = appVue();

    expect(source).toContain('开局20分，每次提问-1分，提示-2分，猜错-3分。');
    expect(source).not.toContain('开局20分，每次提示-2分，每次提问-1分，猜错-3分。');
    expect(source).toContain("const QUESTION_HISTORY_STORAGE_KEY = 'anime-guess-ai:question-history'");
    expect(source).toContain('questionHistory.value = next.slice(0, 10)');
    expect(source).toContain('saveQuestionHistory(q)');
    expect(source).toContain('最近提问');
    expect(source).toContain('v-for="savedQuestion in questionHistory"');
    expect(source).toContain('question = savedQuestion');
  });

  test('keeps title and compact GitHub action side by side on mobile', () => {
    const source = appVue();

    expect(source).toContain('https://github.com/nepsyn/anime-guess-ai');
    expect(source).toContain('GitHub');
    expect(source).toContain('fa-github');
    expect(source).toContain('aria-label="在 GitHub 查看项目"');
    expect(source).toContain('class="mt-1 flex items-center justify-between gap-3"');
    expect(source).toContain('h-9 w-9 shrink-0');
    expect(source).toContain('<span class="sr-only sm:not-sr-only">GitHub</span>');
    expect(source).not.toContain('flex-col gap-3 sm:flex-row');
    expect(source).not.toContain('>Star');
    expect(source).not.toContain('fa-star');
    expect(source).not.toContain('aria-label="给项目点 Star"');
  });

  test('closes settings drawer from browser back instead of leaving the page', () => {
    const source = appVue();

    expect(source).toContain('let settingsHistoryPushed = false');
    expect(source).toContain('function openSettings()');
    expect(source).toContain("history.pushState({ ...(history.state || {}), animeGuessSettingsOpen: true }, '')");
    expect(source).toContain('function closeSettings(options: { fromPopstate?: boolean } = {})');
    expect(source).toContain("window.addEventListener('popstate', handleSettingsPopstate)");
    expect(source).toContain("window.removeEventListener('popstate', handleSettingsPopstate)");
    expect(source).toContain('closeSettings({ fromPopstate: true })');
    expect(source).toContain('@click="openSettings"');
    expect(source).toContain('@click="closeSettings()"');
  });
});
