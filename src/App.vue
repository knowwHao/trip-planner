<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import DemoBanner from '@/components/DemoBanner.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { isDemo } from '@/data'
import { useTripStore } from '@/stores/trip'

const route = useRoute()
const store = useTripStore()

// 「頁名｜旅程名稱」；不在旅程裡時只顯示網站名稱
watchEffect(() => {
  const page = route.meta.title
  const trip = route.path.startsWith('/trips/') ? store.trip?.name : undefined
  document.title = trip ? `${page ? `${page}｜` : ''}${trip}` : page && route.path !== '/' ? `${page}｜旅遊規劃` : '旅遊規劃'
})
</script>

<template>
  <DemoBanner v-if="isDemo" />
  <RouterView />
  <UpdatePrompt />
  <ToastHost />
  <ConfirmHost />
</template>
