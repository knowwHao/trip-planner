<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ReceiptText, Trash2 } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import StaleNotice from './StaleNotice.vue'
import type { Spot, SpotItem } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { safeUrl } from '@/lib/maps'
import { itemWords } from '@/lib/category'
import { keyAfter } from '@/lib/order'

const props = defineProps<{
  open: boolean
  /** 子項目屬於哪個行程 */
  spot: Spot | null
  /** 有值是編輯 */
  item?: SpotItem | null
}>()
const emit = defineEmits<{ close: []; 'add-expense': [item: SpotItem] }>()

const store = useTripStore()
const words = computed(() => itemWords(props.spot?.category ?? 'other'))

const form = reactive({ title: '', address: '', mapUrl: '', note: '' })
const base = ref<SpotItem | null>(null)
const touched = ref(false)
const saving = ref(false)

function fill(i: SpotItem | null | undefined) {
  base.value = i ?? null
  Object.assign(form, { title: i?.title ?? '', address: i?.address ?? '', mapUrl: i?.map_url ?? '', note: i?.note ?? '' })
  touched.value = false
}

watch(
  () => props.open,
  (open) => open && fill(props.item),
  { immediate: true },
)

const latest = computed(() => (base.value ? (store.data?.items.find((i) => i.id === base.value!.id) ?? null) : null))
const gone = computed(() => !!base.value && !latest.value)
const stale = computed(() => !!base.value && !!latest.value && latest.value.version !== base.value.version)

const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!form.title.trim()) e.title = '請輸入名稱'
  else if ([...form.title.trim()].length > 80) e.title = '最多 80 個字'
  if (form.mapUrl.trim() && !safeUrl(form.mapUrl)) e.mapUrl = '請貼上 http 或 https 開頭的連結'
  if (form.address.length > 200) e.address = '最多 200 個字'
  if (form.note.length > 1000) e.note = '最多 1000 個字'
  return e
})

async function submit() {
  touched.value = true
  if (Object.keys(errors.value).length || !props.spot) return
  const content = {
    title: form.title.trim(),
    address: form.address.trim(),
    map_url: form.mapUrl.trim() ? safeUrl(form.mapUrl)! : '',
    note: form.note.trim(),
  }
  const spotId = props.spot.id
  saving.value = true
  try {
    if (!base.value) {
      const last = store.itemsBySpot.get(spotId)?.at(-1)?.sort_key
      await store.mutate(() => repo.createItem({ ...content, spot_id: spotId, sort_key: keyAfter(last) }))
      emit('close')
      return
    }
    const target = base.value
    const outcome = await saveWithConflict(`個${words.value.noun}`, (useLatest) =>
      store.mutate(() => repo.updateItem(target.id, useLatest ? (latest.value?.version ?? target.version) : target.version, content)),
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
  const ok = await confirmDialog({ title: `刪除「${target.title}」？`, confirmText: '刪除', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteItem(target.id))
    emit('close')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="`${base ? '編輯' : '新增'}${words.noun}`" @close="emit('close')">
    <p v-if="spot" class="-mt-1 mb-3 text-sm text-ink-400">在「{{ spot.title }}」底下</p>
    <StaleNotice v-if="stale || gone" :gone="gone" @reload="fill(latest)" />
    <form id="item-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="item-title">名稱</label>
        <input id="item-title" v-model="form.title" class="input" maxlength="80" :placeholder="spot?.category === 'shop' ? '例如：UNIQLO 銀座店' : ''" autocomplete="off" />
        <p v-if="touched && errors.title" class="mt-1 text-xs text-rose-500">{{ errors.title }}</p>
      </div>
      <div>
        <label class="label" for="item-address">地址（選填）</label>
        <input id="item-address" v-model="form.address" class="input" maxlength="200" autocomplete="off" />
      </div>
      <div>
        <label class="label" for="item-map">Google 地圖連結（選填）</label>
        <input id="item-map" v-model="form.mapUrl" class="input" inputmode="url" placeholder="https://maps.app.goo.gl/…" autocomplete="off" />
        <p v-if="touched && errors.mapUrl" class="mt-1 text-xs text-rose-500">{{ errors.mapUrl }}</p>
        <p v-else class="mt-1 text-xs text-ink-400">沒填就用地址搜尋，兩個都沒填就不放地圖</p>
      </div>
      <div>
        <label class="label" for="item-note">備註（選填）</label>
        <textarea id="item-note" v-model="form.note" class="input min-h-20" maxlength="1000" placeholder="例如：要買眼藥水" />
      </div>
      <div v-if="base && !gone" class="flex flex-wrap items-center gap-x-1">
        <button type="button" class="btn-ghost -ml-2 text-rose-500" @click="remove"><Trash2 class="size-4" />刪除</button>
        <span class="flex-1" />
        <button type="button" class="btn-ghost -mr-2" @click="emit('add-expense', base)"><ReceiptText class="size-4" />記一筆旅費</button>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="item-form" class="btn-primary flex-1" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
    </template>
  </ModalSheet>
</template>
