<script setup lang="ts">
import { computed } from 'vue'
import { Check, ReceiptText } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import WishThumb from './WishThumb.vue'
import type { Spot, WishItem } from '@/types'
import { useTripStore } from '@/stores/trip'
import { errorMessage, toast } from '@/composables/useToast'
import { wishLabel, wishStatusLabel } from '@/lib/wish'

const props = defineProps<{ open: boolean; spot: Spot | null }>()
const emit = defineEmits<{ close: []; edit: [item: WishItem]; record: [] }>()

const store = useTripStore()
const list = computed(() => (props.spot ? (store.wishBySpot.get(props.spot.id) ?? []) : []))
const itemTitle = (id: string | null) => (id ? (store.data?.items.find((i) => i.id === id)?.title ?? '') : '')
const canRecord = computed(() => list.value.some((w) => w.status !== 'unavailable' && !store.wishRecords.has(w.id)))

async function toggle(w: WishItem) {
  try {
    await store.setWishStatus(w.id, w.status === 'bought' ? 'todo' : 'bought')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="spot ? `在${spot.title}要買的代購` : '代購'" @close="emit('close')">
    <p class="mb-2 text-xs text-ink-400">只有你看得到。打勾是已買，點品項可以編輯。</p>
    <ul class="divide-y divide-ink-100 dark:divide-ink-800">
      <li v-for="w in list" :key="w.id" class="flex items-center gap-2.5 py-2">
        <button
          type="button"
          role="checkbox"
          :aria-checked="w.status === 'bought'"
          :aria-label="`${wishLabel(w)}：${wishStatusLabel(w.status)}`"
          class="flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition"
          :class="w.status === 'bought' ? 'border-sea-500 bg-sea-500 text-white' : 'border-ink-300 dark:border-ink-600'"
          :disabled="w.status === 'unavailable'"
          @click="toggle(w)"
        >
          <Check v-if="w.status === 'bought'" class="size-4" :stroke-width="3" />
        </button>
        <WishThumb v-if="store.wishPhotosByItem.get(w.id)?.length" :photo-id="store.wishPhotosByItem.get(w.id)![0].id" :alt="w.title" class="size-10 shrink-0" />
        <button type="button" class="min-w-0 flex-1 text-left" @click="emit('edit', w)">
          <span class="block truncate text-sm font-semibold" :class="w.status !== 'todo' && 'text-ink-400'">{{ wishLabel(w) }}</span>
          <span class="block truncate text-xs text-ink-400">
            幫{{ w.recipient }}買<template v-if="itemTitle(w.item_id)">・在{{ itemTitle(w.item_id) }}</template><template v-if="w.status === 'unavailable'">・買不到</template><template v-if="store.wishRecords.has(w.id)">・已記帳</template>
          </span>
        </button>
      </li>
    </ul>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">關閉</button>
      <button type="button" class="btn-primary flex-1" :disabled="!canRecord" @click="emit('record')"><ReceiptText class="size-4" />記一筆旅費</button>
    </template>
  </ModalSheet>
</template>
