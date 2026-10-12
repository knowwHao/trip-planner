<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle, Plus, Search } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import ParticipantAvatar from './ParticipantAvatar.vue'
import type { AccountInfo, Id } from '@/types'
import { useAccountStore } from '@/stores/account'
import { errorMessage } from '@/composables/useToast'

const props = defineProps<{
  open: boolean
  title: string
  /** 已經是成員的帳號，顯示但不能選 */
  joined: Id[]
  hint?: string
}>()
const emit = defineEmits<{ close: []; pick: [account: AccountInfo] }>()

const account = useAccountStore()
const query = ref('')
const loading = ref(false)
const error = ref('')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await account.loadAccounts()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    void refresh()
  },
  { immediate: true },
)

const joinedSet = computed(() => new Set(props.joined))
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  return account.accounts.filter((a) => !q || a.name.toLowerCase().includes(q))
})
</script>

<template>
  <ModalSheet :open="open" :title="title" top @close="emit('close')">
    <p v-if="hint" class="mb-3 text-sm leading-relaxed text-ink-500 dark:text-ink-300">{{ hint }}</p>
    <div class="relative mb-3">
      <Search class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-300" />
      <label for="member-search" class="sr-only">搜尋名稱</label>
      <input id="member-search" v-model="query" class="input pl-10" placeholder="搜尋名稱" autocomplete="off" />
    </div>
    <div v-if="loading && !account.accounts.length" class="flex items-center justify-center gap-2 py-8 text-sm text-ink-400" role="status">
      <LoaderCircle class="size-5 animate-spin" />讀取中…
    </div>
    <p v-else-if="error" class="py-6 text-center text-sm text-rose-500" role="alert">{{ error }}</p>
    <p v-else-if="!list.length" class="py-6 text-center text-sm text-ink-400">
      {{ query.trim() ? '找不到這個名稱，請旅伴先註冊' : '還沒有其他人註冊' }}
    </p>
    <ul v-else class="-mx-2 space-y-0.5">
      <li v-for="a in list" :key="a.id">
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition enabled:hover:bg-ink-50 disabled:opacity-60 dark:enabled:hover:bg-ink-800"
          :disabled="joinedSet.has(a.id)"
          @click="emit('pick', a)"
        >
          <ParticipantAvatar :id="a.id" :name="a.name" />
          <span class="min-w-0 flex-1 truncate font-semibold">{{ a.name }}</span>
          <span v-if="joinedSet.has(a.id)" class="shrink-0 text-xs text-ink-400">已在旅程裡</span>
          <span v-else class="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-sea-700 dark:text-sea-300"><Plus class="size-4" />加入</span>
        </button>
      </li>
    </ul>
  </ModalSheet>
</template>
