<script setup lang="ts">
import { onMounted, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import DemoBanner from '@/components/DemoBanner.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import AuthView from '@/views/AuthView.vue'
import { isDemo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { useAccountStore } from '@/stores/account'

const route = useRoute()
const store = useTripStore()
const account = useAccountStore()

// 這台裝置的登入可能已在別的裝置改密碼時失效
onMounted(() => void account.verify())

// 「頁名｜旅程名稱」；不在旅程裡時只顯示網站名稱
watchEffect(() => {
  const page = route.meta.title
  if (!account.session) {
    document.title = '登入｜旅遊規劃'
    return
  }
  const trip = route.path.startsWith('/trips/') ? store.trip?.name : undefined
  document.title = trip ? `${page ? `${page}｜` : ''}${trip}` : page && route.path !== '/' ? `${page}｜旅遊規劃` : '旅遊規劃'
})
</script>

<template>
  <DemoBanner v-if="isDemo" />
  <!-- 沒登入時一律先登入，網址不變，登入後直接回到原本要開的頁面 -->
  <RouterView v-if="account.session" />
  <AuthView v-else />
  <UpdatePrompt />
  <ToastHost />
  <ConfirmHost />
</template>
