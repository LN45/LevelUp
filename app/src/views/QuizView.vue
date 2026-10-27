<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import KitsuneMascot from '@/components/KitsuneMascot.vue'
import RichText from '@/components/RichText.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { useReviewSession } from '@/composables/useReviewSession'
import { db, type Lesson, type QuizQuestion } from '@/db'
import { useSettingsStore } from '@/stores/settings'

const MAX_QUESTIONS = 8

const lessonId = Number(useRoute().params.id)
const { settings } = storeToRefs(useSettingsStore())

const lesson = ref<Lesson | null>(null)
const questions = ref<QuizQuestion[]>([])
const loaded = ref(false)
/** Index du choix touché pour la question affichée, null tant qu'on n'a pas répondu */
const chosen = ref<number | null>(null)

const session = useReviewSession<QuizQuestion>({ maxItems: MAX_QUESTIONS })
const question = session.current

async function load() {
  const [found, lessonQuestions] = await Promise.all([
    db.lessons.get(lessonId),
    db.quizQuestions.where('lessonId').equals(lessonId).toArray(),
  ])
  lesson.value = found ?? null
  questions.value = lessonQuestions
  session.start(lessonQuestions)
  loaded.value = true
}
void load()

const answered = computed(() => chosen.value !== null)
const isCorrect = computed(() => chosen.value === question.value?.answer)

/** Texte lu à voix haute pour la question */
const questionSpeech = computed(() => {
  const q = question.value
  if (!q) return ''
  return q.type === 'true-false' ? `Vrai ou faux ? ${q.question}` : q.question
})

const feedbackText = computed(() => {
  if (isCorrect.value) return 'Bravo !'
  return session.isRetry.value
    ? 'Pas grave ! Tu la reverras une autre fois.'
    : 'Pas grave ! Cette question reviendra à la fin.'
})

function choose(index: number) {
  if (!answered.value) chosen.value = index
}

function next() {
  session.answer(isCorrect.value)
  chosen.value = null
}

function restart() {
  chosen.value = null
  session.start(questions.value)
}

/** Apparence d'un choix une fois la réponse donnée : bonne réponse en doré, le reste en retrait */
function choiceState(index: number) {
  if (!answered.value) return ''
  if (index === question.value?.answer) return 'choice--correct'
  return index === chosen.value ? 'choice--wrong' : 'choice--other'
}

const endMessage = computed(() => {
  const total = session.itemCount.value
  const known = session.knownCount.value
  return known >= total / 2
    ? `Bravo ! Tu as répondu aux ${total} questions. Tu en as réussi ${known} du premier coup. Continue comme ça !`
    : `Tu progresses ! Tu as répondu aux ${total} questions. Relis ta fiche, puis réessaie.`
})

// Lecture automatique (réglage) : la question quand elle s'affiche, l'explication après la réponse
const questionSpeak = useTemplateRef('question-speak')
const explanationSpeak = useTemplateRef('explanation-speak')
watch([question, answered], async () => {
  if (!settings.value.autoSpeak) return
  await nextTick()
  ;(answered.value ? explanationSpeak.value : questionSpeak.value)?.play()
})
</script>

<template>
  <section v-if="loaded" class="quiz">
    <RouterLink :to="{ name: 'lesson', params: { id: lessonId } }" class="btn back">
      ← {{ lesson?.title ?? 'Leçon' }}
    </RouterLink>

    <p v-if="!questions.length">Pas encore de quiz pour cette leçon.</p>

    <!-- Clé par passage : nouvel affichage propre pour chaque question -->
    <div
      v-else-if="!session.isDone.value && question"
      :key="`${question.id}-${session.step.value}`"
      class="question-block"
    >
      <div class="progress">
        <span v-if="session.isRetry.value">On revoit une question</span>
        <span v-else>Question {{ session.step.value }} sur {{ session.itemCount.value }}</span>
        <div class="bar" aria-hidden="true">
          <div
            class="bar-fill"
            :style="{ width: `${((session.step.value - 1) / session.length.value) * 100}%` }"
          />
        </div>
      </div>

      <div class="card question">
        <span v-if="question.type === 'true-false'" class="question-label">Vrai ou faux ?</span>
        <p class="question-text"><RichText :text="question.question" /></p>
        <SpeakButton ref="question-speak" :text="questionSpeech" />
      </div>

      <ul class="choices" :class="{ 'choices--true-false': question.type === 'true-false' }">
        <li v-for="(choice, index) in question.choices" :key="index" class="choice-row">
          <button
            type="button"
            class="btn choice"
            :class="choiceState(index)"
            :aria-disabled="answered"
            @click="choose(index)"
          >
            <span class="choice-text"><RichText :text="choice" /></span>
            <span
              v-if="answered && index === question.answer"
              class="mark"
              aria-label="bonne réponse"
            >
              ✓
            </span>
          </button>
          <SpeakButton v-if="question.type === 'mcq'" :text="choice" />
        </li>
      </ul>

      <div
        v-if="answered"
        class="feedback"
        :class="{ 'feedback--correct': isCorrect }"
        role="status"
      >
        <div class="feedback-header">
          <span v-if="isCorrect" class="flames" aria-hidden="true">
            <svg v-for="n in 3" :key="n" viewBox="0 0 24 32">
              <path
                d="M12 31 C4 28 3 19 9 12 C9 17 13 18 13 13 C13 8 11 5 12 1 C19 8 22 18 18 26 C17 29 15 31 12 31 Z"
              />
            </svg>
          </span>
          <KitsuneMascot v-else class="mini-mascot" mood="encouraging" />
          <strong>{{ feedbackText }}</strong>
        </div>
        <div class="explanation">
          <p><RichText :text="question.explanation" /></p>
          <SpeakButton ref="explanation-speak" :text="question.explanation" />
        </div>
        <button type="button" class="btn btn--primary main-action" @click="next">
          Question suivante →
        </button>
      </div>
    </div>

    <div v-else-if="session.isDone.value" class="end">
      <KitsuneMascot class="mascot" mood="proud" />
      <div class="bubble" role="status">
        <p>{{ endMessage }}</p>
        <SpeakButton :text="endMessage" />
      </div>
      <button type="button" class="btn btn--primary main-action" @click="restart">
        🔁 Recommencer
      </button>
      <RouterLink :to="{ name: 'lesson', params: { id: lessonId } }" class="btn">
        Retour à la leçon
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.quiz,
.question-block,
.end {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
.back {
  align-self: flex-start;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-weight: 700;
}
.bar {
  height: 0.75rem;
  overflow: hidden;
  border: 2px solid var(--color-ink);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.bar-fill {
  height: 100%;
  background: var(--color-gold);
  transition: width 0.3s ease;
}

.question {
  flex-direction: column;
  align-items: flex-start;
}
.question-label {
  color: var(--color-ink-soft);
  font-size: 0.85rem;
  font-weight: 700;
}
.question-text {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}
.choices--true-false {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.choice-row {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
.choice {
  flex: 1;
  justify-content: space-between;
  min-height: 3.5rem;
  /* Aligné à gauche : plus facile à lire pour un lecteur dys */
  text-align: left;
  font-weight: 400;
}
.choices--true-false .choice {
  justify-content: center;
  font-weight: 700;
}
.choice[aria-disabled='true'] {
  cursor: default;
}
.choice--correct {
  border-width: 4px;
  border-color: var(--color-gold);
  font-weight: 700;
}
.choice--wrong,
.choice--other {
  opacity: 0.6;
}
.mark {
  flex-shrink: 0;
  color: var(--color-fox-dark);
  font-size: 1.3rem;
  font-weight: 700;
}

.feedback {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  padding: var(--space-m);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.feedback--correct {
  border-color: var(--color-gold);
  border-width: 4px;
}
.feedback-header {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: 1.1rem;
}
.mini-mascot {
  width: 3.5rem;
  flex-shrink: 0;
}
.explanation {
  display: flex;
  align-items: flex-start;
  gap: var(--space-m);
}
.explanation p {
  flex: 1;
  margin: 0;
}
.flames {
  display: inline-flex;
  gap: 2px;
}
.flames svg {
  width: 1.1rem;
  height: 1.5rem;
  fill: var(--color-gold);
  transform-origin: 50% 100%;
  animation: flicker 0.8s ease-in-out infinite alternate;
}
.flames svg:nth-child(2) {
  animation-delay: 0.2s;
}
.flames svg:nth-child(3) {
  animation-delay: 0.4s;
}

.main-action {
  width: 100%;
  min-height: 3.5rem;
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

@keyframes flicker {
  from {
    transform: scale(1, 1);
  }
  to {
    transform: scale(0.9, 1.1);
  }
}
</style>
