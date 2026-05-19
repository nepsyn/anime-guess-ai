<script setup lang="ts">
type SearchResult = { id: number; name: string; name_cn?: string; date?: string; image?: string; score?: number; rank?: number }
type Answer = { id: number; name: string; name_cn?: string; image?: string; url: string }
type ChatItem = { role: 'system' | 'player' | 'ai'; text: string; tone?: 'ok' | 'bad' | 'info' }

const filters = reactive({
  yearFrom: 2010,
  yearTo: new Date().getFullYear(),
  format: 'all',
  tags: '',
  ratingMin: 6,
  ratingMax: 10
})
const provider = ref<'gpt' | 'gemini'>('gpt')
const sessionId = ref('')
const loading = ref(false)
const question = ref('')
const guessText = ref('')
const searchResults = ref<SearchResult[]>([])
const selected = ref<SearchResult | null>(null)
const revealedAnswer = ref<Answer | null>(null)
const chat = ref<ChatItem[]>([
  { role: 'system', text: '设置筛选条件后开始游戏。AI 会从 Bangumi 随机挑一部动画，你可以问是/不是/不确定问题。' }
])
let searchTimer: ReturnType<typeof setTimeout> | null = null

const canPlay = computed(() => Boolean(sessionId.value))

function push(item: ChatItem) {
  chat.value.unshift(item)
}

function clearGuessSearch() {
  selected.value = null
  guessText.value = ''
  searchResults.value = []
}

function answerTitle(answer: Answer) {
  return answer.name_cn || answer.name
}

function reveal(answer: Answer, prefix = '答案') {
  revealedAnswer.value = answer
  push({ role: 'system', text: `${prefix}：${answerTitle(answer)}（Bangumi #${answer.id}）`, tone: 'ok' })
}

async function startGame() {
  loading.value = true
  try {
    const res = await $fetch<{ sessionId: string; message: string; initialHint?: string }>('/api/game/start', { method: 'POST', body: { filters } })
    sessionId.value = res.sessionId
    revealedAnswer.value = null
    clearGuessSearch()
    chat.value = [
      { role: 'system', text: res.message, tone: 'ok' },
      ...(res.initialHint ? [{ role: 'ai' as const, text: `初始提示：${res.initialHint}`, tone: 'info' as const }] : [])
    ]
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '开始游戏失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}

async function ask() {
  if (!question.value.trim() || !canPlay.value) return
  const q = question.value.trim()
  question.value = ''
  push({ role: 'player', text: q })
  loading.value = true
  try {
    const res = await $fetch<{ answer: string; reason: string }>('/api/game/ask', { method: 'POST', body: { sessionId: sessionId.value, question: q, provider: provider.value } })
    push({ role: 'ai', text: `${res.answer}${res.reason ? `：${res.reason}` : ''}`, tone: res.answer === '是' ? 'ok' : res.answer === '不是' ? 'bad' : 'info' })
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || 'AI 回答失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}

async function hint() {
  if (!canPlay.value) return
  loading.value = true
  try {
    const res = await $fetch<{ hint: string }>('/api/game/hint', { method: 'POST', body: { sessionId: sessionId.value } })
    push({ role: 'ai', text: `提示：${res.hint}`, tone: 'info' })
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '获取提示失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}

async function surrender() {
  if (!canPlay.value || loading.value) return
  const ok = window.confirm('确定要投降并直接揭晓最终答案吗？')
  if (!ok) return
  loading.value = true
  try {
    const res = await $fetch<{ answer: Answer; message: string }>('/api/game/surrender', { method: 'POST', body: { sessionId: sessionId.value } })
    reveal(res.answer, '投降成功，最终答案')
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '投降失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}

watch(guessText, (value) => {
  selected.value = null
  if (searchTimer) clearTimeout(searchTimer)
  if (!value.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searchResults.value = await $fetch<SearchResult[]>('/api/bangumi/search', { query: { q: value.trim() } }).catch(() => [])
  }, 250)
})

async function submitGuess(item = selected.value) {
  if (!item || !canPlay.value) return
  loading.value = true
  try {
    const res = await $fetch<{ correct: boolean; message: string; answer?: Answer }>('/api/game/guess', { method: 'POST', body: { sessionId: sessionId.value, subjectId: item.id } })
    push({ role: 'player', text: `我猜是：${item.name_cn || item.name}` })
    clearGuessSearch()
    if (res.correct && res.answer) {
      reveal(res.answer, `🎉 ${res.message} 答案`)
    } else {
      push({ role: 'system', text: res.message, tone: 'bad' })
    }
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '提交答案失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,.24),_transparent_32%)] bg-slate-50 px-4 py-8 text-slate-900">
    <div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[380px_1fr]">
      <section class="glass rounded-3xl p-6">
        <p class="text-sm font-medium text-indigo-600">Bangumi × AI</p>
        <h1 class="mt-2 text-3xl font-bold text-slate-950">AI 辅助猜动画名</h1>
        <p class="mt-3 text-sm leading-6 text-slate-600">AI 根据你的筛选条件从 Bangumi 随机抽取动画。开局会给出初始提示，之后可以不限次数获取提示，线索会逐步更接近核心信息。</p>

        <div class="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700">
          <label>起始年份<input v-model.number="filters.yearFrom" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" type="number" /></label>
          <label>结束年份<input v-model.number="filters.yearTo" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" type="number" /></label>
          <label>评分下限<input v-model.number="filters.ratingMin" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" step="0.1" type="number" /></label>
          <label>评分上限<input v-model.number="filters.ratingMax" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" step="0.1" type="number" /></label>
          <label class="col-span-2">类型
            <select v-model="filters.format" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
              <option value="all">不限</option><option value="tv">TV</option><option value="movie">剧场版</option><option value="ova">OVA</option><option value="web">WEB</option>
            </select>
          </label>
          <label class="col-span-2">标签（逗号/空格分隔）<input v-model="filters.tags" placeholder="战斗, 校园" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
          <label class="col-span-2">模型提供商
            <select v-model="provider" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
              <option value="gpt">GPT / OpenAI-compatible</option><option value="gemini">Gemini</option>
            </select>
          </label>
        </div>
        <button :disabled="loading" class="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50" @click="startGame">{{ loading ? '处理中…' : '开始新游戏' }}</button>
      </section>

      <section class="space-y-4">
        <div v-if="revealedAnswer" class="glass rounded-3xl p-5">
          <h2 class="font-semibold text-slate-950">最终答案</h2>
          <div class="mt-3 flex gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <img v-if="revealedAnswer.image" :src="revealedAnswer.image" class="h-40 w-28 rounded-xl object-cover shadow" />
            <div>
              <p class="text-xl font-bold text-slate-950">{{ answerTitle(revealedAnswer) }}</p>
              <p v-if="revealedAnswer.name_cn && revealedAnswer.name_cn !== revealedAnswer.name" class="mt-1 text-sm text-slate-600">{{ revealedAnswer.name }}</p>
              <a :href="revealedAnswer.url" target="_blank" class="mt-3 inline-block rounded-full bg-white px-3 py-1 text-sm font-medium text-indigo-600 shadow-sm">Bangumi #{{ revealedAnswer.id }}</a>
            </div>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold text-slate-950">提问</h2>
          <div class="mt-3 flex flex-wrap gap-2">
            <input v-model="question" :disabled="!canPlay" class="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="例如：它是原创动画吗？有佐仓绫音参与吗？" @keyup.enter="ask" />
            <button class="rounded-2xl bg-emerald-500 px-4 font-semibold text-white shadow-sm disabled:opacity-40" :disabled="!canPlay || loading" @click="ask">问</button>
            <button class="rounded-2xl bg-amber-500 px-4 font-semibold text-white shadow-sm disabled:opacity-40" :disabled="!canPlay || loading" @click="hint">提示</button>
            <button class="rounded-2xl bg-rose-500 px-4 font-semibold text-white shadow-sm disabled:opacity-40" :disabled="!canPlay || loading" @click="surrender">投降</button>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold text-slate-950">提交答案</h2>
          <input v-model="guessText" :disabled="!canPlay" class="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="输入动画名，同步搜索 Bangumi 动画" />
          <div v-if="searchResults.length" class="mt-3 grid gap-2 sm:grid-cols-2">
            <button v-for="item in searchResults" :key="item.id" class="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-indigo-200 hover:bg-indigo-50" @click="selected = item; submitGuess(item)">
              <img v-if="item.image" :src="item.image" class="h-16 w-12 rounded object-cover" />
              <span><b>{{ item.name_cn || item.name }}</b><small class="block text-slate-500">#{{ item.id }} · {{ item.date || '日期未知' }} · {{ item.score ? `${item.score}分` : '暂无评分' }}</small></span>
            </button>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold text-slate-950">记录</h2>
          <div class="mt-3 space-y-2">
            <p v-for="(item, index) in chat" :key="index" class="rounded-2xl border px-4 py-3 text-sm shadow-sm" :class="item.role === 'player' ? 'border-indigo-100 bg-indigo-50' : item.tone === 'ok' ? 'border-emerald-100 bg-emerald-50' : item.tone === 'bad' ? 'border-rose-100 bg-rose-50' : 'border-slate-200 bg-white'">
              <span class="mr-2 text-xs uppercase text-slate-500">{{ item.role }}</span>{{ item.text }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
