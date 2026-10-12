<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import { useConfirmState } from '@/composables/useConfirm'

const { pending, settle } = useConfirmState()
const open = computed(() => !!pending.value)
</script>

<template>
  <ModalSheet :open="open" :title="pending?.title ?? ''" top @close="settle(false)">
    <div class="flex gap-3">
      <div
        v-if="pending?.danger"
        class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
      >
        <TriangleAlert class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <p v-if="pending?.message" class="text-sm leading-relaxed text-ink-500 dark:text-ink-300">{{ pending.message }}</p>
        <ul v-if="pending?.details?.length" class="mt-3 space-y-1.5">
          <li
            v-for="(d, i) in pending.details"
            :key="i"
            class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
          >
            {{ d }}
          </li>
        </ul>
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="settle(false)">{{ pending?.cancelText ?? '取消' }}</button>
      <button type="button" class="flex-1" :class="pending?.danger ? 'btn-danger' : 'btn-primary'" @click="settle(true)">
        {{ pending?.confirmText ?? '確定' }}
      </button>
    </template>
  </ModalSheet>
</template>
