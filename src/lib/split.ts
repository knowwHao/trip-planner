import type { Expense, ExpenseShare, Id, Participant, Transfer, Trip } from '@/types'
import { fromMinor, toMinor, toTwd } from './money'

export interface DueShare {
  participant_id: Id
  /** 新台幣整數 */
  due: number
}

export interface ExpenseDues {
  dues: DueShare[]
  /** 費用換成新台幣的金額 */
  twdTotal: number
  /** 付錢的人因進位或四捨五入多收（負數是少收）的新台幣 */
  surplus: number
}

export interface Settlement {
  from: Id
  to: Id
  amount: number
}

export type FxInput = Pick<Trip, 'currency' | 'fx_rate'>

export interface SplitData {
  trip: FxInput
  participants: Pick<Participant, 'id'>[]
  expenses: Expense[]
  shares: ExpenseShare[]
  transfers: Transfer[]
}

/** 這筆換成新台幣的金額：有實際扣款金額就用它，否則用旅程匯率換算 */
export function expenseTwd(expense: Pick<Expense, 'amount' | 'currency' | 'twd_amount'>, trip: FxInput): number {
  return expense.currency !== 'TWD' && expense.twd_amount !== null ? expense.twd_amount : toTwd(expense.amount, expense.currency, trip.fx_rate)
}

/** 把 total 依 weights 比例拆成整數，餘數給小數部分最大的（同分給排前面的），加總恰好等於 total */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sum)
  const result = exact.map(Math.floor)
  let left = total - result.reduce((s, v) => s + v, 0)
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    result[i]++
    left--
  }
  return result
}

/**
 * 一筆費用每人要付多少新台幣
 * 平分：先把總額換成新台幣，每人無條件進位，零頭由付錢的人多收（與球友記帳相同）
 * 指定金額：沒有實際扣款金額時，每人的金額各自用旅程匯率換算後四捨五入；
 * 有實際扣款金額時，依每人金額的比例分配扣款金額，加總恰好等於扣款金額
 */
export function expenseDues(
  expense: Pick<Expense, 'amount' | 'currency' | 'split_mode'> & Partial<Pick<Expense, 'twd_amount'>>,
  shares: Pick<ExpenseShare, 'participant_id' | 'amount'>[],
  trip: FxInput,
): ExpenseDues {
  const charged = expense.currency !== 'TWD' && expense.twd_amount != null ? expense.twd_amount : null
  const twdTotal = charged ?? toTwd(expense.amount, expense.currency, trip.fx_rate)
  let dues: DueShare[]
  if (expense.split_mode === 'custom') {
    const parts = charged !== null ? apportion(charged, shares.map((s) => toMinor(s.amount ?? 0, expense.currency))) : null
    dues = shares
      .map((s, i) => ({ participant_id: s.participant_id, due: parts ? parts[i] : toTwd(s.amount ?? 0, expense.currency, trip.fx_rate) }))
      .filter((d) => d.due > 0)
  } else {
    const ids = [...new Set(shares.map((s) => s.participant_id))]
    const perHead = ids.length ? Math.ceil(twdTotal / ids.length) : 0
    dues = ids.map((participant_id) => ({ participant_id, due: perHead }))
  }
  const sum = dues.reduce((s, d) => s + d.due, 0)
  return { dues, twdTotal, surplus: dues.length ? sum - twdTotal : 0 }
}

export function groupShares<T extends Pick<ExpenseShare, 'expense_id'>>(shares: T[]): Map<Id, T[]> {
  const map = new Map<Id, T[]>()
  for (const s of shares) {
    const list = map.get(s.expense_id)
    if (list) list.push(s)
    else map.set(s.expense_id, [s])
  }
  return map
}

function add(map: Map<Id, number>, id: Id, delta: number) {
  map.set(id, (map.get(id) ?? 0) + delta)
}

/** 每人淨額（新台幣）：正數＝別人要給他，負數＝他要給別人；全體加總必為 0 */
export function netBalances(data: SplitData): Map<Id, number> {
  const bal = new Map<Id, number>(data.participants.map((p) => [p.id, 0]))
  const byExpense = groupShares(data.shares)
  for (const e of data.expenses) {
    // 付錢的人入帳的是分攤加總而非實付金額，全體加總才會恰好為 0
    for (const d of expenseDues(e, byExpense.get(e.id) ?? [], data.trip).dues) {
      add(bal, e.payer_id, d.due)
      add(bal, d.participant_id, -d.due)
    }
  }
  for (const t of data.transfers) {
    add(bal, t.from_id, t.amount)
    add(bal, t.to_id, -t.amount)
  }
  return bal
}

/** 貪婪法：每次讓欠最多的人付給該收最多的人，得到筆數最少的轉帳建議 */
export function simplifyDebts(balances: Map<Id, number>): Settlement[] {
  const byAmountDesc = (a: { id: Id; amt: number }, b: { id: Id; amt: number }) => b.amt - a.amt || a.id.localeCompare(b.id)
  const entries = [...balances].filter(([, v]) => Number.isFinite(v))
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }))
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }))
  const result: Settlement[] = []
  while (debtors.length && creditors.length) {
    debtors.sort(byAmountDesc)
    creditors.sort(byAmountDesc)
    const d = debtors[0]
    const c = creditors[0]
    const amount = Math.min(d.amt, c.amt)
    result.push({ from: d.id, to: c.id, amount })
    d.amt -= amount
    c.amt -= amount
    if (d.amt === 0) debtors.shift()
    if (c.amt === 0) creditors.shift()
  }
  return result
}

export interface ParticipantSummary {
  participant_id: Id
  /** 代墊的費用（新台幣） */
  paid: number
  /** 自己實際負擔的費用（新台幣） */
  share: number
  /** 含已轉帳的淨額，同 netBalances */
  net: number
}

export function summaries(data: SplitData): ParticipantSummary[] {
  const paid = new Map<Id, number>()
  const share = new Map<Id, number>()
  const byExpense = groupShares(data.shares)
  for (const e of data.expenses) {
    const { dues, twdTotal } = expenseDues(e, byExpense.get(e.id) ?? [], data.trip)
    add(paid, e.payer_id, twdTotal)
    for (const d of dues) add(share, d.participant_id, d.due)
  }
  const net = netBalances(data)
  return data.participants.map((p) => ({
    participant_id: p.id,
    paid: paid.get(p.id) ?? 0,
    share: share.get(p.id) ?? 0,
    net: net.get(p.id) ?? 0,
  }))
}

/** 指定金額時還沒分配的金額（負數是分配超過） */
export function customRemaining(amount: number, entered: (number | null)[], code: string): number {
  const used = entered.reduce<number>((s, v) => s + (v && Number.isFinite(v) ? toMinor(v, code) : 0), 0)
  return fromMinor(toMinor(amount, code) - used, code)
}
