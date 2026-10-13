import type { BookingStatus, SpotCategory } from '@/types'

export interface CategoryInfo {
  value: SpotCategory
  label: string
  emoji: string
  /** 有預約提醒的類型：開關的文字與「還沒」「已完成」的文字；沒有的是 null */
  booking: { remind: string; todo: string; done: string } | null
  /** 不用預約、但值得註記的狀態，存成 none；只有餐廳的「現場排隊」 */
  walkIn?: string
}

/** 要與 schema.sql 的 spots.category check 與 spots_booking_fits_category 一致 */
export const CATEGORIES: CategoryInfo[] = [
  { value: 'sight', label: '景點', emoji: '🏯', booking: { remind: '提醒買票', todo: '未買票', done: '已買票' } },
  { value: 'food', label: '餐廳', emoji: '🍜', booking: { remind: '提醒訂位', todo: '未訂位', done: '已訂位' }, walkIn: '現場排隊' },
  { value: 'shop', label: '購物', emoji: '🛍️', booking: null },
  { value: 'activity', label: '活動體驗', emoji: '🎟️', booking: { remind: '提醒預約', todo: '未預約', done: '已預約' } },
  { value: 'transport', label: '交通', emoji: '🚆', booking: { remind: '提醒訂票', todo: '未訂票', done: '已訂票' } },
  { value: 'stay', label: '住宿', emoji: '🏨', booking: { remind: '提醒訂房', todo: '未訂房', done: '已訂房' } },
  { value: 'other', label: '其他', emoji: '📍', booking: null },
]

export function categoryInfo(c: SpotCategory): CategoryInfo {
  return CATEGORIES.find((x) => x.value === c) ?? CATEGORIES.at(-1)!
}

/** 編輯框裡預約提醒開關的文字，例如「提醒訂票」；沒有預約提醒的類型回 null */
export function remindLabel(c: SpotCategory): string | null {
  return categoryInfo(c).booking?.remind ?? null
}

/**
 * 卡片上的標籤文字：todo／done 是打開提醒後的「還沒」「已完成」；
 * none 只有餐廳顯示成「現場排隊」，其他類型是舊版的「不需要」，與 null 一樣當作沒提醒
 */
export function bookingLabel(c: SpotCategory, b: BookingStatus | null): string | null {
  const info = categoryInfo(c)
  if (b === 'none') return info.walkIn ?? null
  return b && info.booking ? info.booking[b] : null
}

/** 新增時的預設：預設不提醒，標籤只出現在真的要訂的行程；住宿幾乎都要訂，預設提醒 */
export function defaultBooking(c: SpotCategory): BookingStatus | null {
  return c === 'stay' ? 'todo' : null
}

/** 換類型時沿用原本的提醒，新類型不支援時改成預設值 */
export function bookingForCategory(c: SpotCategory, current: BookingStatus | null): BookingStatus | null {
  const info = categoryInfo(c)
  if (!info.booking) return null
  if (current === 'todo' || current === 'done') return current
  if (current === 'none' && info.walkIn) return 'none'
  return defaultBooking(c)
}

/** 點卡片上的標籤時的下一個狀態：只在「還沒」與「已完成」之間切換；沒提醒或現場排隊的標籤不能點 */
export function nextBooking(c: SpotCategory, b: BookingStatus | null): BookingStatus | null {
  if (!categoryInfo(c).booking) return null
  if (b === 'todo') return 'done'
  if (b === 'done') return 'todo'
  return null
}

/** 子項目在各類型的叫法與打勾的意思，例如購物是「店家」「已逛」 */
export function itemWords(c: SpotCategory): { noun: string; done: string } {
  if (c === 'shop') return { noun: '店家', done: '已逛' }
  if (c === 'food') return { noun: '餐廳', done: '已吃' }
  return { noun: '地點', done: '已去' }
}
