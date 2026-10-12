import type {
  Expense,
  ExpenseInput,
  ExpenseShare,
  Id,
  Participant,
  ShareInput,
  Spot,
  SpotInput,
  SpotPatch,
  Transfer,
  TransferInput,
  Trip,
  TripData,
  TripInput,
  TripPatch,
} from '@/types'
import { toMinor } from '@/lib/money'
import { ConflictError, InUseError, InvalidTokenError, type SpotMove, type TripRepository } from './repository'
import { RowMissingError } from './writeCheck'
import { channelName } from './realtime'
import { randomId, randomToken, seedDemoTrip } from './demoSeed'

const DB_KEY = 'trip-demo-db-v1'

type StoredTrip = Trip & { token: string }
type StoredShare = ExpenseShare & { trip_id: Id }

export interface DemoDb {
  trips: StoredTrip[]
  participants: Participant[]
  spots: Spot[]
  expenses: Expense[]
  shares: StoredShare[]
  transfers: Transfer[]
}

export function emptyDb(): DemoDb {
  return { trips: [], participants: [], spots: [], expenses: [], shares: [], transfers: [] }
}

const now = () => new Date().toISOString()
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function readStorage(): DemoDb | null {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as DemoDb
    return Array.isArray(db.trips) && Array.isArray(db.spots) ? db : null
  } catch {
    return null
  }
}

/**
 * Demo 模式：資料存在 localStorage，行為盡量貼近 schema.sql
 * （token 檢查、版本號、刪除限制、幣別鎖定），同一瀏覽器的其他分頁以 BroadcastChannel 模擬即時同步
 */
export class DemoRepo implements TripRepository {
  readonly mode = 'demo' as const
  private token: string | null = null

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

  /** 模擬 RLS：token 不符就當作沒有這趟旅程 */
  private guard(): StoredTrip {
    this.sync()
    const trip = this.token ? this.db.trips.find((t) => t.token === this.token) : undefined
    if (!trip) throw new InvalidTokenError()
    return trip
  }

  private ofTrip<T extends { trip_id: Id }>(list: T[], tripId: Id) {
    return list.filter((r) => r.trip_id === tripId)
  }

  /** 開一趟示範旅程並回傳 token */
  createDemoTrip(): { id: Id; token: string } {
    this.sync()
    const { trip, data } = seedDemoTrip()
    this.db.trips.push(trip)
    this.db.participants.push(...data.participants)
    this.db.spots.push(...data.spots)
    this.db.expenses.push(...data.expenses)
    this.db.shares.push(...data.shares)
    this.db.transfers.push(...data.transfers)
    this.commit()
    return { id: trip.id, token: trip.token }
  }

  async createTrip(input: TripInput, participantNames: string[]) {
    this.sync()
    const t = now()
    const trip: StoredTrip = { ...input, id: randomId(), token: randomToken(), version: 1, created_at: t, updated_at: t }
    this.db.trips.push(trip)
    const names = [...new Set(participantNames.map((n) => n.trim()).filter(Boolean))]
    names.forEach((name, i) =>
      this.db.participants.push({ id: randomId(), trip_id: trip.id, name, sort_order: i, version: 1, created_at: t }),
    )
    this.commit()
    return { id: trip.id, token: trip.token }
  }

  setToken(token: string | null) {
    this.token = token
  }

  async loadTrip(): Promise<TripData> {
    const { token: _token, ...trip } = this.guard()
    const id = trip.id
    return clone({
      trip,
      participants: this.ofTrip(this.db.participants, id).sort((a, b) => a.sort_order - b.sort_order),
      spots: this.ofTrip(this.db.spots, id).sort((a, b) => a.sort_key - b.sort_key),
      expenses: this.ofTrip(this.db.expenses, id),
      shares: this.ofTrip(this.db.shares, id).map(({ trip_id: _t, ...s }) => s),
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

  async regenerateToken() {
    const trip = this.guard()
    trip.token = randomToken()
    this.commit()
    return trip.token
  }

  async deleteTrip() {
    const { id } = this.guard()
    this.db.trips = this.db.trips.filter((t) => t.id !== id)
    const keep = <T extends { trip_id: Id }>(list: T[]) => list.filter((r) => r.trip_id !== id)
    this.db.participants = keep(this.db.participants)
    this.db.spots = keep(this.db.spots)
    this.db.expenses = keep(this.db.expenses)
    this.db.shares = keep(this.db.shares)
    this.db.transfers = keep(this.db.transfers)
    this.commit()
  }

  async addParticipants(rows: { name: string; sort_order: number }[]) {
    const trip = this.guard()
    const existing = new Set(this.ofTrip(this.db.participants, trip.id).map((p) => p.name))
    if (rows.some((r) => existing.has(r.name.trim()))) throw new Error('已經有同名的旅伴')
    for (const r of rows) {
      this.db.participants.push({ id: randomId(), trip_id: trip.id, name: r.name.trim(), sort_order: r.sort_order, version: 1, created_at: now() })
    }
    this.commit()
  }

  async renameParticipant(id: Id, version: number, name: string) {
    const trip = this.guard()
    const p = this.db.participants.find((x) => x.id === id && x.trip_id === trip.id)
    if (!p) throw new RowMissingError()
    if (p.version !== version) throw new ConflictError()
    if (this.db.participants.some((x) => x.trip_id === trip.id && x.id !== id && x.name === name.trim())) {
      throw new Error('已經有同名的旅伴')
    }
    p.name = name.trim()
    p.version++
    this.commit()
  }

  async deleteParticipant(id: Id) {
    const trip = this.guard()
    const used =
      this.db.expenses.some((e) => e.trip_id === trip.id && e.payer_id === id) ||
      this.db.shares.some((s) => s.trip_id === trip.id && s.participant_id === id) ||
      this.db.transfers.some((t) => t.trip_id === trip.id && (t.from_id === id || t.to_id === id))
    if (used) throw new InUseError()
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
    for (const e of this.db.expenses) if (e.spot_id === id) e.spot_id = null
    this.commit()
  }

  async saveExpense(input: ExpenseInput, shares: ShareInput[]) {
    const trip = this.guard()
    if (input.currency !== 'TWD' && input.currency !== trip.currency) throw new Error('資料格式不符，請檢查後再試')
    if (!shares.length) throw new Error('資料格式不符，請檢查後再試')
    if (input.split_mode === 'custom') {
      const sum = shares.reduce((s, x) => s + toMinor(x.amount ?? NaN, input.currency), 0)
      if (sum !== toMinor(input.amount, input.currency)) throw new Error('資料格式不符，請檢查後再試')
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
    this.commit()
    return id
  }

  async deleteExpense(id: Id) {
    const trip = this.guard()
    this.db.expenses = this.db.expenses.filter((e) => !(e.id === id && e.trip_id === trip.id))
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
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

  private bc: BroadcastChannel | null = null

  subscribe(onChange: () => void, onLive: (live: boolean) => void) {
    let cancelled = false
    let bc: BroadcastChannel | null = null
    void channelName(this.token).then((name) => {
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
