<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRight, FlaskConical, LoaderCircle, Luggage, Plus, RefreshCw, UserRound } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import EmptyState from '@/components/EmptyState.vue'
import TripFormModal from '@/components/TripFormModal.vue'
import AccountModal from '@/components/AccountModal.vue'
import { createDemoTrip, isDemo, repo } from '@/data'
import { AccountSessionError } from '@/data/repository'
import { useAccountStore } from '@/stores/account'
import type { Id, TripInput, TripSummary } from '@/types'
import { diffDays, formatRange, todayYmd } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'

const router = useRouter()
const account = useAccountStore()
const accountOpen = ref(false)

const list = ref<TripSummary[] | null>(null)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try {
    list.value = await repo.listTrips()
  } catch (e) {
    if (e instanceof AccountSessionError) return account.expired()
    loadError.value = errorMessage(e)
  }
}
onMounted(load)

const trips = computed(() =>
  [...(list.value ?? [])].sort((a, b) => {
    // 進行中與還沒出發的排前面（越近越前），已結束的排後面（越近越前）
    const today = todayYmd()
    const ea = a.end_date < today
    const eb = b.end_date < today
    if (ea !== eb) return ea ? 1 : -1
    return ea ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)
  }),
)

function badge(t: TripSummary): { text: string; cls: string } {
  const today = todayYmd()
  if (t.end_date < today) return { text: '已結束', cls: 'chip-muted' }
  if (t.start_date <= today) return { text: `旅行中・第 ${diffDays(t.start_date, today) + 1} 天`, cls: 'chip-done' }
  const n = diffDays(today, t.start_date)
  return { text: n === 1 ? '明天出發' : `還有 ${n} 天`, cls: 'chip-open' }
}

const creating = ref(false)
const saving = ref(false)

async function create(input: TripInput, members: Id[]) {
  saving.value = true
  try {
    const id = await repo.createTrip(input, members)
    creating.value = false
    toast.success(members.length ? '旅程建好了，勾選的旅伴登入後就看得到' : '旅程建好了，可以到「設定」把旅伴加進來')
    await router.push(`/trips/${id}`)
  } catch (e) {
    if (e instanceof AccountSessionError) return account.expired()
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

function openDemo() {
  try {
    const id = createDemoTrip()
    if (id) void router.push(`/trips/${id}`)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark :size="34" />
        <p class="truncate text-lg font-black tracking-tight">旅遊規劃</p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition hover:bg-ink-100 dark:hover:bg-ink-800"
          :aria-label="`帳號：${account.session?.name}`"
          @click="accountOpen = true"
        >
          <UserRound class="size-4" />
          <span class="max-w-28 truncate">{{ account.session?.name }}</span>
        </button>
        <ThemeToggle />
      </div>
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
        <div v-if="list === null && !loadError" class="flex items-center justify-center gap-2 py-10 text-sm text-ink-400" role="status">
          <LoaderCircle class="size-5 animate-spin" />讀取中…
        </div>
        <div v-else-if="list === null" class="card">
          <EmptyState :icon="RefreshCw" title="暫時讀不到旅程" :description="`請確認網路後再試一次（${loadError}）`">
            <button type="button" class="btn-primary" @click="load"><RefreshCw class="size-4" />重新載入</button>
          </EmptyState>
        </div>
        <div v-else-if="trips.length" class="space-y-2.5">
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
          <EmptyState :icon="Luggage" title="還沒有旅程" description="建立一趟新旅程，或請旅伴在他們的旅程「設定」裡把你加進去" />
        </div>
      </section>
    </main>

    <TripFormModal :open="creating" :saving="saving" @close="creating = false" @submit="create" />
    <AccountModal :open="accountOpen" @close="accountOpen = false" />
  </div>
</template>
