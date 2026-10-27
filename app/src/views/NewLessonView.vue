<script setup lang="ts">
import { useOnline } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, reactive, ref, useTemplateRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import { ApiError, MAX_IMAGES, extractCourse } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import KitsuneMascot from '@/components/KitsuneMascot.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import { LESSON_TITLE_MAX_LENGTH, useLessonsStore } from '@/stores/lessons'
import { useSubjectsStore } from '@/stores/subjects'
import { blobToBase64, compressPhoto } from '@/utils/images'
import { readPdf } from '@/utils/pdf'

type Step = 'photos' | 'reading' | 'review'

const router = useRouter()
const lessonsStore = useLessonsStore()
const { subjects } = storeToRefs(useSubjectsStore())

const step = ref<Step>('photos')
// Photos gardées en mémoire le temps de la saisie seulement : jamais enregistrées
const photos = ref<{ blob: Blob; url: string }[]>([])
const busy = ref(false)
const message = ref('')
// Matière déjà choisie quand on vient de la page d'une matière (?subject=id)
const presetSubject = Number(useRoute().query.subject) || null
const draft = reactive({ title: '', text: '', subjectId: presetSubject })
let saved = false

const PHOTO_TIP = 'Prends ton cours en photo, page par page, bien à plat et avec de la lumière.'
const OFFLINE_TIP =
  'Pas de connexion internet. Tu peux réviser, mais pour lire un nouveau cours, il faut internet.'
const online = useOnline()

const remaining = computed(() => MAX_IMAGES - photos.value.length)
const canSave = computed(
  () => draft.subjectId !== null && draft.title.trim() !== '' && draft.text.trim() !== '',
)

function addPhotos(blobs: Blob[]) {
  for (const blob of blobs) photos.value.push({ blob, url: URL.createObjectURL(blob) })
}

/** Récupère les fichiers choisis et vide le champ pour pouvoir rechoisir les mêmes */
function takeFiles(event: Event): File[] {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  return files
}

async function onPhotosChosen(event: Event) {
  const files = takeFiles(event)
  if (!files.length) return
  const kept = files.slice(0, remaining.value)
  message.value =
    files.length > kept.length ? `${MAX_IMAGES} photos au maximum : j’ai gardé les premières.` : ''
  busy.value = true
  try {
    addPhotos(await Promise.all(kept.map(compressPhoto)))
  } catch {
    message.value = 'Je n’arrive pas à ouvrir cette photo. Essaie avec une autre.'
  } finally {
    busy.value = false
  }
}

async function onPdfChosen(event: Event) {
  const [file] = takeFiles(event)
  if (!file) return
  message.value = ''
  busy.value = true
  try {
    const content = await readPdf(file, remaining.value)
    if (content.kind === 'text') {
      draft.title = content.title
      draft.text = content.text
      step.value = 'review'
    } else {
      addPhotos(content.images)
      if (content.skippedPages) {
        message.value = `Ce PDF a trop de pages : j’ai gardé les ${content.images.length} premières.`
      }
    }
  } catch {
    message.value = 'Je n’arrive pas à ouvrir ce PDF.'
  } finally {
    busy.value = false
  }
}

function movePhoto(index: number, offset: -1 | 1) {
  const [photo] = photos.value.splice(index, 1)
  if (photo) photos.value.splice(index + offset, 0, photo)
}

function removePhoto(index: number) {
  const [photo] = photos.value.splice(index, 1)
  if (photo) URL.revokeObjectURL(photo.url)
}

async function readCourse() {
  step.value = 'reading'
  message.value = ''
  try {
    const images = await Promise.all(
      photos.value.map(async (photo) => ({
        mediaType: 'image/jpeg' as const,
        data: await blobToBase64(photo.blob),
      })),
    )
    const course = await extractCourse(images)
    draft.title = course.title
    draft.text = course.text
    step.value = 'review'
  } catch (error) {
    message.value =
      error instanceof ApiError ? error.message : 'Oups, un problème est survenu. Réessaie.'
    step.value = 'photos'
  }
}

async function save() {
  if (draft.subjectId === null) return
  const id = await lessonsStore.add({
    subjectId: draft.subjectId,
    title: draft.title,
    sourceText: draft.text,
  })
  saved = true
  // La page de la leçon lance la préparation de la fiche
  await router.push({ name: 'lesson', params: { id }, state: { justSaved: true } })
}

const leaveDialog = useTemplateRef('leave-dialog')

onBeforeRouteLeave(async () => {
  const hasWork = photos.value.length > 0 || draft.text.trim() !== ''
  if (saved || !hasWork) return true
  return (await leaveDialog.value?.open()) ?? true
})

onBeforeUnmount(() => photos.value.forEach((photo) => URL.revokeObjectURL(photo.url)))
</script>

<template>
  <section class="new-lesson">
    <template v-if="step === 'photos'">
      <h1>Ajouter un cours</h1>
      <div class="tip">
        <p>{{ PHOTO_TIP }}</p>
        <SpeakButton :text="PHOTO_TIP" />
      </div>
      <div v-if="!online" class="warning" role="status">
        <p>{{ OFFLINE_TIP }}</p>
        <SpeakButton :text="OFFLINE_TIP" />
      </div>

      <div class="sources">
        <label class="btn source">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="visually-hidden"
            :disabled="busy || remaining === 0"
            @change="onPhotosChosen"
          />
          📷 Prendre une photo
        </label>
        <label class="btn source">
          <input
            type="file"
            accept="image/*"
            multiple
            class="visually-hidden"
            :disabled="busy || remaining === 0"
            @change="onPhotosChosen"
          />
          🖼️ Choisir des photos
        </label>
        <label class="btn source">
          <input
            type="file"
            accept="application/pdf"
            class="visually-hidden"
            :disabled="busy || remaining === 0"
            @change="onPdfChosen"
          />
          📄 Importer un PDF
        </label>
      </div>

      <p v-if="busy" class="status" role="status">Je prépare les photos…</p>
      <p v-if="message" class="status" role="status">{{ message }}</p>

      <ol v-if="photos.length" class="photos">
        <li v-for="(photo, index) in photos" :key="photo.url" class="photo">
          <img :src="photo.url" :alt="`Photo ${index + 1}`" />
          <span class="photo-number" aria-hidden="true">{{ index + 1 }}</span>
          <div class="photo-actions">
            <button
              type="button"
              class="btn icon-btn"
              :disabled="index === 0"
              :aria-label="`Avancer la photo ${index + 1}`"
              @click="movePhoto(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="btn icon-btn"
              :disabled="index === photos.length - 1"
              :aria-label="`Reculer la photo ${index + 1}`"
              @click="movePhoto(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="btn icon-btn"
              :aria-label="`Retirer la photo ${index + 1}`"
              @click="removePhoto(index)"
            >
              🗑️
            </button>
          </div>
        </li>
      </ol>
      <p class="count">{{ photos.length }} / {{ MAX_IMAGES }} photos</p>

      <button
        type="button"
        class="btn btn--primary main-action"
        :disabled="!photos.length || busy || !online"
        @click="readCourse"
      >
        Lire mon cours
      </button>
    </template>

    <div v-else-if="step === 'reading'" class="reading" role="status">
      <KitsuneMascot class="mascot" mood="thinking" />
      <p>Je lis ton cours…</p>
    </div>

    <template v-else>
      <h1>Vérifier le cours</h1>
      <div class="warning">
        <p>
          <strong>Pour un adulte :</strong> compare le texte avec
          {{ photos.length ? 'les photos' : 'le PDF' }}. Vérifie qu’il ne manque rien, surtout à la
          fin.
        </p>
      </div>

      <details v-if="photos.length" class="originals" open>
        <summary>Les photos du cours</summary>
        <img
          v-for="(photo, index) in photos"
          :key="photo.url"
          :src="photo.url"
          :alt="`Photo ${index + 1} du cours`"
        />
      </details>

      <div class="field">
        <div class="field-header">
          <label for="lesson-text">Texte du cours</label>
          <SpeakButton :text="draft.text" />
        </div>
        <textarea
          id="lesson-text"
          v-model="draft.text"
          class="text-input lesson-text"
          rows="14"
          aria-describedby="lesson-text-help"
        />
        <p id="lesson-text-help" class="help">
          Les lignes qui commencent par # sont des titres, celles qui commencent par - des listes.
        </p>
      </div>

      <div class="field">
        <label for="lesson-title">Titre</label>
        <input
          id="lesson-title"
          v-model="draft.title"
          class="text-input"
          :maxlength="LESSON_TITLE_MAX_LENGTH"
          autocomplete="off"
        />
      </div>

      <fieldset class="subjects">
        <legend>Matière</legend>
        <label
          v-for="subject in subjects"
          :key="subject.id"
          class="btn subject"
          :class="{ 'subject--selected': draft.subjectId === subject.id }"
          :style="{ '--subject-color': subject.color }"
        >
          <input
            v-model="draft.subjectId"
            type="radio"
            name="subject"
            class="visually-hidden"
            :value="subject.id"
          />
          <span aria-hidden="true">{{ subject.icon }}</span>
          {{ subject.name }}
        </label>
      </fieldset>

      <button type="button" class="btn btn--primary main-action" :disabled="!canSave" @click="save">
        Enregistrer la leçon
      </button>
      <button v-if="photos.length" type="button" class="btn" @click="step = 'photos'">
        ← Revenir aux photos
      </button>
    </template>

    <ConfirmDialog ref="leave-dialog" confirm-label="Quitter" cancel-label="Rester">
      <p><strong>Quitter sans enregistrer ?</strong></p>
      <p>Les photos et le texte du cours seront perdus.</p>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.new-lesson {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
h1 {
  margin: 0;
}

.tip,
.warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-m);
  padding: var(--space-m);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.tip p,
.warning p {
  flex: 1;
  margin: 0;
}
.warning {
  border-color: var(--color-accent);
  border-left-width: 0.6rem;
}

.sources {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.source {
  justify-content: flex-start;
}
.source:has(input:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
.source:has(:focus-visible) {
  outline: 3px solid var(--color-accent);
  outline-offset: 3px;
}

.status {
  margin: 0;
  font-weight: 700;
}

.photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: var(--space-m);
  margin: 0;
  padding: 0;
  list-style: none;
}
.photo {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.photo img {
  width: 100%;
  aspect-ratio: 3 / 4;
  /* Photo entière, sans rognage, pour bien voir ce qui sera lu */
  object-fit: contain;
  background: var(--color-surface);
  border: var(--border);
  border-radius: var(--radius);
}
.photo-number {
  position: absolute;
  top: var(--space-s);
  left: var(--space-s);
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-ink);
  color: var(--color-cream);
  font-weight: 700;
}
.photo-actions {
  display: flex;
  justify-content: space-between;
}
.icon-btn {
  width: var(--tap-size);
  padding: 0;
}
.count {
  margin: 0;
  text-align: right;
}

.main-action {
  width: 100%;
  min-height: 3.5rem;
}

.reading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: var(--space-xl);
  font-weight: 700;
}
.mascot {
  max-width: 14rem;
}

.originals summary {
  min-height: var(--tap-size);
  font-weight: 700;
  cursor: pointer;
}
.originals img {
  display: block;
  width: 100%;
  margin-top: var(--space-s);
  border: var(--border);
  border-radius: var(--radius);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.field label,
legend {
  font-weight: 700;
}
.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lesson-text {
  resize: vertical;
  line-height: var(--line-height);
}
.help {
  margin: 0;
  color: var(--color-ink-soft);
  font-size: 0.85rem;
}

.subjects {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: var(--space-s);
  padding: 0;
}
.subject {
  justify-content: flex-start;
  border-left: 0.6rem solid var(--subject-color);
  font-weight: 400;
}
.subject--selected {
  background: var(--color-ink);
  border-color: var(--color-ink);
  border-left-color: var(--subject-color);
  color: var(--color-cream);
  font-weight: 700;
}
.subject:has(:focus-visible) {
  outline: 3px solid var(--color-accent);
  outline-offset: 3px;
}
</style>
