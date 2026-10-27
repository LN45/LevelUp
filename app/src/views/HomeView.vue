<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import InstallCard from '@/components/InstallCard.vue'
import KitsuneMascot from '@/components/KitsuneMascot.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { usePwa } from '@/composables/usePwa'
import { db } from '@/db'
import { useProgressStore } from '@/stores/progress'
import { NICKNAME_MAX_LENGTH, useSettingsStore } from '@/stores/settings'
import { endOfDay, groupDueByLesson, type DueGroup } from '@/utils/review'

const { settings } = storeToRefs(useSettingsStore())
const { xp, level } = storeToRefs(useProgressStore())
// Mise à jour proposée ici seulement : jamais d'interruption pendant un quiz
const { needRefresh, update } = usePwa()

const levelText = computed(() =>
  level.value.toNext === null
    ? '9 queues : tu es un kitsuné très sage !'
    : `Encore ${level.value.toNext} XP pour la prochaine queue`,
)

/** « À réviser aujourd'hui » : par matière puis par leçon, jamais mélangées */
const dueGroups = useLiveQuery(
  async () => {
    const [due, lessons, subjects] = await Promise.all([
      db.quizQuestions.where('due').belowOrEqual(endOfDay()).toArray(),
      db.lessons.toArray(),
      db.subjects.toArray(),
    ])
    return groupDueByLesson(due, lessons, subjects)
  },
  undefined as DueGroup[] | undefined,
)

const isFirstVisit = computed(() => settings.value.nickname === null)
const nicknameDraft = ref('')

const message = computed(() => {
  if (isFirstVisit.value)
    return 'Bienvenue ! Je suis ton kitsuné. Comment veux-tu que je t’appelle ?'
  const name = settings.value.nickname
  return name ? `Salut ${name} ! On révise ensemble ?` : 'Salut ! On révise ensemble ?'
})

function saveNickname(nickname: string) {
  settings.value.nickname = nickname.trim()
}
</script>

<template>
  <section class="home">
    <KitsuneMascot class="mascot" :mood="isFirstVisit ? 'encouraging' : 'happy'" />

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

    <template v-else>
      <div v-if="xp !== undefined" class="level">
        <strong>Niveau {{ level.level }}</strong>
        <ProgressBar :value="level.progress" />
        <span class="level-text">{{ levelText }}</span>
      </div>

      <RouterLink to="/lessons/new" class="btn btn--primary main-action">
        📷 Ajouter un cours
      </RouterLink>

      <div v-if="needRefresh" class="card update" role="status">
        <span>✨ Une nouvelle version de l’appli est prête.</span>
        <button type="button" class="btn" @click="update">Mettre à jour</button>
      </div>

      <InstallCard dismissible />

      <section v-if="dueGroups" class="review" aria-labelledby="review-title">
        <h2 id="review-title">À réviser aujourd’hui</h2>
        <p v-if="!dueGroups.length" class="nothing">Rien à réviser aujourd’hui. Bravo ! 🎉</p>
        <div
          v-for="group in dueGroups"
          :key="group.subject.id"
          class="group"
          :style="{ '--subject-color': group.subject.color }"
        >
          <h3>
            <span aria-hidden="true">{{ group.subject.icon }}</span> {{ group.subject.name }}
          </h3>
          <RouterLink
            v-for="item in group.lessons"
            :key="item.lesson.id"
            :to="{ name: 'review', params: { id: item.lesson.id } }"
            class="card due-lesson"
          >
            <span class="due-title">{{ item.lesson.title }}</span>
            <span class="due-count">
              {{ item.count }} question{{ item.count > 1 ? 's' : '' }} ›
            </span>
          </RouterLink>
        </div>
      </section>
    </template>
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

.level {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.level-text {
  color: var(--color-ink-soft);
}

.update {
  flex-wrap: wrap;
  justify-content: space-between;
}

.welcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.welcome label {
  font-weight: 700;
}

.review,
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.review h2,
.group h3 {
  margin: 0;
}
.group {
  margin-top: var(--space-s);
}
.nothing {
  margin: 0;
}
.due-lesson {
  justify-content: space-between;
  border-left: 0.6rem solid var(--subject-color);
}
.due-title {
  font-weight: 700;
}
.due-count {
  flex-shrink: 0;
  color: var(--color-ink-soft);
}
</style>
