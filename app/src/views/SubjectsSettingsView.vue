<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'

import { CUSTOM_SUBJECT_STYLE, SUBJECT_CATALOG, type NewSubject, type Subject } from '@/db'
import {
  SUBJECT_NAME_MAX_LENGTH,
  isSameSubjectName,
  useSubjectsStore,
  type NameError,
} from '@/stores/subjects'

const store = useSubjectsStore()
const { subjects } = storeToRefs(store)

const ERRORS: Record<NameError, string> = {
  empty: 'Le nom ne peut pas être vide.',
  duplicate: 'Cette matière existe déjà.',
}

const status = ref('')
const customName = ref('')

const available = computed(() =>
  SUBJECT_CATALOG.filter(
    (item) => !subjects.value?.some((s) => isSameSubjectName(s.name, item.name)),
  ),
)

async function add(subject: NewSubject) {
  const error = await store.add(subject)
  status.value = error ? ERRORS[error] : `« ${subject.name.trim()} » ajoutée.`
  return !error
}

async function addCustom() {
  if (await add({ name: customName.value, ...CUSTOM_SUBJECT_STYLE })) customName.value = ''
}

async function rename(subject: Subject, event: Event) {
  const input = event.target as HTMLInputElement
  if (input.value.trim() === subject.name) return
  const error = await store.rename(subject.id, input.value)
  if (error) input.value = subject.name
  status.value = error ? ERRORS[error] : 'Nom enregistré.'
}

const confirmDialog = useTemplateRef<HTMLDialogElement>('confirm-dialog')
const pending = ref<{ subject: Subject; lessonCount: number } | null>(null)

async function askRemove(subject: Subject) {
  pending.value = { subject, lessonCount: await store.countLessons(subject.id) }
  confirmDialog.value?.showModal()
}

async function confirmRemove() {
  if (!pending.value) return
  const { id, name } = pending.value.subject
  await store.remove(id)
  confirmDialog.value?.close()
  status.value = `« ${name} » supprimée.`
}
</script>

<template>
  <section class="manage">
    <RouterLink to="/settings" class="btn back">← Réglages</RouterLink>
    <h1>Gérer les matières</h1>
    <p class="status" role="status">{{ status }}</p>

    <h2>Mes matières</h2>
    <ul class="list">
      <li v-for="subject in subjects" :key="subject.id" class="row">
        <span class="icon" :style="{ borderColor: subject.color }" aria-hidden="true">
          {{ subject.icon }}
        </span>
        <input
          class="text-input"
          :value="subject.name"
          :maxlength="SUBJECT_NAME_MAX_LENGTH"
          :aria-label="`Nom de la matière ${subject.name}`"
          @change="rename(subject, $event)"
        />
        <button
          type="button"
          class="btn remove"
          :aria-label="`Supprimer ${subject.name}`"
          @click="askRemove(subject)"
        >
          🗑️
        </button>
      </li>
    </ul>

    <h2>Ajouter une matière</h2>
    <div v-if="available.length" class="catalog">
      <button
        v-for="item in available"
        :key="item.name"
        type="button"
        class="btn"
        @click="add(item)"
      >
        <span aria-hidden="true">{{ item.icon }}</span> {{ item.name }}
      </button>
    </div>

    <form class="custom" @submit.prevent="addCustom">
      <label for="custom-subject">Autre matière</label>
      <div class="custom-row">
        <input
          id="custom-subject"
          v-model="customName"
          class="text-input"
          :maxlength="SUBJECT_NAME_MAX_LENGTH"
          autocomplete="off"
          autocapitalize="sentences"
        />
        <button type="submit" class="btn btn--primary" :disabled="!customName.trim()">
          Ajouter
        </button>
      </div>
    </form>

    <dialog ref="confirm-dialog" class="confirm" @close="pending = null">
      <template v-if="pending">
        <p>
          <strong>Supprimer « {{ pending.subject.name }} » ?</strong>
        </p>
        <p v-if="pending.lessonCount === 1">
          Sa leçon, avec sa fiche, ses cartes et ses quiz, sera aussi effacée.
        </p>
        <p v-else-if="pending.lessonCount > 1">
          Ses {{ pending.lessonCount }} leçons, avec leurs fiches, cartes et quiz, seront aussi
          effacées.
        </p>
        <p v-else>Elle ne contient aucune leçon.</p>
        <p>On ne pourra pas revenir en arrière.</p>
        <div class="actions">
          <button type="button" class="btn" autofocus @click="confirmDialog?.close()">
            Annuler
          </button>
          <button type="button" class="btn btn--primary" @click="confirmRemove">Supprimer</button>
        </div>
      </template>
    </dialog>
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
h2 {
  margin-top: var(--space-m);
}
.status {
  min-height: 1.5em;
  margin: 0;
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
.icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--tap-size);
  height: var(--tap-size);
  border: 4px solid;
  border-radius: 50%;
  background: var(--color-surface);
  font-size: 1.3rem;
}
.remove {
  flex-shrink: 0;
  width: var(--tap-size);
  padding: 0;
}

.catalog {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}

.custom {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
.custom label {
  font-weight: 700;
}
.custom-row {
  display: flex;
  gap: var(--space-s);
}

.confirm {
  max-width: min(30rem, calc(100% - 2 * var(--space-m)));
  padding: var(--space-l);
  border: var(--border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
}
.confirm::backdrop {
  background: rgb(31 42 85 / 60%);
}
.confirm p {
  margin: 0 0 var(--space-m);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  justify-content: flex-end;
}
</style>
