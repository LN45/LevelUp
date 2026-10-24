import { liveQuery } from 'dexie'
import { onScopeDispose, readonly, shallowRef, type Ref } from 'vue'

/** Résultat d'une requête Dexie, mis à jour automatiquement quand les données changent */
export function useLiveQuery<T>(query: () => T | Promise<T>, initial: T): Readonly<Ref<T>> {
  const result = shallowRef(initial)
  const subscription = liveQuery(query).subscribe({
    next: (value) => (result.value = value),
    error: (error) => console.error('Erreur de lecture de la base locale', error),
  })
  onScopeDispose(() => subscription.unsubscribe())
  return readonly(result) as Readonly<Ref<T>>
}
