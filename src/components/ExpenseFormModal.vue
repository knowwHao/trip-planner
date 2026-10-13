<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Plus, ShoppingBag, Trash2, X } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import ParticipantAvatar from './ParticipantAvatar.vue'
import type { Expense, ExpenseInput, Id, ProxyInput, ShareInput, SplitMode, WishItem } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { dayDate, formatDate, todayYmd } from '@/lib/format'
import { currencyDigits, currencyInfo, formatMoney, formatRate, fromMinor, MAX_AMOUNT, parseAmount, parseSum, toMinor, toTwd } from '@/lib/money'
import { customRemaining, expenseDues } from '@/lib/split'
import { wishLabel } from '@/lib/wish'
import { itemWords } from '@/lib/category'

const props = defineProps<{
  open: boolean
  expense?: Expense | null
  /** 從行程記一筆時帶入的預設值 */
  preset?: {
    spot_id?: Id | null
    /** 行程底下的子項目（地點、店家） */
    item_id?: Id | null
    spent_on?: string | null
    title?: string
    /** 從代購清單記帳時要帶進代購列的項目 */
    wish?: Id[]
  } | null
}>()
const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const trip = computed(() => store.trip!)
/** 編輯時這筆已經用到的旅伴，被移出了也要列出來，不然改不到他的部分 */
const involved = ref<Set<Id>>(new Set())
const people = computed(() => store.participants.filter((p) => p.account_id || involved.value.has(p.id)))

const form = reactive({
  title: '',
  amount: '',
  currency: 'TWD',
  /** 實際扣款（新台幣），只有外幣旅費用得到 */
  charged: '',
  payer: '' as Id,
  date: '',
  spot: '' as Id,
  item: '' as Id,
  note: '',
  mode: 'even' as SplitMode,
  checked: [] as Id[],
  custom: {} as Record<Id, string>,
  /** 代購：幫不是旅伴的人買的部分 */
  proxies: [] as ProxyRow[],
})
/** 代購列；wishItemId 是從代購清單帶進來的項目 */
interface ProxyRow {
  name: string
  amount: string
  wishItemId: Id | null
}

const base = ref<Expense | null>(null)
const touched = ref(false)
const saving = ref(false)

function defaultDate() {
  const today = todayYmd()
  return today >= trip.value.start_date && today <= trip.value.end_date ? today : ''
}

function fill(e: Expense | null | undefined) {
  base.value = e ?? null
  const shares = e ? (store.data?.shares ?? []).filter((s) => s.expense_id === e.id) : []
  const proxies = e ? (store.data?.proxies ?? []).filter((x) => x.expense_id === e.id) : []
  const wishes = e ? [] : (props.preset?.wish ?? []).flatMap((id) => store.wishItems.filter((w) => w.id === id))
  involved.value = new Set(e ? [e.payer_id, ...shares.map((s) => s.participant_id)] : [])
  Object.assign(form, {
    title: e?.title ?? props.preset?.title ?? (wishes.length ? `代購：${wishes.map((w) => w.title).join('、')}`.slice(0, 60) : ''),
    amount: e ? String(e.amount) : '',
    currency: e?.currency ?? trip.value.currency,
    charged: e?.twd_amount != null ? String(e.twd_amount) : '',
    payer: e?.payer_id ?? store.me?.id ?? people.value[0]?.id ?? '',
    date: e ? (e.spent_on ?? '') : (props.preset?.spent_on ?? defaultDate()),
    spot: e?.spot_id ?? props.preset?.spot_id ?? '',
    item: e?.item_id ?? props.preset?.item_id ?? '',
    note: e?.note ?? '',
    // 從代購清單記的多半整筆都是代購或各買各的，用指定金額比較好分
    mode: e?.split_mode ?? (wishes.length ? 'custom' : 'even'),
    checked: e ? shares.map((s) => s.participant_id) : people.value.map((p) => p.id),
    custom: Object.fromEntries(shares.filter((s) => s.amount !== null).map((s) => [s.participant_id, String(s.amount)])),
    proxies: [
      ...proxies.map((x) => ({ name: x.name, amount: String(x.amount), wishItemId: x.wish_item_id })),
      ...wishes.map((w) => ({ name: w.recipient.trim(), amount: '', wishItemId: w.id })),
    ],
  })
  touched.value = false
}

watch(
  () => props.open,
  (open) => open && fill(props.expense),
  { immediate: true },
)

const latest = computed(() => (base.value ? (store.data?.expenses.find((x) => x.id === base.value!.id) ?? null) : null))
const gone = computed(() => !!base.value && !latest.value)
const stale = computed(() => !!base.value && !!latest.value && latest.value.version !== base.value.version)

const currencies = computed(() => [...new Set([trip.value.currency, 'TWD'])])
const amount = computed(() => parseSum(form.amount, form.currency))
const customValues = computed(() => people.value.map((p) => parseSum(form.custom[p.id] ?? '', form.currency)))
const foreign = computed(() => form.currency !== 'TWD')
const charged = computed(() => (foreign.value ? parseAmount(form.charged, 'TWD') : null))
/** 實際扣款換算出來的匯率，只用來顯示 */
const chargedRate = computed(() => (charged.value && amount.value && amount.value > 0 ? charged.value / amount.value : null))
const proxyValues = computed(() => form.proxies.map((x) => parseSum(x.amount, form.currency)))
// 名字和金額都空著的代購列當作沒有
const proxies = computed<ProxyInput[]>(() =>
  form.proxies.flatMap((x, i) =>
    x.name.trim() || x.amount.trim() || x.wishItemId ? [{ name: x.name.trim(), amount: proxyValues.value[i] ?? NaN, wish_item_id: x.wishItemId }] : [],
  ),
)

/** 代購列對應的清單項目（只有自己的看得到），顯示品項用 */
const wishById = computed(() => new Map(store.wishItems.map((w) => [w.id, w])))

// 從行程記帳時，列出排在這個行程、還沒記過帳的自己的代購項目，勾了就變成代購列
const spotWishes = computed(() => {
  const spotId = props.preset?.spot_id
  if (base.value || !spotId) return []
  // 從店家記帳時只列排在這間店、或排在這個行程但還沒指定店家的
  const itemId = props.preset?.item_id
  return (store.wishBySpot.get(spotId) ?? []).filter(
    (w) => w.status !== 'unavailable' && !store.wishRecords.has(w.id) && (!itemId || !w.item_id || w.item_id === itemId),
  )
})

function toggleWish(w: WishItem) {
  const i = form.proxies.findIndex((x) => x.wishItemId === w.id)
  if (i >= 0) form.proxies.splice(i, 1)
  else form.proxies.push({ name: w.recipient.trim(), amount: '', wishItemId: w.id })
}
const proxySum = computed(() => (amount.value && amount.value > 0 ? amount.value - customRemaining(amount.value, proxies.value.map((x) => x.amount), form.currency) : 0))
const remaining = computed(() =>
  amount.value && amount.value > 0 ? customRemaining(amount.value, [...customValues.value, ...proxies.value.map((x) => x.amount)], form.currency) : 0,
)

const shares = computed<ShareInput[]>(() =>
  form.mode === 'even'
    ? people.value.filter((p) => form.checked.includes(p.id)).map((p) => ({ participant_id: p.id, amount: null }))
    : people.value
        .map((p, i) => ({ participant_id: p.id, amount: customValues.value[i] }))
        .filter((s): s is ShareInput & { amount: number } => !!s.amount && s.amount > 0),
)

const preview = computed(() =>
  amount.value && amount.value > 0
    ? expenseDues(
        { amount: amount.value, currency: form.currency, split_mode: form.mode, twd_amount: charged.value && charged.value > 0 ? charged.value : null },
        shares.value,
        trip.value,
        proxies.value.filter((x) => x.name && x.amount > 0),
      )
    : null,
)

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.title.trim()) e.title = '請輸入品項'
  else if ([...form.title.trim()].length > 60) e.title = '最多 60 個字'
  if (amount.value === null) e.amount = '請輸入金額'
  else if (!(amount.value > 0 && amount.value <= MAX_AMOUNT)) e.amount = currencyDigits(form.currency) ? `金額格式不對（最多 ${currencyDigits(form.currency)} 位小數）` : '金額格式不對（不能有小數）'
  if (charged.value !== null && !(Number.isInteger(charged.value) && charged.value > 0 && charged.value <= MAX_AMOUNT)) {
    e.charged = '請輸入正整數，或留空用旅程匯率換算'
  }
  if (!form.payer) e.payer = '請選擇誰付的'
  if (proxies.value.some((x) => !x.name)) e.proxies = '代購要填是幫誰買的'
  else if (proxies.value.some((x) => [...x.name].length > 20)) e.proxies = '名字最多 20 個字'
  else if (proxies.value.some((x) => !(x.amount > 0))) e.proxies = '代購金額格式不對'
  if (!shares.value.length && !proxies.value.length) e.split = form.mode === 'even' ? '至少勾一個人' : '至少填一個人的金額'
  else if (form.mode === 'custom') {
    if (customValues.value.some((v) => v !== null && !(v >= 0))) e.split = '有金額格式不對'
    else if (remaining.value !== 0) e.split = remaining.value > 0 ? `還差 ${formatMoney(remaining.value, form.currency)} 沒分配` : `多分配了 ${formatMoney(-remaining.value, form.currency)}`
  } else if (amount.value && !e.proxies) {
    if (shares.value.length && proxySum.value >= amount.value) e.split = '代購加起來要小於總額，剩下的才給勾選的人平分'
    else if (!shares.value.length && proxySum.value !== amount.value) e.split = '沒勾人時，代購加起來要剛好等於總額'
  }
  return e
})

const allChecked = computed(() => form.checked.length === people.value.length)
function toggleAll() {
  form.checked = allChecked.value ? [] : people.value.map((p) => p.id)
}

/** 把還沒分配的金額平分給指定金額還空著的人，除不盡的最小單位依序多分一點 */
function splitRemaining() {
  const blanks = people.value.filter((p) => !(form.custom[p.id] ?? '').trim())
  if (!blanks.length || remaining.value <= 0) return
  const total = toMinor(remaining.value, form.currency)
  const each = Math.floor(total / blanks.length)
  blanks.forEach((p, i) => {
    form.custom[p.id] = String(fromMinor(each + (i < total - each * blanks.length ? 1 : 0), form.currency))
  })
}

function addProxy() {
  form.proxies.push({ name: '', amount: '', wishItemId: null })
}

const payerName = computed(() => store.participantName(form.payer))

// 口袋名單的行程排在最後，從口袋名單裡的行程記帳時才選得到
const spotOptions = computed(() => {
  const dayOf = (s: { day: number | null }) => (s.day !== null && s.day <= store.dayCount ? s.day : Infinity)
  return [...(store.data?.spots ?? [])]
    .sort((a, b) => dayOf(a) - dayOf(b) || a.sort_key - b.sort_key)
    .map((s) => ({ value: s.id, label: `${dayOf(s) === Infinity ? '口袋' : `D${s.day}`} ${s.title}` }))
})

// 選了有子項目的行程才能再選地點或店家；換行程時清掉不屬於它的子項目
const itemOptions = computed(() => (form.spot ? (store.itemsBySpot.get(form.spot) ?? []) : []))
const itemNoun = computed(() => itemWords(store.data?.spots.find((s) => s.id === form.spot)?.category ?? 'other').noun)
watch(
  () => form.spot,
  () => {
    if (form.item && !itemOptions.value.some((i) => i.id === form.item)) form.item = ''
  },
)

const dateOptions = computed(() => Array.from({ length: store.dayCount }, (_, i) => dayDate(trip.value, i + 1)))

async function submit() {
  touched.value = true
  if (Object.keys(errors.value).length) return
  const fields: ExpenseInput = {
    title: form.title.trim(),
    amount: amount.value!,
    currency: form.currency,
    payer_id: form.payer,
    split_mode: form.mode,
    spent_on: form.date || null,
    spot_id: form.spot || null,
    item_id: form.spot && form.item ? form.item : null,
    note: form.note.trim(),
    twd_amount: foreign.value ? charged.value : null,
  }
  const list = shares.value
  const proxyList = proxies.value
  saving.value = true
  try {
    const target = base.value
    if (!target) {
      await store.mutate(() => repo.saveExpense(fields, list, proxyList))
      emit('close')
      return
    }
    const outcome = await saveWithConflict('筆旅費', (useLatest) =>
      store.mutate(async () => {
        await repo.saveExpense(
          { ...fields, id: target.id, version: useLatest ? (latest.value?.version ?? target.version) : target.version },
          list,
          proxyList,
        )
      }),
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
  const ok = await confirmDialog({ title: `刪除「${target.title}」？`, message: '這筆的分攤與代購會一起刪掉，大家的帳會重算。', confirmText: '刪除', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteExpense(target.id))
    emit('close')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="base ? '編輯旅費' : '記一筆旅費'" @close="emit('close')">
    <StaleNotice v-if="stale || gone" :gone="gone" @reload="fill(latest)" />
    <form id="expense-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="exp-title">品項</label>
        <input id="exp-title" v-model="form.title" class="input" maxlength="60" placeholder="例如：晚餐、門票、計程車" autocomplete="off" />
        <p v-if="touched && errors.title" class="mt-1 text-xs text-rose-500">{{ errors.title }}</p>
      </div>

      <div>
        <label class="label" for="exp-amount">金額</label>
        <div class="flex gap-2">
          <input id="exp-amount" v-model="form.amount" class="input num min-w-0 flex-1" inputmode="decimal" autocomplete="off" />
          <div v-if="currencies.length > 1" class="flex shrink-0 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="幣別">
            <button
              v-for="c in currencies"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="form.currency === c"
              class="rounded-xl px-3 text-sm font-bold transition"
              :class="form.currency === c ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
              @click="form.currency = c"
            >
              {{ c }}
            </button>
          </div>
        </div>
        <p v-if="touched && errors.amount" class="mt-1 text-xs text-rose-500">{{ errors.amount }}</p>
        <p v-else-if="amount && foreign && !charged" class="num mt-1 text-xs text-ink-400">
          ≈ {{ formatMoney(toTwd(amount, form.currency, trip.fx_rate)) }}（旅程匯率 1 {{ form.currency }} = {{ formatRate(trip.fx_rate) }} 元，{{ currencyInfo(form.currency).name }}）
        </p>
      </div>

      <div v-if="foreign">
        <label class="label" for="exp-charged">實際扣款（新台幣，選填）</label>
        <input id="exp-charged" v-model="form.charged" class="input num" inputmode="numeric" placeholder="信用卡帳單上的金額" autocomplete="off" />
        <p v-if="touched && errors.charged" class="mt-1 text-xs text-rose-500">{{ errors.charged }}</p>
        <p v-else-if="chargedRate" class="num mt-1 text-xs text-ink-400">
          這筆用實際匯率 1 {{ form.currency }} ≈ {{ formatRate(chargedRate) }} 元換算，不受旅程匯率影響
        </p>
        <p v-else class="mt-1 text-xs text-ink-400">刷卡或換匯的實際金額，有填就照它換算；留空用旅程匯率</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="min-w-0">
          <label class="label" for="exp-payer">誰付的</label>
          <select id="exp-payer" v-model="form.payer" class="input">
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="min-w-0">
          <label class="label" for="exp-date">日期（選填）</label>
          <select id="exp-date" v-model="form.date" class="input">
            <option value="">不指定</option>
            <option v-for="(d, i) in dateOptions" :key="d" :value="d">D{{ i + 1 }} {{ formatDate(d) }}</option>
            <option v-if="form.date && !dateOptions.includes(form.date)" :value="form.date">{{ formatDate(form.date, true) }}</option>
          </select>
        </div>
      </div>
      <p v-if="touched && errors.payer" class="-mt-2 text-xs text-rose-500">{{ errors.payer }}</p>

      <fieldset>
        <legend class="label">怎麼分</legend>
        <div class="grid grid-cols-2 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="分攤方式">
          <button
            v-for="m in [{ v: 'even', t: '勾選的人平分' }, { v: 'custom', t: '各付各的金額' }] as const"
            :key="m.v"
            type="button"
            role="radio"
            :aria-checked="form.mode === m.v"
            class="rounded-xl py-2 text-sm font-bold transition"
            :class="form.mode === m.v ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
            @click="form.mode = m.v"
          >
            {{ m.t }}
          </button>
        </div>

        <div v-if="form.mode === 'even'" class="mt-3">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-xs text-ink-400">已勾 {{ form.checked.length }} 人</span>
            <button type="button" class="text-xs font-semibold text-sea-700 dark:text-sea-300" @click="toggleAll">{{ allChecked ? '全不選' : '全選' }}</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="p in people"
              :key="p.id"
              class="flex cursor-pointer items-center gap-2 rounded-2xl border py-1.5 pr-3 pl-1.5 text-sm font-semibold transition select-none"
              :class="form.checked.includes(p.id) ? 'border-sea-400 bg-sea-100 text-ink-900 dark:bg-sea-400/15 dark:text-white' : 'border-ink-200 text-ink-400 dark:border-ink-700'"
            >
              <input v-model="form.checked" type="checkbox" :value="p.id" class="sr-only" />
              <ParticipantAvatar :id="p.id" :name="p.name" size="sm" />{{ p.name }}
            </label>
          </div>
        </div>

        <div v-else class="mt-3 space-y-2">
          <div v-for="p in people" :key="p.id" class="flex items-center gap-2">
            <ParticipantAvatar :id="p.id" :name="p.name" size="sm" />
            <label :for="`exp-custom-${p.id}`" class="min-w-0 flex-1 truncate text-sm font-semibold">{{ p.name }}</label>
            <input
              :id="`exp-custom-${p.id}`"
              v-model="form.custom[p.id]"
              class="input num w-32 shrink-0 py-2 text-right"
              inputmode="text"
              placeholder="0"
              autocomplete="off"
            />
          </div>
          <p class="text-xs text-ink-400">填每個人那幾項的金額，可以直接輸入加法（例如 1200+3400）；幫不是旅伴的人買的加在下面的代購</p>
        </div>

        <div class="mt-4 rounded-2xl border border-dashed border-ink-200 p-3 dark:border-ink-700">
          <p class="text-sm font-bold">代購<span class="ml-1 text-xs font-normal text-ink-400">幫不是旅伴的人買的，不算進大家的帳</span></p>
          <div v-if="spotWishes.length" class="mt-2 rounded-xl bg-sea-100/70 p-2.5 dark:bg-sea-400/10">
            <p class="text-xs font-semibold text-sea-800 dark:text-sea-200">這個行程有你的代購，要一起記嗎？</p>
            <label v-for="w in spotWishes" :key="w.id" class="mt-1.5 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" class="size-4 shrink-0 accent-sea-500" :checked="form.proxies.some((x) => x.wishItemId === w.id)" @change="toggleWish(w)" />
              <span class="min-w-0 truncate"><span class="font-semibold">{{ w.recipient }}</span>：{{ wishLabel(w) }}</span>
            </label>
          </div>
          <div v-for="(x, i) in form.proxies" :key="i" class="mt-2">
          <div class="flex items-center gap-2">
            <label :for="`exp-proxy-name-${i}`" class="sr-only">代購對象</label>
            <input :id="`exp-proxy-name-${i}`" v-model="x.name" class="input min-w-0 flex-1 py-2" maxlength="20" placeholder="幫誰買，例如媽媽" autocomplete="off" />
            <label :for="`exp-proxy-amount-${i}`" class="sr-only">代購金額</label>
            <input
              :id="`exp-proxy-amount-${i}`"
              v-model="x.amount"
              class="input num w-28 shrink-0 py-2 text-right"
              inputmode="text"
              placeholder="0"
              autocomplete="off"
            />
            <button type="button" class="icon-btn -mr-2 shrink-0" :aria-label="`刪掉第 ${i + 1} 筆代購`" @click="form.proxies.splice(i, 1)"><X class="size-4" /></button>
          </div>
          <p v-if="x.wishItemId && wishById.get(x.wishItemId)" class="mt-0.5 flex items-center gap-1 px-1 text-xs text-ink-400">
            <ShoppingBag class="size-3 shrink-0" />代購清單：{{ wishLabel(wishById.get(x.wishItemId)!) }}
          </p>
          </div>
          <p v-if="touched && errors.proxies" class="mt-1 text-xs text-rose-500">{{ errors.proxies }}</p>
          <button type="button" class="mt-2 flex items-center gap-1 text-sm font-semibold text-sea-700 dark:text-sea-300" @click="addProxy">
            <Plus class="size-4" />{{ form.proxies.length ? '再加一位' : '幫不是旅伴的人代購' }}
          </button>
          <p v-if="preview && preview.proxyDues.some((d) => d.due > 0)" class="num mt-1.5 text-xs leading-relaxed text-ink-400">
            {{ payerName }} 之後自己跟對方收：{{ preview.proxyDues.map((d) => `${d.name} ${formatMoney(d.due)}`).join('、') }}
          </p>
        </div>

        <div v-if="form.mode === 'custom'" class="mt-3 flex items-center justify-between gap-2">
          <span class="num text-xs" :class="remaining === 0 ? 'text-sea-600 dark:text-sea-400' : 'text-amber-600 dark:text-amber-300'">
            {{ remaining === 0 ? '金額剛好分完' : remaining > 0 ? `還剩 ${formatMoney(remaining, form.currency)}` : `多了 ${formatMoney(-remaining, form.currency)}` }}
          </span>
          <button v-if="remaining > 0" type="button" class="text-xs font-semibold text-sea-700 dark:text-sea-300" @click="splitRemaining">剩下的平分給空白的人</button>
        </div>
        <p v-if="touched && errors.split" class="mt-1 text-xs text-rose-500">{{ errors.split }}</p>
        <p v-else-if="preview && preview.dues.length" class="num mt-2 text-xs leading-relaxed text-ink-400">
          <template v-if="form.mode === 'even'">
            每人 {{ formatMoney(preview.dues[0].due) }}<template v-if="preview.surplus">（除不盡進位，付錢的人多收 {{ formatMoney(preview.surplus) }}）</template>
          </template>
          <template v-else-if="foreign">
            換成新台幣：{{ preview.dues.map((d) => `${store.participantName(d.participant_id)} ${formatMoney(d.due)}`).join('、') }}
          </template>
        </p>
      </fieldset>

      <div v-if="spotOptions.length">
        <label class="label" for="exp-spot">哪個行程（選填）</label>
        <select id="exp-spot" v-model="form.spot" class="input">
          <option value="">不指定</option>
          <option v-for="s in spotOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div v-if="itemOptions.length">
        <label class="label" for="exp-item">哪個{{ itemNoun }}（選填）</label>
        <select id="exp-item" v-model="form.item" class="input">
          <option value="">不指定</option>
          <option v-for="it in itemOptions" :key="it.id" :value="it.id">{{ it.title }}</option>
        </select>
      </div>
      <div>
        <label class="label" for="exp-note">備註（選填）</label>
        <input id="exp-note" v-model="form.note" class="input" maxlength="500" autocomplete="off" />
      </div>
      <button v-if="base" type="button" class="btn-ghost -ml-2 text-rose-500" @click="remove"><Trash2 class="size-4" />刪除這筆</button>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="expense-form" class="btn-primary flex-1" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
    </template>
  </ModalSheet>
</template>
