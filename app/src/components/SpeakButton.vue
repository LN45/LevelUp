<script setup lang="ts">
import { speechSupported, useSpeech } from '@/composables/useSpeech'

const { text } = defineProps<{ text: string }>()

const { speaking, speak, stop } = useSpeech()

function toggle() {
  if (speaking.value) stop()
  else speak(text)
}

/** Lance la lecture (lecture automatique), sans l'arrêter si elle est déjà en cours */
function play() {
  if (!speaking.value) speak(text)
}

defineExpose({ play })
</script>

<template>
  <button
    v-if="speechSupported"
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
