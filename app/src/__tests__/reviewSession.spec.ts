import { describe, expect, it } from 'vitest'

import { shuffle, useReviewSession } from '@/composables/useReviewSession'

// random() = 0.99 : le mélange garde l'ordre d'origine (chaque élément reste à sa place)
const keepOrder = () => 0.99

function session(items: string[], maxItems = 10) {
  const s = useReviewSession<string>({ maxItems, random: keepOrder })
  s.start(items)
  return s
}

describe('série de révision', () => {
  it('mélange sans perdre ni dupliquer d’élément', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    expect(shuffle(items).sort()).toEqual(items)
    expect(shuffle(items, () => 0)).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('limite la série au nombre maximal d’éléments', () => {
    const s = session(['a', 'b', 'c', 'd'], 3)
    expect(s.length.value).toBe(3)
    expect(s.itemCount.value).toBe(3)
  })

  it('fait revenir une seule fois à la fin un élément non su', () => {
    const s = session(['a', 'b'])
    s.answer(false) // a non su
    expect(s.current.value).toBe('b')
    s.answer(true)
    expect(s.current.value).toBe('a')
    expect(s.isRetry.value).toBe(true)
    expect(s.step.value).toBe(3)
    expect(s.length.value).toBe(3)
    s.answer(false) // toujours pas su : ne revient plus
    expect(s.isDone.value).toBe(true)
  })

  it('ne refait jamais passer un élément su', () => {
    const items = ['a', 'b', 'c', 'd']
    const s = useReviewSession<string>({ maxItems: 10 })
    s.start(items)
    const seen: string[] = []
    while (!s.isDone.value) {
      seen.push(s.current.value as string)
      s.answer(true)
    }
    expect(seen.sort()).toEqual(items)
  })

  it('compte les éléments sus dès le premier passage', () => {
    const s = session(['a', 'b', 'c'])
    s.answer(true)
    s.answer(false)
    s.answer(true)
    s.answer(true) // b au second passage : ne compte pas comme « su du premier coup »
    expect(s.knownCount.value).toBe(2)
    expect(s.isDone.value).toBe(true)
  })

  it('recommence une nouvelle série', () => {
    const s = session(['a', 'b'])
    s.answer(true)
    s.answer(true)
    s.start(['a', 'b'])
    expect(s.isDone.value).toBe(false)
    expect(s.step.value).toBe(1)
    expect(s.knownCount.value).toBe(0)
  })
})
