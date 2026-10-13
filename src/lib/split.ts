import type { Expense, ExpenseProxy, ExpenseShare, Id, Participant, Transfer, Trip } from '@/types'
import { fromMinor, toMinor, toTwd } from './money'

export interface DueShare {
  participant_id: Id
  /** 新台幣整數 */
  due: number
}

export interface ProxyDue {
  name: string
  /** 新台幣整數 */
  due: number
}

export interface ExpenseDues {
  dues: DueShare[]
  /** 代購的部分，與 dues 同樣換成新台幣，但不進旅伴之間的結算 */
  proxyDues: ProxyDue[]
  /** 費用換成新台幣的金額（含代購） */
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
  proxies?: ExpenseProxy[]
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
 * 平分：先把總額換成新台幣、扣掉代購，旅伴每人無條件進位，零頭由付錢的人多收（與球友記帳相同）
 * 指定金額：沒有實際扣款金額時，每人（含代購）的金額各自用旅程匯率換算後四捨五入；
 * 有實際扣款金額時，依每人（含代購）金額的比例分配扣款金額，加總恰好等於扣款金額
 */
export function expenseDues(
  expense: Pick<Expense, 'amount' | 'currency' | 'split_mode'> & Partial<Pick<Expense, 'twd_amount'>>,
  shares: Pick<ExpenseShare, 'participant_id' | 'amount'>[],
  trip: FxInput,
  proxies: Pick<ExpenseProxy, 'name' | 'amount'>[] = [],
): ExpenseDues {
  const code = expense.currency
  const charged = code !== 'TWD' && expense.twd_amount != null ? expense.twd_amount : null
  const twdTotal = charged ?? toTwd(expense.amount, code, trip.fx_rate)
  const proxyMinor = proxies.map((p) => toMinor(p.amount, code))
  let dues: DueShare[]
  let proxyTwd: number[]
  if (expense.split_mode === 'custom') {
    const parts = charged !== null ? apportion(charged, [...shares.map((s) => toMinor(s.amount ?? 0, code)), ...proxyMinor]) : null
    dues = shares
      .map((s, i) => ({ participant_id: s.participant_id, due: parts ? parts[i] : toTwd(s.amount ?? 0, code, trip.fx_rate) }))
      .filter((d) => d.due > 0)
    proxyTwd = proxies.map((p, i) => (parts ? parts[shares.length + i] : toTwd(p.amount, code, trip.fx_rate)))
  } else {
    let travellerTwd: number
    if (charged !== null) {
      const rest = Math.max(0, toMinor(expense.amount, code) - proxyMinor.reduce((s, v) => s + v, 0))
      const parts = apportion(charged, [rest, ...proxyMinor])
      travellerTwd = parts[0]
      proxyTwd = parts.slice(1)
    } else {
      proxyTwd = proxies.map((p) => toTwd(p.amount, code, trip.fx_rate))
      travellerTwd = Math.max(0, twdTotal - proxyTwd.reduce((s, v) => s + v, 0))
    }
    const ids = [...new Set(shares.map((s) => s.participant_id))]
    const perHead = ids.length ? Math.ceil(travellerTwd / ids.length) : 0
    dues = ids.map((participant_id) => ({ participant_id, due: perHead }))
  }
  const proxyDues = proxies.map((p, i) => ({ name: p.name.trim(), due: proxyTwd[i] }))
  const sum = dues.reduce((s, d) => s + d.due, 0) + proxyDues.reduce((s, d) => s + d.due, 0)
  return { dues, proxyDues, twdTotal, surplus: dues.length || proxyDues.length ? sum - twdTotal : 0 }
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

export function groupProxies(proxies: ExpenseProxy[] = []): Map<Id, ExpenseProxy[]> {
  const map = new Map<Id, ExpenseProxy[]>()
  for (const p of proxies) {
    const list = map.get(p.expense_id)
    if (list) list.push(p)
    else map.set(p.expense_id, [p])
  }
  return map
}

/** 一筆費用的分攤結果，代購一起算進去 */
function duesOf(data: SplitData) {
  const byExpense = groupShares(data.shares)
  const byProxy = groupProxies(data.proxies)
  return (e: Expense) => expenseDues(e, byExpense.get(e.id) ?? [], data.trip, byProxy.get(e.id) ?? [])
}

function add(map: Map<Id, number>, id: Id, delta: number) {
  map.set(id, (map.get(id) ?? 0) + delta)
}

/** 每人淨額（新台幣）：正數＝別人要給他，負數＝他要給別人；全體加總必為 0 */
export function netBalances(data: SplitData): Map<Id, number> {
  const bal = new Map<Id, number>(data.participants.map((p) => [p.id, 0]))
  const dues = duesOf(data)
  for (const e of data.expenses) {
    // 付錢的人入帳的是旅伴的分攤加總而非實付金額，全體加總才會恰好為 0；代購不在其中，由付錢的人自己收
    for (const d of dues(e).dues) {
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
  /** 代墊的費用（新台幣），不含代購 */
  paid: number
  /** 自己實際負擔的費用（新台幣） */
  share: number
  /** 含已轉帳的淨額，同 netBalances */
  net: number
}

export function summaries(data: SplitData): ParticipantSummary[] {
  const paid = new Map<Id, number>()
  const share = new Map<Id, number>()
  const duesFor = duesOf(data)
  for (const e of data.expenses) {
    const { dues, proxyDues, twdTotal } = duesFor(e)
    add(paid, e.payer_id, twdTotal - proxyDues.reduce((s, d) => s + d.due, 0))
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

export interface ProxyCollection {
  payer_id: Id
  name: string
  /** 新台幣 */
  amount: number
  /** 幾筆旅費 */
  count: number
}

/** 代購待收：每位付錢的人要跟每個代購對象收多少（同名合併） */
export function proxyCollections(data: SplitData): ProxyCollection[] {
  const map = new Map<string, ProxyCollection>()
  const duesFor = duesOf(data)
  for (const e of data.expenses) {
    for (const d of duesFor(e).proxyDues) {
      const key = `${e.payer_id}\u0000${d.name}`
      const row = map.get(key)
      if (row) {
        row.amount += d.due
        row.count++
      } else map.set(key, { payer_id: e.payer_id, name: d.name, amount: d.due, count: 1 })
    }
  }
  return [...map.values()]
}

/** 指定金額時還沒分配的金額（負數是分配超過） */
export function customRemaining(amount: number, entered: (number | null)[], code: string): number {
  const used = entered.reduce<number>((s, v) => s + (v && Number.isFinite(v) ? toMinor(v, code) : 0), 0)
  return fromMinor(toMinor(amount, code) - used, code)
}
