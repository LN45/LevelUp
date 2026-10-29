<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import { speechSupported, useSpeech } from '@/composables/useSpeech'
import { courseLines } from '@/utils/text'

const { text } = defineProps<{ text: string }>()

const lines = computed(() => courseLines(text))
const { speaking, speak, stop } = useSpeech()
const reducedMotion = usePreferredReducedMotion()
const root = useTemplateRef('root')

// Ligne en cours de lecture (ou en pause) ; null : lecture guidée fermée
const current = ref<number | null>(null)

/** Lit la ligne `index` puis enchaîne sur la suivante, ligne par ligne :
 *  évite les coupures de la synthèse vocale sur les textes longs */
function readFrom(index: number) {
  const line = lines.value[index]
  if (!line) {
    current.value = null
    return
  }
  current.value = index
  speak(line.text, () => readFrom(index + 1))
}

function close() {
  stop()
  current.value = null
}

// Replier le texte arrête la lecture
function onToggle(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) close()
}

function onLineClick(index: number) {
  if (current.value !== null) readFrom(index)
}

// Fait défiler la page pour garder la ligne lue sous les yeux
watch(current, async (index) => {
  if (index === null) return
  await nextTick()
  root.value?.querySelector(`[data-line="${index}"]`)?.scrollIntoView({
    block: 'center',
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
  })
})
</script>

<template>
  <details ref="root" class="course" @toggle="onToggle">
    <summary>Le texte du cours</summary>

    <button
      v-if="speechSupported && current === null"
      type="button"
      class="btn btn--primary start"
      @click="readFrom(0)"
    >
      ▶️ Lire le cours
    </button>
    <div v-else-if="current !== null" class="controls" role="group" aria-label="Lecture du cours">
      <button
        type="button"
        class="btn control"
        :disabled="current === 0"
        aria-label="Ligne précédente"
        @click="readFrom(current - 1)"
      >
        ⏮️
      </button>
      <button
        type="button"
        class="btn control"
        :aria-label="speaking ? 'Pause' : 'Reprendre'"
        @click="speaking ? stop() : readFrom(current)"
      >
        {{ speaking ? '⏸️' : '▶️' }}
      </button>
      <button
        type="button"
        class="btn control"
        :disabled="current === lines.length - 1"
        aria-label="Ligne suivante"
        @click="readFrom(current + 1)"
      >
        ⏭️
      </button>
      <button type="button" class="btn control" aria-label="Arrêter la lecture" @click="close">
        ⏹️
      </button>
    </div>
    <p v-if="current !== null" class="hint">Touche une ligne pour la lire.</p>

    <component
      :is="line.kind === 'title' ? 'h3' : 'p'"
      v-for="(line, index) in lines"
      :key="index"
      :data-line="index"
      :class="{
        item: line.kind === 'item',
        'line--reading': current !== null,
        'line--current': current === index,
      }"
      @click="onLineClick(index)"
    >
      {{ line.kind === 'item' ? '• ' : '' }}{{ line.text }}
    </component>
  </details>
</template>

<style scoped>
.course summary {
  min-height: var(--tap-size);
  font-weight: 700;
  cursor: pointer;
}
.start {
  width: 100%;
  margin-bottom: var(--space-s);
}
/* Reste visible en haut de l'écran pendant que la page défile avec la lecture */
.controls {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-s);
  padding: var(--space-s) 0;
  background: var(--color-bg);
}
.control {
  padding: 0;
  font-size: 1.3rem;
}
.hint {
  margin: 0;
  color: var(--color-ink-soft);
  font-size: 0.85rem;
}

.course h3 {
  margin: var(--space-m) 0 0;
}
.course p {
  margin: var(--space-xs) 0;
}
.course .item {
  padding-left: var(--space-m);
}
.line--reading {
  border-radius: var(--radius);
  cursor: pointer;
}
.line--current {
  /* Fond doré clair sous le texte indigo : contraste conservé */
  background: color-mix(in srgb, var(--color-gold) 30%, var(--color-cream));
  box-shadow: 0 0 0 var(--space-xs) color-mix(in srgb, var(--color-gold) 30%, var(--color-cream));
}
</style>
