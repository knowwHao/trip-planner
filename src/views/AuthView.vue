<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Check, LoaderCircle } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { repo } from '@/data'
import { NameTakenError } from '@/data/repository'
import { useAccountStore } from '@/stores/account'
import { errorMessage, toast } from '@/composables/useToast'
import { isValidPin, pinFailText } from '@/lib/pin'

const account = useAccountStore()

type Mode = 'login' | 'register'
const mode = ref<Mode>('login')
const form = reactive({ name: '', pin: '', pin2: '' })
const error = ref('')
const busy = ref(false)

function switchMode(next: Mode) {
  mode.value = next
  Object.assign(form, { pin: '', pin2: '' })
  error.value = ''
}

// 改了輸入就收掉上一次的錯誤，免得改對了還看到錯誤訊息
watch(form, () => (error.value = ''))

const nameError = computed(() => {
  const n = [...form.name.trim()].length
  return n < 2 ? '名稱至少 2 個字' : n > 20 ? '名稱最多 20 個字' : ''
})

// ---------- 註冊時即時檢查名稱 ----------
type NameState = 'idle' | 'checking' | 'ok' | 'taken'
const nameState = ref<NameState>('idle')
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

watch([() => form.name, mode], () => {
  clearTimeout(timer)
  const my = ++seq
  if (mode.value !== 'register' || nameError.value) {
    nameState.value = 'idle'
    return
  }
  nameState.value = 'checking'
  timer = setTimeout(async () => {
    try {
      const ok = await repo.nameAvailable(form.name.trim())
      if (my === seq) nameState.value = ok ? 'ok' : 'taken'
    } catch {
      // 連不上時不擋，送出時伺服器會再檢查一次
      if (my === seq) nameState.value = 'idle'
    }
  }, 350)
})

async function submit() {
  error.value = ''
  if (nameError.value) return (error.value = nameError.value)
  if (mode.value === 'register' && nameState.value === 'taken') return (error.value = new NameTakenError().message)
  if (!isValidPin(form.pin)) return (error.value = '密碼要是 6～8 位數字')
  if (mode.value === 'register' && form.pin !== form.pin2) return (error.value = '兩次輸入的密碼不一樣')
  busy.value = true
  try {
    if (mode.value === 'register') {
      await account.register(form.name.trim(), form.pin)
      toast.success(`歡迎，${form.name.trim()}！`)
    } else {
      const res = await account.login(form.name.trim(), form.pin)
      if (!res.ok) error.value = pinFailText(res)
    }
  } catch (e) {
    if (e instanceof NameTakenError) nameState.value = 'taken'
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-[90dvh] max-w-md flex-col justify-center px-4 py-10">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <BrandMark :size="44" />
        <div class="min-w-0">
          <h1 class="text-xl font-black tracking-tight">旅遊規劃</h1>
          <p class="text-sm text-ink-400 dark:text-ink-300">和旅伴一起排行程、記旅費</p>
        </div>
      </div>
      <ThemeToggle class="shrink-0" />
    </div>

    <form class="card space-y-4 p-5" novalidate @submit.prevent="submit">
      <div class="grid grid-cols-2 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="登入或註冊">
        <button
          v-for="m in [{ v: 'login', t: '登入' }, { v: 'register', t: '註冊' }] as const"
          :key="m.v"
          type="button"
          role="radio"
          :aria-checked="mode === m.v"
          class="rounded-xl py-2 text-sm font-bold transition"
          :class="mode === m.v ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
          @click="switchMode(m.v)"
        >
          {{ m.t }}
        </button>
      </div>
      <p v-if="mode === 'register'" class="text-sm leading-relaxed text-ink-500 dark:text-ink-300">
        不用 Email，取一個旅伴認得出來的名稱、設 6～8 位數字密碼就好。旅伴會用這個名稱把你加進旅程。
      </p>

      <div>
        <label class="label" for="auth-name">名稱</label>
        <input
          id="auth-name"
          v-model="form.name"
          class="input"
          maxlength="20"
          autocomplete="username"
          autocapitalize="off"
          :aria-invalid="mode === 'register' && nameState === 'taken'"
          aria-describedby="auth-name-state"
        />
        <p id="auth-name-state" class="mt-1 min-h-4 text-xs" aria-live="polite">
          <template v-if="mode === 'register' && form.name.trim()">
            <span v-if="nameError" class="text-ink-400">{{ nameError }}</span>
            <span v-else-if="nameState === 'checking'" class="inline-flex items-center gap-1 text-ink-400"><LoaderCircle class="size-3 animate-spin" />檢查中…</span>
            <span v-else-if="nameState === 'ok'" class="inline-flex items-center gap-1 font-semibold text-sea-700 dark:text-sea-300"><Check class="size-3.5" />這個名稱可以用</span>
            <span v-else-if="nameState === 'taken'" class="font-semibold text-rose-500">這個名稱已經有人用了，換一個試試</span>
          </template>
        </p>
      </div>
      <div class="-mt-3">
        <label class="label" for="auth-pin">密碼（6～8 位數字）</label>
        <input
          id="auth-pin"
          v-model="form.pin"
          class="input num"
          type="password"
          inputmode="numeric"
          maxlength="8"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />
      </div>
      <div v-if="mode === 'register'">
        <label class="label" for="auth-pin2">再輸入一次</label>
        <input id="auth-pin2" v-model="form.pin2" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" />
      </div>
      <p v-if="error" class="text-sm text-rose-500" role="alert">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="busy || (mode === 'register' && nameState === 'taken')">
        {{ busy ? '處理中…' : mode === 'register' ? '註冊' : '登入' }}
      </button>
      <p v-if="mode === 'register'" class="text-xs leading-relaxed text-ink-400">
        沒有 Email 可以寄重設信，忘記密碼要請管理員到資料庫重設，請記好。連續錯 5 次會鎖 15 分鐘。
      </p>
    </form>
    <p class="mt-4 px-1 text-xs leading-relaxed text-ink-400">
      登入後只看得到自己參加的旅程；這台裝置會記住登入，直到登出或在別的裝置改密碼。
    </p>
  </main>
</template>
