import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AccountSession,
  AccountTrip,
  Expense,
  ExpenseInput,
  ExpenseShare,
  Id,
  Participant,
  PinResult,
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
} from '@/types'
import {
  AccountSessionError,
  ConflictError,
  InUseError,
  InvalidTokenError,
  NameTakenError,
  type ItemMove,
  type SpotMove,
  type TripRepository,
} from './repository'
import { RowMissingError, verifyAffected, type OnMissing } from './writeCheck'
import { channelName } from './realtime'

type PgError = { message: string; code?: string }

/** 查詢成功時 data 必定有值；沒接 .select() 的寫入 data 是 null，不可取用 */
function check<T>(res: { data: T | null; error: PgError | null }): T {
  const code = res.error?.code
  // 42501：RLS 擋下寫入或 RPC 拒絕，代表 token 已失效
  if (code === '42501') throw new InvalidTokenError()
  // TP409／TP404／TP422 是 schema.sql 自訂的錯誤碼
  if (code === 'TP409') throw new ConflictError()
  if (code === 'TP404') throw new RowMissingError()
  if (code === 'TP401') throw new AccountSessionError()
  if (code === 'TP422') throw new Error('已經有用原本當地幣別記的旅費，要先改掉那些旅費才能換幣別')
  if (code === '23505') throw new Error('已經有同名的旅伴')
  if (code === '23503') throw new Error('有旅伴或景點剛被別人刪除，請重新整理後再試')
  if (code === '23514' || code === '22023') throw new Error('資料格式不符，請檢查後再試')
  // 網路斷線時 supabase-js 回的是 TypeError 的訊息，換成看得懂的說法
  if (res.error && /fetch/i.test(res.error.message)) throw new Error('連不上伺服器，請確認網路後再試')
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/** PostgREST 回傳的 numeric 依設定可能是字串，一律轉成 number */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function toPinResult(raw: { ok: boolean; id?: Id; name?: string; key?: string; remaining?: number; locked_until?: string }): PinResult {
  return raw.ok && raw.id && raw.key
    ? { ok: true, session: { id: raw.id, name: raw.name ?? '', key: raw.key } }
    : { ok: false, remaining: raw.remaining, lockedUntil: raw.locked_until }
}

export class SupabaseRepo implements TripRepository {
  readonly mode = 'supabase' as const
  private sb: SupabaseClient
  /** 帳號相關的 RPC 不需要旅程 token，用不帶 header 的 client，換旅程時不受影響 */
  private readonly anon: SupabaseClient
  private token: string | null = null
  private tripId: Id | null = null
  private channel: RealtimeChannel | null = null

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {
    this.sb = this.createClient(null)
    this.anon = this.createClient(null)
  }

  private createClient(token: string | null) {
    return createClient(this.url, this.anonKey, {
      // 不使用 Supabase Auth；不保存 session，換 token 重建 client 時才不會搶同一份 storage
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // schema.sql 的 current_trip_id() 從這個 header 比對 token
      global: { headers: token ? { 'x-trip-token': token } : {} },
    })
  }

  async createTrip(input: TripInput, participantNames: string[]) {
    return check(
      await this.anon.rpc('create_trip', {
        p_name: input.name,
        p_start: input.start_date,
        p_end: input.end_date,
        p_currency: input.currency,
        p_fx_rate: input.fx_rate,
        p_participants: participantNames,
      }),
    ) as { id: Id; token: string }
  }

  setToken(token: string | null) {
    if (token === this.token) return
    void this.sb.removeAllChannels()
    this.channel = null
    this.token = token
    this.tripId = null
    this.sb = this.createClient(token)
  }

  private requireTrip(): Id {
    if (!this.tripId) throw new InvalidTokenError()
    return this.tripId
  }

  /** 旅程那一列看得到就代表 token 仍有效 */
  private async tokenOk() {
    return check(await this.sb.from('trips').select('id').maybeSingle()) !== null
  }

  private rowExists(table: string, id: Id) {
    return async () => check(await this.sb.from(table).select('id').eq('id', id).maybeSingle()) !== null
  }

  /** update／delete 須加 .select(…) 取回受影響的列，token 失效或版本不符時才不會被當成成功 */
  private async expectAffected(
    res: { data: unknown[] | null; error: PgError | null },
    onMissing: OnMissing,
    rowExists?: () => Promise<boolean>,
  ) {
    await verifyAffected(check(res).length, onMissing, () => this.tokenOk(), rowExists)
  }

  async loadTrip(): Promise<TripData> {
    const [trip, participants, spots, items, expenses, shares, transfers] = await Promise.all([
      this.sb.from('trips').select('id, name, start_date, end_date, currency, fx_rate, version, created_at, updated_at').maybeSingle(),
      this.sb.from('participants').select('*').order('sort_order').order('created_at'),
      this.sb.from('spots').select('*').order('sort_key'),
      this.sb.from('spot_items').select('*').order('sort_key'),
      this.sb.from('expenses').select('*'),
      this.sb.from('expense_shares').select('expense_id, participant_id, amount'),
      this.sb.from('transfers').select('*'),
    ])
    // token 不符時 RLS 讓每張表都回 0 筆而不是報錯，以旅程那一列是否存在判斷
    const t = check(trip) as Trip | null
    if (!t) throw new InvalidTokenError()
    this.tripId = t.id
    return {
      trip: { ...t, fx_rate: Number(t.fx_rate) },
      participants: check(participants) as Participant[],
      spots: check(spots) as Spot[],
      items: check(items) as SpotItem[],
      expenses: (check(expenses) as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) })),
      shares: (check(shares) as ExpenseShare[]).map((s) => ({ ...s, amount: num(s.amount) })),
      transfers: check(transfers) as Transfer[],
    }
  }

  async updateTrip(version: number, patch: TripPatch) {
    const id = this.requireTrip()
    await this.expectAffected(
      await this.sb.from('trips').update(patch).eq('id', id).eq('version', version).select('id'),
      'fail',
      this.rowExists('trips', id),
    )
  }

  async regenerateToken() {
    return check(await this.sb.rpc('regenerate_trip_token')) as string
  }

  async deleteTrip() {
    const id = this.requireTrip()
    await this.expectAffected(await this.sb.from('trips').delete().eq('id', id).select('id'), 'ignore')
  }

  async addParticipants(rows: { name: string; sort_order: number }[]) {
    const trip_id = this.requireTrip()
    if (rows.length) check(await this.sb.from('participants').insert(rows.map((r) => ({ ...r, trip_id }))))
  }

  async renameParticipant(id: Id, version: number, name: string) {
    await this.expectAffected(
      await this.sb.from('participants').update({ name }).eq('id', id).eq('version', version).select('id'),
      'fail',
      this.rowExists('participants', id),
    )
  }

  async deleteParticipant(id: Id) {
    const res = await this.sb.from('participants').delete().eq('id', id).select('id')
    if (res.error?.code === '23503') throw new InUseError()
    await this.expectAffected(res, 'ignore')
  }

  async createSpot(input: SpotInput) {
    const trip_id = this.requireTrip()
    return check(await this.sb.from('spots').insert({ ...input, trip_id }).select().single()) as Spot
  }

  async updateSpot(id: Id, version: number, patch: SpotPatch) {
    await this.expectAffected(
      await this.sb.from('spots').update(patch).eq('id', id).eq('version', version).select('id'),
      'fail',
      this.rowExists('spots', id),
    )
  }

  async moveSpots(moves: SpotMove[]) {
    // 被搬的景點可能剛被別人刪掉，視為已達成
    await Promise.all(
      moves.map(async (m) =>
        this.expectAffected(
          await this.sb.from('spots').update({ day: m.day, sort_key: m.sort_key }).eq('id', m.id).select('id'),
          'ignore',
        ),
      ),
    )
  }

  async deleteSpot(id: Id) {
    await this.expectAffected(await this.sb.from('spots').delete().eq('id', id).select('id'), 'ignore')
  }

  async createItem(input: SpotItemInput) {
    const trip_id = this.requireTrip()
    return check(await this.sb.from('spot_items').insert({ ...input, trip_id }).select().single()) as SpotItem
  }

  async updateItem(id: Id, version: number, patch: SpotItemPatch) {
    await this.expectAffected(
      await this.sb.from('spot_items').update(patch).eq('id', id).eq('version', version).select('id'),
      'fail',
      this.rowExists('spot_items', id),
    )
  }

  async setItemDone(id: Id, done: boolean) {
    await this.expectAffected(await this.sb.from('spot_items').update({ done }).eq('id', id).select('id'), 'fail')
  }

  async moveItems(moves: ItemMove[]) {
    await Promise.all(
      moves.map(async (m) =>
        this.expectAffected(await this.sb.from('spot_items').update({ sort_key: m.sort_key }).eq('id', m.id).select('id'), 'ignore'),
      ),
    )
  }

  async deleteItem(id: Id) {
    await this.expectAffected(await this.sb.from('spot_items').delete().eq('id', id).select('id'), 'ignore')
  }

  async saveExpense(input: ExpenseInput, shares: ShareInput[]) {
    return check(await this.sb.rpc('save_expense', { p_expense: input, p_shares: shares })) as Id
  }

  async deleteExpense(id: Id) {
    await this.expectAffected(await this.sb.from('expenses').delete().eq('id', id).select('id'), 'ignore')
  }

  async createTransfer(input: TransferInput) {
    const trip_id = this.requireTrip()
    check(await this.sb.from('transfers').insert({ ...input, trip_id }))
  }

  async deleteTransfer(id: Id) {
    await this.expectAffected(await this.sb.from('transfers').delete().eq('id', id).select('id'), 'ignore')
  }

  async registerAccount(name: string, pin: string): Promise<AccountSession> {
    const res = await this.anon.rpc('account_register', { p_name: name, p_pin: pin })
    if (res.error?.code === '23505') throw new NameTakenError()
    return check(res) as AccountSession
  }

  async loginAccount(name: string, pin: string) {
    return toPinResult(check(await this.anon.rpc('account_login', { p_name: name, p_pin: pin })))
  }

  async changeAccountPin(session: AccountSession, oldPin: string, newPin: string) {
    return toPinResult(
      check(
        await this.anon.rpc('account_change_pin', { p_account: session.id, p_key: session.key, p_old_pin: oldPin, p_new_pin: newPin }),
      ),
    )
  }

  async listAccountTrips(session: AccountSession) {
    return check(await this.anon.rpc('account_list_trips', { p_account: session.id, p_key: session.key })) as AccountTrip[]
  }

  async saveAccountTrip(session: AccountSession, token: string) {
    check(await this.anon.rpc('account_save_trip', { p_account: session.id, p_key: session.key, p_token: token }))
  }

  async removeAccountTrip(session: AccountSession, tripId: Id) {
    check(await this.anon.rpc('account_remove_trip', { p_account: session.id, p_key: session.key, p_trip: tripId }))
  }

  subscribe(onChange: () => void, onLive: (live: boolean) => void) {
    const sb = this.sb
    let cancelled = false
    let ch: RealtimeChannel | null = null
    let joined = false
    void channelName(this.token).then((name) => {
      if (cancelled || !name) return
      ch = sb.channel(name, { config: { broadcast: { self: false } } })
      ch.on('broadcast', { event: 'changed' }, () => onChange()).subscribe((status) => {
        onLive(status === 'SUBSCRIBED')
        // 斷線重連後補抓斷線期間漏掉的通知；第一次連上時資料才剛讀過，不用再讀
        if (status === 'SUBSCRIBED' && joined) onChange()
        if (status === 'SUBSCRIBED') joined = true
      })
      this.channel = ch
    })
    return () => {
      cancelled = true
      onLive(false)
      if (ch) {
        if (this.channel === ch) this.channel = null
        void sb.removeChannel(ch)
      }
    }
  }

  notify() {
    void this.channel?.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {})
  }
}
