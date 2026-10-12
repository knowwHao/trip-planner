<script setup lang="ts">
import { ref } from 'vue'
import { RefreshCw, X } from 'lucide-vue-next'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return
    // 加到主畫面的 App 多半是從背景喚回而不是重新載入，不會觸發更新檢查，所以切回前景時自己檢查
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) r.update().catch(() => {})
    })
  },
})
const updating = ref(false)

async function update() {
  updating.value = true
  await updateServiceWorker(true)
}
</script>

<template>
  <Transition enter-active-class="animate-toast-in" leave-active-class="transition duration-200" leave-to-class="opacity-0 translate-y-2">
    <div
      v-if="needRefresh"
      class="fixed inset-x-0 bottom-24 z-[55] flex justify-center px-4 lg:bottom-8"
      role="status"
    >
      <div class="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink-900 py-2.5 pr-2 pl-4 text-sm text-white shadow-lift dark:bg-ink-700">
        <RefreshCw class="size-4 shrink-0 text-sea-400" />
        <p class="min-w-0 flex-1 font-medium">有新版本可以用了</p>
        <button
          type="button"
          class="shrink-0 rounded-xl bg-sea-400 px-3 py-1.5 text-xs font-bold text-ink-950 disabled:opacity-60"
          :disabled="updating"
          @click="update"
        >
          {{ updating ? '更新中…' : '立即更新' }}
        </button>
        <button type="button" class="shrink-0 rounded-xl p-1.5 text-ink-300 hover:text-white" aria-label="稍後再說" @click="needRefresh = false">
          <X class="size-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>
