<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'

import CourseReader from '@/components/CourseReader.vue'
import KitsuneMascot from '@/components/KitsuneMascot.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import RichText from '@/components/RichText.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { db } from '@/db'
import { useLessonsStore } from '@/stores/lessons'
import { progressByLesson, progressText } from '@/utils/progress'

const lessonId = Number(useRoute().params.id)
const lessonsStore = useLessonsStore()

// Transmis par NewLessonView juste après l'enregistrement
const justSaved = history.state?.justSaved === true

async function loadLesson() {
  const lesson = await db.lessons.get(lessonId)
  if (!lesson) return null
  const [subject, sheet, questions] = await Promise.all([
    db.subjects.get(lesson.subjectId),
    db.sheets.where('lessonId').equals(lessonId).first(),
    db.quizQuestions.where('lessonId').equals(lessonId).toArray(),
  ])
  return { lesson, subject, sheet, progress: progressByLesson(questions).get(lessonId) }
}

// undefined : chargement ; null : leçon introuvable
const data = useLiveQuery(
  loadLesson,
  undefined as Awaited<ReturnType<typeof loadLesson>> | undefined,
)

const isGenerating = computed(() => lessonsStore.generating.has(lessonId))
const error = computed(() => lessonsStore.generationErrors.get(lessonId))

// Première visite (ou fiche manquante) : on lance la génération, sauf après un échec
watch(
  data,
  (value) => {
    if (value && !value.sheet && !error.value) void lessonsStore.generate(lessonId)
  },
  { immediate: true },
)

const waitingMessage = computed(
  () =>
    `${justSaved ? 'Leçon enregistrée ! ' : ''}Je prépare ta fiche et ton quiz. Ça prend environ une minute.`,
)

const sheet = computed(() => data.value?.sheet?.content)
const summarySpeech = computed(() => sheet.value?.summary.join(' ') ?? '')
const definitionsSpeech = computed(
  () => sheet.value?.definitions.map((d) => `${d.term} : ${d.definition}`).join('. ') ?? '',
)
</script>

<template>
  <section v-if="data" class="lesson">
    <RouterLink
      v-if="data.subject"
      :to="{ name: 'subject', params: { id: data.subject.id } }"
      class="btn back"
    >
      ← {{ data.subject.icon }} {{ data.subject.name }}
    </RouterLink>

    <div class="title">
      <h1>{{ data.lesson.title }}</h1>
      <SpeakButton :text="data.lesson.title" />
    </div>

    <CourseReader :text="data.lesson.sourceText" />

    <div v-if="!sheet && error" class="status">
      <KitsuneMascot class="mascot" mood="encouraging" />
      <div class="bubble">
        <p>{{ error }}</p>
        <SpeakButton :text="error" />
      </div>
      <button type="button" class="btn btn--primary" @click="lessonsStore.generate(lessonId)">
        Réessayer
      </button>
    </div>

    <div v-else-if="!sheet" class="status" role="status">
      <KitsuneMascot class="mascot" :mood="justSaved ? 'proud' : 'thinking'" />
      <div class="bubble">
        <p>{{ waitingMessage }}</p>
        <SpeakButton :text="waitingMessage" />
      </div>
      <p v-if="!isGenerating" class="hint">Préparation en attente…</p>
    </div>

    <template v-else>
      <div class="section-title">
        <h2>Le résumé</h2>
        <SpeakButton :text="summarySpeech" />
      </div>
      <div class="card summary">
        <!-- Une phrase par ligne : plus facile à suivre pour un lecteur dys -->
        <p v-for="(sentence, index) in sheet.summary" :key="index">
          <RichText :text="sentence" />
        </p>
      </div>

      <template v-if="sheet.definitions.length">
        <div class="section-title">
          <h2>Les mots à retenir</h2>
          <SpeakButton :text="definitionsSpeech" />
        </div>
        <ul class="points">
          <li v-for="item in sheet.definitions" :key="item.term" class="card point">
            <p class="point-body">
              <strong>{{ item.term }}</strong> : <RichText :text="item.definition" />
            </p>
            <SpeakButton :text="`${item.term} : ${item.definition}`" />
          </li>
        </ul>
      </template>

      <div class="practice">
        <h2>Pour t’entraîner</h2>
        <template v-if="data.progress">
          <ProgressBar :value="data.progress.succeeded / data.progress.total" />
          <p class="progress-text">{{ progressText(data.progress) }}</p>
          <RouterLink
            :to="{ name: 'quiz', params: { id: data.lesson.id } }"
            class="btn btn--primary practice-action"
          >
            ❓ Faire le quiz ({{ data.progress.total }} questions)
          </RouterLink>
        </template>
      </div>
    </template>
  </section>

  <section v-else-if="data === null" class="lesson">
    <p>Cette leçon n’existe plus.</p>
    <RouterLink to="/subjects" class="btn">← Mes matières</RouterLink>
  </section>
</template>

<style scoped>
.lesson {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.back {
  align-self: flex-start;
}
h1,
h2,
h3 {
  margin: 0;
}

.title,
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-m);
}
.section-title {
  margin-top: var(--space-m);
}

.status {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.mascot {
  max-width: 12rem;
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
.hint {
  margin: 0;
  text-align: center;
}

.points {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}
.point {
  align-items: flex-start;
}
.point-body {
  flex: 1;
  margin: 0;
}
.summary {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-s);
  border-left: 0.6rem solid var(--color-gold);
}
.summary p {
  margin: 0;
}

.practice {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin-top: var(--space-m);
}
.progress-text {
  margin: 0;
  color: var(--color-ink-soft);
}
.practice-action {
  min-height: 3.5rem;
}
</style>
