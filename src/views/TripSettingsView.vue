<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-vue-next'
import ParticipantAvatar from '@/components/ParticipantAvatar.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import TripFormModal from '@/components/TripFormModal.vue'
import MemberPickerModal from '@/components/MemberPickerModal.vue'
import type { AccountInfo, Participant, TripInput } from '@/types'
import { repo } from '@/data'
import { InUseError } from '@/data/repository'
import { useTripStore } from '@/stores/trip'
import { saveWithConflict } from '@/composables/useConflict'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { formatRange, tripDayCount } from '@/lib/format'
import { currencyInfo, formatRate } from '@/lib/money'

const router = useRouter()
const store = useTripStore()
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
// 被移出的人排在最後；他們的旅費紀錄還在，照常結算
const members = computed(() => store.participants.filter((p) => p.account_id))
const formerMembers = computed(() => store.participants.filter((p) => !p.account_id))

async function removePerson(p: Participant) {
  const ok = await confirmDialog({ title: `刪掉 ${p.name}？`, message: '只有沒有任何旅費或轉帳紀錄時才能刪掉。', confirmText: '刪掉', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteParticipant(p.id))
  } catch (e) {
    toast.error(e instanceof InUseError ? `${p.name} 還有旅費或轉帳紀錄，要先刪掉那些紀錄才能移除` : errorMessage(e))
  }
}

// ---------- 成員 ----------
/** add：加入成員；Participant：把這位已移出的人加回來 */
const picker = ref<'add' | Participant | null>(null)
const memberIds = computed(() => store.participants.flatMap((p) => (p.account_id ? [p.account_id] : [])))
const pickerTitle = computed(() => (picker.value && picker.value !== 'add' ? `把「${picker.value.name}」加回旅程` : '加入成員'))
const pickerHint = computed(() =>
  picker.value && picker.value !== 'add'
    ? `選他的帳號：${picker.value.name} 之前的旅費紀錄會接回去，名字改成帳號名稱，登入後就看得到這趟旅程。`
    : '加進來的人登入後就能看到並編輯這趟旅程。名單是所有註冊的使用者，找不到人的話請他先註冊。',
)

async function pick(a: AccountInfo) {
  const target = picker.value
  picker.value = null
  try {
    if (target && target !== 'add') {
      await store.mutate(() => repo.addMember(a.id, target.id))
      toast.success(`已把 ${a.name} 加回旅程`)
    } else {
      await store.mutate(() => repo.addMember(a.id))
      toast.success(`已把 ${a.name} 加進旅程`)
    }
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function removeMember(p: Participant) {
  const ok = await confirmDialog({
    title: `把 ${p.name} 移出旅程？`,
    message: `${p.name} 會看不到這趟旅程；他的旅費紀錄會留著、照常結算。之後可以再加回來。`,
    confirmText: '移出',
    danger: true,
  })
  if (!ok) return
  try {
    await store.mutate(() => repo.removeMember(p.id))
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

// ---------- 退出與刪除 ----------
async function leave() {
  const me = store.me
  if (!me) return
  const ok = await confirmDialog({
    title: '退出這趟旅程？',
    message: '你會看不到這趟旅程；你的旅費紀錄會留著。要回來的話請其他成員再把你加進來。',
    confirmText: '退出',
    danger: true,
  })
  if (!ok) return
  try {
    await repo.removeMember(me.id)
    repo.notify()
    toast.success(`已退出「${trip.value.name}」`)
    await router.push('/')
  } catch (e) {
    toast.error(errorMessage(e))
  }
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
      <div class="flex items-start justify-between gap-3">
        <h2 class="section-title">旅伴（{{ members.length }}）</h2>
        <button type="button" class="btn-ghost -my-2 -mr-2 px-3 py-1.5" @click="picker = 'add'"><UserPlus class="size-4" />加入成員</button>
      </div>
      <p class="mt-1 text-xs leading-relaxed text-ink-400">旅伴都看得到也能編輯這趟旅程，任何人都能加人或移出。幫不是旅伴的人買東西，在記旅費時用「代購」。</p>
      <ul class="mt-3 space-y-1">
        <li v-for="p in members" :key="p.id" class="flex min-h-11 items-center gap-2.5">
          <ParticipantAvatar :id="p.id" :name="p.name" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ p.name }}</span>
            <span v-if="p.id === store.me?.id" class="block text-xs text-ink-400">你</span>
          </span>
          <button v-if="p.id !== store.me?.id" type="button" class="icon-btn shrink-0" :aria-label="`把 ${p.name} 移出旅程`" @click="removeMember(p)">
            <UserMinus class="size-4" />
          </button>
        </li>
      </ul>
      <template v-if="formerMembers.length">
        <p class="mt-4 mb-1 text-xs font-bold text-ink-400">已移出（旅費紀錄照常結算）</p>
        <ul class="space-y-1">
          <li v-for="p in formerMembers" :key="p.id" class="flex min-h-11 items-center gap-2.5 opacity-70">
            <ParticipantAvatar :id="p.id" :name="p.name" />
            <span class="min-w-0 flex-1 truncate font-semibold">{{ p.name }}</span>
            <button type="button" class="icon-btn shrink-0" :aria-label="`把 ${p.name} 加回旅程`" title="加回旅程" @click="picker = p"><UserPlus class="size-4" /></button>
            <button type="button" class="icon-btn shrink-0" :aria-label="`刪掉 ${p.name}`" @click="removePerson(p)"><Trash2 class="size-4" /></button>
          </li>
        </ul>
      </template>
    </section>

    <section class="card flex items-center justify-between gap-3 p-5">
      <div>
        <h2 class="section-title">外觀</h2>
        <p class="mt-1 text-xs text-ink-400">淺色、深色或跟隨系統</p>
      </div>
      <ThemeToggle />
    </section>

    <section class="card p-5">
      <h2 class="section-title">退出或刪除</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <button v-if="store.me" type="button" class="btn-outline" @click="leave"><LogOut class="size-4" />退出這趟旅程</button>
        <button type="button" class="btn-danger" @click="destroy"><Trash2 class="size-4" />刪除整趟旅程</button>
      </div>
    </section>

    <MemberPickerModal :open="picker !== null" :title="pickerTitle" :hint="pickerHint" :joined="memberIds" @close="picker = null" @pick="pick" />
    <TripFormModal :open="editingTrip" :trip="tripBase" :latest="store.trip" :saving="savingTrip" @close="editingTrip = false" @submit="saveTrip" />
  </div>
</template>
