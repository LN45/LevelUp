<script setup lang="ts">
import { computed } from 'vue'

import SpeakButton from '@/components/SpeakButton.vue'
import { usePwa } from '@/composables/usePwa'

const { dismissible = false } = defineProps<{
  /** Accueil : bouton « Plus tard », retenu sur cet appareil */
  dismissible?: boolean
}>()

const { canPrompt, showIosHint, installDismissed, install } = usePwa()

const visible = computed(
  () => (canPrompt.value || showIosHint.value) && !(dismissible && installDismissed.value),
)

const message = computed(() =>
  canPrompt.value
    ? 'Installe LevelUp sur ton téléphone. Elle s’ouvrira comme une vraie appli, même sans internet.'
    : 'Pour installer LevelUp : touche le bouton Partager, puis « Sur l’écran d’accueil ».',
)
</script>

<template>
  <div v-if="visible" class="card install">
    <div class="install-text">
      <p>{{ message }}</p>
      <SpeakButton :text="message" />
    </div>
    <!-- Bouton Partager de Safari : un carré avec une flèche vers le haut -->
    <svg v-if="!canPrompt" class="share-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8 H5 V21 H19 V8 H16 M12 15 V2 M8 6 L12 2 L16 6" />
    </svg>
    <button v-if="canPrompt" type="button" class="btn btn--primary" @click="install">
      📲 Installer l’appli
    </button>
    <button v-if="dismissible" type="button" class="btn" @click="installDismissed = true">
      Plus tard
    </button>
  </div>
</template>

<style scoped>
.install {
  flex-direction: column;
  align-items: stretch;
  border-color: var(--color-gold);
}
.install-text {
  display: flex;
  align-items: flex-start;
  gap: var(--space-m);
}
.install-text p {
  flex: 1;
  margin: 0;
}
.share-icon {
  align-self: center;
  width: 2rem;
  height: 2rem;
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
