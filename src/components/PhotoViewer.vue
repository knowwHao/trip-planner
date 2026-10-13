<script setup lang="ts">
import { computed, onBeforeUnmount, toRef, watch } from 'vue'
import { LoaderCircle, X } from 'lucide-vue-next'
import type { Id } from '@/types'
import { usePhoto } from '@/composables/usePhoto'

/** 全螢幕看照片；photoId 是已存的照片，src 是還沒存的（剛選的） */
const props = defineProps<{ photoId?: Id | null; src?: string | null; alt: string }>()
const emit = defineEmits<{ close: [] }>()

const stored = usePhoto(toRef(props, 'photoId'), 'full')
const url = computed(() => props.src || stored.value)
const open = computed(() => !!(props.photoId || props.src))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(open, (v) => (v ? window.addEventListener('keydown', onKey) : window.removeEventListener('keydown', onKey)), { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/90 p-4" role="dialog" aria-modal="true" :aria-label="alt" @click="emit('close')">
      <img v-if="url" :src="url" :alt="alt" class="max-h-full max-w-full rounded-2xl object-contain" />
      <LoaderCircle v-else class="size-8 animate-spin text-white" />
      <button type="button" class="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label="關閉" @click.stop="emit('close')">
        <X class="size-5" />
      </button>
    </div>
  </Teleport>
</template>
