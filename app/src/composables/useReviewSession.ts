import { computed, ref, shallowRef } from 'vue'

interface Entry<T> {
  item: T
  /** Deuxième passage d'un élément non su : il ne reviendra plus */
  retry: boolean
}

/** Mélange de Fisher-Yates (copie) */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}

/**
 * Série de révision courte (questions du quiz) : ordre aléatoire, un élément raté revient
 * une seule fois à la fin, aucune pénalité.
 */
export function useReviewSession<T>(options: { maxItems: number; random?: () => number }) {
  const queue = shallowRef<Entry<T>[]>([])
  const position = ref(0)
  const itemCount = ref(0)
  /** Éléments sus dès le premier passage */
  const knownCount = ref(0)

  const current = computed(() => queue.value[position.value]?.item)
  const isRetry = computed(() => queue.value[position.value]?.retry ?? false)
  const isDone = computed(() => queue.value.length > 0 && position.value >= queue.value.length)

  function start(items: readonly T[]) {
    const picked = shuffle(items, options.random).slice(0, options.maxItems)
    queue.value = picked.map((item) => ({ item, retry: false }))
    position.value = 0
    itemCount.value = picked.length
    knownCount.value = 0
  }

  function answer(knew: boolean) {
    const entry = queue.value[position.value]
    if (!entry) return
    if (knew && !entry.retry) knownCount.value++
    if (!knew && !entry.retry) queue.value = [...queue.value, { item: entry.item, retry: true }]
    position.value++
  }

  return {
    current,
    isRetry,
    isDone,
    /** Numéro de l'élément affiché (à partir de 1) et longueur actuelle de la série */
    step: computed(() => Math.min(position.value + 1, queue.value.length)),
    length: computed(() => queue.value.length),
    itemCount,
    knownCount,
    start,
    answer,
  }
}
