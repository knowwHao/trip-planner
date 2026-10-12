<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Copy, Eye, EyeOff, LogOut, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-vue-next'
import ParticipantAvatar from '@/components/ParticipantAvatar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import TripFormModal from '@/components/TripFormModal.vue'
import type { Participant, TripInput } from '@/types'
import { repo } from '@/data'
import { InUseError } from '@/data/repository'
import { useTripStore } from '@/stores/trip'
import { useSavedTrips } from '@/stores/saved'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { formatRange, tripDayCount } from '@/lib/format'
import { currencyInfo, formatRate } from '@/lib/money'

const router = useRouter()
const store = useTripStore()
const saved = useSavedTrips()
const trip = computed(() => store.trip!)

// ---------- 旅程資訊 ----------
const editingTrip = ref(false)
const tripBase = ref(store.trip)
const savingTrip = ref(false)

function openTripForm() {
  tripBase.value = store.trip
  editingTrip.value = true
}

async function saveTrip(input: TripInput) {
  const target = tripBase.value!
  const outside = (store.data?.spots ?? []).filter((s) => s.day !== null && s.day > tripDayCount(input)).length
  if (outside) {
    const ok = await confirmDialog({
      title: '旅程變短了',
      message: `有 ${outside} 個景點排在新的天數之後，會先顯示在口袋名單，之後可以再拖回去。`,
      confirmText: '繼續儲存',
    })
    if (!ok) return
  }
  savingTrip.value = true
  try {
    const outcome = await saveWithConflict('趟旅程的資訊', (useLatest) =>
      store.mutate(() => repo.updateTrip(useLatest ? store.trip!.version : target.version, input)),
    )
    if (outcome === 'saved') {
      editingTrip.value = false
      toast.success('已更新旅程資訊')
    } else if (outcome === 'reload') {
      tripBase.value = store.trip
      editingTrip.value = false
      // 關掉再打開，表單才會帶入最新內容
      setTimeout(() => (editingTrip.value = true))
    }
  } finally {
    savingTrip.value = false
  }
}

// ---------- 旅伴 ----------
const newNames = ref('')
const adding = ref(false)
const renamingId = ref<string | null>(null)
const renameText = ref('')
const renameBase = ref<Participant | null>(null)

async function addPeople() {
  const existing = new Set(store.participants.map((p) => p.name))
  const names = [...new Set(newNames.value.split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean))]
  if (!names.length) return
  const dup = names.filter((n) => existing.has(n))
  if (dup.length) return toast.error(`已經有 ${dup.join('、')} 了`)
  if (names.some((n) => [...n].length > 20)) return toast.error('每個名字最多 20 個字')
  adding.value = true
  try {
    const start = Math.max(-1, ...store.participants.map((p) => p.sort_order)) + 1
    await store.mutate(() => repo.addParticipants(names.map((name, i) => ({ name, sort_order: start + i }))))
    newNames.value = ''
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    adding.value = false
  }
}

function startRename(p: Participant) {
  renamingId.value = p.id
  renameText.value = p.name
  renameBase.value = p
}

async function saveRename() {
  const target = renameBase.value
  const name = renameText.value.trim()
  if (!target) return
  if (!name || name === target.name) {
    renamingId.value = null
    return
  }
  if ([...name].length > 20) return toast.error('名字最多 20 個字')
  const outcome = await saveWithConflict('位旅伴', (useLatest) =>
    store.mutate(() =>
      repo.renameParticipant(target.id, useLatest ? (store.participantMap.get(target.id)?.version ?? target.version) : target.version, name),
    ),
  )
  if (outcome !== 'failed') renamingId.value = null
}

async function removePerson(p: Participant) {
  const ok = await confirmDialog({ title: `移除 ${p.name}？`, confirmText: '移除', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteParticipant(p.id))
  } catch (e) {
    toast.error(e instanceof InUseError ? `${p.name} 還有旅費或轉帳紀錄，要先刪掉那些紀錄才能移除` : errorMessage(e))
  }
}

// ---------- 旅程連結 ----------
const token = computed(() => saved.find(trip.value.id)?.token ?? '')
const tripUrl = computed(() => (token.value ? `${location.origin}${location.pathname}#/t/${token.value}` : ''))
// 預設遮住 token，避免設定頁截圖或旁人瞄到就外流
const showToken = ref(false)
const displayUrl = computed(() =>
  showToken.value || !token.value ? tripUrl.value : `${location.origin}${location.pathname}#/t/••••••${token.value.slice(-4)}`,
)
const regenerating = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(tripUrl.value)
    toast.success('已複製旅程連結，貼給旅伴就能一起編輯')
  } catch {
    showToken.value = true
    toast.error('無法自動複製，請長按連結手動複製')
  }
}

async function regenerate() {
  const ok = await confirmDialog({
    title: '重新產生旅程連結？',
    message: '舊連結會立即失效，其他旅伴要用新連結重新開啟。連結不小心外流時才需要這樣做。',
    confirmText: '重新產生',
    danger: true,
  })
  if (!ok) return
  regenerating.value = true
  try {
    const next = await repo.regenerateToken()
    store.replaceToken(next)
    showToken.value = true
    toast.success('已換成新連結，記得傳給旅伴')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    regenerating.value = false
  }
}

// ---------- 移除與刪除 ----------
async function forget() {
  const ok = await confirmDialog({
    title: '從這台裝置移除？',
    message: '只是這台裝置不再記得這趟旅程，資料還在，之後用旅程連結可以再開。',
    confirmText: '移除',
  })
  if (!ok) return
  saved.remove(trip.value.id)
  await router.push('/')
}

async function destroy() {
  const name = trip.value.name
  const ok = await confirmDialog({
    title: `刪除「${name}」？`,
    message: '整趟旅程的行程、旅費、轉帳紀錄都會永久刪除，所有旅伴都會看不到，無法復原。',
    confirmText: '永久刪除',
    danger: true,
  })
  if (!ok) return
  try {
    await repo.deleteTrip()
    repo.notify()
    saved.remove(trip.value.id)
    toast.success(`已刪除「${name}」`)
    await router.push('/')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-black tracking-tight">設定</h1>

    <section class="card p-5">
      <div class="flex items-start justify-between gap-3">
        <h2 class="section-title">旅程資訊</h2>
        <button type="button" class="btn-ghost -my-2 -mr-2 px-3 py-1.5" @click="openTripForm"><Pencil class="size-4" />編輯</button>
      </div>
      <dl class="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-y-2 text-sm">
        <dt class="text-ink-400">名稱</dt>
        <dd class="font-semibold break-words">{{ trip.name }}</dd>
        <dt class="text-ink-400">日期</dt>
        <dd class="font-semibold">{{ formatRange(trip.start_date, trip.end_date) }}・{{ store.dayCount }} 天</dd>
        <dt class="text-ink-400">當地幣別</dt>
        <dd class="font-semibold">{{ currencyInfo(trip.currency).flag }} {{ currencyInfo(trip.currency).name }}（{{ trip.currency }}）</dd>
        <template v-if="trip.currency !== 'TWD'">
          <dt class="text-ink-400">匯率</dt>
          <dd class="num font-semibold">1 {{ trip.currency }} = {{ formatRate(trip.fx_rate) }} 元</dd>
        </template>
      </dl>
    </section>

    <section class="card p-5">
      <h2 class="section-title">旅伴（{{ store.participants.length }}）</h2>
      <ul class="mt-3 space-y-1">
        <li v-for="p in store.participants" :key="p.id" class="flex min-h-11 items-center gap-2.5">
          <ParticipantAvatar :id="p.id" :name="p.name" />
          <template v-if="renamingId === p.id">
            <form class="flex min-w-0 flex-1 gap-1" @submit.prevent="saveRename">
              <label :for="`rename-${p.id}`" class="sr-only">新名字</label>
              <input :id="`rename-${p.id}`" v-model="renameText" class="input min-w-0 flex-1 py-1.5" maxlength="20" autocomplete="off" />
              <button type="submit" class="icon-btn shrink-0" aria-label="儲存"><Check class="size-4" /></button>
              <button type="button" class="icon-btn shrink-0" aria-label="取消" @click="renamingId = null"><X class="size-4" /></button>
            </form>
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate font-semibold">{{ p.name }}</span>
            <button type="button" class="icon-btn shrink-0" :aria-label="`改 ${p.name} 的名字`" @click="startRename(p)"><Pencil class="size-4" /></button>
            <button type="button" class="icon-btn shrink-0" :aria-label="`移除 ${p.name}`" @click="removePerson(p)"><Trash2 class="size-4" /></button>
          </template>
        </li>
      </ul>
      <form class="mt-3 flex gap-2" @submit.prevent="addPeople">
        <label for="new-people" class="sr-only">新增旅伴</label>
        <input id="new-people" v-model="newNames" class="input min-w-0 flex-1" placeholder="名字，多位用空白或逗號分開" autocomplete="off" />
        <button type="submit" class="btn-dark shrink-0" :disabled="adding || !newNames.trim()"><Plus class="size-4" />新增</button>
      </form>
    </section>

    <section class="card p-5">
      <h2 class="section-title">旅程連結</h2>
      <p class="mt-1 text-xs leading-relaxed text-ink-400">拿到這個連結的人都能查看與編輯這趟旅程，請只傳給一起去的旅伴。</p>
      <div class="mt-3 rounded-2xl bg-ink-50 px-3.5 py-2.5 font-mono text-xs break-all text-ink-600 dark:bg-ink-800 dark:text-ink-200">{{ displayUrl }}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-primary" :disabled="!tripUrl" @click="copy"><Copy class="size-4" />複製連結</button>
        <button type="button" class="btn-ghost" :disabled="!tripUrl" :aria-pressed="showToken" @click="showToken = !showToken">
          <component :is="showToken ? EyeOff : Eye" class="size-4" />{{ showToken ? '隱藏' : '顯示' }}
        </button>
        <button type="button" class="btn-ghost" :disabled="regenerating" @click="regenerate">
          <RefreshCw class="size-4" :class="regenerating && 'animate-spin'" />重新產生
        </button>
      </div>
    </section>

    <section class="card flex items-center justify-between gap-3 p-5">
      <div>
        <h2 class="section-title">外觀</h2>
        <p class="mt-1 text-xs text-ink-400">淺色、深色或跟隨系統</p>
      </div>
      <ThemeToggle />
    </section>

    <section class="card p-5">
      <h2 class="section-title">移除或刪除</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-outline" @click="forget"><LogOut class="size-4" />從這台裝置移除</button>
        <button type="button" class="btn-danger" @click="destroy"><Trash2 class="size-4" />刪除整趟旅程</button>
      </div>
    </section>

    <TripFormModal :open="editingTrip" :trip="tripBase" :latest="store.trip" :saving="savingTrip" @close="editingTrip = false" @submit="saveTrip" />
  </div>
</template>
