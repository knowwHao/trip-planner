import type { Expense, ExpenseShare, Participant, Spot, SpotItem, Transfer, Trip } from '@/types'
import { addDays, todayYmd } from '@/lib/format'
import { SORT_STEP } from '@/lib/order'

export function randomId(): string {
  return crypto.randomUUID()
}

export function randomToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

type SeedShare = ExpenseShare & { trip_id: string }

/** 示範旅程：一個月後出發的東京五天四夜 */
export function seedDemoTrip() {
  const t = new Date().toISOString()
  const start = addDays(todayYmd(), 30)
  const trip: Trip & { token: string } = {
    id: randomId(),
    token: randomToken(),
    name: '東京五天四夜（示範）',
    start_date: start,
    end_date: addDays(start, 4),
    currency: 'JPY',
    fx_rate: 0.21,
    version: 1,
    created_at: t,
    updated_at: t,
  }
  const trip_id = trip.id
  const names = ['小明', '小華', '阿傑', '小美']
  const participants: Participant[] = names.map((name, i) => ({ id: randomId(), trip_id, name, sort_order: i, version: 1, created_at: t }))
  const [ming, hua, jie, mei] = participants.map((p) => p.id)

  const spot = (day: number | null, i: number, title: string, extra: Partial<Spot> = {}): Spot => ({
    id: randomId(),
    trip_id,
    category: 'sight',
    booking: null,
    day,
    start_time: null,
    title,
    address: '',
    map_url: '',
    note: '',
    est_cost: null,
    sort_key: (i + 1) * SORT_STEP,
    version: 1,
    created_at: t,
    updated_at: t,
    ...extra,
  })
  const spots: Spot[] = [
    spot(1, 0, '桃園機場出發', { category: 'transport', booking: 'done', start_time: '08:30', note: '第二航廈，提早兩小時到' }),
    spot(1, 1, '成田機場 → 上野', { category: 'transport', booking: 'todo', start_time: '13:00', note: 'Skyliner 約 45 分鐘' }),
    spot(1, 2, '上野阿美橫丁', { category: 'shop', start_time: '16:00', address: '東京都台東区上野4丁目' }),
    spot(1, 3, '一蘭拉麵 上野店', { category: 'food', booking: 'none', start_time: '19:00', note: '不能訂位，可能要排隊' }),
    spot(1, 4, '上野站前飯店', { category: 'stay', booking: 'done', start_time: '21:00', note: '訂位代號 AB1234' }),
    spot(2, 0, '淺草寺', { booking: 'none', start_time: '09:00', address: '東京都台東区浅草2-3-1', note: '雷門拍照、仲見世通吃點心' }),
    spot(2, 1, '東京晴空塔', { booking: 'done', start_time: '13:00', address: '東京都墨田区押上1-1-2' }),
    spot(2, 2, '敘敘苑 晴空塔店', { category: 'food', booking: 'todo', start_time: '18:00', note: '要先在官網訂位' }),
    spot(3, 0, '東京迪士尼海洋', { booking: 'todo', start_time: '08:00', note: '門票先在官網買好' }),
    spot(4, 0, '築地場外市場', { category: 'food', booking: 'none', start_time: '08:30' }),
    spot(4, 1, '銀座逛街', { category: 'shop', start_time: '11:00' }),
    spot(4, 2, '澀谷 SKY', { booking: 'todo', start_time: '17:30', note: '夕陽時段要提早訂' }),
    spot(5, 0, '回程', { category: 'transport', booking: 'done', start_time: '14:00' }),
    spot(null, 0, '吉卜力美術館', { booking: 'todo', note: '要搶票，搶到再排進行程' }),
    spot(null, 1, '下北澤古著街', { category: 'shop' }),
  ]

  // 一區裡要逛的多間店收在同一個行程底下
  const ginza = spots.find((x) => x.title === '銀座逛街')!
  const item = (i: number, title: string, extra: Partial<SpotItem> = {}): SpotItem => ({
    id: randomId(),
    trip_id,
    spot_id: ginza.id,
    title,
    address: '',
    map_url: '',
    note: '',
    done: false,
    sort_key: (i + 1) * SORT_STEP,
    version: 1,
    created_at: t,
    updated_at: t,
    ...extra,
  })
  const items: SpotItem[] = [
    item(0, 'UNIQLO 銀座店', { done: true, note: '12 層樓，記得去 Heattech 樓層' }),
    item(1, '伊東屋', { done: true }),
    item(2, '松本清 銀座店', { note: '要買：眼藥水、合利他命' }),
    item(3, 'GINZA SIX', { address: '東京都中央区銀座6-10-1' }),
    item(4, '無印良品 銀座'),
  ]

  const expense = (title: string, amount: number, currency: string, payer_id: string, extra: Partial<Expense> = {}): Expense => ({
    id: randomId(),
    trip_id,
    title,
    amount,
    currency,
    payer_id,
    split_mode: 'even',
    spent_on: null,
    spot_id: null,
    note: '',
    twd_amount: null,
    version: 1,
    created_at: t,
    ...extra,
  })
  const flight = expense('機票', 39200, 'TWD', hua, { note: '四人來回' })
  const hotel = expense('飯店四晚', 120000, 'JPY', ming, { spent_on: start })
  const dinner = expense('燒肉晚餐', 18000, 'JPY', jie, {
    split_mode: 'custom',
    spent_on: addDays(start, 1),
    spot_id: spots.find((x) => x.title === '敘敘苑 晴空塔店')!.id,
    note: '小美沒喝酒',
  })
  // 一次結帳裡有幫別人買的東西：照信用卡實際扣款換算
  const drugstore = expense('松本清藥妝', 12800, 'JPY', mei, {
    split_mode: 'custom',
    spent_on: addDays(start, 3),
    spot_id: ginza.id,
    twd_amount: 2741,
    note: '幫小明買眼藥水、幫阿傑買合利他命',
  })
  const expenses = [flight, hotel, dinner, drugstore]
  const all = (e: Expense): SeedShare[] => participants.map((p) => ({ expense_id: e.id, trip_id, participant_id: p.id, amount: null }))
  const shares: SeedShare[] = [
    ...all(flight),
    ...all(hotel),
    { expense_id: dinner.id, trip_id, participant_id: ming, amount: 5000 },
    { expense_id: dinner.id, trip_id, participant_id: hua, amount: 5000 },
    { expense_id: dinner.id, trip_id, participant_id: jie, amount: 5000 },
    { expense_id: dinner.id, trip_id, participant_id: mei, amount: 3000 },
    { expense_id: drugstore.id, trip_id, participant_id: ming, amount: 1980 },
    { expense_id: drugstore.id, trip_id, participant_id: jie, amount: 3480 },
    { expense_id: drugstore.id, trip_id, participant_id: mei, amount: 7340 },
  ]
  const transfers: Transfer[] = [
    { id: randomId(), trip_id, from_id: mei, to_id: hua, amount: 9800, paid_on: todayYmd(), note: '機票錢', created_at: t },
  ]
  return { trip, data: { participants, spots, items, expenses, shares, transfers } }
}
