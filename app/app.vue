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
type HistoryItem = { answer: Answer; score: number; createdAt: number; updatedAt: number };
type SimilarityHint = { label: string; values: string[] };
type ChatItem = {
  role: 'system' | 'player' | 'ai';
  text: string;
  tone?: 'ok' | 'bad' | 'info';
  image?: string;
  boldText?: string;
  link?: string;
  similarities?: SimilarityHint[];
};

const filters = reactive({
  sourceMode: 'filters' as 'filters' | 'collections',
  bangumiUid: '',
  yearFrom: 2010,
  yearTo: new Date().getFullYear(),
  format: 'tv',
  country: 'japan',
  tags: '',
  ratingMin: 7,
  ratingMax: null as number | null,
  ratingCountMin: 500,
  ratingCountMax: null as number | null,
});
const provider = ref<'gpt' | 'gemini'>('gpt');
const modelApiKey = ref('');
const modelName = ref('');
const openAiBaseUrl = ref('');
const sessionId = ref('');
const loading = ref(false);
const settingsOpen = ref(false);
const historyOpen = ref(false);
const historyItems = ref<HistoryItem[]>([]);
const question = ref('');
const questionHistory = ref<string[]>([]);
const guessText = ref('');
const searchResults = ref<SearchResult[]>([]);
const selected = ref<SearchResult | null>(null);
const revealedAnswer = ref<Answer | null>(null);
const correctDialog = ref<{ answer: Answer; score: number; message: string; title: string } | null>(null);
const remainingHints = ref(0);
const totalHints = ref(10);
const score = ref(0);
const chat = ref<ChatItem[]>([
  { role: 'system', text: '设置筛选条件后开始游戏。AI 会从 Bangumi 随机挑一部动画，你可以问 AI 关于此动画的问题，AI 会回答是/不是/不确定。' },
]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let settingsHistoryPushed = false;
const SETTINGS_STORAGE_KEY = 'anime-guess-ai:game-settings';
const HISTORY_STORAGE_KEY = 'anime-guess-ai:game-history';
const QUESTION_HISTORY_STORAGE_KEY = 'anime-guess-ai:question-history';
const GITHUB_URL = 'https://github.com/nepsyn/anime-guess-ai';
const KNOWN_SIMILARITY_LABELS = ['相同标签', '相同原作者', '相同导演', '共同参与配音的声优', '相同制作公司'];

function aiConfig() {
  return {
    provider: provider.value,
    apiKey: modelApiKey.value.trim(),
    model: modelName.value.trim(),
    baseUrl: provider.value === 'gpt' ? openAiBaseUrl.value.trim() : '',
  };
}

function gameStartPayload() {
  return {
    filters,
    sourceMode: filters.sourceMode,
    bangumiUid: filters.bangumiUid,
    provider: provider.value,
    aiConfig: aiConfig(),
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

function openSettings() {
  settingsOpen.value = true;
  if (!import.meta.client || settingsHistoryPushed) return;
  history.pushState({ ...(history.state || {}), animeGuessSettingsOpen: true }, '');
  settingsHistoryPushed = true;
}

function closeSettings(options: { fromPopstate?: boolean } = {}) {
  settingsOpen.value = false;
  if (!import.meta.client || !settingsHistoryPushed) return;
  settingsHistoryPushed = false;
  if (!options.fromPopstate && history.state?.animeGuessSettingsOpen) history.back();
}

function handleSettingsPopstate() {
  if (!settingsOpen.value) return;
  closeSettings({ fromPopstate: true });
}

onMounted(loadSettings);
onMounted(loadQuestionHistory);
onMounted(() => window.addEventListener('popstate', handleSettingsPopstate));
onBeforeUnmount(() => window.removeEventListener('popstate', handleSettingsPopstate));
watch(settingsSnapshot, saveSettings, { deep: true });

const gameEnded = computed(() => Boolean(revealedAnswer.value));
const canPlay = computed(() => Boolean(sessionId.value) && !gameEnded.value);
const canHint = computed(() => canPlay.value && remainingHints.value > 0);

function push(item: ChatItem) {
  chat.value.unshift(item);
}

function errorMessage(err: any, fallback: string) {
  const message =
    err?.data?.message ||
    err?.data?.statusMessage ||
    err?.statusMessage ||
    err?.statusText ||
    err?.message ||
    fallback;
  return String(message || fallback);
}

function loadHistory() {
  if (!import.meta.client) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveHistory(answer: Answer) {
  if (!import.meta.client) return;
  const now = Date.now();
  const item: HistoryItem = { answer, score: score.value, createdAt: now, updatedAt: now };
  const next = [item, ...loadHistory()].slice(0, 50);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  historyItems.value = next;
}

function loadQuestionHistory() {
  if (!import.meta.client) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(QUESTION_HISTORY_STORAGE_KEY) || '[]');
    questionHistory.value = Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 10) : [];
  } catch {
    questionHistory.value = [];
  }
}

function saveQuestionHistory(text: string) {
  if (!import.meta.client) return;
  const normalized = text.trim();
  if (!normalized) return;
  const next = [normalized, ...questionHistory.value.filter((item) => item !== normalized)];
  questionHistory.value = next.slice(0, 10);
  localStorage.setItem(QUESTION_HISTORY_STORAGE_KEY, JSON.stringify(questionHistory.value));
}

function openHistory() {
  historyItems.value = loadHistory();
  historyOpen.value = true;
}

function closeHistory() {
  historyOpen.value = false;
}

function formatDate(timestamp: number) {
  if (!timestamp) return '时间未知';
  return new Date(timestamp).toLocaleString('zh-CN');
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
  push({
    role: 'system',
    text: `${prefix}：`,
    boldText: `${answerTitle(answer)}（Bangumi #${answer.id}）`,
    tone: 'ok',
    image: answer.image,
    link: answer.url,
  });
  saveHistory(answer);
}

function showCorrectDialog(answer: Answer, message: string, title = '回答正确！') {
  correctDialog.value = { answer, score: score.value, message, title };
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
    }>('/api/game/start', { method: 'POST', body: gameStartPayload() });
    sessionId.value = res.sessionId;
    revealedAnswer.value = null;
    correctDialog.value = null;
    remainingHints.value = res.remainingHints;
    totalHints.value = res.totalHints;
    score.value = res.score;
    closeSettings();
    clearGuessSearch();
    chat.value = [
      ...(res.initialHint
        ? [{ role: 'ai' as const, text: `初始提示：${res.initialHint}`, tone: 'info' as const }]
        : []),
      { role: 'system', text: res.message, tone: 'ok' },
    ];
  } catch (err: any) {
    push({ role: 'system', text: errorMessage(err, '开始游戏失败'), tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

async function ask() {
  if (!question.value.trim() || !canPlay.value) return;
  const q = question.value.trim();
  question.value = '';
  saveQuestionHistory(q);
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
    push({ role: 'system', text: errorMessage(err, 'AI 回答失败'), tone: 'bad' });
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
    push({ role: 'system', text: errorMessage(err, '获取提示失败'), tone: 'bad' });
  } finally {
    loading.value = false;
  }
}

async function surrender() {
  if (!canPlay.value || loading.value) return;
  const ok = window.confirm('确定要放弃并直接揭晓正确答案吗？');
  if (!ok) return;
  loading.value = true;
  try {
    const res = await $fetch<{ answer: Answer; message: string; score: number }>('/api/game/surrender', {
      method: 'POST',
      body: { sessionId: sessionId.value },
    });
    score.value = res.score;
    reveal(res.answer, '放弃成功，正确答案');
    showCorrectDialog(res.answer, res.message, '放弃成功');
  } catch (err: any) {
    push({ role: 'system', text: errorMessage(err, '放弃失败'), tone: 'bad' });
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
      similarities?: SimilarityHint[];
    }>('/api/game/guess', { method: 'POST', body: { sessionId: sessionId.value, subjectId: item.id } });
    score.value = res.score;
    push({ role: 'player', text: '我猜是：', boldText: guessedTitle, image: item.image, link: `https://bgm.tv/subject/${item.id}`, similarities: res.similarities?.length ? res.similarities : undefined });
    clearGuessSearch();
    if (res.correct && res.answer) {
      reveal(res.answer, `🎉 ${res.message} 答案`);
      showCorrectDialog(res.answer, res.message);
    } else {
      push({ role: 'system', text: res.message, tone: 'bad' });
    }
  } catch (err: any) {
    push({ role: 'system', text: errorMessage(err, '提交答案失败'), tone: 'bad' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main
    class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,.24),_transparent_32%)] bg-slate-50 px-3 py-4 text-slate-900 sm:px-4"
  >
    <div class="mx-auto max-w-4xl space-y-3">
      <section class="glass rounded-3xl px-3 py-4 sm:px-4">
        <div>
          <p class="text-xs font-medium text-indigo-600">Anime Guess！</p>
          <div class="mt-1 flex items-center justify-between gap-3">
            <h1 class="min-w-0 text-2xl font-bold text-slate-950 sm:text-3xl">二次元婆罗门猜猜乐</h1>
            <a
              :href="GITHUB_URL"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在 GitHub 查看项目"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-0 text-xs font-semibold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 sm:w-auto sm:px-3"
            >
              <i class="fa-brands fa-github"></i><span class="sr-only sm:not-sr-only">GitHub</span>
            </a>
          </div>
        </div>
        <p class="mt-2 max-w-3xl text-xs leading-5 text-slate-600 sm:text-sm">
          AI 根据你的筛选条件或 Bangumi 看过收藏随机抽取动画。开局会给出初始提示；每局共 10
          轮提示，线索会逐步更接近核心信息。开局20分，每次提问-1分，提示-2分，猜错-3分。
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            :disabled="loading"
            class="flex h-10 min-w-[96px] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50"
            @click="startGame"
          >
            <span v-if="loading" class="inline-flex items-center justify-center" aria-live="polite">
              <i class="fa-solid fa-circle-notch animate-spin text-base" aria-hidden="true"></i>
              <span class="sr-only">加载中</span>
            </span>
            <template v-else>开始新游戏</template>
          </button>
          <button
            class="flex h-10 min-w-[96px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50"
            title="设置筛选条件"
            @click="openSettings"
          >
            <i class="fa-solid fa-gear mr-2"></i>设置
          </button>
          <button
            class="flex h-10 min-w-[96px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50"
            title="查看历史题目"
            @click="openHistory"
          >
            <i class="fa-solid fa-clock-rotate-left mr-2"></i>历史记录
          </button>
          <p
            v-if="sessionId"
            class="flex h-10 min-w-[96px] items-center justify-center rounded-xl border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm"
          >
            当前得分：<span class="ml-1 text-sm text-indigo-600">{{ score }}</span> / 20
          </p>
        </div>
      </section>

      <section class="glass rounded-2xl p-3 sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold text-slate-950">提问</h2>
          <div class="flex flex-wrap items-center gap-2">
            <p v-if="sessionId" class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              当前得分：{{ score }} / 20
            </p>
            <p v-if="canPlay" class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              剩余提示次数：{{ remainingHints }} / {{ totalHints }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="question"
            :disabled="!canPlay"
            class="min-w-[180px] flex-[1_1_100%] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:flex-1"
            placeholder="例如：它是原创动画吗？"
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
            放弃
          </button>
        </div>
        <div v-if="questionHistory.length" class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span class="font-medium text-slate-500">最近提问</span>
          <button
            v-for="savedQuestion in questionHistory"
            :key="savedQuestion"
            :disabled="!canPlay"
            class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 disabled:opacity-40"
            @click="question = savedQuestion"
          >
            {{ savedQuestion }}
          </button>
        </div>
      </section>

      <section class="glass rounded-2xl p-3 sm:p-4">
        <h2 class="font-semibold text-slate-950">提交答案</h2>
        <input
          v-model="guessText"
          :disabled="!canPlay"
          class="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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

      <section class="glass rounded-2xl p-3 sm:p-4">
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
                  <span>{{ item.text }}</span>
                  <a
                    v-if="item.link"
                    :href="item.link"
                    target="_blank"
                    class="ml-1 font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500"
                    >{{ item.boldText }}</a
                  >
                  <strong v-else class="ml-1 font-bold text-slate-950">{{ item.boldText }}</strong>
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
              <div v-if="item.similarities?.length" class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="hint in item.similarities"
                  :key="hint.label"
                  class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100"
                  >{{ hint.label }}：{{ hint.values.join('、') }}</span
                >
              </div>
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
          <h2 class="mt-1 text-2xl font-bold">{{ correctDialog.title }}</h2>
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
      v-if="historyOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
      @click.self="closeHistory"
    >
      <section class="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-indigo-100">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p class="text-xs font-medium text-indigo-600">History</p>
            <h2 class="text-xl font-bold text-slate-950"><i class="fa-solid fa-clock-rotate-left mr-2 text-indigo-600"></i>历史题目</h2>
          </div>
          <button class="rounded-full p-2 text-slate-500 hover:bg-slate-100" @click="closeHistory">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div class="max-h-[70vh] overflow-y-auto p-5">
          <p v-if="!historyItems.length" class="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无历史题目。</p>
          <div v-else class="space-y-3">
            <article
              v-for="item in historyItems"
              :key="`${item.createdAt}-${item.answer.id}`"
              class="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm"
            >
              <img v-if="item.answer.image" :src="item.answer.image" class="h-20 w-14 rounded-lg object-cover shadow-sm" />
              <div class="min-w-0 flex-1">
                <a
                  :href="item.answer.url"
                  target="_blank"
                  class="font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500"
                  >{{ answerTitle(item.answer) }}</a
                >
                <p v-if="item.answer.name_cn && item.answer.name_cn !== item.answer.name" class="mt-1 truncate text-xs text-slate-500">
                  {{ item.answer.name }}
                </p>
                <p class="mt-1 text-xs text-slate-500">Bangumi #{{ item.answer.id }} · {{ formatDate(item.createdAt) }}</p>
                <p class="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  得分 {{ item.score }} / 20
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="settingsOpen"
      class="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm"
      @click="closeSettings()"
    ></div>
    <aside
      class="fixed right-0 top-0 z-50 h-full w-full max-w-md transform overflow-y-auto bg-white p-6 shadow-2xl transition-transform duration-200"
      :class="settingsOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-slate-950"><i class="fa-solid fa-gear mr-2 text-indigo-600"></i>游戏设置</h2>
        <button class="rounded-full p-2 text-slate-500 hover:bg-slate-100" @click="closeSettings()">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>
      <p class="mt-2 text-sm text-slate-500">选择出题模式后，点击“开始新游戏”会按当前配置重新抽取动画。</p>

      <div
        class="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700"
        @input="saveSettings"
        @change="saveSettings"
      >
        <label class="col-span-2"
          >出题模式
          <select
            v-model="filters.sourceMode"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="filters">按筛选条件随机</option>
            <option value="collections">从 Bangumi 看过收藏随机</option>
          </select>
        </label>
        <label v-if="filters.sourceMode === 'collections'" class="col-span-2"
          >Bangumi UID
          <input
            v-model="filters.bangumiUid"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="输入公开 Bangumi UID / 用户名"
          />
        </label>
        <template v-if="filters.sourceMode === 'filters'">
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
          >评分人数下限<input
            v-model.number="filters.ratingCountMin"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            min="0"
            placeholder="不限"
            step="1"
            type="number"
        /></label>
        <label
          >评分人数上限<input
            v-model.number="filters.ratingCountMax"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            min="0"
            placeholder="不限"
            step="1"
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
            <option value="china">中国</option>
          </select>
        </label>
        <label class="col-span-2"
          >标签（逗号/空格分隔）<input
            v-model="filters.tags"
            placeholder="战斗, 校园"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        /></label>
        </template>
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
          >模型 API Key（可选，仅保存在本机浏览器 localStorage）
          <input
            v-model="modelApiKey"
            autocomplete="off"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="已配置服务端环境变量时可留空；填写后优先使用这里的 Key"
            type="password"
          />
        </label>
        <label class="col-span-2"
          >模型名称（可选）
          <input
            v-model="modelName"
            class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            :placeholder="provider === 'gemini' ? '默认 gemini-3.5-flash' : '默认 gpt-4o-mini'"
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
        class="mt-6 flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50"
        @click="startGame"
      >
        <span v-if="loading" class="inline-flex items-center justify-center" aria-live="polite">
          <i class="fa-solid fa-circle-notch animate-spin text-base" aria-hidden="true"></i>
          <span class="sr-only">加载中</span>
        </span>
        <template v-else>按当前设置开始新游戏</template>
      </button>
    </aside>
  </main>
</template>
