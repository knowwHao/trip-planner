<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { KeyRound, LogOut, UserRound } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import type { PinResult } from '@/types'
import { useAccountStore } from '@/stores/account'
import { useSavedTrips } from '@/stores/saved'
import { NameTakenError } from '@/data/repository'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { isValidPin } from '@/lib/pin'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const account = useAccountStore()
const saved = useSavedTrips()

type Mode = 'login' | 'register' | 'change'
const mode = ref<Mode>('login')
const form = reactive({ name: '', pin: '', pin2: '', oldPin: '' })
const error = ref('')
const busy = ref(false)

function reset(next: Mode) {
  mode.value = next
  Object.assign(form, { pin: '', pin2: '', oldPin: '' })
  error.value = ''
}

watch(
  () => account.session,
  () => reset('login'),
)

// 改了輸入就收掉上一次的錯誤，免得改對了還看到錯誤訊息
watch(form, () => (error.value = ''))

function failText(res: Extract<PinResult, { ok: false }>) {
  if (res.lockedUntil) {
    const t = new Date(res.lockedUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `錯太多次，請在 ${t} 之後再試`
  }
  return res.remaining !== undefined ? `密碼錯誤，還可以再試 ${res.remaining} 次` : '名稱或密碼錯誤'
}

const nameError = computed(() => {
  const n = [...form.name.trim()].length
  return n < 2 ? '名稱至少 2 個字' : n > 20 ? '名稱最多 20 個字' : ''
})

async function submit() {
  error.value = ''
  if (mode.value !== 'change' && nameError.value) return (error.value = nameError.value)
  if (mode.value === 'change' && !form.oldPin) return (error.value = '請輸入目前的密碼')
  if (!isValidPin(form.pin)) return (error.value = '密碼要是 6～8 位數字')
  if (mode.value !== 'login' && form.pin !== form.pin2) return (error.value = '兩次輸入的密碼不一樣')
  busy.value = true
  try {
    if (mode.value === 'register') {
      await account.register(form.name.trim(), form.pin)
      toast.success('註冊好了，這台裝置的旅程已經存進帳號')
      emit('close')
    } else if (mode.value === 'login') {
      const res = await account.login(form.name.trim(), form.pin)
      if (!res.ok) return (error.value = failText(res))
      toast.success('登入了，旅程清單已經同步')
      emit('close')
    } else {
      const res = await account.changePin(form.oldPin, form.pin)
      if (!res.ok) return (error.value = failText(res))
      toast.success('密碼改好了，其他裝置要重新登入')
      reset('login')
    }
  } catch (e) {
    error.value = e instanceof NameTakenError ? e.message : errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function logout() {
  const ok = await confirmDialog({
    title: '登出？',
    message: '這台裝置的「我的旅程」會留著；之後再登入會重新同步。',
    confirmText: '登出',
  })
  if (ok) account.logout()
}
</script>

<template>
  <ModalSheet :open="open" title="帳號" @close="emit('close')">
    <div v-if="account.session && mode !== 'change'" class="space-y-4">
      <div class="flex items-center gap-3 rounded-2xl bg-ink-50 p-4 dark:bg-ink-800/60">
        <div class="flex size-11 items-center justify-center rounded-2xl bg-sea-400 text-ink-950"><UserRound class="size-5" /></div>
        <div class="min-w-0">
          <p class="truncate font-bold">{{ account.session.name }}</p>
          <p class="text-xs text-ink-400">{{ account.syncing ? '同步中…' : `已同步 ${saved.list.length} 趟旅程` }}</p>
        </div>
      </div>
      <p class="text-sm leading-relaxed text-ink-500 dark:text-ink-300">
        在別的裝置用同一個名稱和密碼登入，「我的旅程」就會出現；這台裝置加入或移除旅程也會自動同步。
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-outline" @click="reset('change')"><KeyRound class="size-4" />修改密碼</button>
        <button type="button" class="btn-ghost" @click="logout"><LogOut class="size-4" />登出</button>
      </div>
    </div>

    <form v-else id="account-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div v-if="!account.session" class="grid grid-cols-2 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="登入或註冊">
        <button
          v-for="m in [{ v: 'login', t: '登入' }, { v: 'register', t: '註冊' }] as const"
          :key="m.v"
          type="button"
          role="radio"
          :aria-checked="mode === m.v"
          class="rounded-xl py-2 text-sm font-bold transition"
          :class="mode === m.v ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
          @click="reset(m.v)"
        >
          {{ m.t }}
        </button>
      </div>
      <p v-if="mode === 'register'" class="text-sm leading-relaxed text-ink-500 dark:text-ink-300">
        不用 Email，自己取一個名稱、設 6～8 位數字密碼就好。登入後換手機也找得回「我的旅程」；旅伴不用註冊，照樣用連結開。
      </p>

      <div v-if="mode !== 'change'">
        <label class="label" for="acc-name">名稱</label>
        <input id="acc-name" v-model="form.name" class="input" maxlength="20" autocomplete="username" autocapitalize="off" />
      </div>
      <div v-else>
        <label class="label" for="acc-old">目前的密碼</label>
        <input id="acc-old" v-model="form.oldPin" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" />
      </div>
      <div>
        <label class="label" for="acc-pin">{{ mode === 'change' ? '新密碼' : '密碼' }}（6～8 位數字）</label>
        <input
          id="acc-pin"
          v-model="form.pin"
          class="input num"
          type="password"
          inputmode="numeric"
          maxlength="8"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />
      </div>
      <div v-if="mode !== 'login'">
        <label class="label" for="acc-pin2">再輸入一次</label>
        <input id="acc-pin2" v-model="form.pin2" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" />
      </div>
      <p v-if="error" class="text-sm text-rose-500" role="alert">{{ error }}</p>
      <p v-if="mode !== 'login'" class="text-xs leading-relaxed text-ink-400">
        沒有 Email 可以寄重設信，忘記密碼要請管理員到資料庫重設，請記好。連續錯 5 次會鎖 15 分鐘。
      </p>
    </form>

    <template v-if="!account.session || mode === 'change'" #footer>
      <button type="button" class="btn-outline flex-1" @click="mode === 'change' ? reset('login') : emit('close')">
        {{ mode === 'change' ? '返回' : '取消' }}
      </button>
      <button type="submit" form="account-form" class="btn-primary flex-1" :disabled="busy">
        {{ busy ? '處理中…' : mode === 'register' ? '註冊' : mode === 'login' ? '登入' : '修改密碼' }}
      </button>
    </template>
  </ModalSheet>
</template>
