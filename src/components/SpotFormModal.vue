<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ChevronRight, ListPlus, Navigation, ReceiptText, ShoppingBag, Trash2 } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import type { BookingStatus, Id, Spot, SpotCategory, SpotInput } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { dayDate, formatDate, formatTime } from '@/lib/format'
import { googleMapsUrl, safeUrl } from '@/lib/maps'
import { keyAfter } from '@/lib/order'
import { bookingForCategory, categoryInfo, CATEGORIES, defaultBooking, itemWords, remindLabel } from '@/lib/category'
import { FLIGHT_NO_RE, normalizeFlightNo } from '@/lib/flight'
import { wishLabel } from '@/lib/wish'

const props = defineProps<{
  open: boolean
  /** 有值是編輯 */
  spot?: Spot | null
  /** 新增時預設排在哪一天；null 是口袋名單 */
  day?: number | null
}>()
const emit = defineEmits<{ close: []; 'add-item': [spot: Spot]; 'add-expense': [spot: Spot] }>()

const store = useTripStore()
const trip = computed(() => store.trip!)

const form = reactive({
  category: 'sight' as SpotCategory,
  booking: null as BookingStatus | null,
  title: '',
  day: '' as string,
  time: '',
  address: '',
  mapUrl: '',
  note: '',
  airline: '',
  flightNo: '',
  depAirport: '',
  arrAirport: '',
  arrTime: '',
  arrOffset: 0,
})
const flightOpen = ref(false)
const base = ref<Spot | null>(null)
const touched = ref(false)
const saving = ref(false)

const wishPicked = ref<Set<Id>>(new Set())

function fill(s: Spot | null | undefined) {
  base.value = s ?? null
  wishPicked.value = new Set(s ? (store.wishBySpot.get(s.id) ?? []).map((w) => w.id) : [])
  const category = s?.category ?? 'sight'
  Object.assign(form, {
    category,
    booking: s ? s.booking : defaultBooking(category),
    title: s?.title ?? '',
    day: String(s ? (s.day ?? '') : (props.day ?? '')),
    time: formatTime(s?.start_time ?? null),
    address: s?.address ?? '',
    mapUrl: s?.map_url ?? '',
    note: s?.note ?? '',
    airline: s?.airline ?? '',
    flightNo: s?.flight_no ?? '',
    depAirport: s?.dep_airport ?? '',
    arrAirport: s?.arr_airport ?? '',
    arrTime: formatTime(s?.arr_time ?? null),
    arrOffset: s?.arr_day_offset ?? 0,
  })
  flightOpen.value = !!(form.airline || form.flightNo || form.depAirport || form.arrAirport || form.arrTime)
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

const remind = computed(() => remindLabel(form.category))
const bookingTexts = computed(() => categoryInfo(form.category).booking)
const walkInText = computed(() => categoryInfo(form.category).walkIn ?? null)
/** 提醒開關：打開是「還沒」或「已完成」，關掉存 null（餐廳另外可以標現場排隊） */
const remindOn = computed({
  get: () => form.booking === 'todo' || form.booking === 'done',
  set: (on: boolean) => (form.booking = on ? 'todo' : null),
})
const itemCount = computed(() => (base.value ? (store.itemsBySpot.get(base.value.id)?.length ?? 0) : 0))
// 一個行程底下掛多個地點只有景點（一區好幾個點）和購物（一區好幾間店）用得到
const canAddItems = computed(() => form.category === 'sight' || form.category === 'shop')

const titleInput = ref<HTMLInputElement | null>(null)

// 購物行程可以順便把自己的代購排進來：已經排在這裡的，加上還沒排地點的待買項目
const wishChoices = computed(() =>
  form.category === 'shop'
    ? store.wishItems.filter((w) => (base.value && w.spot_id === base.value.id) || (!w.spot_id && w.status === 'todo'))
    : [],
)
const unplacedCount = computed(() => wishChoices.value.filter((w) => !w.spot_id).length)

function toggleWishPick(id: Id) {
  const next = new Set(wishPicked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  wishPicked.value = next
}

/** 依勾選把代購排進或移出這個行程；不是購物類型時不動 */
async function placeWishes(spotId: Id) {
  if (form.category !== 'shop') return
  const add = wishChoices.value.filter((w) => wishPicked.value.has(w.id) && w.spot_id !== spotId).map((w) => w.id)
  const drop = wishChoices.value.filter((w) => !wishPicked.value.has(w.id) && w.spot_id === spotId).map((w) => w.id)
  if (!add.length && !drop.length) return
  await store.mutate(async () => {
    await repo.setWishPlace(add, spotId)
    await repo.setWishPlace(drop, null)
  })
}

/** 交通的名稱常是「東京 → 京都」，手機鍵盤不好打箭頭，在游標處插入 */
function insertArrow() {
  const el = titleInput.value
  const at = el?.selectionStart ?? form.title.length
  const end = el?.selectionEnd ?? at
  const before = form.title.slice(0, at).replace(/\s+$/, '')
  const after = form.title.slice(end).replace(/^\s+/, '')
  const arrow = `${before ? ' ' : ''}→ `
  form.title = before + arrow + after
  const caret = before.length + arrow.length
  requestAnimationFrame(() => {
    el?.focus()
    el?.setSelectionRange(caret, caret)
  })
}

const PLACEHOLDERS: Record<SpotCategory, string> = {
  sight: '例如：淺草寺',
  food: '例如：一蘭拉麵 上野店',
  shop: '例如：銀座三越',
  activity: '例如：和服體驗',
  transport: '例如：新幹線 東京 → 京都',
  stay: '例如：上野站前飯店',
  other: '',
}

function pickCategory(c: SpotCategory) {
  form.category = c
  form.booking = bookingForCategory(c, form.booking)
}
const preview = computed(() => googleMapsUrl({ map_url: form.mapUrl, address: form.address }))

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.title.trim()) e.title = '請輸入名稱'
  else if ([...form.title.trim()].length > 80) e.title = '最多 80 個字'
  if (form.mapUrl.trim() && !safeUrl(form.mapUrl)) e.mapUrl = '請貼上 http 或 https 開頭的連結'
  if (form.address.length > 200) e.address = '最多 200 個字'
  if (form.note.length > 2000) e.note = '最多 2000 個字'
  if (form.category === 'transport' && !FLIGHT_NO_RE.test(normalizeFlightNo(form.flightNo))) e.flightNo = '航班號碼是英文字母加數字，例如 JL802'
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
    category: form.category,
    booking: form.booking,
    title: form.title.trim(),
    start_time: form.time || null,
    address: form.address.trim(),
    map_url: form.mapUrl.trim() ? safeUrl(form.mapUrl)! : '',
    note: form.note.trim(),
    // 換成別的類型時清掉航班，免得卡片以外的地方還留著看不到的資料
    ...(form.category === 'transport'
      ? {
          airline: form.airline.trim(),
          flight_no: normalizeFlightNo(form.flightNo),
          dep_airport: form.depAirport.trim(),
          arr_airport: form.arrAirport.trim(),
          arr_time: form.arrTime || null,
          arr_day_offset: form.arrTime ? form.arrOffset : 0,
        }
      : { airline: '', flight_no: '', dep_airport: '', arr_airport: '', arr_time: null, arr_day_offset: 0 }),
  }
  saving.value = true
  try {
    if (!base.value) {
      const input: SpotInput = { ...content, day, sort_key: keyAfter(lastKey(day)) }
      const created = await store.mutate(() => repo.createSpot(input))
      await placeWishes(created.id)
      emit('close')
      return
    }
    const target = base.value
    // 換天時排到那一天的最後面；沒換天就不動排序
    const moved = day !== (latest.value?.day ?? target.day)
    const patch = moved ? { ...content, day, sort_key: keyAfter(lastKey(day)) } : content
    const outcome = await saveWithConflict('個行程', (useLatest) =>
      store.mutate(() => repo.updateSpot(target.id, useLatest ? (latest.value?.version ?? target.version) : target.version, patch)),
    )
    if (outcome === 'saved') await placeWishes(target.id)
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
  <ModalSheet :open="open" :title="base ? '編輯行程' : '新增行程'" @close="emit('close')">
    <StaleNotice v-if="stale || gone" :gone="gone" @reload="fill(latest)" />
    <form id="spot-form" class="space-y-4" novalidate @submit.prevent="submit">
      <fieldset>
        <legend class="label">類型</legend>
        <div class="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="類型">
          <button
            v-for="c in CATEGORIES"
            :key="c.value"
            type="button"
            role="radio"
            :aria-checked="form.category === c.value"
            class="flex flex-col items-center gap-0.5 rounded-2xl border py-1.5 text-xs font-semibold transition"
            :class="
              form.category === c.value
                ? 'border-sea-400 bg-sea-100 text-ink-900 dark:bg-sea-400/15 dark:text-white'
                : 'border-ink-200 text-ink-500 hover:border-sea-400 dark:border-ink-700 dark:text-ink-300'
            "
            @click="pickCategory(c.value)"
          >
            <span class="text-lg leading-6" aria-hidden="true">{{ c.emoji }}</span>{{ c.label }}
          </button>
        </div>
      </fieldset>
      <fieldset v-if="remind && bookingTexts">
        <legend class="label">預約</legend>
        <button
          type="button"
          role="switch"
          :aria-checked="remindOn"
          class="flex w-full items-center justify-between gap-3 rounded-2xl bg-ink-100 py-2.5 pr-2.5 pl-4 text-left dark:bg-ink-800"
          @click="remindOn = !remindOn"
        >
          <span class="min-w-0">
            <span class="block text-sm font-bold">{{ remind }}</span>
            <span class="block text-xs text-ink-400">打開後卡片上會標示，也會列在「還沒訂」</span>
          </span>
          <span class="relative h-7 w-12 shrink-0 rounded-full transition" :class="remindOn ? 'bg-sea-400' : 'bg-ink-300 dark:bg-ink-600'">
            <span class="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-soft transition" :class="remindOn && 'translate-x-5'" />
          </span>
        </button>
        <div v-if="remindOn" class="mt-2 grid grid-cols-2 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="預約狀態">
          <button
            v-for="v in ['todo', 'done'] as const"
            :key="v"
            type="button"
            role="radio"
            :aria-checked="form.booking === v"
            class="rounded-xl py-2 text-sm font-bold transition"
            :class="form.booking === v ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
            @click="form.booking = v"
          >
            {{ bookingTexts[v] }}
          </button>
        </div>
        <label v-else-if="walkInText" class="mt-2 flex cursor-pointer items-center gap-2.5 px-1 text-sm">
          <input
            type="checkbox"
            class="size-4 accent-sea-500"
            :checked="form.booking === 'none'"
            @change="form.booking = ($event.target as HTMLInputElement).checked ? 'none' : null"
          />
          <span><span class="font-semibold">{{ walkInText }}</span><span class="text-ink-400">（不用訂位，可能要排隊）</span></span>
        </label>
      </fieldset>
      <div>
        <label class="label" for="spot-title">名稱</label>
        <div class="flex gap-2">
          <input
            id="spot-title"
            ref="titleInput"
            v-model="form.title"
            class="input min-w-0 flex-1"
            maxlength="80"
            :placeholder="PLACEHOLDERS[form.category]"
            autocomplete="off"
          />
          <button
            v-if="form.category === 'transport'"
            type="button"
            class="btn-outline shrink-0 px-4 text-lg"
            aria-label="插入往右的箭頭"
            title="插入 →"
            @mousedown.prevent
            @click="insertArrow"
          >
            →
          </button>
        </div>
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
          <label class="label" for="spot-time">{{ form.category === 'transport' ? '出發時間' : '時間' }}（選填）</label>
          <input id="spot-time" v-model="form.time" type="time" class="input" />
        </div>
      </div>
      <fieldset v-if="form.category === 'transport'" class="rounded-2xl border border-ink-200 px-3 pb-3 dark:border-ink-700">
        <legend class="px-1">
          <button type="button" class="flex items-center gap-1 text-sm font-bold" :aria-expanded="flightOpen" @click="flightOpen = !flightOpen">
            <ChevronRight class="size-4 transition" :class="flightOpen && 'rotate-90'" />✈️ 航班（選填）
          </button>
        </legend>
        <div v-if="flightOpen" class="mt-1 space-y-3">
          <div class="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div class="min-w-0">
              <label class="label" for="spot-airline">航空公司</label>
              <input id="spot-airline" v-model="form.airline" class="input" maxlength="40" placeholder="例如：日本航空" autocomplete="off" />
            </div>
            <div class="min-w-0">
              <label class="label" for="spot-flight-no">航班號碼</label>
              <input id="spot-flight-no" v-model="form.flightNo" class="input uppercase" maxlength="10" placeholder="JL802" autocomplete="off" autocapitalize="characters" />
            </div>
          </div>
          <p v-if="touched && errors.flightNo" class="-mt-2 text-xs text-rose-500">{{ errors.flightNo }}</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label class="label" for="spot-dep">出發機場</label>
              <input id="spot-dep" v-model="form.depAirport" class="input" maxlength="40" placeholder="TPE" autocomplete="off" />
            </div>
            <div class="min-w-0">
              <label class="label" for="spot-arr">抵達機場</label>
              <input id="spot-arr" v-model="form.arrAirport" class="input" maxlength="40" placeholder="NRT" autocomplete="off" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label class="label" for="spot-arr-time">抵達時間（當地）</label>
              <input id="spot-arr-time" v-model="form.arrTime" type="time" class="input" />
            </div>
            <div class="min-w-0">
              <label class="label" for="spot-arr-day">抵達日</label>
              <select id="spot-arr-day" v-model.number="form.arrOffset" class="input" :disabled="!form.arrTime">
                <option :value="0">同一天</option>
                <option :value="1">隔天（+1）</option>
                <option :value="2">兩天後（+2）</option>
              </select>
            </div>
          </div>
          <p class="text-xs text-ink-400">起飛時間就是上面的「出發時間」</p>
        </div>
      </fieldset>
      <div>
        <label class="label" for="spot-address">地址（選填）</label>
        <input id="spot-address" v-model="form.address" class="input" maxlength="200" autocomplete="off" />
      </div>
      <div>
        <label class="label" for="spot-map">Google 地圖連結（選填）</label>
        <input id="spot-map" v-model="form.mapUrl" class="input" inputmode="url" placeholder="https://maps.app.goo.gl/…" autocomplete="off" />
        <p v-if="touched && errors.mapUrl" class="mt-1 text-xs text-rose-500">{{ errors.mapUrl }}</p>
        <p v-else class="mt-1 text-xs leading-relaxed text-ink-400">
          在 Google 地圖按「分享」→「複製連結」貼上；沒填就用地址搜尋，兩個都沒填卡片上就不放地圖。
          <a v-if="preview" :href="preview" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 font-semibold text-sea-700 dark:text-sea-300">
            <Navigation class="size-3" />試開
          </a>
        </p>
      </div>
      <div>
        <label class="label" for="spot-note">備註（選填）</label>
        <textarea id="spot-note" v-model="form.note" class="input min-h-24" maxlength="2000" placeholder="營業時間、訂位代號、交通方式…" />
      </div>
      <fieldset v-if="wishChoices.length" class="rounded-2xl bg-sea-100/70 p-3 dark:bg-sea-400/10">
        <legend class="sr-only">在這裡買的代購</legend>
        <p class="flex items-center gap-1.5 text-sm font-semibold text-sea-800 dark:text-sea-200">
          <ShoppingBag class="size-4 shrink-0" />{{ unplacedCount ? `你有 ${unplacedCount} 項代購還沒排地點，要在這裡買嗎？` : '在這裡買的代購' }}
        </p>
        <label v-for="w in wishChoices" :key="w.id" class="mt-1.5 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" class="size-4 shrink-0 accent-sea-500" :checked="wishPicked.has(w.id)" @change="toggleWishPick(w.id)" />
          <span class="min-w-0 truncate"><span class="font-semibold">{{ w.recipient }}</span>：{{ wishLabel(w) }}</span>
        </label>
        <p class="mt-1.5 text-xs text-ink-400">只有你看得到</p>
      </fieldset>
      <div v-if="base && !gone" class="flex flex-wrap items-center gap-x-1 gap-y-1">
        <button type="button" class="btn-ghost -ml-2 text-rose-500" @click="remove"><Trash2 class="size-4" />刪除</button>
        <span class="flex-1" />
        <button type="button" class="btn-ghost" @click="emit('add-expense', base)"><ReceiptText class="size-4" />記一筆旅費</button>
        <button v-if="canAddItems" type="button" class="btn-ghost -mr-2" @click="emit('add-item', base)">
          <ListPlus class="size-4" />新增{{ itemWords(form.category).noun }}（{{ itemCount }}）
        </button>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="spot-form" class="btn-primary flex-1" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
    </template>
  </ModalSheet>
</template>
