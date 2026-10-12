<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import { Check, GripVertical, Navigation, Plus } from 'lucide-vue-next'
import type { Spot, SpotItem } from '@/types'
import { useTripStore } from '@/stores/trip'
import { googleMapsUrl } from '@/lib/maps'
import { itemWords } from '@/lib/category'
import { evenKeys, keyBetween } from '@/lib/order'
import { errorMessage, toast } from '@/composables/useToast'

const props = defineProps<{ spot: Spot; items: SpotItem[] }>()
const emit = defineEmits<{ edit: [item: SpotItem | null] }>()

const store = useTripStore()
const words = computed(() => itemWords(props.spot.category))

async function toggleDone(item: SpotItem) {
  try {
    await store.setItemDone(item.id, !item.done)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

const el = ref<HTMLElement>()
let sortable: Sortable | null = null

onMounted(() => {
  sortable = Sortable.create(el.value!, {
    // 每個行程各自一組，子項目不能拖到別的行程，也不會被外層的行程拖曳接走
    group: `items-${props.spot.id}`,
    handle: '.item-handle',
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    ghostClass: 'opacity-40',
    onEnd(evt) {
      const { item, from, oldIndex, newIndex } = evt
      if (oldIndex === undefined || newIndex === undefined) return
      // 與行程拖曳相同：先把 DOM 放回原位，交給 Vue 依資料重新排列
      item.remove()
      from.insertBefore(item, from.children[oldIndex] ?? null)
      if (oldIndex === newIndex) return
      void move(item.dataset.itemId!, newIndex)
    },
  })
})

onBeforeUnmount(() => sortable?.destroy())

async function move(id: string, index: number) {
  const rest = props.items.filter((i) => i.id !== id)
  const key = keyBetween(rest[index - 1]?.sort_key, rest[index]?.sort_key)
  let moves
  if (key !== null) {
    moves = [{ id, sort_key: key }]
  } else {
    const ids = rest.map((i) => i.id)
    ids.splice(index, 0, id)
    const keys = evenKeys(ids.length)
    moves = ids.map((iid, i) => ({ id: iid, sort_key: keys[i] }))
  }
  try {
    await store.moveItems(moves)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div class="mt-1 border-t border-ink-100 pt-1.5 dark:border-ink-800">
    <ul ref="el" class="space-y-0.5">
      <li v-for="item in items" :key="item.id" :data-item-id="item.id" class="flex items-center gap-1">
        <button
          type="button"
          class="item-handle flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-ink-300 active:cursor-grabbing dark:text-ink-600"
          aria-label="拖曳排序"
        >
          <GripVertical class="size-3.5" />
        </button>
        <button
          type="button"
          role="checkbox"
          :aria-checked="item.done"
          :aria-label="`${item.title}：${item.done ? words.done : '還沒去'}`"
          class="flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition"
          :class="item.done ? 'border-sea-500 bg-sea-500 text-white' : 'border-ink-300 dark:border-ink-600'"
          @click="toggleDone(item)"
        >
          <Check v-if="item.done" class="size-4" :stroke-width="3" />
        </button>
        <button type="button" class="min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left" @click="emit('edit', item)">
          <span class="block text-sm font-semibold break-words" :class="item.done && 'text-ink-400 line-through decoration-ink-300'">{{ item.title }}</span>
          <span v-if="item.note" class="block text-xs whitespace-pre-line text-ink-500 dark:text-ink-300">{{ item.note }}</span>
        </button>
        <a
          v-if="googleMapsUrl(item)"
          :href="googleMapsUrl(item)!"
          target="_blank"
          rel="noopener noreferrer"
          class="flex size-9 shrink-0 items-center justify-center rounded-xl text-sea-700 hover:bg-sea-100 dark:text-sea-300 dark:hover:bg-sea-400/10"
          :aria-label="`在 Google 地圖開啟 ${item.title}`"
        >
          <Navigation class="size-4" />
        </a>
      </li>
    </ul>
    <button type="button" class="mt-0.5 flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-sm font-semibold text-sea-700 dark:text-sea-300" @click="emit('edit', null)">
      <Plus class="size-4" />新增{{ words.noun }}
    </button>
  </div>
</template>
