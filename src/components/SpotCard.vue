<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical, MapPin, Navigation } from 'lucide-vue-next'
import type { Spot } from '@/types'
import { googleMapsUrl } from '@/lib/maps'
import { formatTime } from '@/lib/format'
import { formatMoney, toTwd } from '@/lib/money'
import { bookingLabel, categoryInfo, nextBooking } from '@/lib/category'

const props = withDefaults(defineProps<{ spot: Spot; currency: string; fxRate: number; draggable?: boolean }>(), { draggable: true })
const emit = defineEmits<{ edit: []; booking: [] }>()

const mapUrl = computed(() => googleMapsUrl(props.spot))
const cost = computed(() => {
  const c = props.spot.est_cost
  if (c === null) return ''
  const local = formatMoney(c, props.currency)
  return props.currency === 'TWD' ? local : `${local}（≈ ${formatMoney(toTwd(c, props.currency, props.fxRate))}）`
})
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
  <div class="card flex items-stretch gap-1 p-1.5 pr-2" :class="!draggable && 'pl-3'">
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
      <p v-if="cost" class="num mt-1 text-xs font-semibold text-ink-500 dark:text-ink-300">預估 {{ cost }}</p>
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
</template>
