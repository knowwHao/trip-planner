<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { House, MapPinOff } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <main class="mx-auto flex min-h-[80dvh] max-w-3xl items-center justify-center px-4">
    <EmptyState :icon="MapPinOff" title="找不到這個頁面" description="網址可能打錯了">
      <RouterLink to="/" class="btn-primary"><House class="size-4" />回我的旅程</RouterLink>
    </EmptyState>
  </main>
</template>
