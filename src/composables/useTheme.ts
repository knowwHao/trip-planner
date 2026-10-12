import { ref, watchEffect } from 'vue'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'trip-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const pref = ref<ThemePref>(readPref())
const systemDark = ref(media.matches)
media.addEventListener('change', (e) => (systemDark.value = e.matches))

watchEffect(() => {
  const dark = pref.value === 'dark' || (pref.value === 'system' && systemDark.value)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1422' : '#f4f6f1')
  try {
    if (pref.value === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref.value)
  } catch {
    // 儲存失敗只影響下次開啟時的偏好
  }
})

export function useTheme() {
  const cycle = () => {
    pref.value = pref.value === 'system' ? 'light' : pref.value === 'light' ? 'dark' : 'system'
  }
  return { pref, cycle }
}
