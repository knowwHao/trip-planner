<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon: Component; title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-10 text-center">
    <div class="relative mb-4">
      <div class="absolute inset-0 -z-0 scale-150 rounded-full bg-sea-400/20 blur-2xl dark:bg-sea-400/10" />
      <div
        class="relative flex size-16 items-center justify-center rounded-3xl bg-ink-900 text-sea-400 shadow-lift dark:bg-ink-800"
      >
        <component :is="icon" class="size-8" :stroke-width="1.75" />
      </div>
    </div>
    <p class="text-base font-bold">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-xs text-sm text-ink-400 dark:text-ink-300">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
