import { ref, watchEffect, type Ref } from 'vue'
import type { Id } from '@/types'
import { repo } from '@/data'

// 照片新增後就不會改，讀過的一直留著，切頁面或重新讀取旅程時不用再下載
const cache = new Map<string, Promise<string>>()

export function fetchPhoto(id: Id, size: 'thumb' | 'full'): Promise<string> {
  const key = `${size}:${id}`
  let p = cache.get(key)
  if (!p) {
    p = repo.getWishPhoto(id, size)
    // 失敗的不留，下次再試
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** 剛上傳的照片手上已經有資料，直接放進快取 */
export function primePhoto(id: Id, thumb: string, full: string) {
  cache.set(`thumb:${id}`, Promise.resolve(thumb))
  cache.set(`full:${id}`, Promise.resolve(full))
}

/** 依 id 讀照片的 data URL，讀取中或失敗時是空字串 */
export function usePhoto(id: Ref<Id | null | undefined>, size: 'thumb' | 'full') {
  const src = ref('')
  watchEffect((onCleanup) => {
    src.value = ''
    const current = id.value
    if (!current) return
    let alive = true
    onCleanup(() => (alive = false))
    fetchPhoto(current, size).then(
      (url) => alive && (src.value = url),
      () => {},
    )
  })
  return src
}
