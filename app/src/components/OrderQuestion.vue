<script setup lang="ts">
import { computed, ref } from 'vue'

import RichText from '@/components/RichText.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { shuffle } from '@/composables/useReviewSession'

const { items } = defineProps<{ items: string[] }>()
const emit = defineEmits<{ answered: [correct: boolean] }>()

// Étapes mélangées une fois pour toutes, jamais déjà dans le bon ordre
let shuffled = shuffle(items.map((_, i) => i))
if (shuffled.every((item, i) => item === i))
  shuffled = [...shuffled.slice(1), ...shuffled.slice(0, 1)]
const displayOrder = shuffled

/** Étapes (index dans items) dans l'ordre où elles ont été touchées */
const picked = ref<number[]>([])
const verified = ref(false)

const isComplete = computed(() => picked.value.length === items.length)

/** Numéro donné à une étape (1, 2…), ou undefined si pas encore touchée */
function numberOf(item: number): number | undefined {
  const position = picked.value.indexOf(item)
  return position >= 0 ? position + 1 : undefined
}

function tap(item: number) {
  if (verified.value || picked.value.includes(item)) return
  picked.value.push(item)
}

function reset() {
  picked.value = []
}

function verify() {
  verified.value = true
  emit(
    'answered',
    picked.value.every((item, position) => item === position),
  )
}

/** Après vérification : l'étape a-t-elle reçu le bon numéro ? */
const isRight = (item: number) => numberOf(item) === item + 1

/** Avant vérification : ordre mélangé ; après : le bon ordre, pour relire la suite correcte */
const shownOrder = computed(() => (verified.value ? items.map((_, i) => i) : displayOrder))
</script>

<template>
  <div class="order">
    <p class="instruction">
      {{ verified ? 'Voici le bon ordre :' : 'Touche les étapes dans le bon ordre.' }}
    </p>

    <ul class="items">
      <li v-for="item in shownOrder" :key="item" class="row">
        <button
          type="button"
          class="btn item"
          :class="{
            'item--picked': numberOf(item) !== undefined,
            'item--right': verified && isRight(item),
            'item--wrong': verified && !isRight(item),
          }"
          :aria-disabled="verified || numberOf(item) !== undefined"
          @click="tap(item)"
        >
          <span v-if="verified" class="badge">{{ item + 1 }}</span>
          <span v-else-if="numberOf(item) !== undefined" class="badge">{{ numberOf(item) }}</span>
          <span v-else class="badge badge--empty" aria-hidden="true">?</span>
          <span class="item-text">
            <RichText :text="items[item] ?? ''" />
            <span v-if="verified && !isRight(item)" class="correction">
              Tu l’avais mise en position {{ numberOf(item) }}.
            </span>
          </span>
          <span v-if="verified && isRight(item)" class="mark" aria-label="bien placée">✓</span>
        </button>
        <SpeakButton :text="items[item] ?? ''" />
      </li>
    </ul>

    <template v-if="!verified">
      <button v-if="picked.length" type="button" class="btn" @click="reset">
        ↺ Recommencer l’ordre
      </button>
      <button type="button" class="btn btn--primary verify" :disabled="!isComplete" @click="verify">
        Vérifier
      </button>
    </template>
  </div>
</template>

<style scoped>
.order,
.items {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.items {
  margin: 0;
  padding: 0;
  list-style: none;
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
.item {
  flex: 1;
  justify-content: flex-start;
  gap: var(--space-s);
  min-height: 3.5rem;
  /* Marges réduites : le texte des étapes garde de la place sur un téléphone */
  padding: var(--space-s) var(--space-m);
  font-weight: 400;
  text-align: left;
}
.item-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-xs);
}
.correction {
  font-weight: 700;
}
.item--picked {
  border-color: var(--color-gold);
}
.item--right {
  border-width: 4px;
}
.item--wrong {
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
.badge--empty {
  background: var(--color-bg);
  border: 2px dashed var(--color-ink-soft);
  color: var(--color-ink-soft);
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
