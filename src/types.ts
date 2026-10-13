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

/** 旅伴：account_id 有值的是成員（看得到、能編輯這趟），null 的是只有名字、只用來分旅費的旅伴 */
export interface Participant {
  id: Id
  trip_id: Id
  account_id: Id | null
  /** 成員的名字固定是帳號名稱 */
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
  /** 航班（交通類型才用）：起飛時間沿用 start_time，抵達跨日時 arr_day_offset 記 1、2 */
  airline: string
  /** 大寫英數，例如 JL802 */
  flight_no: string
  dep_airport: string
  arr_airport: string
  arr_time: string | null
  arr_day_offset: number
  sort_key: number
  version: number
  created_at: string
  updated_at: string
}

/** 行程底下的子項目，例如一區裡要逛的多間店 */
export interface SpotItem {
  id: Id
  trip_id: Id
  spot_id: Id
  title: string
  address: string
  map_url: string
  note: string
  /** 已逛過／已去過 */
  done: boolean
  sort_key: number
  version: number
  created_at: string
  updated_at: string
}

export type SpotItemInput = Pick<SpotItem, 'spot_id' | 'title' | 'address' | 'map_url' | 'note' | 'sort_key'>
export type SpotItemPatch = Partial<Pick<SpotItem, 'title' | 'address' | 'map_url' | 'note'>>

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

/** 代購：幫不是旅伴的人買的部分，不進旅伴之間的結算，由付錢的人自己跟對方收 */
export interface ExpenseProxy {
  id: Id
  expense_id: Id
  /** 代購對象，例如「媽媽」 */
  name: string
  /** 與費用同幣別 */
  amount: number
  /** 從代購清單記帳時對應的項目；只有項目的主人看得到那個項目 */
  wish_item_id: Id | null
}

export type ProxyInput = Pick<ExpenseProxy, 'name' | 'amount'> & { wish_item_id?: Id | null }

/** 代購清單的狀態：待買、已買、買不到 */
export type WishStatus = 'todo' | 'bought' | 'unavailable'

/** 自己的代購清單項目，同一趟的其他旅伴看不到 */
export interface WishItem {
  id: Id
  trip_id: Id
  owner_id: Id
  /** 幫誰買 */
  recipient: string
  title: string
  qty: number
  note: string
  url: string
  /** 打算在哪個行程買 */
  spot_id: Id | null
  status: WishStatus
  sort_key: number
  version: number
  created_at: string
  updated_at: string
}

export type WishItemInput = Pick<WishItem, 'recipient' | 'title' | 'qty' | 'note' | 'url' | 'spot_id' | 'status' | 'sort_key'>
export type WishItemPatch = Partial<Pick<WishItem, 'recipient' | 'title' | 'qty' | 'note' | 'url'>>

/** 代購項目的照片；圖片本身另外讀，載入旅程時只拿這些 */
export interface WishPhoto {
  id: Id
  item_id: Id
  sort_order: number
}

/** 壓縮好的照片，data URL（JPEG） */
export interface PhotoData {
  thumb: string
  full: string
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
  items: SpotItem[]
  expenses: Expense[]
  shares: ExpenseShare[]
  proxies: ExpenseProxy[]
  transfers: Transfer[]
  /** 只有自己的 */
  wishItems: WishItem[]
  wishPhotos: WishPhoto[]
}

export type TripInput = Pick<Trip, 'name' | 'start_date' | 'end_date' | 'currency' | 'fx_rate'>
export type TripPatch = Partial<TripInput>

export type SpotInput = Pick<
  Spot,
  | 'category'
  | 'booking'
  | 'day'
  | 'start_time'
  | 'title'
  | 'address'
  | 'map_url'
  | 'note'
  | 'airline'
  | 'flight_no'
  | 'dep_airport'
  | 'arr_airport'
  | 'arr_time'
  | 'arr_day_offset'
  | 'sort_key'
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

/** 首頁「我的旅程」清單的一列 */
export type TripSummary = Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'>

/** 註冊的使用者，加成員時從這份清單挑 */
export interface AccountInfo {
  id: Id
  name: string
}

/** 登入後存在這台裝置的帳號憑證；改密碼後舊憑證失效 */
export interface AccountSession extends AccountInfo {
  key: string
}

export type PinResult = { ok: true; session: AccountSession } | { ok: false; remaining?: number; lockedUntil?: string }
