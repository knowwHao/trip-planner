<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import type { Id } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { errorMessage, toast } from '@/composables/useToast'
import { todayYmd } from '@/lib/format'
import { MAX_AMOUNT, parseAmount } from '@/lib/money'

const props = defineProps<{ open: boolean; preset?: { from: Id; to: Id; amount: number } | null }>()
const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const people = computed(() => store.participants)
const form = reactive({ from: '' as Id, to: '' as Id, amount: '', date: '', note: '' })
const touched = ref(false)
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      from: props.preset?.from ?? people.value[0]?.id ?? '',
      to: props.preset?.to ?? people.value[1]?.id ?? '',
      amount: props.preset ? String(props.preset.amount) : '',
      date: todayYmd(),
      note: '',
    })
    touched.value = false
  },
  { immediate: true },
)

const amount = computed(() => parseAmount(form.amount, 'TWD'))
const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.from || !form.to) e.who = '請選擇轉帳的兩個人'
  else if (form.from === form.to) e.who = '不能轉給自己'
  if (amount.value === null) e.amount = '請輸入金額'
  else if (!(Number.isInteger(amount.value) && amount.value > 0 && amount.value <= MAX_AMOUNT)) e.amount = '請輸入正整數'
  if (!form.date) e.date = '請選擇日期'
  return e
})

async function submit() {
  touched.value = true
  if (Object.keys(errors.value).length) return
  saving.value = true
  try {
    await store.mutate(() =>
      repo.createTransfer({ from_id: form.from, to_id: form.to, amount: amount.value!, paid_on: form.date, note: form.note.trim() }),
    )
    toast.success('已記下這筆轉帳')
    emit('close')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="open" title="記一筆轉帳" @close="emit('close')">
    <form id="transfer-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div class="min-w-0">
          <label class="label" for="tr-from">誰轉出</label>
          <select id="tr-from" v-model="form.from" class="input">
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <ArrowRight class="mb-3 size-5 text-ink-300" />
        <div class="min-w-0">
          <label class="label" for="tr-to">轉給誰</label>
          <select id="tr-to" v-model="form.to" class="input">
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>
      <p v-if="touched && errors.who" class="-mt-2 text-xs text-rose-500">{{ errors.who }}</p>
      <div class="grid grid-cols-2 gap-3">
        <div class="min-w-0">
          <label class="label" for="tr-amount">金額（新台幣）</label>
          <input id="tr-amount" v-model="form.amount" class="input num" inputmode="numeric" autocomplete="off" />
        </div>
        <div class="min-w-0">
          <label class="label" for="tr-date">日期</label>
          <input id="tr-date" v-model="form.date" type="date" class="input" />
        </div>
      </div>
      <p v-if="touched && (errors.amount || errors.date)" class="-mt-2 text-xs text-rose-500">{{ errors.amount || errors.date }}</p>
      <div>
        <label class="label" for="tr-note">備註（選填）</label>
        <input id="tr-note" v-model="form.note" class="input" maxlength="200" placeholder="例如：LINE Pay、現金" autocomplete="off" />
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="transfer-form" class="btn-primary flex-1" :disabled="saving">{{ saving ? '儲存中…' : '記下來' }}</button>
    </template>
  </ModalSheet>
</template>
