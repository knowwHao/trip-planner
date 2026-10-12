import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoRepo, emptyDb } from './demoRepo'
import { ConflictError, InUseError, InvalidTokenError } from './repository'
import { netBalances } from '@/lib/split'

// DemoRepo 每次操作都會從 localStorage 重讀，測試要有真的 storage 才測得到這個行為
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
})
beforeEach(() => storage.clear())

async function setup() {
  const repo = new DemoRepo(emptyDb())
  const { token } = await repo.createTrip(
    { name: '大阪', start_date: '2026-11-01', end_date: '2026-11-03', currency: 'JPY', fx_rate: 0.2 },
    ['甲', '乙', ' 甲 ', ''],
  )
  repo.setToken(token)
  return { repo, token }
}

describe('DemoRepo', () => {
  it('沒帶或帶錯 token 讀不到也寫不進', async () => {
    const { repo } = await setup()
    repo.setToken(null)
    await expect(repo.loadTrip()).rejects.toBeInstanceOf(InvalidTokenError)
    repo.setToken('x'.repeat(64))
    await expect(repo.createSpot({ day: 1, start_time: null, title: 'x', address: '', map_url: '', note: '', est_cost: null, sort_key: 1 })).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('旅伴去重、略過空白', async () => {
    const { repo } = await setup()
    expect((await repo.loadTrip()).participants.map((p) => p.name)).toEqual(['甲', '乙'])
  })

  it('景點改內容加版本、搬動不加，舊版本更新是衝突', async () => {
    const { repo } = await setup()
    const s = await repo.createSpot({ day: 1, start_time: null, title: '大阪城', address: '', map_url: '', note: '', est_cost: null, sort_key: 1 })
    await repo.moveSpots([{ id: s.id, day: 2, sort_key: 5 }])
    expect((await repo.loadTrip()).spots[0]).toMatchObject({ day: 2, version: 1 })
    await repo.updateSpot(s.id, 1, { title: '通天閣' })
    await expect(repo.updateSpot(s.id, 1, { title: '舊的' })).rejects.toBeInstanceOf(ConflictError)
    expect((await repo.loadTrip()).spots[0]).toMatchObject({ title: '通天閣', version: 2 })
  })

  it('一次搬動多個景點全部生效', async () => {
    const { repo } = await setup()
    const base = { day: 1, start_time: null, address: '', map_url: '', note: '', est_cost: null }
    const a = await repo.createSpot({ ...base, title: 'A', sort_key: 1 })
    const b = await repo.createSpot({ ...base, title: 'B', sort_key: 2 })
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
    const [a, b] = (await repo.loadTrip()).participants.map((p) => p.id)
    const base = { title: '晚餐', amount: 3000, currency: 'JPY', payer_id: a, spent_on: null, spot_id: null, note: '' }
    await expect(
      repo.saveExpense({ ...base, split_mode: 'custom' }, [{ participant_id: a, amount: 1000 }]),
    ).rejects.toThrow()
    const id = await repo.saveExpense({ ...base, split_mode: 'custom' }, [
      { participant_id: a, amount: 1000 },
      { participant_id: b, amount: 2000 },
    ])
    await expect(repo.saveExpense({ ...base, id, version: 2, split_mode: 'even' }, [{ participant_id: a, amount: null }])).rejects.toBeInstanceOf(ConflictError)
    await expect(repo.deleteParticipant(b)).rejects.toBeInstanceOf(InUseError)
    const data = await repo.loadTrip()
    await expect(repo.updateTrip(data.trip.version, { currency: 'KRW', fx_rate: 0.02 })).rejects.toThrow('換幣別')
    // 3000 日圓 × 0.2：甲付 600，自己 200、乙 400
    expect(Object.fromEntries(netBalances(data))).toEqual({ [a]: 400, [b]: -400 })
  })

  it('重新產生 token 後舊 token 失效', async () => {
    const { repo } = await setup()
    const next = await repo.regenerateToken()
    await expect(repo.loadTrip()).rejects.toBeInstanceOf(InvalidTokenError)
    repo.setToken(next)
    await expect(repo.loadTrip()).resolves.toBeTruthy()
  })

  it('示範旅程的帳加總為 0', async () => {
    const repo = new DemoRepo(emptyDb())
    repo.setToken(repo.createDemoTrip().token)
    const bal = netBalances(await repo.loadTrip())
    expect([...bal.values()].reduce((s, v) => s + v, 0)).toBe(0)
  })
})
