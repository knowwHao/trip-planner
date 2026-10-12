<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import SpotCard from './SpotCard.vue'
import type { Id, Spot } from '@/types'

const props = defineProps<{ spots: Spot[]; day: number | null; currency: string; fxRate: number }>()
const emit = defineEmits<{
  edit: [spot: Spot]
  /** 拖到 day 這一天的第 index 個位置（以拖曳前的清單、扣掉被拖的那筆來算） */
  move: [id: Id, day: number | null, index: number]
}>()

const el = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  sortable = Sortable.create(el.value!, {
    group: 'spots',
    handle: '.drag-handle',
    animation: 150,
    // 不用瀏覽器原生拖放，滑鼠與觸控走同一套邏輯，iOS Safari 上也比較穩
    forceFallback: true,
    fallbackOnBody: true,
    ghostClass: 'opacity-40',
    onEnd(evt) {
      const { item, from, to, oldIndex, newIndex } = evt
      if (oldIndex === undefined || newIndex === undefined) return
      // Sortable 直接改了 DOM，先放回原位，交給 Vue 依資料重新排列，否則虛擬 DOM 會對不上
      item.remove()
      from.insertBefore(item, from.children[oldIndex] ?? null)
      if (from === to && oldIndex === newIndex) return
      const dayAttr = to.dataset.day
      emit('move', item.dataset.id!, dayAttr ? Number(dayAttr) : null, newIndex)
    },
  })
})

onBeforeUnmount(() => sortable?.destroy())
</script>

<template>
  <div class="relative">
    <div ref="el" :data-day="day ?? ''" class="min-h-14 space-y-2">
      <div v-for="s in props.spots" :key="s.id" :data-id="s.id">
        <SpotCard :spot="s" :currency="currency" :fx-rate="fxRate" @edit="emit('edit', s)" />
      </div>
    </div>
    <p
      v-if="!props.spots.length"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl border-2 border-dashed border-ink-200 text-sm text-ink-400 dark:border-ink-700"
    >
      {{ day === null ? '想去但還沒排的地方先放這裡' : '還沒有景點，可以從別天拖過來' }}
    </p>
  </div>
</template>
