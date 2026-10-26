<script setup lang="ts">
import { useRoute } from 'vue-router'

import KitsuneMascot from '@/components/KitsuneMascot.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { db } from '@/db'
import { formatDate } from '@/utils/text'

const subjectId = Number(useRoute().params.id)

async function loadSubject() {
  const subject = await db.subjects.get(subjectId)
  if (!subject) return null
  const lessons = await db.lessons
    .where('subjectId')
    .equals(subjectId)
    .reverse()
    .sortBy('createdAt')
  const sheets = await db.sheets
    .where('lessonId')
    .anyOf(lessons.map((lesson) => lesson.id))
    .toArray()
  return { subject, lessons, ready: new Set(sheets.map((sheet) => sheet.lessonId)) }
}

// undefined : chargement ; null : matière introuvable
const data = useLiveQuery(
  loadSubject,
  undefined as Awaited<ReturnType<typeof loadSubject>> | undefined,
)
</script>

<template>
  <section v-if="data" class="subject" :style="{ '--subject-color': data.subject.color }">
    <RouterLink to="/subjects" class="btn back">← Mes matières</RouterLink>
    <h1>
      <span aria-hidden="true">{{ data.subject.icon }}</span> {{ data.subject.name }}
    </h1>

    <RouterLink
      :to="{ name: 'new-lesson', query: { subject: data.subject.id } }"
      class="btn btn--primary main-action"
    >
      📷 Ajouter un cours
    </RouterLink>

    <ul v-if="data.lessons.length" class="lessons">
      <li v-for="lesson in data.lessons" :key="lesson.id">
        <RouterLink :to="{ name: 'lesson', params: { id: lesson.id } }" class="card lesson">
          <span class="lesson-text">
            <span class="lesson-title">{{ lesson.title }}</span>
            <span class="lesson-meta">
              {{ formatDate(lesson.createdAt) }} ·
              {{ data.ready.has(lesson.id) ? 'fiche prête' : 'fiche en préparation' }}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </RouterLink>
      </li>
    </ul>

    <div v-else class="empty">
      <KitsuneMascot class="mascot" mood="encouraging" />
      <p>Pas encore de cours ici. Ajoute ton premier cours !</p>
    </div>
  </section>

  <section v-else-if="data === null" class="subject">
    <p>Cette matière n’existe plus.</p>
    <RouterLink to="/subjects" class="btn">← Mes matières</RouterLink>
  </section>
</template>

<style scoped>
.subject {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.back {
  align-self: flex-start;
}
h1 {
  margin: 0;
}
.main-action {
  min-height: 3.5rem;
}

.lessons {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}
.lesson {
  border-left: 0.6rem solid var(--subject-color);
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

.empty {
  text-align: center;
}
.mascot {
  max-width: 12rem;
  margin: 0 auto;
}
</style>
