import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AccountSession, AccountTrip, Id, PinResult } from '@/types'
import { repo } from '@/data'
import { AccountSessionError, InvalidTokenError } from '@/data/repository'
import { toast } from '@/composables/useToast'
import { useSavedTrips } from './saved'

const KEY = 'trip-account'

function read(): AccountSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AccountSession | null
    return v && typeof v.id === 'string' && typeof v.key === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * 選用的帳號：登入後「我的旅程」會存進帳號，換裝置登入就找得回來
 * 旅程權限仍然只看旅程 token，帳號只是幫忙保管 token
 */
export const useAccountStore = defineStore('account', () => {
  const session = ref<AccountSession | null>(read())
  /** 帳號裡連結已被重新產生的旅程，這台裝置也沒有新連結 */
  const staleTrips = ref<AccountTrip[]>([])
  const syncing = ref(false)

  watch(session, (v) => {
    try {
      if (v) localStorage.setItem(KEY, JSON.stringify(v))
      else localStorage.removeItem(KEY)
    } catch {
      // 無痕模式寫不進去時只在這個分頁有效
    }
  })

  function expired() {
    session.value = null
    staleTrips.value = []
    toast.error('登入已失效（密碼可能在別的裝置改過），請重新登入')
  }

  /** 本機有、帳號沒有（或 token 不同）的先存進帳號，再把帳號裡的旅程補進本機 */
  async function sync() {
    const s = session.value
    if (!s || syncing.value) return
    syncing.value = true
    const saved = useSavedTrips()
    try {
      let remote = await repo.listAccountTrips(s)
      const remoteToken = new Map(remote.map((r) => [r.trip_id, r.token]))
      const toPush = saved.list.filter((t) => remoteToken.get(t.id) !== t.token)
      if (toPush.length) {
        // 本機的 token 也可能已失效，存不進去就算了，這台裝置打開時會顯示連結失效
        await Promise.all(toPush.map((t) => repo.saveAccountTrip(s, t.token).catch((e: unknown) => {
          if (!(e instanceof InvalidTokenError)) throw e
        })))
        remote = await repo.listAccountTrips(s)
      }
      for (const r of remote) if (r.token) saved.addFromAccount(r.token, { id: r.trip_id, name: r.name, start_date: r.start_date, end_date: r.end_date })
      staleTrips.value = remote.filter((r) => !r.token && !saved.find(r.trip_id))
    } catch (e) {
      if (e instanceof AccountSessionError) expired()
      // 其他錯誤多半是暫時離線，下次開啟再同步
    } finally {
      syncing.value = false
    }
  }

  async function register(name: string, pin: string) {
    session.value = await repo.registerAccount(name, pin)
    await sync()
  }

  async function login(name: string, pin: string): Promise<PinResult> {
    const res = await repo.loginAccount(name, pin)
    if (res.ok) {
      session.value = res.session
      await sync()
    }
    return res
  }

  /** 只是這台裝置登出，「我的旅程」清單留在這台裝置 */
  function logout() {
    session.value = null
    staleTrips.value = []
  }

  async function changePin(oldPin: string, newPin: string): Promise<PinResult> {
    if (!session.value) return { ok: false }
    try {
      const res = await repo.changeAccountPin(session.value, oldPin, newPin)
      if (res.ok) session.value = res.session
      return res
    } catch (e) {
      if (e instanceof AccountSessionError) expired()
      throw e
    }
  }

  /** 這台裝置加入或換了旅程 token 時順便存進帳號；失敗不影響使用，下次同步會再補 */
  function pushTrip(token: string) {
    const s = session.value
    if (!s) return
    repo.saveAccountTrip(s, token).catch((e: unknown) => {
      if (e instanceof AccountSessionError) expired()
    })
  }

  function removeTrip(tripId: Id) {
    const s = session.value
    staleTrips.value = staleTrips.value.filter((t) => t.trip_id !== tripId)
    if (!s) return
    repo.removeAccountTrip(s, tripId).catch((e: unknown) => {
      if (e instanceof AccountSessionError) expired()
    })
  }

  return { session, staleTrips, syncing, sync, register, login, logout, changePin, pushTrip, removeTrip }
})
