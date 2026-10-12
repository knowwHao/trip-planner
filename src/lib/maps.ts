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

/** 有填連結就用連結，否則用地址或名稱組 Google 地圖搜尋網址（官方 Maps URLs 格式，不需要 API key） */
export function googleMapsUrl(spot: { map_url: string; address: string; title: string }): string | null {
  const direct = safeUrl(spot.map_url)
  if (direct) return direct
  const query = spot.address.trim() || spot.title.trim()
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
