<script setup lang="ts">
type SearchResult = {
  id: number;
  name: string;
  name_cn?: string;
  date?: string;
  image?: string;
  score?: number;
  rank?: number;
};
type Answer = { id: number; name: string; name_cn?: string; image?: string; url: string };
type ChatItem = {
  role: 'system' | 'player' | 'ai';
  text: string;
  tone?: 'ok' | 'bad' | 'info';
  image?: string;
  boldText?: string;
};

const filters = reactive({
  yearFrom: 2010,
  yearTo: new Date().getFullYear(),
  format: 'all',
  country: 'all',
  tags: '',
  ratingMin: 6,
  ratingMax: 10,
});
const provider = ref<'gpt' | 'gemini'>('gpt');
const modelApiKey = ref('');
const modelName = ref('');
const openAiBaseUrl = ref('');
const sessionId = ref('');
const loading = ref(false);
const settingsOpen = ref(false);
const question = ref('');
const guessText = ref('');
const searchResults = ref<SearchResult[]>([]);
const selected = ref<SearchResult | null>(null);
const revealedAnswer = ref<Answer | null>(null);
const correctDialog = ref<{ answer: Answer; score: number; message: string } | null>(null);
const remainingHints = ref(0);
const totalHints = ref(10);
const score = ref(0);
const chat = ref<ChatItem[]>([
  { role: 'system', text: '设置筛选条件后开始游戏。AI 会从 Bangumi 随机挑一部动画，你可以问是/不是/不确定问题。' },
]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const SETTINGS_STORAGE_KEY = 'anime-guess-ai:game-settings';

function aiConfig() {
  return {
    provider: provider.value,
    apiKey: modelApiKey.value.trim(),
    model: modelName.value.trim(),
    baseUrl: provider.value === 'gpt' ? openAiBaseUrl.value.trim() : '',
  };
}

function settingsSnapshot() {
  return {
    filters: { ...filters },
    provider: provider.value,
    modelApiKey: modelApiKey.value,
    modelName: modelName.value,
    openAiBaseUrl: openAiBaseUrl.value,
  };
}

function loadSettings() {
  if (!import.meta.client) return;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.filters && typeof saved.filters === 'object') Object.assign(filters, saved.filters);
    if (saved?.provider === 'gpt' || saved?.provider === 'gemini') provider.value = saved.provider;
    modelApiKey.value = String(saved?.modelApiKey || '');
    modelName.value = String(saved?.modelName || '');
    openAiBaseUrl.value = String(saved?.openAiBaseUrl || '');
  } catch {
    // 忽略损坏的本地设置
  }
}

function saveSettings() {
  if (!import.meta.client) return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsSnapshot()));
}

onMounted(loadSettings);
watch(settingsSnapshot, saveSettings, { deep: true });

const canPlay = computed(() => Boolean(sessionId.value));
const canHint = computed(() => canPlay.value && remainingHints.value > 0);

function push(item: ChatItem) {
  chat.value.unshift(item);
}

function clearGuessSearch() {
  selected.value = null;
  guessText.value = '';
  searchResults.value = [];
}

function answerTitle(answer: Answer) {
  return answer.name_cn || answer.name;
}

function titleOf(item: SearchResult) {
  return item.name_cn || item.name;
}

function highlightParts(text: string) {
  const parts: { text: string; highlight: boolean }[] = [];
  const pattern = /「[^」]+」/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), highlight: false });
    parts.push({ text: match[0], highlight: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false });
  return parts;
}

function reveal(answer: Answer, prefix = '答案') {
  revealedAnswer.value = answer;
  push({ role: 'system', text: `${prefix}：${answerTitle(answer)}（Bangumi #${answer.id}）`, tone: 'ok' });
}

function showCorrectDialog(answer: Answer, message: string) {
  correctDialog.value = { answer, score: score.value, message };
}

function closeCorrectDialog() {
  correctDialog.value = null;
}

async function startNextGame() {
  closeCorrectDialog();
  await startGame();
}

async function startGame() {
  loading.value = true;
  try {
    const res = await $fetch<{
      sessionId: string;
      message: string;
      initialHint?: string;
      remainingHints: number;
      totalHints: number;
      score: number;
    }>('/api/game/start', { method: 'POST', body: { filters, provider: provider.value, aiConfig: aiConfig() } });
    sessionId.value = res.sessionId;
    revealedAnswer.value = null;
    correctDialog.value = null;
    remainingHints.value = res.remainingHints;
    totalHints.value = res.totalHints;
    score.value = res.score;
    settingsOpen.value = false;
    clearGuessSearch();
    chat.value = [
      ...(res.initialHint
        ? [{ role: 'ai' as const, text: `初始提示：${res.initialHint}`, tone: 'info' as const }]
        : []),
      { role: 'system', text: res.message, tone: 'ok' },
    ];
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '开始游戏失败', tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

async function ask() {
  if (!question.value.trim() || !canPlay.value) return;
  const q = question.value.trim();
  question.value = '';
  push({ role: 'player', text: q });
  loading.value = true;
  try {
    const res = await $fetch<{ answer: string; reason: string; score: number }>('/api/game/ask', {
      method: 'POST',
      body: { sessionId: sessionId.value, question: q, provider: provider.value, aiConfig: aiConfig() },
    });
    score.value = res.score;
    push({ role: 'ai', text: res.answer, tone: res.answer === '是' ? 'ok' : res.answer === '不是' ? 'bad' : 'info' });
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || 'AI 回答失败', tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

async function hint() {
  if (!canHint.value) return;
  loading.value = true;
  try {
    const res = await $fetch<{
      hint: string;
      remainingHints: number;
      totalHints: number;
      score: number;
      exhausted?: boolean;
      message?: string;
    }>('/api/game/hint', { method: 'POST', body: { sessionId: sessionId.value } });
    remainingHints.value = res.remainingHints;
    totalHints.value = res.totalHints;
    score.value = res.score;
    if (res.exhausted) {
      push({ role: 'system', text: res.message || '提示次数已用完。', tone: 'info' });
    } else {
      push({ role: 'ai', text: `提示：${res.hint}`, tone: 'info' });
    }
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '获取提示失败', tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

async function surrender() {
  if (!canPlay.value || loading.value) return;
  const ok = window.confirm('确定要投降并直接揭晓最终答案吗？');
  if (!ok) return;
  loading.value = true;
  try {
    const res = await $fetch<{ answer: Answer; message: string; score: number }>('/api/game/surrender', {
      method: 'POST',
      body: { sessionId: sessionId.value },
    });
    score.value = res.score;
    reveal(res.answer, '投降成功，最终答案');
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '投降失败', tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

watch(guessText, (value) => {
  selected.value = null;
  if (searchTimer) clearTimeout(searchTimer);
  if (!value.trim()) {
    searchResults.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    searchResults.value = await $fetch<SearchResult[]>('/api/bangumi/search', { query: { q: value.trim() } }).catch(
      () => [],
    );
  }, 250);
});

async function submitGuess(item = selected.value) {
  if (!item || !canPlay.value) return;
  loading.value = true;
  try {
    const guessedTitle = titleOf(item);
    const res = await $fetch<{
      correct: boolean;
      sameSeries?: boolean;
      message: string;
      score: number;
      answer?: Answer;
    }>('/api/game/guess', { method: 'POST', body: { sessionId: sessionId.value, subjectId: item.id } });
    score.value = res.score;
    push({ role: 'player', text: '我猜是：', boldText: guessedTitle, image: item.image });
    clearGuessSearch();
    if (res.correct && res.answer) {
      reveal(res.answer, `🎉 ${res.message} 答案`);
      showCorrectDialog(res.answer, res.message);
    } else {
      push({ role: 'system', text: res.message, tone: 'bad' });
    }
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '提交答案失败', tone: 'bad' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main
    class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,.24),_transparent_32%)] bg-slate-50 px-4 py-8 text-slate-900"
  >
    <div class="mx-auto max-w-5xl space-y-5">
      <section class="glass rounded-3xl p-6">
        <div>
          <p class="text-sm font-medium text-indigo-600">Bangumi × AI</p>
          <h1 class="mt-2 text-3xl font-bold text-slate-950">AI 辅助猜动画名</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            AI 根据你的筛选条件从 Bangumi 随机抽取动画。开局会给出初始提示；每局共 10 轮提示，线索会逐步更接近核心信息。
          </p>
        </div>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button
            :disabled="loading"
            class="rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50"
            @click="startGame"
          >
            {{ loading ? '处理中…' : '开始新游戏' }}
          </button>
          <button
            class="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50"
            title="设置筛选条件"
            @click="settingsOpen = true"
          >
            <i class="fa-solid fa-gear mr-2"></i>设置
          </button>
          <p
            v-if="canPlay"
            class="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm"
          >
            当前得分：<span class="text-xl text-indigo-600">{{ score }}</span> / 20
          </p>
        </div>
      </section>

      <section class="glass rounded-3xl p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold text-slate-950">提问</h2>
          <div class="flex flex-wrap items-center gap-2">
            <p v-if="canPlay" class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              当前得分：{{ score }} / 20
            </p>
            <p v-if="canPlay" class="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              剩余提示次数：{{ remainingHints }} / {{ totalHints }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="question"
            :disabled="!canPlay"
            class="min-w-[220px] flex-[1_1_100%] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:flex-1"
            placeholder="例如：它是原创动画吗？有佐仓绫音参与吗？"
            @keyup.enter="ask"
          />
          <button
            class="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-40"
            :disabled="!canPlay || loading"
            @click="ask"
          >
            提问
          </button>
          <button
            class="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-40"
            :disabled="!canHint || loading"
            @click="hint"
          >
            提示 {{ canPlay ? `(${remainingHints})` : '' }}
          </button>
          <button
            class="rounded-xl bg-rose-500 px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-40"
            :disabled="!canPlay || loading"
            @click="surrender"
          >
            投降
          </button>
        </div>
      </section>

      <section class="glass rounded-3xl p-5">
        <h2 class="font-semibold text-slate-950">提交答案</h2>
        <input
          v-model="guessText"
          :disabled="!canPlay"
          class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          placeholder="输入动画名，同步搜索 Bangumi 动画"
        />
        <div v-if="searchResults.length" class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="item in searchResults"
            :key="item.id"
            class="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-indigo-200 hover:bg-indigo-50"
            @click="
              selected = item;
              submitGuess(item);
            "
          >
            <img v-if="item.image" :src="item.image" class="h-16 w-12 rounded object-cover" />
            <span
              ><b>{{ titleOf(item) }}</b
              ><small class="block text-slate-500"
                >#{{ item.id }} · {{ item.date || '日期未知' }} ·
                {{ item.score ? `${item.score}分` : '暂无评分' }}</small
              ></span
            >
          </button>
        </div>
      </section>

      <section class="glass rounded-3xl p-5">
        <h2 class="font-semibold text-slate-950">记录</h2>
        <div class="mt-3 space-y-2">
          <article
            v-for="(item, index) in chat"
            :key="index"
            class="rounded-2xl border px-4 py-3 text-sm shadow-sm"
            :class="
              item.role === 'player'
                ? 'border-indigo-100 bg-indigo-50'
                : item.tone === 'ok'
                  ? 'border-emerald-100 bg-emerald-50'
                  : item.tone === 'bad'
                    ? 'border-rose-100 bg-rose-50'
                    : 'border-slate-200 bg-white'
            "
          >
            <div class="flex gap-3">
              <img v-if="item.image" :src="item.image" class="h-20 w-14 rounded-lg object-cover shadow-sm" />
              <p class="leading-6">
                <span class="mr-2 text-xs uppercase text-slate-500">{{ item.role }}</span>
                <template v-if="item.boldText">
                  <span>{{ item.text }}</span
                  ><strong class="ml-1 font-bold text-slate-950">{{ item.boldText }}</strong>
                </template>
                <template v-else>
                  <span
                    v-for="(part, partIndex) in highlightParts(item.text)"
                    :key="partIndex"
                    :class="
                      part.highlight
                        ? 'mx-0.5 rounded-md bg-yellow-200 px-1 font-semibold text-yellow-950 ring-1 ring-yellow-300'
                        : ''
                    "
                    >{{ part.text }}</span
                  >
                </template>
              </p>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div
      v-if="correctDialog"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
      @click.self="closeCorrectDialog"
    >
      <section class="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-emerald-100">
        <div class="bg-gradient-to-r from-emerald-500 to-indigo-500 px-6 py-5 text-white">
          <p class="text-sm font-semibold opacity-90">{{ correctDialog.message }}</p>
          <h2 class="mt-1 text-2xl font-bold">回答正确！</h2>
        </div>
        <div class="p-6">
          <div class="flex gap-4">
            <img
              v-if="correctDialog.answer.image"
              :src="correctDialog.answer.image"
              class="h-44 w-32 rounded-2xl object-cover shadow"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-500">正确答案</p>
              <p class="mt-1 text-2xl font-bold leading-tight text-slate-950">
                {{ answerTitle(correctDialog.answer) }}
              </p>
              <p
                v-if="correctDialog.answer.name_cn && correctDialog.answer.name_cn !== correctDialog.answer.name"
                class="mt-2 text-sm text-slate-600"
              >
                {{ correctDialog.answer.name }}
              </p>
              <a
                :href="correctDialog.answer.url"
                target="_blank"
                class="mt-4 inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600"
                >Bangumi #{{ correctDialog.answer.id }}</a
              >
              <p class="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-700">
                本局得分：<span class="text-2xl">{{ correctDialog.score }}</span> / 20
              </p>
            </div>
          </div>
          <div class="mt-6 grid grid-cols-2 gap-3">
            <button
              :disabled="loading"
              class="rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-100 hover:bg-indigo-500 disabled:opacity-50"
              @click="startNextGame"
            >
              开启新一局
            </button>
            <button
              class="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              @click="closeCorrectDialog"
            >
              关闭
            </button>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="settingsOpen"
      class="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm"
      @click="settingsOpen = false"
    ></div>
    <aside
      class="fixed right-0 top-0 z-50 h-full w-full max-w-md transform overflow-y-auto bg-white p-6 shadow-2xl transition-transform duration-200"
      :class="settingsOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-slate-950"><i class="fa-solid fa-gear mr-2 text-indigo-600"></i>游戏设置</h2>
        <button class="rounded-full p-2 text-slate-500 hover:bg-slate-100" @click="settingsOpen = false">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>
      <p class="mt-2 text-sm text-slate-500">调整筛选条件后，点击“开始新游戏”会按新条件重新抽取动画。</p>

      <div class="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700">
        <label
          >起始年份<input
            v-model.number="filters.yearFrom"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            type="number"
        /></label>
        <label
          >结束年份<input
            v-model.number="filters.yearTo"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            type="number"
        /></label>
        <label
          >评分下限<input
            v-model.number="filters.ratingMin"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            step="0.1"
            type="number"
        /></label>
        <label
          >评分上限<input
            v-model.number="filters.ratingMax"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            step="0.1"
            type="number"
        /></label>
        <label
          >类型
          <select
            v-model="filters.format"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">不限</option>
            <option value="tv">TV</option>
            <option value="movie">剧场版</option>
            <option value="ova">OVA</option>
            <option value="web">WEB</option>
          </select>
        </label>
        <label
          >国家/地区
          <select
            v-model="filters.country"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">不限</option>
            <option value="japan">日本</option>
            <option value="western">欧美</option>
          </select>
        </label>
        <label class="col-span-2"
          >标签（逗号/空格分隔）<input
            v-model="filters.tags"
            placeholder="战斗, 校园"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        /></label>
        <label class="col-span-2"
          >模型提供商
          <select
            v-model="provider"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="gpt">GPT / OpenAI-compatible</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
        <label class="col-span-2"
          >模型 API Key（仅保存在本机浏览器 localStorage）
          <input
            v-model="modelApiKey"
            autocomplete="off"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="输入当前模型提供商的 API Key"
            type="password"
          />
        </label>
        <label class="col-span-2"
          >模型名称（可选）
          <input
            v-model="modelName"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            :placeholder="provider === 'gemini' ? '默认 gemini-2.5-flash' : '默认 gpt-4o-mini'"
          />
        </label>
        <label v-if="provider === 'gpt'" class="col-span-2"
          >OpenAI-compatible Base URL（可选）
          <input
            v-model="openAiBaseUrl"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="默认 https://api.openai.com/v1"
          />
        </label>
      </div>

      <button
        :disabled="loading"
        class="mt-6 w-full rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50"
        @click="startGame"
      >
        {{ loading ? '处理中…' : '按当前设置开始新游戏' }}
      </button>
    </aside>
  </main>
</template>
