const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 以本地時區解析 YYYY-MM-DD，避免 new Date('2026-10-01') 被當成 UTC 而跨日 */
export function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toYmd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function todayYmd(): string {
  return toYmd(new Date())
}

export function addDays(ymd: string, n: number): string {
  const d = parseDate(ymd)
  d.setDate(d.getDate() + n)
  return toYmd(d)
}

/** 兩個日期相差幾天（b − a） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

export function formatDate(ymd: string, withYear = false): string {
  const d = parseDate(ymd)
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  return `${withYear ? `${d.getFullYear()}/` : ''}${md}（${WEEKDAYS[d.getDay()]}）`
}

export function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start, true)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDate(start, true)} – ${formatDate(end, !sameYear)}`
}

/** 旅程天數，最多 60 天（與 schema.sql 一致） */
export const MAX_TRIP_DAYS = 60

export function tripDayCount(trip: { start_date: string; end_date: string }): number {
  return diffDays(trip.start_date, trip.end_date) + 1
}

/** 第 day 天的日期 */
export function dayDate(trip: { start_date: string }, day: number): string {
  return addDays(trip.start_date, day - 1)
}

/** 資料庫的 time 會帶秒數，畫面只顯示到分 */
export function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}
