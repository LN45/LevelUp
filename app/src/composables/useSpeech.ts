import { computed, onBeforeUnmount, ref, useId } from 'vue'

import { useSettingsStore } from '@/stores/settings'
import { plainText } from '@/utils/text'

// Une seule lecture à la fois dans toute l'appli
const speakingId = ref<string | null>(null)
let currentUtterance: SpeechSynthesisUtterance | null = null

const RATES = { normal: 1, slow: 0.75 } as const

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Meilleure voix française disponible : fr-FR locale, puis fr-FR, puis toute voix fr-* */
export function pickFrenchVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase()
  const frFR = voices.filter((voice) => lang(voice) === 'fr-fr')
  return (
    frFR.find((voice) => voice.localService) ??
    frFR[0] ??
    voices.find((voice) => lang(voice).startsWith('fr'))
  )
}

function stopAll() {
  currentUtterance = null
  speakingId.value = null
  window.speechSynthesis.cancel()
}

/** Lecture vocale propre à un composant : en lancer une autre ailleurs arrête celle-ci */
export function useSpeech() {
  const settingsStore = useSettingsStore()
  const id = useId()
  const speaking = computed(() => speakingId.value === id)

  /** `onEnd` n'est appelé qu'à la fin normale de la lecture, pas si elle est arrêtée */
  function speak(text: string, onEnd?: () => void) {
    if (!speechSupported) return
    stopAll()
    const utterance = new SpeechSynthesisUtterance(plainText(text))
    utterance.lang = 'fr-FR'
    utterance.rate = RATES[settingsStore.settings.speechRate]
    const voice = pickFrenchVoice(window.speechSynthesis.getVoices())
    if (voice) utterance.voice = voice
    const finish = () => {
      if (currentUtterance !== utterance) return false
      currentUtterance = null
      speakingId.value = null
      return true
    }
    utterance.onerror = finish
    utterance.onend = () => {
      if (finish()) onEnd?.()
    }

    currentUtterance = utterance
    speakingId.value = id
    window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (speaking.value) stopAll()
  }

  onBeforeUnmount(stop)

  return { speaking, speak, stop }
}
