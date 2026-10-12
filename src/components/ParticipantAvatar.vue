<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ id: string; name: string; size?: 'sm' | 'md' }>(), { size: 'md' })

const COLORS = ['#3fd0b6', '#38bdf8', '#f59e0b', '#f472b6', '#a78bfa', '#fb7185', '#34d399', '#facc15']

// 中文名字取最後一個字（小明、小華不會都顯示「小」），其他取第一個字母
const initial = computed(() => {
  const chars = [...props.name.trim()]
  if (!chars.length) return '?'
  return /\p{Script=Han}/u.test(chars[0]) ? chars.at(-1)! : chars[0].toUpperCase()
})

// 以 id 決定顏色，同一個人在每台裝置都一樣
const color = computed(() => {
  let h = 0
  for (const c of props.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-ink-950"
    :class="size === 'sm' ? 'size-6 text-[11px]' : 'size-9 text-sm'"
    :style="{ backgroundColor: color }"
    :title="name"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>
