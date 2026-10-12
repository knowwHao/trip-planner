import type { Spot } from '@/types'
import { formatTime } from './format'

type FlightFields = Pick<Spot, 'category' | 'airline' | 'flight_no' | 'dep_airport' | 'arr_airport' | 'start_time' | 'arr_time' | 'arr_day_offset'>

/** 航班號碼存成大寫英數（JL802），要與 schema.sql 的 spots.flight_no check 一致 */
export const FLIGHT_NO_RE = /^[A-Z0-9]{0,8}$/

/** 「jl 802」「JL-802」都整理成 JL802 */
export function normalizeFlightNo(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '')
}

/** 只有交通類型、而且至少填了航班號碼或機場才算航班 */
export function hasFlight(s: FlightFields): boolean {
  return s.category === 'transport' && !!(s.flight_no || s.dep_airport || s.arr_airport)
}

/** 卡片上的一行：JL802 TPE 08:30 → NRT 12:45 (+1) */
export function flightSummary(s: FlightFields): string {
  const dep = [s.dep_airport, formatTime(s.start_time)].filter(Boolean).join(' ')
  const arr = [s.arr_airport, formatTime(s.arr_time), s.arr_time && s.arr_day_offset ? `+${s.arr_day_offset}` : ''].filter(Boolean).join(' ')
  const route = dep || arr ? `${dep || '?'} → ${arr || '?'}` : ''
  return [s.flight_no || s.airline, route].filter(Boolean).join(' ')
}

/** FlightAware 的航班頁，IATA 航班號碼（JL802）會自動轉到對應的航班；不需要 API key */
export function flightStatusUrl(flightNo: string): string | null {
  const no = normalizeFlightNo(flightNo)
  return /^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(no) ? `https://www.flightaware.com/live/flight/${no}` : null
}
