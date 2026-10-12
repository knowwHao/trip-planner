import type {
  ExpenseInput,
  Id,
  ShareInput,
  Spot,
  SpotInput,
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

  /** 寫入費用並以 shares 完整取代分攤；修改時版本不符丟 ConflictError */
  saveExpense(input: ExpenseInput, shares: ShareInput[]): Promise<Id>
  deleteExpense(id: Id): Promise<void>

  createTransfer(input: TransferInput): Promise<void>
  deleteTransfer(id: Id): Promise<void>

  /** 收到其他人的異動通知時呼叫 onChange；live 回報即時連線狀態；回傳取消訂閱的函式 */
  subscribe(onChange: () => void, onLive: (live: boolean) => void): () => void
  /** 通知同一趟旅程的其他人「有東西改了」，不帶任何資料 */
  notify(): void
}
