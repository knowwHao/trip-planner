<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

defineProps<{ title: string; subtitle?: string; back?: string }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <RouterLink
        v-if="back"
        :to="back"
        class="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
      >
        <ArrowLeft class="size-4" />返回
      </RouterLink>
      <h1 class="truncate text-2xl font-black tracking-tight sm:text-3xl">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-ink-400 dark:text-ink-300">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="flex items-center gap-2"><slot /></div>
  </div>
</template>
