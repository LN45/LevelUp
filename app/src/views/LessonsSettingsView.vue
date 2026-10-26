<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { db, type Lesson } from '@/db'
import { useLessonsStore } from '@/stores/lessons'
import { formatDate } from '@/utils/text'

const lessonsStore = useLessonsStore()

/** Leçons regroupées par matière, les plus récentes d'abord */
const groups = useLiveQuery(async () => {
  const [subjects, lessons] = await Promise.all([
    db.subjects.toArray(),
    db.lessons.orderBy('createdAt').reverse().toArray(),
  ])
  return subjects
    .map((subject) => ({ subject, lessons: lessons.filter((l) => l.subjectId === subject.id) }))
    .filter((group) => group.lessons.length)
}, undefined)

const status = ref('')
const confirmDialog = useTemplateRef('confirm-dialog')
const pending = ref<Lesson | null>(null)

async function askRemove(lesson: Lesson) {
  pending.value = lesson
  if (await confirmDialog.value?.open()) {
    await lessonsStore.remove(lesson.id)
    status.value = `« ${lesson.title} » supprimée.`
  }
  pending.value = null
}
</script>

<template>
  <section class="manage">
    <RouterLink to="/settings" class="btn back">← Réglages</RouterLink>
    <h1>Gérer les leçons</h1>
    <p class="status" role="status">{{ status }}</p>

    <p v-if="groups && !groups.length">Aucune leçon pour l’instant.</p>

    <div v-for="group in groups" :key="group.subject.id" class="group">
      <h2>
        <span aria-hidden="true">{{ group.subject.icon }}</span> {{ group.subject.name }}
      </h2>
      <ul class="list">
        <li v-for="lesson in group.lessons" :key="lesson.id" class="card row">
          <span class="lesson-text">
            <span class="lesson-title">{{ lesson.title }}</span>
            <span class="lesson-meta">{{ formatDate(lesson.createdAt) }}</span>
          </span>
          <RouterLink
            :to="{ name: 'settings-lesson', params: { id: lesson.id } }"
            class="btn remove"
            :aria-label="`Corriger ${lesson.title}`"
          >
            ✏️
          </RouterLink>
          <button
            type="button"
            class="btn remove"
            :aria-label="`Supprimer ${lesson.title}`"
            @click="askRemove(lesson)"
          >
            🗑️
          </button>
        </li>
      </ul>
    </div>

    <ConfirmDialog ref="confirm-dialog" confirm-label="Supprimer">
      <template v-if="pending">
        <p>
          <strong>Supprimer « {{ pending.title }} » ?</strong>
        </p>
        <p>Sa fiche, ses cartes et son quiz seront aussi effacés.</p>
        <p>On ne pourra pas revenir en arrière.</p>
      </template>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.manage {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.back {
  align-self: flex-start;
}
h1,
h2 {
  margin: 0;
}
.status {
  min-height: 1.5em;
  margin: 0;
  font-weight: 700;
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}
.lesson-text {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.lesson-title {
  font-weight: 700;
}
.lesson-meta {
  color: var(--color-ink-soft);
  font-size: 0.85rem;
}
.remove {
  flex-shrink: 0;
  width: var(--tap-size);
  padding: 0;
}
</style>
