<script setup lang="ts">
import { CircleAlert, CircleCheck, Info } from 'lucide-vue-next'
import { useToasts } from '@/composables/useToast'

const { toasts, dismiss } = useToasts()
const icons = { success: CircleCheck, error: CircleAlert, info: Info }
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="animate-toast-in"
      leave-active-class="transition duration-200"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-for="t in toasts"
        :key="t.id"
        type="button"
        class="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lift"
        :class="{
          'bg-ink-900 text-white dark:bg-ink-700': t.kind !== 'error',
          'bg-rose-600 text-white': t.kind === 'error',
        }"
        @click="dismiss(t.id)"
      >
        <component
          :is="icons[t.kind]"
          class="mt-0.5 size-4 shrink-0"
          :class="t.kind === 'success' ? 'text-sea-400' : ''"
        />
        <span>{{ t.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
