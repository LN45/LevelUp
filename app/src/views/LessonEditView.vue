<script setup lang="ts">
import { computed, ref, toRaw, useTemplateRef } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'

import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { db, saveLessonEdits, type LessonEdits } from '@/db'
import { LESSON_TITLE_MAX_LENGTH, useLessonsStore } from '@/stores/lessons'

const lessonId = Number(useRoute().params.id)
const lessonsStore = useLessonsStore()

const draft = ref<LessonEdits | null>(null)
const notFound = ref(false)
const status = ref('')
// Dernier état enregistré, pour savoir s'il reste des corrections non enregistrées
const savedSnapshot = ref('')

async function load() {
  const lesson = await db.lessons.get(lessonId)
  if (!lesson) {
    notFound.value = true
    return
  }
  const [sheet, quiz] = await Promise.all([
    db.sheets.where('lessonId').equals(lessonId).first(),
    db.quizQuestions.where('lessonId').equals(lessonId).toArray(),
  ])
  draft.value = {
    title: lesson.title,
    sourceText: lesson.sourceText,
    sheet: sheet?.content ?? null,
    quiz,
  }
  savedSnapshot.value = JSON.stringify(draft.value)
}
void load()

const isDirty = computed(
  () => draft.value !== null && JSON.stringify(draft.value) !== savedSnapshot.value,
)
const isGenerating = computed(() => lessonsStore.generating.has(lessonId))

// Le résumé se corrige dans une seule zone de texte, une phrase par ligne
const summaryText = computed({
  get: () => draft.value?.sheet?.summary.join('\n') ?? '',
  set: (text: string) => {
    if (draft.value?.sheet) draft.value.sheet.summary = text.split('\n')
  },
})

const filled = (...texts: string[]) => texts.every((text) => text.trim() !== '')
const isValid = computed(() => {
  const d = draft.value
  if (!d) return false
  return (
    filled(d.title, d.sourceText) &&
    (d.sheet ? d.sheet.summary.some((sentence) => filled(sentence)) : true) &&
    (d.sheet?.definitions.every((item) => filled(item.term, item.definition)) ?? true) &&
    d.quiz.every((question) => filled(question.question, question.explanation, ...question.choices))
  )
})

/** Copie nettoyée (sans espaces superflus ni objets réactifs) prête pour la base */
function cleanEdits(d: LessonEdits): LessonEdits {
  const trim = (text: string) => text.trim()
  return {
    title: trim(d.title),
    sourceText: trim(d.sourceText),
    sheet: d.sheet && {
      summary: d.sheet.summary.map(trim).filter(Boolean),
      definitions: d.sheet.definitions.map(({ term, definition }) => ({
        term: trim(term),
        definition: trim(definition),
      })),
    },
    // toRaw : l'état de révision (objet imbriqué) ne doit pas être un proxy Vue pour IndexedDB
    quiz: d.quiz.map((question) => ({
      ...toRaw(question),
      question: trim(question.question),
      explanation: trim(question.explanation),
      choices: question.choices.map(trim),
    })),
  }
}

async function save(): Promise<boolean> {
  if (!draft.value || !isValid.value) {
    status.value = 'Certains champs sont vides : complète-les ou supprime l’élément.'
    return false
  }
  await saveLessonEdits(lessonId, cleanEdits(draft.value))
  savedSnapshot.value = JSON.stringify(draft.value)
  status.value = 'Corrections enregistrées.'
  return true
}

const regenerateDialog = useTemplateRef('regenerate-dialog')

async function regenerate() {
  if (!(await regenerateDialog.value?.open())) return
  // Le texte du cours corrigé doit être enregistré avant de régénérer
  if (isDirty.value && !(await save())) return
  status.value = 'Je prépare une nouvelle fiche… Ça prend environ une minute.'
  await lessonsStore.generate(lessonId)
  const error = lessonsStore.generationErrors.get(lessonId)
  if (error) {
    status.value = error
  } else {
    await load()
    status.value = 'Nouvelle fiche prête.'
  }
}

const leaveDialog = useTemplateRef('leave-dialog')
onBeforeRouteLeave(async () => !isDirty.value || ((await leaveDialog.value?.open()) ?? true))
</script>

<template>
  <section class="edit">
    <RouterLink to="/settings/lessons" class="btn back">← Gérer les leçons</RouterLink>
    <h1>Corriger la leçon</h1>
    <p class="intro">
      Modifie ou supprime ce qui est inexact, puis enregistre. Les champs ne peuvent pas rester
      vides. Les mots entre **deux étoiles** s’affichent en gras.
    </p>

    <p v-if="notFound">Cette leçon n’existe plus.</p>

    <template v-if="draft">
      <div class="field">
        <label for="edit-title">Titre</label>
        <input
          id="edit-title"
          v-model="draft.title"
          class="text-input"
          :maxlength="LESSON_TITLE_MAX_LENGTH"
          autocomplete="off"
        />
      </div>

      <details class="field">
        <summary>Texte du cours</summary>
        <textarea
          v-model="draft.sourceText"
          class="text-input"
          rows="12"
          aria-label="Texte du cours"
        />
        <p class="help">
          Si l’erreur vient du texte du cours, corrige-le ici puis utilise « Régénérer la fiche ».
        </p>
      </details>

      <template v-if="draft.sheet">
        <div class="field">
          <h2><label for="edit-summary">Le résumé</label></h2>
          <textarea
            id="edit-summary"
            v-model="summaryText"
            class="text-input"
            rows="8"
            aria-describedby="edit-summary-help"
          />
          <p id="edit-summary-help" class="help">
            Une phrase par ligne. Supprime une ligne pour retirer une phrase.
          </p>
        </div>

        <h2>Les mots à retenir</h2>
        <div
          v-for="(item, index) in draft.sheet.definitions"
          :key="`definition-${index}`"
          class="card item"
        >
          <div class="item-header">
            <input
              v-model="item.term"
              class="text-input term"
              :aria-label="`Mot ${index + 1}`"
              autocomplete="off"
            />
            <button
              type="button"
              class="btn remove"
              :aria-label="`Supprimer le mot ${item.term}`"
              @click="draft.sheet.definitions.splice(index, 1)"
            >
              🗑️
            </button>
          </div>
          <textarea
            v-model="item.definition"
            class="text-input"
            rows="2"
            :aria-label="`Définition de ${item.term}`"
          />
        </div>
      </template>

      <h2>Quiz</h2>
      <div v-for="(question, index) in draft.quiz" :key="question.id" class="card item">
        <div class="item-header">
          <strong>
            Question {{ index + 1 }} ({{ question.type === 'mcq' ? 'QCM' : 'vrai ou faux' }})
          </strong>
          <button
            type="button"
            class="btn remove"
            :aria-label="`Supprimer la question ${index + 1}`"
            @click="draft.quiz.splice(index, 1)"
          >
            🗑️
          </button>
        </div>
        <textarea
          v-model="question.question"
          class="text-input"
          rows="2"
          :aria-label="`Texte de la question ${index + 1}`"
        />
        <fieldset class="choices">
          <legend class="small-label">Choix (touche le rond de la bonne réponse)</legend>
          <div v-for="(_, choiceIndex) in question.choices" :key="choiceIndex" class="choice">
            <input
              type="radio"
              class="answer"
              :name="`answer-${question.id}`"
              :checked="question.answer === choiceIndex"
              :aria-label="`Bonne réponse : choix ${choiceIndex + 1}`"
              @change="question.answer = choiceIndex"
            />
            <input
              v-if="question.type === 'mcq'"
              v-model="question.choices[choiceIndex]"
              class="text-input"
              :aria-label="`Choix ${choiceIndex + 1}`"
              autocomplete="off"
            />
            <span v-else>{{ question.choices[choiceIndex] }}</span>
          </div>
        </fieldset>
        <label class="small-label" :for="`explanation-${question.id}`">Explication</label>
        <textarea
          :id="`explanation-${question.id}`"
          v-model="question.explanation"
          class="text-input"
          rows="2"
        />
      </div>

      <p class="status" role="status">{{ status }}</p>
      <button
        type="button"
        class="btn btn--primary main-action"
        :disabled="!isDirty || isGenerating"
        @click="save"
      >
        Enregistrer les corrections
      </button>
      <button type="button" class="btn" :disabled="isGenerating" @click="regenerate">
        🔄 Régénérer la fiche
      </button>
    </template>

    <ConfirmDialog ref="regenerate-dialog" confirm-label="Régénérer">
      <p><strong>Régénérer la fiche ?</strong></p>
      <p>
        La fiche et le quiz seront remplacés par une nouvelle version, préparée à partir du texte du
        cours. Cela compte dans le quota du jour.
      </p>
    </ConfirmDialog>

    <ConfirmDialog ref="leave-dialog" confirm-label="Quitter" cancel-label="Rester">
      <p><strong>Quitter sans enregistrer ?</strong></p>
      <p>Les corrections non enregistrées seront perdues.</p>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.edit {
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
h2 {
  margin-top: var(--space-m);
}
.intro,
.help {
  margin: 0;
}
.help {
  color: var(--color-ink-soft);
  font-size: 0.85rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.field label,
.field summary {
  font-weight: 700;
}
.field summary {
  min-height: var(--tap-size);
  cursor: pointer;
}

.item {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-s);
}
.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
}
.term {
  font-weight: 700;
}
.remove {
  flex-shrink: 0;
  width: var(--tap-size);
  padding: 0;
}
.small-label {
  font-size: 0.85rem;
  font-weight: 700;
}
textarea {
  resize: vertical;
}

.choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  border: 0;
}
.choice {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
.answer {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  accent-color: var(--color-accent);
}

.status {
  min-height: 1.5em;
  margin: 0;
  font-weight: 700;
}
.main-action {
  min-height: 3.5rem;
}
</style>
