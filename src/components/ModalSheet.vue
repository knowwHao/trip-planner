<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean; dismissible?: boolean; top?: boolean }>(), {
  dismissible: true,
})
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.dismissible) emit('close')
}

watch(
  () => props.open,
  (open) => {
    document.documentElement.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.documentElement.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" :class="top ? 'z-[55]' : 'z-50'">
        <div class="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" @click="dismissible && emit('close')" />
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="relative flex max-h-[92dvh] w-full animate-pop flex-col rounded-t-[2rem] bg-white shadow-lift sm:rounded-[2rem] dark:bg-ink-900"
          :class="wide ? 'sm:max-w-2xl' : 'sm:max-w-md'"
        >
          <div class="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink-200 sm:hidden dark:bg-ink-700" />
          <header class="flex items-center justify-between gap-3 px-6 pt-4 pb-2 sm:pt-6">
            <h2 class="text-lg font-bold">{{ title }}</h2>
            <button v-if="dismissible" type="button" class="icon-btn -mr-2" aria-label="關閉" @click="emit('close')">
              <X class="size-5" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="safe-bottom flex gap-2 border-t border-ink-100 px-6 pt-4 pb-4 sm:pb-6 dark:border-ink-800"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
