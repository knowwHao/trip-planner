<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Navigation, Trash2 } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import type { Spot, SpotInput } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { dayDate, formatDate, formatTime } from '@/lib/format'
import { googleMapsUrl, safeUrl } from '@/lib/maps'
import { formatMoney, MAX_AMOUNT, parseAmount, toTwd } from '@/lib/money'
import { keyAfter } from '@/lib/order'

const props = defineProps<{
  open: boolean
  /** 有值是編輯 */
  spot?: Spot | null
  /** 新增時預設排在哪一天；null 是口袋名單 */
  day?: number | null
}>()
const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const trip = computed(() => store.trip!)

const form = reactive({ title: '', day: '' as string, time: '', address: '', mapUrl: '', cost: '', note: '' })
const base = ref<Spot | null>(null)
const touched = ref(false)
const saving = ref(false)

function fill(s: Spot | null | undefined) {
  base.value = s ?? null
  Object.assign(form, {
    title: s?.title ?? '',
    day: String(s ? (s.day ?? '') : (props.day ?? '')),
    time: formatTime(s?.start_time ?? null),
    address: s?.address ?? '',
    mapUrl: s?.map_url ?? '',
    cost: s?.est_cost === null || s?.est_cost === undefined ? '' : String(s.est_cost),
    note: s?.note ?? '',
  })
  touched.value = false
}

watch(
  () => props.open,
  (open) => open && fill(props.spot),
  { immediate: true },
)

const latest = computed(() => (base.value ? (store.data?.spots.find((s) => s.id === base.value!.id) ?? null) : null))
const gone = computed(() => !!base.value && !latest.value)
const stale = computed(() => !!base.value && !!latest.value && latest.value.version !== base.value.version)

const dayOptions = computed(() =>
  Array.from({ length: store.dayCount }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 天・${formatDate(dayDate(trip.value, i + 1))}` })),
)

const cost = computed(() => parseAmount(form.cost, trip.value.currency))
const preview = computed(() =>
  googleMapsUrl({ map_url: form.mapUrl, address: form.address, title: form.title }),
)

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.title.trim()) e.title = '請輸入景點名稱'
  else if ([...form.title.trim()].length > 80) e.title = '最多 80 個字'
  if (form.mapUrl.trim() && !safeUrl(form.mapUrl)) e.mapUrl = '請貼上 http 或 https 開頭的連結'
  if (cost.value !== null && !(cost.value >= 0 && cost.value <= MAX_AMOUNT)) e.cost = '金額格式不對'
  if (form.address.length > 200) e.address = '最多 200 個字'
  if (form.note.length > 2000) e.note = '最多 2000 個字'
  return e
})

function lastKey(day: number | null) {
  const list = store.spotsByDay.get(day) ?? []
  return list.at(-1)?.sort_key
}

async function submit() {
  touched.value = true
  if (Object.keys(errors.value).length) return
  const day = form.day ? Number(form.day) : null
  const content = {
    title: form.title.trim(),
    start_time: form.time || null,
    address: form.address.trim(),
    map_url: form.mapUrl.trim() ? safeUrl(form.mapUrl)! : '',
    note: form.note.trim(),
    est_cost: cost.value,
  }
  saving.value = true
  try {
    if (!base.value) {
      const input: SpotInput = { ...content, day, sort_key: keyAfter(lastKey(day)) }
      await store.mutate(() => repo.createSpot(input))
      emit('close')
      return
    }
    const target = base.value
    // 換天時排到那一天的最後面；沒換天就不動排序
    const moved = day !== (latest.value?.day ?? target.day)
    const patch = moved ? { ...content, day, sort_key: keyAfter(lastKey(day)) } : content
    const outcome = await saveWithConflict('個景點', (useLatest) =>
      store.mutate(() => repo.updateSpot(target.id, useLatest ? (latest.value?.version ?? target.version) : target.version, patch)),
    )
    if (outcome === 'saved' || outcome === 'gone') emit('close')
    else if (outcome === 'reload') fill(latest.value)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    saving.value = false
  }
}

async function remove() {
  const target = base.value
  if (!target) return
  const ok = await confirmDialog({ title: `刪除「${target.title}」？`, message: '刪除後其他旅伴也會看不到。', confirmText: '刪除', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteSpot(target.id))
    emit('close')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="base ? '編輯景點' : '新增景點'" @close="emit('close')">
    <StaleNotice v-if="stale || gone" :gone="gone" @reload="fill(latest)" />
    <form id="spot-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="spot-title">景點名稱</label>
        <input id="spot-title" v-model="form.title" class="input" maxlength="80" placeholder="例如：淺草寺" autocomplete="off" />
        <p v-if="touched && errors.title" class="mt-1 text-xs text-rose-500">{{ errors.title }}</p>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <div class="min-w-0">
          <label class="label" for="spot-day">哪一天</label>
          <select id="spot-day" v-model="form.day" class="input">
            <option v-for="d in dayOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
            <option value="">口袋名單（還沒排）</option>
          </select>
        </div>
        <div class="min-w-0">
          <label class="label" for="spot-time">時間（選填）</label>
          <input id="spot-time" v-model="form.time" type="time" class="input" />
        </div>
      </div>
      <div>
        <label class="label" for="spot-address">地址（選填）</label>
        <input id="spot-address" v-model="form.address" class="input" maxlength="200" autocomplete="off" />
      </div>
      <div>
        <label class="label" for="spot-map">Google 地圖連結（選填）</label>
        <input id="spot-map" v-model="form.mapUrl" class="input" inputmode="url" placeholder="https://maps.app.goo.gl/…" autocomplete="off" />
        <p v-if="touched && errors.mapUrl" class="mt-1 text-xs text-rose-500">{{ errors.mapUrl }}</p>
        <p v-else class="mt-1 text-xs leading-relaxed text-ink-400">
          在 Google 地圖按「分享」→「複製連結」貼上；沒填就用地址或名稱搜尋。
          <a v-if="preview" :href="preview" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 font-semibold text-sea-700 dark:text-sea-300">
            <Navigation class="size-3" />試開
          </a>
        </p>
      </div>
      <div>
        <label class="label" for="spot-cost">預估花費（{{ trip.currency }}，選填）</label>
        <input id="spot-cost" v-model="form.cost" class="input num" inputmode="decimal" autocomplete="off" />
        <p v-if="touched && errors.cost" class="mt-1 text-xs text-rose-500">{{ errors.cost }}</p>
        <p v-else-if="cost && trip.currency !== 'TWD'" class="mt-1 text-xs text-ink-400">
          ≈ {{ formatMoney(toTwd(cost, trip.currency, trip.fx_rate)) }}
        </p>
      </div>
      <div>
        <label class="label" for="spot-note">備註（選填）</label>
        <textarea id="spot-note" v-model="form.note" class="input min-h-24" maxlength="2000" placeholder="營業時間、要預約、交通方式…" />
      </div>
      <button v-if="base" type="button" class="btn-ghost -ml-2 text-rose-500" @click="remove"><Trash2 class="size-4" />刪除這個景點</button>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="spot-form" class="btn-primary flex-1" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
    </template>
  </ModalSheet>
</template>
