import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { Expense, Id, Participant, Spot, SpotItem, TripData } from '@/types'
import { repo } from '@/data'
import { ConflictError, InvalidTokenError, type ItemMove, type SpotMove } from '@/data/repository'
import { RowMissingError } from '@/data/writeCheck'
import { errorMessage } from '@/composables/useToast'
import { tripDayCount } from '@/lib/format'
import { netBalances, simplifyDebts, summaries } from '@/lib/split'
import { useSavedTrips } from './saved'

/** unknown：這台裝置沒有這趟的連結；checking：讀取中；invalid：連結失效；error：連線失敗 */
export type TripStatus = 'idle' | 'unknown' | 'checking' | 'ok' | 'invalid' | 'error'

/** 背景重新讀取的間隔，即時通知漏掉時的保險 */
const POLL_MS = 120_000
/** 短時間內連續收到多個通知時只讀一次 */
const DEBOUNCE_MS = 300

export const useTripStore = defineStore('trip', () => {
  const saved = useSavedTrips()
  const tripId = ref<Id | null>(null)
  const status = ref<TripStatus>('idle')
  const errorText = ref('')
  const data = shallowRef<TripData | null>(null)
  /** 即時同步是否連線中 */
  const live = ref(false)
  let unsubscribe: (() => void) | null = null
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function stopSync() {
    unsubscribe?.()
    unsubscribe = null
    clearTimeout(timer)
  }

  function close() {
    stopSync()
    seq++
    tripId.value = null
    data.value = null
    status.value = 'idle'
    repo.setToken(null)
  }

  async function load(initial = false) {
    const my = ++seq
    try {
      const d = await repo.loadTrip()
      if (my !== seq) return
      data.value = d
      status.value = 'ok'
      saved.touch(d.trip)
      unsubscribe ??= repo.subscribe(scheduleRefresh, (v) => (live.value = v))
    } catch (e) {
      if (my !== seq) return
      if (e instanceof InvalidTokenError) {
        stopSync()
        status.value = 'invalid'
      } else if (initial || status.value !== 'ok') {
        errorText.value = errorMessage(e)
        status.value = 'error'
      }
      // 已在畫面上時的背景讀取失敗（多半是暫時離線）不打斷使用，下次再讀
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (status.value === 'ok') void load()
    }, DEBOUNCE_MS)
  }

  /** 以這台裝置存的 token 開啟旅程 */
  async function open(id: Id) {
    if (tripId.value === id && status.value !== 'idle' && status.value !== 'error') return
    close()
    tripId.value = id
    const entry = saved.find(id)
    if (!entry) {
      status.value = 'unknown'
      return
    }
    repo.setToken(entry.token)
    status.value = 'checking'
    await load(true)
  }

  /** 用旅程連結的 token 加入；成功回傳旅程 id，連結無效回 null */
  async function join(token: string): Promise<Id | null> {
    close()
    repo.setToken(token)
    status.value = 'checking'
    const d = await repo.loadTrip().catch((e: unknown) => {
      if (e instanceof InvalidTokenError) return null
      throw e
    })
    if (!d) {
      status.value = 'idle'
      repo.setToken(null)
      return null
    }
    saved.upsert(token, d.trip)
    tripId.value = d.trip.id
    data.value = d
    status.value = 'ok'
    unsubscribe = repo.subscribe(scheduleRefresh, (v) => (live.value = v))
    return d.trip.id
  }

  /** 寫入成功後通知其他人並重新讀取；別人改過或已刪除時先讀最新資料再把錯誤丟回給畫面 */
  async function mutate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn()
      repo.notify()
      await load()
      return result
    } catch (e) {
      if (e instanceof InvalidTokenError) {
        stopSync()
        status.value = 'invalid'
      } else if (e instanceof ConflictError || e instanceof RowMissingError) {
        await load()
      }
      throw e
    }
  }

  /** 拖曳排序：先改畫面再寫入，失敗時以伺服器資料為準 */
  async function moveSpots(moves: SpotMove[]) {
    const d = data.value
    if (!d || !moves.length) return
    const byId = new Map(moves.map((m) => [m.id, m]))
    data.value = {
      ...d,
      spots: d.spots
        .map((s) => {
          const m = byId.get(s.id)
          return m ? { ...s, day: m.day, sort_key: m.sort_key } : s
        })
        .sort((a, b) => a.sort_key - b.sort_key),
    }
    try {
      await mutate(() => repo.moveSpots(moves))
    } catch (e) {
      await load()
      throw e
    }
  }

  /** 子項目打勾：先改畫面再寫入，失敗時以伺服器資料為準 */
  async function setItemDone(id: Id, done: boolean) {
    const d = data.value
    if (!d) return
    data.value = { ...d, items: d.items.map((i) => (i.id === id ? { ...i, done } : i)) }
    try {
      await mutate(() => repo.setItemDone(id, done))
    } catch (e) {
      await load()
      throw e
    }
  }

  async function moveItems(moves: ItemMove[]) {
    const d = data.value
    if (!d || !moves.length) return
    const byId = new Map(moves.map((m) => [m.id, m.sort_key]))
    data.value = {
      ...d,
      items: d.items.map((i) => (byId.has(i.id) ? { ...i, sort_key: byId.get(i.id)! } : i)).sort((a, b) => a.sort_key - b.sort_key),
    }
    try {
      await mutate(() => repo.moveItems(moves))
    } catch (e) {
      await load()
      throw e
    }
  }

  /** 自己重新產生 token 後改用新 token，不必重新驗證 */
  function replaceToken(token: string) {
    if (!tripId.value) return
    stopSync()
    saved.setToken(tripId.value, token)
    repo.setToken(token)
    void load()
  }

  // 從背景切回來、網路恢復時補抓；即時通知在手機休眠時會漏
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status.value === 'ok') void load()
  })
  window.addEventListener('online', () => {
    if (status.value === 'ok') void load()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible' && status.value === 'ok') void load()
  }, POLL_MS)

  const trip = computed(() => data.value?.trip ?? null)
  const participants = computed<Participant[]>(() => data.value?.participants ?? [])
  const participantMap = computed(() => new Map(participants.value.map((p) => [p.id, p])))
  const dayCount = computed(() => (trip.value ? tripDayCount(trip.value) : 0))

  /** 第 1～N 天的景點；天數超出旅程（旅程被改短）或 null 的都歸到口袋名單 */
  const spotsByDay = computed(() => {
    const days = new Map<number | null, Spot[]>([[null, []]])
    for (let d = 1; d <= dayCount.value; d++) days.set(d, [])
    for (const s of data.value?.spots ?? []) {
      const key = s.day !== null && s.day <= dayCount.value ? s.day : null
      days.get(key)!.push(s)
    }
    for (const list of days.values()) list.sort((a, b) => a.sort_key - b.sort_key)
    return days
  })

  const itemsBySpot = computed(() => {
    const map = new Map<Id, SpotItem[]>()
    for (const i of data.value?.items ?? []) {
      const list = map.get(i.spot_id)
      if (list) list.push(i)
      else map.set(i.spot_id, [i])
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_key - b.sort_key)
    return map
  })

  const expensesBySpot = computed(() => {
    const map = new Map<Id, Expense[]>()
    for (const e of data.value?.expenses ?? []) {
      if (!e.spot_id) continue
      const list = map.get(e.spot_id)
      if (list) list.push(e)
      else map.set(e.spot_id, [e])
    }
    return map
  })

  const splitData = computed(() =>
    data.value
      ? {
          trip: data.value.trip,
          participants: data.value.participants,
          expenses: data.value.expenses,
          shares: data.value.shares,
          transfers: data.value.transfers,
        }
      : null,
  )
  const balances = computed(() => (splitData.value ? netBalances(splitData.value) : new Map<Id, number>()))
  const settlements = computed(() => simplifyDebts(balances.value))
  const memberSummaries = computed(() => (splitData.value ? summaries(splitData.value) : []))

  function participantName(id: Id) {
    return participantMap.value.get(id)?.name ?? '（已移除）'
  }

  return {
    tripId,
    status,
    errorText,
    data,
    live,
    trip,
    participants,
    participantMap,
    dayCount,
    spotsByDay,
    itemsBySpot,
    expensesBySpot,
    balances,
    settlements,
    memberSummaries,
    open,
    join,
    close,
    load,
    mutate,
    moveSpots,
    setItemDone,
    moveItems,
    replaceToken,
    participantName,
  }
})
