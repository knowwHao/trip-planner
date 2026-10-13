<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ListChecks, MapPin, Plus, ReceiptText, ShoppingBag, X } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import WishThumb from '@/components/WishThumb.vue'
import WishItemModal from '@/components/WishItemModal.vue'
import ExpenseFormModal from '@/components/ExpenseFormModal.vue'
import type { Id, WishItem, WishStatus } from '@/types'
import { useTripStore } from '@/stores/trip'
import { errorMessage, toast } from '@/composables/useToast'
import { formatMoney } from '@/lib/money'
import { todayYmd } from '@/lib/format'
import { groupByRecipient, wishLabel, wishStatusLabel } from '@/lib/wish'

const store = useTripStore()
const trip = computed(() => store.trip!)

type Filter = 'all' | WishStatus
const filter = ref<Filter>('all')
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '待買' },
  { value: 'bought', label: '已買' },
  { value: 'unavailable', label: '買不到' },
]
const counts = computed(() => {
  const c: Record<Filter, number> = { all: store.wishItems.length, todo: 0, bought: 0, unavailable: 0 }
  for (const w of store.wishItems) c[w.status]++
  return c
})
const groups = computed(() => groupByRecipient(store.wishItems.filter((w) => filter.value === 'all' || w.status === filter.value)))
/** 在哪買：「行程 › 店家」 */
function placeTitle(w: WishItem): string {
  const spot = w.spot_id ? store.data?.spots.find((s) => s.id === w.spot_id)?.title : ''
  const item = w.item_id ? store.data?.items.find((i) => i.id === w.item_id)?.title : ''
  return [spot, item].filter(Boolean).join(' › ')
}

const editing = ref<WishItem | null>(null)
const itemOpen = ref(false)

function add() {
  editing.value = null
  itemOpen.value = true
}

function edit(w: WishItem) {
  if (recording.value) return toggleSelect(w)
  editing.value = w
  itemOpen.value = true
}

async function toggleBought(w: WishItem) {
  try {
    await store.setWishStatus(w.id, w.status === 'bought' ? 'todo' : 'bought')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// ---------- 勾幾項記成一筆旅費 ----------
const recording = ref(false)
const selected = ref<Set<Id>>(new Set())
const canRecord = (w: WishItem) => w.status !== 'unavailable' && !store.wishRecords.has(w.id)

function toggleRecording() {
  recording.value = !recording.value
  selected.value = new Set()
}

function toggleSelect(w: WishItem) {
  if (!canRecord(w)) return
  const next = new Set(selected.value)
  if (next.has(w.id)) next.delete(w.id)
  else next.add(w.id)
  selected.value = next
}

const expenseOpen = ref(false)
const expensePreset = ref<{ wish: Id[]; spot_id: Id | null; spent_on: string | null } | null>(null)

function record() {
  const ids = store.wishItems.filter((w) => selected.value.has(w.id)).map((w) => w.id)
  if (!ids.length) return
  // 勾的項目都排在同一個行程時順便帶入行程
  const spots = new Set(store.wishItems.filter((w) => selected.value.has(w.id)).map((w) => w.spot_id))
  const today = todayYmd()
  expensePreset.value = {
    wish: ids,
    spot_id: spots.size === 1 ? [...spots][0] : null,
    spent_on: today >= trip.value.start_date && today <= trip.value.end_date ? today : null,
  }
  expenseOpen.value = true
}

function closeExpense() {
  expenseOpen.value = false
  recording.value = false
  selected.value = new Set()
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-black tracking-tight">代購</h1>
        <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">只有你看得到・{{ counts.all }} 項，待買 {{ counts.todo }}</p>
      </div>
      <div class="flex gap-2">
        <button v-if="store.wishItems.length" type="button" class="btn-outline" :aria-pressed="recording" @click="toggleRecording">
          <component :is="recording ? X : ListChecks" class="size-4" />{{ recording ? '取消' : '記帳' }}
        </button>
        <button type="button" class="btn-primary" @click="add"><Plus class="size-4" />新增</button>
      </div>
    </div>

    <p v-if="recording" class="mb-4 rounded-2xl bg-sea-100 px-3.5 py-2.5 text-sm text-ink-700 dark:bg-sea-400/10 dark:text-ink-100">
      勾選這次一起結帳的代購，按下方的「記成一筆旅費」；已記過帳和買不到的不能勾。
    </p>

    <div v-if="store.wishItems.length" class="-mx-4 mb-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6" role="radiogroup" aria-label="篩選">
      <div class="flex w-max gap-1.5">
        <button
          v-for="f in filters"
          :key="f.value"
          type="button"
          role="radio"
          :aria-checked="filter === f.value"
          class="rounded-2xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition"
          :class="filter === f.value ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'"
          @click="filter = f.value"
        >
          {{ f.label }} {{ counts[f.value] }}
        </button>
      </div>
    </div>

    <div v-if="!store.wishItems.length" class="card">
      <EmptyState :icon="ShoppingBag" title="還沒有代購" description="把別人託你買的東西記下來，可以附照片和連結，到店裡照著買，買了直接記帳">
        <button type="button" class="btn-primary" @click="add"><Plus class="size-4" />新增代購</button>
      </EmptyState>
    </div>
    <p v-else-if="!groups.length" class="card px-4 py-8 text-center text-sm text-ink-400">沒有符合的代購</p>

    <section v-for="g in groups" :key="g.recipient" class="mb-6">
      <h2 class="mb-2 px-1 text-sm font-bold">幫{{ g.recipient }}買<span class="ml-1.5 font-normal text-ink-400">{{ g.items.length }} 項</span></h2>
      <ul class="card divide-y divide-ink-100 overflow-hidden dark:divide-ink-800">
        <li v-for="w in g.items" :key="w.id" class="flex items-center gap-2.5 py-2 pr-2 pl-3" :class="recording && !canRecord(w) && 'opacity-50'">
          <button
            v-if="recording"
            type="button"
            role="checkbox"
            :aria-checked="selected.has(w.id)"
            :aria-label="`選 ${wishLabel(w)} 記帳`"
            :disabled="!canRecord(w)"
            class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition"
            :class="selected.has(w.id) ? 'border-sea-500 bg-sea-500 text-white' : 'border-ink-300 dark:border-ink-600'"
            @click="toggleSelect(w)"
          >
            <Check v-if="selected.has(w.id)" class="size-4" :stroke-width="3" />
          </button>
          <button
            v-else
            type="button"
            role="checkbox"
            :aria-checked="w.status === 'bought'"
            :aria-label="`${wishLabel(w)}：${wishStatusLabel(w.status)}，點一下改成${w.status === 'bought' ? '待買' : '已買'}`"
            :disabled="w.status === 'unavailable'"
            class="flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition disabled:opacity-40"
            :class="w.status === 'bought' ? 'border-sea-500 bg-sea-500 text-white' : 'border-ink-300 dark:border-ink-600'"
            @click="toggleBought(w)"
          >
            <Check v-if="w.status === 'bought'" class="size-4" :stroke-width="3" />
          </button>
          <WishThumb v-if="store.wishPhotosByItem.get(w.id)?.length" :photo-id="store.wishPhotosByItem.get(w.id)![0].id" :alt="w.title" class="size-12 shrink-0" />
          <button type="button" class="min-w-0 flex-1 py-0.5 text-left" @click="edit(w)">
            <span class="block font-semibold break-words" :class="w.status !== 'todo' && 'text-ink-400'">
              {{ wishLabel(w) }}<span v-if="w.status === 'unavailable'" class="chip-muted ml-1.5 align-middle">買不到</span>
            </span>
            <span v-if="w.note" class="block truncate text-xs text-ink-500 dark:text-ink-300">{{ w.note }}</span>
            <span class="flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
              <span v-if="placeTitle(w)" class="inline-flex items-center gap-0.5"><MapPin class="size-3" />{{ placeTitle(w) }}</span>
              <span v-if="store.wishRecords.get(w.id)" class="num inline-flex items-center gap-0.5 font-semibold text-sea-700 dark:text-sea-300">
                <ReceiptText class="size-3" />已記帳 {{ formatMoney(store.wishRecords.get(w.id)!.proxy.amount, store.wishRecords.get(w.id)!.expense.currency) }}
                <template v-if="store.wishRecords.get(w.id)!.expense.currency !== 'TWD'">≈ {{ formatMoney(store.wishRecords.get(w.id)!.twd) }}</template>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <div v-if="recording" class="fixed inset-x-0 bottom-[76px] z-30 px-4 sm:bottom-6">
      <div class="mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-ink-900 py-2.5 pr-2.5 pl-5 text-white shadow-lift dark:bg-ink-800">
        <span class="min-w-0 flex-1 text-sm font-semibold">已選 {{ selected.size }} 項</span>
        <button type="button" class="btn-primary shrink-0" :disabled="!selected.size" @click="record"><ReceiptText class="size-4" />記成一筆旅費</button>
      </div>
    </div>

    <WishItemModal :open="itemOpen" :item="editing" @close="itemOpen = false" />
    <ExpenseFormModal :open="expenseOpen" :preset="expensePreset" @close="closeExpense" />
  </div>
</template>
