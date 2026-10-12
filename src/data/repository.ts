import type {
  AccountSession,
  AccountTrip,
  ExpenseInput,
  Id,
  ShareInput,
  PinResult,
  Spot,
  SpotInput,
  SpotItem,
  SpotItemInput,
  SpotItemPatch,
  SpotPatch,
  TransferInput,
  TripData,
  TripInput,
  TripPatch,
} from '@/types'

export type RepoMode = 'demo' | 'supabase'

/** 旅程 token 不符（沒帶、打錯或已被重新產生） */
export class InvalidTokenError extends Error {
  constructor() {
    super('旅程連結已失效')
    this.name = 'InvalidTokenError'
  }
}

/** 要改的資料已被別人改過（版本號對不上） */
export class ConflictError extends Error {
  constructor() {
    super('這筆資料剛被別人改過')
    this.name = 'ConflictError'
  }
}

/** 旅伴還有旅費或轉帳紀錄，不能刪除 */
export class InUseError extends Error {
  constructor() {
    super('這位旅伴還有旅費或轉帳紀錄，要先刪掉那些紀錄才能移除')
    this.name = 'InUseError'
  }
}

/** 這台裝置的帳號憑證已失效（密碼在別的裝置改過） */
export class AccountSessionError extends Error {
  constructor() {
    super('登入已失效，請重新登入')
    this.name = 'AccountSessionError'
  }
}

/** 帳號名稱已經有人用了 */
export class NameTakenError extends Error {
  constructor() {
    super('這個名稱已經有人用了，換一個試試')
    this.name = 'NameTakenError'
  }
}

export interface ItemMove {
  id: Id
  sort_key: number
}

export interface SpotMove {
  id: Id
  day: number | null
  sort_key: number
}

export interface TripRepository {
  readonly mode: RepoMode

  /** 任何人都能建立旅程，回傳新旅程的 id 與 token */
  createTrip(input: TripInput, participantNames: string[]): Promise<{ id: Id; token: string }>

  /** 之後的請求都以這個旅程 token 存取；null 表示沒有開啟旅程 */
  setToken(token: string | null): void

  /** token 不符時丟 InvalidTokenError */
  loadTrip(): Promise<TripData>
  /** 版本不符丟 ConflictError；有外幣費用時換幣別會丟錯 */
  updateTrip(version: number, patch: TripPatch): Promise<void>
  /** 換發 token 並回傳新值，舊連結立即失效 */
  regenerateToken(): Promise<string>
  deleteTrip(): Promise<void>

  addParticipants(rows: { name: string; sort_order: number }[]): Promise<void>
  renameParticipant(id: Id, version: number, name: string): Promise<void>
  /** 有旅費或轉帳紀錄時丟 InUseError */
  deleteParticipant(id: Id): Promise<void>

  createSpot(input: SpotInput): Promise<Spot>
  /** 版本不符丟 ConflictError */
  updateSpot(id: Id, version: number, patch: SpotPatch): Promise<void>
  /** 只改天數與排序，不檢查版本，也不會讓別人正在編輯的內容變成衝突 */
  moveSpots(moves: SpotMove[]): Promise<void>
  deleteSpot(id: Id): Promise<void>

  createItem(input: SpotItemInput): Promise<SpotItem>
  /** 版本不符丟 ConflictError */
  updateItem(id: Id, version: number, patch: SpotItemPatch): Promise<void>
  /** 打勾與排序都不檢查版本，也不會讓別人正在編輯的內容變成衝突 */
  setItemDone(id: Id, done: boolean): Promise<void>
  moveItems(moves: ItemMove[]): Promise<void>
  deleteItem(id: Id): Promise<void>

  /** 寫入費用並以 shares 完整取代分攤；修改時版本不符丟 ConflictError */
  saveExpense(input: ExpenseInput, shares: ShareInput[]): Promise<Id>
  deleteExpense(id: Id): Promise<void>

  createTransfer(input: TransferInput): Promise<void>
  deleteTransfer(id: Id): Promise<void>

  /** 名稱重複丟 NameTakenError */
  registerAccount(name: string, pin: string): Promise<AccountSession>
  loginAccount(name: string, pin: string): Promise<PinResult>
  /** 成功時回傳新憑證，舊憑證（包括其他裝置的）一併失效 */
  changeAccountPin(session: AccountSession, oldPin: string, newPin: string): Promise<PinResult>
  /** 以下憑證失效時丟 AccountSessionError */
  listAccountTrips(session: AccountSession): Promise<AccountTrip[]>
  /** token 無效時丟 InvalidTokenError */
  saveAccountTrip(session: AccountSession, token: string): Promise<void>
  removeAccountTrip(session: AccountSession, tripId: Id): Promise<void>

  /** 收到其他人的異動通知時呼叫 onChange；live 回報即時連線狀態；回傳取消訂閱的函式 */
  subscribe(onChange: () => void, onLive: (live: boolean) => void): () => void
  /** 通知同一趟旅程的其他人「有東西改了」，不帶任何資料 */
  notify(): void
}
