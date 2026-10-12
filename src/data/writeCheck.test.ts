import { describe, expect, it, vi } from 'vitest'
import { ConflictError, NoAccessError } from './repository'
import { RowMissingError, verifyAffected } from './writeCheck'

describe('verifyAffected', () => {
  it('有影響到列就不再查權限', async () => {
    const accessOk = vi.fn(async () => true)
    await verifyAffected(1, 'fail', accessOk)
    expect(accessOk).not.toHaveBeenCalled()
  })

  it('0 列且看不到旅程時丟 NoAccessError', async () => {
    await expect(verifyAffected(0, 'ignore', async () => false)).rejects.toBeInstanceOf(NoAccessError)
  })

  it('0 列但這筆還在，代表版本對不上', async () => {
    await expect(verifyAffected(0, 'fail', async () => true, async () => true)).rejects.toBeInstanceOf(ConflictError)
  })

  it('0 列且這筆已不在：update 失敗、delete 視為已達成', async () => {
    await expect(verifyAffected(0, 'fail', async () => true, async () => false)).rejects.toBeInstanceOf(RowMissingError)
    await expect(verifyAffected(0, 'ignore', async () => true)).resolves.toBeUndefined()
  })
})
