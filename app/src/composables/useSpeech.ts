import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  useId,
  type InjectionKey,
  type Ref,
} from 'vue'

import { useSettingsStore } from '@/stores/settings'
import { speechSegments } from '@/utils/text'

// Une seule lecture à la fois dans toute l'appli
const speakingId = ref<string | null>(null)
let currentUtterance: SpeechSynthesisUtterance | null = null

const RATES = { normal: 1, slow: 0.75 } as const

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Meilleure voix pour une langue (« fr-FR ») : exacte et locale, puis exacte, puis même langue (fr-*) */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | undefined {
  const normalize = (code: string) => code.replace('_', '-').toLowerCase()
  const wanted = normalize(lang)
  const base = wanted.split('-')[0]
  const exact = voices.filter((voice) => normalize(voice.lang) === wanted)
  return (
    exact.find((voice) => voice.localService) ??
    exact[0] ??
    voices.find((voice) => normalize(voice.lang).split('-')[0] === base)
  )
}

const SUBJECT_LANGUAGES: Record<string, string> = {
  anglais: 'en-GB',
  espagnol: 'es-ES',
  allemand: 'de-DE',
}

/** Langue des passages [entre crochets] d'après le nom de la matière (null : lus en français) */
export function subjectLanguage(subjectName: string | undefined): string | null {
  return SUBJECT_LANGUAGES[subjectName?.trim().toLowerCase() ?? ''] ?? null
}

const foreignLanguageKey: InjectionKey<Readonly<Ref<string | null>>> = Symbol('foreignLanguage')

/** Écran d'une leçon : les passages [entre crochets] de ses textes sont dans la langue de sa matière */
export function provideSubjectLanguage(subjectName: () => string | undefined) {
  provide(
    foreignLanguageKey,
    computed(() => subjectLanguage(subjectName())),
  )
}

export function useForeignLanguage(): Readonly<Ref<string | null>> {
  return inject(foreignLanguageKey, ref(null))
}

function stopAll() {
  currentUtterance = null
  speakingId.value = null
  window.speechSynthesis.cancel()
}

/** Lecture vocale propre à un composant : en lancer une autre ailleurs arrête celle-ci */
export function useSpeech() {
  const settingsStore = useSettingsStore()
  const foreignLanguage = useForeignLanguage()
  const id = useId()
  const speaking = computed(() => speakingId.value === id)

  /** `onEnd` n'est appelé qu'à la fin normale de la lecture, pas si elle est arrêtée */
  function speak(text: string, onEnd?: () => void) {
    if (!speechSupported) return
    stopAll()
    const voices = window.speechSynthesis.getVoices()
    // Une lecture par morceau : une voix ne change pas de langue en cours de phrase
    const utterances = speechSegments(text).map((segment) => {
      const lang = (segment.foreign && foreignLanguage.value) || 'fr-FR'
      const utterance = new SpeechSynthesisUtterance(segment.text)
      utterance.lang = lang
      utterance.rate = RATES[settingsStore.settings.speechRate]
      const voice = pickVoice(voices, lang)
      if (voice) utterance.voice = voice
      return utterance
    })
    const last = utterances[utterances.length - 1]
    if (!last) {
      onEnd?.()
      return
    }
    const finish = () => {
      if (currentUtterance !== last) return false
      currentUtterance = null
      speakingId.value = null
      return true
    }
    last.onerror = finish
    last.onend = () => {
      if (finish()) onEnd?.()
    }

    currentUtterance = last
    speakingId.value = id
    for (const utterance of utterances) window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (speaking.value) stopAll()
  }

  onBeforeUnmount(stop)

  return { speaking, speak, stop }
}
