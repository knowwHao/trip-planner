<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { KeyRound, LogOut, UserRound } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import { useAccountStore } from '@/stores/account'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { isValidPin, pinFailText } from '@/lib/pin'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const account = useAccountStore()
const changing = ref(false)
const form = reactive({ oldPin: '', pin: '', pin2: '' })
const error = ref('')
const busy = ref(false)

watch(
  () => props.open,
  () => {
    changing.value = false
    Object.assign(form, { oldPin: '', pin: '', pin2: '' })
    error.value = ''
  },
)
watch(form, () => (error.value = ''))

async function submit() {
  if (!form.oldPin) return (error.value = '請輸入目前的密碼')
  if (!isValidPin(form.pin)) return (error.value = '新密碼要是 6～8 位數字')
  if (form.pin !== form.pin2) return (error.value = '兩次輸入的密碼不一樣')
  busy.value = true
  try {
    const res = await account.changePin(form.oldPin, form.pin)
    if (!res.ok) return (error.value = pinFailText(res))
    toast.success('密碼改好了，其他裝置要重新登入')
    emit('close')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function logout() {
  const ok = await confirmDialog({ title: '登出？', message: '這台裝置要重新輸入名稱和密碼才能再看到旅程。', confirmText: '登出' })
  if (!ok) return
  emit('close')
  account.logout()
}
</script>

<template>
  <ModalSheet :open="open" :title="changing ? '修改密碼' : '帳號'" @close="emit('close')">
    <div v-if="!changing" class="space-y-4">
      <div class="flex items-center gap-3 rounded-2xl bg-ink-50 p-4 dark:bg-ink-800/60">
        <div class="flex size-11 items-center justify-center rounded-2xl bg-sea-400 text-ink-950"><UserRound class="size-5" /></div>
        <p class="min-w-0 truncate font-bold">{{ account.session?.name }}</p>
      </div>
      <p class="text-sm leading-relaxed text-ink-500 dark:text-ink-300">在別的裝置用同一個名稱和密碼登入，就能看到你參加的旅程。</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-outline" @click="changing = true"><KeyRound class="size-4" />修改密碼</button>
        <button type="button" class="btn-ghost" @click="logout"><LogOut class="size-4" />登出</button>
      </div>
    </div>

    <form v-else id="pin-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="acc-old">目前的密碼</label>
        <input id="acc-old" v-model="form.oldPin" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" />
      </div>
      <div>
        <label class="label" for="acc-pin">新密碼（6～8 位數字）</label>
        <input id="acc-pin" v-model="form.pin" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" />
      </div>
      <div>
        <label class="label" for="acc-pin2">再輸入一次</label>
        <input id="acc-pin2" v-model="form.pin2" class="input num" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" />
      </div>
      <p v-if="error" class="text-sm text-rose-500" role="alert">{{ error }}</p>
      <p class="text-xs leading-relaxed text-ink-400">改好之後，其他已登入的裝置要用新密碼重新登入。</p>
    </form>

    <template v-if="changing" #footer>
      <button type="button" class="btn-outline flex-1" @click="changing = false">返回</button>
      <button type="submit" form="pin-form" class="btn-primary flex-1" :disabled="busy">{{ busy ? '處理中…' : '修改密碼' }}</button>
    </template>
  </ModalSheet>
</template>
