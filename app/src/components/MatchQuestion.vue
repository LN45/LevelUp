<script setup lang="ts">
import { computed, ref } from 'vue'

import RichText from '@/components/RichText.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { shuffle } from '@/composables/useReviewSession'

const { pairs } = defineProps<{ pairs: { left: string; right: string }[] }>()
const emit = defineEmits<{ answered: [correct: boolean] }>()

// Définitions mélangées une fois pour toutes (le composant est recréé à chaque question)
const definitionOrder = shuffle(pairs.map((_, i) => i))

const selectedWord = ref<number | null>(null)
/** Mot (index) → définition reliée (index dans pairs) */
const links = ref<Record<number, number>>({})
const verified = ref(false)

const isComplete = computed(() => Object.keys(links.value).length === pairs.length)

/** Mot relié à une définition, s'il y en a un */
function wordFor(definition: number): number | undefined {
  const entry = Object.entries(links.value).find(([, linked]) => linked === definition)
  return entry ? Number(entry[0]) : undefined
}

function tapWord(word: number) {
  if (verified.value) return
  // Toucher un mot déjà relié défait la paire
  if (links.value[word] !== undefined) {
    delete links.value[word]
    selectedWord.value = null
    return
  }
  selectedWord.value = selectedWord.value === word ? null : word
}

function tapDefinition(definition: number) {
  if (verified.value) return
  const linkedWord = wordFor(definition)
  if (linkedWord !== undefined) {
    delete links.value[linkedWord]
    return
  }
  if (selectedWord.value === null) return
  links.value[selectedWord.value] = definition
  selectedWord.value = null
}

function verify() {
  verified.value = true
  emit(
    'answered',
    pairs.every((_, word) => links.value[word] === word),
  )
}

/** Après vérification : la définition est-elle reliée au bon mot ? */
const isRight = (definition: number) => wordFor(definition) === definition
</script>

<template>
  <div class="match">
    <p v-if="!verified" class="instruction">Touche un mot, puis sa définition.</p>

    <ul class="words">
      <li v-for="(pair, word) in pairs" :key="word" class="row">
        <button
          type="button"
          class="btn word"
          :class="{
            'word--selected': selectedWord === word,
            'word--linked': links[word] !== undefined,
          }"
          :aria-pressed="selectedWord === word"
          :aria-disabled="verified"
          @click="tapWord(word)"
        >
          <span class="badge">{{ word + 1 }}</span>
          <RichText :text="pair.left" />
        </button>
        <SpeakButton :text="pair.left" />
      </li>
    </ul>

    <ul class="definitions">
      <li v-for="definition in definitionOrder" :key="definition" class="row">
        <button
          type="button"
          class="btn definition"
          :class="{
            'definition--right': verified && isRight(definition),
            'definition--wrong': verified && !isRight(definition),
          }"
          :aria-disabled="verified"
          @click="tapDefinition(definition)"
        >
          <span v-if="wordFor(definition) !== undefined" class="badge">
            {{ (wordFor(definition) as number) + 1 }}
          </span>
          <span v-else class="badge badge--empty" aria-hidden="true">?</span>
          <span class="definition-text">
            <RichText :text="pairs[definition]?.right ?? ''" />
            <span v-if="verified && !isRight(definition)" class="correction">
              Bonne réponse : {{ definition + 1 }} ·
              <RichText :text="pairs[definition]?.left ?? ''" />
            </span>
          </span>
          <span v-if="verified && isRight(definition)" class="mark" aria-label="bonne réponse">
            ✓
          </span>
        </button>
        <SpeakButton :text="pairs[definition]?.right ?? ''" />
      </li>
    </ul>

    <button
      v-if="!verified"
      type="button"
      class="btn btn--primary verify"
      :disabled="!isComplete"
      @click="verify"
    >
      Vérifier
    </button>
  </div>
</template>

<style scoped>
.match,
.words,
.definitions {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.words,
.definitions {
  margin: 0;
  padding: 0;
  list-style: none;
}
.definitions {
  margin-top: var(--space-s);
}
.instruction {
  margin: 0;
  font-weight: 700;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
.word,
.definition {
  flex: 1;
  justify-content: flex-start;
  gap: var(--space-s);
  /* Marges réduites : les définitions gardent de la place sur un téléphone */
  padding: var(--space-s) var(--space-m);
  min-height: 3.5rem;
  text-align: left;
}
.definition {
  font-weight: 400;
}
.word--selected {
  background: var(--color-ink);
  border-color: var(--color-ink);
  color: var(--color-cream);
}
.word--linked {
  border-color: var(--color-gold);
}
.definition--right {
  border-width: 4px;
  border-color: var(--color-gold);
}
.definition--wrong {
  opacity: 0.75;
}
.badge {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-gold);
  color: var(--color-ink);
  font-weight: 700;
}
.word--selected .badge {
  background: var(--color-cream);
}
.badge--empty {
  background: var(--color-bg);
  border: 2px dashed var(--color-ink-soft);
  color: var(--color-ink-soft);
}
.definition-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-xs);
}
.correction {
  font-weight: 700;
}
.mark {
  flex-shrink: 0;
  color: var(--color-fox-dark);
  font-size: 1.3rem;
  font-weight: 700;
}
.btn[aria-disabled='true'] {
  cursor: default;
}
.verify {
  min-height: 3.5rem;
}
</style>
