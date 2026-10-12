<script setup lang="ts">
import { computed } from 'vue'
import { Moon, SunMedium, SunMoon } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'

const { pref, cycle } = useTheme()
const meta = computed(
  () =>
    ({
      system: { icon: SunMoon, label: '跟隨系統' },
      light: { icon: SunMedium, label: '淺色' },
      dark: { icon: Moon, label: '深色' },
    })[pref.value],
)
</script>

<template>
  <button type="button" class="icon-btn" :title="`主題：${meta.label}（點擊切換）`" :aria-label="`主題：${meta.label}`" @click="cycle">
    <component :is="meta.icon" class="size-5" />
  </button>
</template>
