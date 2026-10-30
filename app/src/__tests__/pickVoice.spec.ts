import { describe, it, expect } from 'vitest'

import { pickVoice, subjectLanguage } from '@/composables/useSpeech'

const voice = (name: string, lang: string, localService = false) =>
  ({ name, lang, localService }) as SpeechSynthesisVoice

describe('pickVoice', () => {
  it('préfère une voix fr-FR locale', () => {
    const voices = [
      voice('en', 'en-US', true),
      voice('fr distante', 'fr-FR'),
      voice('fr locale', 'fr-FR', true),
    ]
    expect(pickVoice(voices, 'fr-FR')?.name).toBe('fr locale')
  })

  it('accepte le format Android fr_FR', () => {
    expect(pickVoice([voice('android', 'fr_FR')], 'fr-FR')?.name).toBe('android')
  })

  it('se rabat sur une autre voix de la même langue', () => {
    expect(pickVoice([voice('en', 'en-GB'), voice('canada', 'fr-CA')], 'fr-FR')?.name).toBe(
      'canada',
    )
    expect(pickVoice([voice('fr', 'fr-FR'), voice('us', 'en-US')], 'en-GB')?.name).toBe('us')
  })

  it('ne renvoie rien sans voix de cette langue', () => {
    expect(pickVoice([voice('en', 'en-US')], 'fr-FR')).toBeUndefined()
  })
})

describe('subjectLanguage', () => {
  it('donne la langue des matières de langues vivantes', () => {
    expect(subjectLanguage('Anglais')).toBe('en-GB')
    expect(subjectLanguage(' espagnol ')).toBe('es-ES')
    expect(subjectLanguage('Histoire-Géographie')).toBeNull()
    expect(subjectLanguage(undefined)).toBeNull()
  })
})
