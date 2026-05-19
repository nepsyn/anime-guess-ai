<script setup lang="ts">
type SearchResult = { id: number; name: string; name_cn?: string; date?: string; image?: string; score?: number; rank?: number }
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
const chat = ref<ChatItem[]>([
  { role: 'system', text: '设置筛选条件后开始游戏。AI 会从 Bangumi 随机挑一部动画，你可以问是/不是/不确定问题。' }
])
let searchTimer: ReturnType<typeof setTimeout> | null = null

const canPlay = computed(() => Boolean(sessionId.value))

function push(item: ChatItem) {
  chat.value.unshift(item)
}

async function startGame() {
  loading.value = true
  try {
    const res = await $fetch<{ sessionId: string; message: string }>('/api/game/start', { method: 'POST', body: { filters } })
    sessionId.value = res.sessionId
    selected.value = null
    guessText.value = ''
    searchResults.value = []
    chat.value = [{ role: 'system', text: res.message, tone: 'ok' }]
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
    const res = await $fetch<any>('/api/game/guess', { method: 'POST', body: { sessionId: sessionId.value, subjectId: item.id } })
    push({ role: 'player', text: `我猜是：${item.name_cn || item.name}` })
    push({ role: 'system', text: res.correct ? `🎉 ${res.message} 答案：${res.answer.name_cn || res.answer.name}（Bangumi #${res.answer.id}）` : res.message, tone: res.correct ? 'ok' : 'bad' })
  } catch (err: any) {
    push({ role: 'system', text: err?.data?.message || err?.message || '提交答案失败', tone: 'bad' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,.35),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(236,72,153,.25),_transparent_35%)] px-4 py-8">
    <div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[380px_1fr]">
      <section class="glass rounded-3xl p-6">
        <p class="text-sm text-indigo-200">Bangumi × AI</p>
        <h1 class="mt-2 text-3xl font-bold">AI 辅助猜动画名</h1>
        <p class="mt-3 text-sm leading-6 text-slate-300">AI 根据你的筛选条件从 Bangumi 随机抽取动画。你可以提问、要提示，最后通过 Bangumi 搜索结果提交答案。</p>

        <div class="mt-6 grid grid-cols-2 gap-3 text-sm">
          <label>起始年份<input v-model.number="filters.yearFrom" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2" type="number" /></label>
          <label>结束年份<input v-model.number="filters.yearTo" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2" type="number" /></label>
          <label>评分下限<input v-model.number="filters.ratingMin" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2" step="0.1" type="number" /></label>
          <label>评分上限<input v-model.number="filters.ratingMax" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2" step="0.1" type="number" /></label>
          <label class="col-span-2">类型
            <select v-model="filters.format" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2">
              <option value="all">不限</option><option value="tv">TV</option><option value="movie">剧场版</option><option value="ova">OVA</option><option value="web">WEB</option>
            </select>
          </label>
          <label class="col-span-2">标签（逗号/空格分隔）<input v-model="filters.tags" placeholder="战斗, 校园" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2" /></label>
          <label class="col-span-2">模型提供商
            <select v-model="provider" class="mt-1 w-full rounded-xl border-white/10 bg-slate-900/70 px-3 py-2">
              <option value="gpt">GPT / OpenAI-compatible</option><option value="gemini">Gemini</option>
            </select>
          </label>
        </div>
        <button :disabled="loading" class="mt-5 w-full rounded-2xl bg-indigo-500 px-4 py-3 font-semibold hover:bg-indigo-400 disabled:opacity-50" @click="startGame">{{ loading ? '处理中…' : '开始新游戏' }}</button>
      </section>

      <section class="space-y-4">
        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold">提问</h2>
          <div class="mt-3 flex gap-2">
            <input v-model="question" :disabled="!canPlay" class="flex-1 rounded-2xl border-white/10 bg-slate-900/70 px-4 py-3" placeholder="例如：它是原创动画吗？有佐仓绫音参与吗？" @keyup.enter="ask" />
            <button class="rounded-2xl bg-emerald-500 px-4 font-semibold disabled:opacity-40" :disabled="!canPlay || loading" @click="ask">问</button>
            <button class="rounded-2xl bg-amber-500 px-4 font-semibold disabled:opacity-40" :disabled="!canPlay || loading" @click="hint">提示</button>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold">提交答案</h2>
          <input v-model="guessText" :disabled="!canPlay" class="mt-3 w-full rounded-2xl border-white/10 bg-slate-900/70 px-4 py-3" placeholder="输入动画名，同步搜索 Bangumi 条目" />
          <div v-if="searchResults.length" class="mt-3 grid gap-2 sm:grid-cols-2">
            <button v-for="item in searchResults" :key="item.id" class="flex gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-left hover:bg-slate-800" @click="selected = item; submitGuess(item)">
              <img v-if="item.image" :src="item.image" class="h-16 w-12 rounded object-cover" />
              <span><b>{{ item.name_cn || item.name }}</b><small class="block text-slate-400">#{{ item.id }} · {{ item.date || '日期未知' }} · {{ item.score ? `${item.score}分` : '暂无评分' }}</small></span>
            </button>
          </div>
        </div>

        <div class="glass rounded-3xl p-5">
          <h2 class="font-semibold">记录</h2>
          <div class="mt-3 space-y-2">
            <p v-for="(item, index) in chat" :key="index" class="rounded-2xl px-4 py-3 text-sm" :class="item.role === 'player' ? 'bg-indigo-500/20' : item.tone === 'ok' ? 'bg-emerald-500/20' : item.tone === 'bad' ? 'bg-rose-500/20' : 'bg-white/10'">
              <span class="mr-2 text-xs uppercase text-slate-400">{{ item.role }}</span>{{ item.text }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
