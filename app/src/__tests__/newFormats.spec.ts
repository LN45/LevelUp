import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import MatchQuestion from '@/components/MatchQuestion.vue'
import OrderQuestion from '@/components/OrderQuestion.vue'

const PAIRS = [
  { left: 'Fertile', right: 'Peut avoir des descendants.' },
  { left: 'Stérile', right: 'Ne peut pas avoir de descendants.' },
  { left: 'Ovipare', right: 'Pond des œufs.' },
]

const ITEMS = ['Le magma monte', 'Il arrive au cratère', 'La lave coule']

// Pinia : le bouton 🔊 lit les réglages
const mountMatch = () =>
  mount(MatchQuestion, { props: { pairs: PAIRS }, global: { plugins: [createPinia()] } })
const mountOrder = () =>
  mount(OrderQuestion, { props: { items: ITEMS }, global: { plugins: [createPinia()] } })

/** Touche le bouton dont le texte contient ce libellé */
async function tap(wrapper: Pick<VueWrapper, 'findAll'>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  if (!button) throw new Error(`bouton introuvable : ${text}`)
  await button.trigger('click')
}

describe('relier par paires', () => {
  it('réussit quand chaque mot est relié à sa définition', async () => {
    const wrapper = mountMatch()
    for (const { left, right } of PAIRS) {
      await tap(wrapper, left)
      await tap(wrapper, right)
    }
    await tap(wrapper, 'Vérifier')
    expect(wrapper.emitted('answered')).toEqual([[true]])
    expect(wrapper.text()).not.toContain('Bonne réponse')
  })

  it('montre la correction quand des paires sont fausses', async () => {
    const wrapper = mountMatch()
    await tap(wrapper, 'Fertile')
    await tap(wrapper, 'Ne peut pas avoir')
    await tap(wrapper, 'Stérile')
    await tap(wrapper, 'Peut avoir des descendants.')
    await tap(wrapper, 'Ovipare')
    await tap(wrapper, 'Pond des œufs.')
    await tap(wrapper, 'Vérifier')
    expect(wrapper.emitted('answered')).toEqual([[false]])
    expect(wrapper.text()).toContain('Bonne réponse : 2')
  })

  it('n’active « Vérifier » que lorsque toutes les paires sont faites, et défait une paire touchée', async () => {
    const wrapper = mountMatch()
    const verify = () => wrapper.findAll('button').find((b) => b.text() === 'Vérifier')
    await tap(wrapper, 'Fertile')
    await tap(wrapper, 'Peut avoir des descendants.')
    expect(verify()?.attributes('disabled')).toBeDefined()
    // Toucher le mot relié défait la paire
    await tap(wrapper, 'Fertile')
    for (const { left, right } of PAIRS.slice(1)) {
      await tap(wrapper, left)
      await tap(wrapper, right)
    }
    expect(verify()?.attributes('disabled')).toBeDefined()
    await tap(wrapper, 'Fertile')
    await tap(wrapper, 'Peut avoir des descendants.')
    expect(verify()?.attributes('disabled')).toBeUndefined()
  })
})

describe('remettre dans l’ordre', () => {
  it('réussit quand les étapes sont touchées dans le bon ordre', async () => {
    const wrapper = mountOrder()
    for (const item of ITEMS) await tap(wrapper, item)
    await tap(wrapper, 'Vérifier')
    expect(wrapper.emitted('answered')).toEqual([[true]])
  })

  it('montre le bon ordre en cas d’erreur', async () => {
    const wrapper = mountOrder()
    for (const item of [ITEMS[1], ITEMS[0], ITEMS[2]]) await tap(wrapper, item as string)
    await tap(wrapper, 'Vérifier')
    expect(wrapper.emitted('answered')).toEqual([[false]])
    expect(wrapper.text()).toContain('Voici le bon ordre')
    expect(wrapper.text()).toContain('Tu l’avais mise en position 1')
  })

  it('permet de recommencer l’ordre avant de vérifier', async () => {
    const wrapper = mountOrder()
    await tap(wrapper, ITEMS[2] as string)
    await tap(wrapper, 'Recommencer l’ordre')
    for (const item of ITEMS) await tap(wrapper, item)
    await tap(wrapper, 'Vérifier')
    expect(wrapper.emitted('answered')).toEqual([[true]])
  })
})
