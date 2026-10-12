export interface CurrencyInfo {
  code: string
  name: string
  flag: string
}

/** 選單列出的幣別；資料庫只要求三個大寫字母，這裡沒列到的也能顯示 */
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'TWD', name: '新台幣', flag: '🇹🇼' },
  { code: 'JPY', name: '日圓', flag: '🇯🇵' },
  { code: 'KRW', name: '韓元', flag: '🇰🇷' },
  { code: 'USD', name: '美元', flag: '🇺🇸' },
  { code: 'EUR', name: '歐元', flag: '🇪🇺' },
  { code: 'GBP', name: '英鎊', flag: '🇬🇧' },
  { code: 'HKD', name: '港幣', flag: '🇭🇰' },
  { code: 'MOP', name: '澳門幣', flag: '🇲🇴' },
  { code: 'CNY', name: '人民幣', flag: '🇨🇳' },
  { code: 'THB', name: '泰銖', flag: '🇹🇭' },
  { code: 'VND', name: '越南盾', flag: '🇻🇳' },
  { code: 'SGD', name: '新加坡幣', flag: '🇸🇬' },
  { code: 'MYR', name: '馬來西亞令吉', flag: '🇲🇾' },
  { code: 'PHP', name: '菲律賓披索', flag: '🇵🇭' },
  { code: 'IDR', name: '印尼盾', flag: '🇮🇩' },
  { code: 'AUD', name: '澳幣', flag: '🇦🇺' },
  { code: 'NZD', name: '紐西蘭幣', flag: '🇳🇿' },
  { code: 'CAD', name: '加幣', flag: '🇨🇦' },
  { code: 'CHF', name: '瑞士法郎', flag: '🇨🇭' },
]

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? { code, name: code, flag: '💱' }
}

/** 單筆金額上限，與 schema.sql 的 check 一致 */
export const MAX_AMOUNT = 99_999_999

/** 幣別的小數位數；新台幣在台灣慣例上不用小數，所以固定 0 */
export function currencyDigits(code: string): number {
  if (code === 'TWD') return 0
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** 換成該幣別最小單位的整數，避免 0.1 + 0.2 這類浮點誤差 */
export function toMinor(amount: number, code: string): number {
  return Math.round(amount * 10 ** currencyDigits(code))
}

export function fromMinor(minor: number, code: string): number {
  return minor / 10 ** currencyDigits(code)
}

/** 依幣別小數位數四捨五入 */
export function roundTo(amount: number, code: string): number {
  return fromMinor(toMinor(amount, code), code)
}

/** 換成新台幣整數；currency 是 TWD 時原值四捨五入 */
export function toTwd(amount: number, currency: string, fxRate: number): number {
  return Math.round(currency === 'TWD' ? amount : amount * fxRate)
}

/** 金額顯示：新台幣用 $，其他幣別前面加幣別代碼 */
export function formatMoney(amount: number, code = 'TWD'): string {
  const digits = currencyDigits(code)
  const text = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(amount)
  return code === 'TWD' ? `$${text}` : `${code} ${text}`
}

/** 解析使用者輸入的金額；空白回 null，格式不對或超過小數位數回 NaN */
export function parseAmount(raw: string | number | null | undefined, code: string): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/,/g, '').trim()
  if (!s) return null
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  const n = Number(s)
  const decimals = s.split('.')[1]?.length ?? 0
  return decimals > currencyDigits(code) ? NaN : n
}

/** 同 parseAmount，但可以輸入加法（1200+3400），方便把好幾個品項加起來 */
export function parseSum(raw: string | null | undefined, code: string): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const parts = s.split('+').map((p) => parseAmount(p, code))
  if (parts.some((p) => p === null || Number.isNaN(p))) return NaN
  return fromMinor(parts.reduce<number>((sum, p) => sum + toMinor(p!, code), 0), code)
}

/** 匯率顯示到最多 6 位小數，去掉尾巴的 0 */
export function formatRate(rate: number): string {
  return String(Number(rate.toFixed(6)))
}
