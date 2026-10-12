/**
 * 即時同步的頻道名稱：旅程 id 的 SHA-256 前 32 碼
 * 頻道是公開廣播、只傳「有東西改了」不帶資料，收到後再以登入身分經 RLS 重新讀取，
 * 所以知道頻道名稱也讀不到內容；用雜湊只是不讓頻道名稱直接露出旅程 id
 */
export async function channelName(tripId: string | null): Promise<string | null> {
  // crypto.subtle 只在 https 或 localhost 可用，其他情況就不做即時同步，靠切回頁面時重新讀取
  if (!tripId || !globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tripId))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `trip-${hex.slice(0, 32)}`
}
