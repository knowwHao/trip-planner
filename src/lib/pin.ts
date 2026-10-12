/** 與 schema.sql 的 account_register／account_change_pin 一致：6～8 位數字 */
export const PIN_RE = /^[0-9]{6,8}$/

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin)
}

/** 連續輸錯的上限，超過就鎖定；與 schema.sql 的 attempt_account_pin 一致 */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15
