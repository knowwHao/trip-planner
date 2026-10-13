<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, GripVertical, MapPin, Navigation, Plus, ReceiptText, ShoppingBag } from 'lucide-vue-next'
import SpotItems from './SpotItems.vue'
import type { Spot, SpotItem } from '@/types'
import { useTripStore } from '@/stores/trip'
import { useExpanded } from '@/composables/useExpanded'
import { googleMapsUrl } from '@/lib/maps'
import { formatTime } from '@/lib/format'
import { bookingLabel, categoryInfo, itemWords, nextBooking } from '@/lib/category'
import { formatMoney } from '@/lib/money'
import { expenseTwd } from '@/lib/split'
import { flightSummary, hasFlight } from '@/lib/flight'

const props = withDefaults(defineProps<{ spot: Spot; draggable?: boolean }>(), { draggable: true })
const emit = defineEmits<{ edit: []; booking: []; 'item-edit': [item: SpotItem | null]; expenses: []; wishes: [] }>()

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
const flight = computed(() => {
  if (!hasFlight(props.spot)) return ''
  const line = flightSummary(props.spot)
  return props.spot.airline && props.spot.flight_no ? `${props.spot.airline} ${line}` : line
})
// 自己排在這裡的代購，別人看不到
const wishes = computed(() => store.wishBySpot.get(props.spot.id) ?? [])
const wishTodo = computed(() => wishes.value.filter((w) => w.status === 'todo').length)
const spent = computed(() => (store.trip ? expenses.value.reduce((s, e) => s + expenseTwd(e, store.trip!), 0) : 0))

function addFirst() {
  expanded.open(props.spot.id)
  emit('item-edit', null)
}
const category = computed(() => categoryInfo(props.spot.category))
// 只有打開提醒的才有標籤（點了在還沒與已完成之間切換）；餐廳的現場排隊是不能點的灰色標籤
const status = computed(() => {
  const b = props.spot.booking
  const text = bookingLabel(props.spot.category, b)
  if (!text) return null
  const next = nextBooking(props.spot.category, b)
  if (!next) return { text, cls: 'chip-muted', next: null }
  return { text, cls: b === 'todo' ? 'chip-open' : 'chip-done', next: bookingLabel(props.spot.category, next) }
})
</script>

<template>
  <div class="card p-1.5" :class="!draggable && 'pl-3'">
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
        <p v-if="flight" class="num mt-0.5 text-xs font-semibold break-words text-ink-600 dark:text-ink-200">
          <span class="mr-1" aria-hidden="true">✈️</span>{{ flight }}
        </p>
        <p v-if="spot.address" class="mt-0.5 flex items-start gap-1 text-xs text-ink-400 dark:text-ink-300">
          <MapPin class="mt-0.5 size-3 shrink-0" /><span class="min-w-0 break-words">{{ spot.address }}</span>
        </p>
        <p v-if="spot.note" class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-600 dark:text-ink-200">{{ spot.note }}</p>
      </button>
      <!-- 地圖固定大小、垂直置中，卡片高度只跟著內容行數變 -->
      <a
        v-if="mapUrl"
        :href="mapUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="flex size-10 shrink-0 items-center justify-center self-center rounded-2xl text-sea-700 hover:bg-sea-100 dark:text-sea-300 dark:hover:bg-sea-400/10"
        :aria-label="`在 Google 地圖開啟 ${spot.title}`"
        title="在 Google 地圖開啟"
      >
        <Navigation class="size-5" />
      </a>
    </div>
    <div v-if="status || showItems || expenses.length || wishes.length" class="flex flex-wrap items-center gap-x-1 gap-y-0.5 pb-0.5" :class="draggable ? 'ml-8' : 'ml-0.5'">
      <button
        v-if="status?.next"
        type="button"
        class="chip mx-1 whitespace-nowrap transition active:scale-95"
        :class="status.cls"
        :aria-label="`${spot.title}：${status.text}，點一下改成${status.next}`"
        :title="`點一下改成「${status.next}」`"
        @click="emit('booking')"
      >
        {{ status.text }}
      </button>
      <span v-else-if="status" class="mx-1 whitespace-nowrap" :class="status.cls">{{ status.text }}</span>
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
      <button
        v-if="wishes.length"
        type="button"
        class="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"
        :aria-label="`${spot.title} 的代購：${wishes.length} 項，待買 ${wishTodo} 項`"
        @click="emit('wishes')"
      >
        <ShoppingBag class="size-3.5" />代購 {{ wishes.length }}<template v-if="wishTodo">・待買 {{ wishTodo }}</template>
      </button>
    </div>
    <SpotItems v-if="showItems && open && items.length" class="ml-1" :spot="spot" :items="items" @edit="emit('item-edit', $event)" />
  </div>
</template>
