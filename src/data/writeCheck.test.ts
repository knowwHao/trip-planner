import { describe, expect, it, vi } from 'vitest'
import { ConflictError, InvalidTokenError } from './repository'
import { RowMissingError, verifyAffected } from './writeCheck'

describe('verifyAffected', () => {
  it('有影響到列就不再查 token', async () => {
    const tokenOk = vi.fn(async () => true)
    await verifyAffected(1, 'fail', tokenOk)
    expect(tokenOk).not.toHaveBeenCalled()
  })

  it('0 列且 token 失效時丟 InvalidTokenError', async () => {
    await expect(verifyAffected(0, 'ignore', async () => false)).rejects.toBeInstanceOf(InvalidTokenError)
  })

  it('0 列但這筆還在，代表版本對不上', async () => {
    await expect(verifyAffected(0, 'fail', async () => true, async () => true)).rejects.toBeInstanceOf(ConflictError)
  })

  it('0 列且這筆已不在：update 失敗、delete 視為已達成', async () => {
    await expect(verifyAffected(0, 'fail', async () => true, async () => false)).rejects.toBeInstanceOf(RowMissingError)
    await expect(verifyAffected(0, 'ignore', async () => true)).resolves.toBeUndefined()
  })
})
