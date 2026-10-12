import { reactive } from 'vue'
import type { Id } from '@/types'

// 放在模組層，篩選或重新讀取讓卡片重建時，展開的子清單不會收回去
const expanded = reactive(new Set<Id>())

export function useExpanded() {
  return {
    isOpen: (id: Id) => expanded.has(id),
    toggle: (id: Id) => (expanded.has(id) ? expanded.delete(id) : expanded.add(id)),
    open: (id: Id) => expanded.add(id),
  }
}
