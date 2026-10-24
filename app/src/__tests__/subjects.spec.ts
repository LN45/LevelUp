import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { useSubjectsStore } from '@/stores/subjects'

async function loadedStore() {
  const store = useSubjectsStore()
  await vi.waitFor(() => expect(store.subjects?.length).toBeGreaterThan(0))
  return store
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  setActivePinia(createPinia())
})

describe('store des matières', () => {
  it('charge les matières et suit les changements de la base', async () => {
    const store = await loadedStore()
    const count = store.subjects?.length ?? 0
    await db.subjects.add({ name: 'Japonais', icon: '🦊', color: '#000', createdAt: new Date() })
    await vi.waitFor(() => expect(store.subjects?.length).toBe(count + 1))
  })

  it('refuse un nom vide ou déjà pris, sans tenir compte des majuscules', async () => {
    const store = await loadedStore()
    expect(await store.add({ name: '   ', icon: '🦊', color: '#000' })).toBe('empty')
    expect(await store.add({ name: 'français', icon: '🦊', color: '#000' })).toBe('duplicate')
    expect(await store.add({ name: ' Japonais ', icon: '🦊', color: '#000' })).toBeNull()
    expect(await db.subjects.where('name').equals('Japonais').count()).toBe(1)
  })

  it('renomme une matière, y compris en changeant seulement les majuscules', async () => {
    const store = await loadedStore()
    const french = store.subjects?.find((s) => s.name === 'Français')
    if (!french) throw new Error('Français manquant')
    expect(await store.rename(french.id, 'Mathématiques')).toBe('duplicate')
    expect(await store.rename(french.id, 'FRANÇAIS')).toBeNull()
    expect((await db.subjects.get(french.id))?.name).toBe('FRANÇAIS')
  })
})
