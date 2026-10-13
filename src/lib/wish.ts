import type { WishItem, WishStatus } from '@/types'

export const WISH_STATUSES: { value: WishStatus; label: string }[] = [
  { value: 'todo', label: '待買' },
  { value: 'bought', label: '已買' },
  { value: 'unavailable', label: '買不到' },
]

export function wishStatusLabel(s: WishStatus): string {
  return WISH_STATUSES.find((x) => x.value === s)?.label ?? ''
}

/** 依「幫誰買」分組，名字前後空白不算；組內依清單順序 */
export function groupByRecipient(items: WishItem[]): { recipient: string; items: WishItem[] }[] {
  const map = new Map<string, WishItem[]>()
  for (const w of [...items].sort((a, b) => a.sort_key - b.sort_key)) {
    const key = w.recipient.trim()
    const list = map.get(key)
    if (list) list.push(w)
    else map.set(key, [w])
  }
  return [...map].map(([recipient, list]) => ({ recipient, items: list }))
}

/** 記成代購時的品項名稱：「面膜 ×2」 */
export function wishLabel(w: Pick<WishItem, 'title' | 'qty'>): string {
  return w.qty > 1 ? `${w.title} ×${w.qty}` : w.title
}
