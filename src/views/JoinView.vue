<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { House, Link2Off, LoaderCircle, RefreshCw } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import { useTripStore } from '@/stores/trip'
import { errorMessage } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const store = useTripStore()
const state = ref<'checking' | 'invalid' | 'error'>('checking')
const errorText = ref('')

// 非 ASCII 字元放進 HTTP header 會讓 fetch 直接丟錯，格式不對就當作失效連結
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

async function join() {
  const token = String(route.params.token)
  if (!TOKEN_RE.test(token)) {
    state.value = 'invalid'
    return
  }
  state.value = 'checking'
  try {
    const id = await store.join(token)
    if (id) await router.replace(`/trips/${id}`)
    else state.value = 'invalid'
  } catch (e) {
    errorText.value = errorMessage(e)
    state.value = 'error'
  }
}

onMounted(join)
</script>

<template>
  <main class="mx-auto flex min-h-[80dvh] max-w-3xl items-center justify-center px-4">
    <div v-if="state === 'checking'" class="flex items-center gap-2 text-sm text-ink-400" role="status">
      <LoaderCircle class="size-5 animate-spin" />開啟旅程中…
    </div>
    <EmptyState
      v-else-if="state === 'invalid'"
      :icon="Link2Off"
      title="這個旅程連結已失效"
      description="連結可能打錯，或已經被重新產生過。請跟旅伴要最新的旅程連結。"
    >
      <RouterLink to="/" class="btn-primary"><House class="size-4" />回我的旅程</RouterLink>
    </EmptyState>
    <EmptyState v-else :icon="RefreshCw" title="暫時讀不到資料" :description="`請確認網路後再試一次（${errorText}）`">
      <div class="flex flex-wrap justify-center gap-2">
        <button type="button" class="btn-primary" @click="join"><RefreshCw class="size-4" />重新載入</button>
        <RouterLink to="/" class="btn-outline"><House class="size-4" />回我的旅程</RouterLink>
      </div>
    </EmptyState>
  </main>
</template>
