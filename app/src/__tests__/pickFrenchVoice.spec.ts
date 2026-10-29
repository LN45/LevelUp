import { describe, it, expect } from 'vitest'

import { pickFrenchVoice } from '@/composables/useSpeech'

const voice = (name: string, lang: string, localService = false) =>
  ({ name, lang, localService }) as SpeechSynthesisVoice

describe('pickFrenchVoice', () => {
  it('préfère une voix fr-FR locale', () => {
    const voices = [
      voice('en', 'en-US', true),
      voice('fr distante', 'fr-FR'),
      voice('fr locale', 'fr-FR', true),
    ]
    expect(pickFrenchVoice(voices)?.name).toBe('fr locale')
  })

  it('accepte le format Android fr_FR', () => {
    expect(pickFrenchVoice([voice('android', 'fr_FR')])?.name).toBe('android')
  })

  it('se rabat sur une autre voix française', () => {
    expect(pickFrenchVoice([voice('en', 'en-GB'), voice('canada', 'fr-CA')])?.name).toBe('canada')
  })

  it('ne renvoie rien sans voix française', () => {
    expect(pickFrenchVoice([voice('en', 'en-US')])).toBeUndefined()
  })
})
