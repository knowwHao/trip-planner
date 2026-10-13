<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import ParticipantAvatar from './ParticipantAvatar.vue'
import type { Expense, Spot, SpotItem } from '@/types'
import { useTripStore } from '@/stores/trip'
import { formatMoney } from '@/lib/money'
import { expenseTwd } from '@/lib/split'

/** 有 item 時只列記在這個子項目的旅費 */
const props = defineProps<{ open: boolean; spot: Spot | null; item?: SpotItem | null }>()
const emit = defineEmits<{ close: []; edit: [expense: Expense | null] }>()

const store = useTripStore()
const trip = computed(() => store.trip!)
const list = computed(() =>
  props.item ? (store.expensesByItem.get(props.item.id) ?? []) : props.spot ? (store.expensesBySpot.get(props.spot.id) ?? []) : [],
)
const itemTitle = (id: string | null) => (id ? (store.data?.items.find((i) => i.id === id)?.title ?? '') : '')
const total = computed(() => list.value.reduce((s, e) => s + expenseTwd(e, trip.value), 0))
</script>

<template>
  <ModalSheet :open="open" :title="item ? `${item.title} 的旅費` : spot ? `${spot.title} 的旅費` : '旅費'" @close="emit('close')">
    <p v-if="list.length" class="num mb-3 text-sm text-ink-500 dark:text-ink-300">{{ list.length }} 筆，共 {{ formatMoney(total) }}</p>
    <div v-if="list.length" class="divide-y divide-ink-100 dark:divide-ink-800">
      <button
        v-for="e in list"
        :key="e.id"
        type="button"
        class="flex w-full items-center gap-3 py-2.5 text-left"
        @click="emit('edit', e)"
      >
        <ParticipantAvatar :id="e.payer_id" :name="store.participantName(e.payer_id)" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{{ e.title }}</p>
          <p class="truncate text-xs text-ink-400">
            {{ store.participantName(e.payer_id) }} 付<template v-if="!item && itemTitle(e.item_id)">・{{ itemTitle(e.item_id) }}</template>
          </p>
        </div>
        <div class="num shrink-0 text-right text-sm">
          <p class="font-bold">{{ formatMoney(e.amount, e.currency) }}</p>
          <p v-if="e.currency !== 'TWD'" class="text-xs text-ink-400">{{ e.twd_amount !== null ? '實扣' : '≈' }} {{ formatMoney(expenseTwd(e, trip)) }}</p>
        </div>
      </button>
    </div>
    <p v-else class="py-4 text-center text-sm text-ink-400">{{ item ? '這裡還沒有旅費' : '這個行程還沒有旅費' }}</p>
    <p v-if="!store.participants.length" class="mt-2 text-sm text-ink-400">
      記旅費前要先<RouterLink :to="`/trips/${trip.id}/settings`" class="font-semibold text-sea-700 dark:text-sea-300">新增旅伴</RouterLink>
    </p>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">關閉</button>
      <button type="button" class="btn-primary flex-1" :disabled="!store.participants.length" @click="emit('edit', null)">
        <Plus class="size-4" />記一筆
      </button>
    </template>
  </ModalSheet>
</template>
