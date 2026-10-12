import { describe, expect, it } from 'vitest'
import { customRemaining, expenseDues, netBalances, simplifyDebts, summaries, type SplitData } from './split'
import type { Expense, ExpenseShare, Transfer } from '@/types'

const trip = { currency: 'JPY', fx_rate: 0.21 }

function expense(over: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'payer_id'>): Expense {
  return {
    trip_id: 't',
    title: 'x',
    currency: 'TWD',
    split_mode: 'even',
    spent_on: null,
    spot_id: null,
    note: '',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const even = (expense_id: string, ...ids: string[]): ExpenseShare[] =>
  ids.map((participant_id) => ({ expense_id, participant_id, amount: null }))

describe('expenseDues', () => {
  it('平分時每人無條件進位，零頭由付錢的人多收', () => {
    const r = expenseDues(expense({ id: 'e', amount: 100, payer_id: 'a' }), even('e', 'a', 'b', 'c'), trip)
    expect(r.dues).toEqual([
      { participant_id: 'a', due: 34 },
      { participant_id: 'b', due: 34 },
      { participant_id: 'c', due: 34 },
    ])
    expect(r.twdTotal).toBe(100)
    expect(r.surplus).toBe(2)
  })

  it('外幣先換成新台幣再平分', () => {
    // 2400 日圓 × 0.21 = 504 元，兩人各 252
    const r = expenseDues(expense({ id: 'e', amount: 2400, currency: 'JPY', payer_id: 'a' }), even('e', 'a', 'b'), trip)
    expect(r.twdTotal).toBe(504)
    expect(r.dues.map((d) => d.due)).toEqual([252, 252])
  })

  it('指定金額逐人換成新台幣，四捨五入的差額記在 surplus', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 1001 },
      { expense_id: 'e', participant_id: 'b', amount: 1001 },
      { expense_id: 'e', participant_id: 'c', amount: 1001 },
    ]
    // 每人 1001 × 0.21 = 210.21 → 210；總額 3003 × 0.21 = 630.63 → 631
    const r = expenseDues(expense({ id: 'e', amount: 3003, currency: 'JPY', payer_id: 'a', split_mode: 'custom' }), shares, trip)
    expect(r.dues.map((d) => d.due)).toEqual([210, 210, 210])
    expect(r.twdTotal).toBe(631)
    expect(r.surplus).toBe(-1)
  })

  it('指定金額為 0 的人不列入', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 300 },
      { expense_id: 'e', participant_id: 'b', amount: 0 },
    ]
    const r = expenseDues(expense({ id: 'e', amount: 300, payer_id: 'a', split_mode: 'custom' }), shares, trip)
    expect(r.dues).toEqual([{ participant_id: 'a', due: 300 }])
  })

  it('沒有分攤的人時回空陣列', () => {
    const r = expenseDues(expense({ id: 'e', amount: 300, payer_id: 'a' }), [], trip)
    expect(r.dues).toEqual([])
    expect(r.surplus).toBe(0)
  })
})

describe('netBalances', () => {
  const participants = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('付錢的人收回別人的分攤，加總為 0', () => {
    const data: SplitData = {
      trip,
      participants,
      expenses: [expense({ id: 'e1', amount: 300, payer_id: 'a' }), expense({ id: 'e2', amount: 90, payer_id: 'b' })],
      shares: [...even('e1', 'a', 'b', 'c'), ...even('e2', 'b', 'c')],
      transfers: [],
    }
    const bal = netBalances(data)
    expect(Object.fromEntries(bal)).toEqual({ a: 200, b: -55, c: -145 })
    expect([...bal.values()].reduce((s, v) => s + v, 0)).toBe(0)
  })

  it('已轉的錢抵銷欠款', () => {
    const transfers: Transfer[] = [
      { id: 't1', trip_id: 't', from_id: 'c', to_id: 'a', amount: 100, paid_on: '2026-01-01', note: '', created_at: '' },
    ]
    const data: SplitData = {
      trip,
      participants,
      expenses: [expense({ id: 'e1', amount: 300, payer_id: 'a' })],
      shares: even('e1', 'a', 'b', 'c'),
      transfers,
    }
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 100, b: -100, c: 0 })
  })

  it('指定金額的四捨五入差額也由付錢的人吸收，加總仍為 0', () => {
    const data: SplitData = {
      trip,
      participants,
      expenses: [expense({ id: 'e', amount: 3003, currency: 'JPY', payer_id: 'a', split_mode: 'custom' })],
      shares: ['a', 'b', 'c'].map((participant_id) => ({ expense_id: 'e', participant_id, amount: 1001 })),
      transfers: [],
    }
    const bal = netBalances(data)
    expect(Object.fromEntries(bal)).toEqual({ a: 420, b: -210, c: -210 })
  })

  it('匯率改了就用新匯率重算', () => {
    const data: SplitData = {
      trip: { currency: 'JPY', fx_rate: 0.2 },
      participants,
      expenses: [expense({ id: 'e', amount: 3000, currency: 'JPY', payer_id: 'a' })],
      shares: even('e', 'a', 'b', 'c'),
      transfers: [],
    }
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 400, b: -200, c: -200 })
  })
})

describe('simplifyDebts', () => {
  it('最大債務人先付給最大債權人', () => {
    expect(simplifyDebts(new Map([['a', 200], ['b', -55], ['c', -145]]))).toEqual([
      { from: 'c', to: 'a', amount: 145 },
      { from: 'b', to: 'a', amount: 55 },
    ])
  })

  it('全部打平時沒有轉帳', () => {
    expect(simplifyDebts(new Map([['a', 0], ['b', 0]]))).toEqual([])
  })
})

describe('summaries', () => {
  it('列出每人代墊、實際負擔與淨額', () => {
    const data: SplitData = {
      trip,
      participants: [{ id: 'a' }, { id: 'b' }],
      expenses: [expense({ id: 'e', amount: 1000, currency: 'JPY', payer_id: 'a' })],
      shares: even('e', 'a', 'b'),
      transfers: [],
    }
    // 1000 日圓 = 210 元，每人 105
    expect(summaries(data)).toEqual([
      { participant_id: 'a', paid: 210, share: 105, net: 105 },
      { participant_id: 'b', paid: 0, share: 105, net: -105 },
    ])
  })
})

describe('customRemaining', () => {
  it('以最小單位相減，不受浮點誤差影響', () => {
    expect(customRemaining(0.3, [0.1, 0.2], 'USD')).toBe(0)
    expect(customRemaining(100, [30, null, 20], 'TWD')).toBe(50)
    expect(customRemaining(10.5, [11], 'USD')).toBe(-0.5)
  })
})
