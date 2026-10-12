<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import type { Trip, TripInput } from '@/types'
import { CURRENCIES, currencyInfo, formatMoney, toTwd } from '@/lib/money'
import { addDays, diffDays, MAX_TRIP_DAYS, todayYmd } from '@/lib/format'

const props = defineProps<{
  open: boolean
  /** 有值是編輯，沒有是建立新旅程 */
  trip?: Trip | null
  /** 編輯時 store 裡最新的旅程，用來提示別人剛改過 */
  latest?: Trip | null
  saving?: boolean
}>()
const emit = defineEmits<{
  close: []
  submit: [input: TripInput, participants: string[]]
}>()

const form = reactive({ name: '', start: '', end: '', currency: 'TWD', rate: '1', people: '' })
const touched = ref(false)
let prevStart = ''

function fill(t: Trip | null | undefined) {
  const start = addDays(todayYmd(), 14)
  Object.assign(form, {
    name: t?.name ?? '',
    start: t?.start_date ?? start,
    end: t?.end_date ?? addDays(start, 2),
    currency: t?.currency ?? 'TWD',
    rate: String(t?.fx_rate ?? 1),
    people: '',
  })
  prevStart = form.start
  touched.value = false
}

watch(
  () => props.open,
  (open) => open && fill(props.trip),
  { immediate: true },
)

const stale = computed(() => !!props.trip && !!props.latest && props.latest.version !== props.trip.version)
const rate = computed(() => (form.currency === 'TWD' ? 1 : Number(form.rate)))
const days = computed(() => (form.start && form.end ? diffDays(form.start, form.end) + 1 : 0))
const people = computed(() => [...new Set(form.people.split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean))])

const errors = computed(() => {
  const e: Record<string, string> = {}
  const name = form.name.trim()
  if (!name) e.name = '請輸入旅程名稱'
  else if ([...name].length > 40) e.name = '最多 40 個字'
  if (!form.start || !form.end) e.dates = '請選擇日期'
  else if (days.value < 1) e.dates = '回程日不能早於出發日'
  else if (days.value > MAX_TRIP_DAYS) e.dates = `最多 ${MAX_TRIP_DAYS} 天`
  if (!(rate.value > 0 && rate.value < 100000)) e.rate = '請輸入大於 0 的匯率'
  if (people.value.some((p) => [...p].length > 20)) e.people = '每個名字最多 20 個字'
  if (people.value.length > 50) e.people = '最多 50 位'
  return e
})

function submit() {
  touched.value = true
  if (Object.keys(errors.value).length) return
  emit(
    'submit',
    { name: form.name.trim(), start_date: form.start, end_date: form.end, currency: form.currency, fx_rate: rate.value },
    people.value,
  )
}

// 出發日改了，回程日跟著挪，維持原本的天數
function onStartChange() {
  if (prevStart && form.start && form.end) form.end = addDays(form.end, diffDays(prevStart, form.start))
  prevStart = form.start
}
</script>

<template>
  <ModalSheet :open="open" :title="trip ? '編輯旅程資訊' : '建立新旅程'" @close="emit('close')">
    <StaleNotice v-if="stale" @reload="fill(latest)" />
    <form id="trip-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="trip-name">旅程名稱</label>
        <input id="trip-name" v-model="form.name" class="input" maxlength="40" placeholder="例如：東京五天四夜" autocomplete="off" />
        <p v-if="touched && errors.name" class="mt-1 text-xs text-rose-500">{{ errors.name }}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="min-w-0">
          <label class="label" for="trip-start">出發日</label>
          <input id="trip-start" v-model="form.start" type="date" class="input" @change="onStartChange" />
        </div>
        <div class="min-w-0">
          <label class="label" for="trip-end">回程日</label>
          <input id="trip-end" v-model="form.end" type="date" class="input" :min="form.start" />
        </div>
      </div>
      <p v-if="touched && errors.dates" class="-mt-2 text-xs text-rose-500">{{ errors.dates }}</p>
      <p v-else-if="days > 0" class="-mt-2 text-xs text-ink-400">共 {{ days }} 天</p>

      <div>
        <label class="label" for="trip-currency">當地幣別</label>
        <select id="trip-currency" v-model="form.currency" class="input">
          <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }}（{{ c.code }}）</option>
          <option v-if="!CURRENCIES.some((c) => c.code === form.currency)" :value="form.currency">{{ form.currency }}</option>
        </select>
      </div>
      <div v-if="form.currency !== 'TWD'">
        <label class="label" for="trip-rate">匯率</label>
        <div class="flex items-center gap-2">
          <span class="shrink-0 text-sm font-semibold">1 {{ form.currency }} =</span>
          <input id="trip-rate" v-model="form.rate" class="input num" inputmode="decimal" autocomplete="off" />
          <span class="shrink-0 text-sm font-semibold">元</span>
        </div>
        <p v-if="touched && errors.rate" class="mt-1 text-xs text-rose-500">{{ errors.rate }}</p>
        <p v-else class="mt-1 text-xs leading-relaxed text-ink-400">
          旅費可以記{{ currencyInfo(form.currency).name }}或新台幣，結算一律用這個匯率換成新台幣；之後隨時能改。
          <template v-if="rate > 0">例：{{ formatMoney(1000, form.currency) }} ≈ {{ formatMoney(toTwd(1000, form.currency, rate)) }}</template>
        </p>
      </div>

      <div v-if="!trip">
        <label class="label" for="trip-people">旅伴（選填）</label>
        <textarea id="trip-people" v-model="form.people" class="input min-h-20" placeholder="小明 小華 阿傑" />
        <p v-if="touched && errors.people" class="mt-1 text-xs text-rose-500">{{ errors.people }}</p>
        <p v-else class="mt-1 text-xs text-ink-400">用空白、逗號或換行分開；記旅費時用得到，之後也能在設定新增</p>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="trip-form" class="btn-primary flex-1" :disabled="saving">
        {{ saving ? '儲存中…' : trip ? '儲存' : '建立' }}
      </button>
    </template>
  </ModalSheet>
</template>
