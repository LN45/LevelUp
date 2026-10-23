<script lang="ts">
import { ref } from 'vue'

// Une seule lecture à la fois dans toute l'appli
const speakingId = ref<string | null>(null)
let currentUtterance: SpeechSynthesisUtterance | null = null

const RATES = { normal: 1, slow: 0.75 } as const

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
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, useId } from 'vue'

import { useSettingsStore } from '@/stores/settings'

const { text } = defineProps<{ text: string }>()

const settingsStore = useSettingsStore()
const id = useId()
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
const speaking = computed(() => speakingId.value === id)

function stop() {
  currentUtterance = null
  speakingId.value = null
  window.speechSynthesis.cancel()
}

function toggle() {
  const wasSpeaking = speaking.value
  stop()
  if (wasSpeaking) return

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'fr-FR'
  utterance.rate = RATES[settingsStore.settings.speechRate]
  const voice = pickFrenchVoice(window.speechSynthesis.getVoices())
  if (voice) utterance.voice = voice
  utterance.onend = utterance.onerror = () => {
    if (currentUtterance === utterance) {
      currentUtterance = null
      speakingId.value = null
    }
  }

  currentUtterance = utterance
  speakingId.value = id
  window.speechSynthesis.speak(utterance)
}

onBeforeUnmount(() => {
  if (speaking.value) stop()
})
</script>

<template>
  <button
    v-if="supported"
    type="button"
    class="speak"
    :class="{ 'speak--active': speaking }"
    :aria-label="speaking ? 'Arrêter la lecture' : 'Écouter'"
    @click="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect v-if="speaking" x="6" y="6" width="12" height="12" rx="2" />
      <template v-else>
        <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
        <path class="wave" d="M16 9 Q18 12 16 15 M18.5 6.5 Q22 12 18.5 17.5" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.speak {
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: var(--tap-size);
  height: var(--tap-size);
  padding: 0;
  border: var(--border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-ink);
  cursor: pointer;
}
.speak--active {
  background: var(--color-ink);
  color: var(--color-cream);
}
svg {
  width: 60%;
  height: 60%;
  fill: currentColor;
}
.wave {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
</style>
