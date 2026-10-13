import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AccountInfo,
  AccountSession,
  Expense,
  ExpenseInput,
  ExpenseProxy,
  ExpenseShare,
  Id,
  Participant,
  PhotoData,
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
  WishItem,
  WishItemInput,
  WishItemPatch,
  WishPhoto,
  WishStatus,
} from '@/types'
import {
  AccountSessionError,
  ConflictError,
  InUseError,
  LastMemberError,
  NameTakenError,
  NoAccessError,
  TooManyPhotosError,
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
  // 42501：RLS 擋下寫入或 RPC 拒絕，代表已經不是這趟旅程的成員
  if (code === '42501') throw new NoAccessError()
  // TP 開頭是 schema.sql 自訂的錯誤碼
  if (code === 'TP409') throw new ConflictError()
  if (code === 'TP404') throw new RowMissingError()
  if (code === 'TP401') throw new AccountSessionError()
  if (code === 'TP423') throw new LastMemberError()
  if (code === 'TP424') throw new TooManyPhotosError()
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
  private session: AccountSession | null = null
  private tripId: Id | null = null
  private channel: RealtimeChannel | null = null

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {
    this.sb = this.createClient(null)
  }

  private createClient(session: AccountSession | null) {
    return createClient(this.url, this.anonKey, {
      // 不使用 Supabase Auth；不保存 session，換帳號重建 client 時才不會搶同一份 storage
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // schema.sql 的 current_account_id() 從這兩個 header 驗證登入憑證
      global: { headers: session ? { 'x-account-id': session.id, 'x-account-key': session.key } : {} },
    })
  }

  setSession(session: AccountSession | null) {
    if (session?.id === this.session?.id && session?.key === this.session?.key) return
    void this.sb.removeAllChannels()
    this.channel = null
    this.session = session
    this.sb = this.createClient(session)
  }

  async registerAccount(name: string, pin: string): Promise<AccountSession> {
    const res = await this.sb.rpc('account_register', { p_name: name, p_pin: pin })
    if (res.error?.code === '23505') throw new NameTakenError()
    return check(res) as AccountSession
  }

  async loginAccount(name: string, pin: string) {
    return toPinResult(check(await this.sb.rpc('account_login', { p_name: name, p_pin: pin })))
  }

  async nameAvailable(name: string) {
    return check(await this.sb.rpc('account_name_available', { p_name: name })) as boolean
  }

  async whoami() {
    return check(await this.sb.rpc('whoami')) as AccountInfo
  }

  async changeAccountPin(oldPin: string, newPin: string) {
    return toPinResult(check(await this.sb.rpc('account_change_pin', { p_old_pin: oldPin, p_new_pin: newPin })))
  }

  async listAccounts() {
    return check(await this.sb.rpc('list_accounts')) as AccountInfo[]
  }

  async listTrips() {
    // 沒登入或憑證失效時 RLS 只會回 0 筆，先確認登入狀態，免得把失效當成沒有旅程
    await this.whoami()
    return check(await this.sb.from('trips').select('id, name, start_date, end_date').order('start_date')) as TripSummary[]
  }

  async createTrip(input: TripInput, members: Id[]) {
    return check(
      await this.sb.rpc('create_trip', {
        p_name: input.name,
        p_start: input.start_date,
        p_end: input.end_date,
        p_currency: input.currency,
        p_fx_rate: input.fx_rate,
        p_members: members,
      }),
    ) as Id
  }

  setTrip(tripId: Id | null) {
    if (tripId === this.tripId) return
    void this.sb.removeAllChannels()
    this.channel = null
    this.tripId = tripId
  }

  private requireTrip(): Id {
    if (!this.tripId) throw new NoAccessError()
    return this.tripId
  }

  /** 旅程那一列看得到就代表還是成員；看不到時再分辨是登入失效（丟 AccountSessionError）還是被移出 */
  private async accessOk() {
    const id = this.requireTrip()
    if (check(await this.sb.from('trips').select('id').eq('id', id).maybeSingle()) !== null) return true
    await this.whoami()
    return false
  }

  private rowExists(table: string, id: Id) {
    return async () => check(await this.sb.from(table).select('id').eq('id', id).maybeSingle()) !== null
  }

  /** update／delete 須加 .select(…) 取回受影響的列，被移出或版本不符時才不會被當成成功 */
  private async expectAffected(
    res: { data: unknown[] | null; error: PgError | null },
    onMissing: OnMissing,
    rowExists?: () => Promise<boolean>,
  ) {
    await verifyAffected(check(res).length, onMissing, () => this.accessOk(), rowExists)
  }

  async loadTrip(): Promise<TripData> {
    const id = this.requireTrip()
    const [trip, participants, spots, items, expenses, shares, proxies, transfers, wishItems, wishPhotos] = await Promise.all([
      this.sb.from('trips').select('*').eq('id', id).maybeSingle(),
      this.sb.from('participants').select('*').eq('trip_id', id).order('sort_order').order('created_at'),
      this.sb.from('spots').select('*').eq('trip_id', id).order('sort_key'),
      this.sb.from('spot_items').select('*').eq('trip_id', id).order('sort_key'),
      this.sb.from('expenses').select('*').eq('trip_id', id),
      this.sb.from('expense_shares').select('expense_id, participant_id, amount').eq('trip_id', id),
      this.sb.from('expense_proxies').select('id, expense_id, name, amount, wish_item_id').eq('trip_id', id).order('sort_order'),
      this.sb.from('transfers').select('*').eq('trip_id', id),
      // RLS 只回自己的代購清單；照片本身另外讀，這裡只拿清單
      this.sb.from('wish_items').select('*').eq('trip_id', id).order('sort_key'),
      this.sb.from('wish_photos').select('id, item_id, sort_order').eq('trip_id', id).order('sort_order').order('created_at'),
    ])
    // 不是成員時 RLS 讓每張表都回 0 筆而不是報錯，以旅程那一列是否存在判斷
    const t = check(trip) as Trip | null
    if (!t) {
      await this.whoami()
      throw new NoAccessError()
    }
    return {
      trip: { ...t, fx_rate: Number(t.fx_rate) },
      participants: check(participants) as Participant[],
      spots: check(spots) as Spot[],
      items: check(items) as SpotItem[],
      expenses: (check(expenses) as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) })),
      shares: (check(shares) as ExpenseShare[]).map((s) => ({ ...s, amount: num(s.amount) })),
      proxies: (check(proxies) as ExpenseProxy[]).map((p) => ({ ...p, amount: Number(p.amount) })),
      transfers: check(transfers) as Transfer[],
      wishItems: check(wishItems) as WishItem[],
      wishPhotos: check(wishPhotos) as WishPhoto[],
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

  async deleteTrip() {
    const id = this.requireTrip()
    await this.expectAffected(await this.sb.from('trips').delete().eq('id', id).select('id'), 'ignore')
  }

  async addMember(accountId: Id, participantId?: Id) {
    check(await this.sb.rpc('add_trip_member', { p_trip: this.requireTrip(), p_account: accountId, p_participant: participantId ?? null }))
  }

  async removeMember(participantId: Id) {
    check(await this.sb.rpc('remove_trip_member', { p_participant: participantId }))
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

  async saveExpense(input: ExpenseInput, shares: ShareInput[], proxies: ProxyInput[]) {
    return check(
      await this.sb.rpc('save_expense', { p_trip: this.requireTrip(), p_expense: input, p_shares: shares, p_proxies: proxies }),
    ) as Id
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

  private requireSession(): AccountSession {
    if (!this.session) throw new AccountSessionError()
    return this.session
  }

  async createWishItem(input: WishItemInput) {
    const trip_id = this.requireTrip()
    const owner_id = this.requireSession().id
    return check(await this.sb.from('wish_items').insert({ ...input, trip_id, owner_id }).select().single()) as WishItem
  }

  async updateWishItem(id: Id, version: number, patch: WishItemPatch) {
    await this.expectAffected(
      await this.sb.from('wish_items').update(patch).eq('id', id).eq('version', version).select('id'),
      'fail',
      this.rowExists('wish_items', id),
    )
  }

  async setWishStatus(id: Id, status: WishStatus) {
    await this.expectAffected(await this.sb.from('wish_items').update({ status }).eq('id', id).select('id'), 'fail')
  }

  async setWishSpot(ids: Id[], spotId: Id | null) {
    if (ids.length) check(await this.sb.from('wish_items').update({ spot_id: spotId }).in('id', ids).select('id'))
  }

  async deleteWishItem(id: Id) {
    await this.expectAffected(await this.sb.from('wish_items').delete().eq('id', id).select('id'), 'ignore')
  }

  async addWishPhoto(itemId: Id, photo: PhotoData) {
    const trip_id = this.requireTrip()
    const owner_id = this.requireSession().id
    return check(
      await this.sb
        .from('wish_photos')
        .insert({ item_id: itemId, trip_id, owner_id, thumb: photo.thumb, full_image: photo.full })
        .select('id, item_id, sort_order')
        .single(),
    ) as WishPhoto
  }

  async deleteWishPhoto(id: Id) {
    await this.expectAffected(await this.sb.from('wish_photos').delete().eq('id', id).select('id'), 'ignore')
  }

  async getWishPhoto(id: Id, size: 'thumb' | 'full') {
    const col = size === 'thumb' ? 'thumb' : 'full_image'
    const row = check(await this.sb.from('wish_photos').select(col).eq('id', id).maybeSingle()) as Record<string, string> | null
    if (!row) throw new RowMissingError()
    return row[col]
  }

  subscribe(onChange: () => void, onLive: (live: boolean) => void) {
    const sb = this.sb
    let cancelled = false
    let ch: RealtimeChannel | null = null
    let joined = false
    void channelName(this.tripId).then((name) => {
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
