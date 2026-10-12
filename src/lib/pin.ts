/** 與 schema.sql 的 account_register／account_change_pin 一致：6～8 位數字 */
export const PIN_RE = /^[0-9]{6,8}$/

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin)
}

/** 連續輸錯的上限，超過就鎖定；與 schema.sql 的 attempt_account_pin 一致 */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15

/** 密碼驗證失敗的說明：鎖定到幾點、還能試幾次，或只說名稱或密碼錯誤（名稱不存在時不透露） */
export function pinFailText(res: { remaining?: number; lockedUntil?: string }): string {
  if (res.lockedUntil) {
    const t = new Date(res.lockedUntil).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `錯太多次，請在 ${t} 之後再試`
  }
  return res.remaining !== undefined ? `密碼錯誤，還可以再試 ${res.remaining} 次` : '名稱或密碼錯誤'
}
