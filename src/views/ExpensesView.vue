<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, ArrowRightLeft, PartyPopper, Plus, ReceiptText, Trash2, UsersRound } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import ParticipantAvatar from '@/components/ParticipantAvatar.vue'
import ExpenseFormModal from '@/components/ExpenseFormModal.vue'
import TransferModal from '@/components/TransferModal.vue'
import type { Expense, Id } from '@/types'
import { repo } from '@/data'
import { useTripStore } from '@/stores/trip'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { formatDate } from '@/lib/format'
import { formatMoney, formatRate } from '@/lib/money'
import { expenseTwd, groupShares } from '@/lib/split'

const store = useTripStore()
const trip = computed(() => store.trip!)
const data = computed(() => store.data!)

const total = computed(() => data.value.expenses.reduce((s, e) => s + expenseTwd(e, trip.value), 0))
const sharesByExpense = computed(() => groupShares(data.value.shares))

/** 依日期分組，新的在前；沒指定日期的放最後 */
const groups = computed(() => {
  const map = new Map<string, Expense[]>()
  const sorted = [...data.value.expenses].sort(
    (a, b) => (b.spent_on ?? '').localeCompare(a.spent_on ?? '') || b.created_at.localeCompare(a.created_at),
  )
  for (const e of sorted) {
    const key = e.spent_on ?? ''
    const list = map.get(key)
    if (list) list.push(e)
    else map.set(key, [e])
  }
  const entries = [...map].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
  return entries.map(([date, list]) => ({ date, label: date ? formatDate(date, true) : '沒指定日期', list }))
})

function splitLabel(e: Expense) {
  const n = sharesByExpense.value.get(e.id)?.length ?? 0
  return e.split_mode === 'custom' ? `${n} 人各付各的` : `${n} 人平分`
}

const transfers = computed(() =>
  [...data.value.transfers].sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at)),
)

const expenseOpen = ref(false)
const editing = ref<Expense | null>(null)
const transferOpen = ref(false)
const transferPreset = ref<{ from: Id; to: Id; amount: number } | null>(null)

function addExpense() {
  editing.value = null
  expenseOpen.value = true
}

function editExpense(e: Expense) {
  editing.value = e
  expenseOpen.value = true
}

function recordTransfer(preset: { from: Id; to: Id; amount: number } | null) {
  transferPreset.value = preset
  transferOpen.value = true
}

async function removeTransfer(id: Id, label: string) {
  const ok = await confirmDialog({ title: '刪除這筆轉帳？', message: label, confirmText: '刪除', danger: true })
  if (!ok) return
  try {
    await store.mutate(() => repo.deleteTransfer(id))
  } catch (e) {
    toast.error(errorMessage(e))
  }
}
</script>

<template>
  <div>
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-black tracking-tight">旅費</h1>
        <p v-if="trip.currency !== 'TWD'" class="mt-1 text-sm text-ink-400 dark:text-ink-300">
          結算匯率 1 {{ trip.currency }} = {{ formatRate(trip.fx_rate) }} 元・<RouterLink :to="`/trips/${trip.id}/settings`" class="font-semibold text-sea-700 dark:text-sea-300">改匯率</RouterLink>
        </p>
      </div>
      <div v-if="store.participants.length" class="flex gap-2">
        <button type="button" class="btn-outline" :disabled="store.participants.length < 2" @click="recordTransfer(null)">
          <ArrowRightLeft class="size-4" />記轉帳
        </button>
        <button type="button" class="btn-primary" @click="addExpense"><Plus class="size-4" />記一筆</button>
      </div>
    </div>

    <div v-if="!store.participants.length" class="card">
      <EmptyState :icon="UsersRound" title="先加入旅伴" description="記旅費要知道誰付錢、誰分攤，先到設定把一起去的人加進來">
        <RouterLink :to="`/trips/${trip.id}/settings`" class="btn-primary"><UsersRound class="size-4" />新增旅伴</RouterLink>
      </EmptyState>
    </div>

    <template v-else>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="card p-5">
          <p class="section-title">總花費</p>
          <p class="num mt-1 text-3xl font-black tracking-tight">{{ formatMoney(total) }}</p>
          <p class="mt-1 text-xs text-ink-400">
            {{ data.expenses.length }} 筆<template v-if="store.participants.length">・平均每人 {{ formatMoney(Math.round(total / store.participants.length)) }}</template>
          </p>

          <h2 class="section-title mt-5 mb-2">轉帳建議</h2>
          <ul v-if="store.settlements.length" class="space-y-2">
            <li v-for="s in store.settlements" :key="`${s.from}-${s.to}`" class="flex items-center gap-2 rounded-2xl bg-ink-50 py-2 pr-2 pl-3 dark:bg-ink-800/60">
              <span class="min-w-0 flex-1 truncate text-sm font-semibold">
                {{ store.participantName(s.from) }} <ArrowRight class="mx-0.5 inline size-3.5 text-ink-400" /> {{ store.participantName(s.to) }}
              </span>
              <span class="num shrink-0 font-bold">{{ formatMoney(s.amount) }}</span>
              <button type="button" class="btn-dark shrink-0 px-3 py-1.5 text-xs" @click="recordTransfer({ from: s.from, to: s.to, amount: s.amount })">已轉帳</button>
            </li>
          </ul>
          <p v-else-if="data.expenses.length" class="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-300">
            <PartyPopper class="size-4 text-sea-500" />大家都打平了
          </p>
          <p v-else class="text-sm text-ink-400">記了旅費之後，這裡會算出最少要轉幾筆</p>
        </section>

        <section class="card p-5">
          <h2 class="section-title mb-3">每個人</h2>
          <div class="-mx-1 overflow-x-auto">
            <table class="num w-full text-sm">
              <thead>
                <tr class="text-xs text-ink-400">
                  <th class="px-1 pb-2 text-left font-semibold">旅伴</th>
                  <th class="px-1 pb-2 text-right font-semibold">代墊</th>
                  <th class="px-1 pb-2 text-right font-semibold">自己花</th>
                  <th class="px-1 pb-2 text-right font-semibold">要收／要付</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in store.memberSummaries" :key="m.participant_id" class="border-t border-ink-100 dark:border-ink-800">
                  <td class="px-1 py-2">
                    <span class="flex items-center gap-2 font-semibold">
                      <ParticipantAvatar :id="m.participant_id" :name="store.participantName(m.participant_id)" size="sm" />
                      <span class="truncate">{{ store.participantName(m.participant_id) }}</span>
                    </span>
                  </td>
                  <td class="px-1 py-2 text-right">{{ formatMoney(m.paid) }}</td>
                  <td class="px-1 py-2 text-right">{{ formatMoney(m.share) }}</td>
                  <td
                    class="px-1 py-2 text-right font-bold whitespace-nowrap"
                    :class="m.net > 0 ? 'text-sea-600 dark:text-sea-400' : m.net < 0 ? 'text-rose-500' : 'text-ink-400'"
                  >
                    {{ m.net > 0 ? `收 ${formatMoney(m.net)}` : m.net < 0 ? `付 ${formatMoney(-m.net)}` : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-3 text-xs leading-relaxed text-ink-400">「要收／要付」已扣掉記下的轉帳；外幣用上面的匯率換成新台幣，有填實際扣款的照實際扣款算。</p>
        </section>
      </div>

      <section class="mt-8">
        <h2 class="section-title mb-3">旅費紀錄</h2>
        <div v-if="!groups.length" class="card">
          <EmptyState :icon="ReceiptText" title="還沒有旅費" description="誰先付了錢就記一筆，可以平分或各付各的">
            <button type="button" class="btn-primary" @click="addExpense"><Plus class="size-4" />記一筆</button>
          </EmptyState>
        </div>
        <div v-for="g in groups" :key="g.date" class="mb-5">
          <p class="mb-2 px-1 text-xs font-bold text-ink-400">{{ g.label }}</p>
          <div class="card divide-y divide-ink-100 overflow-hidden dark:divide-ink-800">
            <button
              v-for="e in g.list"
              :key="e.id"
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
              @click="editExpense(e)"
            >
              <ParticipantAvatar :id="e.payer_id" :name="store.participantName(e.payer_id)" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{{ e.title }}</p>
                <p class="truncate text-xs text-ink-400 dark:text-ink-300">{{ store.participantName(e.payer_id) }} 付・{{ splitLabel(e) }}</p>
              </div>
              <div class="num shrink-0 text-right">
                <p class="font-bold">{{ formatMoney(e.amount, e.currency) }}</p>
                <p v-if="e.currency !== 'TWD'" class="text-xs text-ink-400">{{ e.twd_amount !== null ? '實扣' : '≈' }} {{ formatMoney(expenseTwd(e, trip)) }}</p>
              </div>
            </button>
          </div>
        </div>
      </section>

      <section v-if="transfers.length" class="mt-8">
        <h2 class="section-title mb-3">已轉帳</h2>
        <div class="card divide-y divide-ink-100 overflow-hidden dark:divide-ink-800">
          <div v-for="t in transfers" :key="t.id" class="flex items-center gap-3 py-2.5 pr-2 pl-4">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">
                {{ store.participantName(t.from_id) }} <ArrowRight class="mx-0.5 inline size-3.5 text-ink-400" /> {{ store.participantName(t.to_id) }}
              </p>
              <p class="truncate text-xs text-ink-400">{{ formatDate(t.paid_on, true) }}<template v-if="t.note">・{{ t.note }}</template></p>
            </div>
            <span class="num shrink-0 font-bold">{{ formatMoney(t.amount) }}</span>
            <button
              type="button"
              class="icon-btn shrink-0"
              aria-label="刪除這筆轉帳"
              @click="removeTransfer(t.id, `${store.participantName(t.from_id)} 轉給 ${store.participantName(t.to_id)} ${formatMoney(t.amount)}`)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>
      </section>
    </template>

    <ExpenseFormModal :open="expenseOpen" :expense="editing" @close="expenseOpen = false" />
    <TransferModal :open="transferOpen" :preset="transferPreset" @close="transferOpen = false" />
  </div>
</template>
