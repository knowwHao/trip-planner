<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical, MapPin, Navigation } from 'lucide-vue-next'
import type { Spot } from '@/types'
import { googleMapsUrl } from '@/lib/maps'
import { formatTime } from '@/lib/format'
import { formatMoney, toTwd } from '@/lib/money'

const props = defineProps<{ spot: Spot; currency: string; fxRate: number }>()
const emit = defineEmits<{ edit: [] }>()

const mapUrl = computed(() => googleMapsUrl(props.spot))
const cost = computed(() => {
  const c = props.spot.est_cost
  if (c === null) return ''
  const local = formatMoney(c, props.currency)
  return props.currency === 'TWD' ? local : `${local}（≈ ${formatMoney(toTwd(c, props.currency, props.fxRate))}）`
})
</script>

<template>
  <div class="card flex items-stretch gap-1 p-1.5 pr-2">
    <button
      type="button"
      class="drag-handle flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-ink-300 hover:bg-ink-50 active:cursor-grabbing dark:text-ink-500 dark:hover:bg-ink-800"
      aria-label="拖曳排序"
      title="拖曳排序"
    >
      <GripVertical class="size-4" />
    </button>
    <button type="button" class="min-w-0 flex-1 rounded-xl px-1.5 py-2 text-left" @click="emit('edit')">
      <div class="flex items-baseline gap-2">
        <span v-if="spot.start_time" class="num shrink-0 text-sm font-bold text-sea-600 dark:text-sea-400">{{ formatTime(spot.start_time) }}</span>
        <span class="min-w-0 font-bold break-words">{{ spot.title }}</span>
      </div>
      <p v-if="spot.address" class="mt-0.5 flex items-start gap-1 text-xs text-ink-400 dark:text-ink-300">
        <MapPin class="mt-0.5 size-3 shrink-0" /><span class="min-w-0 break-words">{{ spot.address }}</span>
      </p>
      <p v-if="spot.note" class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-600 dark:text-ink-200">{{ spot.note }}</p>
      <p v-if="cost" class="num mt-1 text-xs font-semibold text-ink-500 dark:text-ink-300">預估 {{ cost }}</p>
    </button>
    <a
      v-if="mapUrl"
      :href="mapUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 self-center rounded-2xl py-2 text-[11px] font-semibold text-sea-700 hover:bg-sea-100 dark:text-sea-300 dark:hover:bg-sea-400/10"
      :aria-label="`在 Google 地圖開啟 ${spot.title}`"
    >
      <Navigation class="size-4" />地圖
    </a>
  </div>
</template>
