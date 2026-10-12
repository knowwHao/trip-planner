<script setup lang="ts">
import { RefreshCw, TriangleAlert } from 'lucide-vue-next'

defineProps<{ gone?: boolean }>()
const emit = defineEmits<{ reload: [] }>()
</script>

<template>
  <div
    class="mb-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
    role="status"
  >
    <TriangleAlert class="mt-0.5 size-4 shrink-0" />
    <p class="min-w-0 flex-1">
      {{ gone ? '這筆剛被別人刪除了，存檔會失敗。' : '別人剛改過這筆，存檔時會問你要不要覆蓋。' }}
    </p>
    <button v-if="!gone" type="button" class="-my-1 inline-flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 font-semibold hover:bg-amber-100 dark:hover:bg-amber-400/15" @click="emit('reload')">
      <RefreshCw class="size-3.5" />看最新
    </button>
  </div>
</template>
