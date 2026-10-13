import type {
  AccountInfo,
  AccountSession,
  Expense,
  ExpenseInput,
  ExpenseProxy,
  ExpenseShare,
  Id,
  Participant,
  PinResult,
  ProxyInput,
  ShareInput,
  Spot,
  SpotInput,
  SpotItem,
  SpotItemInput,
  SpotItemPatch,
  SpotPatch,
  Transfer,
  TransferInput,
  Trip,
  TripData,
  TripInput,
  TripPatch,
  TripSummary,
} from '@/types'
import { toMinor } from '@/lib/money'
import {
  AccountSessionError,
  ConflictError,
  InUseError,
  LastMemberError,
  NameTakenError,
  NoAccessError,
  type ItemMove,
  type SpotMove,
  type TripRepository,
} from './repository'
import { isValidPin, PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from '@/lib/pin'
import { RowMissingError } from './writeCheck'
import { channelName } from './realtime'
import { randomId, randomKey, seedDemoTrip } from './demoSeed'

const DB_KEY = 'trip-demo-db-v1'

type StoredShare = ExpenseShare & { trip_id: Id }
type StoredProxy = ExpenseProxy & { trip_id: Id; sort_order: number }

/** Demo 只存在這個瀏覽器，密碼直接存明碼；真正的資料庫存的是加鹽雜湊 */
interface DemoAccount {
  id: Id
  name: string
  pin: string
  key: string
  failed: number
  locked_until: string | null
}

export interface DemoDb {
  trips: Trip[]
  participants: Participant[]
  spots: Spot[]
  items: SpotItem[]
  expenses: Expense[]
  shares: StoredShare[]
  proxies: StoredProxy[]
  transfers: Transfer[]
  accounts: DemoAccount[]
}

export function emptyDb(): DemoDb {
  return { trips: [], participants: [], spots: [], items: [], expenses: [], shares: [], proxies: [], transfers: [], accounts: [] }
}

const NO_FLIGHT = { airline: '', flight_no: '', dep_airport: '', arr_airport: '', arr_time: null, arr_day_offset: 0 }

const now = () => new Date().toISOString()
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function readStorage(): DemoDb | null {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as DemoDb
    if (!(Array.isArray(db.trips) && Array.isArray(db.spots))) return null
    // 加入類型、預約狀態與實際扣款前存下的示範資料，與 schema.sql 升級時一樣補上預設值
    for (const s of db.spots) {
      s.category ??= 'sight'
      s.booking ??= null
      // 與 schema.sql 一樣拿掉舊版的預估花費
      Reflect.deleteProperty(s, 'est_cost')
      for (const [k, v] of Object.entries(NO_FLIGHT)) (s as unknown as Record<string, unknown>)[k] ??= v
    }
    for (const e of db.expenses) e.twd_amount ??= null
    // 加入子項目與帳號前存下的示範資料
    db.items ??= []
    db.accounts ??= []
    db.proxies ??= []
    // 與 schema.sql 一樣拿掉旅程連結；舊的示範旅程沒有成員，誰都看不到
    for (const t of db.trips) Reflect.deleteProperty(t, 'token')
    for (const p of db.participants) p.account_id ??= null
    Reflect.deleteProperty(db, 'account_trips')
    return db
  } catch {
    return null
  }
}

/**
 * Demo 模式：資料存在 localStorage，行為盡量貼近 schema.sql
 * （登入憑證、成員權限、版本號、刪除限制、幣別鎖定），同一瀏覽器的其他分頁以 BroadcastChannel 模擬即時同步
 */
export class DemoRepo implements TripRepository {
  readonly mode = 'demo' as const
  private session: AccountSession | null = null
  private tripId: Id | null = null

  constructor(private db: DemoDb = readStorage() ?? emptyDb()) {}

  private commit() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db))
    } catch {
      // 無痕模式或儲存空間被封鎖時仍可在記憶體中操作
    }
  }

  /** 其他分頁可能改過，每次操作前重讀 */
  private sync() {
    const fresh = readStorage()
    if (fresh) this.db = fresh
  }

  /** 模擬 require_account()：憑證不符就當作登入失效 */
  private me(): DemoAccount {
    this.sync()
    const s = this.session
    const acc = s ? this.db.accounts.find((a) => a.id === s.id && a.key === s.key) : undefined
    if (!acc) throw new AccountSessionError()
    return acc
  }

  private isMember(tripId: Id, accountId: Id) {
    return this.db.participants.some((p) => p.trip_id === tripId && p.account_id === accountId)
  }

  /** 模擬 RLS：要登入，而且是這趟旅程的成員 */
  private guard(): Trip {
    const acc = this.me()
    const trip = this.tripId ? this.db.trips.find((t) => t.id === this.tripId) : undefined
    if (!trip || !this.isMember(trip.id, acc.id)) throw new NoAccessError()
    return trip
  }

  private ofTrip<T extends { trip_id: Id }>(list: T[], tripId: Id) {
    return list.filter((r) => r.trip_id === tripId)
  }

  /** 開一趟示範旅程，登入的人和三位示範帳號是成員；回傳旅程 id */
  createDemoTrip(): Id {
    const acc = this.me()
    // 示範旅伴也要是帳號；名字已被註冊就直接用那個帳號，沒有就建一個沒人知道密碼的
    const others = ['小華', '阿傑', '小美', '小明']
      .filter((n) => n !== acc.name)
      .slice(0, 3)
      .map((name) => {
        let a = this.db.accounts.find((x) => x.name.toLowerCase() === name.toLowerCase())
        if (!a) {
          a = { id: randomId(), name, pin: randomKey(), key: randomKey(), failed: 0, locked_until: null }
          this.db.accounts.push(a)
        }
        return { id: a.id, name: a.name }
      })
    const { trip, data } = seedDemoTrip({ id: acc.id, name: acc.name }, others)
    this.db.trips.push(trip)
    this.db.participants.push(...data.participants)
    this.db.spots.push(...data.spots)
    this.db.items.push(...data.items)
    this.db.expenses.push(...data.expenses)
    this.db.shares.push(...data.shares)
    this.db.proxies.push(...data.proxies)
    this.db.transfers.push(...data.transfers)
    this.commit()
    return trip.id
  }

  setSession(session: AccountSession | null) {
    this.session = session
  }

  async whoami(): Promise<AccountInfo> {
    const acc = this.me()
    return { id: acc.id, name: acc.name }
  }

  async listAccounts(): Promise<AccountInfo[]> {
    this.me()
    return this.db.accounts.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  }

  async listTrips(): Promise<TripSummary[]> {
    const acc = this.me()
    return this.db.trips
      .filter((t) => this.isMember(t.id, acc.id))
      .map(({ id, name, start_date, end_date }) => ({ id, name, start_date, end_date }))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }

  private participant(tripId: Id, name: string, sort_order: number, account_id: Id | null): Participant {
    return { id: randomId(), trip_id: tripId, account_id, name, sort_order, version: 1, created_at: now() }
  }

  async createTrip(input: TripInput, members: Id[]) {
    const acc = this.me()
    const t = now()
    const trip: Trip = { ...input, id: randomId(), version: 1, created_at: t, updated_at: t }
    this.db.trips.push(trip)
    // 與 create_trip() 相同：自己排第一，接著是勾選的成員
    const rows = [this.participant(trip.id, acc.name, 0, acc.id)]
    const taken = (name: string) => rows.some((r) => r.name === name)
    members.forEach((id, i) => {
      const a = this.db.accounts.find((x) => x.id === id)
      if (a && !taken(a.name)) rows.push(this.participant(trip.id, a.name, i + 1, a.id))
    })
    this.db.participants.push(...rows)
    this.commit()
    return trip.id
  }

  setTrip(tripId: Id | null) {
    this.tripId = tripId
  }

  async loadTrip(): Promise<TripData> {
    const trip = this.guard()
    const id = trip.id
    return clone({
      trip,
      participants: this.ofTrip(this.db.participants, id).sort((a, b) => a.sort_order - b.sort_order),
      spots: this.ofTrip(this.db.spots, id).sort((a, b) => a.sort_key - b.sort_key),
      items: this.ofTrip(this.db.items, id).sort((a, b) => a.sort_key - b.sort_key),
      expenses: this.ofTrip(this.db.expenses, id),
      shares: this.ofTrip(this.db.shares, id).map(({ trip_id: _t, ...s }) => s),
      proxies: this.ofTrip(this.db.proxies, id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ trip_id: _t, sort_order: _o, ...p }) => p),
      transfers: this.ofTrip(this.db.transfers, id),
    })
  }

  async updateTrip(version: number, patch: TripPatch) {
    const trip = this.guard()
    if (trip.version !== version) throw new ConflictError()
    if (patch.currency && patch.currency !== trip.currency) {
      const locked = this.ofTrip(this.db.expenses, trip.id).some((e) => e.currency !== 'TWD' && e.currency !== patch.currency)
      if (locked) throw new Error('已經有用原本當地幣別記的旅費，要先改掉那些旅費才能換幣別')
    }
    Object.assign(trip, patch, { version: trip.version + 1, updated_at: now() })
    this.commit()
  }

  async deleteTrip() {
    const { id } = this.guard()
    this.db.trips = this.db.trips.filter((t) => t.id !== id)
    const keep = <T extends { trip_id: Id }>(list: T[]) => list.filter((r) => r.trip_id !== id)
    this.db.participants = keep(this.db.participants)
    this.db.spots = keep(this.db.spots)
    this.db.items = keep(this.db.items)
    this.db.expenses = keep(this.db.expenses)
    this.db.shares = keep(this.db.shares)
    this.db.proxies = keep(this.db.proxies)
    this.db.transfers = keep(this.db.transfers)
    this.commit()
  }

  async addMember(accountId: Id, participantId?: Id) {
    const trip = this.guard()
    const acc = this.db.accounts.find((a) => a.id === accountId)
    if (!acc) throw new RowMissingError()
    const list = this.ofTrip(this.db.participants, trip.id)
    if (list.some((p) => p.account_id === accountId)) return
    // 與 add_trip_member() 相同：指定的旅伴、或同名的旅伴直接換成成員，旅費紀錄跟著保留
    const target = participantId
      ? list.find((p) => p.id === participantId && !p.account_id)
      : list.find((p) => p.name === acc.name && !p.account_id)
    if (participantId && !target) throw new RowMissingError()
    if (target) {
      if (list.some((p) => p.id !== target.id && p.name === acc.name)) throw new Error('已經有同名的旅伴')
      Object.assign(target, { account_id: acc.id, name: acc.name, version: target.version + (target.name === acc.name ? 0 : 1) })
    } else {
      this.db.participants.push(this.participant(trip.id, acc.name, Math.max(-1, ...list.map((p) => p.sort_order)) + 1, acc.id))
    }
    this.commit()
  }

  async removeMember(participantId: Id) {
    const trip = this.guard()
    const p = this.db.participants.find((x) => x.id === participantId && x.trip_id === trip.id)
    if (!p) throw new NoAccessError()
    if (p.account_id && !this.ofTrip(this.db.participants, trip.id).some((x) => x.account_id && x.id !== p.id)) throw new LastMemberError()
    p.account_id = null
    this.commit()
  }

  async deleteParticipant(id: Id) {
    const trip = this.guard()
    const used =
      this.db.expenses.some((e) => e.trip_id === trip.id && e.payer_id === id) ||
      this.db.shares.some((s) => s.trip_id === trip.id && s.participant_id === id) ||
      this.db.transfers.some((t) => t.trip_id === trip.id && (t.from_id === id || t.to_id === id))
    if (used) throw new InUseError()
    const p = this.db.participants.find((x) => x.id === id && x.trip_id === trip.id)
    if (p?.account_id && !this.ofTrip(this.db.participants, trip.id).some((x) => x.account_id && x.id !== id)) throw new LastMemberError()
    this.db.participants = this.db.participants.filter((p) => !(p.id === id && p.trip_id === trip.id))
    this.commit()
  }

  async createSpot(input: SpotInput) {
    const trip = this.guard()
    const t = now()
    const spot: Spot = { ...input, id: randomId(), trip_id: trip.id, version: 1, created_at: t, updated_at: t }
    this.db.spots.push(spot)
    this.commit()
    return clone(spot)
  }

  private findSpot(id: Id) {
    const trip = this.guard()
    return this.db.spots.find((s) => s.id === id && s.trip_id === trip.id)
  }

  async updateSpot(id: Id, version: number, patch: SpotPatch) {
    const s = this.findSpot(id)
    if (!s) throw new RowMissingError()
    if (s.version !== version) throw new ConflictError()
    // 與 schema.sql 的 bump_version() 相同：只改天數或排序不加版本
    const changed = Object.entries(patch).some(([k, v]) => k !== 'day' && k !== 'sort_key' && s[k as keyof Spot] !== v)
    Object.assign(s, patch, { updated_at: now() })
    if (changed) s.version++
    this.commit()
  }

  async moveSpots(moves: SpotMove[]) {
    // 只能 guard 一次：guard 會從 localStorage 重讀，迴圈裡每次重讀會丟掉前面還沒存的搬動
    const trip = this.guard()
    for (const m of moves) {
      const s = this.db.spots.find((x) => x.id === m.id && x.trip_id === trip.id)
      if (s) Object.assign(s, { day: m.day, sort_key: m.sort_key })
    }
    this.commit()
  }

  async deleteSpot(id: Id) {
    const trip = this.guard()
    this.db.spots = this.db.spots.filter((s) => !(s.id === id && s.trip_id === trip.id))
    this.db.items = this.db.items.filter((i) => i.spot_id !== id)
    for (const e of this.db.expenses) if (e.spot_id === id) e.spot_id = null
    this.commit()
  }

  async createItem(input: SpotItemInput) {
    const trip = this.guard()
    if (!this.db.spots.some((s) => s.id === input.spot_id && s.trip_id === trip.id)) throw new RowMissingError()
    const t = now()
    const item: SpotItem = { ...input, id: randomId(), trip_id: trip.id, done: false, version: 1, created_at: t, updated_at: t }
    this.db.items.push(item)
    this.commit()
    return clone(item)
  }

  private findItem(id: Id) {
    const trip = this.guard()
    return this.db.items.find((i) => i.id === id && i.trip_id === trip.id)
  }

  async updateItem(id: Id, version: number, patch: SpotItemPatch) {
    const item = this.findItem(id)
    if (!item) throw new RowMissingError()
    if (item.version !== version) throw new ConflictError()
    const changed = Object.entries(patch).some(([k, v]) => item[k as keyof SpotItem] !== v)
    Object.assign(item, patch, { updated_at: now() })
    if (changed) item.version++
    this.commit()
  }

  async setItemDone(id: Id, done: boolean) {
    const item = this.findItem(id)
    if (!item) throw new RowMissingError()
    item.done = done
    this.commit()
  }

  async moveItems(moves: ItemMove[]) {
    // 與 moveSpots 一樣只能 guard 一次，否則重讀 localStorage 會丟掉前面的搬動
    const trip = this.guard()
    for (const m of moves) {
      const item = this.db.items.find((i) => i.id === m.id && i.trip_id === trip.id)
      if (item) item.sort_key = m.sort_key
    }
    this.commit()
  }

  async deleteItem(id: Id) {
    const trip = this.guard()
    this.db.items = this.db.items.filter((i) => !(i.id === id && i.trip_id === trip.id))
    this.commit()
  }

  async saveExpense(input: ExpenseInput, shares: ShareInput[], proxies: ProxyInput[]) {
    const trip = this.guard()
    const bad = () => new Error('資料格式不符，請檢查後再試')
    const code = input.currency
    if (code !== 'TWD' && code !== trip.currency) throw bad()
    if (!shares.length && !proxies.length) throw bad()
    if (proxies.some((p) => !p.name.trim() || [...p.name.trim()].length > 20 || !(p.amount > 0))) throw bad()
    // 與 save_expense() 相同：指定金額時旅伴加代購要等於總額；平分時代購要留一些給旅伴分，沒有旅伴時要等於總額
    const total = toMinor(input.amount, code)
    const proxySum = proxies.reduce((s, p) => s + toMinor(p.amount, code), 0)
    if (input.split_mode === 'custom') {
      const sum = shares.reduce((s, x) => s + toMinor(x.amount ?? NaN, code), 0)
      if (sum + proxySum !== total) throw bad()
    } else if (shares.length ? proxySum >= total : proxySum !== total) {
      throw bad()
    }
    const ids = new Set(this.ofTrip(this.db.participants, trip.id).map((p) => p.id))
    if (!ids.has(input.payer_id) || shares.some((s) => !ids.has(s.participant_id))) {
      throw new Error('有旅伴或景點剛被別人刪除，請重新整理後再試')
    }
    const { id: inputId, version, ...fields } = input
    let id: Id
    if (inputId) {
      const e = this.db.expenses.find((x) => x.id === inputId && x.trip_id === trip.id)
      if (!e) throw new RowMissingError()
      if (e.version !== version) throw new ConflictError()
      Object.assign(e, fields, { version: e.version + 1 })
      id = e.id
    } else {
      id = randomId()
      this.db.expenses.push({ ...fields, id, trip_id: trip.id, version: 1, created_at: now() })
    }
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
    for (const s of shares) {
      this.db.shares.push({
        expense_id: id,
        trip_id: trip.id,
        participant_id: s.participant_id,
        amount: input.split_mode === 'custom' ? s.amount : null,
      })
    }
    this.db.proxies = this.db.proxies.filter((p) => p.expense_id !== id)
    proxies.forEach((p, i) =>
      this.db.proxies.push({ id: randomId(), expense_id: id, trip_id: trip.id, name: p.name.trim(), amount: p.amount, sort_order: i }),
    )
    this.commit()
    return id
  }

  async deleteExpense(id: Id) {
    const trip = this.guard()
    this.db.expenses = this.db.expenses.filter((e) => !(e.id === id && e.trip_id === trip.id))
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
    this.db.proxies = this.db.proxies.filter((p) => p.expense_id !== id)
    this.commit()
  }

  async createTransfer(input: TransferInput) {
    const trip = this.guard()
    this.db.transfers.push({ ...input, id: randomId(), trip_id: trip.id, created_at: now() })
    this.commit()
  }

  async deleteTransfer(id: Id) {
    const trip = this.guard()
    this.db.transfers = this.db.transfers.filter((t) => !(t.id === id && t.trip_id === trip.id))
    this.commit()
  }

  private attemptPin(acc: DemoAccount | undefined, pin: string): PinResult {
    if (!acc) return { ok: false }
    if (acc.locked_until && acc.locked_until > now()) return { ok: false, lockedUntil: acc.locked_until }
    if (acc.pin === pin) {
      acc.failed = 0
      acc.locked_until = null
      this.commit()
      return { ok: true, session: { id: acc.id, name: acc.name, key: acc.key } }
    }
    acc.failed++
    if (acc.failed >= PIN_MAX_ATTEMPTS) {
      acc.failed = 0
      acc.locked_until = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString()
      this.commit()
      return { ok: false, lockedUntil: acc.locked_until }
    }
    this.commit()
    return { ok: false, remaining: PIN_MAX_ATTEMPTS - acc.failed }
  }

  async registerAccount(name: string, pin: string) {
    this.sync()
    const trimmed = name.trim()
    if (!isValidPin(pin) || [...trimmed].length < 2 || [...trimmed].length > 20) throw new Error('資料格式不符，請檢查後再試')
    if (this.db.accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) throw new NameTakenError()
    const acc: DemoAccount = { id: randomId(), name: trimmed, pin, key: randomKey(), failed: 0, locked_until: null }
    this.db.accounts.push(acc)
    this.commit()
    return { id: acc.id, name: acc.name, key: acc.key }
  }

  async nameAvailable(name: string) {
    this.sync()
    return !this.db.accounts.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())
  }

  async loginAccount(name: string, pin: string) {
    this.sync()
    return this.attemptPin(this.db.accounts.find((a) => a.name.toLowerCase() === name.trim().toLowerCase()), pin)
  }

  async changeAccountPin(oldPin: string, newPin: string): Promise<PinResult> {
    const acc = this.me()
    if (!isValidPin(newPin)) throw new Error('資料格式不符，請檢查後再試')
    const res = this.attemptPin(acc, oldPin)
    if (!res.ok) return res
    acc.pin = newPin
    acc.key = randomKey()
    this.commit()
    return { ok: true, session: { id: acc.id, name: acc.name, key: acc.key } }
  }

  private bc: BroadcastChannel | null = null

  subscribe(onChange: () => void, onLive: (live: boolean) => void) {
    let cancelled = false
    let bc: BroadcastChannel | null = null
    void channelName(this.tripId).then((name) => {
      if (cancelled || !name || typeof BroadcastChannel === 'undefined') return
      bc = new BroadcastChannel(name)
      bc.onmessage = () => onChange()
      this.bc = bc
      onLive(true)
    })
    return () => {
      cancelled = true
      onLive(false)
      if (bc) {
        if (this.bc === bc) this.bc = null
        bc.close()
      }
    }
  }

  notify() {
    this.bc?.postMessage('changed')
  }
}
