<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, GripVertical, MapPin, Navigation, Plus, ReceiptText } from 'lucide-vue-next'
import SpotItems from './SpotItems.vue'
import type { Spot, SpotItem } from '@/types'
import { useTripStore } from '@/stores/trip'
import { useExpanded } from '@/composables/useExpanded'
import { googleMapsUrl } from '@/lib/maps'
import { formatTime } from '@/lib/format'
import { bookingLabel, categoryInfo, itemWords, nextBooking } from '@/lib/category'
import { formatMoney } from '@/lib/money'
import { expenseTwd } from '@/lib/split'

const props = withDefaults(defineProps<{ spot: Spot; draggable?: boolean }>(), { draggable: true })
const emit = defineEmits<{ edit: []; booking: []; 'item-edit': [item: SpotItem | null]; expenses: [] }>()

const store = useTripStore()
const expanded = useExpanded()
const mapUrl = computed(() => googleMapsUrl(props.spot))
const items = computed(() => store.itemsBySpot.get(props.spot.id) ?? [])
const doneCount = computed(() => items.value.filter((i) => i.done).length)
const words = computed(() => itemWords(props.spot.category))
// 購物一定顯示子清單入口（一區逛多間店是主要用法），其他類型有子項目才顯示
const showItems = computed(() => items.value.length > 0 || props.spot.category === 'shop')
const open = computed(() => expanded.isOpen(props.spot.id))
const expenses = computed(() => store.expensesBySpot.get(props.spot.id) ?? [])
const spent = computed(() => (store.trip ? expenses.value.reduce((s, e) => s + expenseTwd(e, store.trip!), 0) : 0))

function addFirst() {
  expanded.open(props.spot.id)
  emit('item-edit', null)
}
const category = computed(() => categoryInfo(props.spot.category))
// 「不需要」不顯示標籤，畫面比較乾淨；還沒設定的顯示虛線提示，點了開始設定
const status = computed(() => {
  if (!category.value.booking) return null
  const b = props.spot.booking
  if (b === 'none') return null
  const next = bookingLabel(props.spot.category, nextBooking(props.spot.category, b))
  if (b === null) return { text: '設定預約', cls: 'border border-dashed border-ink-300 text-ink-400 dark:border-ink-600', next }
  return { text: bookingLabel(props.spot.category, b)!, cls: b === 'todo' ? 'chip-open' : 'chip-done', next }
})
</script>

<template>
  <div class="card p-1.5 pr-2" :class="!draggable && 'pl-3'">
    <div class="flex items-stretch gap-1">
      <button
        v-if="draggable"
        type="button"
        class="drag-handle flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-ink-300 hover:bg-ink-50 active:cursor-grabbing dark:text-ink-500 dark:hover:bg-ink-800"
        aria-label="拖曳排序"
        title="拖曳排序"
      >
        <GripVertical class="size-4" />
      </button>
      <button type="button" class="min-w-0 flex-1 rounded-xl px-1.5 py-2 text-left" @click="emit('edit')">
        <div class="flex items-baseline gap-1.5">
          <span class="shrink-0 self-center text-base leading-none" :title="category.label" aria-hidden="true">{{ category.emoji }}</span>
          <span class="sr-only">{{ category.label }}</span>
          <span v-if="spot.start_time" class="num shrink-0 text-sm font-bold text-sea-600 dark:text-sea-400">{{ formatTime(spot.start_time) }}</span>
          <span class="min-w-0 font-bold break-words">{{ spot.title }}</span>
        </div>
        <p v-if="spot.address" class="mt-0.5 flex items-start gap-1 text-xs text-ink-400 dark:text-ink-300">
          <MapPin class="mt-0.5 size-3 shrink-0" /><span class="min-w-0 break-words">{{ spot.address }}</span>
        </p>
        <p v-if="spot.note" class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-600 dark:text-ink-200">{{ spot.note }}</p>
      </button>
      <div class="flex w-16 shrink-0 flex-col items-center justify-center gap-1 py-1">
        <button
          v-if="status"
          type="button"
          class="chip justify-center px-2 whitespace-nowrap transition active:scale-95"
          :class="status.cls"
          :aria-label="`${spot.title}：${status.text}，點一下改成${status.next}`"
          :title="`點一下改成「${status.next}」`"
          @click="emit('booking')"
        >
          {{ status.text }}
        </button>
        <a
          v-if="mapUrl"
          :href="mapUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="flex w-12 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold text-sea-700 hover:bg-sea-100 dark:text-sea-300 dark:hover:bg-sea-400/10"
          :aria-label="`在 Google 地圖開啟 ${spot.title}`"
        >
          <Navigation class="size-4" />地圖
        </a>
      </div>
    </div>
    <div v-if="showItems || expenses.length" class="ml-8 flex flex-wrap items-center gap-x-1">
      <template v-if="showItems">
        <button
          v-if="items.length"
          type="button"
          class="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
          :aria-expanded="open"
          @click="expanded.toggle(spot.id)"
        >
          <ChevronRight class="size-3.5 transition" :class="open && 'rotate-90'" />
          {{ items.length }} 個{{ words.noun }}・{{ words.done }} {{ doneCount }}
        </button>
        <button
          v-else
          type="button"
          class="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800"
          @click="addFirst"
        >
          <Plus class="size-3.5" />加入{{ words.noun }}<template v-if="!expenses.length">（一區逛好幾間時用）</template>
        </button>
      </template>
      <button
        v-if="expenses.length"
        type="button"
        class="num flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
        :aria-label="`${spot.title} 的旅費：${expenses.length} 筆，共 ${formatMoney(spent)}`"
        @click="emit('expenses')"
      >
        <ReceiptText class="size-3.5" />{{ formatMoney(spent) }}・{{ expenses.length }} 筆
      </button>
    </div>
    <SpotItems v-if="showItems && open && items.length" class="ml-1" :spot="spot" :items="items" @edit="emit('item-edit', $event)" />
  </div>
</template>
