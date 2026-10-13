import type { Id, PhotoData } from '@/types'

/** Demo 的照片放在 IndexedDB：localStorage 只有約 5MB，幾張大圖就滿了；沒有 IndexedDB 時（測試、無痕）只存在記憶體 */
const DB_NAME = 'trip-demo-photos'
const STORE = 'photos'
const memory = new Map<Id, PhotoData>()
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined)
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => resolve(undefined)
      }),
  )
}

export async function putPhoto(id: Id, data: PhotoData) {
  // 傳進來的可能是 Vue 的響應式物件，IndexedDB 複製不了，先換成普通物件
  const plain = { thumb: data.thumb, full: data.full }
  memory.set(id, plain)
  await run('readwrite', (s) => void s.put(plain, id))
}

export async function getPhoto(id: Id): Promise<PhotoData | undefined> {
  return memory.get(id) ?? ((await run<PhotoData>('readonly', (s) => s.get(id))) || undefined)
}

export async function deletePhotos(ids: Id[]) {
  for (const id of ids) memory.delete(id)
  if (ids.length) await run('readwrite', (s) => ids.forEach((id) => s.delete(id)))
}
