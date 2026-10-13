import type {
  AccountInfo,
  AccountSession,
  ExpenseInput,
  Id,
  ShareInput,
  PhotoData,
  PinResult,
  ProxyInput,
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
  TripSummary,
  WishItem,
  WishItemInput,
  WishItemPatch,
  WishPhoto,
  WishStatus,
} from '@/types'

export type RepoMode = 'demo' | 'supabase'

/** 看不到這趟旅程：已經不是成員（被移出）或旅程已被刪除 */
export class NoAccessError extends Error {
  constructor() {
    super('你已經不是這趟旅程的成員，或旅程已被刪除')
    this.name = 'NoAccessError'
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

/** 旅程至少要留一位成員 */
export class LastMemberError extends Error {
  constructor() {
    super('旅程至少要留一位成員；不需要這趟旅程的話，請改用「刪除整趟旅程」')
    this.name = 'LastMemberError'
  }
}

/** 這台裝置的登入憑證已失效（沒登入，或密碼在別的裝置改過） */
export class AccountSessionError extends Error {
  constructor() {
    super('登入已失效，請重新登入')
    this.name = 'AccountSessionError'
  }
}

/** 與 schema.sql 的 limit_wish_photos 一致 */
export const MAX_WISH_PHOTOS = 2

/** 一個代購項目的照片已經到上限 */
export class TooManyPhotosError extends Error {
  constructor() {
    super(`一個項目最多 ${MAX_WISH_PHOTOS} 張照片`)
    this.name = 'TooManyPhotosError'
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

  /** 之後的請求都以這個帳號的身分；null 表示登出 */
  setSession(session: AccountSession | null): void
  /** 名稱重複丟 NameTakenError */
  registerAccount(name: string, pin: string): Promise<AccountSession>
  loginAccount(name: string, pin: string): Promise<PinResult>
  /** 註冊時即時檢查名稱還能不能用 */
  nameAvailable(name: string): Promise<boolean>
  /** 以下需要登入，憑證失效時丟 AccountSessionError */
  whoami(): Promise<AccountInfo>
  /** 成功時回傳新憑證，舊憑證（包括其他裝置的）一併失效 */
  changeAccountPin(oldPin: string, newPin: string): Promise<PinResult>
  /** 所有註冊使用者 */
  listAccounts(): Promise<AccountInfo[]>
  /** 自己是成員的旅程 */
  listTrips(): Promise<TripSummary[]>
  /** 建立者自動成為成員；members 是一起加入的帳號；回傳旅程 id */
  createTrip(input: TripInput, members: Id[]): Promise<Id>

  /** 之後的旅程操作都針對這趟；null 表示沒有開啟旅程 */
  setTrip(tripId: Id | null): void

  /** 看不到這趟時丟 NoAccessError */
  loadTrip(): Promise<TripData>
  /** 版本不符丟 ConflictError；有外幣費用時換幣別會丟錯 */
  updateTrip(version: number, patch: TripPatch): Promise<void>
  deleteTrip(): Promise<void>

  /** 把註冊使用者加成成員；participantId 是要換成這個帳號、已移出的旅伴（接手他的旅費紀錄） */
  addMember(accountId: Id, participantId?: Id): Promise<void>
  /** 移出成員：留下名字讓旅費紀錄照常結算；最後一位成員丟 LastMemberError */
  removeMember(participantId: Id): Promise<void>
  /** 刪掉已移出的人；有旅費或轉帳紀錄時丟 InUseError */
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

  /** 寫入費用並以 shares、proxies 完整取代分攤與代購；修改時版本不符丟 ConflictError */
  saveExpense(input: ExpenseInput, shares: ShareInput[], proxies: ProxyInput[]): Promise<Id>
  deleteExpense(id: Id): Promise<void>

  createTransfer(input: TransferInput): Promise<void>
  deleteTransfer(id: Id): Promise<void>

  /** 以下是自己的代購清單 */
  createWishItem(input: WishItemInput): Promise<WishItem>
  /** 版本不符丟 ConflictError */
  updateWishItem(id: Id, version: number, patch: WishItemPatch): Promise<void>
  /** 打勾與排地點都不檢查版本 */
  setWishStatus(id: Id, status: WishStatus): Promise<void>
  /** 排到行程（spotId）或行程底下的店家（itemId，要屬於那個行程）；都給 null 是還沒排 */
  setWishPlace(ids: Id[], spotId: Id | null, itemId?: Id | null): Promise<void>
  deleteWishItem(id: Id): Promise<void>
  /** 超過上限丟 TooManyPhotosError */
  addWishPhoto(itemId: Id, photo: PhotoData): Promise<WishPhoto>
  deleteWishPhoto(id: Id): Promise<void>
  /** 照片不會改，讀過的可以一直快取 */
  getWishPhoto(id: Id, size: 'thumb' | 'full'): Promise<string>

  /** 收到其他人的異動通知時呼叫 onChange；live 回報即時連線狀態；回傳取消訂閱的函式 */
  subscribe(onChange: () => void, onLive: (live: boolean) => void): () => void
  /** 通知同一趟旅程的其他人「有東西改了」，不帶任何資料 */
  notify(): void
}
