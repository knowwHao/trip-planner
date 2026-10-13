<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Camera, ExternalLink, Minus, Plus, Trash2, X } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import WishThumb from './WishThumb.vue'
import PhotoViewer from './PhotoViewer.vue'
import type { Id, PhotoData, WishItem, WishStatus } from '@/types'
import { repo } from '@/data'
import { MAX_WISH_PHOTOS } from '@/data/repository'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { primePhoto } from '@/composables/usePhoto'
import { safeUrl } from '@/lib/maps'
import { keyAfter } from '@/lib/order'
import { compressPhoto } from '@/lib/image'
import { formatMoney } from '@/lib/money'
import { WISH_STATUSES } from '@/lib/wish'

const props = defineProps<{
  open: boolean
  /** 有值是編輯 */
  item?: WishItem | null
}>()
const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const form = reactive({ recipient: '', title: '', qty: 1, note: '', url: '', spot: '' as Id, status: 'todo' as WishStatus })
const base = ref<WishItem | null>(null)
const touched = ref(false)
const saving = ref(false)
/** 照片先記在這裡，按儲存才上傳或刪除 */
const added = ref<PhotoData[]>([])
const removed = ref<Id[]>([])
const viewing = ref<{ id?: Id; src?: string } | null>(null)
const busyPhoto = ref(false)

function fill(w: WishItem | null | undefined) {
  base.value = w ?? null
  Object.assign(form, {
    recipient: w?.recipient ?? '',
    title: w?.title ?? '',
    qty: w?.qty ?? 1,
    note: w?.note ?? '',
    url: w?.url ?? '',
    spot: w?.spot_id ?? '',
    status: w?.status ?? 'todo',
  })
  added.value = []
  removed.value = []
  touched.value = false
}

watch(
  () => props.open,
  (open) => open && fill(props.item),
  { immediate: true },
)

const latest = computed(() => (base.value ? (store.wishItems.find((w) => w.id === base.value!.id) ?? null) : null))
const gone = computed(() => !!base.value && !latest.value)
const stale = computed(() => !!base.value && !!latest.value && latest.value.version !== base.value.version)
const savedPhotos = computed(() => (base.value ? (store.wishPhotosByItem.get(base.value.id) ?? []) : []).filter((p) => !removed.value.includes(p.id)))
const photoCount = computed(() => savedPhotos.value.length + added.value.length)
const record = computed(() => (base.value ? store.wishRecords.get(base.value.id) : undefined))

// 購物行程排前面，在哪買最常選的就是它們
const spotOptions = computed(() => {
  const dayOf = (s: { day: number | null }) => (s.day !== null && s.day <= store.dayCount ? s.day : Infinity)
  return [...(store.data?.spots ?? [])]
    .sort((a, b) => Number(b.category === 'shop') - Number(a.category === 'shop') || dayOf(a) - dayOf(b) || a.sort_key - b.sort_key)
    .map((s) => ({ value: s.id, label: `${dayOf(s) === Infinity ? '口袋' : `D${s.day}`} ${s.title}` }))
})

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.recipient.trim()) e.recipient = '請輸入幫誰買'
  else if ([...form.recipient.trim()].length > 20) e.recipient = '最多 20 個字'
  if (!form.title.trim()) e.title = '請輸入要買什麼'
  else if ([...form.title.trim()].length > 80) e.title = '最多 80 個字'
  if (!(Number.isInteger(form.qty) && form.qty >= 1 && form.qty <= 999)) e.qty = '數量是 1～999'
  if (form.url.trim() && !safeUrl(form.url)) e.url = '請貼上 http 或 https 開頭的連結'
  if (form.note.length > 1000) e.note = '最多 1000 個字'
  return e
})

async function pickPhotos(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = [...(input.files ?? [])].slice(0, MAX_WISH_PHOTOS - photoCount.value)
  input.value = ''
  busyPhoto.value = true
  try {
    for (const f of files) added.value.push(await compressPhoto(f))
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busyPhoto.value = false
  }
}

async function syncPhotos(itemId: Id) {
  for (const id of removed.value) await repo.deleteWishPhoto(id)
  for (const p of added.value) {
    const saved = await repo.addWishPhoto(itemId, p)
    primePhoto(saved.id, p.thumb, p.full)
  }
}

async function submit() {
  touched.value = true
  if (Object.keys(errors.value).length) return
  const content = {
    recipient: form.recipient.trim(),
    title: form.title.trim(),
    qty: form.qty,
    note: form.note.trim(),
    url: form.url.trim() ? safeUrl(form.url)! : '',
  }
  const spotId = form.spot || null
  saving.value = true
  try {
    if (!base.value) {
      const created = await store.mutate(() =>
        repo.createWishItem({ ...content, spot_id: spotId, status: form.status, sort_key: keyAfter(store.wishItems.at(-1)?.sort_key) }),
      )
      // 項目已經建好，照片失敗也要關掉表單，否則再按一次儲存會多建一個
      try {
        if (added.value.length) await store.mutate(() => syncPhotos(created.id))
      } catch (e) {
        toast.error(`項目存好了，但照片沒存成功：${errorMessage(e)}`)
      }
      emit('close')
      return
    }
    const target = base.value
    const outcome = await saveWithConflict('個代購項目', (useLatest) =>
      store.mutate(async () => {
        await repo.updateWishItem(target.id, useLatest ? (latest.value?.version ?? target.version) : target.version, content)
        if (spotId !== (latest.value?.spot_id ?? null)) await repo.setWishSpot([target.id], spotId)
        if (form.status !== latest.value?.status) await repo.setWishStatus(target.id, form.status)
        await syncPhotos(target.id)
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
  const ok = await confirmDialog({
    title: `刪除「${target.title}」？`,
    message: record.value ? '已經記的帳會留著，只是不再連到這個項目。' : '照片會一起刪掉。',
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteWishItem(target.id))
    emit('close')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="base ? '編輯代購' : '新增代購'" @close="emit('close')">
    <StaleNotice v-if="stale || gone" :gone="gone" @reload="fill(latest)" />
    <form id="wish-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
        <div class="min-w-0">
          <label class="label" for="wish-recipient">幫誰買</label>
          <input id="wish-recipient" v-model="form.recipient" class="input" maxlength="20" placeholder="例如：媽媽" autocomplete="off" />
        </div>
        <div class="min-w-0">
          <label class="label" for="wish-title">買什麼</label>
          <input id="wish-title" v-model="form.title" class="input" maxlength="80" placeholder="例如：面膜" autocomplete="off" />
        </div>
      </div>
      <p v-if="touched && (errors.recipient || errors.title)" class="-mt-2 text-xs text-rose-500">{{ errors.recipient || errors.title }}</p>

      <div class="flex items-center justify-between gap-3">
        <span class="label mb-0" id="wish-qty-label">數量</span>
        <div class="flex items-center gap-1" role="group" aria-labelledby="wish-qty-label">
          <button type="button" class="icon-btn" aria-label="減一" :disabled="form.qty <= 1" @click="form.qty = Math.max(1, form.qty - 1)"><Minus class="size-4" /></button>
          <input v-model.number="form.qty" class="input num w-16 py-2 text-center" inputmode="numeric" aria-label="數量" />
          <button type="button" class="icon-btn" aria-label="加一" @click="form.qty = Math.min(999, form.qty + 1)"><Plus class="size-4" /></button>
        </div>
      </div>
      <p v-if="touched && errors.qty" class="-mt-2 text-xs text-rose-500">{{ errors.qty }}</p>

      <fieldset>
        <legend class="label">狀態</legend>
        <div class="grid grid-cols-3 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800" role="radiogroup" aria-label="狀態">
          <button
            v-for="s in WISH_STATUSES"
            :key="s.value"
            type="button"
            role="radio"
            :aria-checked="form.status === s.value"
            class="rounded-xl py-2 text-sm font-bold transition"
            :class="form.status === s.value ? 'bg-white text-ink-900 shadow-soft dark:bg-ink-600 dark:text-white' : 'text-ink-400'"
            @click="form.status = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </fieldset>

      <div>
        <span class="label">照片（最多 {{ MAX_WISH_PHOTOS }} 張）</span>
        <div class="flex flex-wrap gap-2">
          <div v-for="p in savedPhotos" :key="p.id" class="relative">
            <button type="button" class="block size-20" :aria-label="`看 ${form.title || '代購'} 的照片`" @click="viewing = { id: p.id }">
              <WishThumb :photo-id="p.id" :alt="form.title" class="size-20" />
            </button>
            <button type="button" class="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white" aria-label="刪掉這張照片" @click="removed.push(p.id)">
              <X class="size-3.5" />
            </button>
          </div>
          <div v-for="(p, i) in added" :key="`new-${i}`" class="relative">
            <button type="button" class="block size-20 overflow-hidden rounded-xl" :aria-label="`看 ${form.title || '代購'} 的照片`" @click="viewing = { src: p.full }">
              <img :src="p.thumb" :alt="form.title" class="size-full object-cover" />
            </button>
            <button type="button" class="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white" aria-label="刪掉這張照片" @click="added.splice(i, 1)">
              <X class="size-3.5" />
            </button>
          </div>
          <label
            v-if="photoCount < MAX_WISH_PHOTOS"
            class="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-300 text-xs font-semibold text-ink-400 dark:border-ink-600"
          >
            <Camera class="size-5" />{{ busyPhoto ? '處理中…' : '加照片' }}
            <input type="file" accept="image/*" class="sr-only" :multiple="MAX_WISH_PHOTOS - photoCount > 1" :disabled="busyPhoto" @change="pickPhotos" />
          </label>
        </div>
      </div>

      <div>
        <label class="label" for="wish-spot">在哪買（選填）</label>
        <select id="wish-spot" v-model="form.spot" class="input">
          <option value="">還沒決定</option>
          <option v-for="s in spotOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div>
        <label class="label" for="wish-note">規格備註（選填）</label>
        <textarea id="wish-note" v-model="form.note" class="input min-h-16" maxlength="1000" placeholder="顏色、尺寸、口味…" />
      </div>
      <div>
        <label class="label" for="wish-url">商品連結（選填）</label>
        <div class="flex gap-2">
          <input id="wish-url" v-model="form.url" class="input min-w-0 flex-1" inputmode="url" placeholder="https://…" autocomplete="off" />
          <a v-if="safeUrl(form.url)" :href="safeUrl(form.url)!" target="_blank" rel="noopener noreferrer" class="icon-btn shrink-0 self-center" aria-label="打開商品連結">
            <ExternalLink class="size-4" />
          </a>
        </div>
        <p v-if="touched && errors.url" class="mt-1 text-xs text-rose-500">{{ errors.url }}</p>
      </div>

      <p v-if="record" class="num rounded-2xl bg-sea-100 px-3.5 py-2.5 text-sm text-ink-700 dark:bg-sea-400/10 dark:text-ink-100">
        已記帳：「{{ record.expense.title }}」{{ formatMoney(record.proxy.amount, record.expense.currency) }}<template v-if="record.expense.currency !== 'TWD'"> ≈ {{ formatMoney(record.twd) }}</template>
      </p>
      <button v-if="base && !gone" type="button" class="btn-ghost -ml-2 text-rose-500" @click="remove"><Trash2 class="size-4" />刪除</button>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="wish-form" class="btn-primary flex-1" :disabled="saving || busyPhoto">{{ saving ? '儲存中…' : '儲存' }}</button>
    </template>
  </ModalSheet>
  <PhotoViewer :photo-id="viewing?.id" :src="viewing?.src" :alt="form.title" @close="viewing = null" />
</template>
