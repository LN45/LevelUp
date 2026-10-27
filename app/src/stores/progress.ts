import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useLiveQuery } from '@/composables/useLiveQuery'
import { totalXp } from '@/db'
import { levelInfo } from '@/utils/progress'

export const useProgressStore = defineStore('progress', () => {
  // undefined tant que la base n'a pas répondu
  const xp = useLiveQuery<number | undefined>(totalXp, undefined)
  const level = computed(() => levelInfo(xp.value ?? 0))
  return { xp, level }
})
