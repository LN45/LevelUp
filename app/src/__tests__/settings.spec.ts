import { describe, it, expect } from 'vitest'

import { DEFAULT_SETTINGS, parseSettings } from '@/stores/settings'

describe('parseSettings', () => {
  it('renvoie les valeurs par défaut si rien n’est stocké', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('renvoie les valeurs par défaut si le stockage est corrompu', () => {
    expect(parseSettings('{pas du json')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS)
  })

  it('garde les valeurs valides', () => {
    const stored = {
      font: 'opendyslexic',
      fontSize: 24,
      lineHeight: 2.1,
      speechRate: 'slow',
      nickname: 'Renard',
    }
    expect(parseSettings(JSON.stringify(stored))).toEqual(stored)
  })

  it('remplace chaque valeur invalide par sa valeur par défaut', () => {
    const stored = { font: 'comic', fontSize: 12, lineHeight: '2', speechRate: 'fast', nickname: 3 }
    expect(parseSettings(JSON.stringify(stored))).toEqual(DEFAULT_SETTINGS)
  })

  it('nettoie le pseudo et garde le choix « plus tard »', () => {
    expect(parseSettings(JSON.stringify({ nickname: '  Renard  ' })).nickname).toBe('Renard')
    expect(parseSettings(JSON.stringify({ nickname: 'x'.repeat(50) })).nickname).toHaveLength(30)
    expect(parseSettings(JSON.stringify({ nickname: '' })).nickname).toBe('')
  })
})
