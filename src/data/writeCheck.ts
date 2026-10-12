import { ConflictError, NoAccessError } from './repository'

/** 目標列不在時的處理：update 視為失敗；delete 視為已達成（可能已被別人刪掉） */
export type OnMissing = 'fail' | 'ignore'

export class RowMissingError extends Error {
  constructor() {
    super('這筆資料已不存在，可能已被其他人刪除')
    this.name = 'RowMissingError'
  }
}

/**
 * 檢查 update／delete 實際影響的列數
 * RLS 擋下或版本號對不上時 PostgREST 不報錯、只是影響 0 列，所以 0 列時要再問還看不看得到這趟旅程、
 * 這筆是否還在，才分得出是已經不是成員、別人改過還是資料已不在
 */
export async function verifyAffected(
  affected: number,
  onMissing: OnMissing,
  accessOk: () => Promise<boolean>,
  rowExists?: () => Promise<boolean>,
) {
  if (affected > 0) return
  if (!(await accessOk())) throw new NoAccessError()
  if (rowExists && (await rowExists())) throw new ConflictError()
  if (onMissing === 'fail') throw new RowMissingError()
}
