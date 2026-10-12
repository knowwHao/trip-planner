import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AccountInfo, AccountSession, PinResult } from '@/types'
import { repo } from '@/data'
import { AccountSessionError } from '@/data/repository'
import { toast } from '@/composables/useToast'

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
 * 登入狀態：要登入才能使用，旅程權限看帳號是不是成員
 * 憑證存在這台裝置，登出或改密碼（其他裝置的憑證會失效）之前一直有效
 */
export const useAccountStore = defineStore('account', () => {
  const session = ref<AccountSession | null>(null)
  /** 所有註冊使用者，加成員時用 */
  const accounts = ref<AccountInfo[]>([])

  // repo 要同步換身分，之後馬上發出的請求才會帶到新的憑證
  function setSession(v: AccountSession | null, persist = true) {
    session.value = v
    repo.setSession(v)
    if (!v) accounts.value = []
    if (!persist) return
    try {
      if (v) localStorage.setItem(KEY, JSON.stringify(v))
      else localStorage.removeItem(KEY)
    } catch {
      // 無痕模式寫不進去時只在這個分頁有效
    }
  }
  setSession(read(), false)

  // 其他分頁登入、登出或改密碼時跟著換
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) setSession(read(), false)
  })

  function expired() {
    if (!session.value) return
    setSession(null)
    toast.error('登入已失效（密碼可能在別的裝置改過），請重新登入')
  }

  /** 開網站時確認這台裝置的憑證還有效；連不上時先照常使用，等之後的請求再判斷 */
  async function verify() {
    const s = session.value
    if (!s) return
    try {
      const me = await repo.whoami()
      if (session.value === s && me.name !== s.name) setSession({ ...s, name: me.name })
    } catch (e) {
      if (e instanceof AccountSessionError && session.value === s) expired()
    }
  }

  async function register(name: string, pin: string) {
    setSession(await repo.registerAccount(name, pin))
  }

  async function login(name: string, pin: string): Promise<PinResult> {
    const res = await repo.loginAccount(name, pin)
    if (res.ok) setSession(res.session)
    return res
  }

  function logout() {
    setSession(null)
  }

  async function changePin(oldPin: string, newPin: string): Promise<PinResult> {
    try {
      const res = await repo.changeAccountPin(oldPin, newPin)
      if (res.ok) setSession(res.session)
      return res
    } catch (e) {
      if (e instanceof AccountSessionError) expired()
      throw e
    }
  }

  async function loadAccounts() {
    try {
      accounts.value = await repo.listAccounts()
    } catch (e) {
      if (e instanceof AccountSessionError) expired()
      throw e
    }
  }

  return { session, accounts, expired, verify, register, login, logout, changePin, loadAccounts }
})
