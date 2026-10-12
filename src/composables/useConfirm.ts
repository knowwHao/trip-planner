import { shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  /** 額外條列說明，例如會受影響的付款紀錄 */
  details?: string[]
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

const pending = shallowRef<PendingConfirm | null>(null)

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending.value?.resolve(false)
  return new Promise((resolve) => {
    pending.value = { ...options, resolve }
  })
}

export function useConfirmState() {
  const settle = (ok: boolean) => {
    pending.value?.resolve(ok)
    pending.value = null
  }
  return { pending, settle }
}
