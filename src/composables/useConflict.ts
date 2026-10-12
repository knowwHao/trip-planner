import { ConflictError } from '@/data/repository'
import { RowMissingError } from '@/data/writeCheck'
import { confirmDialog } from './useConfirm'
import { errorMessage, toast } from './useToast'

export type SaveOutcome = 'saved' | 'reload' | 'gone' | 'failed'

/**
 * 存檔時處理同時編輯：別人剛改過時讓使用者選「用我的覆蓋」（以最新版本號重送）或「看最新版本」
 * save 收到的 useLatest 為 true 時，要改用 store 裡最新的版本號
 */
export async function saveWithConflict(what: string, save: (useLatest: boolean) => Promise<void>): Promise<SaveOutcome> {
  let useLatest = false
  for (;;) {
    try {
      await save(useLatest)
      return 'saved'
    } catch (e) {
      if (e instanceof RowMissingError) {
        toast.error(`這${what}已經被別人刪除了`)
        return 'gone'
      }
      if (!(e instanceof ConflictError) || useLatest) {
        toast.error(errorMessage(e))
        return 'failed'
      }
      const overwrite = await confirmDialog({
        title: `別人剛改過這${what}`,
        message: '你和別人同時在改。要用你現在填的內容覆蓋，還是放棄你的修改、看別人改好的版本？',
        confirmText: '用我的覆蓋',
        cancelText: '看最新版本',
      })
      if (!overwrite) return 'reload'
      useLatest = true
    }
  }
}
