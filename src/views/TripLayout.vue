<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ChevronLeft, House, Link2Off, LoaderCircle, MapPinned, RefreshCw, Settings, Trash2, Wallet } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useTripStore } from '@/stores/trip'
import { useSavedTrips } from '@/stores/saved'
import { formatRange } from '@/lib/format'

const route = useRoute()
const router = useRouter()
const store = useTripStore()
const saved = useSavedTrips()

const tripId = computed(() => String(route.params.tripId))
watch(tripId, (id) => void store.open(id), { immediate: true })
onBeforeUnmount(() => store.close())

const base = computed(() => `/trips/${tripId.value}`)
const nav = computed(() => [
  { to: base.value, label: '行程', icon: MapPinned, active: route.path === base.value },
  { to: `${base.value}/expenses`, label: '旅費', icon: Wallet, active: route.path.endsWith('/expenses') },
  { to: `${base.value}/settings`, label: '設定', icon: Settings, active: route.path.endsWith('/settings') },
])

function forget() {
  saved.remove(tripId.value)
  void router.push('/')
}
</script>

<template>
  <div v-if="store.status === 'ok' && store.trip" class="min-h-dvh">
    <header
      class="sticky top-0 z-30 border-b border-ink-100/60 bg-paper/85 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/85"
    >
      <div class="mx-auto flex max-w-4xl items-center gap-1 px-2 py-2 sm:px-4">
        <RouterLink to="/" class="icon-btn shrink-0" title="我的旅程" aria-label="回我的旅程">
          <ChevronLeft class="size-5" />
        </RouterLink>
        <div class="min-w-0 flex-1">
          <p class="truncate font-black tracking-tight">{{ store.trip.name }}</p>
          <p class="flex items-center gap-1.5 truncate text-xs text-ink-400 dark:text-ink-300">
            <span
              class="inline-block size-1.5 shrink-0 rounded-full"
              :class="store.live ? 'bg-sea-500' : 'bg-ink-300 dark:bg-ink-600'"
              :title="store.live ? '即時同步中' : '即時同步未連線，切回頁面時會重新讀取'"
            />
            {{ formatRange(store.trip.start_date, store.trip.end_date) }}
          </p>
        </div>
        <nav class="hidden items-center gap-1 sm:flex" aria-label="旅程">
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-semibold transition"
            :class="item.active ? 'bg-sea-400 text-ink-950' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'"
          >
            <component :is="item.icon" class="size-4" />{{ item.label }}
          </RouterLink>
        </nav>
        <ThemeToggle class="shrink-0" />
      </div>
    </header>

    <main class="mx-auto w-full max-w-4xl px-4 pt-5 pb-28 sm:px-6 sm:pb-12">
      <RouterView />
    </main>

    <nav
      class="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/90 backdrop-blur-lg sm:hidden dark:border-ink-800 dark:bg-ink-900/90"
      aria-label="旅程"
    >
      <div class="mx-auto grid max-w-md grid-cols-3 px-2 pt-1.5 pb-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition"
          :class="item.active ? 'text-ink-950 dark:text-sea-400' : 'text-ink-400'"
        >
          <span class="flex h-7 w-12 items-center justify-center rounded-full transition" :class="item.active ? 'bg-sea-400 text-ink-950' : ''">
            <component :is="item.icon" class="size-5" />
          </span>
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>
  </div>

  <main v-else class="mx-auto flex min-h-[80dvh] max-w-3xl items-center justify-center px-4">
    <div v-if="store.status === 'checking' || store.status === 'idle'" class="flex items-center gap-2 text-sm text-ink-400" role="status">
      <LoaderCircle class="size-5 animate-spin" />讀取中…
    </div>
    <EmptyState
      v-else-if="store.status === 'unknown'"
      :icon="Link2Off"
      title="這台裝置沒有這趟旅程的連結"
      description="請用旅伴傳給你的旅程連結開啟，開過一次之後這台裝置就會記住。"
    >
      <RouterLink to="/" class="btn-primary"><House class="size-4" />回我的旅程</RouterLink>
    </EmptyState>
    <EmptyState
      v-else-if="store.status === 'invalid'"
      :icon="Link2Off"
      title="這個旅程連結已失效"
      description="連結可能已經被旅伴重新產生，或整趟旅程被刪除了。請跟旅伴要最新的旅程連結。"
    >
      <div class="flex flex-wrap justify-center gap-2">
        <button type="button" class="btn-outline" @click="forget"><Trash2 class="size-4" />從這台裝置移除</button>
        <RouterLink to="/" class="btn-primary"><House class="size-4" />回我的旅程</RouterLink>
      </div>
    </EmptyState>
    <EmptyState v-else :icon="RefreshCw" title="暫時讀不到資料" :description="`請確認網路後再試一次（${store.errorText}）`">
      <div class="flex flex-wrap justify-center gap-2">
        <button type="button" class="btn-primary" @click="store.open(tripId)"><RefreshCw class="size-4" />重新載入</button>
        <RouterLink to="/" class="btn-outline"><House class="size-4" />回我的旅程</RouterLink>
      </div>
    </EmptyState>
  </main>
</template>
