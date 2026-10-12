/** 只接受 http(s) 連結，與 schema.sql 的 check 一致；javascript: 之類的連結一律當作沒有 */
export function safeUrl(raw: string): string | null {
  const s = raw.trim()
  if (!/^https?:\/\//i.test(s)) return null
  try {
    return new URL(s).href
  } catch {
    return null
  }
}

/**
 * 有填連結就用連結，否則用地址組 Google 地圖搜尋網址（官方 Maps URLs 格式，不需要 API key）
 * 兩個都沒填就不給地圖：只用名稱搜尋常常搜到同名的別家店
 */
export function googleMapsUrl(spot: { map_url: string; address: string }): string | null {
  const direct = safeUrl(spot.map_url)
  if (direct) return direct
  const query = spot.address.trim()
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
