import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'
import './composables/useTheme'

createApp(App).use(createPinia()).use(router).mount('#app')

// 數字欄位聚焦時，滑鼠滾輪與鍵盤上下鍵都會一格一格改掉金額；滾動前先移開焦點，上下鍵直接擋掉
const isNumberInput = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === 'number'
document.addEventListener(
  'wheel',
  () => {
    if (isNumberInput(document.activeElement)) document.activeElement.blur()
  },
  { passive: true, capture: true },
)
document.addEventListener(
  'keydown',
  (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isNumberInput(e.target)) e.preventDefault()
  },
  { capture: true },
)
