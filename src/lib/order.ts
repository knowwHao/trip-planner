/** 排序值間距；新景點接在最後面時加這麼多 */
export const SORT_STEP = 1024

/** 兩個排序值的間距小到這樣就要整批重新編號，避免浮點數精度用完 */
const MIN_GAP = 1e-6

export function keyAfter(last: number | undefined): number {
  return last === undefined ? SORT_STEP : last + SORT_STEP
}

/**
 * 把一筆搬到 before 與 after 之間時的新排序值；兩邊都沒有時用 SORT_STEP
 * 回傳 null 表示間距已經太小，要先整批重新編號
 */
export function keyBetween(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return SORT_STEP
  if (before === undefined) return after! - SORT_STEP
  if (after === undefined) return before + SORT_STEP
  if (after - before < MIN_GAP) return null
  return (before + after) / 2
}

/** 整批重新編號用的排序值 */
export function evenKeys(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i + 1) * SORT_STEP)
}
