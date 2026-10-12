<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDownWideNarrow, Bookmark, Plus } from 'lucide-vue-next'
import SpotList from '@/components/SpotList.vue'
import SpotFormModal from '@/components/SpotFormModal.vue'
import type { Id, Spot } from '@/types'
import { useTripStore } from '@/stores/trip'
import type { SpotMove } from '@/data/repository'
import { dayDate, formatDate, todayYmd } from '@/lib/format'
import { formatMoney, toTwd } from '@/lib/money'
import { evenKeys, keyBetween } from '@/lib/order'
import { errorMessage, toast } from '@/composables/useToast'

const store = useTripStore()
const trip = computed(() => store.trip!)

const sections = computed(() => {
  const list: { day: number | null; title: string; sub: string; spots: Spot[]; today: boolean }[] = []
  for (let d = 1; d <= store.dayCount; d++) {
    const date = dayDate(trip.value, d)
    list.push({ day: d, title: `第 ${d} 天`, sub: formatDate(date), spots: store.spotsByDay.get(d) ?? [], today: date === todayYmd() })
  }
  list.push({ day: null, title: '口袋名單', sub: '還沒排進行程', spots: store.spotsByDay.get(null) ?? [], today: false })
  return list
})

function estTotal(spots: Spot[]) {
  return spots.reduce((s, x) => s + (x.est_cost ?? 0), 0)
}

function costLabel(total: number) {
  const { currency, fx_rate } = trip.value
  return currency === 'TWD' ? formatMoney(total) : `${formatMoney(total, currency)}（≈ ${formatMoney(toTwd(total, currency, fx_rate))}）`
}

const scheduledTotal = computed(() => estTotal((store.data?.spots ?? []).filter((s) => s.day !== null && s.day <= store.dayCount)))
const spotCount = computed(() => store.data?.spots.length ?? 0)

const editing = ref<Spot | null>(null)
const addingDay = ref<number | null | undefined>(undefined)
const modalOpen = ref(false)

function add(day: number | null) {
  editing.value = null
  addingDay.value = day
  modalOpen.value = true
}

function edit(s: Spot) {
  editing.value = s
  modalOpen.value = true
}

async function move(id: Id, day: number | null, index: number) {
  const target = (store.spotsByDay.get(day) ?? []).filter((s) => s.id !== id)
  const key = keyBetween(target[index - 1]?.sort_key, target[index]?.sort_key)
  let moves: SpotMove[]
  if (key !== null) {
    moves = [{ id, day, sort_key: key }]
  } else {
    // 中間值的精度用完了，整天重新編號
    const ids = target.map((s) => s.id)
    ids.splice(index, 0, id)
    const keys = evenKeys(ids.length)
    moves = ids.map((sid, i) => ({ id: sid, day, sort_key: keys[i] }))
  }
  try {
    await store.moveSpots(moves)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

/** 有時間的景點照時間排，沒時間的維持原本的相對位置 */
function timeSorted(spots: Spot[]): Spot[] {
  const timed = spots.filter((s) => s.start_time).sort((a, b) => a.start_time!.localeCompare(b.start_time!))
  let i = 0
  return spots.map((s) => (s.start_time ? timed[i++] : s))
}

function outOfOrder(spots: Spot[]) {
  return timeSorted(spots).some((s, i) => s.id !== spots[i].id)
}

async function sortByTime(day: number | null, spots: Spot[]) {
  const keys = evenKeys(spots.length)
  try {
    await store.moveSpots(timeSorted(spots).map((s, i) => ({ id: s.id, day, sort_key: keys[i] })))
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function jump(day: number | null) {
  document.getElementById(`day-${day ?? 'pocket'}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-black tracking-tight">行程</h1>
        <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">
          {{ store.dayCount }} 天・{{ spotCount }} 個景點<template v-if="scheduledTotal">・預估 {{ costLabel(scheduledTotal) }}</template>
        </p>
      </div>
      <button type="button" class="btn-primary" @click="add(1)"><Plus class="size-4" />新增景點</button>
    </div>

    <div class="sticky top-[57px] z-20 -mx-4 mb-4 overflow-x-auto bg-paper/85 px-4 py-2 backdrop-blur-lg sm:-mx-6 sm:px-6 dark:bg-ink-950/85">
      <div class="flex w-max gap-1.5">
        <button
          v-for="s in sections"
          :key="s.day ?? 'pocket'"
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition"
          :class="
            s.today
              ? 'border-sea-400 bg-sea-400 text-ink-950'
              : 'border-ink-200 bg-white text-ink-600 hover:border-sea-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200'
          "
          @click="jump(s.day)"
        >
          <template v-if="s.day">D{{ s.day }} {{ s.sub.replace(/（.）/, '') }}</template>
          <template v-else><Bookmark class="-mt-0.5 inline size-3" /> 口袋</template>
        </button>
      </div>
    </div>

    <p class="mb-4 text-xs text-ink-400">按住卡片左邊的 ⋮⋮ 可以拖曳排序，也能拖到別天；點卡片可以編輯，其他旅伴的修改會自動出現。</p>

    <section v-for="s in sections" :id="`day-${s.day ?? 'pocket'}`" :key="s.day ?? 'pocket'" class="mb-7 scroll-mt-28">
      <div class="mb-2.5 flex items-center justify-between gap-2">
        <h2 class="min-w-0 truncate">
          <span class="text-lg font-black">{{ s.title }}</span>
          <span class="ml-2 text-sm font-semibold text-ink-400">{{ s.sub }}</span>
          <span v-if="s.today" class="chip-done ml-2 align-middle">今天</span>
        </h2>
        <div class="flex shrink-0 items-center">
          <button v-if="outOfOrder(s.spots)" type="button" class="btn-ghost px-3 py-1.5" @click="sortByTime(s.day, s.spots)">
            <ArrowDownWideNarrow class="size-4" />依時間排
          </button>
          <button type="button" class="btn-ghost px-3 py-1.5" :aria-label="`在${s.title}新增景點`" @click="add(s.day)">
            <Plus class="size-4" />新增
          </button>
        </div>
      </div>
      <SpotList :spots="s.spots" :day="s.day" :currency="trip.currency" :fx-rate="trip.fx_rate" @edit="edit" @move="move" />
      <p v-if="estTotal(s.spots)" class="num mt-2 text-right text-xs text-ink-400">預估 {{ costLabel(estTotal(s.spots)) }}</p>
    </section>

    <SpotFormModal :open="modalOpen" :spot="editing" :day="addingDay" @close="modalOpen = false" />
  </div>
</template>
