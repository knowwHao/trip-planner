import type { BookingStatus, SpotCategory } from '@/types'

export interface CategoryInfo {
  value: SpotCategory
  label: string
  emoji: string
  /** 預約狀態三種值的顯示文字；沒有預約狀態的類型為 null，住宿沒有「不需要」 */
  booking: Partial<Record<BookingStatus, string>> | null
}

/** 要與 schema.sql 的 spots.category check 與 spots_booking_fits_category 一致 */
export const CATEGORIES: CategoryInfo[] = [
  { value: 'sight', label: '景點', emoji: '🏯', booking: { done: '已買票', todo: '未買票', none: '無需買票' } },
  { value: 'food', label: '餐廳', emoji: '🍜', booking: { done: '已訂位', todo: '未訂位', none: '無需訂位' } },
  { value: 'shop', label: '購物', emoji: '🛍️', booking: null },
  { value: 'activity', label: '活動體驗', emoji: '🎟️', booking: { done: '已預約', todo: '未預約', none: '無需預約' } },
  { value: 'transport', label: '交通', emoji: '🚆', booking: { done: '已訂票', todo: '未訂票', none: '無需訂票' } },
  { value: 'stay', label: '住宿', emoji: '🏨', booking: { done: '已訂房', todo: '未訂房' } },
  { value: 'other', label: '其他', emoji: '📍', booking: null },
]

export function categoryInfo(c: SpotCategory): CategoryInfo {
  return CATEGORIES.find((x) => x.value === c) ?? CATEGORIES.at(-1)!
}

/** 這個類型可選的預約狀態，依「已完成、還沒、不需要」排 */
export function bookingOptions(c: SpotCategory): { value: BookingStatus; label: string }[] {
  const labels = categoryInfo(c).booking
  if (!labels) return []
  return (['done', 'todo', 'none'] as const).filter((v) => labels[v]).map((v) => ({ value: v, label: labels[v]! }))
}

export function bookingLabel(c: SpotCategory, b: BookingStatus | null): string | null {
  return b ? (categoryInfo(c).booking?.[b] ?? null) : null
}

/** 新增或換類型時的預設狀態：有預約狀態的類型一律先當作「還沒」，比較不會漏訂 */
export function defaultBooking(c: SpotCategory): BookingStatus | null {
  return categoryInfo(c).booking ? 'todo' : null
}

/** 換類型時沿用原本的狀態，新類型不支援時改成預設值 */
export function bookingForCategory(c: SpotCategory, current: BookingStatus | null): BookingStatus | null {
  const opts = bookingOptions(c)
  if (!opts.length) return null
  return current && opts.some((o) => o.value === current) ? current : defaultBooking(c)
}

/**
 * 點卡片上的狀態標籤時的下一個狀態：只在「還沒」與「已完成」之間切換，沒設定的先變成「還沒」
 * 「不需要」的標籤不顯示，所以只能在編輯框設定，否則點一下標籤就消失了
 */
export function nextBooking(c: SpotCategory, b: BookingStatus | null): BookingStatus | null {
  if (!categoryInfo(c).booking) return null
  return b === 'todo' ? 'done' : 'todo'
}

/** 子項目在各類型的叫法與打勾的意思，例如購物是「店家」「已逛」 */
export function itemWords(c: SpotCategory): { noun: string; done: string } {
  if (c === 'shop') return { noun: '店家', done: '已逛' }
  if (c === 'food') return { noun: '餐廳', done: '已吃' }
  return { noun: '地點', done: '已去' }
}
