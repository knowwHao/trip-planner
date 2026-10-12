export type Id = string

export interface Trip {
  id: Id
  name: string
  /** YYYY-MM-DD */
  start_date: string
  end_date: string
  /** 當地幣別（ISO 4217），國內旅遊是 TWD */
  currency: string
  /** 1 單位當地幣別等於多少新台幣；TWD 時固定為 1 */
  fx_rate: number
  version: number
  created_at: string
  updated_at: string
}

export interface Participant {
  id: Id
  trip_id: Id
  name: string
  sort_order: number
  version: number
  created_at: string
}

/** 行程項目的類型，清單與顯示文字在 src/lib/category.ts */
export type SpotCategory = 'sight' | 'food' | 'shop' | 'activity' | 'transport' | 'stay' | 'other'

/** 預約狀態：done 已訂／已買、todo 還沒、none 不需要；畫面文字依類型而定 */
export type BookingStatus = 'done' | 'todo' | 'none'

export interface Spot {
  id: Id
  trip_id: Id
  category: SpotCategory
  /** null 是沒設定（加入類型前建立的景點），沒有預約狀態的類型也是 null */
  booking: BookingStatus | null
  /** 第幾天（1 起算）；null 是口袋名單 */
  day: number | null
  /** HH:MM 或 HH:MM:SS；null 表示沒排時間 */
  start_time: string | null
  title: string
  address: string
  map_url: string
  note: string
  /** 預估花費，以旅程的當地幣別計 */
  est_cost: number | null
  sort_key: number
  version: number
  created_at: string
  updated_at: string
}

export type SplitMode = 'even' | 'custom'

export interface Expense {
  id: Id
  trip_id: Id
  title: string
  /** 以 currency 計，可有兩位小數 */
  amount: number
  /** 新台幣或旅程的當地幣別 */
  currency: string
  payer_id: Id
  split_mode: SplitMode
  spent_on: string | null
  spot_id: Id | null
  note: string
  /** 外幣旅費的實際扣款（新台幣），有填時這筆用它換算而不用旅程匯率 */
  twd_amount: number | null
  version: number
  created_at: string
}

export interface ExpenseShare {
  expense_id: Id
  participant_id: Id
  /** 平分時為 null；指定金額時與費用同幣別 */
  amount: number | null
}

/** 已經轉的錢，一律新台幣整數 */
export interface Transfer {
  id: Id
  trip_id: Id
  from_id: Id
  to_id: Id
  amount: number
  paid_on: string
  note: string
  created_at: string
}

export interface TripData {
  trip: Trip
  participants: Participant[]
  spots: Spot[]
  expenses: Expense[]
  shares: ExpenseShare[]
  transfers: Transfer[]
}

export type TripInput = Pick<Trip, 'name' | 'start_date' | 'end_date' | 'currency' | 'fx_rate'>
export type TripPatch = Partial<TripInput>

export type SpotInput = Pick<
  Spot,
  'category' | 'booking' | 'day' | 'start_time' | 'title' | 'address' | 'map_url' | 'note' | 'est_cost' | 'sort_key'
>
export type SpotPatch = Partial<SpotInput>

export interface ExpenseInput {
  /** 有 id 是修改，要一起帶 version */
  id?: Id
  version?: number
  title: string
  amount: number
  currency: string
  payer_id: Id
  split_mode: SplitMode
  spent_on: string | null
  spot_id: Id | null
  note: string
  twd_amount: number | null
}

export type ShareInput = Omit<ExpenseShare, 'expense_id'>

export type TransferInput = Pick<Transfer, 'from_id' | 'to_id' | 'amount' | 'paid_on' | 'note'>

/** 這台裝置開過的旅程；token 只存在本機 */
export interface SavedTrip {
  id: Id
  token: string
  name: string
  start_date: string
  end_date: string
  opened_at: string
}
