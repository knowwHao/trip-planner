import { describe, expect, it } from 'vitest'
import { customRemaining, expenseDues, netBalances, proxyCollections, proxyTwdById, simplifyDebts, summaries, type SplitData } from './split'
import type { Expense, ExpenseProxy, ExpenseShare, Transfer } from '@/types'

const trip = { currency: 'JPY', fx_rate: 0.21 }

function expense(over: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'payer_id'>): Expense {
  return {
    trip_id: 't',
    title: 'x',
    currency: 'TWD',
    split_mode: 'even',
    spent_on: null,
    spot_id: null,
    item_id: null,
    note: '',
    twd_amount: null,
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

describe('expenseDues：有實際扣款金額', () => {
  it('平分時用實際扣款金額，不用旅程匯率', () => {
    const r = expenseDues(expense({ id: 'e', amount: 2400, currency: 'JPY', payer_id: 'a', twd_amount: 501 }), even('e', 'a', 'b'), trip)
    expect(r.twdTotal).toBe(501)
    expect(r.dues.map((d) => d.due)).toEqual([251, 251])
    expect(r.surplus).toBe(1)
  })

  it('指定金額依比例分配實際扣款，加總剛好等於扣款金額', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 5000 },
      { expense_id: 'e', participant_id: 'b', amount: 3000 },
      { expense_id: 'e', participant_id: 'c', amount: 2000 },
    ]
    const r = expenseDues(expense({ id: 'e', amount: 10000, currency: 'JPY', payer_id: 'a', split_mode: 'custom', twd_amount: 2150 }), shares, trip)
    expect(r.dues.map((d) => d.due)).toEqual([1075, 645, 430])
    expect(r.twdTotal).toBe(2150)
    expect(r.surplus).toBe(0)
  })

  it('除不盡時把餘數給小數部分最大的人，加總不變', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 1 },
      { expense_id: 'e', participant_id: 'b', amount: 1 },
      { expense_id: 'e', participant_id: 'c', amount: 1 },
    ]
    const r = expenseDues(expense({ id: 'e', amount: 3, currency: 'USD', payer_id: 'a', split_mode: 'custom', twd_amount: 100 }), shares, trip)
    expect(r.dues.map((d) => d.due)).toEqual([34, 33, 33])
    expect(r.surplus).toBe(0)
  })

  it('旅程匯率改了，有實際扣款金額的不受影響', () => {
    const data: SplitData = {
      trip: { currency: 'JPY', fx_rate: 0.5 },
      participants: [{ id: 'a' }, { id: 'b' }],
      expenses: [expense({ id: 'e', amount: 1000, currency: 'JPY', payer_id: 'a', twd_amount: 220 })],
      shares: even('e', 'a', 'b'),
      transfers: [],
    }
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 110, b: -110 })
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

const proxy = (expense_id: string, name: string, amount: number): ExpenseProxy => ({ id: `${expense_id}-${name}`, expense_id, name, amount, wish_item_id: null })

describe('代購', () => {
  it('平分時先扣掉代購，剩下的旅伴平分', () => {
    const r = expenseDues(expense({ id: 'e', amount: 1000, payer_id: 'a' }), even('e', 'a', 'b', 'c'), trip, [proxy('e', '媽媽', 400)])
    expect(r.dues.map((d) => d.due)).toEqual([200, 200, 200])
    expect(r.proxyDues).toEqual([{ name: '媽媽', due: 400 }])
    expect(r.surplus).toBe(0)
  })

  it('平分除不盡時零頭只算在旅伴的部分', () => {
    const r = expenseDues(expense({ id: 'e', amount: 1000, payer_id: 'a' }), even('e', 'a', 'b', 'c'), trip, [proxy('e', '媽媽', 300)])
    // 700 ÷ 3 進位成 234
    expect(r.dues.map((d) => d.due)).toEqual([234, 234, 234])
    expect(r.surplus).toBe(2)
  })

  it('全部都是代購時旅伴不分攤', () => {
    const r = expenseDues(expense({ id: 'e', amount: 500, payer_id: 'a' }), [], trip, [proxy('e', '媽媽', 200), proxy('e', '阿姨', 300)])
    expect(r.dues).toEqual([])
    expect(r.proxyDues.map((d) => d.due)).toEqual([200, 300])
    expect(r.surplus).toBe(0)
  })

  it('各付各的金額：代購與旅伴各自用旅程匯率換算', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 3000 },
      { expense_id: 'e', participant_id: 'b', amount: 2000 },
    ]
    const r = expenseDues(expense({ id: 'e', amount: 10000, currency: 'JPY', payer_id: 'a', split_mode: 'custom' }), shares, trip, [
      proxy('e', '媽媽', 5000),
    ])
    expect(r.dues.map((d) => d.due)).toEqual([630, 420])
    expect(r.proxyDues).toEqual([{ name: '媽媽', due: 1050 }])
    expect(r.twdTotal).toBe(2100)
  })

  it('有實際扣款時代購也照比例分配，加總恰好等於扣款', () => {
    const shares: ExpenseShare[] = [
      { expense_id: 'e', participant_id: 'a', amount: 3000 },
      { expense_id: 'e', participant_id: 'b', amount: 2000 },
    ]
    const e = expense({ id: 'e', amount: 10000, currency: 'JPY', payer_id: 'a', split_mode: 'custom', twd_amount: 2151 })
    const r = expenseDues(e, shares, trip, [proxy('e', '媽媽', 5000)])
    const sum = r.dues.reduce((s, d) => s + d.due, 0) + r.proxyDues.reduce((s, d) => s + d.due, 0)
    expect(sum).toBe(2151)
    // 2151 依 3000：2000：5000 分成 645.3、430.2、1075.5，餘數給小數最大的代購
    expect(r.proxyDues[0].due).toBe(1076)
    expect(r.surplus).toBe(0)
  })

  it('平分加實際扣款：旅伴的部分依比例算出來再平分', () => {
    const e = expense({ id: 'e', amount: 10000, currency: 'JPY', payer_id: 'a', twd_amount: 2150 })
    const r = expenseDues(e, even('e', 'a', 'b'), trip, [proxy('e', '媽媽', 4000)])
    // 2150 依 6000：4000 分成 1290、860
    expect(r.proxyDues[0].due).toBe(860)
    expect(r.dues.map((d) => d.due)).toEqual([645, 645])
  })

  it('代購不進結算：付錢的人只向旅伴收，全體加總仍為 0', () => {
    const data: SplitData = {
      trip,
      participants: [{ id: 'a' }, { id: 'b' }],
      expenses: [expense({ id: 'e', amount: 1000, payer_id: 'a' })],
      shares: even('e', 'a', 'b'),
      proxies: [proxy('e', '媽媽', 400)],
      transfers: [],
    }
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 300, b: -300 })
    // 代墊只算旅伴的部分，代購另外列在代購待收
    expect(summaries(data)).toEqual([
      { participant_id: 'a', paid: 600, share: 300, net: 300 },
      { participant_id: 'b', paid: 0, share: 300, net: -300 },
    ])
  })

  it('代購待收依付錢的人與名字加總', () => {
    const data: SplitData = {
      trip,
      participants: [{ id: 'a' }, { id: 'b' }],
      expenses: [
        expense({ id: 'e1', amount: 1000, payer_id: 'a' }),
        expense({ id: 'e2', amount: 500, payer_id: 'a' }),
        expense({ id: 'e3', amount: 800, payer_id: 'b' }),
      ],
      shares: [...even('e1', 'a', 'b'), ...even('e2', 'a'), ...even('e3', 'b')],
      proxies: [proxy('e1', '媽媽', 400), proxy('e2', ' 媽媽', 100), proxy('e3', '媽媽', 300), proxy('e3', '阿姨', 200)],
      transfers: [],
    }
    expect(proxyCollections(data)).toEqual([
      { payer_id: 'a', name: '媽媽', amount: 500, count: 2 },
      { payer_id: 'b', name: '媽媽', amount: 300, count: 1 },
      { payer_id: 'b', name: '阿姨', amount: 200, count: 1 },
    ])
  })
})

describe('proxyTwdById', () => {
  it('每筆代購換成新台幣，有實際扣款時依比例分配', () => {
    const data: SplitData = {
      trip,
      participants: [{ id: 'a' }],
      expenses: [
        expense({ id: 'e1', amount: 10000, currency: 'JPY', payer_id: 'a', split_mode: 'custom', twd_amount: 2150 }),
        expense({ id: 'e2', amount: 1000, currency: 'JPY', payer_id: 'a' }),
      ],
      shares: [{ expense_id: 'e1', participant_id: 'a', amount: 7000 }, ...even('e2', 'a')],
      proxies: [proxy('e1', '媽媽', 3000), proxy('e2', '阿姨', 400)],
      transfers: [],
    }
    // 2150 依 7000：3000 分成 1505、645；400 日圓 × 0.21 = 84
    expect(Object.fromEntries(proxyTwdById(data))).toEqual({ 'e1-媽媽': 645, 'e2-阿姨': 84 })
  })
})
