import { reactive } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const toasts = reactive<Toast[]>([])
let seq = 0

function push(kind: ToastKind, message: string, ms = kind === 'error' ? 5000 : 2800) {
  const id = ++seq
  toasts.push({ id, kind, message })
  setTimeout(() => dismiss(id), ms)
}

function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string, ms?: number) => push('info', m, ms),
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function useToasts() {
  return { toasts, dismiss }
}
