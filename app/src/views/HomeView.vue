<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import KitsuneMascot from '@/components/KitsuneMascot.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { NICKNAME_MAX_LENGTH, useSettingsStore } from '@/stores/settings'

const { settings } = storeToRefs(useSettingsStore())

const isFirstVisit = computed(() => settings.value.nickname === null)
const nicknameDraft = ref('')

// Titre de la leçon tout juste enregistrée (transmis par NewLessonView via l'état de navigation)
const savedLesson: unknown = history.state?.savedLesson

const message = computed(() => {
  if (isFirstVisit.value)
    return 'Bienvenue ! Je suis ton kitsuné. Comment veux-tu que je t’appelle ?'
  if (typeof savedLesson === 'string') return `Bravo ! La leçon « ${savedLesson} » est enregistrée.`
  const name = settings.value.nickname
  return name ? `Salut ${name} ! On révise ensemble ?` : 'Salut ! On révise ensemble ?'
})

function saveNickname(nickname: string) {
  settings.value.nickname = nickname.trim()
}
</script>

<template>
  <section class="home">
    <KitsuneMascot
      class="mascot"
      :mood="isFirstVisit ? 'encouraging' : savedLesson ? 'proud' : 'happy'"
    />

    <div class="bubble">
      <p>{{ message }}</p>
      <SpeakButton :text="message" />
    </div>

    <form v-if="isFirstVisit" class="welcome" @submit.prevent="saveNickname(nicknameDraft)">
      <label for="nickname">Ton pseudo</label>
      <input
        id="nickname"
        v-model="nicknameDraft"
        class="text-input"
        :maxlength="NICKNAME_MAX_LENGTH"
        autocomplete="off"
        autocapitalize="words"
      />
      <button type="submit" class="btn btn--primary" :disabled="!nicknameDraft.trim()">
        C’est parti !
      </button>
      <button type="button" class="btn" @click="saveNickname('')">Plus tard</button>
    </form>

    <RouterLink v-else to="/lessons/new" class="btn btn--primary main-action">
      📷 Ajouter un cours
    </RouterLink>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.main-action {
  min-height: 3.5rem;
  font-size: 1.1rem;
}

.mascot {
  max-width: 16rem;
  margin: 0 auto;
}

.bubble {
  display: flex;
  align-items: flex-start;
  gap: var(--space-m);
  padding: var(--space-m);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.bubble p {
  flex: 1;
  margin: 0;
  font-weight: 700;
}

.welcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.welcome label {
  font-weight: 700;
}
</style>
