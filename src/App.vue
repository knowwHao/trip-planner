<script setup lang="ts">
import { onMounted, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import DemoBanner from '@/components/DemoBanner.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { isDemo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { useAccountStore } from '@/stores/account'

const route = useRoute()
const store = useTripStore()
const account = useAccountStore()

// 登入過的裝置每次開啟都和帳號同步一次，別的裝置加入的旅程才會出現
onMounted(() => void account.sync())

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
