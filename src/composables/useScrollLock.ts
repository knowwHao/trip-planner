import { onBeforeUnmount, watch, type Ref } from 'vue'

let locks = 0
let savedY = 0

// iOS Safari 鍵盤彈出時照樣捲動底下的頁面（html 的 overflow: hidden 擋不住），fixed 對話框裡的游標就會畫到別的欄位上，只有把 body 釘住才擋得住
function lock() {
  if (locks++) return
  savedY = window.scrollY
  Object.assign(document.body.style, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0' })
  document.documentElement.style.overflow = 'hidden'
}

function unlock() {
  if (!locks || --locks) return
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '' })
  document.documentElement.style.overflow = ''
  window.scrollTo(0, savedY)
}

/** active 為 true 時鎖住頁面捲動；同時開好幾個對話框時等最後一個關掉才解開 */
export function useScrollLock(active: Ref<boolean>) {
  let held = false
  const sync = (on: boolean) => {
    if (on === held) return
    held = on
    if (on) lock()
    else unlock()
  }
  watch(active, sync, { immediate: true })
  onBeforeUnmount(() => sync(false))
}
