<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRight, FlaskConical, Link2, Luggage, Plus } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import EmptyState from '@/components/EmptyState.vue'
import TripFormModal from '@/components/TripFormModal.vue'
import { createDemoTrip, isDemo, repo } from '@/data'
import { useSavedTrips } from '@/stores/saved'
import type { SavedTrip, TripInput } from '@/types'
import { diffDays, formatRange, todayYmd } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'

const router = useRouter()
const saved = useSavedTrips()

const trips = computed(() =>
  [...saved.list].sort((a, b) => {
    // 進行中與還沒出發的排前面（越近越前），已結束的排後面（越近越前）
    const today = todayYmd()
    const ea = a.end_date < today
    const eb = b.end_date < today
    if (ea !== eb) return ea ? 1 : -1
    return ea ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)
  }),
)

function badge(t: SavedTrip): { text: string; cls: string } {
  const today = todayYmd()
  if (t.end_date < today) return { text: '已結束', cls: 'chip-muted' }
  if (t.start_date <= today) return { text: `旅行中・第 ${diffDays(t.start_date, today) + 1} 天`, cls: 'chip-done' }
  const n = diffDays(today, t.start_date)
  return { text: n === 1 ? '明天出發' : `還有 ${n} 天`, cls: 'chip-open' }
}

const creating = ref(false)
const saving = ref(false)

async function create(input: TripInput, people: string[]) {
  saving.value = true
  try {
    const { id, token } = await repo.createTrip(input, people)
    saved.upsert(token, { id, ...input })
    creating.value = false
    toast.success('旅程建好了，把連結傳給旅伴就能一起編輯')
    await router.push(`/trips/${id}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

const link = ref('')
// 接受完整連結（…#/t/<token>）或只有 token
function openLink() {
  const raw = link.value.trim()
  const token = raw.match(/#\/t\/([A-Za-z0-9_-]+)/)?.[1] ?? (/^[A-Za-z0-9_-]{16,128}$/.test(raw) ? raw : null)
  if (!token) {
    toast.error('看不懂這個連結，請貼上完整的旅程連結')
    return
  }
  link.value = ''
  void router.push(`/t/${token}`)
}

function openDemo() {
  const t = createDemoTrip()
  if (t) void router.push(`/t/${t.token}`)
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark :size="34" />
        <p class="truncate text-lg font-black tracking-tight">旅遊規劃</p>
      </div>
      <ThemeToggle />
    </header>

    <main class="mx-auto max-w-3xl px-4 pt-2 pb-16">
      <section class="card relative overflow-hidden bg-ink-900 p-6 text-white dark:bg-ink-900">
        <div class="absolute -top-10 -right-10 size-40 rounded-full bg-sea-400/20 blur-2xl" />
        <h1 class="relative text-2xl font-black tracking-tight">和旅伴一起排行程</h1>
        <p class="relative mt-1.5 text-sm text-ink-200">景點、時間、Google 地圖一起編輯，旅費自動算出誰該給誰多少</p>
        <div class="relative mt-5 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" @click="creating = true"><Plus class="size-4" />建立新旅程</button>
          <button v-if="isDemo" type="button" class="btn border border-white/20 text-white hover:bg-white/10" @click="openDemo">
            <FlaskConical class="size-4" />開一趟示範旅程
          </button>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="section-title mb-3">我的旅程</h2>
        <div v-if="trips.length" class="space-y-2.5">
          <RouterLink
            v-for="t in trips"
            :key="t.id"
            :to="`/trips/${t.id}`"
            class="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sea-100 text-sea-700 dark:bg-sea-400/15 dark:text-sea-300">
              <Luggage class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-bold">{{ t.name }}</p>
              <p class="mt-0.5 text-xs text-ink-400 dark:text-ink-300">{{ formatRange(t.start_date, t.end_date) }}</p>
              <span class="mt-1.5" :class="badge(t).cls">{{ badge(t).text }}</span>
            </div>
            <ChevronRight class="size-4 shrink-0 text-ink-300" />
          </RouterLink>
        </div>
        <div v-else class="card">
          <EmptyState :icon="Luggage" title="這台裝置還沒有旅程" description="建立一趟新旅程，或用旅伴傳給你的旅程連結開啟" />
        </div>
      </section>

      <section class="mt-8">
        <h2 class="section-title mb-3">用旅程連結開啟</h2>
        <form class="card flex gap-2 p-3" @submit.prevent="openLink">
          <label for="join-link" class="sr-only">旅程連結</label>
          <input id="join-link" v-model="link" class="input min-w-0 flex-1" placeholder="貼上旅伴傳來的連結" autocomplete="off" />
          <button type="submit" class="btn-dark shrink-0" :disabled="!link.trim()"><Link2 class="size-4" />開啟</button>
        </form>
        <p class="mt-2 px-1 text-xs leading-relaxed text-ink-400">
          拿到連結的人都能查看與編輯那一趟旅程；開過一次之後，這台裝置會記住，下次直接從上面的清單進去。
        </p>
      </section>
    </main>

    <TripFormModal :open="creating" :saving="saving" @close="creating = false" @submit="create" />
  </div>
</template>
