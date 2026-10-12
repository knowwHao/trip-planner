import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoRepo, emptyDb } from './demoRepo'
import { AccountSessionError, ConflictError, InUseError, LastMemberError, NameTakenError, NoAccessError } from './repository'
import { netBalances } from '@/lib/split'
import type { SpotInput } from '@/types'

// DemoRepo 每次操作都會從 localStorage 重讀，測試要有真的 storage 才測得到這個行為
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
})
beforeEach(() => storage.clear())

const spotBase: Omit<SpotInput, 'title' | 'sort_key'> = {
  category: 'sight',
  booking: null,
  day: 1,
  start_time: null,
  address: '',
  map_url: '',
  note: '',
  airline: '',
  flight_no: '',
  dep_airport: '',
  arr_airport: '',
  arr_time: null,
  arr_day_offset: 0,
}

/** 甲甲建立大阪之旅，乙乙一起加入，丙丙是只記帳的旅伴 */
async function setup() {
  const repo = new DemoRepo(emptyDb())
  const b = await repo.registerAccount('乙乙', '222222')
  const a = await repo.registerAccount('甲甲', '111111')
  repo.setSession(a)
  const tripId = await repo.createTrip(
    { name: '大阪', start_date: '2026-11-01', end_date: '2026-11-03', currency: 'JPY', fx_rate: 0.2 },
    [b.id],
    ['丙丙', ' 丙丙 ', '', '甲甲'],
  )
  repo.setTrip(tripId)
  return { repo, tripId, a, b }
}

describe('DemoRepo', () => {
  it('沒登入、憑證錯誤或不是成員都讀不到也寫不進', async () => {
    const { repo, a } = await setup()
    repo.setSession(null)
    await expect(repo.loadTrip()).rejects.toBeInstanceOf(AccountSessionError)
    repo.setSession({ ...a, key: 'x'.repeat(64) })
    await expect(repo.listTrips()).rejects.toBeInstanceOf(AccountSessionError)
    repo.setSession(await repo.registerAccount('路人', '333333'))
    expect(await repo.listTrips()).toEqual([])
    await expect(repo.loadTrip()).rejects.toBeInstanceOf(NoAccessError)
    await expect(repo.createSpot({ ...spotBase, title: 'x', sort_key: 1 })).rejects.toBeInstanceOf(NoAccessError)
  })

  it('建立者排第一、勾選的成員、只記帳的旅伴去重', async () => {
    const { repo, a, b } = await setup()
    const ps = (await repo.loadTrip()).participants
    expect(ps.map((p) => [p.name, p.account_id])).toEqual([
      ['甲甲', a.id],
      ['乙乙', b.id],
      ['丙丙', null],
    ])
    repo.setSession(b)
    expect((await repo.listTrips()).map((t) => t.name)).toEqual(['大阪'])
  })

  it('加人、移出、最後一位成員不能移出', async () => {
    const { repo, b } = await setup()
    const c = await repo.registerAccount('丙丙', '444444')
    const [pa, pb, pc] = (await repo.loadTrip()).participants
    // 同名只記帳的旅伴直接換成成員
    await repo.addMember(c.id)
    expect((await repo.loadTrip()).participants.find((p) => p.id === pc.id)?.account_id).toBe(c.id)
    await repo.removeMember(pb.id)
    expect((await repo.loadTrip()).participants.find((p) => p.id === pb.id)).toMatchObject({ name: '乙乙', account_id: null })
    repo.setSession(b)
    await expect(repo.loadTrip()).rejects.toBeInstanceOf(NoAccessError)
    repo.setSession(c)
    await repo.removeMember(pa.id)
    await expect(repo.removeMember(pc.id)).rejects.toBeInstanceOf(LastMemberError)
    await expect(repo.deleteParticipant(pc.id)).rejects.toBeInstanceOf(LastMemberError)
    // 指定旅伴換成帳號，名字跟著換；換成的名字和別的旅伴撞名時擋下
    const d = await repo.registerAccount('老王', '555555')
    await repo.addMember(d.id, pa.id)
    expect((await repo.loadTrip()).participants.find((p) => p.id === pa.id)).toMatchObject({ name: '老王', account_id: d.id })
    const pd = (await repo.loadTrip()).participants.find((p) => p.id === pb.id)!
    await repo.renameParticipant(pd.id, pd.version, '阿乙')
    await repo.addMember(b.id, pb.id)
    expect((await repo.loadTrip()).participants.find((p) => p.id === pb.id)).toMatchObject({ name: '乙乙', account_id: b.id })
  })

  it('成員的名字固定是帳號名稱，只記帳的旅伴可以改名', async () => {
    const { repo } = await setup()
    const [pa, , pc] = (await repo.loadTrip()).participants
    await repo.renameParticipant(pa.id, pa.version, '暱稱')
    await repo.renameParticipant(pc.id, pc.version, '老丙')
    expect((await repo.loadTrip()).participants.map((p) => p.name)).toEqual(['甲甲', '乙乙', '老丙'])
  })

  it('景點改內容加版本、搬動不加，舊版本更新是衝突', async () => {
    const { repo } = await setup()
    const s = await repo.createSpot({ ...spotBase, title: '大阪城', sort_key: 1 })
    await repo.moveSpots([{ id: s.id, day: 2, sort_key: 5 }])
    expect((await repo.loadTrip()).spots[0]).toMatchObject({ day: 2, version: 1 })
    await repo.updateSpot(s.id, 1, { title: '通天閣' })
    await expect(repo.updateSpot(s.id, 1, { title: '舊的' })).rejects.toBeInstanceOf(ConflictError)
    await repo.updateSpot(s.id, 2, { category: 'transport', flight_no: 'JL802', arr_time: '12:45', arr_day_offset: 1 })
    expect((await repo.loadTrip()).spots[0]).toMatchObject({ title: '通天閣', flight_no: 'JL802', version: 3 })
  })

  it('一次搬動多個景點全部生效', async () => {
    const { repo } = await setup()
    const a = await repo.createSpot({ ...spotBase, title: 'A', sort_key: 1 })
    const b = await repo.createSpot({ ...spotBase, title: 'B', sort_key: 2 })
    await repo.moveSpots([
      { id: a.id, day: 2, sort_key: 20 },
      { id: b.id, day: 2, sort_key: 10 },
    ])
    expect((await repo.loadTrip()).spots.map((s) => [s.title, s.day])).toEqual([
      ['B', 2],
      ['A', 2],
    ])
  })

  it('費用：指定金額要加總等於總額、有紀錄的旅伴不能刪、有外幣費用不能換幣別', async () => {
    const { repo } = await setup()
    const [a, , c] = (await repo.loadTrip()).participants.map((p) => p.id)
    const base = { title: '晚餐', amount: 3000, currency: 'JPY', payer_id: a, spent_on: null, spot_id: null, note: '', twd_amount: null }
    await expect(repo.saveExpense({ ...base, split_mode: 'custom' }, [{ participant_id: a, amount: 1000 }])).rejects.toThrow()
    const id = await repo.saveExpense({ ...base, split_mode: 'custom' }, [
      { participant_id: a, amount: 1000 },
      { participant_id: c, amount: 2000 },
    ])
    await expect(repo.saveExpense({ ...base, id, version: 2, split_mode: 'even' }, [{ participant_id: a, amount: null }])).rejects.toBeInstanceOf(
      ConflictError,
    )
    await expect(repo.deleteParticipant(c)).rejects.toBeInstanceOf(InUseError)
    const data = await repo.loadTrip()
    await expect(repo.updateTrip(data.trip.version, { currency: 'KRW', fx_rate: 0.02 })).rejects.toThrow('換幣別')
    // 3000 日圓 × 0.2：甲甲付 600，自己 200、丙丙 400
    expect(Object.fromEntries(netBalances(data))).toMatchObject({ [a]: 400, [c]: -400 })
  })

  it('子項目：打勾不加版本、改內容加版本、刪行程連帶刪除', async () => {
    const { repo } = await setup()
    const spot = await repo.createSpot({ ...spotBase, category: 'shop', title: '銀座', sort_key: 1 })
    const item = await repo.createItem({ spot_id: spot.id, title: 'UNIQLO', address: '', map_url: '', note: '', sort_key: 1 })
    await repo.setItemDone(item.id, true)
    expect((await repo.loadTrip()).items[0]).toMatchObject({ done: true, version: 1 })
    await repo.updateItem(item.id, 1, { note: '買襪子' })
    await expect(repo.updateItem(item.id, 1, { note: '舊的' })).rejects.toBeInstanceOf(ConflictError)
    await repo.deleteSpot(spot.id)
    expect((await repo.loadTrip()).items).toEqual([])
  })

  it('帳號：名稱檢查、註冊、登入、改密碼讓舊憑證失效', async () => {
    const repo = new DemoRepo(emptyDb())
    expect(await repo.nameAvailable('小明')).toBe(true)
    const s = await repo.registerAccount(' 小明 ', '123456')
    expect(s.name).toBe('小明')
    expect(await repo.nameAvailable(' 小明')).toBe(false)
    await expect(repo.registerAccount('小明', '654321')).rejects.toBeInstanceOf(NameTakenError)
    expect(await repo.loginAccount('小明', '000000')).toEqual({ ok: false, remaining: 4 })
    const login = await repo.loginAccount('小明', '123456')
    expect(login.ok && login.session.key).toBe(s.key)
    await expect(repo.listAccounts()).rejects.toBeInstanceOf(AccountSessionError)
    repo.setSession(s)
    expect((await repo.listAccounts()).map((a) => a.name)).toEqual(['小明'])
    const changed = await repo.changeAccountPin('123456', '7654321')
    expect(changed.ok).toBe(true)
    await expect(repo.whoami()).rejects.toBeInstanceOf(AccountSessionError)
    if (changed.ok) repo.setSession(changed.session)
    expect((await repo.whoami()).name).toBe('小明')
  })

  it('刪除整趟旅程後誰都看不到', async () => {
    const { repo, b } = await setup()
    await repo.deleteTrip()
    expect(await repo.listTrips()).toEqual([])
    repo.setSession(b)
    expect(await repo.listTrips()).toEqual([])
  })

  it('示範旅程：登入的人是成員，帳加總為 0', async () => {
    const repo = new DemoRepo(emptyDb())
    const me = await repo.registerAccount('小華', '123456')
    repo.setSession(me)
    repo.setTrip(repo.createDemoTrip())
    const data = await repo.loadTrip()
    expect(data.participants.map((p) => p.name)).toEqual(['小華', '阿傑', '小美', '小明'])
    expect(data.participants[0].account_id).toBe(me.id)
    const bal = netBalances(data)
    expect([...bal.values()].reduce((s, v) => s + v, 0)).toBe(0)
  })
})
