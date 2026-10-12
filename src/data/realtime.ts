/**
 * 即時同步的頻道名稱：token 的 SHA-256 前 32 碼
 * 頻道是公開廣播、只傳「有東西改了」不帶資料，收到後再帶 token 經 RLS 重新讀取；
 * 用雜湊當名稱，旁人從頻道名稱反推不出 token
 */
export async function channelName(token: string | null): Promise<string | null> {
  // crypto.subtle 只在 https 或 localhost 可用，其他情況就不做即時同步，靠切回頁面時重新讀取
  if (!token || !globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `trip-${hex.slice(0, 32)}`
}
