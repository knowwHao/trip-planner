import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Id, SavedTrip, Trip } from '@/types'

const KEY = 'trip-planner-saved'

function read(): SavedTrip[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedTrip[]
    return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string' && typeof t.token === 'string') : []
  } catch {
    return []
  }
}

/** 這台裝置開過的旅程；伺服器端刻意不提供旅程清單，否則等於公開所有連結 */
export const useSavedTrips = defineStore('saved', () => {
  const list = ref<SavedTrip[]>(read())

  watch(
    list,
    (v) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(v))
      } catch {
        // 無痕模式寫不進去時只在這個分頁有效
      }
    },
    { deep: true },
  )

  // 其他分頁加入或移除旅程時同步
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) list.value = read()
  })

  function find(id: Id) {
    return list.value.find((t) => t.id === id)
  }

  function upsert(token: string, trip: Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'>) {
    const entry: SavedTrip = {
      id: trip.id,
      token,
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
      opened_at: new Date().toISOString(),
    }
    list.value = [entry, ...list.value.filter((t) => t.id !== trip.id)]
  }

  /** 只更新快取的名稱與日期，不改順序 */
  function touch(trip: Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'>) {
    const t = find(trip.id)
    if (t && (t.name !== trip.name || t.start_date !== trip.start_date || t.end_date !== trip.end_date)) {
      Object.assign(t, { name: trip.name, start_date: trip.start_date, end_date: trip.end_date })
    }
  }

  function setToken(id: Id, token: string) {
    const t = find(id)
    if (t) t.token = token
  }

  function remove(id: Id) {
    list.value = list.value.filter((t) => t.id !== id)
  }

  return { list, find, upsert, touch, setToken, remove }
})
