<script setup lang="ts">
import { toRef } from 'vue'
import { ImageIcon } from 'lucide-vue-next'
import type { Id } from '@/types'
import { usePhoto } from '@/composables/usePhoto'

const props = defineProps<{ photoId: Id; alt: string }>()
const src = usePhoto(toRef(props, 'photoId'), 'thumb')
</script>

<template>
  <span class="flex items-center justify-center overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
    <img v-if="src" :src="src" :alt="alt" class="size-full object-cover" />
    <ImageIcon v-else class="size-4 text-ink-300" />
  </span>
</template>
